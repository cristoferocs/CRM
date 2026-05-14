import { z } from "zod";

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export const LoginSchema = z.object({
    firebaseToken: z.string().min(1),
});

export const DevLoginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
});

export const RefreshSchema = z.object({
    // Optional — refresh routes now also accept the token from the HttpOnly cookie.
    refreshToken: z.string().min(1).optional(),
});

// ---------------------------------------------------------------------------
// Shared sub-schemas
// ---------------------------------------------------------------------------

export const OrgSummarySchema = z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    plan: z.enum(["STARTER", "GROWTH", "ENTERPRISE"]),
});

export const DepartmentSummarySchema = z.object({
    id: z.string(),
    name: z.string(),
});

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
// Responses
// ---------------------------------------------------------------------------

export const MeResponseSchema = z.object({
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
    org: OrgSummarySchema,
    department: DepartmentSummarySchema.nullable(),
});

export const LoginResponseSchema = z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
    user: MeResponseSchema,
});

export const RefreshResponseSchema = z.object({
    accessToken: z.string(),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LoginInput = z.infer<typeof LoginSchema>;
export type DevLoginInput = z.infer<typeof DevLoginSchema>;
export type RefreshInput = z.infer<typeof RefreshSchema>;
export type MeResponse = z.infer<typeof MeResponseSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;