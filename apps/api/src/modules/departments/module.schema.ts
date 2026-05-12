import { z } from "zod";

export const departmentsHealthResponseSchema = z.object({
    module: z.literal("departments"),
    status: z.literal("ok")
});

export type DepartmentsHealthResponse = z.infer<typeof departmentsHealthResponseSchema>;