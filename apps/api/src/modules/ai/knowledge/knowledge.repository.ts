import { prisma } from "../../../lib/prisma.js";
import type { SearchResult } from "./knowledge.schema.js";

// ---------------------------------------------------------------------------
// KnowledgeBase
// ---------------------------------------------------------------------------

export class KnowledgeRepository {
    createBase(data: {
        name: string;
        description?: string;
        type: string;
        orgId: string;
    }) {
        return prisma.knowledgeBase.create({ data: data as never });
    }

    listBases(orgId: string) {
        return prisma.knowledgeBase.findMany({
            where: { orgId, isActive: true },
            include: { _count: { select: { documents: true } } },
            orderBy: { createdAt: "desc" },
        });
    }

    findBase(id: string, orgId: string) {
        return prisma.knowledgeBase.findFirst({
            where: { id, orgId },
            include: {
                documents: {
                    orderBy: { createdAt: "desc" },
                },
            },
        });
    }

    deleteBase(id: string, orgId: string) {
        return prisma.knowledgeBase.deleteMany({ where: { id, orgId } });
    }

    // -------------------------------------------------------------------------
    // Documents
    // -------------------------------------------------------------------------

    createDocument(data: {
        title: string;
        content: string;
        sourceUrl?: string;
        sourceType: string;
        knowledgeBaseId: string;
        orgId: string;
        metadata?: Record<string, unknown>;
    }) {
        return prisma.knowledgeDocument.create({ data: data as never });
    }

    findDocument(id: string, orgId: string) {
        return prisma.knowledgeDocument.findFirst({ where: { id, orgId } });
    }

    updateDocument(
        id: string,
        data: { status?: string; chunkCount?: number; content?: string },
    ) {
        return prisma.knowledgeDocument.update({ where: { id }, data: data as never });
    }

    deleteDocument(id: string, orgId: string) {
        return prisma.knowledgeDocument.deleteMany({ where: { id, orgId } });
    }

    // -------------------------------------------------------------------------
    // Chunks
    // -------------------------------------------------------------------------

    /**
     * Upserts a batch of chunks for a document.
     * Uses createMany since pgvector vectors can't be updated via Prisma easily.
     */
    async createChunks(
        chunks: Array<{
            content: string;
            chunkIndex: number;
            documentId: string;
            orgId: string;
            vector: number[];
            metadata?: Record<string, unknown>;
        }>,
    ): Promise<void> {
        if (chunks.length === 0) return;

        // Delete old chunks first to allow re-indexing
        await prisma.knowledgeChunk.deleteMany({
            where: { documentId: chunks[0]!.documentId },
        });

        // Insert via raw SQL so we can supply vector literals
        const values = chunks.map((c, i) => {
            const vectorLiteral = `'[${c.vector.join(",")}]'::vector`;
            return `($${i * 5 + 1}::text, $${i * 5 + 2}::int, $${i * 5 + 3}::text, $${i * 5 + 4}::text, ${vectorLiteral}, $${i * 5 + 5}::jsonb, NOW())`;
        });

        const flatParams: (string | number | Record<string, unknown>)[] = [];
        for (const c of chunks) {
            flatParams.push(
                c.content,
                c.chunkIndex,
                c.documentId,
                c.orgId,
                c.metadata ?? {},
            );
        }

        await prisma.$executeRawUnsafe(
            `INSERT INTO knowledge_chunks (content, "chunkIndex", "documentId", "orgId", "embeddingVector", metadata, "createdAt")
             VALUES ${values.join(",")}`,
            ...flatParams,
        );
    }

    /**
     * Vector similarity search via pgvector cosine distance operator.
     */
    async vectorSearch(
        queryVector: number[],
        orgId: string,
        documentIds: string[],
        limit: number,
    ): Promise<SearchResult[]> {
        if (documentIds.length === 0) return [];

        const vectorLiteral = `[${queryVector.join(",")}]`;
        const idPlaceholders = documentIds
            .map((_, i) => `$${i + 3}`)
            .join(",");

        const rows = await prisma.$queryRawUnsafe<
            Array<{
                id: string;
                content: string;
                documentId: string;
                title: string;
                score: number;
            }>
        >(
            `SELECT
                kc.id,
                kc.content,
                kc."documentId",
                kd.title,
                1 - (kc."embeddingVector" <=> $1::vector) AS score
             FROM knowledge_chunks kc
             JOIN knowledge_documents kd ON kd.id = kc."documentId"
             WHERE kc."orgId" = $2
               AND kc."documentId" IN (${idPlaceholders})
               AND kc."embeddingVector" IS NOT NULL
             ORDER BY score DESC
             LIMIT ${limit}`,
            vectorLiteral,
            orgId,
            ...documentIds,
        );

        return rows.map((r) => ({
            chunkId: r.id,
            documentId: r.documentId,
            documentTitle: r.title,
            content: r.content,
            score: r.score,
        }));
    }

    /**
     * Returns all document IDs belonging to the given knowledge bases.
     */
    async getDocumentIds(knowledgeBaseIds: string[], orgId: string): Promise<string[]> {
        const docs = await prisma.knowledgeDocument.findMany({
            where: {
                knowledgeBaseId: { in: knowledgeBaseIds },
                orgId,
                status: "INDEXED",
            },
            select: { id: true },
        });
        return docs.map((d) => d.id);
    }
}
