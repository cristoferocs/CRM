import { prisma } from "../../lib/prisma.js";
import type {
    CreateDealInput,
    CreatePipelineInput,
    DealFilters,
    UpdateDealInput,
    CreateDealActivityInput,
} from "./module.schema.js";

// ---------------------------------------------------------------------------
// Selects
// ---------------------------------------------------------------------------

const stageSelect = {
    id: true,
    name: true,
    order: true,
    color: true,
    probability: true,
    isWon: true,
    isLost: true,
    pipelineId: true,
} as const;

const pipelineSelect = {
    id: true,
    name: true,
    isDefault: true,
    orgId: true,
    stages: {
        select: stageSelect,
        orderBy: { order: "asc" as const },
    },
} as const;

const dealSelect = {
    id: true,
    title: true,
    value: true,
    currency: true,
    probability: true,
    stageId: true,
    pipelineId: true,
    contactId: true,
    ownerId: true,
    orgId: true,
    branchId: true,
    expectedCloseAt: true,
    closedAt: true,
    closedReason: true,
    customFields: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
    stage: { select: stageSelect },
    contact: {
        select: { id: true, name: true, email: true, phone: true, avatar: true },
    },
    owner: {
        select: { id: true, name: true, avatar: true, email: true },
    },
} as const;

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class PipelineRepository {
    // -------------------------------------------------------------------------
    // Pipelines
    // -------------------------------------------------------------------------

    listPipelines(orgId: string) {
        return prisma.pipeline.findMany({
            where: { orgId },
            select: pipelineSelect,
            orderBy: [{ isDefault: "desc" }, { id: "asc" }],
        });
    }

    createPipeline(data: CreatePipelineInput, orgId: string) {
        return prisma.pipeline.create({
            data: {
                name: data.name,
                orgId,
                stages: {
                    create: data.stages.map((s) => ({
                        name: s.name,
                        order: s.order,
                        color: s.color,
                        probability: s.probability,
                        isWon: s.isWon,
                        isLost: s.isLost,
                    })),
                },
            },
            select: pipelineSelect,
        });
    }

    findPipelineById(id: string, orgId: string) {
        return prisma.pipeline.findFirst({
            where: { id, orgId },
            select: pipelineSelect,
        });
    }

    async updatePipelineName(id: string, name: string, orgId: string) {
        await prisma.pipeline.updateMany({ where: { id, orgId }, data: { name } });
        return this.findPipelineById(id, orgId);
    }

    async updateStages(pipelineId: string, stages: CreatePipelineInput["stages"], orgId: string) {
        const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, orgId } });
        if (!pipeline) return null;

        await prisma.$transaction(async (tx) => {
            await tx.pipelineStage.deleteMany({ where: { pipelineId } });
            await tx.pipelineStage.createMany({
                data: stages.map((s) => ({
                    pipelineId,
                    name: s.name,
                    order: s.order,
                    color: s.color,
                    probability: s.probability,
                    isWon: s.isWon,
                    isLost: s.isLost,
                })),
            });
        });

        return this.findPipelineById(pipelineId, orgId);
    }

    findStageById(stageId: string, orgId: string) {
        return prisma.pipelineStage.findFirst({
            where: { id: stageId, pipeline: { orgId } },
        });
    }

    // -------------------------------------------------------------------------
    // Deals
    // -------------------------------------------------------------------------

    async listDeals(
        orgId: string,
        filters: DealFilters,
        scopeWhere?: Record<string, unknown>,
    ) {
        const {
            search,
            stageId,
            pipelineId,
            ownerId,
            contactId,
            valueMin,
            valueMax,
            dateFrom,
            dateTo,
            page,
            limit,
        } = filters;
        const skip = (page - 1) * limit;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const where: any = {
            orgId,
            isActive: true,
            ...scopeWhere,
            ...(stageId ? { stageId } : {}),
            ...(pipelineId ? { pipelineId } : {}),
            ...(ownerId ? { ownerId } : {}),
            ...(contactId ? { contactId } : {}),
            ...(valueMin !== undefined || valueMax !== undefined
                ? {
                    value: {
                        ...(valueMin !== undefined ? { gte: valueMin } : {}),
                        ...(valueMax !== undefined ? { lte: valueMax } : {}),
                    },
                }
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
                ? { title: { contains: search, mode: "insensitive" as const } }
                : {}),
        };

        const [data, total] = await Promise.all([
            prisma.deal.findMany({
                where,
                select: dealSelect,
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
            }),
            prisma.deal.count({ where }),
        ]);

        return { data, total };
    }

    findDealById(id: string, orgId: string) {
        return prisma.deal.findFirst({
            where: { id, orgId, isActive: true },
            select: dealSelect,
        });
    }

    createDeal(data: CreateDealInput & { orgId: string; ownerId: string }) {
        return prisma.deal.create({
            data: {
                title: data.title,
                value: data.value ?? null,
                currency: data.currency,
                stageId: data.stageId,
                pipelineId: data.pipelineId,
                contactId: data.contactId,
                ownerId: data.ownerId,
                orgId: data.orgId,
                expectedCloseAt: data.expectedCloseAt ? new Date(data.expectedCloseAt) : null,
                customFields: (data.customFields ?? {}) as never,
            },
            select: dealSelect,
        });
    }

    async updateDeal(id: string, data: UpdateDealInput, orgId: string) {
        await prisma.deal.updateMany({
            where: { id, orgId, isActive: true },
            data: {
                ...(data.title !== undefined ? { title: data.title } : {}),
                ...(data.value !== undefined ? { value: data.value } : {}),
                ...(data.currency !== undefined ? { currency: data.currency } : {}),
                ...(data.ownerId !== undefined ? { ownerId: data.ownerId } : {}),
                ...(data.expectedCloseAt !== undefined
                    ? {
                        expectedCloseAt: data.expectedCloseAt
                            ? new Date(data.expectedCloseAt)
                            : null,
                    }
                    : {}),
                ...(data.customFields !== undefined
                    ? { customFields: data.customFields as never }
                    : {}),
            },
        });
        return this.findDealById(id, orgId);
    }

    async moveDeal(
        id: string,
        stageId: string,
        orgId: string,
        opts: { isWon: boolean; isLost: boolean; reason?: string; userId: string },
    ) {
        const closedAt = opts.isWon || opts.isLost ? new Date() : undefined;

        await prisma.$transaction(async (tx) => {
            await tx.deal.updateMany({
                where: { id, orgId, isActive: true },
                data: {
                    stageId,
                    ...(closedAt ? { closedAt } : {}),
                    ...(opts.isLost && opts.reason ? { closedReason: opts.reason } : {}),
                },
            });

            await tx.activity.create({
                data: {
                    type: "SYSTEM",
                    title: opts.isWon
                        ? "Deal marcado como ganho"
                        : opts.isLost
                            ? "Deal marcado como perdido"
                            : "Deal movido de etapa",
                    description: opts.reason ?? null,
                    dealId: id,
                    userId: opts.userId,
                    orgId,
                },
            });
        });

        return this.findDealById(id, orgId);
    }

    async deleteDeal(id: string, orgId: string) {
        await prisma.deal.updateMany({
            where: { id, orgId, isActive: true },
            data: { isActive: false },
        });
    }

    // -------------------------------------------------------------------------
    // Kanban
    // -------------------------------------------------------------------------

    async getKanbanView(
        pipelineId: string,
        orgId: string,
        scopeWhere?: Record<string, unknown>,
    ) {
        const pipeline = await prisma.pipeline.findFirst({
            where: { id: pipelineId, orgId },
            select: pipelineSelect,
        });

        if (!pipeline) return null;

        const deals = await prisma.deal.findMany({
            where: { pipelineId, orgId, isActive: true, ...scopeWhere },
            select: dealSelect,
            orderBy: { createdAt: "asc" },
        });

        type DealRow = (typeof deals)[number];
        const stageMap = new Map(
            pipeline.stages.map((s) => [s.id, { ...s, deals: [] as DealRow[] }]),
        );

        for (const deal of deals) {
            stageMap.get(deal.stageId)?.deals.push(deal);
        }

        return {
            pipeline: { id: pipeline.id, name: pipeline.name, isDefault: pipeline.isDefault },
            columns: pipeline.stages.map((s) => {
                const column = stageMap.get(s.id);
                const columnDeals = column?.deals ?? [];
                return {
                    stage: s,
                    deals: columnDeals,
                    total: columnDeals.length,
                    totalValue: columnDeals.reduce((acc, d) => acc + Number(d.value ?? 0), 0),
                };
            }),
        };
    }

    // -------------------------------------------------------------------------
    // Forecast & Stats
    // -------------------------------------------------------------------------

    async getForecast(orgId: string, from: Date, to: Date) {
        const stages = await prisma.pipelineStage.findMany({
            where: { pipeline: { orgId }, isWon: false, isLost: false },
            select: { id: true, probability: true },
        });

        const stageProbMap = new Map(stages.map((s) => [s.id, s.probability]));

        const deals = await prisma.deal.findMany({
            where: {
                orgId,
                isActive: true,
                expectedCloseAt: { gte: from, lte: to },
                stage: { isWon: false, isLost: false },
            },
            select: {
                id: true,
                title: true,
                value: true,
                stageId: true,
                expectedCloseAt: true,
            },
        });

        const weightedTotal = deals.reduce((acc, d) => {
            const prob = stageProbMap.get(d.stageId) ?? 0;
            return acc + Number(d.value ?? 0) * (prob / 100);
        }, 0);

        const rawTotal = deals.reduce((acc, d) => acc + Number(d.value ?? 0), 0);

        return { from, to, dealsCount: deals.length, rawTotal, weightedTotal, deals };
    }

    async getDealStats(orgId: string) {
        const stages = await prisma.pipelineStage.findMany({
            where: { pipeline: { orgId } },
            select: { id: true, name: true, isWon: true, isLost: true },
        });

        const groupResult = await prisma.deal.groupBy({
            by: ["stageId"],
            where: { orgId, isActive: true },
            _count: { id: true },
            _sum: { value: true },
        });

        const stageMap = new Map(stages.map((s) => [s.id, s]));

        const stageStats = groupResult.map((r) => ({
            stageId: r.stageId,
            stageName: stageMap.get(r.stageId)?.name ?? "Unknown",
            isWon: stageMap.get(r.stageId)?.isWon ?? false,
            isLost: stageMap.get(r.stageId)?.isLost ?? false,
            count: r._count.id,
            totalValue: Number(r._sum.value ?? 0),
        }));

        const totalDeals = stageStats.reduce((a, s) => a + s.count, 0);
        const wonDeals = stageStats.filter((s) => s.isWon).reduce((a, s) => a + s.count, 0);
        const lostDeals = stageStats.filter((s) => s.isLost).reduce((a, s) => a + s.count, 0);
        const conversionRate = totalDeals > 0 ? (wonDeals / totalDeals) * 100 : 0;

        return {
            stageStats,
            totalDeals,
            wonDeals,
            lostDeals,
            conversionRate: Math.round(conversionRate * 100) / 100,
        };
    }

    // -------------------------------------------------------------------------
    // Activities
    // -------------------------------------------------------------------------

    createActivity(
        data: CreateDealActivityInput & {
            dealId: string;
            contactId?: string;
            userId: string;
            orgId: string;
        },
    ) {
        return prisma.activity.create({
            data: {
                type: data.type as never,
                title: data.title,
                description: data.description ?? null,
                dueAt: data.dueAt ? new Date(data.dueAt) : null,
                dealId: data.dealId,
                contactId: data.contactId ?? null,
                userId: data.userId,
                orgId: data.orgId,
            },
        });
    }

    createSystemActivity(data: {
        title: string;
        description?: string;
        dealId: string;
        contactId?: string;
        userId: string;
        orgId: string;
    }) {
        return prisma.activity.create({
            data: {
                type: "SYSTEM" as never,
                title: data.title,
                description: data.description ?? null,
                dealId: data.dealId,
                contactId: data.contactId ?? null,
                userId: data.userId,
                orgId: data.orgId,
            },
        });
    }

    listDealActivities(dealId: string, orgId: string) {
        return prisma.activity.findMany({
            where: { dealId, orgId },
            include: {
                user: { select: { id: true, name: true, avatar: true } },
            },
            orderBy: { createdAt: "desc" },
        });
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

    // -------------------------------------------------------------------------
    // User helpers (role-based scoping)
    // -------------------------------------------------------------------------

    findUser(userId: string) {
        return prisma.user.findFirst({
            where: { id: userId },
            select: { id: true, departmentId: true, role: true },
        });
    }

    findUsersInDept(departmentId: string, orgId: string) {
        return prisma.user.findMany({
            where: { departmentId, orgId, isActive: true },
            select: { id: true },
        });
    }
}
