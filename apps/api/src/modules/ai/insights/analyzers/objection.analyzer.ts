import { prisma } from "../../../../lib/prisma.js";
import { getAIProvider, getEmbeddingProvider } from "../../ai.factory.js";

export interface ObjectionCluster {
    title: string;
    frequency: number;
    examples: string[];
    bestResponses: string[];
}

const CLUSTER_PROMPT = `Você é um especialista em vendas. Abaixo estão objeções reais de clientes.
Agrupe-as por tema, identifique as melhores respostas para cada grupo e retorne um JSON com:
[
  {
    "title": "título do grupo de objeção",
    "frequency": número de ocorrências,
    "examples": ["exemplos reais"],
    "bestResponses": ["respostas sugeridas eficazes"]
  }
]
Retorne APENAS o JSON.`;

/**
 * Agrupa objeções por similaridade semântica usando embeddings e gera
 * respostas aprendidas para cada cluster.
 */
export async function learnObjections(
    orgId: string,
    period = "30d",
): Promise<ObjectionCluster[]> {
    const days = parsePeriodDays(period);
    const since = new Date(Date.now() - days * 86_400_000);

    const insights = await prisma.aIInsight.findMany({
        where: {
            orgId,
            type: "OBJECTION",
            createdAt: { gte: since },
        },
        select: { id: true, content: true },
    });

    if (insights.length === 0) return [];

    const texts = insights.map((i: { id: string; content: string }) => i.content);

    // Generate embeddings for clustering
    const embeddingProvider = getEmbeddingProvider();
    const vectors = await embeddingProvider.embedBatch(texts);

    // Simple cosine-based clustering (greedy)
    const clusters = clusterByCosine(texts, vectors, 0.82);

    // Use AI to generate titles and best responses for each cluster
    const clusterText = clusters
        .map((c, i) => `Grupo ${i + 1} (${c.length} itens):\n${c.join("\n")}`)
        .join("\n\n");

    const provider = getAIProvider();
    const response = await provider.analyzeDocument(clusterText, CLUSTER_PROMPT);

    let result: ObjectionCluster[];
    try {
        const jsonStr = response.replace(/^```json\s*/m, "").replace(/```\s*$/m, "").trim();
        result = JSON.parse(jsonStr) as ObjectionCluster[];
    } catch {
        result = clusters.map((c) => ({
            title: c[0]?.slice(0, 80) ?? "Objeção",
            frequency: c.length,
            examples: c.slice(0, 3),
            bestResponses: [],
        }));
    }

    // Persist as training data
    for (const cluster of result) {
        if (cluster.bestResponses.length > 0) {
            await prisma.aITrainingData.create({
                data: {
                    orgId,
                    type: "OBJECTION_RESPONSE",
                    input: cluster.examples.join("\n"),
                    output: cluster.bestResponses.join("\n"),
                },
            });
        }
    }

    return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parsePeriodDays(period: string): number {
    const match = period.match(/^(\d+)(d|w|m)$/);
    if (!match) return 30;
    const value = parseInt(match[1]!, 10);
    switch (match[2]) {
        case "d": return value;
        case "w": return value * 7;
        case "m": return value * 30;
        default: return 30;
    }
}

function cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i]! * b[i]!;
        normA += a[i]! ** 2;
        normB += b[i]! ** 2;
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Greedy cosine similarity clustering.
 * Returns array of clusters (each cluster is an array of texts).
 */
function clusterByCosine(
    texts: string[],
    vectors: number[][],
    threshold: number,
): string[][] {
    const assigned = new Array<boolean>(texts.length).fill(false);
    const clusters: string[][] = [];

    for (let i = 0; i < texts.length; i++) {
        if (assigned[i]) continue;

        const cluster: string[] = [texts[i]!];
        assigned[i] = true;

        for (let j = i + 1; j < texts.length; j++) {
            if (assigned[j]) continue;
            if (cosineSimilarity(vectors[i]!, vectors[j]!) >= threshold) {
                cluster.push(texts[j]!);
                assigned[j] = true;
            }
        }

        clusters.push(cluster);
    }

    return clusters;
}
