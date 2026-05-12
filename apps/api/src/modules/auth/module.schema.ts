import { z } from "zod";

export const authHealthResponseSchema = z.object({
    module: z.literal("auth"),
    status: z.literal("ok")
});

export type AuthHealthResponse = z.infer<typeof authHealthResponseSchema>;