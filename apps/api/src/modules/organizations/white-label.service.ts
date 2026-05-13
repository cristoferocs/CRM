import { createHash } from "crypto";
import { promises as dnsPromises } from "dns";
import { prisma } from "../../lib/prisma.js";
import { getStorageBucket } from "../../lib/storage.js";
import type {
    UpdateWhiteLabelInput,
    WhiteLabelPublicSettings,
    WhiteLabelSettings,
} from "./white-label.schema.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLOWED_LOGO_TYPES = new Set([
    "image/png",
    "image/jpeg",
    "image/svg+xml",
    "image/webp",
]);

const ALLOWED_FAVICON_TYPES = new Set([
    "image/x-icon",
    "image/vnd.microsoft.icon",
    "image/png",
]);

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB

const MIME_TO_EXT: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/svg+xml": "svg",
    "image/webp": "webp",
    "image/x-icon": "ico",
    "image/vnd.microsoft.icon": "ico",
};

const DEFAULT_WHITE_LABEL: WhiteLabelSettings = {
    platformName: process.env.DEFAULT_PLATFORM_NAME ?? "CRM Base",
    logoUrl: null,
    faviconUrl: null,
    primaryColor: "#5b5bff",
    secondaryColor: "#00e5c0",
    accentColor: "#ff5b8d",
    loginBackground: null,
    loginTagline: null,
    emailFromName: process.env.DEFAULT_EMAIL_FROM_NAME ?? "CRM Base",
    emailFromAddress: process.env.DEFAULT_EMAIL_FROM ?? "noreply@crmbase.io",
    emailFooter: null,
    supportEmail: null,
    supportWhatsapp: null,
    termsUrl: null,
    privacyUrl: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deterministic 24-char verification token derived from the org id. */
function verificationToken(orgId: string): string {
    return createHash("sha256").update(orgId).digest("hex").slice(0, 24);
}

async function uploadToGCS(
    buffer: Buffer,
    mimeType: string,
    gcsPath: string,
): Promise<string> {
    const bucket = getStorageBucket();
    const file = bucket.file(gcsPath);

    await file.save(buffer, {
        metadata: { contentType: mimeType },
        resumable: false,
    });

    await file.makePublic();

    return `https://storage.googleapis.com/${bucket.name}/${gcsPath}`;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class WhiteLabelService {
    // -----------------------------------------------------------------------
    // Settings
    // -----------------------------------------------------------------------

    async getSettings(orgId: string): Promise<WhiteLabelSettings> {
        const row = await prisma.organization.findUnique({
            where: { id: orgId },
            select: { whiteLabelSettings: true },
        });

        if (!row) {
            throw Object.assign(new Error("Organization not found."), { statusCode: 404 });
        }

        if (!row.whiteLabelSettings) {
            return { ...DEFAULT_WHITE_LABEL };
        }

        return { ...DEFAULT_WHITE_LABEL, ...(row.whiteLabelSettings as object) } as WhiteLabelSettings;
    }

    async updateSettings(
        orgId: string,
        data: UpdateWhiteLabelInput,
        userId?: string,
    ): Promise<WhiteLabelSettings> {
        const current = await this.getSettings(orgId);
        const merged: WhiteLabelSettings = { ...current, ...data };

        await prisma.organization.update({
            where: { id: orgId },
            data: { whiteLabelSettings: merged as object },
        });

        await prisma.auditLog.create({
            data: {
                action: "UPDATE",
                resource: "white_label_settings",
                resourceId: orgId,
                oldData: current as object,
                newData: merged as object,
                userId: userId ?? null,
                orgId,
            },
        });

        return merged;
    }

    // -----------------------------------------------------------------------
    // Public lookup (before auth — used on login screen)
    // -----------------------------------------------------------------------

    async getPublicByDomain(domain: string): Promise<WhiteLabelPublicSettings | null> {
        const wlDomain = await prisma.whiteLabelDomain.findUnique({
            where: { domain },
            select: {
                isVerified: true,
                org: { select: { id: true } },
            },
        });

        if (!wlDomain?.isVerified) return null;

        const settings = await this.getSettings(wlDomain.org.id);

        return {
            platformName: settings.platformName,
            logoUrl: settings.logoUrl,
            faviconUrl: settings.faviconUrl,
            primaryColor: settings.primaryColor,
            secondaryColor: settings.secondaryColor,
            accentColor: settings.accentColor,
            loginBackground: settings.loginBackground,
            loginTagline: settings.loginTagline,
        };
    }

    // -----------------------------------------------------------------------
    // Uploads
    // -----------------------------------------------------------------------

    async uploadLogo(buffer: Buffer, mimeType: string, orgId: string): Promise<string> {
        if (!ALLOWED_LOGO_TYPES.has(mimeType)) {
            throw Object.assign(
                new Error("Invalid file type. Allowed: png, jpg, svg, webp."),
                { statusCode: 400 },
            );
        }
        if (buffer.byteLength > MAX_FILE_SIZE) {
            throw Object.assign(new Error("File exceeds the 2 MB limit."), { statusCode: 400 });
        }

        const ext = MIME_TO_EXT[mimeType] ?? "png";
        const path = `orgs/${orgId}/white-label/logo.${ext}`;
        return uploadToGCS(buffer, mimeType, path);
    }

    async uploadFavicon(buffer: Buffer, mimeType: string, orgId: string): Promise<string> {
        if (!ALLOWED_FAVICON_TYPES.has(mimeType)) {
            throw Object.assign(
                new Error("Invalid file type. Allowed: ico, png."),
                { statusCode: 400 },
            );
        }
        if (buffer.byteLength > MAX_FILE_SIZE) {
            throw Object.assign(new Error("File exceeds the 2 MB limit."), { statusCode: 400 });
        }

        const ext = MIME_TO_EXT[mimeType] ?? "ico";
        const path = `orgs/${orgId}/white-label/favicon.${ext}`;
        return uploadToGCS(buffer, mimeType, path);
    }

    // -----------------------------------------------------------------------
    // Custom domain management
    // -----------------------------------------------------------------------

    async addDomain(domain: string, orgId: string) {
        // Check if already claimed by a different org
        const existing = await prisma.whiteLabelDomain.findUnique({ where: { domain } });

        if (existing && existing.orgId !== orgId) {
            throw Object.assign(
                new Error("Domain is already registered by another organization."),
                { statusCode: 409 },
            );
        }

        // Already registered for this org — return existing record + instructions
        if (existing?.orgId === orgId) {
            return {
                ...existing,
                verificationTxtRecord: `_crm-verify.${domain}`,
                verificationValue: `crm-site-verification=${verificationToken(orgId)}`,
            };
        }

        // One org = one domain; remove any previous entry
        await prisma.whiteLabelDomain.deleteMany({ where: { orgId } });

        const record = await prisma.whiteLabelDomain.create({
            data: { domain, orgId, isVerified: false },
        });

        return {
            ...record,
            verificationTxtRecord: `_crm-verify.${domain}`,
            verificationValue: `crm-site-verification=${verificationToken(orgId)}`,
        };
    }

    async verifyDomain(orgId: string): Promise<boolean> {
        const record = await prisma.whiteLabelDomain.findUnique({ where: { orgId } });

        if (!record) {
            throw Object.assign(
                new Error("No domain registered for this organization."),
                { statusCode: 404 },
            );
        }

        if (record.isVerified) return true;

        const expected = `crm-site-verification=${verificationToken(orgId)}`;
        const lookupHost = `_crm-verify.${record.domain}`;

        let verified = false;

        try {
            const txtRecords = await dnsPromises.resolveTxt(lookupHost);
            verified = txtRecords.flat().some((v) => v === expected);
        } catch {
            // DNS lookup failed — TXT record not found or domain unreachable
            verified = false;
        }

        if (verified) {
            await prisma.whiteLabelDomain.update({
                where: { orgId },
                data: { isVerified: true },
            });
        }

        return verified;
    }

    async removeDomain(orgId: string): Promise<void> {
        await prisma.whiteLabelDomain.deleteMany({ where: { orgId } });
    }
}
