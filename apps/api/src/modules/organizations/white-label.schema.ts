import { z } from "zod";

// ---------------------------------------------------------------------------
// Hex color validator
// ---------------------------------------------------------------------------

const hexColor = z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color (e.g. #5b5bff)");

// ---------------------------------------------------------------------------
// Full settings schema
// ---------------------------------------------------------------------------

export const WhiteLabelSettingsSchema = z.object({
    // Visual identity
    platformName: z.string().min(1).max(100),
    logoUrl: z.string().url().nullable(),
    faviconUrl: z.string().url().nullable(),
    primaryColor: hexColor,
    secondaryColor: hexColor,
    accentColor: hexColor,

    // Login screen
    loginBackground: z.string().url().nullable(),
    loginTagline: z.string().max(200).nullable(),

    // E-mail
    emailFromName: z.string().min(1).max(100),
    emailFromAddress: z.string().email(),
    emailFooter: z.string().max(500).nullable(),

    // Support / legal
    supportEmail: z.string().email().nullable(),
    supportWhatsapp: z.string().max(30).nullable(),
    termsUrl: z.string().url().nullable(),
    privacyUrl: z.string().url().nullable(),
});

// ---------------------------------------------------------------------------
// Update (all fields optional — partial)
// ---------------------------------------------------------------------------

export const UpdateWhiteLabelSchema = WhiteLabelSettingsSchema.partial();

// ---------------------------------------------------------------------------
// Public subset — returned before authentication
// ---------------------------------------------------------------------------

export const WhiteLabelPublicSchema = WhiteLabelSettingsSchema.pick({
    platformName: true,
    logoUrl: true,
    faviconUrl: true,
    primaryColor: true,
    secondaryColor: true,
    accentColor: true,
    loginBackground: true,
    loginTagline: true,
});

// ---------------------------------------------------------------------------
// Domain response (includes optional DNS verification hints)
// ---------------------------------------------------------------------------

export const WhiteLabelDomainResponseSchema = z.object({
    id: z.string(),
    domain: z.string(),
    isVerified: z.boolean(),
    orgId: z.string(),
    createdAt: z.coerce.date(),
    verificationTxtRecord: z.string().optional(),
    verificationValue: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WhiteLabelSettings = z.infer<typeof WhiteLabelSettingsSchema>;
export type UpdateWhiteLabelInput = z.infer<typeof UpdateWhiteLabelSchema>;
export type WhiteLabelPublicSettings = z.infer<typeof WhiteLabelPublicSchema>;
