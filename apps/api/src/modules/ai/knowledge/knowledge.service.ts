import { createHash } from "node:crypto";
import { Storage } from "@google-cloud/storage";
import { getEmbeddingProvider } from "../ai.factory.js";
import { KnowledgeRepository } from "./knowledge.repository.js";
import { getOrSet, invalidatePrefix } from "../../../lib/cache.js";
import { pgvectorSearch } from "./vector-search/pgvector.search.js";
import { vertexSearch } from "./vector-search/vertex.search.js";
import { extractPdf } from "./indexers/pdf.indexer.js";
import { scrapeUrl, crawlWebsite } from "./indexers/website.indexer.js";
import { normalizeText } from "./indexers/text.indexer.js";
import { fetchDriveDocument } from "./indexers/drive.indexer.js";
import { queues } from "../../../queue/queues.js";
import type {
    CreateKnowledgeBaseInput,
    AddDocumentInput,
    SearchKnowledgeInput,
    SearchResult,
} from "./knowledge.schema.js";

const CHUNK_SIZE = Number(process.env.KB_CHUNK_SIZE ?? 800);
const CHUNK_OVERLAP = Number(process.env.KB_CHUNK_OVERLAP ?? 100);
const VECTOR_PROVIDER = process.env.VECTOR_SEARCH_PROVIDER ?? "pgvector"; // 'pgvector' | 'vertex'

const storage = new Storage();

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

function chunkText(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
        const end = Math.min(start + size, text.length);
        chunks.push(text.slice(start, end).trim());
        start += size - overlap;
        if (start >= text.length) break;
    }
    return chunks.filter((c) => c.length > 0);
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class KnowledgeService {
    private readonly repo = new KnowledgeRepository();

    // -------------------------------------------------------------------------
    // KnowledgeBase CRUD
    // -------------------------------------------------------------------------

    createKnowledgeBase(data: CreateKnowledgeBaseInput, orgId: string) {
        return this.repo.createBase({ ...data, orgId });
    }

    listKnowledgeBases(orgId: string) {
        return this.repo.listBases(orgId);
    }

    async getKnowledgeBase(id: string, orgId: string) {
        const kb = await this.repo.findBase(id, orgId);
        if (!kb) {
            const err = new Error("Knowledge base não encontrada") as Error & { statusCode: number };
            err.statusCode = 404;
            throw err;
        }
        return kb;
    }

    async deleteKnowledgeBase(id: string, orgId: string) {
        await this.getKnowledgeBase(id, orgId); // 404 guard
        return this.repo.deleteBase(id, orgId);
    }

    // -------------------------------------------------------------------------
    // Documents
    // -------------------------------------------------------------------------

    async addDocument(knowledgeBaseId: string, source: AddDocumentInput, orgId: string) {
        // Verify KB belongs to org
        await this.getKnowledgeBase(knowledgeBaseId, orgId);

        // For non-TEXT types, we store a placeholder content; real content is fetched during indexing
        const initialContent =
            source.type === "TEXT" ? normalizeText(source.source) : "";

        const doc = await this.repo.createDocument({
            title: source.title,
            content: initialContent,
            sourceUrl: source.type !== "TEXT" ? source.source : undefined,
            sourceType: source.type,
            knowledgeBaseId,
            orgId,
            metadata: source.metadata,
        });

        // Enqueue indexing job
        await queues.knowledge().add(
            "knowledge:index",
            { documentId: doc.id, orgId },
            { attempts: 3, backoff: { type: "exponential", delay: 10_000 } },
        );

        return doc;
    }

    async getDocumentStatus(docId: string, orgId: string) {
        const doc = await this.repo.findDocument(docId, orgId);
        if (!doc) {
            const err = new Error("Documento não encontrado") as Error & { statusCode: number };
            err.statusCode = 404;
            throw err;
        }
        return { id: doc.id, status: doc.status, chunkCount: doc.chunkCount };
    }

    async deleteDocument(documentId: string, orgId: string) {
        return this.repo.deleteDocument(documentId, orgId);
    }

    // -------------------------------------------------------------------------
    // Indexing (called by worker)
    // -------------------------------------------------------------------------

    async indexDocument(documentId: string, orgId: string): Promise<void> {
        const doc = await this.repo.findDocument(documentId, orgId);
        if (!doc) throw new Error(`Documento ${documentId} não encontrado`);

        // Mark as indexing
        await this.repo.updateDocument(documentId, { status: "INDEXING" });

        try {
            let text = doc.content;

            // Fetch content based on source type
            if (doc.sourceType === "PDF" && doc.sourceUrl) {
                text = await this.fetchPdfContent(doc.sourceUrl);
                await this.repo.updateDocument(documentId, { content: text });
            } else if (doc.sourceType === "WEBSITE" && doc.sourceUrl) {
                const crawlDepth = Number((doc.metadata as Record<string, unknown>)?.crawlDepth ?? 1);
                text = crawlDepth > 1
                    ? await crawlWebsite(doc.sourceUrl, crawlDepth)
                    : await scrapeUrl(doc.sourceUrl);
                await this.repo.updateDocument(documentId, { content: text });
            } else if (doc.sourceType === "DRIVE" && doc.sourceUrl) {
                const raw = await fetchDriveDocument(doc.sourceUrl);
                if (raw.startsWith("__PDF_BUFFER__:")) {
                    const b64 = raw.replace("__PDF_BUFFER__:", "");
                    text = await extractPdf(Buffer.from(b64, "base64"));
                } else {
                    text = normalizeText(raw);
                }
                await this.repo.updateDocument(documentId, { content: text });
            }

            // Chunk the text
            const chunks = chunkText(text);
            if (chunks.length === 0) {
                throw new Error("Nenhum conteúdo extraído do documento");
            }

            // Generate embeddings in batch
            const provider = getEmbeddingProvider();
            const vectors = await provider.embedBatch(chunks);

            // Persist chunks
            await this.repo.createChunks(
                chunks.map((content, i) => ({
                    content,
                    chunkIndex: i,
                    documentId,
                    orgId,
                    vector: vectors[i]!,
                })),
            );

            await this.repo.updateDocument(documentId, {
                status: "INDEXED",
                chunkCount: chunks.length,
            });
            // Drop any cached search results for this org — they were
            // computed against the old document set.
            await this.invalidateSearchCache(orgId);
        } catch (err) {
            await this.repo.updateDocument(documentId, { status: "FAILED" });
            throw err;
        }
    }

    // -------------------------------------------------------------------------
    // Search
    // -------------------------------------------------------------------------

    async search(input: SearchKnowledgeInput, orgId: string): Promise<SearchResult[]> {
        // Cache search results by (orgId, KB-set, query, limit). Heavy agents
        // ask the same questions across many sessions — embedding + vector
        // search costs $$ and takes 100-500ms. TTL is short (90s) so KB
        // updates surface quickly; invalidate() below blows away whole KBs
        // when documents change.
        const cacheKey = this.buildSearchKey(orgId, input);
        return getOrSet<SearchResult[]>(cacheKey, 90, async () => {
            const documentIds = await this.repo.getDocumentIds(input.knowledgeBaseIds, orgId);
            if (documentIds.length === 0) return [];

            const provider = getEmbeddingProvider();
            const queryVector = await provider.embed(input.query);

            if (VECTOR_PROVIDER === "vertex") {
                return vertexSearch(
                    queryVector,
                    orgId,
                    documentIds,
                    input.limit,
                    (ids) => this.repo.vectorSearch(queryVector, orgId, ids, input.limit),
                );
            }

            return pgvectorSearch(queryVector, orgId, documentIds, input.limit);
        });
    }

    private buildSearchKey(orgId: string, input: SearchKnowledgeInput): string {
        const kbs = [...input.knowledgeBaseIds].sort().join(",");
        const hash = createHash("sha1")
            .update(`${kbs}|${input.query}|${input.limit ?? ""}`)
            .digest("hex")
            .slice(0, 16);
        return `kb:search:${orgId}:${hash}`;
    }

    /** Drop every cached KB search result for this org. Call this after a
     *  document is indexed / removed so stale answers don't linger. */
    invalidateSearchCache(orgId: string): Promise<void> {
        return invalidatePrefix(`kb:search:${orgId}:`);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private async fetchPdfContent(sourceUrl: string): Promise<string> {
        // Support gs://bucket/path and https:// URLs
        if (sourceUrl.startsWith("gs://")) {
            const withoutScheme = sourceUrl.slice(5);
            const slashIndex = withoutScheme.indexOf("/");
            const bucket = withoutScheme.slice(0, slashIndex);
            const file = withoutScheme.slice(slashIndex + 1);
            const [buffer] = await storage.bucket(bucket).file(file).download();
            return extractPdf(buffer);
        }

        const response = await fetch(sourceUrl);
        if (!response.ok) {
            throw new Error(`Failed to download PDF: ${response.status} ${sourceUrl}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        return extractPdf(Buffer.from(arrayBuffer));
    }
}
