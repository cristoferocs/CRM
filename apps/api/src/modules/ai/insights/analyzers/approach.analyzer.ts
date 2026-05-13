import { prisma } from "../../../../lib/prisma.js";
import { getAIProvider } from "../../ai.factory.js";

export interface ApproachInsight {
    winningPatterns: string[];
    losingPatterns: string[];
    recommendations: string[];
    keyDifferences: string;
}

const APPROACH_PROMPT = `Você é um especialista em metodologias de vendas.
Abaixo estão dois conjuntos de conversas: DEALS GANHOS e DEALS PERDIDOS.
Analise os padrões e retorne um JSON com:
{
  "winningPatterns": ["padrões observados nos deals ganhos"],
  "losingPatterns": ["padrões observados nos deals perdidos"],
  "keyDifferences": "resumo das principais diferenças identificadas",
  "recommendations": ["recomendações concretas para melhorar a taxa de conversão"]
}
Retorne APENAS o JSON.`;

/**
 * Compara deals ganhos vs perdidos do último trimestre e identifica
 * padrões de abordagem vencedores e perdedores.
 */
export async function learnBestApproaches(orgId: string): Promise<ApproachInsight> {
    const since = new Date(Date.now() - 90 * 86_400_000); // last 90 days

    const [wonDeals, lostDeals] = await Promise.all([
        prisma.deal.findMany({
            where: { orgId, closedAt: { gte: since } },
            include: {
                stage: { select: { isWon: true, isLost: true } },
                contact: {
                    include: {
                        conversations: {
                            include: {
                                messages: { orderBy: { sentAt: "asc" }, take: 30 },
                            },
                        },
                    },
                },
            },
            take: 20,
        }),
        prisma.deal.findMany({
            where: { orgId, closedAt: { gte: since } },
            include: {
                stage: { select: { isWon: true, isLost: true } },
                contact: {
                    include: {
                        conversations: {
                            include: {
                                messages: { orderBy: { sentAt: "asc" }, take: 30 },
                            },
                        },
                    },
                },
            },
            take: 20,
        }),
    ]);

    const wonFiltered = wonDeals.filter((d) => d.stage.isWon);
    const lostFiltered = lostDeals.filter((d) => d.stage.isLost);

    if (wonFiltered.length === 0 && lostFiltered.length === 0) {
        return {
            winningPatterns: [],
            losingPatterns: [],
            keyDifferences: "Dados insuficientes para análise.",
            recommendations: [],
        };
    }

    function summarizeDeals(deals: typeof wonFiltered): string {
        return deals
            .map((d) => {
                const messages = d.contact.conversations.flatMap((c) => c.messages);
                const transcript = messages
                    .slice(0, 10)
                    .map((m) => (m.direction === "INBOUND" ? "Cliente" : "Vendedor") + ": " + m.content)
                    .join("\n");
                return `[Deal: ${d.title}]\n${transcript || "(sem mensagens)"}`;
            })
            .join("\n\n---\n\n");
    }

    const content =
        `## DEALS GANHOS (${wonFiltered.length})\n\n` +
        summarizeDeals(wonFiltered) +
        `\n\n## DEALS PERDIDOS (${lostFiltered.length})\n\n` +
        summarizeDeals(lostFiltered);

    const provider = getAIProvider();
    const response = await provider.analyzeDocument(content, APPROACH_PROMPT);

    let insight: ApproachInsight;
    try {
        const jsonStr = response.replace(/^```json\s*/m, "").replace(/```\s*$/m, "").trim();
        insight = JSON.parse(jsonStr) as ApproachInsight;
    } catch {
        insight = {
            winningPatterns: [],
            losingPatterns: [],
            keyDifferences: response.slice(0, 500),
            recommendations: [],
        };
    }

    // Persist as AIInsight
    await prisma.aIInsight.create({
        data: {
            orgId,
            type: "BEST_APPROACH",
            title: `Melhores Abordagens — ${new Date().toLocaleDateString("pt-BR")}`,
            content: JSON.stringify(insight),
            confidence: 0.80,
            sourceConversationIds: [],
            metadata: { wonCount: wonFiltered.length, lostCount: lostFiltered.length },
        },
    });

    return insight;
}
