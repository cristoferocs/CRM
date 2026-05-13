import { z } from "zod";
import { prisma } from "../../../../lib/prisma.js";

export const name = "get_deals";
export const description =
    "Lista os negócios/pedidos em aberto do contato e seus status no funil de vendas.";

export const parametersSchema = z.object({
    includeWon: z.boolean().optional().describe("Incluir negócios ganhos? (padrão: false)"),
    includeLost: z.boolean().optional().describe("Incluir negócios perdidos? (padrão: false)"),
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
    const deals = await prisma.deal.findMany({
        where: {
            contactId: context.contactId,
            orgId: context.orgId,
            isActive: true,
        },
        include: {
            stage: { select: { name: true, isWon: true, isLost: true } },
            pipeline: { select: { name: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 10,
    });

    const filtered = deals.filter((d) => {
        if (!params.includeWon && d.stage.isWon) return false;
        if (!params.includeLost && d.stage.isLost) return false;
        return true;
    });

    if (filtered.length === 0) return "Nenhum negócio encontrado para este contato.";

    return filtered
        .map(
            (d) =>
                `• ${d.title} | Pipeline: ${d.pipeline.name} | Fase: ${d.stage.name}` +
                (d.value ? ` | Valor: R$ ${Number(d.value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : ""),
        )
        .join("\n");
}
