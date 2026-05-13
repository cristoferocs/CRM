import { z } from "zod";
import { prisma } from "../../../../lib/prisma.js";

export const name = "get_service_status";
export const description =
    "Verifica o status atual de um serviço, pedido ou processo do cliente com as atividades mais recentes.";

export const parametersSchema = z.object({
    dealId: z.string().optional().describe("ID do negócio específico (opcional; usa o mais recente se omitido)"),
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
    const deal = params.dealId
        ? await prisma.deal.findFirst({
            where: { id: params.dealId, orgId: context.orgId },
            include: {
                stage: { select: { name: true, isWon: true, isLost: true } },
                activities: {
                    orderBy: { createdAt: "desc" },
                    take: 5,
                    select: { type: true, title: true, createdAt: true, completedAt: true },
                },
            },
        })
        : await prisma.deal.findFirst({
            where: { contactId: context.contactId, orgId: context.orgId, isActive: true },
            orderBy: { updatedAt: "desc" },
            include: {
                stage: { select: { name: true, isWon: true, isLost: true } },
                activities: {
                    orderBy: { createdAt: "desc" },
                    take: 5,
                    select: { type: true, title: true, createdAt: true, completedAt: true },
                },
            },
        });

    if (!deal) return "Nenhum pedido ou negócio ativo encontrado para este cliente.";

    const statusLabel = deal.stage.isWon
        ? "✅ Concluído"
        : deal.stage.isLost
            ? "❌ Perdido"
            : `🔄 Em andamento — fase: ${deal.stage.name}`;

    const activityLines = deal.activities.map(
        (a) =>
            `• [${a.type}] ${a.title} — ${a.createdAt.toLocaleDateString("pt-BR")}` +
            (a.completedAt ? " ✓" : ""),
    );

    return [
        `Negócio: ${deal.title}`,
        `Status: ${statusLabel}`,
        deal.value
            ? `Valor: R$ ${Number(deal.value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
            : "",
        "",
        "Atividades recentes:",
        ...activityLines,
    ]
        .filter(Boolean)
        .join("\n");
}
