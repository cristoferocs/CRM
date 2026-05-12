import { z } from "zod";

export const contactsHealthResponseSchema = z.object({
    module: z.literal("contacts"),
    status: z.literal("ok")
});

export type ContactsHealthResponse = z.infer<typeof contactsHealthResponseSchema>;