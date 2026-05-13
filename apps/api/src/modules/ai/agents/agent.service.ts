import { AgentRepository } from "./agent.repository.js";
import { runAgent } from "./agent.runner.js";
import type { CreateAgentInput, UpdateAgentInput, RunAgentInput } from "./agent.schema.js";

export class AgentService {
    private readonly repo = new AgentRepository();

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
        await this.findById(id, orgId); // 404 guard
        return this.repo.update(id, data);
    }

    async delete(id: string, orgId: string) {
        await this.findById(id, orgId); // 404 guard
        return this.repo.delete(id, orgId);
    }

    async run(agentId: string, input: RunAgentInput, orgId: string) {
        const agent = await this.findById(agentId, orgId);
        let contactId = input.contactId ?? "";
        if (!contactId) {
            const { prisma } = await import("../../../lib/prisma.js");
            const conv = await prisma.conversation.findFirst({
                where: { id: input.conversationId },
                select: { contactId: true },
            });
            contactId = conv?.contactId ?? "";
        }
        return runAgent({ agentId, conversationId: input.conversationId, message: input.message, contactId, orgId });
    }

    async toggle(id: string, orgId: string) {
        const agent = await this.findById(id, orgId);
        const next = agent.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
        return this.repo.update(id, { status: next } as never);
    }

    async getSessionsForAgent(agentId: string, orgId: string) {
        await this.findById(agentId, orgId); // 404 guard
        const { prisma } = await import("../../../lib/prisma.js");
        return prisma.aIAgentSession.findMany({
            where: { agentId },
            orderBy: { startedAt: "desc" },
            take: 50,
        });
    }

    async getPerformance(agentId: string, orgId: string) {
        await this.findById(agentId, orgId); // 404 guard
        const { prisma } = await import("../../../lib/prisma.js");
        const sessions = await prisma.aIAgentSession.findMany({ where: { agentId } });
        const total = sessions.length;
        const handedOff = sessions.filter((s) => s.handoffReason !== null && s.handoffReason !== undefined).length;
        const avgMessages = total > 0 ? sessions.reduce((acc, s) => acc + s.messagesHandled, 0) / total : 0;
        return { total, handedOff, selfResolved: total - handedOff, avgMessages };
    }

    getActiveSession(conversationId: string) {
        return this.repo.findActiveSession(conversationId);
    }
}
