import { z } from "zod";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const ContactTypeEnum = z.enum(["LEAD", "CUSTOMER", "PARTNER"]);
export const ContactSourceEnum = z.enum([
    "WHATSAPP",
    "INSTAGRAM",
    "FACEBOOK",
    "EMAIL",
    "MANUAL",
    "IMPORT",
    "LANDING_PAGE",
    "ADS",
]);

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export const CreateContactSchema = z.object({
    name: z.string().min(1).max(200),
    email: z.string().email().optional(),
    phone: z.string().max(30).optional(),
    document: z.string().max(30).optional(),
    avatar: z.string().url().optional(),
    type: ContactTypeEnum.default("LEAD"),
    source: ContactSourceEnum.default("MANUAL"),
    utmSource: z.string().max(200).optional(),
    utmMedium: z.string().max(200).optional(),
    utmCampaign: z.string().max(200).optional(),
    utmContent: z.string().max(200).optional(),
    utmTerm: z.string().max(200).optional(),
    adId: z.string().max(200).optional(),
    adsetId: z.string().max(200).optional(),
    campaignId: z.string().max(200).optional(),
    pixelSessionId: z.string().max(200).optional(),
    tags: z.array(z.string().max(100)).default([]),
    customFields: z.record(z.string(), z.unknown()).default({}),
    companyId: z.string().optional(),
    branchId: z.string().optional(),
});

export const UpdateContactSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    email: z.string().email().nullable().optional(),
    phone: z.string().max(30).nullable().optional(),
    document: z.string().max(30).nullable().optional(),
    avatar: z.string().url().nullable().optional(),
    type: ContactTypeEnum.optional(),
    source: ContactSourceEnum.optional(),
    utmSource: z.string().max(200).nullable().optional(),
    utmMedium: z.string().max(200).nullable().optional(),
    utmCampaign: z.string().max(200).nullable().optional(),
    utmContent: z.string().max(200).nullable().optional(),
    utmTerm: z.string().max(200).nullable().optional(),
    adId: z.string().max(200).nullable().optional(),
    adsetId: z.string().max(200).nullable().optional(),
    campaignId: z.string().max(200).nullable().optional(),
    pixelSessionId: z.string().max(200).nullable().optional(),
    tags: z.array(z.string().max(100)).optional(),
    customFields: z.record(z.string(), z.unknown()).optional(),
    companyId: z.string().nullable().optional(),
    branchId: z.string().nullable().optional(),
});

export const ContactFiltersSchema = z.object({
    search: z.string().max(200).optional(),
    type: ContactTypeEnum.optional(),
    source: ContactSourceEnum.optional(),
    tags: z.string().optional(),
    assignedTo: z.string().optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const BulkImportSchema = z.object({
    contacts: z.array(CreateContactSchema).min(1).max(5000),
});

export const AddTagSchema = z.object({
    tag: z.string().min(1).max(100),
});

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export const ContactResponseSchema = z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    document: z.string().nullable(),
    avatar: z.string().nullable(),
    type: ContactTypeEnum,
    source: ContactSourceEnum,
    utmSource: z.string().nullable(),
    utmMedium: z.string().nullable(),
    utmCampaign: z.string().nullable(),
    utmContent: z.string().nullable(),
    utmTerm: z.string().nullable(),
    adId: z.string().nullable(),
    adsetId: z.string().nullable(),
    campaignId: z.string().nullable(),
    pixelSessionId: z.string().nullable(),
    tags: z.array(z.string()),
    customFields: z.record(z.string(), z.unknown()),
    orgId: z.string(),
    companyId: z.string().nullable(),
    branchId: z.string().nullable(),
    isActive: z.boolean(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
});

export const ContactListResponseSchema = z.object({
    data: z.array(ContactResponseSchema),
    total: z.number(),
    page: z.number(),
    limit: z.number(),
    totalPages: z.number(),
});

export const ContactStatsResponseSchema = z.object({
    total: z.number(),
    byType: z.record(z.string(), z.number()),
    bySource: z.record(z.string(), z.number()),
    newThisMonth: z.number(),
});

export const TimelineEventResponseSchema = z.object({
    id: z.string(),
    type: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()),
    contactId: z.string(),
    userId: z.string().nullable(),
    orgId: z.string(),
    createdAt: z.coerce.date(),
    user: z
        .object({ id: z.string(), name: z.string(), avatar: z.string().nullable() })
        .nullable()
        .optional(),
});

export const ContactTimelineResponseSchema = z.object({
    events: z.array(TimelineEventResponseSchema),
});

export const ImportResultResponseSchema = z.object({
    created: z.number(),
    skipped: z.number(),
    errors: z.array(z.object({ row: z.number(), reason: z.string() })),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreateContactInput = z.infer<typeof CreateContactSchema>;
export type UpdateContactInput = z.infer<typeof UpdateContactSchema>;
export type ContactFilters = z.infer<typeof ContactFiltersSchema>;
export type BulkImportInput = z.infer<typeof BulkImportSchema>;
export type AddTagInput = z.infer<typeof AddTagSchema>;