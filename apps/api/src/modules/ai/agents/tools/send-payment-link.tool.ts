import { z } from "zod";
import { prisma } from "../../../../lib/prisma.js";
import { getIO } from "../../../../websocket/socket.js";
import { PaymentsService } from "../../../payments/payments.service.js";
import type { GatewayEnumValue } from "../../../payments/payments.schema.js";

export const name = "send_payment_link";
export const description =
    "Gera e envia link de pagamento para o cliente. Sempre registra uma Activity e notifica o agente humano.";

export const parametersSchema = z.object({
    amount: z.number().positive().describe("Valor em BRL"),
    description: z.string().min(1).describe("Descrição do pagamento"),
    gateway: z
        .enum(["MERCADOPAGO", "STRIPE", "PAYPAL", "INFINITYPAY"])
        .default("MERCADOPAGO")
        .describe("Gateway de pagamento"),
});

export interface ToolContext {
    orgId: string;
    contactId: string;
    conversationId: string;
    agentId: string;
}

const paymentsService = new PaymentsService();

export async function execute(
    params: z.infer<typeof parametersSchema>,
    context: ToolContext,
): Promise<string> {
    const contact = await prisma.contact.findFirst({
        where: { id: context.contactId, orgId: context.orgId },
        select: { name: true, email: true },
    });

    const deal = await prisma.deal.findFirst({
        where: { contactId: context.contactId, orgId: context.orgId, isActive: true },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
    });

    const systemUser = await prisma.user.findFirst({
        where: { orgId: context.orgId },
        orderBy: { createdAt: "asc" },
        select: { id: true },
    });

    let paymentLink = "";
    try {
        const payment = await paymentsService.createPayment(
            {
                gateway: params.gateway as GatewayEnumValue,
                type: "SINGLE",
                amount: params.amount,
                currency: "BRL",
                description: params.description,
                payerEmail: contact?.email ?? undefined,
                payerName: contact?.name,
                contactId: context.contactId,
                dealId: deal?.id,
                metadata: { createdByAgent: context.agentId, conversationId: context.conversationId },
            },
            context.orgId,
            systemUser?.id ?? "system",
        );
        paymentLink = (payment as { paymentLink?: string }).paymentLink ?? "";
    } catch {
        return "Não foi possível gerar o link de pagamento. Transfira para um atendente humano.";
    }

    // Always register activity and alert human agent
    if (systemUser) {
        await prisma.activity.create({
            data: {
                type: "NOTE",
                title: "Link de pagamento enviado pelo agente de IA",
                description: `Valor: R$ ${params.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} | ${params.description}`,
                dealId: deal?.id ?? undefined,
                contactId: context.contactId,
                userId: systemUser.id,
                orgId: context.orgId,
            },
        });
    }

    const io = getIO();
    if (io) {
        io.to(`org:${context.orgId}`).emit("agent:payment_link_sent", {
            conversationId: context.conversationId,
            contactId: context.contactId,
            amount: params.amount,
            gateway: params.gateway,
            agentId: context.agentId,
        });
    }

    if (!paymentLink) {
        return `Pagamento criado no ${params.gateway}. Verifique o painel para o link.`;
    }

    return `💳 Link de pagamento gerado!\nValor: R$ ${params.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\nDescrição: ${params.description}\nLink: ${paymentLink}`;
}
