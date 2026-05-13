import { z } from "zod";
import { prisma } from "../../../../lib/prisma.js";

export const name = "get_payments";
export const description =
    "Verifica pagamentos do contato: em aberto, pagos e vencidos.";

export const parametersSchema = z.object({
    status: z
        .enum(["PENDING", "PAID", "FAILED", "REFUNDED", "CANCELLED", "ALL"])
        .optional()
        .default("ALL")
        .describe("Filtrar por status do pagamento"),
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
    const where: Record<string, unknown> = {
        contactId: context.contactId,
        orgId: context.orgId,
    };

    if (params.status !== "ALL") {
        where.status = params.status;
    }

    const payments = await prisma.payment.findMany({
        where: where as never,
        orderBy: { createdAt: "desc" },
        take: 10,
    });

    if (payments.length === 0) return "Nenhum pagamento encontrado para este contato.";

    const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

    return payments
        .map((p) => {
            const overdue =
                p.status === "PENDING" && p.dueAt && p.dueAt < new Date()
                    ? " ⚠️ VENCIDO"
                    : "";
            return (
                `• ${fmt.format(Number(p.amount))} | ${p.gateway} | ${p.status}${overdue}` +
                (p.dueAt ? ` | Venc: ${p.dueAt.toLocaleDateString("pt-BR")}` : "") +
                (p.description ? ` | ${p.description}` : "")
            );
        })
        .join("\n");
}
