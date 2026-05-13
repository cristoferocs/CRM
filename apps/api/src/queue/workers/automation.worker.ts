import { Worker, type Job } from "bullmq";
import { getRedis } from "../../lib/redis.js";
import { AutomationsService } from "../../modules/automations/automations.service.js";
import type { AutomationJobData } from "../../modules/automations/automation.types.js";

const automationsService = new AutomationsService();

// ---------------------------------------------------------------------------
// Processor
// ---------------------------------------------------------------------------

async function processAutomationJob(job: Job<AutomationJobData>): Promise<void> {
    const { automationId, contactId, dealId, orgId, metadata } = job.data;

    console.info(
        `[automation-worker] Processing job ${job.id} — automation=${automationId} ` +
        `contact=${contactId ?? "-"} deal=${dealId ?? "-"}`,
    );

    await automationsService.execute(
        automationId,
        contactId,
        dealId,
        orgId,
        metadata,
    );
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

export function createAutomationWorker(): Worker<AutomationJobData> {
    const worker = new Worker<AutomationJobData>(
        "automations",
        processAutomationJob,
        {
            connection: getRedis(),
            concurrency: 5,
        },
    );

    worker.on("completed", (job) => {
        console.info(`[automation-worker] Job ${job.id} completed.`);
    });

    worker.on("failed", (job, err) => {
        console.error(
            `[automation-worker] Job ${job?.id} failed (attempt ${job?.attemptsMade}):`,
            err.message,
        );
    });

    worker.on("error", (err) => {
        console.error("[automation-worker] Worker error:", err);
    });

    return worker;
}
