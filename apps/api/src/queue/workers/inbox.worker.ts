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
import { logger } from "../../lib/logger.js";
import { runWithContext } from "../../lib/request-context.js";
import { reqIdFromJob } from "../queues.js";
import { captureFromWorker } from "../../lib/sentry.js";

const workerLog = logger.child({ worker: "inbox" });

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
    const reqId = reqIdFromJob(job) ?? `inbox-${job.id ?? "noid"}`;
    return runWithContext({ reqId }, async () => {
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
                workerLog.warn({ jobType: (job.data as { type?: string }).type }, "unknown job type");
        }
    });
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
        workerLog.info(
            { jobId: job.id, jobType: job.data.type, reqId: reqIdFromJob(job) },
            "job completed",
        );
    });

    worker.on("failed", (job, err) => {
        const reqId = job ? reqIdFromJob(job) : undefined;
        workerLog.error(
            { jobId: job?.id, jobType: job?.data?.type, reqId, err },
            "job failed",
        );
        if (job && job.attemptsMade >= (job.opts?.attempts ?? 1)) {
            captureFromWorker(err, {
                worker: "inbox",
                jobId: job?.id,
                jobType: job?.data?.type,
                reqId,
            });
        }
    });

    worker.on("error", (err) => {
        workerLog.error({ err }, "worker error");
        captureFromWorker(err, { worker: "inbox" });
    });

    return worker;
}
