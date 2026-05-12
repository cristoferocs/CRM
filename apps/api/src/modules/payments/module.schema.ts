import { z } from "zod";

export const paymentsHealthResponseSchema = z.object({
    module: z.literal("payments"),
    status: z.literal("ok")
});

export type PaymentsHealthResponse = z.infer<typeof paymentsHealthResponseSchema>;