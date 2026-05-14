/**
 * session-cleanup.worker.ts
 *
 * Repeatable BullMQ job (hourly) that closes "zombie" AIAgentSession rows —
 * sessions that were created but never resolved because of a provider outage,
 * a crash mid-turn, or a contact who simply abandoned the conversation. Without
 * this sweep, ACTIVE sessions accumulate forever and skew dashboards / block
 * new sessions on conversations that gate on findActiveSession().
 *
 * Behavior:
 *   - status=ACTIVE/THINKING/WAITING_USER and lastActivityAt older than the
 *     TTL window → mark status=ENDED, outcome=TIMEOUT.
 *   - TTL configurable via AI_SESSION_TTL_HOURS (default 24).
 */
import { Queue, Worker, type Job } from "bullmq";
import { getRedis } from "../../lib/redis.js";
import { prisma } from "../../lib/prisma.js";

const SESSION_CLEANUP_QUEUE = "session-cleanup";

const TTL_HOURS = Number(process.env.AI_SESSION_TTL_HOURS ?? 24);
const SWEEP_INTERVAL_MS = Number(process.env.AI_SESSION_CLEANUP_INTERVAL_MS ?? 60 * 60 * 1000);

type Stale = { id: string; agentId: string; conversationId: string };

async function sweep(_job: Job): Promise<{ closed: number }> {
    const cutoff = new Date(Date.now() - TTL_HOURS * 60 * 60 * 1000);

    const stale = (await prisma.aIAgentSession.findMany({
        where: {
            status: { in: ["ACTIVE", "THINKING", "WAITING_USER"] },
            lastActivityAt: { lt: cutoff },
        },
        select: { id: true, agentId: true, conversationId: true },
        take: 500,
    })) as Stale[];

    if (stale.length === 0) return { closed: 0 };

    const ids = stale.map((s) => s.id);
    await prisma.aIAgentSession.updateMany({
        where: { id: { in: ids } },
        data: {
            status: "ENDED",
            outcome: "TIMEOUT",
            handoffReason: `Inactive > ${TTL_HOURS}h`,
            endedAt: new Date(),
        },
    });

    console.info(
        `[session-cleanup] closed ${ids.length} stale agent session(s) (ttl=${TTL_HOURS}h).`,
    );
    return { closed: ids.length };
}

let cleanupQueue: Queue | null = null;

export async function ensureSessionCleanupSchedule(): Promise<void> {
    cleanupQueue ??= new Queue(SESSION_CLEANUP_QUEUE, { connection: getRedis() });
    await cleanupQueue.add(
        "sweep",
        {},
        {
            repeat: { every: SWEEP_INTERVAL_MS },
            removeOnComplete: 50,
            removeOnFail: 50,
            jobId: "session-cleanup-sweep",
        },
    );
}

export function createSessionCleanupWorker(): Worker {
    const worker = new Worker(SESSION_CLEANUP_QUEUE, sweep, {
        connection: getRedis(),
        concurrency: 1,
    });
    worker.on("completed", (job, result) => {
        const closed = (result as { closed?: number } | undefined)?.closed ?? 0;
        if (closed > 0) {
            console.info(`[session-cleanup] sweep ${job?.id} closed=${closed}`);
        }
    });
    worker.on("failed", (job, err) => {
        console.error(`[session-cleanup] sweep ${job?.id} failed:`, err.message);
    });
    worker.on("error", (err) => {
        console.error("[session-cleanup] worker error:", err);
    });
    return worker;
}
