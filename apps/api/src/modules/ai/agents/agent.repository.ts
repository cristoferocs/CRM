import { prisma } from "../../../lib/prisma.js";
import type { CreateAgentInput, UpdateAgentInput } from "./agent.schema.js";

export class AgentRepository {
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

    update(id: string, data: UpdateAgentInput) {
        return prisma.aIAgent.update({ where: { id }, data: data as never });
    }

    delete(id: string, orgId: string) {
        return prisma.aIAgent.update({
            where: { id },
            data: { isActive: false },
        });
    }

    // Sessions
    createSession(data: { agentId: string; conversationId: string; orgId: string }) {
        return prisma.aIAgentSession.create({ data });
    }

    findActiveSession(conversationId: string) {
        return prisma.aIAgentSession.findFirst({
            where: { conversationId, status: "ACTIVE" },
            include: { agent: true },
        });
    }

    incrementSessionMessages(sessionId: string) {
        return prisma.aIAgentSession.update({
            where: { id: sessionId },
            data: { messagesHandled: { increment: 1 } },
        });
    }

    endSession(sessionId: string, reason?: string) {
        return prisma.aIAgentSession.update({
            where: { id: sessionId },
            data: {
                status: reason ? "HANDOFF" : "ENDED",
                handoffReason: reason,
                endedAt: new Date(),
            },
        });
    }
}
