import { z } from "zod";

// =============================================================================
// Stage Automation — Zod schemas
// These mirror the discriminated unions in @crm-base/shared.
// =============================================================================

// ── Conditions (recursive) ────────────────────────────────────────────────

export const StageConditionOperatorSchema = z.enum([
    "equals",
    "not_equals",
    "contains",
    "not_contains",
    "gt",
    "gte",
    "lt",
    "lte",
    "is_set",
    "is_empty",
    "in",
    "not_in",
]);

export const StageAutomationConditionSchema = z.object({
    kind: z.literal("condition"),
    field: z.string().min(1).max(200),
    operator: StageConditionOperatorSchema,
    value: z
        .union([
            z.string(),
            z.number(),
            z.boolean(),
            z.array(z.union([z.string(), z.number()])),
        ])
        .optional(),
});

// We need a recursive schema for groups. We type it manually to avoid `z.lazy` type loss.
type ConditionGroupShape = {
    kind: "group";
    operator: "AND" | "OR";
    children: Array<
        | z.infer<typeof StageAutomationConditionSchema>
        | ConditionGroupShape
    >;
};

export const StageAutomationConditionGroupSchema: z.ZodType<ConditionGroupShape> =
    z.object({
        kind: z.literal("group"),
        operator: z.enum(["AND", "OR"]),
        children: z
            .array(
                z.union([
                    StageAutomationConditionSchema,
                    z.lazy(() => StageAutomationConditionGroupSchema),
                ]),
            )
            .max(50),
    });

// ── Actions (discriminated union) ─────────────────────────────────────────

const InterpolatedString = z.string().min(1).max(4000);

export const StageAutomationActionSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("send_whatsapp"),
        templateId: z.string().optional(),
        message: InterpolatedString,
    }),
    z.object({
        type: z.literal("send_email"),
        subject: z.string().min(1).max(300),
        body: InterpolatedString,
        fromName: z.string().max(120).optional(),
        fromEmail: z.string().email().optional(),
    }),
    z.object({
        type: z.literal("create_task"),
        title: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        activityType: z
            .enum(["NOTE", "CALL", "EMAIL", "MEETING", "TASK", "WHATSAPP"])
            .default("TASK"),
        dueIn: z
            .string()
            .regex(/^\d+(d|h|m|s)$/, "Use formato 2d, 6h, 30m ou 45s")
            .optional(),
        assigneeId: z.string().optional(),
    }),
    z.object({
        type: z.literal("assign_ai_agent"),
        agentId: z.string(),
        goal: z.string().max(2000).optional(),
    }),
    z.object({
        type: z.literal("add_tag"),
        target: z.enum(["contact", "deal"]),
        tag: z.string().min(1).max(100),
    }),
    z.object({
        type: z.literal("remove_tag"),
        target: z.enum(["contact", "deal"]),
        tag: z.string().min(1).max(100),
    }),
    z.object({
        type: z.literal("notify_user"),
        target: z.string().min(1).max(200),
        title: z.string().min(1).max(200),
        message: z.string().max(2000).optional(),
    }),
    z.object({
        type: z.literal("update_field"),
        field: z.string().min(1).max(200),
        value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
    }),
    z.object({
        type: z.literal("move_stage"),
        targetStageId: z.string(),
        reason: z.string().max(500).optional(),
    }),
    z.object({
        type: z.literal("webhook"),
        url: z.string().url().max(2000),
        method: z.enum(["GET", "POST", "PUT", "PATCH"]),
        headers: z.record(z.string(), z.string()).optional(),
        body: z.string().max(20000).optional(),
    }),
    z.object({
        type: z.literal("wait"),
        duration: z
            .string()
            .regex(/^\d+(d|h|m|s)$/, "Use formato 2d, 6h, 30m ou 45s"),
    }),
]);

// ── Rule ──────────────────────────────────────────────────────────────────

export const StageAutomationTriggerSchema = z.enum(["enter", "exit", "rotting"]);

export const StageAutomationRuleSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1).max(200),
    trigger: StageAutomationTriggerSchema,
    isActive: z.boolean().default(true),
    conditions: StageAutomationConditionGroupSchema.nullable().optional(),
    actions: z.array(StageAutomationActionSchema).max(50),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
});

// Backwards-compatible parser: accepts the legacy shape (`Record<string, unknown>[]`)
// silently, returning an empty array of rules. This keeps already-stored stages
// working until a user edits them.
export const StageRulesArraySchema = z
    .array(z.union([StageAutomationRuleSchema, z.record(z.string(), z.unknown())]))
    .default([])
    .transform((arr) =>
        arr.filter((entry): entry is z.infer<typeof StageAutomationRuleSchema> => {
            const candidate = entry as { trigger?: unknown; actions?: unknown; id?: unknown };
            return (
                typeof candidate?.id === "string" &&
                typeof candidate?.trigger === "string" &&
                Array.isArray(candidate?.actions)
            );
        }),
    );

// ── Required fields ──────────────────────────────────────────────────────

export const StageRequiredFieldSchema = z.object({
    key: z.string().min(1).max(80),
    label: z.string().min(1).max(120),
    type: z.enum(["text", "number", "date", "select", "boolean"]).default("text"),
    options: z.array(z.string().max(120)).max(50).optional(),
});

// ── Inferred types ────────────────────────────────────────────────────────

export type StageAutomationRuleInput = z.infer<typeof StageAutomationRuleSchema>;
export type StageAutomationActionInput = z.infer<typeof StageAutomationActionSchema>;
export type StageAutomationConditionGroupInput = z.infer<
    typeof StageAutomationConditionGroupSchema
>;
export type StageRequiredFieldInput = z.infer<typeof StageRequiredFieldSchema>;
