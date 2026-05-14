import { Worker, type Job } from "bullmq";
import { getRedis } from "../../lib/redis.js";
import { KnowledgeService } from "../../modules/ai/knowledge/knowledge.service.js";
import { analyzeConversation } from "../../modules/ai/insights/analyzers/conversation.analyzer.js";
import { learnObjections } from "../../modules/ai/insights/analyzers/objection.analyzer.js";
import { learnBestApproaches } from "../../modules/ai/insights/analyzers/approach.analyzer.js";
import { runAgent } from "../../modules/ai/agents/agent.runner.js";
import { InboxService } from "../../modules/inbox/module.service.js";
import { logger } from "../../lib/logger.js";
import { runWithContext } from "../../lib/request-context.js";
import { reqIdFromJob } from "../queues.js";
import { captureFromWorker } from "../../lib/sentry.js";

const knowledgeService = new KnowledgeService();
const inboxService = new InboxService();
const workerLog = logger.child({ worker: "knowledge" });

// ---------------------------------------------------------------------------
// Job data types
// ---------------------------------------------------------------------------

interface IndexDocumentJob {
    type: "knowledge:index";
    documentId: string;
    orgId: string;
}

interface AnalyzeConversationJob {
    type: "ai:analyze-conversation";
    conversationId: string;
    orgId: string;
}

interface LearnInsightsJob {
    type: "ai:learn-insights";
    orgId: string;
    period?: string;
}

interface AgentRespondJob {
    type: "ai:agent-respond";
    agentId: string;
    conversationId: string;
    message: string;
    contactId: string;
    orgId: string;
}

type KnowledgeJobData = IndexDocumentJob | AnalyzeConversationJob | LearnInsightsJob | AgentRespondJob;

// ---------------------------------------------------------------------------
// Processor
// ---------------------------------------------------------------------------

async function processJob(job: Job<KnowledgeJobData>): Promise<void> {
    const reqId = reqIdFromJob(job) ?? `knowledge-${job.id ?? "noid"}`;
    return runWithContext({ reqId }, async () => {
        const { type } = job.data;

        switch (type) {
            case "knowledge:index": {
                const { documentId, orgId } = job.data as IndexDocumentJob;
                workerLog.info({ documentId, orgId }, "indexing document");
                await knowledgeService.indexDocument(documentId, orgId);
                break;
            }

            case "ai:analyze-conversation": {
                const { conversationId, orgId } = job.data as AnalyzeConversationJob;
                workerLog.info({ conversationId, orgId }, "analyzing conversation");
                await analyzeConversation(conversationId, orgId);
                break;
            }

            case "ai:learn-insights": {
                const { orgId, period } = job.data as LearnInsightsJob;
                workerLog.info({ orgId, period }, "learning insights");
                await Promise.allSettled([
                    learnObjections(orgId, period),
                    learnBestApproaches(orgId),
                ]);
                break;
            }

            case "ai:agent-respond": {
                const { agentId, conversationId, message, contactId, orgId } = job.data as AgentRespondJob;
                workerLog.info({ agentId, conversationId, orgId }, "agent responding");
                const result = await runAgent({ agentId, conversationId, message, contactId, orgId });
                if (!result.handoff) {
                    await inboxService.sendMessage(
                        conversationId,
                        { content: result.response, type: "TEXT" },
                        orgId,
                        "ai-agent",
                    ).catch(() => { /* best-effort external delivery */ });
                }
                break;
            }

            default:
                workerLog.warn(
                    { jobType: (job.data as { type: string }).type },
                    "unknown job type",
                );
        }
    });
}

// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------

export function createKnowledgeWorker(): Worker<KnowledgeJobData> {
    const worker = new Worker<KnowledgeJobData>("knowledge", processJob, {
        connection: getRedis(),
        concurrency: 3,
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
            { jobId: job?.id, jobType: job?.data?.type, attempt: job?.attemptsMade, reqId, err },
            "job failed",
        );
        if (job && job.attemptsMade >= (job.opts?.attempts ?? 1)) {
            captureFromWorker(err, {
                worker: "knowledge",
                jobId: job?.id,
                jobType: job?.data?.type,
                reqId,
            });
        }
    });

    worker.on("error", (err) => {
        workerLog.error({ err }, "worker error");
        captureFromWorker(err, { worker: "knowledge" });
    });

    return worker;
}
