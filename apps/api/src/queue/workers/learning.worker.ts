import { Worker } from "bullmq";
import { getRedis } from "../../lib/redis.js";
import { runLearningJob, type LearnJobPayload } from "../../modules/ai/agents/agent.learning.js";

export function createLearningWorker() {
    return new Worker(
        "learning",
        async (job) => {
            if (job.name === "agent:learn") {
                await runLearningJob(job.data as LearnJobPayload);
            }
        },
        {
            connection: getRedis(),
            concurrency: Number(process.env["LEARNING_WORKER_CONCURRENCY"] ?? 2),
        },
    );
}
