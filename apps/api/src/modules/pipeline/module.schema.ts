import { z } from "zod";

export const pipelineHealthResponseSchema = z.object({
    module: z.literal("pipeline"),
    status: z.literal("ok")
});

export type PipelineHealthResponse = z.infer<typeof pipelineHealthResponseSchema>;