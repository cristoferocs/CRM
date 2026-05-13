import { z } from "zod";
import { KnowledgeService } from "../../knowledge/knowledge.service.js";

export const name = "search_knowledge";
export const description =
    "Busca informações na base de conhecimento da empresa (produtos, políticas, FAQs, preços, processos).";

export const parametersSchema = z.object({
    query: z.string().min(1).describe("O que você quer buscar na base de conhecimento"),
    limit: z.number().int().min(1).max(8).optional().default(4).describe("Número de resultados"),
});

export interface ToolContext {
    orgId: string;
    contactId: string;
    conversationId: string;
    agentId: string;
    knowledgeBaseIds?: string[];
}

const ks = new KnowledgeService();

export async function execute(
    params: z.infer<typeof parametersSchema>,
    context: ToolContext,
): Promise<string> {
    const results = await ks.search(
        {
            query: params.query,
            knowledgeBaseIds: context.knowledgeBaseIds ?? [],
            limit: params.limit,
        },
        context.orgId,
    );

    if (results.length === 0) {
        return `Nenhum resultado encontrado na base de conhecimento para: "${params.query}"`;
    }

    return results
        .map((r, i) => `[${i + 1}] ${r.content}`)
        .join("\n---\n");
}
