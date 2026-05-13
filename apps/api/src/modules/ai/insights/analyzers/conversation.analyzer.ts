import { prisma } from "../../../../lib/prisma.js";
import { getAIProvider } from "../../ai.factory.js";

export interface ConversationAnalysis {
    sentiment: "positive" | "neutral" | "negative";
    summary: string;
    objections: string[];
    keyMoments: string[];
    suggestedNextAction: string;
    coachingTips: string[];
}

const ANALYSIS_PROMPT = `Você é um especialista em análise de conversas de vendas e suporte.
Analise a conversa abaixo e retorne um objeto JSON com EXATAMENTE esta estrutura:
{
  "sentiment": "positive" | "neutral" | "negative",
  "summary": "resumo da conversa em até 3 linhas",
  "objections": ["lista de objeções levantadas pelo cliente"],
  "keyMoments": ["momentos decisivos da conversa"],
  "suggestedNextAction": "próxima ação recomendada para o vendedor/atendente",
  "coachingTips": ["o que o vendedor poderia ter feito melhor"]
}
Retorne APENAS o JSON, sem explicações adicionais.`;

/**
 * Analisa uma conversa e salva insights no banco.
 */
export async function analyzeConversation(
    conversationId: string,
    orgId: string,
): Promise<ConversationAnalysis> {
    const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, orgId },
        include: {
            messages: { orderBy: { sentAt: "asc" }, take: 100 },
            contact: { select: { name: true } },
        },
    });

    if (!conversation) {
        const err = new Error("Conversa não encontrada") as Error & { statusCode: number };
        err.statusCode = 404;
        throw err;
    }

    if (conversation.messages.length === 0) {
        const err = new Error("Conversa sem mensagens") as Error & { statusCode: number };
        err.statusCode = 422;
        throw err;
    }

    // Build transcript
    const transcript = conversation.messages
        .map((m) => {
            const speaker =
                m.direction === "INBOUND" ? `${conversation.contact.name} (cliente)` : "Agente";
            return `${speaker}: ${m.content}`;
        })
        .join("\n");

    const provider = getAIProvider();
    const response = await provider.analyzeDocument(transcript, ANALYSIS_PROMPT);

    // Parse JSON response — strip possible markdown fences
    const jsonStr = response.replace(/^```json\s*/m, "").replace(/```\s*$/m, "").trim();
    let analysis: ConversationAnalysis;
    try {
        analysis = JSON.parse(jsonStr) as ConversationAnalysis;
    } catch {
        // Fallback: return minimal structure
        analysis = {
            sentiment: "neutral",
            summary: response.slice(0, 300),
            objections: [],
            keyMoments: [],
            suggestedNextAction: "",
            coachingTips: [],
        };
    }

    // Persist as AIInsights
    const insightData = {
        orgId,
        sourceConversationIds: [conversationId],
        metadata: { conversationId },
        confidence: 0.85,
    };

    await prisma.$transaction([
        prisma.aIInsight.create({
            data: {
                ...insightData,
                type: "SUMMARY",
                title: `Resumo — Conversa ${conversationId.slice(0, 8)}`,
                content: analysis.summary,
            },
        }),
        ...analysis.objections.map((obj) =>
            prisma.aIInsight.create({
                data: {
                    ...insightData,
                    type: "OBJECTION",
                    title: "Objeção identificada",
                    content: obj,
                },
            }),
        ),
        ...(analysis.coachingTips.length > 0
            ? [
                prisma.aIInsight.create({
                    data: {
                        ...insightData,
                        type: "COACHING",
                        title: `Coaching — Conversa ${conversationId.slice(0, 8)}`,
                        content: analysis.coachingTips.join("\n"),
                    },
                }),
            ]
            : []),
    ]);

    return analysis;
}
