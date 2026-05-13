import { z } from "zod";
import { prisma } from "../../../../lib/prisma.js";
import { getIO } from "../../../../websocket/socket.js";
import type { ToolContext, ToolResult } from "../tool-registry.js";

export const name = "create_deal";
export const description = "Cria um novo negócio (Deal) no funil de vendas para o contato atual.";
export const when = "Use quando o cliente demonstrar intenção de compra clara e ainda não houver um deal aberto.";
export const requiresConfirmation = false;
export const riskLevel = "medium" as const;

export const parametersSchema = z.object({
    title: z.string().min(1).describe("Título do negócio (ex: 'Proposta Plano Pro - João')"),
    value: z.number().positive().optional().describe("Valor estimado em BRL"),
    pipelineId: z.string().optional().describe("ID do pipeline. Se omitido, usa o pipeline padrão."),
    notes: z.string().optional().describe("Observações iniciais sobre o negócio"),
});

export async function execute(
    params: z.infer<typeof parametersSchema>,
    context: ToolContext,
): Promise<ToolResult> {
    // Resolve pipeline: use provided or fall back to default
    let pipelineId = params.pipelineId;
    if (!pipelineId) {
        const defaultPipeline = await prisma.pipeline.findFirst({
            where: { orgId: context.orgId, isDefault: true },
            select: { id: true },
        });
        if (!defaultPipeline) {
            return {
                success: false,
                error: "Nenhum pipeline padrão encontrado",
                humanReadable: "❌ Nenhum pipeline padrão configurado. Crie um pipeline primeiro.",
            };
        }
        pipelineId = defaultPipeline.id;
    }

    // Get first stage of the pipeline
    const firstStage = await prisma.pipelineStage.findFirst({
        where: { pipelineId },
        orderBy: { order: "asc" },
        select: { id: true, name: true },
    });
    if (!firstStage) {
        return {
            success: false,
            error: "Pipeline sem etapas configuradas",
            humanReadable: "❌ O pipeline selecionado não possui etapas.",
        };
    }

    // Resolve owner: first active user of the org
    const owner = await prisma.user.findFirst({
        where: { orgId: context.orgId, isActive: true },
        orderBy: { createdAt: "asc" },
        select: { id: true },
    });
    if (!owner) {
        return {
            success: false,
            error: "Nenhum usuário ativo encontrado na organização",
            humanReadable: "❌ Nenhum usuário ativo para atribuir o negócio.",
        };
    }

    const deal = await prisma.deal.create({
        data: {
            title: params.title,
            value: params.value,
            contactId: context.contactId,
            orgId: context.orgId,
            pipelineId,
            stageId: firstStage.id,
            ownerId: owner.id,
            customFields: params.notes ? { agentNotes: params.notes } : {},
        },
        select: { id: true, title: true },
    });

    await prisma.timelineEvent.create({
        data: {
            type: "DEAL_CREATED",
            title: `Negócio "${params.title}" criado pelo agente de IA`,
            description: params.notes,
            metadata: { dealId: deal.id, agentId: context.agentId, stage: firstStage.name },
            contactId: context.contactId,
            orgId: context.orgId,
        },
    });

    const io = getIO();
    if (io) {
        io.to(`org:${context.orgId}`).emit("deal:created", {
            dealId: deal.id,
            title: deal.title,
            triggeredBy: "ai_agent",
            agentId: context.agentId,
        });
    }

    return {
        success: true,
        data: { dealId: deal.id },
        humanReadable: `✅ Negócio "${params.title}" criado com sucesso na etapa "${firstStage.name}" (ID: ${deal.id})`,
    };
}
