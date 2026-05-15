import { prisma } from "../../lib/prisma.js";
import type { Prisma } from "@prisma/client";
import type { TagFilters } from "./module.schema.js";

const tagSelect = {
    id: true,
    name: true,
    color: true,
    orgId: true,
    createdBy: true,
    createdAt: true,
    updatedAt: true,
} as const;

export class TagsRepository {
    async list(orgId: string, filters: TagFilters) {
        const where: Prisma.TagWhereInput = {
            orgId,
            ...(filters.search
                ? { name: { contains: filters.search, mode: "insensitive" as const } }
                : {}),
        };

        const [data, total] = await Promise.all([
            prisma.tag.findMany({
                where,
                select: tagSelect,
                take: filters.limit,
                orderBy: { name: "asc" },
            }),
            prisma.tag.count({ where }),
        ]);

        return { data, total };
    }

    findById(id: string, orgId: string) {
        return prisma.tag.findFirst({
            where: { id, orgId },
            select: tagSelect,
        });
    }

    findByName(name: string, orgId: string) {
        return prisma.tag.findFirst({
            where: { orgId, name: { equals: name, mode: "insensitive" } },
            select: tagSelect,
        });
    }

    findManyByIds(ids: string[], orgId: string) {
        if (ids.length === 0) return Promise.resolve([]);
        return prisma.tag.findMany({
            where: { id: { in: ids }, orgId },
            select: tagSelect,
        });
    }

    create(data: { name: string; color: string; orgId: string; createdBy?: string | null }) {
        return prisma.tag.create({
            data: {
                name: data.name,
                color: data.color,
                orgId: data.orgId,
                createdBy: data.createdBy ?? null,
            },
            select: tagSelect,
        });
    }

    update(id: string, orgId: string, data: { name?: string; color?: string }) {
        return prisma.tag.update({
            where: { id },
            data: {
                ...(data.name !== undefined ? { name: data.name } : {}),
                ...(data.color !== undefined ? { color: data.color } : {}),
            },
            select: tagSelect,
        });
    }

    async delete(id: string, orgId: string) {
        // Existence + ownership has already been validated by the service.
        await prisma.tag.deleteMany({ where: { id, orgId } });
    }

    async usage(id: string, orgId: string) {
        // Ensure cross-org isolation: only count vínculos where the tag belongs to org.
        const tag = await prisma.tag.findFirst({ where: { id, orgId }, select: { id: true } });
        if (!tag) return null;

        const [contactCount, dealCount] = await Promise.all([
            prisma.contactTag.count({ where: { tagId: id } }),
            prisma.dealTag.count({ where: { tagId: id } }),
        ]);

        return { tagId: id, contactCount, dealCount };
    }
}
