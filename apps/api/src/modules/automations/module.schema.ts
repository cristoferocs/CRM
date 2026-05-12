import { z } from "zod";

export const automationsHealthResponseSchema = z.object({
    module: z.literal("automations"),
    status: z.literal("ok")
});

export type AutomationsHealthResponse = z.infer<typeof automationsHealthResponseSchema>;