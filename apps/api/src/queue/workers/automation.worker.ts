import { Worker, type Job } from "bullmq";
import { getRedis } from "../../lib/redis.js";
import { AutomationsService } from "../../modules/automations/automations.service.js";
import type { AutomationJobData } from "../../modules/automations/automation.types.js";
import {
    runStageAutomationRule,
    persistStageAutomationLog,
    findExistingStageAutomationLog,
    type StageAutomationJobData,
} from "../../modules/automations/stage-automation.executor.js";
import { StageRulesArraySchema } from "../../modules/pipeline/stage-automation.schema.js";
import { prisma } from "../../lib/prisma.js";
import type { StageAutomationRule, StageAutomationTrigger } from "@crm-base/shared";

const automationsService = new AutomationsService();

// ---------------------------------------------------------------------------
// Stage-automation processor
// ---------------------------------------------------------------------------

const STAGE_TRIGGERS: Record<string, StageAutomationTrigger> = {
    "stage.enter": "enter",
    "stage.exit": "exit",
    "stage.rotting": "rotting",
};

function buildIdempotencyKey(jobId: string | undefined, ruleId: string): string | undefined {
    if (!jobId) return undefined;
    return `stage:${jobId}:${ruleId}`;
}

async function processStageAutomationJob(
    job: Job<StageAutomationJobData>,
): Promise<void> {
    const data = job.data;

    // Resume path: rule was injected by the wait action's re-enqueue
    if (data.rule) {
        const idempotencyKey = buildIdempotencyKey(job.id, data.rule.id);
        if (idempotencyKey && !data.dryRun) {
            const existing = await findExistingStageAutomationLog(idempotencyKey);
            if (existing) {
                console.info(
                    `[automation-worker] Job ${job.id} (resume) already logged — skipping.`,
                );
                return;
            }
        }
        const results = await runStageAutomationRule(data.rule, data);
        await persistStageAutomationLog({
            rule: data.rule,
            job: data,
            results,
            idempotencyKey,
        });
        return;
    }

    // Initial dispatch: load the stage rules from DB
    const stage = await prisma.pipelineStage.findFirst({
        where: { id: data.stageId },
        select: {
            onEnterActions: true,
            onExitActions: true,
            onRottingActions: true,
        },
    });
    if (!stage) {
        console.warn(`[automation-worker] stage ${data.stageId} not found`);
        return;
    }

    const column =
        data.trigger === "enter"
            ? stage.onEnterActions
            : data.trigger === "exit"
                ? stage.onExitActions
                : stage.onRottingActions;

    const rules = StageRulesArraySchema.parse(column);

    for (const rule of rules) {
        if (!rule.isActive) continue;
        // If a specific rule was requested (dry-run / test), restrict to it
        if (data.ruleId && rule.id !== data.ruleId) continue;

        const idempotencyKey = buildIdempotencyKey(job.id, rule.id);
        if (idempotencyKey && !data.dryRun) {
            const existing = await findExistingStageAutomationLog(idempotencyKey);
            if (existing) {
                console.info(
                    `[automation-worker] Job ${job.id} rule=${rule.id} already logged — skipping.`,
                );
                continue;
            }
        }

        const results = await runStageAutomationRule(
            rule as StageAutomationRule,
            { ...data, rule: rule as StageAutomationRule },
        );
        await persistStageAutomationLog({
            rule: rule as StageAutomationRule,
            job: data,
            results,
            idempotencyKey,
        });
    }
}

// ---------------------------------------------------------------------------
// Legacy automation processor
// ---------------------------------------------------------------------------

async function processLegacyAutomationJob(
    job: Job<AutomationJobData>,
): Promise<void> {
    const { automationId, contactId, dealId, orgId, metadata } = job.data;

    console.info(
        `[automation-worker] Processing job ${job.id} — automation=${automationId} ` +
        `contact=${contactId ?? "-"} deal=${dealId ?? "-"}`,
    );

    await automationsService.execute(
        automationId,
        { contactId, dealId, orgId, ...metadata },
        orgId,
    );
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

async function processAutomationJob(job: Job<unknown>): Promise<void> {
    if (job.name in STAGE_TRIGGERS) {
        await processStageAutomationJob(job as Job<StageAutomationJobData>);
        return;
    }
    await processLegacyAutomationJob(job as Job<AutomationJobData>);
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

export function createAutomationWorker(): Worker {
    const worker = new Worker(
        "automations",
        processAutomationJob,
        {
            connection: getRedis(),
            concurrency: 5,
        },
    );

    worker.on("completed", (job) => {
        console.info(`[automation-worker] Job ${job.id} (${job.name}) completed.`);
    });

    worker.on("failed", (job, err) => {
        console.error(
            `[automation-worker] Job ${job?.id} (${job?.name}) failed (attempt ${job?.attemptsMade}):`,
            err.message,
        );
    });

    worker.on("error", (err) => {
        console.error("[automation-worker] Worker error:", err);
    });

    return worker;
}
