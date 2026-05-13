import { z } from "zod";

// ---------------------------------------------------------------------------
// Stage
// ---------------------------------------------------------------------------

export const PipelineStageInputSchema = z.object({
    name: z.string().min(1).max(100),
    order: z.number().int().min(0),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#6366f1"),
    probability: z.number().int().min(0).max(100).default(0),
    isWon: z.boolean().default(false),
    isLost: z.boolean().default(false),
});

// ---------------------------------------------------------------------------
// Pipelines
// ---------------------------------------------------------------------------

export const CreatePipelineSchema = z.object({
    name: z.string().min(1).max(100),
    stages: z.array(PipelineStageInputSchema).min(1),
});

export const UpdatePipelineSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    stages: z.array(PipelineStageInputSchema).min(1).optional(),
});

// ---------------------------------------------------------------------------
// Deals
// ---------------------------------------------------------------------------

export const CreateDealSchema = z.object({
    title: z.string().min(1).max(200),
    value: z.number().positive().optional(),
    currency: z.string().length(3).default("BRL"),
    stageId: z.string(),
    pipelineId: z.string(),
    contactId: z.string(),
    ownerId: z.string().optional(),
    expectedCloseAt: z.string().datetime().optional(),
    customFields: z.record(z.string(), z.unknown()).default({}),
});

export const UpdateDealSchema = z.object({
    title: z.string().min(1).max(200).optional(),
    value: z.number().positive().nullable().optional(),
    currency: z.string().length(3).optional(),
    ownerId: z.string().optional(),
    expectedCloseAt: z.string().datetime().nullable().optional(),
    customFields: z.record(z.string(), z.unknown()).optional(),
});

export const MoveDealSchema = z.object({
    stageId: z.string(),
    reason: z.string().max(500).optional(),
});

export const DealFiltersSchema = z.object({
    search: z.string().max(200).optional(),
    stageId: z.string().optional(),
    pipelineId: z.string().optional(),
    ownerId: z.string().optional(),
    contactId: z.string().optional(),
    valueMin: z.coerce.number().optional(),
    valueMax: z.coerce.number().optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

export const CreateDealActivitySchema = z.object({
    type: z.enum(["NOTE", "CALL", "EMAIL", "MEETING", "TASK", "WHATSAPP"]),
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    dueAt: z.string().datetime().optional(),
});

// ---------------------------------------------------------------------------
// Forecast
// ---------------------------------------------------------------------------

export const ForecastQuerySchema = z.object({
    period: z.enum(["week", "month", "quarter", "year"]).default("month"),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreatePipelineInput = z.infer<typeof CreatePipelineSchema>;
export type UpdatePipelineInput = z.infer<typeof UpdatePipelineSchema>;
export type CreateDealInput = z.infer<typeof CreateDealSchema>;
export type UpdateDealInput = z.infer<typeof UpdateDealSchema>;
export type MoveDealInput = z.infer<typeof MoveDealSchema>;
export type DealFilters = z.infer<typeof DealFiltersSchema>;
export type CreateDealActivityInput = z.infer<typeof CreateDealActivitySchema>;
export type ForecastQuery = z.infer<typeof ForecastQuerySchema>;