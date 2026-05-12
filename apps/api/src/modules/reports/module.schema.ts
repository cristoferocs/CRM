import { z } from "zod";

export const reportsHealthResponseSchema = z.object({
    module: z.literal("reports"),
    status: z.literal("ok")
});

export type ReportsHealthResponse = z.infer<typeof reportsHealthResponseSchema>;