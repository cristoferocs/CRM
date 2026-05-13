import { prisma } from "../../../lib/prisma.js";
import type { CreateAgentInput, UpdateAgentInput } from "./agent.schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SessionStatus = "ACTIVE" | "THINKING" | "WAITING_USER" | "HANDOFF" | "ENDED";

// ---------------------------------------------------------------------------
// AgentRepository
// ---------------------------------------------------------------------------

export class AgentRepository {
    // -----------------------------------------------------------------------
    // Agent CRUD
    // -----------------------------------------------------------------------

    create(data: CreateAgentInput & { orgId: string }) {
        return prisma.aIAgent.create({ data: data as never });
    }

    list(orgId: string) {
        return prisma.aIAgent.findMany({
            where: { orgId, isActive: true },
            orderBy: { createdAt: "desc" },
        });
    }

    findById(id: string, orgId: string) {
        return prisma.aIAgent.findFirst({ where: { id, orgId } });
    }

    update(id: string, data: UpdateAgentInput | Record<string, unknown>) {
        return prisma.aIAgent.update({ where: { id }, data: data as never });
    }

    delete(id: string, _orgId: string) {
        return prisma.aIAgent.update({
            where: { id },
            data: { isActive: false },
        });
    }

    // -----------------------------------------------------------------------
    // Sessions
    // -----------------------------------------------------------------------

    createSession(data: { agentId: string; conversationId: string; orgId: string }) {
        return prisma.aIAgentSession.create({ data });
    }

    findActiveSession(conversationId: string) {
        return prisma.aIAgentSession.findFirst({
            where: { conversationId, status: "ACTIVE" },
            include: { agent: true },
        });
    }

    findSession(sessionId: string) {
        return prisma.aIAgentSession.findUnique({ where: { id: sessionId } });
    }

    /** Increment turn counter and update state atomically */
    updateSessionState(
        sessionId: string,
        patch: {
            status?: SessionStatus;
            intent?: string;
            intentConfidence?: number;
            currentStep?: string;
            collectedData?: Record<string, unknown>;
            pendingQuestions?: unknown[];
            planSteps?: unknown[];
            completedSteps?: unknown[];
            handoffReason?: string;
            handoffData?: Record<string, unknown>;
            outcome?: string;
            goalAchieved?: boolean;
            endedAt?: Date;
        },
    ) {
        return prisma.aIAgentSession.update({
            where: { id: sessionId },
            data: {
                ...(patch as Record<string, unknown>),
                lastActivityAt: new Date(),
                turnCount: { increment: 1 },
            },
        });
    }

    endSession(sessionId: string, opts: { reason?: string; outcome?: string; goalAchieved?: boolean } = {}) {
        return prisma.aIAgentSession.update({
            where: { id: sessionId },
            data: {
                status: opts.reason ? "HANDOFF" : "ENDED",
                handoffReason: opts.reason,
                outcome: opts.outcome,
                goalAchieved: opts.goalAchieved,
                endedAt: new Date(),
            },
        });
    }

    // -----------------------------------------------------------------------
    // Turns
    // -----------------------------------------------------------------------

    createTurn(data: {
        sessionId: string;
        role: "user" | "assistant" | "tool";
        content: string;
        toolName?: string;
        toolParams?: Record<string, unknown>;
        toolResult?: string;
        tokensUsed?: number;
    }) {
        return prisma.aIAgentTurn.create({ data: data as never });
    }

    listTurns(sessionId: string) {
        return prisma.aIAgentTurn.findMany({
            where: { sessionId },
            orderBy: { createdAt: "asc" },
        });
    }

    // -----------------------------------------------------------------------
    // Flow versions
    // -----------------------------------------------------------------------

    createFlowVersion(data: {
        agentId: string;
        version: number;
        flowTemplate: Record<string, unknown>;
        notes?: string;
    }) {
        return prisma.agentFlowVersion.create({ data: data as never });
    }

    listFlowVersions(agentId: string) {
        return prisma.agentFlowVersion.findMany({
            where: { agentId },
            orderBy: { version: "desc" },
        });
    }

    getLatestFlowVersion(agentId: string) {
        return prisma.agentFlowVersion.findFirst({
            where: { agentId },
            orderBy: { version: "desc" },
        });
    }

    approveFlowVersion(
        versionId: string,
        approvedBy: string,
        patch?: { flowTemplate?: Record<string, unknown>; decisionRules?: Record<string, unknown>; notes?: string },
    ) {
        return prisma.agentFlowVersion.update({
            where: { id: versionId },
            data: {
                approvedBy,
                approvedAt: new Date(),
                isActive: true,
                ...(patch ?? {}),
            } as never,
        });
    }

    // -----------------------------------------------------------------------
    // Learning jobs
    // -----------------------------------------------------------------------

    createLearningJob(data: { agentId: string; orgId: string; conversationIds: string[] }) {
        return prisma.agentLearningJob.create({ data });
    }

    findPendingLearningJob(agentId: string) {
        return prisma.agentLearningJob.findFirst({
            where: { agentId, status: "PENDING" },
            orderBy: { createdAt: "asc" },
        });
    }

    updateLearningJob(
        jobId: string,
        patch: {
            status?: string;
            analyzedCount?: number;
            result?: Record<string, unknown>;
            error?: string;
            startedAt?: Date;
            completedAt?: Date;
        },
    ) {
        return prisma.agentLearningJob.update({
            where: { id: jobId },
            data: patch as never,
        });
    }

    listLearningJobs(agentId: string) {
        return prisma.agentLearningJob.findMany({
            where: { agentId },
            orderBy: { createdAt: "desc" },
            take: 20,
        });
    }

    // -----------------------------------------------------------------------
    // Metrics
    // -----------------------------------------------------------------------

    async getPerformanceMetrics(agentId: string) {
        const sessions = await prisma.aIAgentSession.findMany({
            where: { agentId },
            select: {
                status: true,
                turnCount: true,
                goalAchieved: true,
                startedAt: true,
                endedAt: true,
                handoffReason: true,
            },
        });
        const total = sessions.length;
        const handedOff = sessions.filter((s) => s.status === "HANDOFF").length;
        const goalsAchieved = sessions.filter((s) => s.goalAchieved === true).length;
        const avgTurns =
            total > 0 ? sessions.reduce((acc, s) => acc + s.turnCount, 0) / total : 0;
        return { total, handedOff, selfResolved: total - handedOff, goalsAchieved, avgTurns };
    }

    // -----------------------------------------------------------------------
    // Legacy compatibility shims
    // -----------------------------------------------------------------------

    /** @deprecated use updateSessionState */
    incrementSessionMessages(sessionId: string) {
        return prisma.aIAgentSession.update({
            where: { id: sessionId },
            data: { turnCount: { increment: 1 }, lastActivityAt: new Date() },
        });
    }
}
