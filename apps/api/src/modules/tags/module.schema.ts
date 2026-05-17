import { z } from "zod";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const HEX_COLOR_INPUT = /^#?[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/;

function normalizeHexColor(value: string): string {
    const raw = value.trim().replace(/^#/, "");
    const expanded = raw.length === 3 ? raw.split("").map((ch) => `${ch}${ch}`).join("") : raw;
    return `#${expanded.toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export const CreateTagSchema = z.object({
    name: z
        .string()
        .min(1, "Nome obrigatório")
        .max(50, "Máximo 50 caracteres")
        .transform((s) => s.trim()),
    color: z
        .string()
        .default("#7c5cfc")
        .transform((s) => s.trim())
        .refine((value) => HEX_COLOR_INPUT.test(value), "Cor deve estar no formato #RRGGBB")
        .transform((value) => normalizeHexColor(value)),
});

export const UpdateTagSchema = z.object({
    name: z.string().min(1).max(50).transform((s) => s.trim()).optional(),
    color: z
        .string()
        .transform((s) => s.trim())
        .refine((value) => HEX_COLOR_INPUT.test(value), "Cor deve estar no formato #RRGGBB")
        .transform((value) => normalizeHexColor(value))
        .optional(),
});

export const TagFiltersSchema = z.object({
    search: z.string().max(50).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
});

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export const TagResponseSchema = z.object({
    id: z.string(),
    name: z.string(),
    color: z.string(),
    orgId: z.string(),
    createdBy: z.string().nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
});

export const TagListResponseSchema = z.object({
    data: z.array(TagResponseSchema),
    total: z.number(),
});

export const TagUsageResponseSchema = z.object({
    tagId: z.string(),
    contactCount: z.number(),
    dealCount: z.number(),
});

export const TagDeleteResponseSchema = z.object({
    deleted: z.literal(true),
    removedFromContacts: z.number(),
    removedFromDeals: z.number(),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreateTagInput = z.infer<typeof CreateTagSchema>;
export type UpdateTagInput = z.infer<typeof UpdateTagSchema>;
export type TagFilters = z.infer<typeof TagFiltersSchema>;
export type TagResponse = z.infer<typeof TagResponseSchema>;
