import { Worker, type Job } from "bullmq";
import { getRedis } from "../../lib/redis.js";
import { KnowledgeService } from "../../modules/ai/knowledge/knowledge.service.js";
import { analyzeConversation } from "../../modules/ai/insights/analyzers/conversation.analyzer.js";
import { learnObjections } from "../../modules/ai/insights/analyzers/objection.analyzer.js";
import { learnBestApproaches } from "../../modules/ai/insights/analyzers/approach.analyzer.js";
import { runAgent } from "../../modules/ai/agents/agent.runner.js";
import { InboxService } from "../../modules/inbox/module.service.js";

const knowledgeService = new KnowledgeService();
const inboxService = new InboxService();

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
    const { type } = job.data;

    switch (type) {
        case "knowledge:index": {
            const { documentId, orgId } = job.data as IndexDocumentJob;
            console.info(`[knowledge-worker] Indexing document ${documentId}`);
            await knowledgeService.indexDocument(documentId, orgId);
            break;
        }

        case "ai:analyze-conversation": {
            const { conversationId, orgId } = job.data as AnalyzeConversationJob;
            console.info(`[knowledge-worker] Analyzing conversation ${conversationId}`);
            await analyzeConversation(conversationId, orgId);
            break;
        }

        case "ai:learn-insights": {
            const { orgId, period } = job.data as LearnInsightsJob;
            console.info(`[knowledge-worker] Learning insights for org ${orgId}`);
            await Promise.allSettled([
                learnObjections(orgId, period),
                learnBestApproaches(orgId),
            ]);
            break;
        }

        case "ai:agent-respond": {
            const { agentId, conversationId, message, contactId, orgId } = job.data as AgentRespondJob;
            console.info(`[knowledge-worker] Agent ${agentId} responding to conversation ${conversationId}`);
            const result = await runAgent({ agentId, conversationId, message, contactId, orgId });
            if (!result.handoff) {
                // Message already saved by agent runner; also send via inbox channel if needed
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
            console.warn(`[knowledge-worker] Unknown job type: ${(job.data as { type: string }).type}`);
    }
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
        console.info(`[knowledge-worker] Job ${job.id} (${job.data.type}) completed.`);
    });

    worker.on("failed", (job, err) => {
        console.error(
            `[knowledge-worker] Job ${job?.id} (${job?.data?.type}) failed ` +
            `(attempt ${job?.attemptsMade}): ${err.message}`,
        );
    });

    worker.on("error", (err) => {
        console.error("[knowledge-worker] Worker error:", err);
    });

    return worker;
}
