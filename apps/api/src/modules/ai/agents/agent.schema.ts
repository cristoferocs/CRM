import { z } from "zod";

export const CreateAgentSchema = z.object({
    name: z.string().min(1).max(120),
    description: z.string().optional(),
    avatar: z.string().url().optional(),
    type: z.enum(["SALES", "SUPPORT", "SCHEDULER", "CUSTOM"]),
    provider: z.enum(["GOOGLE", "ANTHROPIC", "OPENAI", "OLLAMA"]).default("OPENAI"),
    model: z.string().optional(),
    systemPrompt: z.string().min(1),
    temperature: z.number().min(0).max(2).default(0.3),
    maxTokens: z.number().int().min(1).max(8192).default(2048),
    knowledgeBaseIds: z.array(z.string()).default([]),
    tools: z.record(z.string(), z.unknown()).default({}),
    handoffRules: z.record(z.string(), z.unknown()).default({}),
});
export type CreateAgentInput = z.infer<typeof CreateAgentSchema>;

export const UpdateAgentSchema = CreateAgentSchema.partial();
export type UpdateAgentInput = z.infer<typeof UpdateAgentSchema>;

export const RunAgentSchema = z.object({
    conversationId: z.string(),
    message: z.string().min(1),
    contactId: z.string().optional(),
});
export type RunAgentInput = z.infer<typeof RunAgentSchema>;
