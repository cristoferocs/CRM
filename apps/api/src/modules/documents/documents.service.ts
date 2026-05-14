import { prisma } from "../../lib/prisma.js";
import crypto from "node:crypto";

export class DocumentsService {

    // -------------------------------------------------------------------------
    // CRUD
    // -------------------------------------------------------------------------

    async list(orgId: string, filters?: { contactId?: string; dealId?: string; status?: string; type?: string }) {
        return prisma.document.findMany({
            where: {
                orgId,
                ...(filters?.contactId ? { contactId: filters.contactId } : {}),
                ...(filters?.dealId ? { dealId: filters.dealId } : {}),
                ...(filters?.status ? { status: filters.status as never } : {}),
                ...(filters?.type ? { type: filters.type as never } : {}),
            },
            include: {
                contact: { select: { name: true } },
                deal: { select: { title: true } },
                _count: { select: { versions: true } },
            },
            orderBy: { createdAt: "desc" },
        });
    }

    async findById(id: string, orgId: string) {
        return prisma.document.findFirst({
            where: { id, orgId },
            include: { versions: { orderBy: { version: "desc" } } },
        });
    }

    async create(data: {
        name: string;
        type: string;
        content?: string;
        contactId?: string;
        dealId?: string;
        templateId?: string;
        orgId: string;
        createdById: string;
    }) {
        let content = data.content ?? "";
        if (data.templateId) {
            const template = await prisma.documentTemplate.findFirst({ where: { id: data.templateId, orgId: data.orgId } });
            if (template) content = template.content;
        }

        const doc = await prisma.document.create({
            data: {
                name: data.name,
                type: data.type as never,
                status: "DRAFT",
                variables: { content } as never,
                contactId: data.contactId ?? null,
                dealId: data.dealId ?? null,
                createdById: data.createdById,
                orgId: data.orgId,
            },
        });

        // Create initial version (fileUrl is required — use placeholder for text docs)
        await prisma.documentVersion.create({
            data: { documentId: doc.id, version: 1, fileUrl: `text://v1/${doc.id}`, createdById: data.createdById },
        });

        return doc;
    }

    async update(id: string, data: { name?: string; content?: string; status?: string }, userId: string, orgId: string) {
        const doc = await prisma.document.findFirst({ where: { id, orgId } });
        if (!doc) throw Object.assign(new Error("Document not found"), { statusCode: 404 });

        if (data.content) {
            const lastVersion = await prisma.documentVersion.findFirst({ where: { documentId: id }, orderBy: { version: "desc" } });
            await prisma.documentVersion.create({
                data: { documentId: id, version: (lastVersion?.version ?? 0) + 1, fileUrl: `text://v${(lastVersion?.version ?? 0) + 1}/${id}`, createdById: userId },
            });
        }

        const currentVars = (doc.variables as Record<string, unknown>) ?? {};
        return prisma.document.update({
            where: { id },
            data: {
                ...(data.name ? { name: data.name } : {}),
                ...(data.status ? { status: data.status as never } : {}),
                ...(data.content ? { variables: { ...currentVars, content: data.content } as never } : {}),
            },
        });
    }

    async delete(id: string, orgId: string) {
        const doc = await prisma.document.findFirst({ where: { id, orgId } });
        if (!doc) throw Object.assign(new Error("Document not found"), { statusCode: 404 });
        await prisma.document.delete({ where: { id } });
    }

    // -------------------------------------------------------------------------
    // E-Signature
    // -------------------------------------------------------------------------

    /** Sends a document for signature. Returns a token stored in the doc's variables. */
    async sendForSignature(id: string, signers: Array<{ email: string; name: string }>, orgId: string) {
        const doc = await prisma.document.findFirst({ where: { id, orgId } });
        if (!doc) throw Object.assign(new Error("Document not found"), { statusCode: 404 });
        if (doc.status === "SIGNED") throw Object.assign(new Error("Document already signed"), { statusCode: 400 });

        const token = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
        const currentVars = (doc.variables as Record<string, unknown>) ?? {};

        await prisma.document.update({
            where: { id },
            data: {
                status: "SENT",
                expiresAt,
                signers: signers as never,
                variables: { ...currentVars, signatureToken: token } as never,
            },
        });

        return { token, expiresAt, signers, signingUrl: `/sign/${id}?token=${token}` };
    }

    /** Fetches public signing info given doc ID + token. */
    async getSigningInfo(docId: string, token: string) {
        const doc = await prisma.document.findFirst({ where: { id: docId } });
        if (!doc) throw Object.assign(new Error("Signing link not found"), { statusCode: 404 });
        const vars = (doc.variables as Record<string, unknown>) ?? {};
        if (vars.signatureToken !== token) throw Object.assign(new Error("Invalid signing token"), { statusCode: 403 });
        if (doc.expiresAt && doc.expiresAt < new Date()) throw Object.assign(new Error("Signing link expired"), { statusCode: 410 });
        return { document: { id: doc.id, name: doc.name, type: doc.type, content: vars.content ?? "" }, status: doc.status, expiresAt: doc.expiresAt, signers: doc.signers };
    }

    async sign(docId: string, token: string, signerName: string) {
        const doc = await prisma.document.findFirst({ where: { id: docId } });
        if (!doc) throw Object.assign(new Error("Signing link not found"), { statusCode: 404 });
        const vars = (doc.variables as Record<string, unknown>) ?? {};
        if (vars.signatureToken !== token) throw Object.assign(new Error("Invalid signing token"), { statusCode: 403 });
        if (doc.expiresAt && doc.expiresAt < new Date()) throw Object.assign(new Error("Signing link expired"), { statusCode: 410 });
        if (doc.status === "SIGNED") throw Object.assign(new Error("Document already signed"), { statusCode: 400 });

        const signers = (doc.signers as Array<{ email: string; name: string; signedAt?: string }>) ?? [];
        // Mark the first unsigned signer
        const pending = signers.find(s => !s.signedAt);
        if (!pending) throw Object.assign(new Error("No pending signers"), { statusCode: 400 });
        pending.signedAt = new Date().toISOString();
        pending.name = signerName;

        const allSigned = signers.every(s => s.signedAt);

        return prisma.document.update({
            where: { id: docId },
            data: {
                signers: signers as never,
                status: allSigned ? "SIGNED" : "PARTIALLY_SIGNED",
                ...(allSigned ? { signedAt: new Date() } : {}),
            },
        });
    }

    // -------------------------------------------------------------------------
    // Templates
    // -------------------------------------------------------------------------

    async listTemplates(orgId: string) {
        return prisma.documentTemplate.findMany({ where: { orgId }, orderBy: { name: "asc" } });
    }

    async createTemplate(data: { name: string; type: string; content: string; variables?: string[]; orgId: string; createdById: string }) {
        return prisma.documentTemplate.create({
            data: { name: data.name, type: data.type as never, content: data.content, variables: data.variables ?? [] as never, orgId: data.orgId },
        });
    }

    async renderTemplate(templateId: string, orgId: string, vars: Record<string, string>) {
        const template = await prisma.documentTemplate.findFirst({ where: { id: templateId, orgId } });
        if (!template) throw Object.assign(new Error("Template not found"), { statusCode: 404 });
        const rendered = template.content.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
        return { rendered, template };
    }
}
