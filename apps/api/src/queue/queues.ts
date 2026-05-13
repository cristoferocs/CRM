import { Queue } from "bullmq";
import { closeRedis, getRedis } from "../lib/redis.js";

type QueueName = "email" | "automations" | "reports" | "knowledge" | "ai" | "inbox";

const queueRegistry = new Map<QueueName, Queue>();

function getQueue(name: QueueName) {
    const queue = queueRegistry.get(name);

    if (queue) {
        return queue;
    }

    const newQueue = new Queue(name, { connection: getRedis() });
    queueRegistry.set(name, newQueue);

    return newQueue;
}

export const queues = {
    email: () => getQueue("email"),
    automations: () => getQueue("automations"),
    reports: () => getQueue("reports"),
    knowledge: () => getQueue("knowledge"),
    ai: () => getQueue("ai"),
    inbox: () => getQueue("inbox"),
};

export async function closeQueues() {
    await Promise.all([...queueRegistry.values()].map((queue) => queue.close()));
    queueRegistry.clear();
    await closeRedis();
}