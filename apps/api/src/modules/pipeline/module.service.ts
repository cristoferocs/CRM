import { PipelineRepository } from "./module.repository.js";
import type {
    CreatePipelineInput,
    UpdatePipelineInput,
    CreateDealInput,
    UpdateDealInput,
    MoveDealInput,
    DealFilters,
    CreateDealActivityInput,
    ForecastQuery,
} from "./module.schema.js";

export class PipelineService {
    constructor(private readonly repo = new PipelineRepository()) { }

    // -------------------------------------------------------------------------
    // Pipelines
    // -------------------------------------------------------------------------

    listPipelines(orgId: string) {
        return this.repo.listPipelines(orgId);
    }

    async createPipeline(data: CreatePipelineInput, orgId: string) {
        this.validatePipelineStages(data.stages);
        return this.repo.createPipeline(data, orgId);
    }

    async updatePipeline(id: string, data: UpdatePipelineInput, orgId: string) {
        const pipeline = await this.repo.findPipelineById(id, orgId);
        if (!pipeline) {
            throw Object.assign(new Error("Pipeline not found."), { statusCode: 404 });
        }

        if (data.stages) {
            this.validatePipelineStages(data.stages);
            await this.repo.updateStages(id, data.stages, orgId);
        }

        if (data.name) {
            return this.repo.updatePipelineName(id, data.name, orgId);
        }

        return this.repo.findPipelineById(id, orgId);
    }

    // -------------------------------------------------------------------------
    // Kanban
    // -------------------------------------------------------------------------

    async getKanban(
        pipelineId: string,
        orgId: string,
        requestingUserId: string,
        requestingUserRole: string,
    ) {
        const scopeWhere = await this.buildDealScopeWhere(
            orgId,
            requestingUserId,
            requestingUserRole,
        );
        const result = await this.repo.getKanbanView(pipelineId, orgId, scopeWhere);
        if (!result) {
            throw Object.assign(new Error("Pipeline not found."), { statusCode: 404 });
        }
        return result;
    }

    // -------------------------------------------------------------------------
    // Deals
    // -------------------------------------------------------------------------

    async listDeals(
        orgId: string,
        filters: DealFilters,
        requestingUserId: string,
        requestingUserRole: string,
    ) {
        const scopeWhere = await this.buildDealScopeWhere(
            orgId,
            requestingUserId,
            requestingUserRole,
        );
        const { data, total } = await this.repo.listDeals(orgId, filters, scopeWhere);
        return {
            data,
            total,
            page: filters.page,
            limit: filters.limit,
            totalPages: Math.ceil(total / filters.limit),
        };
    }

    async findDealById(
        id: string,
        orgId: string,
        requestingUserId: string,
        requestingUserRole: string,
    ) {
        const deal = await this.repo.findDealById(id, orgId);
        if (!deal) {
            throw Object.assign(new Error("Deal not found."), { statusCode: 404 });
        }
        await this.assertDealAccess(deal, orgId, requestingUserId, requestingUserRole);
        return deal;
    }

    async createDeal(data: CreateDealInput, orgId: string, userId: string) {
        const ownerId = data.ownerId ?? userId;
        const deal = await this.repo.createDeal({ ...data, orgId, ownerId });

        await Promise.all([
            this.repo.createTimelineEvent({
                type: "DEAL_CREATED",
                title: `Deal criado: ${deal.title}`,
                metadata: {
                    dealId: deal.id,
                    value: deal.value,
                    stageId: deal.stageId,
                    pipelineId: deal.pipelineId,
                },
                contactId: data.contactId,
                userId,
                orgId,
            }),
            this.repo.createSystemActivity({
                title: "Deal criado",
                dealId: deal.id,
                contactId: data.contactId,
                userId,
                orgId,
            }),
        ]);

        return deal;
    }

    async updateDeal(
        id: string,
        data: UpdateDealInput,
        orgId: string,
        userId: string,
        requestingUserRole: string,
    ) {
        const existing = await this.repo.findDealById(id, orgId);
        if (!existing) {
            throw Object.assign(new Error("Deal not found."), { statusCode: 404 });
        }
        await this.assertDealAccess(existing, orgId, userId, requestingUserRole);
        return this.repo.updateDeal(id, data, orgId);
    }

    async moveDeal(
        id: string,
        input: MoveDealInput,
        orgId: string,
        userId: string,
        requestingUserRole: string,
    ) {
        const deal = await this.repo.findDealById(id, orgId);
        if (!deal) {
            throw Object.assign(new Error("Deal not found."), { statusCode: 404 });
        }
        await this.assertDealAccess(deal, orgId, userId, requestingUserRole);

        const stage = await this.repo.findStageById(input.stageId, orgId);
        if (!stage) {
            throw Object.assign(new Error("Stage not found."), { statusCode: 404 });
        }

        if (stage.isLost && !input.reason) {
            throw Object.assign(
                new Error("Reason is required when moving deal to a 'lost' stage."),
                { statusCode: 422 },
            );
        }

        const updated = await this.repo.moveDeal(id, input.stageId, orgId, {
            isWon: stage.isWon,
            isLost: stage.isLost,
            reason: input.reason,
            userId,
        });

        if (stage.isWon || stage.isLost) {
            const salesCycleDays = Math.floor(
                (Date.now() - new Date(deal.createdAt).getTime()) / 86_400_000,
            );

            await this.repo.createTimelineEvent({
                type: stage.isWon ? "DEAL_WON" : "DEAL_LOST",
                title: stage.isWon
                    ? `Deal ganho: ${deal.title}`
                    : `Deal perdido: ${deal.title}`,
                description: input.reason,
                metadata: {
                    dealId: deal.id,
                    stageId: input.stageId,
                    closedAt: new Date().toISOString(),
                    salesCycleDays,
                },
                contactId: deal.contactId,
                userId,
                orgId,
            });
        }

        return updated;
    }

    async deleteDeal(
        id: string,
        orgId: string,
        userId: string,
        requestingUserRole: string,
    ) {
        const deal = await this.repo.findDealById(id, orgId);
        if (!deal) {
            throw Object.assign(new Error("Deal not found."), { statusCode: 404 });
        }
        await this.assertDealAccess(deal, orgId, userId, requestingUserRole);
        await this.repo.deleteDeal(id, orgId);
    }

    // -------------------------------------------------------------------------
    // Forecast & Stats
    // -------------------------------------------------------------------------

    getForecast(orgId: string, period: ForecastQuery["period"]) {
        const now = new Date();
        const from = new Date(now);
        const to = new Date(now);

        switch (period) {
            case "week":
                to.setDate(to.getDate() + 7);
                break;
            case "month":
                to.setMonth(to.getMonth() + 1);
                break;
            case "quarter":
                to.setMonth(to.getMonth() + 3);
                break;
            case "year":
                to.setFullYear(to.getFullYear() + 1);
                break;
        }

        return this.repo.getForecast(orgId, from, to);
    }

    getDealStats(orgId: string) {
        return this.repo.getDealStats(orgId);
    }

    // -------------------------------------------------------------------------
    // Activities
    // -------------------------------------------------------------------------

    async createDealActivity(
        dealId: string,
        data: CreateDealActivityInput,
        orgId: string,
        userId: string,
        requestingUserRole: string,
    ) {
        const deal = await this.repo.findDealById(dealId, orgId);
        if (!deal) {
            throw Object.assign(new Error("Deal not found."), { statusCode: 404 });
        }
        await this.assertDealAccess(deal, orgId, userId, requestingUserRole);

        return this.repo.createActivity({
            ...data,
            dealId,
            contactId: deal.contactId,
            userId,
            orgId,
        });
    }

    listDealActivities(dealId: string, orgId: string) {
        return this.repo.listDealActivities(dealId, orgId);
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private validatePipelineStages(stages: CreatePipelineInput["stages"]) {
        const hasWon = stages.some((s) => s.isWon);
        const hasLost = stages.some((s) => s.isLost);

        if (!hasWon) {
            throw Object.assign(
                new Error("Pipeline must have at least one 'won' stage."),
                { statusCode: 422 },
            );
        }
        if (!hasLost) {
            throw Object.assign(
                new Error("Pipeline must have at least one 'lost' stage."),
                { statusCode: 422 },
            );
        }
    }

    private async buildDealScopeWhere(
        orgId: string,
        userId: string,
        role: string,
    ): Promise<Record<string, unknown>> {
        if (role === "SUPER_ADMIN" || role === "ADMIN") return {};

        if (role === "MANAGER" || role === "BRANCH_MANAGER") {
            const user = await this.repo.findUser(userId);
            if (!user?.departmentId) return { ownerId: userId };
            const deptUsers = await this.repo.findUsersInDept(user.departmentId, orgId);
            return { ownerId: { in: deptUsers.map((u) => u.id) } };
        }

        // SELLER, SUPPORT, VIEWER — own deals only
        return { ownerId: userId };
    }

    private async assertDealAccess(
        deal: { ownerId: string },
        orgId: string,
        userId: string,
        role: string,
    ): Promise<void> {
        if (role === "SUPER_ADMIN" || role === "ADMIN") return;

        if (role === "MANAGER" || role === "BRANCH_MANAGER") {
            const user = await this.repo.findUser(userId);
            if (!user?.departmentId) {
                if (deal.ownerId !== userId) {
                    throw Object.assign(new Error("Access denied."), { statusCode: 403 });
                }
                return;
            }
            const deptUsers = await this.repo.findUsersInDept(user.departmentId, orgId);
            const ids = new Set(deptUsers.map((u) => u.id));
            if (!ids.has(deal.ownerId)) {
                throw Object.assign(new Error("Access denied."), { statusCode: 403 });
            }
            return;
        }

        if (deal.ownerId !== userId) {
            throw Object.assign(new Error("Access denied."), { statusCode: 403 });
        }
    }
}
