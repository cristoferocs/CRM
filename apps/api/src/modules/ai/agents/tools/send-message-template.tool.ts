import { z } from "zod";
import { prisma } from "../../../../lib/prisma.js";
import { getIO } from "../../../../websocket/socket.js";
import type { ToolContext, ToolResult } from "../tool-registry.js";

export const name = "send_message_template";
export const description =
    "Envia um template de mensagem WhatsApp aprovado pelo Meta para o cliente. " +
    "Use apenas templates previamente cadastrados no sistema.";
export const when =
    "Use para reativação de contatos inativos, confirmações de agendamento, envio de propostas formais ou follow-ups padronizados.";
export const requiresConfirmation = false;
export const riskLevel = "medium" as const;

export const parametersSchema = z.object({
    templateName: z
        .string()
        .min(1)
        .describe("Nome do template cadastrado (ex: 'proposta_comercial', 'confirmacao_reuniao')"),
    variables: z
        .record(z.string(), z.string())
        .optional()
        .describe("Variáveis para preencher no template, ex: { nome: 'João', produto: 'Plano Pro' }"),
    reason: z.string().describe("Por que este template está sendo enviado agora"),
});

export async function execute(
    params: z.infer<typeof parametersSchema>,
    context: ToolContext,
): Promise<ToolResult> {
    const template = await prisma.messageTemplate.findFirst({
        where: { orgId: context.orgId, name: params.templateName, status: "APPROVED" },
        select: { id: true, name: true, body: true, category: true },
    });

    if (!template) {
        return {
            success: false,
            error: `Template "${params.templateName}" não encontrado ou não aprovado`,
            humanReadable:
                `❌ Template "${params.templateName}" não existe ou está pendente de aprovação.\n` +
                `Verifique os templates disponíveis em Configurações > Templates.`,
        };
    }

    // Render template body with variables
    let renderedBody = template.body;
    if (params.variables) {
        for (const [key, value] of Object.entries(params.variables)) {
            renderedBody = renderedBody.replaceAll(`{{${key}}}`, value);
        }
    }

    // Save as an outbound message in the conversation
    await prisma.message.create({
        data: {
            content: renderedBody,
            type: "TEMPLATE",
            direction: "OUTBOUND",
            status: "SENT",
            conversationId: context.conversationId,
            metadata: {
                templateId: template.id,
                templateName: params.templateName,
                variables: params.variables ?? {},
                sentByAgent: context.agentId,
                reason: params.reason,
            },
        },
    });

    await prisma.conversation.update({
        where: { id: context.conversationId },
        data: { lastMessageAt: new Date() },
    });

    await prisma.timelineEvent.create({
        data: {
            type: "TEMPLATE_SENT",
            title: `Template "${params.templateName}" enviado pelo agente`,
            description: params.reason,
            metadata: {
                templateId: template.id,
                agentId: context.agentId,
                variables: params.variables,
            },
            contactId: context.contactId,
            orgId: context.orgId,
        },
    });

    const io = getIO();
    if (io) {
        io.to(`conversation:${context.conversationId}`).emit("message:new", {
            conversationId: context.conversationId,
            content: renderedBody,
            type: "TEMPLATE",
            direction: "OUTBOUND",
            sender: "bot",
        });
    }

    return {
        success: true,
        data: { templateId: template.id, renderedBody },
        humanReadable:
            `✅ Template "${params.templateName}" enviado com sucesso.\nConteúdo: ${renderedBody.slice(0, 200)}${renderedBody.length > 200 ? "..." : ""}`,
    };
}
