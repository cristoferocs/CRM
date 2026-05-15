import { TagsRepository } from "./module.repository.js";
import type { CreateTagInput, UpdateTagInput, TagFilters } from "./module.schema.js";

function notFound(): never {
    throw Object.assign(new Error("Tag not found."), { statusCode: 404 });
}

function conflict(msg: string): never {
    throw Object.assign(new Error(msg), { statusCode: 409 });
}

export class TagsService {
    constructor(private readonly repo = new TagsRepository()) { }

    list(orgId: string, filters: TagFilters) {
        return this.repo.list(orgId, filters);
    }

    async findById(id: string, orgId: string) {
        const tag = await this.repo.findById(id, orgId);
        if (!tag) notFound();
        return tag;
    }

    async create(input: CreateTagInput, orgId: string, userId?: string) {
        const existing = await this.repo.findByName(input.name, orgId);
        if (existing) conflict("Já existe uma tag com este nome.");

        return this.repo.create({
            name: input.name,
            color: input.color,
            orgId,
            createdBy: userId ?? null,
        });
    }

    /**
     * Find by name (case-insensitive) or create. Used by legacy compat endpoints
     * that still pass tag names instead of ids.
     */
    async findOrCreateByName(name: string, orgId: string, userId?: string) {
        const trimmed = name.trim();
        if (!trimmed) throw Object.assign(new Error("Tag name cannot be empty."), { statusCode: 400 });
        const existing = await this.repo.findByName(trimmed, orgId);
        if (existing) return existing;
        return this.repo.create({
            name: trimmed,
            color: "#7c5cfc",
            orgId,
            createdBy: userId ?? null,
        });
    }

    async resolveIds(ids: string[], orgId: string) {
        if (ids.length === 0) return [];
        const found = await this.repo.findManyByIds(ids, orgId);
        if (found.length !== new Set(ids).size) {
            throw Object.assign(
                new Error("One or more tags do not belong to this organization."),
                { statusCode: 400 },
            );
        }
        return found;
    }

    async update(id: string, input: UpdateTagInput, orgId: string) {
        const tag = await this.repo.findById(id, orgId);
        if (!tag) notFound();

        if (input.name && input.name.toLowerCase() !== tag.name.toLowerCase()) {
            const dup = await this.repo.findByName(input.name, orgId);
            if (dup && dup.id !== id) conflict("Já existe uma tag com este nome.");
        }

        return this.repo.update(id, orgId, input);
    }

    async delete(id: string, orgId: string) {
        const tag = await this.repo.findById(id, orgId);
        if (!tag) notFound();

        const usage = await this.repo.usage(id, orgId);
        const counts = usage ?? { contactCount: 0, dealCount: 0 };

        await this.repo.delete(id, orgId);

        return {
            deleted: true as const,
            removedFromContacts: counts.contactCount,
            removedFromDeals: counts.dealCount,
        };
    }

    async usage(id: string, orgId: string) {
        const result = await this.repo.usage(id, orgId);
        if (!result) notFound();
        return result;
    }
}
