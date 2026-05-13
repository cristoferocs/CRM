import { z } from "zod";

export const UserRoleEnum = z.enum([
    "SUPER_ADMIN",
    "ADMIN",
    "MANAGER",
    "BRANCH_MANAGER",
    "SELLER",
    "SUPPORT",
    "VIEWER",
]);

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export const CreateUserSchema = z.object({
    email: z.string().email(),
    name: z.string().min(1).max(100),
    role: UserRoleEnum.default("SELLER"),
    departmentId: z.string().optional(),
});

export const UpdateUserSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    avatar: z.string().url().optional(),
    departmentId: z.string().nullable().optional(),
});

export const InviteUserSchema = z.object({
    email: z.string().email(),
    name: z.string().min(1).max(100),
    role: UserRoleEnum.default("SELLER"),
    departmentId: z.string().optional(),
});

export const UpdateRoleSchema = z.object({
    role: UserRoleEnum,
});

export const UserListQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    role: UserRoleEnum.optional(),
    departmentId: z.string().optional(),
    search: z.string().optional(),
    isActive: z.coerce.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export const UserResponseSchema = z.object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    avatar: z.string().nullable(),
    role: UserRoleEnum,
    orgId: z.string(),
    departmentId: z.string().nullable(),
    isActive: z.boolean(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    department: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
});

export const UserListResponseSchema = z.object({
    data: z.array(UserResponseSchema),
    total: z.number(),
    page: z.number(),
    limit: z.number(),
    totalPages: z.number(),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
export type InviteUserInput = z.infer<typeof InviteUserSchema>;
export type UpdateRoleInput = z.infer<typeof UpdateRoleSchema>;
export type UserListQuery = z.infer<typeof UserListQuerySchema>;