import { z } from "zod";

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export const CreateDepartmentSchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
});

export const UpdateDepartmentSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).nullable().optional(),
});

export const AssignUserSchema = z.object({
    userId: z.string(),
});

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export const DepartmentResponseSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    orgId: z.string(),
    _count: z.object({ users: z.number() }).optional(),
});

export const DepartmentListResponseSchema = z.object({
    data: z.array(DepartmentResponseSchema),
    total: z.number(),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreateDepartmentInput = z.infer<typeof CreateDepartmentSchema>;
export type UpdateDepartmentInput = z.infer<typeof UpdateDepartmentSchema>;
export type AssignUserInput = z.infer<typeof AssignUserSchema>;