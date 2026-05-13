import { z } from "zod";
import { prisma } from "../../../../lib/prisma.js";
import { getIO } from "../../../../websocket/socket.js";

export const name = "update_deal_stage";
export const description =
    "Move um negócio para uma fase do funil quando o cliente demonstra interesse ou avança no processo de compra.";

export const parametersSchema = z.object({
    dealId: z.string().describe("ID do negócio a ser movido"),
    stageId: z.string().describe("ID da fase de destino"),
    reason: z.string().describe("Motivo da mudança de fase"),
});

export interface ToolContext {
    orgId: string;
    contactId: string;
    conversationId: string;
    agentId: string;
}

export async function execute(
    params: z.infer<typeof parametersSchema>,
    context: ToolContext,
): Promise<string> {
    const deal = await prisma.deal.findFirst({
        where: { id: params.dealId, orgId: context.orgId },
        include: { stage: { select: { name: true } } },
    });
    if (!deal) return `Negócio ${params.dealId} não encontrado.`;

    const targetStage = await prisma.pipelineStage.findUnique({
        where: { id: params.stageId },
        select: { name: true, pipelineId: true },
    });
    if (!targetStage) return `Fase ${params.stageId} não encontrada.`;

    const previousStageName = deal.stage.name;

    await prisma.deal.update({
        where: { id: params.dealId },
        data: { stageId: params.stageId },
    });

    // Register timeline event
    await prisma.timelineEvent.create({
        data: {
            type: "DEAL_STAGE_CHANGED",
            title: `Fase alterada para "${targetStage.name}" pelo agente de IA`,
            description: params.reason,
            metadata: {
                dealId: params.dealId,
                fromStage: previousStageName,
                toStage: targetStage.name,
                agentId: context.agentId,
            },
            contactId: context.contactId,
            orgId: context.orgId,
        },
    });

    // Notify via socket
    const io = getIO();
    if (io) {
        io.to(`org:${context.orgId}`).emit("deal:stage_changed", {
            dealId: params.dealId,
            stageId: params.stageId,
            stageName: targetStage.name,
            triggeredBy: "ai_agent",
        });
    }

    return `✅ Negócio "${deal.title}" movido de "${previousStageName}" para "${targetStage.name}".\nMotivo: ${params.reason}`;
}
