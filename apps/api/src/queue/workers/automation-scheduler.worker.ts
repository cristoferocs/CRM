/**
 * automation-scheduler.worker.ts
 *
 * Repeatable BullMQ job (1 min tick) that scans active automations with
 * time-based triggers (SCHEDULED, TIME_DELAY, DATE_FIELD) and enqueues
 * matching runs.
 *
 *  - SCHEDULED: triggerConfig = { cron?: string; runAt?: string (ISO) }.
 *               When `runAt` window matches the current minute → fire once
 *               (we track via `lastExecutedAt`). When `cron` matches → fire.
 *  - DATE_FIELD: triggerConfig = { entity: "contact"|"deal"; field: string;
 *                                  offsetMinutes?: number }.
 *                For each entity row whose stored date ± offset falls in the
 *                current minute window → fire (once per entity per window).
 *  - TIME_DELAY: triggerConfig = { delayMinutes: number }. The delay is
 *                respected by individual nodes; the scheduler simply
 *                re-publishes a periodic tick payload so flows that rely on
 *                "after X" from a previous event have a runtime hook.
 */
import { Queue, Worker, type Job } from "bullmq";
import { getRedis } from "../../lib/redis.js";
import { prisma } from "../../lib/prisma.js";
import { queues } from "../queues.js";

const SCHEDULER_QUEUE = "automation-scheduler";

function isInCurrentMinute(dateIso: string | Date | null | undefined, now = new Date()): boolean {
    if (!dateIso) return false;
    const d = new Date(dateIso);
    return (
        d.getUTCFullYear() === now.getUTCFullYear() &&
        d.getUTCMonth() === now.getUTCMonth() &&
        d.getUTCDate() === now.getUTCDate() &&
        d.getUTCHours() === now.getUTCHours() &&
        d.getUTCMinutes() === now.getUTCMinutes()
    );
}

function matchesCron(cron: string, now: Date): boolean {
    // Minimal cron: "m h d M w" with "*" or integer values.
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) return false;
    const [m, h, d, M, w] = parts;
    const checks: Array<[string, number]> = [
        [m!, now.getUTCMinutes()],
        [h!, now.getUTCHours()],
        [d!, now.getUTCDate()],
        [M!, now.getUTCMonth() + 1],
        [w!, now.getUTCDay()],
    ];
    return checks.every(([expr, val]) => expr === "*" || Number(expr) === val);
}

async function tick(_job: Job): Promise<void> {
    const now = new Date();
    const windowStart = new Date(now);
    windowStart.setSeconds(0, 0);
    const windowEnd = new Date(windowStart.getTime() + 60_000);

    const automations = await prisma.automation.findMany({
        where: {
            isActive: true,
            triggerType: { in: ["SCHEDULED", "DATE_FIELD", "TIME_DELAY"] },
        },
        select: {
            id: true,
            orgId: true,
            triggerType: true,
            triggerConfig: true,
            lastExecutedAt: true,
        },
    });

    for (const automation of automations) {
        try {
            const cfg = (automation.triggerConfig ?? {}) as Record<string, unknown>;

            if (automation.triggerType === "SCHEDULED") {
                const cron = cfg["cron"] as string | undefined;
                const runAt = cfg["runAt"] as string | undefined;
                const matches =
                    (cron && matchesCron(cron, now)) ||
                    (runAt && isInCurrentMinute(runAt, now) && !isInCurrentMinute(automation.lastExecutedAt, now));
                if (!matches) continue;
                await queues.automations().add("trigger", {
                    automationId: automation.id,
                    orgId: automation.orgId,
                    triggeredAt: now.toISOString(),
                    metadata: { scheduled: true },
                });
                continue;
            }

            if (automation.triggerType === "DATE_FIELD") {
                const entity = String(cfg["entity"] ?? "contact");
                const field = String(cfg["field"] ?? "");
                const offsetMinutes = Number(cfg["offsetMinutes"] ?? 0);
                if (!field) continue;

                const targetStart = new Date(windowStart.getTime() - offsetMinutes * 60_000);
                const targetEnd = new Date(windowEnd.getTime() - offsetMinutes * 60_000);

                if (entity === "deal") {
                    const deals = await prisma.deal.findMany({
                        where: {
                            orgId: automation.orgId,
                            ...(field === "expectedCloseDate"
                                ? { expectedCloseDate: { gte: targetStart, lt: targetEnd } }
                                : {}),
                        },
                        select: { id: true, contactId: true },
                        take: 200,
                    });
                    for (const deal of deals) {
                        await queues.automations().add("trigger", {
                            automationId: automation.id,
                            orgId: automation.orgId,
                            dealId: deal.id,
                            contactId: deal.contactId,
                            triggeredAt: now.toISOString(),
                            metadata: { dateField: field },
                        });
                    }
                } else {
                    // For contact entities we only know how to match createdAt/updatedAt natively.
                    const contacts = await prisma.contact.findMany({
                        where: {
                            orgId: automation.orgId,
                            ...(field === "createdAt"
                                ? { createdAt: { gte: targetStart, lt: targetEnd } }
                                : field === "updatedAt"
                                    ? { updatedAt: { gte: targetStart, lt: targetEnd } }
                                    : {}),
                        },
                        select: { id: true },
                        take: 200,
                    });
                    for (const contact of contacts) {
                        await queues.automations().add("trigger", {
                            automationId: automation.id,
                            orgId: automation.orgId,
                            contactId: contact.id,
                            triggeredAt: now.toISOString(),
                            metadata: { dateField: field },
                        });
                    }
                }
                continue;
            }

            // TIME_DELAY is handled per-node via delayed jobs; nothing to do here.
        } catch (err) {
            console.error(
                `[automation-scheduler] failed for automation ${automation.id}:`,
                err instanceof Error ? err.message : err,
            );
        }
    }
}

let schedulerQueue: Queue | null = null;

export async function ensureAutomationScheduler(): Promise<void> {
    schedulerQueue ??= new Queue(SCHEDULER_QUEUE, { connection: getRedis() });
    // Idempotent: BullMQ dedupes by job key when repeat options are identical.
    await schedulerQueue.add(
        "tick",
        {},
        {
            repeat: { every: 60_000 },
            removeOnComplete: 100,
            removeOnFail: 50,
            jobId: "automation-scheduler-tick",
        },
    );
}

export function createAutomationSchedulerWorker(): Worker {
    const worker = new Worker(SCHEDULER_QUEUE, tick, {
        connection: getRedis(),
        concurrency: 1,
    });
    worker.on("failed", (job, err) => {
        console.error(
            `[automation-scheduler] tick ${job?.id} failed:`,
            err.message,
        );
    });
    worker.on("error", (err) => {
        console.error("[automation-scheduler] worker error:", err);
    });
    return worker;
}
