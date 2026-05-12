import { z } from "zod";

export const marketingHealthResponseSchema = z.object({
    module: z.literal("marketing"),
    status: z.literal("ok")
});

export type MarketingHealthResponse = z.infer<typeof marketingHealthResponseSchema>;