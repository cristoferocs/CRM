import { z } from "zod";

export const usersHealthResponseSchema = z.object({
    module: z.literal("users"),
    status: z.literal("ok")
});

export type UsersHealthResponse = z.infer<typeof usersHealthResponseSchema>;