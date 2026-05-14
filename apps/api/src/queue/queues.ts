import { Queue } from "bullmq";
import { closeRedis, getRedis } from "../lib/redis.js";
import { getReqId } from "../lib/request-context.js";

type QueueName = "email" | "automations" | "reports" | "knowledge" | "ai" | "inbox" | "learning";

const queueRegistry = new Map<QueueName, Queue>();

/**
 * Defaults applied to every `.add` call that doesn't override them. Two
 * goals: (1) every job retries with exponential backoff before being
 * declared failed, and (2) terminally-failed jobs are *retained* in
 * BullMQ's failed set so they can be inspected / replayed instead of
 * silently disappearing.
 */
const DEFAULT_JOB_OPTS = {
    attempts: 3,
    backoff: { type: "exponential" as const, delay: 2_000 },
    removeOnComplete: { count: 1_000 },
    // Keep up to 5k terminally-failed jobs for replay; older ones expire
    // by count, not by age, so we never lose the most recent failures.
    removeOnFail: { count: 5_000 },
};

/**
 * Returns a Queue whose `.add` is patched to:
 *  1. Merge the current AsyncLocalStorage reqId into the job payload
 *     under `_ctx` so workers can stitch logs back to the originating
 *     request without callers having to thread it through.
 *  2. Merge DEFAULT_JOB_OPTS into the job options (callers can still
 *     override anything by passing their own opts).
 */
function getQueue(name: QueueName): Queue {
    const existing = queueRegistry.get(name);
    if (existing) return existing;

    const queue = new Queue(name, { connection: getRedis() });
    const originalAdd = queue.add.bind(queue) as Queue["add"];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queue.add = (async (jobName: string, data: any, opts?: any) => {
        const reqId = getReqId();
        if (reqId && data && typeof data === "object" && !Array.isArray(data)) {
            const ctx = (data as { _ctx?: Record<string, unknown> })._ctx ?? {};
            (data as { _ctx?: Record<string, unknown> })._ctx = { reqId, ...ctx };
        }
        const mergedOpts = { ...DEFAULT_JOB_OPTS, ...(opts ?? {}) };
        return originalAdd(jobName, data, mergedOpts);
    }) as Queue["add"];

    queueRegistry.set(name, queue);
    return queue;
}

export const queues = {
    email: () => getQueue("email"),
    automations: () => getQueue("automations"),
    reports: () => getQueue("reports"),
    knowledge: () => getQueue("knowledge"),
    ai: () => getQueue("ai"),
    inbox: () => getQueue("inbox"),
    learning: () => getQueue("learning"),
};

/**
 * Helper for workers: extract the originating reqId stamped at enqueue time.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function reqIdFromJob(job: { data?: any }): string | undefined {
    return job?.data?._ctx?.reqId;
}

export async function closeQueues() {
    await Promise.all([...queueRegistry.values()].map((queue) => queue.close()));
    queueRegistry.clear();
    await closeRedis();
}
