import { prisma } from "../../lib/prisma.js";
import type {
    CreatePipelineInput,
    UpdatePipelineInput,
    CreateStageInput,
    UpdateStageInput,
    CreateDealInput,
    UpdateDealInput,
    DealFilters,
    KanbanFilters,
    CreateDealActivityInput,
} from "./module.schema.js";

// ---------------------------------------------------------------------------
// Selects
// ---------------------------------------------------------------------------

const agentMiniSelect = {
    id: true,
    name: true,
    avatar: true,
    type: true,
    status: true,
} as const;

const stageSummarySelect = {
    id: true,
    name: true,
    order: true,
    color: true,
    type: true,
    probability: true,
    avgDaysInStage: true,
    rottingDays: true,
    maxDeals: true,
    onEnterActions: true,
    onExitActions: true,
    onRottingActions: true,
    requiredFields: true,
    agentId: true,
    agentTrigger: true,
    agentGoal: true,
    isWon: true,
    isLost: true,
    pipelineId: true,
    agent: { select: agentMiniSelect },
} as const;

const dealListSelect = {
    id: true,
    title: true,
    value: true,
    currency: true,
    probability: true,
    aiProbability: true,
    stageId: true,
    pipelineId: true,
    contactId: true,
    ownerId: true,
    orgId: true,
    branchId: true,
    stageEnteredAt: true,
    isRotting: true,
    lastActivityAt: true,
    rottingDays: true,
    expectedCloseAt: true,
    closedAt: true,
    closedReason: true,
    activeAgentSessionId: true,
    customFields: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
    stage: {
        select: {
            id: true,
            name: true,
            order: true,
            color: true,
            type: true,
            probability: true,
            isWon: true,
            isLost: true,
            agentId: true,
        },
    },
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
    // =========================================================================
    // PIPELINES
    // =========================================================================

    async listPipelines(orgId: string) {
        const pipelines = await prisma.pipeline.findMany({
            where: { orgId, isActive: true },
            include: {
                stages: {
                    include: {
                        agent: { select: agentMiniSelect },
                    },
                    orderBy: { order: "asc" },
                },
            },
            orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        });

        const pipelineIds = pipelines.map((p) => p.id);
        if (pipelineIds.length === 0) return pipelines.map((p) => ({ ...p, stages: p.stages.map((s) => ({ ...s, dealCount: 0, totalValue: 0, rottingCount: 0 })) }));

        const dealGroups = await prisma.deal.groupBy({
            by: ["pipelineId", "stageId", "isRotting"],
            where: { orgId, pipelineId: { in: pipelineIds }, isActive: true },
            _count: { id: true },
            _sum: { value: true },
        });

        type GroupKey = string;
        const groupMap = new Map<GroupKey, { count: number; value: number; rottingCount: number }>();
        for (const g of dealGroups) {
            const key = `${g.pipelineId}:${g.stageId}`;
            const prev = groupMap.get(key) ?? { count: 0, value: 0, rottingCount: 0 };
            prev.count += g._count.id;
            prev.value += Number(g._sum.value ?? 0);
            if (g.isRotting) prev.rottingCount += g._count.id;
            groupMap.set(key, prev);
        }

        return pipelines.map((p) => ({
            ...p,
            stages: p.stages.map((s) => {
                const g = groupMap.get(`${p.id}:${s.id}`) ?? { count: 0, value: 0, rottingCount: 0 };
                return { ...s, dealCount: g.count, totalValue: g.value, rottingCount: g.rottingCount };
            }),
        }));
    }

    findPipelineById(id: string, orgId: string) {
        return prisma.pipeline.findFirst({
            where: { id, orgId, isActive: true },
            include: {
                stages: {
                    include: { agent: { select: agentMiniSelect } },
                    orderBy: { order: "asc" },
                },
            },
        });
    }

    async createPipeline(
        data: CreatePipelineInput,
        orgId: string,
        stages: Array<{
            name: string;
            order: number;
            color: string;
            type: string;
            probability: number;
            isWon: boolean;
            isLost: boolean;
        }>,
    ) {
        return prisma.pipeline.create({
            data: {
                name: data.name,
                description: data.description ?? null,
                color: data.color,
                icon: data.icon ?? null,
                type: data.type as never,
                context: (data.context ?? {}) as never,
                tags: data.tags,
                isDefault: data.isDefault,
                rotting: data.rotting,
                rottingDays: data.rottingDays,
                currency: data.currency,
                winProbabilityAuto: data.winProbabilityAuto,
                customFieldSchema: data.customFieldSchema as never,
                visibility: data.visibility as never,
                allowedRoles: data.allowedRoles,
                orgId,
                stages: {
                    create: stages.map((s) => ({
                        name: s.name,
                        order: s.order,
                        color: s.color,
                        type: s.type as never,
                        probability: s.probability,
                        isWon: s.isWon,
                        isLost: s.isLost,
                    })),
                },
            },
            include: {
                stages: {
                    include: { agent: { select: agentMiniSelect } },
                    orderBy: { order: "asc" },
                },
            },
        });
    }

    async clearDefaultPipelines(orgId: string) {
        await prisma.pipeline.updateMany({
            where: { orgId, isDefault: true },
            data: { isDefault: false },
        });
    }

    async updatePipeline(id: string, data: UpdatePipelineInput, orgId: string) {
        await prisma.pipeline.updateMany({
            where: { id, orgId, isActive: true },
            data: {
                ...(data.name !== undefined ? { name: data.name } : {}),
                ...(data.description !== undefined ? { description: data.description } : {}),
                ...(data.color !== undefined ? { color: data.color } : {}),
                ...(data.icon !== undefined ? { icon: data.icon } : {}),
                ...(data.context !== undefined ? { context: data.context as never } : {}),
                ...(data.tags !== undefined ? { tags: data.tags } : {}),
                ...(data.isDefault !== undefined ? { isDefault: data.isDefault } : {}),
                ...(data.rotting !== undefined ? { rotting: data.rotting } : {}),
                ...(data.rottingDays !== undefined ? { rottingDays: data.rottingDays } : {}),
                ...(data.currency !== undefined ? { currency: data.currency } : {}),
                ...(data.winProbabilityAuto !== undefined ? { winProbabilityAuto: data.winProbabilityAuto } : {}),
                ...(data.customFieldSchema !== undefined ? { customFieldSchema: data.customFieldSchema as never } : {}),
                ...(data.visibility !== undefined ? { visibility: data.visibility as never } : {}),
                ...(data.allowedRoles !== undefined ? { allowedRoles: data.allowedRoles } : {}),
            },
        });
        return this.findPipelineById(id, orgId);
    }

    async deactivatePipeline(id: string, orgId: string) {
        await prisma.pipeline.updateMany({
            where: { id, orgId },
            data: { isActive: false },
        });
    }

    async duplicatePipeline(sourcePipelineId: string, newName: string, orgId: string) {
        const source = await prisma.pipeline.findFirst({
            where: { id: sourcePipelineId, orgId, isActive: true },
            include: { stages: { orderBy: { order: "asc" } } },
        });
        if (!source) return null;

        return prisma.pipeline.create({
            data: {
                name: newName,
                description: source.description,
                color: source.color,
                icon: source.icon,
                type: source.type,
                context: source.context as never,
                tags: source.tags,
                isDefault: false,
                rotting: source.rotting,
                rottingDays: source.rottingDays,
                currency: source.currency,
                winProbabilityAuto: source.winProbabilityAuto,
                customFieldSchema: source.customFieldSchema as never,
                visibility: source.visibility,
                allowedRoles: source.allowedRoles,
                orgId,
                stages: {
                    create: source.stages.map((s) => ({
                        name: s.name,
                        description: s.description,
                        order: s.order,
                        color: s.color,
                        type: s.type,
                        probability: s.probability,
                        rottingDays: s.rottingDays,
                        maxDeals: s.maxDeals,
                        onEnterActions: s.onEnterActions as never,
                        onExitActions: s.onExitActions as never,
                        onRottingActions: s.onRottingActions as never,
                        requiredFields: s.requiredFields as never,
                        isWon: s.isWon,
                        isLost: s.isLost,
                        // agentId NOT copied — must be reconfigured
                    })),
                },
            },
            include: {
                stages: { orderBy: { order: "asc" } },
            },
        });
    }

    // =========================================================================
    // STAGES
    // =========================================================================

    findStageById(stageId: string, orgId: string) {
        return prisma.pipelineStage.findFirst({
            where: { id: stageId, pipelineId_rel: { orgId, isActive: true } },
            include: {
                pipelineId_rel: { select: { id: true, orgId: true, rottingDays: true } },
                agent: { select: { id: true, name: true, status: true, orgId: true } },
            },
        });
    }

    findStagesByPipeline(pipelineId: string, orgId: string) {
        return prisma.pipelineStage.findMany({
            where: { pipelineId, pipelineId_rel: { orgId } },
            include: { agent: { select: agentMiniSelect } },
            orderBy: { order: "asc" },
        });
    }

    createStage(pipelineId: string, data: CreateStageInput) {
        return prisma.pipelineStage.create({
            data: {
                pipelineId,
                name: data.name,
                description: data.description ?? null,
                order: data.order,
                color: data.color,
                type: data.type as never,
                probability: data.probability,
                rottingDays: data.rottingDays ?? null,
                maxDeals: data.maxDeals ?? null,
                onEnterActions: data.onEnterActions as never,
                onExitActions: data.onExitActions as never,
                onRottingActions: data.onRottingActions as never,
                requiredFields: data.requiredFields as never,
                isWon: data.isWon,
                isLost: data.isLost,
            },
            include: { agent: { select: agentMiniSelect } },
        });
    }

    async updateStage(stageId: string, pipelineId: string, data: UpdateStageInput) {
        await prisma.pipelineStage.updateMany({
            where: { id: stageId, pipelineId },
            data: {
                ...(data.name !== undefined ? { name: data.name } : {}),
                ...(data.description !== undefined ? { description: data.description } : {}),
                ...(data.order !== undefined ? { order: data.order } : {}),
                ...(data.color !== undefined ? { color: data.color } : {}),
                ...(data.type !== undefined ? { type: data.type as never } : {}),
                ...(data.probability !== undefined ? { probability: data.probability } : {}),
                ...(data.rottingDays !== undefined ? { rottingDays: data.rottingDays } : {}),
                ...(data.maxDeals !== undefined ? { maxDeals: data.maxDeals } : {}),
                ...(data.onEnterActions !== undefined ? { onEnterActions: data.onEnterActions as never } : {}),
                ...(data.onExitActions !== undefined ? { onExitActions: data.onExitActions as never } : {}),
                ...(data.onRottingActions !== undefined ? { onRottingActions: data.onRottingActions as never } : {}),
                ...(data.requiredFields !== undefined ? { requiredFields: data.requiredFields as never } : {}),
                ...(data.isWon !== undefined ? { isWon: data.isWon } : {}),
                ...(data.isLost !== undefined ? { isLost: data.isLost } : {}),
            },
        });
        return prisma.pipelineStage.findUnique({
            where: { id: stageId },
            include: { agent: { select: agentMiniSelect } },
        });
    }

    reorderStages(orders: Array<{ id: string; order: number }>) {
        return prisma.$transaction(
            orders.map(({ id, order }) =>
                prisma.pipelineStage.update({ where: { id }, data: { order } }),
            ),
        );
    }

    assignAgentToStage(stageId: string, agentId: string, trigger: string, goal: string | undefined) {
        return prisma.pipelineStage.update({
            where: { id: stageId },
            data: { agentId, agentTrigger: trigger as never, agentGoal: goal ?? null },
            include: { agent: { select: agentMiniSelect } },
        });
    }

    removeAgentFromStage(stageId: string) {
        return prisma.pipelineStage.update({
            where: { id: stageId },
            data: { agentId: null, agentTrigger: "MANUAL", agentGoal: null },
        });
    }

    countAgentStageAssignments(agentId: string, orgId: string) {
        return prisma.pipelineStage.count({
            where: { agentId, pipelineId_rel: { orgId } },
        });
    }

    findDealsInStageWithActiveAgent(stageId: string, orgId: string) {
        return prisma.deal.findMany({
            where: {
                stageId,
                orgId,
                isActive: true,
                activeAgentSessionId: { not: null },
            },
            select: { id: true, activeAgentSessionId: true, contactId: true },
        });
    }

    // =========================================================================
    // KANBAN
    // =========================================================================

    async getPipelineKanban(pipelineId: string, orgId: string, filters: KanbanFilters) {
        const pipeline = await prisma.pipeline.findFirst({
            where: { id: pipelineId, orgId, isActive: true },
            include: {
                stages: {
                    include: { agent: { select: agentMiniSelect } },
                    orderBy: { order: "asc" },
                },
            },
        });
        if (!pipeline) return null;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dealWhere: any = {
            pipelineId,
            orgId,
            isActive: true,
            ...(filters.ownerId ? { ownerId: filters.ownerId } : {}),
            ...(filters.isRotting !== undefined ? { isRotting: filters.isRotting } : {}),
            ...(filters.search ? { title: { contains: filters.search, mode: "insensitive" as const } } : {}),
            ...(filters.valueMin !== undefined || filters.valueMax !== undefined
                ? {
                    value: {
                        ...(filters.valueMin !== undefined ? { gte: filters.valueMin } : {}),
                        ...(filters.valueMax !== undefined ? { lte: filters.valueMax } : {}),
                    },
                }
                : {}),
            ...(filters.tags
                ? { contact: { tags: { hasSome: filters.tags.split(",").map((t) => t.trim()) } } }
                : {}),
        };

        const deals = await prisma.deal.findMany({
            where: dealWhere,
            select: dealListSelect,
            orderBy: { lastActivityAt: "desc" },
        });

        const now = Date.now();
        type DealWithDays = (typeof deals)[number] & { daysInStage: number };
        const dealsWithDays: DealWithDays[] = deals.map((d) => ({
            ...d,
            daysInStage: Math.floor((now - new Date(d.stageEnteredAt).getTime()) / 86_400_000),
        }));

        const stageMap = new Map(
            pipeline.stages.map((s) => [s.id, { ...s, deals: [] as DealWithDays[] }]),
        );
        for (const d of dealsWithDays) {
            stageMap.get(d.stageId)?.deals.push(d);
        }

        return {
            pipeline: {
                id: pipeline.id,
                name: pipeline.name,
                type: pipeline.type,
                color: pipeline.color,
                isDefault: pipeline.isDefault,
                currency: pipeline.currency,
                rottingDays: pipeline.rottingDays,
                winProbabilityAuto: pipeline.winProbabilityAuto,
            },
            columns: pipeline.stages.map((s) => {
                const col = stageMap.get(s.id)!;
                const colDeals = col.deals;
                return {
                    stage: s,
                    deals: colDeals,
                    total: colDeals.length,
                    totalValue: colDeals.reduce((a, d) => a + Number(d.value ?? 0), 0),
                    rottingCount: colDeals.filter((d) => d.isRotting).length,
                };
            }),
        };
    }

    // =========================================================================
    // DEALS
    // =========================================================================

    findDealById(id: string, orgId: string) {
        return prisma.deal.findFirst({
            where: { id, orgId, isActive: true },
            select: {
                ...dealListSelect,
                stageHistory: true,
                agentHistory: true,
                utmSource: true,
                utmCampaign: true,
                adId: true,
                pipeline: { select: { id: true, name: true, type: true, color: true } },
                activities: {
                    select: {
                        id: true,
                        type: true,
                        title: true,
                        description: true,
                        dueAt: true,
                        completedAt: true,
                        createdAt: true,
                        user: { select: { id: true, name: true, avatar: true } },
                    },
                    orderBy: { createdAt: "desc" as const },
                    take: 5,
                },
                stageMovements: {
                    select: {
                        id: true,
                        fromStageId: true,
                        toStageId: true,
                        fromStageName: true,
                        toStageName: true,
                        movedBy: true,
                        userId: true,
                        agentId: true,
                        agentSessionId: true,
                        reason: true,
                        triggerEvent: true,
                        daysInPreviousStage: true,
                        createdAt: true,
                    },
                    orderBy: { createdAt: "desc" as const },
                    take: 10,
                },
            },
        });
    }

    async listDeals(orgId: string, filters: DealFilters, scopeWhere?: Record<string, unknown>) {
        const { search, stageId, pipelineId, ownerId, contactId, isRotting, valueMin, valueMax, dateFrom, dateTo, page, limit } = filters;
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
            ...(isRotting !== undefined ? { isRotting } : {}),
            ...(valueMin !== undefined || valueMax !== undefined
                ? { value: { ...(valueMin !== undefined ? { gte: valueMin } : {}), ...(valueMax !== undefined ? { lte: valueMax } : {}) } }
                : {}),
            ...(dateFrom || dateTo
                ? { createdAt: { ...(dateFrom ? { gte: new Date(dateFrom) } : {}), ...(dateTo ? { lte: new Date(dateTo) } : {}) } }
                : {}),
            ...(search ? { title: { contains: search, mode: "insensitive" as const } } : {}),
        };

        const [data, total] = await Promise.all([
            prisma.deal.findMany({ where, select: dealListSelect, skip, take: limit, orderBy: { lastActivityAt: "desc" } }),
            prisma.deal.count({ where }),
        ]);
        return { data, total };
    }

    async createDeal(
        data: CreateDealInput & { orgId: string; ownerId: string },
        stageName: string,
    ) {
        const now = new Date();
        return prisma.$transaction(async (tx) => {
            const deal = await tx.deal.create({
                data: {
                    title: data.title,
                    value: data.value ?? 0,
                    currency: data.currency,
                    pipelineId: data.pipelineId,
                    stageId: data.stageId,
                    contactId: data.contactId,
                    ownerId: data.ownerId,
                    orgId: data.orgId,
                    probability: data.probability ?? 0,
                    stageEnteredAt: now,
                    lastActivityAt: now,
                    expectedCloseAt: data.expectedCloseAt ? new Date(data.expectedCloseAt) : null,
                    customFields: (data.customFields ?? {}) as never,
                    utmSource: data.utmSource ?? null,
                    utmCampaign: data.utmCampaign ?? null,
                    adId: data.adId ?? null,
                },
                select: dealListSelect,
            });

            await tx.dealStageMovement.create({
                data: {
                    dealId: deal.id,
                    orgId: data.orgId,
                    fromStageId: null,
                    toStageId: data.stageId,
                    fromStageName: null,
                    toStageName: stageName,
                    movedBy: "HUMAN",
                    reason: "Deal criado",
                },
            });

            await tx.activity.create({
                data: {
                    type: "SYSTEM" as never,
                    title: "Deal criado",
                    dealId: deal.id,
                    contactId: data.contactId,
                    userId: data.ownerId,
                    orgId: data.orgId,
                },
            });

            return deal;
        });
    }

    async updateDeal(id: string, data: UpdateDealInput, orgId: string) {
        await prisma.deal.updateMany({
            where: { id, orgId, isActive: true },
            data: {
                ...(data.title !== undefined ? { title: data.title } : {}),
                ...(data.value !== undefined ? { value: data.value ?? 0 } : {}),
                ...(data.currency !== undefined ? { currency: data.currency } : {}),
                ...(data.ownerId !== undefined ? { ownerId: data.ownerId } : {}),
                ...(data.probability !== undefined ? { probability: data.probability } : {}),
                ...(data.expectedCloseAt !== undefined
                    ? { expectedCloseAt: data.expectedCloseAt ? new Date(data.expectedCloseAt) : null }
                    : {}),
                ...(data.customFields !== undefined ? { customFields: data.customFields as never } : {}),
            },
        });
        return this.findDealById(id, orgId);
    }

    async moveDeal(
        dealId: string,
        orgId: string,
        toStage: { id: string; name: string; isWon: boolean; isLost: boolean },
        movedBy: string,
        context: {
            userId?: string;
            agentId?: string;
            agentSessionId?: string;
            reason?: string;
            dataCollected?: Record<string, unknown>;
            triggerEvent?: string;
        },
    ) {
        const now = new Date();

        await prisma.$transaction(async (tx) => {
            const deal = await tx.deal.findFirst({
                where: { id: dealId, orgId, isActive: true },
                select: { id: true, stageId: true, stageEnteredAt: true, contactId: true, stageHistory: true, ownerId: true },
            });
            if (!deal) throw Object.assign(new Error("Deal not found"), { statusCode: 404 });

            const fromStage = await tx.pipelineStage.findUnique({
                where: { id: deal.stageId },
                select: { name: true },
            });

            const daysInPrev = (now.getTime() - new Date(deal.stageEnteredAt).getTime()) / 86_400_000;
            const currentHistory = Array.isArray(deal.stageHistory) ? deal.stageHistory : [];
            const historyEntry = {
                fromStageId: deal.stageId,
                toStageId: toStage.id,
                toStageName: toStage.name,
                movedBy,
                movedAt: now.toISOString(),
                daysInPreviousStage: Math.round(daysInPrev * 100) / 100,
            };
            const closedAt = toStage.isWon || toStage.isLost ? now : undefined;

            await tx.deal.update({
                where: { id: dealId },
                data: {
                    stageId: toStage.id,
                    stageEnteredAt: now,
                    isRotting: false,
                    rottingDays: 0,
                    lastActivityAt: now,
                    stageHistory: [...currentHistory, historyEntry] as never,
                    ...(closedAt ? { closedAt } : {}),
                    ...(toStage.isLost && context.reason ? { closedReason: context.reason } : {}),
                },
            });

            await tx.dealStageMovement.create({
                data: {
                    dealId,
                    orgId,
                    fromStageId: deal.stageId,
                    toStageId: toStage.id,
                    fromStageName: fromStage?.name ?? null,
                    toStageName: toStage.name,
                    movedBy: movedBy as never,
                    userId: context.userId ?? null,
                    agentId: context.agentId ?? null,
                    agentSessionId: context.agentSessionId ?? null,
                    reason: context.reason ?? null,
                    dataCollected: (context.dataCollected ?? null) as never,
                    triggerEvent: context.triggerEvent ?? null,
                    daysInPreviousStage: Math.round(daysInPrev * 100) / 100,
                },
            });

            const moverLabel =
                movedBy === "AGENT" ? "agente" :
                    movedBy === "AUTOMATION" ? "automação" :
                        movedBy === "SYSTEM" ? "sistema" : "vendedor";

            await tx.activity.create({
                data: {
                    type: "SYSTEM" as never,
                    title: `Movido para "${toStage.name}" por ${moverLabel}`,
                    description: context.reason ?? null,
                    dealId,
                    contactId: deal.contactId,
                    userId: context.userId ?? deal.ownerId,
                    orgId,
                },
            });
        });

        // Update avgDaysInStage for source stage asynchronously
        this.updateAvgDaysInStage(dealId, orgId).catch(() => null);

        return this.findDealById(dealId, orgId);
    }

    private async updateAvgDaysInStage(dealId: string, orgId: string) {
        const movement = await prisma.dealStageMovement.findFirst({
            where: { dealId, orgId },
            orderBy: { createdAt: "desc" },
            select: { fromStageId: true },
        });
        if (!movement?.fromStageId) return;

        const movements = await prisma.dealStageMovement.findMany({
            where: { fromStageId: movement.fromStageId, orgId, daysInPreviousStage: { not: null } },
            select: { daysInPreviousStage: true },
            take: 100,
        });
        if (movements.length === 0) return;

        const avg = movements.reduce((a, m) => a + (m.daysInPreviousStage ?? 0), 0) / movements.length;
        await prisma.pipelineStage.update({
            where: { id: movement.fromStageId },
            data: { avgDaysInStage: Math.round(avg * 100) / 100 },
        });
    }

    async deleteDeal(id: string, orgId: string) {
        await prisma.deal.updateMany({
            where: { id, orgId, isActive: true },
            data: { isActive: false },
        });
    }

    async updateDealActiveSession(dealId: string, sessionId: string | null) {
        await prisma.deal.update({
            where: { id: dealId },
            data: { activeAgentSessionId: sessionId },
        });
    }

    // =========================================================================
    // ROTTING CHECK
    // =========================================================================

    async checkRottingDeals(orgId: string) {
        const pipelines = await prisma.pipeline.findMany({
            where: { orgId, isActive: true },
            select: {
                id: true,
                rottingDays: true,
                stages: {
                    select: {
                        id: true,
                        rottingDays: true,
                        agentId: true,
                        agentTrigger: true,
                        isWon: true,
                        isLost: true,
                    },
                },
            },
        });

        const results: Array<{ dealId: string; stageId: string; action: "marked_rotting" | "updated_days" }> = [];

        for (const pipeline of pipelines) {
            for (const stage of pipeline.stages) {
                if (stage.isWon || stage.isLost) continue;

                const effectiveDays = stage.rottingDays ?? pipeline.rottingDays;
                const threshold = new Date();
                threshold.setDate(threshold.getDate() - effectiveDays);

                const freshRotting = await prisma.deal.findMany({
                    where: { orgId, stageId: stage.id, isActive: true, isRotting: false, lastActivityAt: { lt: threshold } },
                    select: { id: true },
                });
                if (freshRotting.length > 0) {
                    await prisma.deal.updateMany({
                        where: { id: { in: freshRotting.map((d) => d.id) } },
                        data: { isRotting: true, rottingDays: effectiveDays },
                    });
                    for (const d of freshRotting) {
                        results.push({ dealId: d.id, stageId: stage.id, action: "marked_rotting" });
                    }
                }

                const alreadyRotting = await prisma.deal.findMany({
                    where: { orgId, stageId: stage.id, isActive: true, isRotting: true },
                    select: { id: true, lastActivityAt: true },
                });
                for (const d of alreadyRotting) {
                    const rottingDays = Math.floor(
                        (Date.now() - new Date(d.lastActivityAt).getTime()) / 86_400_000,
                    );
                    await prisma.deal.update({ where: { id: d.id }, data: { rottingDays } });
                    results.push({ dealId: d.id, stageId: stage.id, action: "updated_days" });
                }
            }
        }
        return results;
    }

    // =========================================================================
    // AI PROBABILITY
    // =========================================================================

    async calculateAIProbability(dealId: string, orgId: string) {
        const deal = await prisma.deal.findFirst({
            where: { id: dealId, orgId, isActive: true },
            select: {
                id: true,
                stageId: true,
                pipelineId: true,
                stageEnteredAt: true,
                customFields: true,
                stage: { select: { avgDaysInStage: true, probability: true } },
                contact: { select: { _count: { select: { conversations: true } } } },
            },
        });
        if (!deal) return null;

        // Factor 1: stage base probability (40%)
        const base = deal.stage.probability;

        // Factor 2: time penalty if over avgDaysInStage (20%)
        const daysInStage = (Date.now() - new Date(deal.stageEnteredAt).getTime()) / 86_400_000;
        const avgDays = deal.stage.avgDaysInStage ?? 7;
        const timeRatio = daysInStage / avgDays;
        const timePenalty = timeRatio > 1 ? Math.min((timeRatio - 1) * 15, 30) : 0;

        // Factor 3: engagement bonus from conversations (20%)
        const engBonus = Math.min(deal.contact._count.conversations * 2, 20);

        // Factor 4: historical win rate from movements (20%)
        const [wonFromStage, totalFromStage] = await Promise.all([
            prisma.dealStageMovement.count({
                where: { fromStageId: deal.stageId, orgId, deal: { stage: { isWon: true } } },
            }),
            prisma.dealStageMovement.count({ where: { fromStageId: deal.stageId, orgId } }),
        ]);
        const historicalRate = totalFromStage > 10 ? (wonFromStage / totalFromStage) * 100 : 0;

        const rawScore =
            base * 0.4 +
            Math.max(0, base - timePenalty) * 0.2 +
            engBonus * 0.2 +
            historicalRate * 0.2;

        const aiProbability = Math.round(Math.max(0, Math.min(100, rawScore)) * 100) / 100;
        await prisma.deal.update({ where: { id: dealId }, data: { aiProbability } });
        return aiProbability;
    }

    // =========================================================================
    // STATS
    // =========================================================================

    async getPipelineStats(pipelineId: string, orgId: string, from: Date, to: Date) {
        const [stages, dealGroups, movements] = await Promise.all([
            prisma.pipelineStage.findMany({
                where: { pipelineId },
                select: { id: true, name: true, order: true, probability: true, avgDaysInStage: true, isWon: true, isLost: true },
                orderBy: { order: "asc" },
            }),
            prisma.deal.groupBy({
                by: ["stageId", "isRotting"],
                where: { pipelineId, orgId, isActive: true },
                _count: { id: true },
                _sum: { value: true },
            }),
            prisma.dealStageMovement.findMany({
                where: { orgId, createdAt: { gte: from, lte: to }, deal: { pipelineId } },
                select: { movedBy: true },
            }),
        ]);

        const stageMap = new Map(stages.map((s) => [s.id, s]));
        const dealGroupMap = new Map<string, { count: number; value: number; rottingCount: number }>();
        for (const g of dealGroups) {
            const prev = dealGroupMap.get(g.stageId) ?? { count: 0, value: 0, rottingCount: 0 };
            prev.count += g._count.id;
            prev.value += Number(g._sum.value ?? 0);
            if (g.isRotting) prev.rottingCount += g._count.id;
            dealGroupMap.set(g.stageId, prev);
        }

        const stagesSorted = [...stages].sort((a, b) => a.order - b.order);
        const conversionFunnel = stagesSorted.slice(0, -1).map((s, i) => {
            const next = stagesSorted[i + 1]!;
            const fromCount = dealGroupMap.get(s.id)?.count ?? 0;
            const toCount = dealGroupMap.get(next.id)?.count ?? 0;
            return {
                fromStage: s.name,
                toStage: next.name,
                conversionRate: fromCount > 0 ? Math.round((toCount / fromCount) * 10000) / 100 : 0,
            };
        });

        const movedBy = { HUMAN: 0, AGENT: 0, AUTOMATION: 0, SYSTEM: 0 };
        for (const m of movements) {
            movedBy[m.movedBy as keyof typeof movedBy] = (movedBy[m.movedBy as keyof typeof movedBy] ?? 0) + 1;
        }

        const [wonCount, lostCount, activeDealValues, createdInPeriod, closedInPeriod] = await Promise.all([
            prisma.deal.count({ where: { pipelineId, orgId, closedAt: { gte: from, lte: to }, stage: { isWon: true } } }),
            prisma.deal.count({ where: { pipelineId, orgId, closedAt: { gte: from, lte: to }, stage: { isLost: true } } }),
            prisma.deal.findMany({
                where: { pipelineId, orgId, isActive: true, stage: { isWon: false, isLost: false } },
                select: { value: true, stageId: true, aiProbability: true },
            }),
            prisma.deal.count({ where: { pipelineId, orgId, createdAt: { gte: from, lte: to } } }),
            prisma.deal.count({ where: { pipelineId, orgId, closedAt: { gte: from, lte: to } } }),
        ]);

        const totalClosed = wonCount + lostCount;
        const revenueForecast = activeDealValues.reduce((acc, d) => {
            const prob = d.aiProbability ?? (stageMap.get(d.stageId)?.probability ?? 0);
            return acc + Number(d.value) * (prob / 100);
        }, 0);

        return {
            stageStats: stages.map((s) => {
                const g = dealGroupMap.get(s.id) ?? { count: 0, value: 0, rottingCount: 0 };
                return { stageId: s.id, stageName: s.name, isWon: s.isWon, isLost: s.isLost, dealCount: g.count, totalValue: g.value, rottingCount: g.rottingCount, avgDaysInStage: s.avgDaysInStage };
            }),
            conversionFunnel,
            movedBy,
            winRate: totalClosed > 0 ? Math.round((wonCount / totalClosed) * 10000) / 100 : 0,
            lostRate: totalClosed > 0 ? Math.round((lostCount / totalClosed) * 10000) / 100 : 0,
            revenueForecast: Math.round(revenueForecast * 100) / 100,
            velocity: { created: createdInPeriod, closed: closedInPeriod },
            period: { from, to },
        };
    }

    async getMultiPipelineOverview(orgId: string, from: Date, to: Date) {
        const pipelines = await prisma.pipeline.findMany({
            where: { orgId, isActive: true },
            select: { id: true, name: true, type: true, color: true, currency: true },
        });

        const overviews = await Promise.all(
            pipelines.map(async (p) => {
                const [activeDealsAgg, rottingCount, wonCount, totalClosed, activeCount] = await Promise.all([
                    prisma.deal.aggregate({ where: { pipelineId: p.id, orgId, isActive: true }, _sum: { value: true } }),
                    prisma.deal.count({ where: { pipelineId: p.id, orgId, isActive: true, isRotting: true } }),
                    prisma.deal.count({ where: { pipelineId: p.id, orgId, closedAt: { gte: from, lte: to }, stage: { isWon: true } } }),
                    prisma.deal.count({ where: { pipelineId: p.id, orgId, closedAt: { gte: from, lte: to } } }),
                    prisma.deal.count({ where: { pipelineId: p.id, orgId, isActive: true } }),
                ]);
                return {
                    pipelineId: p.id,
                    name: p.name,
                    type: p.type,
                    color: p.color,
                    currency: p.currency,
                    activeDeals: activeCount,
                    openRevenue: Number(activeDealsAgg._sum.value ?? 0),
                    rottingDeals: rottingCount,
                    winRate: totalClosed > 0 ? Math.round((wonCount / totalClosed) * 10000) / 100 : 0,
                };
            }),
        );

        const bestWinRate = overviews.reduce((b, p) => (p.winRate > b.winRate ? p : b), overviews[0] ?? { winRate: 0, name: "-" });
        const mostRotting = overviews.reduce((b, p) => (p.rottingDeals > b.rottingDeals ? p : b), overviews[0] ?? { rottingDeals: 0, name: "-" });

        return {
            pipelines: overviews,
            summary: {
                totalActivePipelines: pipelines.length,
                totalOpenRevenue: overviews.reduce((a, p) => a + p.openRevenue, 0),
                totalActiveDeals: overviews.reduce((a, p) => a + p.activeDeals, 0),
                bestWinRatePipeline: bestWinRate?.name ?? "-",
                mostRottingPipeline: mostRotting?.name ?? "-",
            },
            period: { from, to },
        };
    }

    // =========================================================================
    // MOVEMENTS & SESSIONS
    // =========================================================================

    listDealMovements(dealId: string, orgId: string) {
        return prisma.dealStageMovement.findMany({
            where: { dealId, orgId },
            orderBy: { createdAt: "desc" },
        });
    }

    async listDealAgentSessions(dealId: string, orgId: string) {
        const deal = await prisma.deal.findFirst({
            where: { id: dealId, orgId },
            select: { activeAgentSessionId: true, contactId: true },
        });
        if (!deal) return [];

        return prisma.aIAgentSession.findMany({
            where: {
                orgId,
                conversation: { contactId: deal.contactId },
            },
            include: {
                agent: { select: { id: true, name: true, avatar: true, type: true } },
                turns: {
                    select: { id: true, role: true, content: true, createdAt: true },
                    orderBy: { createdAt: "desc" as const },
                    take: 3,
                },
            },
            orderBy: { startedAt: "desc" },
            take: 20,
        });
    }

    // =========================================================================
    // ACTIVITIES
    // =========================================================================

    createActivity(
        data: CreateDealActivityInput & { dealId: string; contactId?: string; userId: string; orgId: string },
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

    createSystemActivity(data: { title: string; description?: string; dealId: string; contactId?: string; userId: string; orgId: string }) {
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
            include: { user: { select: { id: true, name: true, avatar: true } } },
            orderBy: { createdAt: "desc" },
        });
    }

    createTimelineEvent(data: { type: string; title: string; description?: string; metadata?: Record<string, unknown>; contactId: string; userId?: string; orgId: string }) {
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

    // =========================================================================
    // USER / AGENT HELPERS
    // =========================================================================

    findUser(userId: string) {
        return prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, departmentId: true, orgId: true },
        });
    }

    findUsersInDept(departmentId: string, orgId: string) {
        return prisma.user.findMany({
            where: { departmentId, orgId },
            select: { id: true },
        });
    }

    findAgent(agentId: string, orgId: string) {
        return prisma.aIAgent.findFirst({
            where: { id: agentId, orgId },
            select: { id: true, name: true, status: true, orgId: true, isActive: true },
        });
    }
}
