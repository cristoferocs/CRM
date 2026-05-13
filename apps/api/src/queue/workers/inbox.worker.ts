/**
 * inbox.worker.ts — BullMQ worker for processing incoming channel webhook payloads.
 *
 * Each webhook handler (Evolution, Meta, Email) enqueues the raw payload here
 * so the webhook endpoint can return HTTP 200 immediately, ensuring the external
 * gateway doesn't retry unnecessarily.
 */
import { Worker, type Job } from "bullmq";
import { getRedis } from "../../lib/redis.js";
import {
    processEvolutionPayload,
    processMetaPayload,
} from "../../modules/inbox/webhooks/inbox-processor.js";

// ---------------------------------------------------------------------------
// Job data types
// ---------------------------------------------------------------------------

export interface EvolutionWebhookJob {
    type: "inbox:evolution";
    payload: Record<string, unknown>;
    instanceName: string;
}

export interface MetaWebhookJob {
    type: "inbox:meta";
    payload: Record<string, unknown>;
}

export type InboxJobData = EvolutionWebhookJob | MetaWebhookJob;

// ---------------------------------------------------------------------------
// Processor
// ---------------------------------------------------------------------------

async function processJob(job: Job<InboxJobData>): Promise<void> {
    const { type } = job.data;

    switch (type) {
        case "inbox:evolution": {
            const { payload } = job.data as EvolutionWebhookJob;
            await processEvolutionPayload(payload);
            break;
        }

        case "inbox:meta": {
            const { payload } = job.data as MetaWebhookJob;
            await processMetaPayload(payload);
            break;
        }

        default:
            console.warn(`[inbox-worker] Unknown job type: ${(job.data as { type?: string }).type}`);
    }
}

// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------

export function createInboxWorker() {
    const worker = new Worker<InboxJobData>("inbox", processJob, {
        connection: getRedis(),
        concurrency: Number(process.env.INBOX_WORKER_CONCURRENCY ?? 5),
    });

    worker.on("completed", (job) => {
        console.info(`[inbox-worker] Job ${job.id} (${job.data.type}) completed`);
    });

    worker.on("failed", (job, err) => {
        console.error(`[inbox-worker] Job ${job?.id} (${job?.data?.type}) failed:`, err.message);
    });

    return worker;
}
