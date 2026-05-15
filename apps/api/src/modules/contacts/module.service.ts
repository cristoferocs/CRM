import { ContactsRepository } from "./module.repository.js";
import { fireAutomation } from "../automations/automation-dispatcher.js";
import { TagsService } from "../tags/module.service.js";
import type {
    ContactFilters,
    CreateContactInput,
    UpdateContactInput,
} from "./module.schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Minimal CSV parser.
 * Supports comma/semicolon delimiters and double-quoted fields.
 */
function parseCSV(text: string): Record<string, string>[] {
    const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    if (lines.length < 2) return [];

    // Detect delimiter based on the header row
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const headerLine = lines[0]!;
    const delimiter = headerLine.includes(";") ? ";" : ",";

    const headers = splitCSVRow(headerLine, delimiter).map((h) => h.trim().toLowerCase());

    const result: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
        const line = (lines[i] ?? "").trim();
        if (!line) continue;

        const values = splitCSVRow(line, delimiter);
        const row: Record<string, string> = {};

        for (let j = 0; j < headers.length; j++) {
            const key = headers[j];
            if (key !== undefined) row[key] = (values[j] ?? "").trim();
        }

        result.push(row);
    }

    return result;
}

function splitCSVRow(line: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];

        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === delimiter && !inQuotes) {
            result.push(current);
            current = "";
        } else {
            current += ch;
        }
    }

    result.push(current);
    return result;
}

const CHANNEL_TO_SOURCE: Record<string, string> = {
    WHATSAPP: "WHATSAPP",
    WHATSAPP_OFFICIAL: "WHATSAPP",
    INSTAGRAM: "INSTAGRAM",
    FACEBOOK: "FACEBOOK",
    EMAIL: "EMAIL",
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ContactsService {
    constructor(
        private readonly repo = new ContactsRepository(),
        private readonly tags = new TagsService(),
    ) { }

    /**
     * Resolves the `tags` filter (CSV of either ids or names) into a list of
     * tag ids for the repository to query against. Unknown names are silently
     * ignored — they can't match anything anyway.
     */
    private async resolveTagFilter(orgId: string, csv: string | undefined): Promise<string[] | undefined> {
        if (!csv) return undefined;
        const tokens = csv.split(",").map((t) => t.trim()).filter(Boolean);
        if (tokens.length === 0) return undefined;

        // Anything that doesn't look like a cuid (~24 chars, alphanumeric) is
        // treated as a name lookup. We still try ids-as-names to be lenient.
        const ids = new Set<string>();
        const namesToResolve: string[] = [];
        for (const tok of tokens) {
            if (/^[a-z0-9]{20,}$/i.test(tok)) ids.add(tok);
            else namesToResolve.push(tok);
        }

        for (const name of namesToResolve) {
            const tag = await this.tags["repo"].findByName(name, orgId);
            if (tag) ids.add(tag.id);
        }

        return Array.from(ids);
    }

    async list(orgId: string, filters: ContactFilters) {
        const tagIds = await this.resolveTagFilter(orgId, filters.tags);
        const { data, total } = await this.repo.list(orgId, { ...filters, tagIds });
        return {
            data,
            total,
            page: filters.page,
            limit: filters.limit,
            totalPages: Math.ceil(total / filters.limit),
        };
    }

    async findById(id: string, orgId: string) {
        const contact = await this.repo.findById(id, orgId);
        if (!contact) {
            throw Object.assign(new Error("Contact not found."), { statusCode: 404 });
        }
        return contact;
    }

    /**
     * Deduplication: looks for an existing active contact with the same phone.
     * If found, merges additionalData into it; otherwise creates a new contact.
     */
    async findOrCreateByPhone(
        phone: string,
        orgId: string,
        additionalData: Partial<CreateContactInput> & { channel?: string } = {},
    ) {
        const existing = await this.repo.findByPhone(phone, orgId);
        if (existing) return { contact: existing, created: false };

        const source = additionalData.channel
            ? (CHANNEL_TO_SOURCE[additionalData.channel] ?? "MANUAL")
            : "WHATSAPP";

        const { channel: _channel, ...rest } = additionalData;

        const input: CreateContactInput = {
            name: rest.name ?? phone,
            phone,
            type: rest.type ?? "LEAD",
            source: source as CreateContactInput["source"],
            tags: rest.tags ?? [],
            customFields: rest.customFields ?? {},
            ...rest,
        };

        const contact = await this.create(input, orgId);
        return { contact, created: true };
    }

    async create(data: CreateContactInput, orgId: string, createdByUserId?: string) {
        // Deduplication check
        if (data.phone) {
            const byPhone = await this.repo.findByPhone(data.phone, orgId);
            if (byPhone) {
                throw Object.assign(
                    new Error("A contact with this phone number already exists."),
                    { statusCode: 409 },
                );
            }
        }

        if (data.email) {
            const byEmail = await this.repo.findByEmail(data.email, orgId);
            if (byEmail) {
                throw Object.assign(
                    new Error("A contact with this email already exists."),
                    { statusCode: 409 },
                );
            }
        }

        // Merge explicit tagIds with legacy free-text tag names (CSV importer
        // and external API still send `tags: string[]`). Free-text names get
        // resolved/created so nothing is lost. We also dual-write the legacy
        // `contacts.tags` String[] column with the resolved names so existing
        // Prisma readers (automation executors, agent tools, etc.) keep
        // working during the soak period before the column is dropped.
        const resolved = await this.resolveTags(orgId, data.tagIds, data.tags, createdByUserId);

        const contact = await this.repo.create({
            ...data,
            orgId,
            ...(resolved
                ? { tagIds: resolved.ids, tags: resolved.names }
                : {}),
        });

        await this.repo.createTimelineEvent({
            type: "CONTACT_CREATED",
            title: "Contact created",
            description: `Contact "${contact.name}" was created via ${contact.source}.`,
            contactId: contact.id,
            userId: createdByUserId,
            orgId,
        });

        fireAutomation("CONTACT_CREATED", {
            contactId: contact.id,
            source: contact.source,
            tags: contact.tags.map((t) => t.name),
        }, orgId);

        return contact;
    }

    /**
     * Build the final tag set for create/update, returning both ids (for the
     * relational join) and names (for the legacy String[] column dual-write).
     *
     * - `explicitIds` are validated to belong to org.
     * - `legacyNames` (if any) are find-or-created.
     *
     * Returns undefined when neither input was provided so callers can leave
     * tag relations untouched.
     */
    private async resolveTags(
        orgId: string,
        explicitIds: string[] | undefined,
        legacyNames: string[] | undefined,
        userId?: string,
    ): Promise<{ ids: string[]; names: string[] } | undefined> {
        if (explicitIds === undefined && (!legacyNames || legacyNames.length === 0)) {
            return undefined;
        }
        const byId = new Map<string, { id: string; name: string }>();
        if (explicitIds && explicitIds.length > 0) {
            const validated = await this.tags.resolveIds(explicitIds, orgId);
            validated.forEach((t) => byId.set(t.id, { id: t.id, name: t.name }));
        }
        if (legacyNames && legacyNames.length > 0) {
            for (const name of legacyNames) {
                if (!name?.trim()) continue;
                const tag = await this.tags.findOrCreateByName(name, orgId, userId);
                byId.set(tag.id, { id: tag.id, name: tag.name });
            }
        }
        const list = Array.from(byId.values());
        return { ids: list.map((t) => t.id), names: list.map((t) => t.name) };
    }

    async update(
        id: string,
        data: UpdateContactInput,
        orgId: string,
        updatedByUserId?: string,
    ) {
        const existing = await this.repo.findById(id, orgId);
        if (!existing) {
            throw Object.assign(new Error("Contact not found."), { statusCode: 404 });
        }

        // Deduplication on update
        if (data.phone && data.phone !== existing.phone) {
            const byPhone = await this.repo.findByPhone(data.phone, orgId);
            if (byPhone && byPhone.id !== id) {
                throw Object.assign(
                    new Error("A contact with this phone number already exists."),
                    { statusCode: 409 },
                );
            }
        }

        if (data.email && data.email !== existing.email) {
            const byEmail = await this.repo.findByEmail(data.email, orgId);
            if (byEmail && byEmail.id !== id) {
                throw Object.assign(
                    new Error("A contact with this email already exists."),
                    { statusCode: 409 },
                );
            }
        }

        // Resolve tagIds explicitly OR re-derive from legacy `tags` names.
        // Dual-write the legacy String[] column so existing Prisma readers
        // keep working during the soak period.
        const resolved = await this.resolveTags(orgId, data.tagIds, data.tags, updatedByUserId);

        const updated = await this.repo.update(id, orgId, {
            ...data,
            ...(resolved ? { tagIds: resolved.ids, tags: resolved.names } : {}),
        });

        await this.repo.createTimelineEvent({
            type: "CONTACT_UPDATED",
            title: "Contact updated",
            description: `Contact "${existing.name}" was updated.`,
            metadata: { changedFields: Object.keys(data) },
            contactId: id,
            userId: updatedByUserId,
            orgId,
        });

        fireAutomation("CONTACT_UPDATED", {
            contactId: id,
            changedFields: Object.keys(data),
        }, orgId);

        return updated;
    }

    async delete(id: string, orgId: string, deletedByUserId?: string) {
        const existing = await this.repo.findById(id, orgId);
        if (!existing) {
            throw Object.assign(new Error("Contact not found."), { statusCode: 404 });
        }

        await this.repo.softDelete(id, orgId);

        await this.repo.createTimelineEvent({
            type: "CONTACT_DELETED",
            title: "Contact deleted",
            description: `Contact "${existing.name}" was deleted.`,
            contactId: id,
            userId: deletedByUserId,
            orgId,
        });
    }

    async importCSV(
        fileBuffer: Buffer,
        orgId: string,
        userId?: string,
    ): Promise<{ created: number; skipped: number; errors: { row: number; reason: string }[] }> {
        const text = fileBuffer.toString("utf-8");
        const rows = parseCSV(text);

        const validContacts: (CreateContactInput & { orgId: string })[] = [];
        const errors: { row: number; reason: string }[] = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (!row) continue;
            const rowNum = i + 2; // 1-indexed + header row

            if (!row.name?.trim()) {
                errors.push({ row: rowNum, reason: "Missing required field: name" });
                continue;
            }

            const contactData: CreateContactInput = {
                name: row.name.trim(),
                email: row.email?.trim() || undefined,
                phone: row.phone?.trim() || undefined,
                document: row.document?.trim() || undefined,
                type: (row.type?.toUpperCase() as CreateContactInput["type"]) || "LEAD",
                source: (row.source?.toUpperCase() as CreateContactInput["source"]) || "IMPORT",
                utmSource: row.utm_source?.trim() || undefined,
                utmMedium: row.utm_medium?.trim() || undefined,
                utmCampaign: row.utm_campaign?.trim() || undefined,
                utmContent: row.utm_content?.trim() || undefined,
                utmTerm: row.utm_term?.trim() || undefined,
                adId: row.ad_id?.trim() || undefined,
                tags: row.tags
                    ? row.tags.split(";").map((t) => t.trim()).filter(Boolean)
                    : [],
                customFields: {},
            };

            // Validate type/source values
            const validTypes = ["LEAD", "CUSTOMER", "PARTNER"];
            if (!validTypes.includes(contactData.type)) {
                contactData.type = "LEAD";
            }

            const validSources = [
                "WHATSAPP", "INSTAGRAM", "FACEBOOK", "EMAIL",
                "MANUAL", "IMPORT", "LANDING_PAGE", "ADS",
            ];
            if (!validSources.includes(contactData.source)) {
                contactData.source = "IMPORT";
            }

            validContacts.push({ ...contactData, orgId });
        }

        if (validContacts.length === 0) {
            return { created: 0, skipped: rows.length, errors };
        }

        // Check existing phones/emails for deduplication
        const toCreate: (CreateContactInput & { orgId: string })[] = [];
        let skipped = 0;

        for (const c of validContacts) {
            let duplicate = false;

            if (c.phone) {
                const existing = await this.repo.findByPhone(c.phone, orgId);
                if (existing) {
                    duplicate = true;
                    skipped++;
                }
            }

            if (!duplicate && c.email) {
                const existing = await this.repo.findByEmail(c.email, orgId);
                if (existing) {
                    duplicate = true;
                    skipped++;
                }
            }

            if (!duplicate) toCreate.push(c);
        }

        const created = await this.repo.bulkCreate(toCreate);

        // Single timeline event for the import
        if (created.length > 0 && userId) {
            // Create a timeline event for the first contact as a representative event
            // Full batch timeline events would be too verbose
        }

        return {
            created: created.length,
            skipped,
            errors,
        };
    }

    async getTimeline(id: string, orgId: string) {
        const contact = await this.repo.findById(id, orgId);
        if (!contact) {
            throw Object.assign(new Error("Contact not found."), { statusCode: 404 });
        }

        const { timelineEvents, activities, conversations } = await this.repo.getTimeline(
            id,
            orgId,
        );

        // Merge into a unified event list
        const events = [
            ...timelineEvents.map((e) => ({
                id: e.id,
                type: e.type,
                title: e.title,
                description: e.description,
                metadata: e.metadata as Record<string, unknown>,
                contactId: e.contactId,
                userId: e.userId,
                orgId: e.orgId,
                createdAt: e.createdAt,
                user: e.user ?? null,
            })),
            ...activities.map((a) => ({
                id: a.id,
                type: `ACTIVITY_${a.type}`,
                title: a.title,
                description: a.description ?? null,
                metadata: { dueAt: a.dueAt, completedAt: a.completedAt } as Record<string, unknown>,
                contactId: id,
                userId: a.userId,
                orgId: a.orgId,
                createdAt: a.createdAt,
                user: a.user ?? null,
            })),
            ...conversations.map((c) => ({
                id: c.id,
                type: `CONVERSATION_${c.channel}`,
                title: `Conversation via ${c.channel}`,
                description: c.messages[0]?.content?.slice(0, 100) ?? null,
                metadata: {
                    channel: c.channel,
                    status: c.status,
                    messageCount: c.messages.length,
                } as Record<string, unknown>,
                contactId: id,
                userId: null,
                orgId,
                createdAt: c.createdAt,
                user: null,
            })),
        ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        return { events };
    }

    async getDeals(id: string, orgId: string) {
        await this.findById(id, orgId);
        return this.repo.getContactDeals(id, orgId);
    }

    async getConversations(id: string, orgId: string) {
        await this.findById(id, orgId);
        return this.repo.getContactConversations(id, orgId);
    }

    /**
     * Legacy: accepts either a tag id (cuid-like) or a free-text tag name. If
     * a name is passed and doesn't exist, the tag is auto-created with a
     * default color so the legacy API stays usable for external integrations.
     */
    async addTag(id: string, tagInput: string, orgId: string, userId?: string) {
        const contact = await this.repo.findById(id, orgId);
        if (!contact) {
            throw Object.assign(new Error("Contact not found."), { statusCode: 404 });
        }

        // Resolve to a Tag row.
        let tag = await this.tags["repo"].findById(tagInput, orgId);
        if (!tag) {
            tag = await this.tags.findOrCreateByName(tagInput, orgId, userId);
        }

        const updated = await this.repo.addTagRelation(id, orgId, tag.id);

        await this.repo.createTimelineEvent({
            type: "TAG_ADDED",
            title: `Tag added: ${tag.name}`,
            metadata: { tag: tag.name, tagId: tag.id },
            contactId: id,
            userId,
            orgId,
        });

        fireAutomation("CONTACT_TAG_ADDED", { contactId: id, tag: tag.name, tagId: tag.id }, orgId);

        return updated;
    }

    async removeTag(id: string, tagInput: string, orgId: string, userId?: string) {
        const contact = await this.repo.findById(id, orgId);
        if (!contact) {
            throw Object.assign(new Error("Contact not found."), { statusCode: 404 });
        }

        let tag = await this.tags["repo"].findById(tagInput, orgId);
        if (!tag) tag = await this.tags["repo"].findByName(tagInput, orgId);
        if (!tag) return contact;

        const updated = await this.repo.removeTagRelation(id, orgId, tag.id);

        await this.repo.createTimelineEvent({
            type: "TAG_REMOVED",
            title: `Tag removed: ${tag.name}`,
            metadata: { tag: tag.name, tagId: tag.id },
            contactId: id,
            userId,
            orgId,
        });

        return updated;
    }

    getStats(orgId: string) {
        return this.repo.getStats(orgId);
    }
}
