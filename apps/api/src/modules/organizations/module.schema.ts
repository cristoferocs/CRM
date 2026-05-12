import { z } from "zod";

export const organizationsHealthResponseSchema = z.object({
    module: z.literal("organizations"),
    status: z.literal("ok")
});

export type OrganizationsHealthResponse = z.infer<typeof organizationsHealthResponseSchema>;