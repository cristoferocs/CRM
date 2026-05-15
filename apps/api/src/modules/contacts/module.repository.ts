import { prisma } from "../../lib/prisma.js";
import type { Prisma } from "@prisma/client";
import type { ContactFilters, CreateContactInput, UpdateContactInput } from "./module.schema.js";

const tagSelect = {
    id: true,
    name: true,
    color: true,
    orgId: true,
    createdBy: true,
    createdAt: true,
    updatedAt: true,
} as const;

const contactSelectInternal = {
    id: true,
    name: true,
    email: true,
    phone: true,
    document: true,
    avatar: true,
    type: true,
    source: true,
    utmSource: true,
    utmMedium: true,
    utmCampaign: true,
    utmContent: true,
    utmTerm: true,
    adId: true,
    adsetId: true,
    campaignId: true,
    pixelSessionId: true,
    tagRelations: { include: { tag: { select: tagSelect } } },
    customFields: true,
    orgId: true,
    companyId: true,
    branchId: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
} as const;

type ContactRow = Prisma.ContactGetPayload<{ select: typeof contactSelectInternal }>;

function toContactResponse(row: ContactRow) {
    const { tagRelations, ...rest } = row;
    return {
        ...rest,
        tags: tagRelations.map((r) => r.tag),
    };
}

export class ContactsRepository {
    async list(orgId: string, filters: ContactFilters & { tagIds?: string[] }) {
        const { search, type, source, assignedTo, dateFrom, dateTo, page, limit } = filters;
        const skip = (page - 1) * limit;

        const where: Prisma.ContactWhereInput = {
            orgId,
            isActive: true,
            ...(type ? { type } : {}),
            ...(source ? { source } : {}),
            ...(filters.tagIds && filters.tagIds.length > 0
                ? { tagRelations: { some: { tagId: { in: filters.tagIds } } } }
                : {}),
            ...(assignedTo
                ? { deals: { some: { ownerId: assignedTo, isActive: true } } }
                : {}),
            ...(dateFrom || dateTo
                ? {
                    createdAt: {
                        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
                        ...(dateTo ? { lte: new Date(dateTo) } : {}),
                    },
                }
                : {}),
            ...(search
                ? {
                    OR: [
                        { name: { contains: search, mode: "insensitive" as const } },
                        { email: { contains: search, mode: "insensitive" as const } },
                        { phone: { contains: search, mode: "insensitive" as const } },
                    ],
                }
                : {}),
        };

        const [rows, total] = await Promise.all([
            prisma.contact.findMany({
                where,
                select: contactSelectInternal,
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
            }),
            prisma.contact.count({ where }),
        ]);

        return { data: rows.map(toContactResponse), total };
    }

    async findById(id: string, orgId: string) {
        const row = await prisma.contact.findFirst({
            where: { id, orgId, isActive: true },
            select: contactSelectInternal,
        });
        return row ? toContactResponse(row) : null;
    }

    async findByPhone(phone: string, orgId: string) {
        const row = await prisma.contact.findFirst({
            where: { phone, orgId, isActive: true },
            select: contactSelectInternal,
        });
        return row ? toContactResponse(row) : null;
    }

    async findByEmail(email: string, orgId: string) {
        const row = await prisma.contact.findFirst({
            where: { email, orgId, isActive: true },
            select: contactSelectInternal,
        });
        return row ? toContactResponse(row) : null;
    }

    async create(data: CreateContactInput & { orgId: string; tagIds?: string[] }) {
        const row = await prisma.contact.create({
            data: {
                name: data.name,
                email: data.email ?? null,
                phone: data.phone ?? null,
                document: data.document ?? null,
                avatar: data.avatar ?? null,
                type: data.type as never,
                source: data.source as never,
                utmSource: data.utmSource ?? null,
                utmMedium: data.utmMedium ?? null,
                utmCampaign: data.utmCampaign ?? null,
                utmContent: data.utmContent ?? null,
                utmTerm: data.utmTerm ?? null,
                adId: data.adId ?? null,
                adsetId: data.adsetId ?? null,
                campaignId: data.campaignId ?? null,
                pixelSessionId: data.pixelSessionId ?? null,
                tags: data.tags ?? [],
                customFields: (data.customFields ?? {}) as never,
                orgId: data.orgId,
                companyId: data.companyId ?? null,
                branchId: data.branchId ?? null,
                ...(data.tagIds && data.tagIds.length > 0
                    ? { tagRelations: { create: data.tagIds.map((tagId) => ({ tagId })) } }
                    : {}),
            },
            select: contactSelectInternal,
        });
        return toContactResponse(row);
    }

    async update(id: string, orgId: string, data: UpdateContactInput & { tagIds?: string[] }) {
        await prisma.$transaction(async (tx) => {
            await tx.contact.updateMany({
                where: { id, orgId, isActive: true },
                data: {
                    ...(data.name !== undefined ? { name: data.name } : {}),
                    ...(data.email !== undefined ? { email: data.email } : {}),
                    ...(data.phone !== undefined ? { phone: data.phone } : {}),
                    ...(data.document !== undefined ? { document: data.document } : {}),
                    ...(data.avatar !== undefined ? { avatar: data.avatar } : {}),
                    ...(data.type !== undefined ? { type: data.type as never } : {}),
                    ...(data.source !== undefined ? { source: data.source as never } : {}),
                    ...(data.utmSource !== undefined ? { utmSource: data.utmSource } : {}),
                    ...(data.utmMedium !== undefined ? { utmMedium: data.utmMedium } : {}),
                    ...(data.utmCampaign !== undefined ? { utmCampaign: data.utmCampaign } : {}),
                    ...(data.utmContent !== undefined ? { utmContent: data.utmContent } : {}),
                    ...(data.utmTerm !== undefined ? { utmTerm: data.utmTerm } : {}),
                    ...(data.adId !== undefined ? { adId: data.adId } : {}),
                    ...(data.adsetId !== undefined ? { adsetId: data.adsetId } : {}),
                    ...(data.campaignId !== undefined ? { campaignId: data.campaignId } : {}),
                    ...(data.pixelSessionId !== undefined ? { pixelSessionId: data.pixelSessionId } : {}),
                    ...(data.tags !== undefined ? { tags: data.tags } : {}),
                    ...(data.customFields !== undefined ? { customFields: data.customFields as never } : {}),
                    ...(data.companyId !== undefined ? { companyId: data.companyId } : {}),
                    ...(data.branchId !== undefined ? { branchId: data.branchId } : {}),
                },
            });

            if (data.tagIds !== undefined) {
                await tx.contactTag.deleteMany({ where: { contactId: id } });
                if (data.tagIds.length > 0) {
                    await tx.contactTag.createMany({
                        data: data.tagIds.map((tagId) => ({ contactId: id, tagId })),
                        skipDuplicates: true,
                    });
                }
            }
        });

        const row = await prisma.contact.findFirst({
            where: { id, orgId },
            select: contactSelectInternal,
        });
        return row ? toContactResponse(row) : null;
    }

    softDelete(id: string, orgId: string) {
        return prisma.contact.updateMany({
            where: { id, orgId, isActive: true },
            data: { isActive: false },
        });
    }

    async bulkCreate(contacts: (CreateContactInput & { orgId: string; tagIds?: string[] })[]) {
        const created = await prisma.$transaction(
            contacts.map((c) =>
                prisma.contact.create({
                    data: {
                        name: c.name,
                        email: c.email ?? null,
                        phone: c.phone ?? null,
                        document: c.document ?? null,
                        avatar: c.avatar ?? null,
                        type: c.type as never,
                        source: c.source as never,
                        utmSource: c.utmSource ?? null,
                        utmMedium: c.utmMedium ?? null,
                        utmCampaign: c.utmCampaign ?? null,
                        utmContent: c.utmContent ?? null,
                        utmTerm: c.utmTerm ?? null,
                        adId: c.adId ?? null,
                        adsetId: c.adsetId ?? null,
                        campaignId: c.campaignId ?? null,
                        pixelSessionId: c.pixelSessionId ?? null,
                        tags: c.tags ?? [],
                        customFields: (c.customFields ?? {}) as never,
                        orgId: c.orgId,
                        companyId: c.companyId ?? null,
                        branchId: c.branchId ?? null,
                        ...(c.tagIds && c.tagIds.length > 0
                            ? { tagRelations: { create: c.tagIds.map((tagId) => ({ tagId })) } }
                            : {}),
                    },
                    select: { id: true },
                }),
            ),
        );

        return created;
    }

    async addTagRelation(contactId: string, orgId: string, tagId: string) {
        const contact = await prisma.contact.findFirst({
            where: { id: contactId, orgId, isActive: true },
            select: { id: true, tags: true, tagRelations: { select: { tag: { select: { name: true } } } } },
        });
        if (!contact) return null;

        await prisma.$transaction(async (tx) => {
            await tx.contactTag.upsert({
                where: { contactId_tagId: { contactId, tagId } },
                create: { contactId, tagId },
                update: {},
            });
            // Dual-write legacy String[] from the canonical join table so
            // automation executors that read `contact.tags` keep seeing the
            // current set during the soak period.
            const tag = await tx.tag.findUnique({ where: { id: tagId }, select: { name: true } });
            if (tag) {
                const next = Array.from(new Set([...contact.tags, tag.name]));
                await tx.contact.update({ where: { id: contactId }, data: { tags: next } });
            }
        });

        const row = await prisma.contact.findFirst({
            where: { id: contactId, orgId },
            select: contactSelectInternal,
        });
        return row ? toContactResponse(row) : null;
    }

    async removeTagRelation(contactId: string, orgId: string, tagId: string) {
        const contact = await prisma.contact.findFirst({
            where: { id: contactId, orgId, isActive: true },
            select: { id: true, tags: true },
        });
        if (!contact) return null;

        await prisma.$transaction(async (tx) => {
            await tx.contactTag.deleteMany({ where: { contactId, tagId } });
            const tag = await tx.tag.findUnique({ where: { id: tagId }, select: { name: true } });
            if (tag) {
                const next = contact.tags.filter((t) => t !== tag.name);
                await tx.contact.update({ where: { id: contactId }, data: { tags: next } });
            }
        });

        const row = await prisma.contact.findFirst({
            where: { id: contactId, orgId },
            select: contactSelectInternal,
        });
        return row ? toContactResponse(row) : null;
    }

    async getTimeline(id: string, orgId: string) {
        const [timelineEvents, activities, conversations] = await Promise.all([
            prisma.timelineEvent.findMany({
                where: { contactId: id, orgId },
                orderBy: { createdAt: "desc" },
                take: 100,
                include: {
                    user: { select: { id: true, name: true, avatar: true } },
                },
            }),
            prisma.activity.findMany({
                where: { contactId: id, orgId },
                orderBy: { createdAt: "desc" },
                take: 50,
                include: {
                    user: { select: { id: true, name: true, avatar: true } },
                },
            }),
            prisma.conversation.findMany({
                where: { contactId: id, orgId },
                orderBy: { createdAt: "desc" },
                take: 20,
                select: {
                    id: true,
                    channel: true,
                    status: true,
                    createdAt: true,
                    messages: {
                        orderBy: { sentAt: "desc" },
                        take: 5,
                        select: {
                            id: true,
                            content: true,
                            type: true,
                            direction: true,
                            sentAt: true,
                        },
                    },
                },
            }),
        ]);

        return { timelineEvents, activities, conversations };
    }

    getContactDeals(id: string, orgId: string) {
        return prisma.deal.findMany({
            where: { contactId: id, orgId, isActive: true },
            orderBy: { createdAt: "desc" },
            include: {
                stage: { select: { id: true, name: true, color: true } },
                pipeline: { select: { id: true, name: true } },
                owner: { select: { id: true, name: true, avatar: true } },
            },
        });
    }

    getContactConversations(id: string, orgId: string) {
        return prisma.conversation.findMany({
            where: { contactId: id, orgId },
            orderBy: { createdAt: "desc" },
            include: {
                agent: { select: { id: true, name: true, avatar: true } },
                messages: {
                    orderBy: { sentAt: "desc" },
                    take: 1,
                    select: { content: true, sentAt: true, direction: true },
                },
            },
        });
    }

    async getStats(orgId: string) {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const [total, byTypeRaw, bySourceRaw, newThisMonth] = await Promise.all([
            prisma.contact.count({ where: { orgId, isActive: true } }),
            prisma.contact.groupBy({
                by: ["type"],
                where: { orgId, isActive: true },
                _count: { _all: true },
            }),
            prisma.contact.groupBy({
                by: ["source"],
                where: { orgId, isActive: true },
                _count: { _all: true },
            }),
            prisma.contact.count({
                where: { orgId, isActive: true, createdAt: { gte: startOfMonth } },
            }),
        ]);

        const byType = Object.fromEntries(
            byTypeRaw.map((r) => [r.type, r._count._all]),
        );
        const bySource = Object.fromEntries(
            bySourceRaw.map((r) => [r.source, r._count._all]),
        );

        return { total, byType, bySource, newThisMonth };
    }

    createTimelineEvent(data: {
        type: string;
        title: string;
        description?: string;
        metadata?: Record<string, unknown>;
        contactId: string;
        userId?: string;
        orgId: string;
    }) {
        return prisma.timelineEvent.create({
            data: {
                type: data.type,
                title: data.title,
                description: data.description ?? null,
                metadata: (data.metadata ?? {}) as never,
                contactId: data.contactId,
                userId: data.userId ?? null,
                orgId: data.orgId,
            },
        });
    }
}
