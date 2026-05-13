import { z } from "zod";

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export const CreateBranchSchema = z.object({
    name: z.string().min(1).max(100),
    code: z.string().min(1).max(20).optional(),
    address: z.string().max(300).optional(),
    phone: z.string().max(30).optional(),
    email: z.string().email().optional(),
    isHeadquarter: z.boolean().optional(),
});

export const UpdateBranchSchema = CreateBranchSchema.partial();

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export const BranchResponseSchema = z.object({
    id: z.string(),
    name: z.string(),
    code: z.string().nullable(),
    address: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    isActive: z.boolean(),
    isHeadquarter: z.boolean(),
    settings: z.any().nullable(),
    orgId: z.string(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    userCount: z.number().int().optional(),
});

export const BranchWithStatsSchema = BranchResponseSchema.extend({
    stats: z.object({
        userCount: z.number().int(),
        contactCount: z.number().int(),
        dealCount: z.number().int(),
        openConversations: z.number().int(),
    }),
});

export const BranchListResponseSchema = z.object({
    data: z.array(BranchResponseSchema),
    total: z.number(),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreateBranchInput = z.infer<typeof CreateBranchSchema>;
export type UpdateBranchInput = z.infer<typeof UpdateBranchSchema>;
export type BranchResponse = z.infer<typeof BranchResponseSchema>;
