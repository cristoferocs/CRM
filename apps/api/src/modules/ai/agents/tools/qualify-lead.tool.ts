import { z } from "zod";
import { prisma } from "../../../../lib/prisma.js";
import { getIO } from "../../../../websocket/socket.js";
import type { ToolContext, ToolResult } from "../tool-registry.js";

export const name = "qualify_lead";
export const description = "Promove um Lead para Cliente e atualiza seus dados após qualificação bem-sucedida.";
export const when = "Use quando o lead confirmar interesse real, fornecer dados de contato válidos e demonstrar potencial de compra acima do threshold configurado.";
export const requiresConfirmation = false;
export const riskLevel = "low" as const;

export const parametersSchema = z.object({
    qualificationData: z
        .record(z.string(), z.unknown())
        .describe("Dados coletados durante a qualificação (budget, timeline, pain, authority, etc.)"),
    tags: z.array(z.string()).optional().describe("Tags a adicionar ao contato (ex: ['qualificado', 'quente'])"),
    notes: z.string().optional().describe("Notas de qualificação para o time comercial"),
});

export async function execute(
    params: z.infer<typeof parametersSchema>,
    context: ToolContext,
): Promise<ToolResult> {
    const contact = await prisma.contact.findFirst({
        where: { id: context.contactId, orgId: context.orgId },
        select: { id: true, name: true, type: true, tags: true, customFields: true },
    });

    if (!contact) {
        return {
            success: false,
            error: "Contato não encontrado",
            humanReadable: "❌ Contato não encontrado para qualificação.",
        };
    }

    const existingCustomFields = (contact.customFields as Record<string, unknown>) ?? {};
    const existingTags = contact.tags ?? [];
    const newTags = params.tags ?? [];
    const mergedTags = [...new Set([...existingTags, "qualificado", ...newTags])];

    await prisma.contact.update({
        where: { id: context.contactId },
        data: {
            type: "CUSTOMER",
            tags: mergedTags,
            customFields: {
                ...existingCustomFields,
                qualification: {
                    ...params.qualificationData,
                    qualifiedAt: new Date().toISOString(),
                    qualifiedByAgent: context.agentId,
                },
            },
        },
    });

    await prisma.timelineEvent.create({
        data: {
            type: "LEAD_QUALIFIED",
            title: `Lead qualificado pelo agente de IA`,
            description: params.notes ?? "Lead promovido a Cliente após qualificação automática.",
            metadata: {
                agentId: context.agentId,
                qualificationData: params.qualificationData,
                previousType: contact.type,
            } as never,
            contactId: context.contactId,
            orgId: context.orgId,
        },
    });

    const io = getIO();
    if (io) {
        io.to(`org:${context.orgId}`).emit("contact:qualified", {
            contactId: context.contactId,
            contactName: contact.name,
            agentId: context.agentId,
            qualificationData: params.qualificationData,
        });
    }

    const summary = Object.entries(params.qualificationData)
        .map(([k, v]) => `${k}: ${String(v)}`)
        .join(", ");

    return {
        success: true,
        data: { contactId: context.contactId, type: "CUSTOMER" },
        humanReadable:
            `✅ Lead "${contact.name}" qualificado e promovido a Cliente.\n` +
            `Dados coletados: ${summary || "nenhum"}`,
    };
}
