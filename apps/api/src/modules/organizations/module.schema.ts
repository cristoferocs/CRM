import { z } from "zod";

export const PlanEnum = z.enum(["STARTER", "GROWTH", "ENTERPRISE"]);

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const OrganizationSettingsSchema = z.object({
    timezone: z.string().optional(),
    currency: z.string().optional(),
    language: z.string().optional(),
    businessHoursStart: z.string().optional(),
    businessHoursEnd: z.string().optional(),
    businessDays: z.array(z.number().int().min(0).max(6)).optional(),
    whatsappEnabled: z.boolean().optional(),
    instagramEnabled: z.boolean().optional(),
    facebookEnabled: z.boolean().optional(),
    emailEnabled: z.boolean().optional(),
    autoAssignConversations: z.boolean().optional(),
    maxConversationsPerAgent: z.number().int().min(1).optional(),
    aiEnabled: z.boolean().optional(),
    slaResponseMinutes: z.number().int().min(1).optional(),
});

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export const CreateOrganizationSchema = z.object({
    name: z.string().min(2).max(100),
    slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
    plan: PlanEnum.optional(),
    settings: OrganizationSettingsSchema.optional(),
});

export const UpdateOrganizationSchema = z.object({
    name: z.string().min(2).max(100).optional(),
    isActive: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Response
// ---------------------------------------------------------------------------

export const OrganizationResponseSchema = z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    plan: PlanEnum,
    isActive: z.boolean(),
    settings: z.any(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreateOrganizationInput = z.infer<typeof CreateOrganizationSchema>;
export type UpdateOrganizationInput = z.infer<typeof UpdateOrganizationSchema>;
export type OrganizationSettingsInput = z.infer<typeof OrganizationSettingsSchema>;
export type OrganizationResponse = z.infer<typeof OrganizationResponseSchema>;