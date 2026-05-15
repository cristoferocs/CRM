import { z } from "zod";
import {
    StageAutomationRuleSchema,
    StageRequiredFieldSchema,
    StageRulesArraySchema,
} from "./stage-automation.schema.js";

export {
    StageAutomationRuleSchema,
    StageAutomationActionSchema,
    StageAutomationConditionGroupSchema,
    StageRequiredFieldSchema,
} from "./stage-automation.schema.js";

// ---------------------------------------------------------------------------
// Enums (mirror Prisma enums for input validation)
// ---------------------------------------------------------------------------

export const PipelineTypeSchema = z.enum([
    "SALES",
    "PRODUCT",
    "SERVICE",
    "CAMPAIGN",
    "PARTNERSHIP",
    "RENEWAL",
    "RECRUITMENT",
    "CUSTOM",
]);

export const PipelineVisibilitySchema = z.enum(["ALL", "DEPARTMENT", "ROLES"]);

export const StageTypeSchema = z.enum([
    "REGULAR",
    "ENTRY",
    "NURTURING",
    "DECISION",
    "WON",
    "LOST",
    "ON_HOLD",
]);

export const StageAgentTriggerSchema = z.enum([
    "MANUAL",
    "AUTO_ENTER",
    "AUTO_ROTTING",
    "SCHEDULED",
]);

export const MovedByTypeSchema = z.enum(["HUMAN", "AGENT", "AUTOMATION", "SYSTEM"]);

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export const CreatePipelineSchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#7c5cfc"),
    icon: z.string().max(50).optional(),
    type: PipelineTypeSchema,
    context: z.record(z.string(), z.unknown()).optional(),
    tags: z.array(z.string()).default([]),
    isDefault: z.boolean().default(false),
    rotting: z.boolean().default(true),
    rottingDays: z.number().int().min(1).max(365).default(7),
    currency: z.string().length(3).default("BRL"),
    winProbabilityAuto: z.boolean().default(true),
    customFieldSchema: z.array(z.record(z.string(), z.unknown())).default([]),
    visibility: PipelineVisibilitySchema.default("ALL"),
    allowedRoles: z.array(z.string()).default([]),
});

export const UpdatePipelineSchema = CreatePipelineSchema.omit({ type: true }).partial();

// ---------------------------------------------------------------------------
// Stage
// ---------------------------------------------------------------------------

export const CreateStageSchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    order: z.number().int().min(0),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#7c5cfc"),
    type: StageTypeSchema.default("REGULAR"),
    probability: z.number().int().min(0).max(100).default(0),
    rottingDays: z.number().int().min(1).optional(),
    maxDeals: z.number().int().min(1).optional(),
    onEnterActions: StageRulesArraySchema,
    onExitActions: StageRulesArraySchema,
    onRottingActions: StageRulesArraySchema,
    requiredFields: z.array(StageRequiredFieldSchema).default([]),
    isWon: z.boolean().default(false),
    isLost: z.boolean().default(false),
});

export const UpdateStageSchema = CreateStageSchema.partial();

export const ReorderStagesSchema = z.object({
    stages: z
        .array(z.object({ id: z.string(), order: z.number().int().min(0) }))
        .min(1),
});

export const RemoveStageBodySchema = z.object({
    targetStageId: z.string().optional(),
});

export const AssignAgentToStageSchema = z.object({
    agentId: z.string(),
    trigger: StageAgentTriggerSchema.default("MANUAL"),
    goal: z.string().max(1000).optional(),
});

// ---------------------------------------------------------------------------
// Deal
// ---------------------------------------------------------------------------

export const CreateDealSchema = z.object({
    title: z.string().min(1).max(200),
    value: z.number().min(0).default(0),
    currency: z.string().length(3).default("BRL"),
    pipelineId: z.string(),
    stageId: z.string(),
    contactId: z.string(),
    ownerId: z.string().optional(),
    expectedCloseAt: z.string().datetime().optional(),
    probability: z.number().int().min(0).max(100).default(0),
    customFields: z.record(z.string(), z.unknown()).default({}),
    utmSource: z.string().max(200).optional(),
    utmCampaign: z.string().max(200).optional(),
    adId: z.string().max(200).optional(),
    tagIds: z.array(z.string()).optional(),
});

export const UpdateDealSchema = z.object({
    title: z.string().min(1).max(200).optional(),
    value: z.number().min(0).nullable().optional(),
    currency: z.string().length(3).optional(),
    ownerId: z.string().optional(),
    expectedCloseAt: z.string().datetime().nullable().optional(),
    probability: z.number().int().min(0).max(100).optional(),
    customFields: z.record(z.string(), z.unknown()).optional(),
    tagIds: z.array(z.string()).optional(),
});

export const MoveDealSchema = z.object({
    toStageId: z.string(),
    movedBy: MovedByTypeSchema.default("HUMAN"),
    agentId: z.string().optional(),
    agentSessionId: z.string().optional(),
    reason: z.string().max(500).optional(),
    dataCollected: z.record(z.string(), z.unknown()).optional(),
    triggerEvent: z.string().max(200).optional(),
});

export const DealFiltersSchema = z.object({
    search: z.string().max(200).optional(),
    stageId: z.string().optional(),
    pipelineId: z.string().optional(),
    ownerId: z.string().optional(),
    contactId: z.string().optional(),
    isRotting: z.coerce.boolean().optional(),
    /**
     * Comma-separated list of either tag ids or tag names. The pipeline service
     * resolves names against the Tag table and falls back to the legacy
     * Contact.tags String[] for backwards compat.
     */
    tags: z.string().optional(),
    valueMin: z.coerce.number().optional(),
    valueMax: z.coerce.number().optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const KanbanFiltersSchema = z.object({
    ownerId: z.string().optional(),
    tags: z.string().optional(),
    valueMin: z.coerce.number().optional(),
    valueMax: z.coerce.number().optional(),
    search: z.string().max(200).optional(),
    isRotting: z.coerce.boolean().optional(),
});

export const PipelineStatsQuerySchema = z.object({
    period: z.enum(["week", "month", "quarter", "year"]).default("month"),
});

export const OverviewQuerySchema = z.object({
    period: z.enum(["week", "month", "quarter", "year"]).default("month"),
});

// ---------------------------------------------------------------------------
// Deal Activity
// ---------------------------------------------------------------------------

export const CreateDealActivitySchema = z.object({
    type: z.enum(["NOTE", "CALL", "EMAIL", "MEETING", "TASK", "WHATSAPP"]),
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    dueAt: z.string().datetime().optional(),
});

// ---------------------------------------------------------------------------
// Agent activation
// ---------------------------------------------------------------------------

export const ActivateAgentSchema = z.object({
    agentId: z.string().optional(),
    reason: z.string().max(500).optional(),
});

// ---------------------------------------------------------------------------
// Stage automation test (dry-run)
// ---------------------------------------------------------------------------

export const TestStageAutomationSchema = z.object({
    trigger: z.enum(["enter", "exit", "rotting"]).default("enter"),
    dealId: z.string(),
    ruleId: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreatePipelineInput = z.infer<typeof CreatePipelineSchema>;
export type UpdatePipelineInput = z.infer<typeof UpdatePipelineSchema>;
export type CreateStageInput = z.infer<typeof CreateStageSchema>;
export type UpdateStageInput = z.infer<typeof UpdateStageSchema>;
export type ReorderStagesInput = z.infer<typeof ReorderStagesSchema>;
export type AssignAgentToStageInput = z.infer<typeof AssignAgentToStageSchema>;
export type CreateDealInput = z.infer<typeof CreateDealSchema>;
export type UpdateDealInput = z.infer<typeof UpdateDealSchema>;
export type MoveDealInput = z.infer<typeof MoveDealSchema>;
export type DealFilters = z.infer<typeof DealFiltersSchema>;
export type KanbanFilters = z.infer<typeof KanbanFiltersSchema>;
export type PipelineStatsQuery = z.infer<typeof PipelineStatsQuerySchema>;
export type OverviewQuery = z.infer<typeof OverviewQuerySchema>;
export type CreateDealActivityInput = z.infer<typeof CreateDealActivitySchema>;
export type ActivateAgentInput = z.infer<typeof ActivateAgentSchema>;
export type RemoveStageInput = z.infer<typeof RemoveStageBodySchema>;
export type TestStageAutomationInput = z.infer<typeof TestStageAutomationSchema>;
