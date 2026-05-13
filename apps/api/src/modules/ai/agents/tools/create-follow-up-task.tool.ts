import { z } from "zod";
import { prisma } from "../../../../lib/prisma.js";
import { getIO } from "../../../../websocket/socket.js";
import type { ToolContext, ToolResult } from "../tool-registry.js";

export const name = "create_follow_up_task";
export const description =
    "Cria uma tarefa de follow-up atribuída a um vendedor humano com instruções detalhadas do agente.";
export const when =
    "Use ao encerrar uma sessão bem-sucedida, quando o cliente pediu para ser contactado mais tarde, ou quando um próximo passo humano é necessário (ex: enviar contrato, ligar para negociar).";
export const requiresConfirmation = false;
export const riskLevel = "low" as const;

export const parametersSchema = z.object({
    title: z.string().min(1).describe("Título da tarefa (ex: 'Ligar para João amanhã 14h')"),
    description: z
        .string()
        .min(1)
        .describe("Instruções detalhadas: contexto da conversa, o que foi discutido, próximo passo recomendado"),
    dueInHours: z
        .number()
        .int()
        .min(1)
        .max(720)
        .default(24)
        .describe("Em quantas horas a tarefa deve ser realizada (padrão: 24)"),
    priority: z
        .enum(["low", "normal", "high", "urgent"])
        .default("normal")
        .describe("Prioridade da tarefa"),
    dealId: z.string().optional().describe("ID do negócio associado, se houver"),
});

export async function execute(
    params: z.infer<typeof parametersSchema>,
    context: ToolContext,
): Promise<ToolResult> {
    // Assign to the first available agent of the org
    const assignee = await prisma.user.findFirst({
        where: {
            orgId: context.orgId,
            isActive: true,
            role: { in: ["SELLER", "MANAGER", "ADMIN"] },
        },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true },
    });

    if (!assignee) {
        return {
            success: false,
            error: "Nenhum vendedor disponível para atribuir a tarefa",
            humanReadable: "❌ Nenhum vendedor ativo encontrado na organização.",
        };
    }

    const dueAt = new Date();
    dueAt.setHours(dueAt.getHours() + params.dueInHours);

    const activity = await prisma.activity.create({
        data: {
            type: "TASK",
            title: params.title,
            description:
                `[Criado pelo Agente de IA]\n\n${params.description}\n\n` +
                `Prioridade: ${params.priority}\nID do Agente: ${context.agentId}`,
            dueAt,
            contactId: context.contactId,
            dealId: params.dealId,
            userId: assignee.id,
            orgId: context.orgId,
        },
        select: { id: true },
    });

    await prisma.timelineEvent.create({
        data: {
            type: "FOLLOW_UP_SCHEDULED",
            title: `Follow-up criado: "${params.title}"`,
            description: `Atribuído a ${assignee.name}. Prazo: ${dueAt.toLocaleString("pt-BR")}`,
            metadata: {
                activityId: activity.id,
                assigneeId: assignee.id,
                agentId: context.agentId,
                priority: params.priority,
            },
            contactId: context.contactId,
            orgId: context.orgId,
        },
    });

    const io = getIO();
    if (io) {
        io.to(`org:${context.orgId}`).emit("task:created", {
            activityId: activity.id,
            title: params.title,
            assigneeId: assignee.id,
            contactId: context.contactId,
            dealId: params.dealId,
            dueAt: dueAt.toISOString(),
            priority: params.priority,
            createdByAgent: context.agentId,
        });
    }

    return {
        success: true,
        data: { activityId: activity.id, assigneeId: assignee.id, dueAt: dueAt.toISOString() },
        humanReadable:
            `✅ Tarefa criada: "${params.title}"\n` +
            `Atribuída a: ${assignee.name}\n` +
            `Prazo: ${dueAt.toLocaleString("pt-BR")}\n` +
            `Prioridade: ${params.priority}`,
    };
}
