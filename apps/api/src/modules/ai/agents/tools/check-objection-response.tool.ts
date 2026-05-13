import { z } from "zod";
import { prisma } from "../../../../lib/prisma.js";
import type { ToolContext, ToolResult } from "../tool-registry.js";

export const name = "check_objection_response";
export const description =
    "Busca a melhor resposta validada para uma objeção do cliente na base de treinamento da empresa.";
export const when =
    "Use sempre que o cliente apresentar uma objeção (preço, prazo, concorrência, necessidade, autoridade). " +
    "Prefira esta tool a inventar respostas.";
export const requiresConfirmation = false;
export const riskLevel = "low" as const;

export const parametersSchema = z.object({
    objection: z
        .string()
        .min(1)
        .describe("A objeção exata ou parafraseada do cliente (ex: 'tá caro', 'preciso pensar', 'já uso outro sistema')"),
    context: z
        .string()
        .optional()
        .describe("Contexto adicional sobre o cliente ou produto discutido"),
});

export async function execute(
    params: z.infer<typeof parametersSchema>,
    context: ToolContext,
): Promise<ToolResult> {
    // Direct match in AITrainingData
    const objectionResponses = await prisma.aITrainingData.findMany({
        where: {
            orgId: context.orgId,
            type: "OBJECTION_RESPONSE",
            isValidated: true,
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { input: true, output: true },
    });

    if (objectionResponses.length === 0) {
        return {
            success: true,
            data: null,
            humanReadable:
                "ℹ️ Nenhuma resposta de objeção cadastrada para esta organização. " +
                "Responda baseando-se no seu treinamento geral.",
        };
    }

    // Simple keyword matching — find the closest match
    const objLower = params.objection.toLowerCase();
    const scored = objectionResponses.map((r) => {
        const inputLower = r.input.toLowerCase();
        const objWords = objLower.split(/\s+/);
        const matches = objWords.filter((w) => w.length > 3 && inputLower.includes(w)).length;
        return { ...r, score: matches };
    });

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];

    if (!best || best.score === 0) {
        // Return all available as context
        const all = objectionResponses
            .slice(0, 5)
            .map((r) => `Objeção: "${r.input}"\nResposta: ${r.output}`)
            .join("\n---\n");
        return {
            success: true,
            data: { matchedObjection: null, response: null, alternatives: objectionResponses.slice(0, 5) },
            humanReadable:
                `ℹ️ Nenhuma correspondência exata para "${params.objection}".\n\n` +
                `Exemplos disponíveis para referência:\n${all}`,
        };
    }

    return {
        success: true,
        data: { matchedObjection: best.input, response: best.output, confidence: best.score },
        humanReadable:
            `✅ Resposta encontrada para objeção similar a "${params.objection}":\n\n` +
            `**Objeção cadastrada**: "${best.input}"\n` +
            `**Resposta recomendada**: ${best.output}`,
    };
}
