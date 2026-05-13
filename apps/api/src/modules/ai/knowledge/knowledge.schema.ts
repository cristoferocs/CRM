import { z } from "zod";

// ---------------------------------------------------------------------------
// KnowledgeBase
// ---------------------------------------------------------------------------

export const CreateKnowledgeBaseSchema = z.object({
    name: z.string().min(1).max(120),
    description: z.string().optional(),
    type: z.enum([
        "DOCUMENT",
        "WEBSITE",
        "FAQ",
        "PRODUCT",
        "OBJECTION",
        "APPROACH",
    ]),
});
export type CreateKnowledgeBaseInput = z.infer<typeof CreateKnowledgeBaseSchema>;

// ---------------------------------------------------------------------------
// AddDocument
// ---------------------------------------------------------------------------

export const AddDocumentSchema = z.object({
    title: z.string().min(1).max(255),
    type: z.enum(["PDF", "WEBSITE", "TEXT", "NOTION", "DRIVE"]),
    // For PDF: GCS path or public URL
    // For WEBSITE: the URL to scrape
    // For TEXT: inline content
    // For DRIVE: google drive file ID
    source: z.string().min(1),
    metadata: z.record(z.string(), z.unknown()).optional(),
});
export type AddDocumentInput = z.infer<typeof AddDocumentSchema>;

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export const SearchKnowledgeSchema = z.object({
    query: z.string().min(1).max(1000),
    knowledgeBaseIds: z.array(z.string()).min(1),
    limit: z.coerce.number().int().min(1).max(20).default(5),
});
export type SearchKnowledgeInput = z.infer<typeof SearchKnowledgeSchema>;

export interface SearchResult {
    chunkId: string;
    documentId: string;
    documentTitle: string;
    content: string;
    score: number;
}
