import { Queue } from "bullmq";
import { closeRedis, getRedis } from "../lib/redis.js";
import { getReqId } from "../lib/request-context.js";

type QueueName = "email" | "automations" | "reports" | "knowledge" | "ai" | "inbox" | "learning";

const queueRegistry = new Map<QueueName, Queue>();

/**
 * Returns a Queue whose `.add` is patched to merge the current
 * AsyncLocalStorage reqId into the job payload under `_ctx`. Workers can
 * read `job.data._ctx?.reqId` to stitch logs back to the originating
 * request without callers having to thread it through.
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
        return originalAdd(jobName, data, opts);
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
