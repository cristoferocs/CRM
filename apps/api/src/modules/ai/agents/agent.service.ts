import { AgentRepository } from "./agent.repository.js";
import { superAgentRunner } from "./super-agent.runner.js";
import { flowValidator } from "./learning/flow-validator.js";
import { queues } from "../../../queue/queues.js";
import { prisma } from "../../../lib/prisma.js";
import type {
    CreateAgentInput,
    UpdateAgentInput,
    RunAgentInput,
    StartLearningInput,
    ApproveFlowInput,
    RejectFlowInput,
    RefineFlowInput,
    SessionFiltersInput,
} from "./agent.schema.js";

export class AgentService {
    private readonly repo = new AgentRepository();

    // -----------------------------------------------------------------------
    // CRUD
    // -----------------------------------------------------------------------

    list(orgId: string) {
        return this.repo.list(orgId);
    }

    async findById(id: string, orgId: string) {
        const agent = await this.repo.findById(id, orgId);
        if (!agent) {
            const err = new Error("Agente não encontrado") as Error & { statusCode: number };
            err.statusCode = 404;
            throw err;
        }
        return agent;
    }

    create(data: CreateAgentInput, orgId: string) {
        return this.repo.create({ ...data, orgId });
    }

    async update(id: string, data: UpdateAgentInput, orgId: string) {
        await this.findById(id, orgId);
        return this.repo.update(id, data);
    }

    async delete(id: string, orgId: string) {
        await this.findById(id, orgId);
        return this.repo.delete(id, orgId);
    }

    // -----------------------------------------------------------------------
    // Run (single turn)
    // -----------------------------------------------------------------------

    async run(agentId: string, input: RunAgentInput, orgId: string) {
        const agent = await this.findById(agentId, orgId);
        if (agent.status !== "ACTIVE" && agent.status !== "READY") {
            const err = new Error("Agente não está ativo") as Error & { statusCode: number };
            err.statusCode = 422;
            throw err;
        }
        let contactId = input.contactId ?? "";
        if (!contactId) {
            const conv = await prisma.conversation.findFirst({
                where: { id: input.conversationId },
                select: { contactId: true },
            });
            contactId = conv?.contactId ?? "";
        }
        return superAgentRunner.run({
            agentId,
            conversationId: input.conversationId,
            message: input.message,
            contactId,
            orgId,
        });
    }

    // -----------------------------------------------------------------------
    // Lifecycle: activate / pause / retire
    // -----------------------------------------------------------------------

    async activate(id: string, orgId: string) {
        const agent = await this.findById(id, orgId);
        if (agent.status !== "READY") {
            const err = new Error("Agente precisa estar no status READY para ser ativado") as Error & { statusCode: number };
            err.statusCode = 422;
            throw err;
        }
        return this.repo.update(id, { status: "ACTIVE", phase: "PRODUCTION", isActive: true } as never);
    }

    async pause(id: string, orgId: string) {
        await this.findById(id, orgId);
        return this.repo.update(id, { status: "PAUSED", isActive: false } as never);
    }

    async retire(id: string, orgId: string) {
        await this.findById(id, orgId);
        return this.repo.update(id, { status: "RETIRED", isActive: false } as never);
    }

    /** @deprecated — use activate() / pause() */
    async toggle(id: string, orgId: string) {
        const agent = await this.findById(id, orgId);
        if (agent.status === "ACTIVE") return this.pause(id, orgId);
        if (agent.status === "READY" || agent.status === "PAUSED") return this.activate(id, orgId);
        const err = new Error("Use /activate ou /pause para este agente") as Error & { statusCode: number };
        err.statusCode = 422;
        throw err;
    }

    // -----------------------------------------------------------------------
    // Learning phase
    // -----------------------------------------------------------------------

    async startLearning(id: string, input: StartLearningInput, orgId: string) {
        const agent = await this.findById(id, orgId);
        if (!["DRAFT", "PAUSED", "REVIEW"].includes(agent.status)) {
            const err = new Error("Agente não pode iniciar aprendizado neste status") as Error & { statusCode: number };
            err.statusCode = 422;
            throw err;
        }

        // Resolve conversation IDs to learn from
        let conversationIds = input.conversationIds ?? [];
        if (conversationIds.length === 0) {
            const convs = await prisma.conversation.findMany({
                where: { orgId, status: "RESOLVED" },
                orderBy: { lastMessageAt: "desc" },
                take: agent.minimumLearningSample,
                select: { id: true },
            });
            conversationIds = convs.map((c) => c.id);
        }

        if (conversationIds.length < agent.minimumLearningSample) {
            const err = new Error(
                `Amostra insuficiente: ${conversationIds.length} conversas (mínimo: ${agent.minimumLearningSample})`,
            ) as Error & { statusCode: number };
            err.statusCode = 422;
            throw err;
        }

        await this.repo.update(id, { status: "LEARNING", phase: "LEARNING" } as never);
        const job = await this.repo.createLearningJob({ agentId: id, orgId, conversationIds });

        await queues.learning().add(
            "agent:learn",
            { jobId: job.id, agentId: id, orgId, conversationIds },
            { attempts: 2, backoff: { type: "exponential", delay: 10_000 } },
        );

        return { jobId: job.id, conversationCount: conversationIds.length };
    }

    listLearningJobs(agentId: string, orgId: string) {
        return this.findById(agentId, orgId).then(() => this.repo.listLearningJobs(agentId));
    }

    // -----------------------------------------------------------------------
    // Flow version approval
    // -----------------------------------------------------------------------

    listFlowVersions(agentId: string, orgId: string) {
        return this.findById(agentId, orgId).then(() => this.repo.listFlowVersions(agentId));
    }

    async approveFlow(agentId: string, userId: string, input: ApproveFlowInput, orgId: string) {
        const agent = await this.findById(agentId, orgId);
        if (agent.status !== "REVIEW") {
            const err = new Error("Agente não está em fase de revisão") as Error & { statusCode: number };
            err.statusCode = 422;
            throw err;
        }

        const latest = await this.repo.getLatestFlowVersion(agentId);
        if (!latest) {
            const err = new Error("Nenhuma versão de fluxo encontrada para aprovar") as Error & { statusCode: number };
            err.statusCode = 404;
            throw err;
        }

        await this.repo.approveFlowVersion(latest.id, userId, {
            flowTemplate: input.flowTemplate as Record<string, unknown> | undefined,
            decisionRules: input.decisionRules as Record<string, unknown> | undefined,
            notes: input.notes,
        });

        // Persist approved flow + decision rules back onto the agent
        const updatePayload: Record<string, unknown> = {
            status: "READY",
            phase: "VALIDATION",
        };
        if (input.flowTemplate) updatePayload["flowTemplate"] = input.flowTemplate;
        if (input.decisionRules) updatePayload["decisionRules"] = input.decisionRules;

        return this.repo.update(agentId, updatePayload);
    }

    async rejectFlow(agentId: string, input: RejectFlowInput, orgId: string) {
        const agent = await this.findById(agentId, orgId);
        if (agent.status !== "REVIEW") {
            const err = new Error("Agente não está em fase de revisão") as Error & { statusCode: number };
            err.statusCode = 422;
            throw err;
        }
        // Move back to DRAFT so team can re-configure before re-learning
        return this.repo.update(agentId, {
            status: "DRAFT",
            phase: "SETUP",
        } as never);
    }

    // -----------------------------------------------------------------------
    // Sessions & performance
    // -----------------------------------------------------------------------

    getActiveSession(conversationId: string) {
        return this.repo.findActiveSession(conversationId);
    }

    async getSessionsForAgent(agentId: string, orgId: string) {
        await this.findById(agentId, orgId);
        return prisma.aIAgentSession.findMany({
            where: { agentId },
            orderBy: { startedAt: "desc" },
            take: 50,
        });
    }

    async getSessionTurns(sessionId: string, orgId: string) {
        const session = await prisma.aIAgentSession.findFirst({
            where: { id: sessionId, orgId },
        });
        if (!session) {
            const err = new Error("Sessão não encontrada") as Error & { statusCode: number };
            err.statusCode = 404;
            throw err;
        }
        return this.repo.listTurns(sessionId);
    }

    async getPerformance(agentId: string, orgId: string) {
        await this.findById(agentId, orgId);
        return this.repo.getPerformanceMetrics(agentId);
    }

    // -----------------------------------------------------------------------
    // Learning status (progress + preview of patterns found so far)
    // -----------------------------------------------------------------------

    async getLearningStatus(agentId: string, orgId: string) {
        await this.findById(agentId, orgId);
        const jobs = await this.repo.listLearningJobs(agentId);
        const latest = jobs[0] ?? null;
        if (!latest) return { status: "NONE", analyzedCount: 0, total: 0, preview: null };

        const total = (latest.conversationIds as string[]).length;
        const preview =
            latest.result &&
                typeof latest.result === "object" &&
                "stages" in latest.result
                ? {
                    stages: ((latest.result as Record<string, unknown>)["stages"] as unknown[])?.slice(0, 3),
                    confidence: (latest.result as Record<string, unknown>)["metadata"]
                        ? ((latest.result as Record<string, unknown>)["metadata"] as Record<string, unknown>)[
                        "confidence"
                        ]
                        : null,
                }
                : null;

        return {
            status: latest.status,
            analyzedCount: latest.analyzedCount,
            total,
            progress: total > 0 ? Math.round((latest.analyzedCount / total) * 100) : 0,
            error: latest.error ?? null,
            startedAt: latest.startedAt,
            completedAt: latest.completedAt,
            preview,
        };
    }

    // -----------------------------------------------------------------------
    // Flow versions — by specific ID
    // -----------------------------------------------------------------------

    async getFlowVersion(agentId: string, versionId: string, orgId: string) {
        await this.findById(agentId, orgId);
        const version = await prisma.agentFlowVersion.findFirst({
            where: { id: versionId, agentId },
        });
        if (!version) {
            const err = new Error("Versão de fluxo não encontrada") as Error & { statusCode: number };
            err.statusCode = 404;
            throw err;
        }
        return version;
    }

    async approveFlowVersionById(
        agentId: string,
        versionId: string,
        userId: string,
        input: ApproveFlowInput,
        orgId: string,
    ) {
        await this.findById(agentId, orgId);
        await flowValidator.approveFlow(agentId, versionId, userId, orgId, {
            flowTemplate: input.flowTemplate,
            decisionRules: input.decisionRules,
            notes: input.notes,
        });
        return this.findById(agentId, orgId);
    }

    async rejectFlowVersionById(
        agentId: string,
        versionId: string,
        input: RejectFlowInput,
        userId: string,
        orgId: string,
    ) {
        await this.findById(agentId, orgId);
        await flowValidator.rejectFlow(agentId, versionId, { feedback: input.reason }, userId, orgId);
    }

    async refineFlowVersion(
        agentId: string,
        versionId: string,
        input: RefineFlowInput,
        userId: string,
        orgId: string,
    ) {
        await this.findById(agentId, orgId);
        await flowValidator.refineFlow(agentId, versionId, { changes: input.changes, notes: input.notes }, userId, orgId);
        return this.findById(agentId, orgId);
    }

    // -----------------------------------------------------------------------
    // Sessions — filtered list + detail
    // -----------------------------------------------------------------------

    async getSessionsFiltered(agentId: string, orgId: string, filters: SessionFiltersInput) {
        await this.findById(agentId, orgId);
        const where: Record<string, unknown> = { agentId };
        if (filters.status) where["status"] = filters.status;
        if (filters.goalAchieved !== undefined) where["goalAchieved"] = filters.goalAchieved;
        if (filters.from || filters.to) {
            const range: Record<string, unknown> = {};
            if (filters.from) range["gte"] = new Date(filters.from);
            if (filters.to) range["lte"] = new Date(filters.to);
            where["startedAt"] = range;
        }
        return prisma.aIAgentSession.findMany({
            where: where as never,
            orderBy: { startedAt: "desc" },
            take: filters.limit ?? 50,
        });
    }

    async getSessionDetail(agentId: string, sessionId: string, orgId: string) {
        await this.findById(agentId, orgId);
        const session = await prisma.aIAgentSession.findFirst({
            where: { id: sessionId, agentId, orgId },
            include: { turns: { orderBy: { createdAt: "asc" } } },
        });
        if (!session) {
            const err = new Error("Sessão não encontrada") as Error & { statusCode: number };
            err.statusCode = 404;
            throw err;
        }
        return session;
    }

    async getTurnDetail(turnId: string, orgId: string) {
        const turn = await prisma.aIAgentTurn.findFirst({
            where: { id: turnId, session: { orgId } },
            include: { session: { select: { agentId: true, orgId: true } } },
        });
        if (!turn) {
            const err = new Error("Turn não encontrado") as Error & { statusCode: number };
            err.statusCode = 404;
            throw err;
        }
        return turn;
    }

    // -----------------------------------------------------------------------
    // Weekly performance chart (last 8 weeks)
    // -----------------------------------------------------------------------

    async getWeeklyPerformance(agentId: string, orgId: string) {
        await this.findById(agentId, orgId);

        const eightWeeksAgo = new Date();
        eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);

        const sessions = await prisma.aIAgentSession.findMany({
            where: { agentId, orgId, startedAt: { gte: eightWeeksAgo } },
            select: { startedAt: true, goalAchieved: true, status: true, turnCount: true },
        });

        // Group by ISO week (Monday)
        const byWeek = new Map<
            string,
            { total: number; completed: number; handoffs: number; turnSum: number }
        >();

        for (const s of sessions) {
            const monday = getMondayKey(s.startedAt);
            const bucket = byWeek.get(monday) ?? { total: 0, completed: 0, handoffs: 0, turnSum: 0 };
            bucket.total++;
            if (s.goalAchieved) bucket.completed++;
            if (s.status === "HANDOFF") bucket.handoffs++;
            bucket.turnSum += s.turnCount;
            byWeek.set(monday, bucket);
        }

        const weeks = [...byWeek.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([week, b]) => ({
                week,
                total: b.total,
                completed: b.completed,
                handoffs: b.handoffs,
                autonomyRate: b.total > 0 ? b.completed / b.total : 0,
                avgTurns: b.total > 0 ? b.turnSum / b.total : 0,
            }));

        const base = await this.repo.getPerformanceMetrics(agentId);
        return { ...base, weeks };
    }
}

// ---------------------------------------------------------------------------
// Module helper
// ---------------------------------------------------------------------------

function getMondayKey(date: Date): string {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
}
