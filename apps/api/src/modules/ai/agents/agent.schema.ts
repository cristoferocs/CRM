import { z } from "zod";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const AgentTypeEnum = z.enum([
    "SALES", "SUPPORT", "SCHEDULER", "QUALIFICATION",
    "COLLECTIONS", "ONBOARDING", "CUSTOM",
]);

export const AgentStatusEnum = z.enum([
    "DRAFT", "LEARNING", "REVIEW", "READY", "ACTIVE", "PAUSED", "RETIRED",
]);

export const AgentPhaseEnum = z.enum([
    "SETUP", "OBSERVATION", "LEARNING", "VALIDATION", "PRODUCTION",
]);

export const AIProviderEnum = z.enum(["GOOGLE", "ANTHROPIC", "OPENAI", "OLLAMA"]);

// ---------------------------------------------------------------------------
// Create / Update
// ---------------------------------------------------------------------------

export const CreateAgentSchema = z.object({
    name: z.string().min(1).max(120),
    description: z.string().optional(),
    avatar: z.string().url().optional(),
    type: AgentTypeEnum,
    provider: AIProviderEnum.optional(),
    model: z.string().optional(),

    // Core prompt & identity
    systemPrompt: z.string().min(1),
    personality: z.record(z.string(), z.unknown()).default({}),
    goal: z.string().min(1),
    successCriteria: z.record(z.string(), z.unknown()).default({}),

    // Behaviour
    maxTurnsBeforeHuman: z.number().int().min(1).max(200).default(20),
    confidenceThreshold: z.number().min(0).max(1).default(0.75),
    temperature: z.number().min(0).max(2).default(0.4),
    maxTokens: z.number().int().min(1).max(8192).default(2048),

    // Knowledge & tools
    knowledgeBaseIds: z.array(z.string()).default([]),
    enabledTools: z.record(z.string(), z.unknown()).default({}),
    handoffRules: z.record(z.string(), z.unknown()).default({}),
    requiredDataPoints: z.array(z.string()).default([]),

    // Learning
    learningConfig: z.record(z.string(), z.unknown()).default({}),
    minimumLearningSample: z.number().int().min(1).default(30),
});
export type CreateAgentInput = z.infer<typeof CreateAgentSchema>;

export const UpdateAgentSchema = CreateAgentSchema.partial();
export type UpdateAgentInput = z.infer<typeof UpdateAgentSchema>;

// ---------------------------------------------------------------------------
// Run (single message turn)
// ---------------------------------------------------------------------------

export const RunAgentSchema = z.object({
    conversationId: z.string(),
    message: z.string().min(1),
    contactId: z.string().optional(),
});
export type RunAgentInput = z.infer<typeof RunAgentSchema>;

// ---------------------------------------------------------------------------
// Learning
// ---------------------------------------------------------------------------

export const StartLearningSchema = z.object({
    /** Explicit conversation IDs to learn from. If omitted, system picks the most recent `minimumLearningSample`. */
    conversationIds: z.array(z.string()).optional(),
});
export type StartLearningInput = z.infer<typeof StartLearningSchema>;

// ---------------------------------------------------------------------------
// Flow approval (REVIEW → READY)
// ---------------------------------------------------------------------------

export const ApproveFlowSchema = z.object({
    notes: z.string().optional(),
    /** Optionally patch the flowTemplate before approving. */
    flowTemplate: z.record(z.string(), z.unknown()).optional(),
    decisionRules: z.record(z.string(), z.unknown()).optional(),
});
export type ApproveFlowInput = z.infer<typeof ApproveFlowSchema>;

export const RejectFlowSchema = z.object({
    reason: z.string().min(1),
});
export type RejectFlowInput = z.infer<typeof RejectFlowSchema>;
