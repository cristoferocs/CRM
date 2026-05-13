import { AgentRepository } from "./agent.repository.js";
import { runSuperAgent } from "./agent.runner.js";
import { queues } from "../../../queue/queues.js";
import { prisma } from "../../../lib/prisma.js";
import type {
    CreateAgentInput,
    UpdateAgentInput,
    RunAgentInput,
    StartLearningInput,
    ApproveFlowInput,
    RejectFlowInput,
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
        return runSuperAgent({
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
}
