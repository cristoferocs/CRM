/**
 * agent-proactive.worker.ts
 *
 * BullMQ worker that processes jobs where an AI agent initiates contact
 * with a contact rather than waiting for an inbound message.
 *
 * Job types:
 *   - agent:proactive_contact  — deal enters an AUTO_ENTER stage
 *   - agent:reengagement       — deal has been rotting and needs re-engagement
 *
 * Flow:
 *   1. Load contact + deal
 *   2. Find or create a conversation with this contact
 *   3. Create / resume an AIAgentSession linked to the conversation
 *   4. Call SuperAgentRunner.run() with the context message
 *   5. SuperAgentRunner generates the first agent reply + any tool calls
 *   6. The reply is sent via InboxService.sendMessage()
 *   7. The session stays WAITING_USER — when the client replies, the normal
 *      inbox pipeline picks up the session and continues the ReAct loop
 */
import { Worker, type Job } from "bullmq";
import { getRedis } from "../../lib/redis.js";
import { prisma } from "../../lib/prisma.js";
import { SuperAgentRunner } from "../../modules/ai/agents/super-agent.runner.js";
import { InboxService } from "../../modules/inbox/module.service.js";
import { logger } from "../../lib/logger.js";
import { runWithContext } from "../../lib/request-context.js";
import { reqIdFromJob } from "../queues.js";
import { captureFromWorker } from "../../lib/sentry.js";

const workerLog = logger.child({ worker: "agent-proactive" });

// ---------------------------------------------------------------------------
// Job data types
// ---------------------------------------------------------------------------

export interface ProactiveContactJobData {
    type: "proactive_contact";
    agentId: string;
    dealId: string;
    contactId: string;
    orgId: string;
    stageId: string;
    stageName: string;
    agentGoal?: string | null;
    contextMessage: string;
    triggerType: "AUTO_ENTER" | "MANUAL";
}

export interface ReengagementJobData {
    type: "reengagement";
    agentId: string;
    dealId: string;
    contactId: string;
    orgId: string;
    stageId: string;
    stageName: string;
    agentGoal?: string | null;
    contextMessage: string;
    triggerType: "AUTO_ROTTING";
    daysSinceActivity: number;
}

export type AgentProactiveJobData = ProactiveContactJobData | ReengagementJobData;

// ---------------------------------------------------------------------------
// Core runner instance (shared, stateless)
// ---------------------------------------------------------------------------

const runner = new SuperAgentRunner();
const inboxService = new InboxService();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CHANNEL_PRIORITY: string[] = ["WHATSAPP", "WHATSAPP_OFFICIAL", "INSTAGRAM", "FACEBOOK", "EMAIL", "INTERNAL"];

/**
 * Find the best active conversation to use for proactive contact.
 * Priority: WhatsApp > other channels > create new INTERNAL conversation.
 */
async function resolveOrCreateConversation(
    contactId: string,
    orgId: string,
    agentId: string,
): Promise<{ conversationId: string; isNew: boolean }> {
    // Try to find an existing OPEN conversation by channel priority
    for (const channel of CHANNEL_PRIORITY) {
        const existing = await prisma.conversation.findFirst({
            where: {
                contactId,
                orgId,
                channel: channel as never,
                status: { in: ["OPEN", "BOT", "PENDING"] },
            },
            orderBy: { lastMessageAt: "desc" },
            select: { id: true },
        });
        if (existing) return { conversationId: existing.id, isNew: false };
    }

    // No conversation exists — create INTERNAL channel as fallback
    const contact = await prisma.contact.findUnique({
        where: { id: contactId },
        select: { id: true, phone: true, email: true },
    });

    // Prefer WhatsApp if phone is available
    const hasPhone = Boolean(contact?.phone);
    const channel = hasPhone ? "WHATSAPP" : "INTERNAL";
    const externalId = hasPhone
        ? (contact!.phone as string)
        : `internal:${contactId}:${Date.now()}`;

    const conversation = await prisma.conversation.create({
        data: {
            channel: channel as never,
            externalId,
            contactId,
            orgId,
            status: "BOT",
            agentId: null,
        },
        select: { id: true },
    });

    return { conversationId: conversation.id, isNew: true };
}

/**
 * Find or create an AIAgentSession for this (agent, conversation) pair.
 * Re-uses an existing WAITING_USER session to avoid duplicates.
 */
async function resolveSession(
    agentId: string,
    conversationId: string,
    orgId: string,
    dealId: string,
    stageId: string,
    contextMessage: string,
): Promise<string> {
    // Try to re-use an existing waiting session
    const existing = await prisma.aIAgentSession.findFirst({
        where: {
            agentId,
            conversationId,
            status: { in: ["WAITING_USER", "ACTIVE"] },
        },
        select: { id: true },
    });
    if (existing) return existing.id;

    // Create new session
    const session = await prisma.aIAgentSession.create({
        data: {
            agentId,
            conversationId,
            orgId,
            status: "ACTIVE",
            collectedData: {
                dealId,
                stageId,
                initialContext: contextMessage,
                triggerType: "PROACTIVE",
            } as never,
        },
        select: { id: true },
    });

    // Link session to the deal
    await prisma.deal.updateMany({
        where: { id: dealId, orgId },
        data: { activeAgentSessionId: session.id },
    });

    return session.id;
}

// ---------------------------------------------------------------------------
// Job processors
// ---------------------------------------------------------------------------

async function processProactiveContact(job: Job<ProactiveContactJobData>): Promise<void> {
    const { agentId, dealId, contactId, orgId, stageId, stageName, agentGoal, contextMessage, triggerType } = job.data;

    console.info(`[agent-proactive] Proactive contact — deal=${dealId} agent=${agentId} stage="${stageName}"`);

    // 1. Verify agent is still active
    const agent = await prisma.aIAgent.findFirst({
        where: { id: agentId, orgId, isActive: true, status: "ACTIVE" },
        select: { id: true, name: true },
    });
    if (!agent) {
        console.warn(`[agent-proactive] Agent ${agentId} not found or inactive — skipping job ${job.id}`);
        return;
    }

    // 2. Resolve or create conversation
    const { conversationId } = await resolveOrCreateConversation(contactId, orgId, agentId);

    // 3. Resolve or create session
    const sessionId = await resolveSession(agentId, conversationId, orgId, dealId, stageId, contextMessage);

    // 4. Build the system trigger message and run the agent
    const triggerPrefix = triggerType === "AUTO_ENTER"
        ? `[SISTEMA] Um lead entrou na etapa "${stageName}".`
        : `[SISTEMA] Contato proativo solicitado.`;

    const fullMessage = [
        triggerPrefix,
        contextMessage,
        agentGoal ? `Objetivo nesta etapa: ${agentGoal}` : "",
        `Gere a primeira mensagem de contato para o cliente. Seja natural e contextualizado.`,
    ]
        .filter(Boolean)
        .join("\n");

    const result = await runner.run({
        agentId,
        sessionId,
        conversationId,
        message: fullMessage,
        contactId,
        orgId,
    });

    // 5. Send the agent's response to the client via inbox
    if (result.response && result.response.trim()) {
        await inboxService.sendMessage(
            conversationId,
            { content: result.response, type: "TEXT" },
            orgId,
            agentId,
        ).catch((err: unknown) => {
            console.error(`[agent-proactive] Failed to send proactive message:`, err);
        });
    }

    console.info(
        `[agent-proactive] Proactive contact complete — deal=${dealId} session=${sessionId} ` +
        `handoff=${result.handoff} goalAchieved=${result.goalAchieved}`,
    );
}

async function processReengagement(job: Job<ReengagementJobData>): Promise<void> {
    const { agentId, dealId, contactId, orgId, stageId, stageName, agentGoal, contextMessage, daysSinceActivity } = job.data;

    console.info(`[agent-proactive] Reengagement — deal=${dealId} agent=${agentId} stalled=${daysSinceActivity}d`);

    // Verify agent
    const agent = await prisma.aIAgent.findFirst({
        where: { id: agentId, orgId, isActive: true, status: "ACTIVE" },
        select: { id: true, name: true },
    });
    if (!agent) {
        console.warn(`[agent-proactive] Agent ${agentId} not found or inactive — skipping reengagement job ${job.id}`);
        return;
    }

    // Check that deal is still rotting (may have been resolved in the meantime)
    const deal = await prisma.deal.findFirst({
        where: { id: dealId, orgId, isActive: true },
        select: { id: true, isRotting: true, activeAgentSessionId: true },
    });
    if (!deal?.isRotting) {
        console.info(`[agent-proactive] Deal ${dealId} is no longer rotting — skipping reengagement.`);
        return;
    }
    if (deal.activeAgentSessionId) {
        console.info(`[agent-proactive] Deal ${dealId} already has active agent session — skipping reengagement.`);
        return;
    }

    // Resolve conversation
    const { conversationId } = await resolveOrCreateConversation(contactId, orgId, agentId);

    // Resolve session
    const sessionId = await resolveSession(agentId, conversationId, orgId, dealId, stageId, contextMessage);

    const reengagementInstruction = [
        `[SISTEMA] Reengajamento — lead parado há ${daysSinceActivity} dia(s) na etapa "${stageName}".`,
        contextMessage,
        agentGoal ? `Objetivo: ${agentGoal}` : "",
        `Instrução: Reengaje este lead que estava parado. Use uma abordagem diferente da anterior.`,
        `Considere oferecer algo novo, compartilhar um caso de sucesso ou perguntar o que mudou.`,
        `Gere uma mensagem de reengajamento natural e personalizada.`,
    ]
        .filter(Boolean)
        .join("\n");

    const result = await runner.run({
        agentId,
        sessionId,
        conversationId,
        message: reengagementInstruction,
        contactId,
        orgId,
    });

    if (result.response && result.response.trim()) {
        await inboxService.sendMessage(
            conversationId,
            { content: result.response, type: "TEXT" },
            orgId,
            agentId,
        ).catch((err: unknown) => {
            console.error(`[agent-proactive] Failed to send reengagement message:`, err);
        });
    }

    console.info(
        `[agent-proactive] Reengagement complete — deal=${dealId} session=${sessionId} ` +
        `handoff=${result.handoff} goalAchieved=${result.goalAchieved}`,
    );
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

async function processJob(job: Job<AgentProactiveJobData>): Promise<void> {
    const reqId = reqIdFromJob(job) ?? `agent-proactive-${job.id ?? "noid"}`;
    return runWithContext({ reqId }, async () => {
        switch (job.data.type) {
            case "proactive_contact":
                return processProactiveContact(job as Job<ProactiveContactJobData>);
            case "reengagement":
                return processReengagement(job as Job<ReengagementJobData>);
            default:
                workerLog.warn(
                    { jobType: (job.data as { type?: string }).type },
                    "unknown job type",
                );
        }
    });
}

// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------

export function createAgentProactiveWorker() {
    const worker = new Worker<AgentProactiveJobData>(
        "ai",
        processJob,
        {
            connection: getRedis(),
            concurrency: Number(process.env["AGENT_PROACTIVE_CONCURRENCY"] ?? 3),
        },
    );

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
                worker: "agent-proactive",
                jobId: job?.id,
                jobType: job?.data?.type,
                reqId,
            });
        }
    });

    worker.on("error", (err) => {
        workerLog.error({ err }, "worker error");
        captureFromWorker(err, { worker: "agent-proactive" });
    });

    return worker;
}
