import { z } from "zod";

export const inboxHealthResponseSchema = z.object({
    module: z.literal("inbox"),
    status: z.literal("ok")
});

export type InboxHealthResponse = z.infer<typeof inboxHealthResponseSchema>;