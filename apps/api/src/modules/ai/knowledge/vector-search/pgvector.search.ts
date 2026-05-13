import { KnowledgeRepository } from "../knowledge.repository.js";
import type { SearchResult } from "../knowledge.schema.js";

const repo = new KnowledgeRepository();

/**
 * Searches knowledge chunks using pgvector cosine similarity.
 * Used by STARTER and GROWTH tier organizations.
 */
export async function pgvectorSearch(
    queryVector: number[],
    orgId: string,
    documentIds: string[],
    limit: number,
): Promise<SearchResult[]> {
    return repo.vectorSearch(queryVector, orgId, documentIds, limit);
}
