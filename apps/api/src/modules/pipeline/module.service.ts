import { PipelineRepository } from "./module.repository.js";
import { pipelineAgentBridge } from "./pipeline-agent.bridge.js";
import { getPubSub } from "../../lib/pubsub.js";
import { getIO } from "../../websocket/socket.js";
import { queues } from "../../queue/queues.js";
import type {
    CreatePipelineInput,
    UpdatePipelineInput,
    CreateStageInput,
    UpdateStageInput,
    ReorderStagesInput,
    AssignAgentToStageInput,
    CreateDealInput,
    UpdateDealInput,
    MoveDealInput,
    DealFilters,
    KanbanFilters,
    PipelineStatsQuery,
    OverviewQuery,
    CreateDealActivityInput,
    ActivateAgentInput,
} from "./module.schema.js";

// ---------------------------------------------------------------------------
// Default stage templates per pipeline type
// ---------------------------------------------------------------------------

type StageSeed = {
    name: string;
    color: string;
    type: string;
    probability: number;
    isWon: boolean;
    isLost: boolean;
};

const STAGE_TEMPLATES: Record<string, StageSeed[]> = {
    SALES: [
        { name: "Novo Lead", color: "#94a3b8", type: "ENTRY", probability: 5, isWon: false, isLost: false },
        { name: "Contato Feito", color: "#60a5fa", type: "NURTURING", probability: 15, isWon: false, isLost: false },
        { name: "Qualificado", color: "#a78bfa", type: "NURTURING", probability: 30, isWon: false, isLost: false },
        { name: "Proposta", color: "#f59e0b", type: "DECISION", probability: 60, isWon: false, isLost: false },
        { name: "Negociação", color: "#f97316", type: "DECISION", probability: 80, isWon: false, isLost: false },
        { name: "Fechado", color: "#22c55e", type: "WON", probability: 100, isWon: true, isLost: false },
        { name: "Perdido", color: "#ef4444", type: "LOST", probability: 0, isWon: false, isLost: true },
    ],
    CAMPAIGN: [
        { name: "Clicou no Anúncio", color: "#94a3b8", type: "ENTRY", probability: 5, isWon: false, isLost: false },
        { name: "Primeiro Contato", color: "#60a5fa", type: "NURTURING", probability: 20, isWon: false, isLost: false },
        { name: "Interesse Confirmado", color: "#a78bfa", type: "NURTURING", probability: 40, isWon: false, isLost: false },
        { name: "Proposta", color: "#f59e0b", type: "DECISION", probability: 65, isWon: false, isLost: false },
        { name: "Convertido", color: "#22c55e", type: "WON", probability: 100, isWon: true, isLost: false },
        { name: "Descartado", color: "#ef4444", type: "LOST", probability: 0, isWon: false, isLost: true },
    ],
    PRODUCT: [
        { name: "Interesse", color: "#94a3b8", type: "ENTRY", probability: 10, isWon: false, isLost: false },
        { name: "Demonstração", color: "#60a5fa", type: "NURTURING", probability: 30, isWon: false, isLost: false },
        { name: "Avaliação", color: "#a78bfa", type: "DECISION", probability: 60, isWon: false, isLost: false },
        { name: "Compra", color: "#22c55e", type: "WON", probability: 100, isWon: true, isLost: false },
        { name: "Pós-venda", color: "#10b981", type: "REGULAR", probability: 100, isWon: false, isLost: false },
        { name: "Perdido", color: "#ef4444", type: "LOST", probability: 0, isWon: false, isLost: true },
    ],
    SERVICE: [
        { name: "Briefing", color: "#94a3b8", type: "ENTRY", probability: 10, isWon: false, isLost: false },
        { name: "Proposta", color: "#60a5fa", type: "DECISION", probability: 40, isWon: false, isLost: false },
        { name: "Contrato", color: "#a78bfa", type: "DECISION", probability: 70, isWon: false, isLost: false },
        { name: "Execução", color: "#f59e0b", type: "REGULAR", probability: 90, isWon: false, isLost: false },
        { name: "Entrega", color: "#22c55e", type: "WON", probability: 100, isWon: true, isLost: false },
        { name: "Renovação", color: "#10b981", type: "REGULAR", probability: 100, isWon: false, isLost: false },
        { name: "Cancelado", color: "#ef4444", type: "LOST", probability: 0, isWon: false, isLost: true },
    ],
    RENEWAL: [
        { name: "Vencendo em 90d", color: "#94a3b8", type: "ENTRY", probability: 50, isWon: false, isLost: false },
        { name: "Vencendo em 30d", color: "#f59e0b", type: "NURTURING", probability: 60, isWon: false, isLost: false },
        { name: "Em Negociação", color: "#a78bfa", type: "DECISION", probability: 75, isWon: false, isLost: false },
        { name: "Renovado", color: "#22c55e", type: "WON", probability: 100, isWon: true, isLost: false },
        { name: "Cancelado", color: "#ef4444", type: "LOST", probability: 0, isWon: false, isLost: true },
    ],
    PARTNERSHIP: [
        { name: "Prospecção", color: "#94a3b8", type: "ENTRY", probability: 10, isWon: false, isLost: false },
        { name: "Qualificação", color: "#60a5fa", type: "NURTURING", probability: 25, isWon: false, isLost: false },
        { name: "Proposta", color: "#a78bfa", type: "DECISION", probability: 50, isWon: false, isLost: false },
        { name: "Negociação", color: "#f59e0b", type: "DECISION", probability: 75, isWon: false, isLost: false },
        { name: "Formalização", color: "#22c55e", type: "WON", probability: 100, isWon: true, isLost: false },
        { name: "Declinado", color: "#ef4444", type: "LOST", probability: 0, isWon: false, isLost: true },
    ],
    RECRUITMENT: [
        { name: "Candidato Recebido", color: "#94a3b8", type: "ENTRY", probability: 10, isWon: false, isLost: false },
        { name: "Triagem", color: "#60a5fa", type: "NURTURING", probability: 30, isWon: false, isLost: false },
        { name: "Entrevista", color: "#a78bfa", type: "DECISION", probability: 60, isWon: false, isLost: false },
        { name: "Proposta", color: "#f59e0b", type: "DECISION", probability: 80, isWon: false, isLost: false },
        { name: "Contratado", color: "#22c55e", type: "WON", probability: 100, isWon: true, isLost: false },
        { name: "Recusado", color: "#ef4444", type: "LOST", probability: 0, isWon: false, isLost: true },
    ],
    CUSTOM: [
        { name: "Etapa 1", color: "#94a3b8", type: "ENTRY", probability: 20, isWon: false, isLost: false },
        { name: "Etapa 2", color: "#60a5fa", type: "REGULAR", probability: 50, isWon: false, isLost: false },
        { name: "Fechado", color: "#22c55e", type: "WON", probability: 100, isWon: true, isLost: false },
        { name: "Perdido", color: "#ef4444", type: "LOST", probability: 0, isWon: false, isLost: true },
    ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function periodToDates(period: string): { from: Date; to: Date } {
    const now = new Date();
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    const to = new Date(now);
    to.setHours(23, 59, 59, 999);
    switch (period) {
        case "week":
            from.setDate(from.getDate() - 7);
            break;
        case "month":
            from.setMonth(from.getMonth() - 1);
            break;
        case "quarter":
            from.setMonth(from.getMonth() - 3);
            break;
        case "year":
            from.setFullYear(from.getFullYear() - 1);
            break;
    }
    return { from, to };
}

function notFound(resource: string): never {
    throw Object.assign(new Error(`${resource} not found.`), { statusCode: 404 });
}

function forbidden(msg = "Access denied."): never {
    throw Object.assign(new Error(msg), { statusCode: 403 });
}

function unprocessable(msg: string): never {
    throw Object.assign(new Error(msg), { statusCode: 422 });
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class PipelineService {
    constructor(private readonly repo = new PipelineRepository()) { }

    // =========================================================================
    // PIPELINES
    // =========================================================================

    listPipelines(orgId: string) {
        return this.repo.listPipelines(orgId);
    }

    async createPipeline(data: CreatePipelineInput, orgId: string) {
        // Validate unique name within org
        const existing = await this.repo.listPipelines(orgId);
        if (existing.some((p) => p.name.toLowerCase() === data.name.toLowerCase())) {
            unprocessable("Já existe um pipeline com este nome nesta organização.");
        }

        // If isDefault, clear existing defaults
        if (data.isDefault) {
            await this.repo.clearDefaultPipelines(orgId);
        }

        // Build stage seeds from type template
        const template: StageSeed[] = STAGE_TEMPLATES[data.type] ?? STAGE_TEMPLATES['CUSTOM'] ?? [];
        const stages = template.map((s, i) => ({ ...s, order: i }));

        return this.repo.createPipeline(data, orgId, stages);
    }

    async findPipelineById(id: string, orgId: string) {
        const pipeline = await this.repo.findPipelineById(id, orgId);
        if (!pipeline) notFound("Pipeline");
        return pipeline;
    }

    async updatePipeline(id: string, data: UpdatePipelineInput, orgId: string) {
        const pipeline = await this.repo.findPipelineById(id, orgId);
        if (!pipeline) notFound("Pipeline");

        if (data.name && data.name !== pipeline.name) {
            const existing = await this.repo.listPipelines(orgId);
            if (existing.some((p) => p.id !== id && p.name.toLowerCase() === data.name!.toLowerCase())) {
                unprocessable("Já existe um pipeline com este nome nesta organização.");
            }
        }

        if (data.isDefault) {
            await this.repo.clearDefaultPipelines(orgId);
        }

        return this.repo.updatePipeline(id, data, orgId);
    }

    async deactivatePipeline(id: string, orgId: string) {
        const pipeline = await this.repo.findPipelineById(id, orgId);
        if (!pipeline) notFound("Pipeline");
        if (pipeline.isDefault) {
            unprocessable("Não é possível remover o pipeline padrão. Defina outro como padrão primeiro.");
        }
        await this.repo.deactivatePipeline(id, orgId);
    }

    async duplicatePipeline(pipelineId: string, newName: string, orgId: string) {
        const existing = await this.repo.listPipelines(orgId);
        if (existing.some((p) => p.name.toLowerCase() === newName.toLowerCase())) {
            unprocessable("Já existe um pipeline com este nome nesta organização.");
        }
        const result = await this.repo.duplicatePipeline(pipelineId, newName, orgId);
        if (!result) notFound("Pipeline");
        return result;
    }

    // =========================================================================
    // KANBAN
    // =========================================================================

    async getPipelineKanban(
        pipelineId: string,
        orgId: string,
        filters: KanbanFilters,
        userId: string,
        role: string,
    ) {
        const scopeFilters = await this.applyDealScopeToKanbanFilters(filters, orgId, userId, role);
        const result = await this.repo.getPipelineKanban(pipelineId, orgId, scopeFilters);
        if (!result) notFound("Pipeline");
        return result;
    }

    // =========================================================================
    // PIPELINE STATS & OVERVIEW
    // =========================================================================

    async getPipelineStats(pipelineId: string, orgId: string, query: PipelineStatsQuery) {
        const pipeline = await this.repo.findPipelineById(pipelineId, orgId);
        if (!pipeline) notFound("Pipeline");
        const { from, to } = periodToDates(query.period);
        return this.repo.getPipelineStats(pipelineId, orgId, from, to);
    }

    getMultiPipelineOverview(orgId: string, query: OverviewQuery) {
        const { from, to } = periodToDates(query.period);
        return this.repo.getMultiPipelineOverview(orgId, from, to);
    }

    // =========================================================================
    // STAGES
    // =========================================================================

    async createStage(pipelineId: string, data: CreateStageInput, orgId: string) {
        const pipeline = await this.repo.findPipelineById(pipelineId, orgId);
        if (!pipeline) notFound("Pipeline");
        const stage = await this.repo.createStage(pipelineId, data);
        getIO()?.to(`org:${orgId}`).emit("pipeline:stage_created", {
            pipelineId,
            stage,
        });
        return stage;
    }

    async updateStage(stageId: string, pipelineId: string, data: UpdateStageInput, orgId: string) {
        const stage = await this.repo.findStageById(stageId, orgId);
        if (!stage || stage.pipelineId !== pipelineId) notFound("Stage");
        const updated = await this.repo.updateStage(stageId, pipelineId, data);
        getIO()?.to(`org:${orgId}`).emit("pipeline:stage_updated", {
            pipelineId,
            stage: updated,
        });
        return updated;
    }

    async removeStage(stageId: string, pipelineId: string, orgId: string, targetStageId?: string) {
        const stage = await this.repo.findStageById(stageId, orgId);
        if (!stage || stage.pipelineId !== pipelineId) notFound("Stage");

        // Cannot remove won/lost terminal stages if they are the only one
        const stages = await this.repo.findStagesByPipeline(pipelineId, orgId);
        if (stage.isWon && stages.filter((s) => s.isWon).length === 1) {
            unprocessable("Não é possível remover a única etapa de 'Ganho'. Crie outra etapa de Ganho antes.");
        }
        if (stage.isLost && stages.filter((s) => s.isLost).length === 1) {
            unprocessable("Não é possível remover a única etapa de 'Perdido'. Crie outra etapa de Perdido antes.");
        }

        // Resolve target — explicit override has priority, otherwise auto-pick first non-terminal
        let fallback = targetStageId
            ? stages.find((s) => s.id === targetStageId && s.id !== stageId)
            : stages.find((s) => s.id !== stageId && !s.isWon && !s.isLost);

        if (!fallback) {
            unprocessable("Não há etapa de destino válida para mover os deals. Informe uma etapa existente do mesmo pipeline.");
        }

        // Prisma cascade on delete will handle deals, but better to move them
        // We do a raw update so deal history is preserved
        await (async () => {
            const { prisma } = await import("../../lib/prisma.js");
            await prisma.deal.updateMany({
                where: { stageId, pipelineId, isActive: true },
                data: { stageId: fallback!.id },
            });
            await prisma.pipelineStage.delete({ where: { id: stageId } });
        })();

        getIO()?.to(`org:${orgId}`).emit("pipeline:stage_deleted", {
            pipelineId,
            stageId,
            targetStageId: fallback!.id,
        });
    }

    async reorderStages(pipelineId: string, data: ReorderStagesInput, orgId: string) {
        const pipeline = await this.repo.findPipelineById(pipelineId, orgId);
        if (!pipeline) notFound("Pipeline");
        await this.repo.reorderStages(data.stages);
        const stages = await this.repo.findStagesByPipeline(pipelineId, orgId);
        getIO()?.to(`org:${orgId}`).emit("pipeline:stages_reordered", {
            pipelineId,
            stages: stages.map((s) => ({ id: s.id, order: s.order })),
        });
        return stages;
    }

    async assignAgentToStage(stageId: string, data: AssignAgentToStageInput, orgId: string) {
        const stage = await this.repo.findStageById(stageId, orgId);
        if (!stage) notFound("Stage");

        const agent = await this.repo.findAgent(data.agentId, orgId);
        if (!agent) notFound("Agente");
        if (agent.status !== "ACTIVE") {
            unprocessable("O agente precisa estar no status ACTIVE para ser vinculado a uma etapa.");
        }

        const assignCount = await this.repo.countAgentStageAssignments(data.agentId, orgId);
        if (assignCount >= 3) {
            unprocessable("Um agente não pode ser vinculado a mais de 3 etapas simultaneamente.");
        }

        const updated = await this.repo.assignAgentToStage(stageId, data.agentId, data.trigger, data.goal);

        await this.repo.createSystemActivity({
            title: `Agente "${agent.name}" vinculado à etapa "${stage.name}"`,
            dealId: stageId, // logging on the stage id as reference (no dealId needed here)
            userId: data.agentId,
            orgId,
        }).catch(() => null); // non-critical

        return updated;
    }

    async removeAgentFromStage(stageId: string, orgId: string) {
        const stage = await this.repo.findStageById(stageId, orgId);
        if (!stage) notFound("Stage");
        if (!stage.agentId) return stage;

        // Find deals in this stage that have an active agent session
        const dealsWithSessions = await this.repo.findDealsInStageWithActiveAgent(stageId, orgId);
        if (dealsWithSessions.length > 0) {
            // Mark all active sessions for handoff
            const { prisma } = await import("../../lib/prisma.js");
            const sessionIds = dealsWithSessions
                .map((d) => d.activeAgentSessionId)
                .filter(Boolean) as string[];

            if (sessionIds.length > 0) {
                await prisma.aIAgentSession.updateMany({
                    where: { id: { in: sessionIds }, status: { in: ["ACTIVE", "THINKING", "WAITING_USER"] } },
                    data: { status: "HANDOFF", handoffReason: "Agente removido da etapa" },
                });
                await prisma.deal.updateMany({
                    where: { id: { in: dealsWithSessions.map((d) => d.id) } },
                    data: { activeAgentSessionId: null },
                });
            }
        }

        return this.repo.removeAgentFromStage(stageId);
    }

    // =========================================================================
    // DEALS
    // =========================================================================

    async listDeals(orgId: string, filters: DealFilters, userId: string, role: string) {
        const scopeWhere = await this.buildDealScopeWhere(orgId, userId, role);
        const { data, total } = await this.repo.listDeals(orgId, filters, scopeWhere);
        return {
            data,
            total,
            page: filters.page,
            limit: filters.limit,
            totalPages: Math.ceil(total / filters.limit),
        };
    }

    async findDealById(id: string, orgId: string, userId: string, role: string) {
        const deal = await this.repo.findDealById(id, orgId);
        if (!deal) notFound("Deal");
        await this.assertDealAccess(deal, orgId, userId, role);
        return deal;
    }

    async createDeal(data: CreateDealInput, orgId: string, userId: string) {
        const ownerId = data.ownerId ?? userId;

        // Validate pipeline and stage belong to this org
        const stage = await this.repo.findStageById(data.stageId, orgId);
        if (!stage) notFound("Stage");
        if (stage.pipelineId_rel.orgId !== orgId) forbidden();
        if (stage.pipelineId !== data.pipelineId) {
            unprocessable("O stage informado não pertence ao pipeline.");
        }

        const deal = await this.repo.createDeal({ ...data, orgId, ownerId }, stage.name);

        // Timeline event + pubsub (non-blocking)
        Promise.all([
            this.repo.createTimelineEvent({
                type: "DEAL_CREATED",
                title: `Deal criado: ${deal.title}`,
                metadata: { dealId: deal.id, value: deal.value, stageId: deal.stageId, pipelineId: deal.pipelineId },
                contactId: data.contactId,
                userId,
                orgId,
            }),
            this.publishEvent("deal.created", { dealId: deal.id, orgId, stageId: deal.stageId, pipelineId: deal.pipelineId }),
        ]).catch(() => null);

        return deal;
    }

    async updateDeal(id: string, data: UpdateDealInput, orgId: string, userId: string, role: string) {
        const existing = await this.repo.findDealById(id, orgId);
        if (!existing) notFound("Deal");
        await this.assertDealAccess(existing, orgId, userId, role);
        return this.repo.updateDeal(id, data, orgId);
    }

    async moveDeal(id: string, input: MoveDealInput, orgId: string, userId: string, role: string) {
        const deal = await this.repo.findDealById(id, orgId);
        if (!deal) notFound("Deal");
        await this.assertDealAccess(deal, orgId, userId, role);

        const toStage = await this.repo.findStageById(input.toStageId, orgId);
        if (!toStage) notFound("Stage");
        if (toStage.pipelineId !== deal.pipelineId) {
            unprocessable("A etapa de destino não pertence ao mesmo pipeline.");
        }
        if (toStage.isLost && !input.reason) {
            unprocessable("Informe o motivo ao mover um deal para etapa de Perdido.");
        }

        const updated = await this.repo.moveDeal(
            id,
            orgId,
            { id: toStage.id, name: toStage.name, isWon: toStage.isWon, isLost: toStage.isLost },
            input.movedBy,
            {
                userId: input.movedBy === "HUMAN" ? userId : input.agentId,
                agentId: input.agentId,
                agentSessionId: input.agentSessionId,
                reason: input.reason,
                dataCollected: input.dataCollected,
                triggerEvent: input.triggerEvent,
            },
        );

        // Check requiredFields and emit warning if missing (non-blocking)
        const missingFields = this.checkRequiredFields(toStage.requiredFields as unknown[], deal.customFields as Record<string, unknown>);

        // Enqueue onExitActions for the stage we just left
        if (deal.stageId && deal.stageId !== toStage.id) {
            queues.automations().add("stage.exit", {
                dealId: id,
                orgId,
                stageId: deal.stageId,
                trigger: "exit",
                hops: 0,
            }).catch(() => null);
        }

        // Enqueue onEnterActions via BullMQ (worker loads rules from DB)
        queues.automations().add("stage.enter", {
            dealId: id,
            orgId,
            stageId: toStage.id,
            stageName: toStage.name,
            trigger: "enter",
            hops: 0,
        }).catch(() => null);

        // Auto-trigger agent via bridge if configured
        if (toStage.agentId && toStage.agentTrigger === "AUTO_ENTER") {
            pipelineAgentBridge.onDealEnterStage(
                { ...deal, lastActivityAt: deal.lastActivityAt ?? null },
                {
                    id: toStage.id,
                    name: toStage.name,
                    order: toStage.order,
                    agentId: toStage.agentId,
                    agentTrigger: toStage.agentTrigger,
                    agentGoal: toStage.agentGoal,
                    onEnterActions: toStage.onEnterActions,
                    onRottingActions: toStage.onRottingActions,
                },
                orgId,
            ).catch(() => null);
        }

        // Timeline event for won/lost
        if (toStage.isWon || toStage.isLost) {
            const salesCycleDays = Math.floor(
                (Date.now() - new Date(deal.createdAt).getTime()) / 86_400_000,
            );
            Promise.all([
                this.repo.createTimelineEvent({
                    type: toStage.isWon ? "DEAL_WON" : "DEAL_LOST",
                    title: toStage.isWon ? `Deal ganho: ${deal.title}` : `Deal perdido: ${deal.title}`,
                    description: input.reason,
                    metadata: { dealId: id, stageId: toStage.id, salesCycleDays },
                    contactId: deal.contactId,
                    userId,
                    orgId,
                }),
                this.publishEvent("deal.stage_changed", {
                    dealId: id,
                    orgId,
                    fromStageId: deal.stageId,
                    toStageId: toStage.id,
                    toStageName: toStage.name,
                    isWon: toStage.isWon,
                    isLost: toStage.isLost,
                    movedBy: input.movedBy,
                }),
            ]).catch(() => null);
        } else {
            this.publishEvent("deal.stage_changed", {
                dealId: id,
                orgId,
                fromStageId: deal.stageId,
                toStageId: toStage.id,
                toStageName: toStage.name,
                movedBy: input.movedBy,
            }).catch(() => null);
        }

        // Notify bridge of movement (learning, coaching insights, kanban socket)
        // Bridge call is fire-and-forget; failures are non-critical
        pipelineAgentBridge.onDealMoved(
            {
                id: `mv:${id}:${Date.now()}`,
                dealId: id,
                orgId,
                fromStageId: deal.stageId,
                toStageId: toStage.id,
                fromStageName: deal.stage?.name ?? null,
                toStageName: toStage.name,
                movedBy: input.movedBy,
                userId: input.movedBy === "HUMAN" ? userId : undefined,
                agentId: input.agentId,
                agentSessionId: input.agentSessionId,
            },
            orgId,
        ).catch(() => null);

        // Emit socket event to org room
        getIO()
            ?.to(`org:${orgId}`)
            .emit("pipeline:deal_moved", {
                dealId: id,
                fromStageId: deal.stageId,
                toStageId: toStage.id,
                toStageName: toStage.name,
                pipelineId: deal.pipelineId,
                movedBy: input.movedBy,
            });

        return {
            deal: updated,
            warnings: missingFields.length > 0 ? { missingRequiredFields: missingFields } : undefined,
        };
    }

    async deleteDeal(id: string, orgId: string, userId: string, role: string) {
        const deal = await this.repo.findDealById(id, orgId);
        if (!deal) notFound("Deal");
        await this.assertDealAccess(deal, orgId, userId, role);
        await this.repo.deleteDeal(id, orgId);
    }

    // =========================================================================
    // ROTTING
    // =========================================================================

    async checkRottingDeals(orgId: string) {
        const results = await this.repo.checkRottingDeals(orgId);

        const newlyRotting = results.filter((r) => r.action === "marked_rotting");
        if (newlyRotting.length > 0) {
            getIO()?.to(`org:${orgId}`).emit("pipeline:deals_rotting", {
                orgId,
                count: newlyRotting.length,
                dealIds: newlyRotting.map((r) => r.dealId),
            });
        }

        // Enqueue AUTO_ROTTING agent triggers
        const { prisma } = await import("../../lib/prisma.js");
        for (const r of newlyRotting) {
            const deal = await prisma.deal.findUnique({
                where: { id: r.dealId },
                select: {
                    id: true,
                    title: true,
                    contactId: true,
                    pipelineId: true,
                    ownerId: true,
                    customFields: true,
                    stageHistory: true,
                    lastActivityAt: true,
                    orgId: true,
                    stage: { select: { id: true, name: true, order: true, agentId: true, agentTrigger: true, agentGoal: true, onRottingActions: true } },
                },
            });
            if (!deal) continue;
            const stage = deal.stage;

            if (stage.agentId && stage.agentTrigger === "AUTO_ROTTING") {
                pipelineAgentBridge.onDealRotting(
                    {
                        id: r.dealId,
                        title: deal.title ?? "",
                        contactId: deal.contactId,
                        pipelineId: deal.pipelineId,
                        stageId: stage.id,
                        ownerId: deal.ownerId ?? "",
                        customFields: deal.customFields,
                        stageHistory: deal.stageHistory,
                        lastActivityAt: deal.lastActivityAt ?? null,
                    },
                    {
                        id: stage.id,
                        name: stage.name,
                        order: stage.order ?? 0,
                        agentId: stage.agentId,
                        agentTrigger: stage.agentTrigger,
                        agentGoal: stage.agentGoal,
                        onEnterActions: [],
                        onRottingActions: stage.onRottingActions,
                    },
                    orgId,
                ).catch(() => null);
            }

            const rottingActions = stage.onRottingActions as unknown[];
            if (rottingActions.length > 0) {
                queues.automations().add("stage.rotting", {
                    dealId: r.dealId,
                    orgId,
                    stageId: stage.id,
                    trigger: "rotting",
                    hops: 0,
                }).catch(() => null);
            }
        }

        return { processed: results.length, newlyRotting: newlyRotting.length };
    }

    // =========================================================================
    // AI PROBABILITY
    // =========================================================================

    async calculateAIProbability(dealId: string, orgId: string) {
        const deal = await this.repo.findDealById(dealId, orgId);
        if (!deal) notFound("Deal");
        const aiProbability = await this.repo.calculateAIProbability(dealId, orgId);
        return { dealId, aiProbability };
    }

    // =========================================================================
    // DEAL MOVEMENTS & SESSIONS
    // =========================================================================

    async listDealMovements(dealId: string, orgId: string, userId: string, role: string) {
        const deal = await this.repo.findDealById(dealId, orgId);
        if (!deal) notFound("Deal");
        await this.assertDealAccess(deal, orgId, userId, role);
        return this.repo.listDealMovements(dealId, orgId);
    }

    async listDealAgentSessions(dealId: string, orgId: string, userId: string, role: string) {
        const deal = await this.repo.findDealById(dealId, orgId);
        if (!deal) notFound("Deal");
        await this.assertDealAccess(deal, orgId, userId, role);
        return this.repo.listDealAgentSessions(dealId, orgId);
    }

    async activateAgentOnDeal(dealId: string, input: ActivateAgentInput, orgId: string, userId: string, role: string) {
        const deal = await this.repo.findDealById(dealId, orgId);
        if (!deal) notFound("Deal");
        await this.assertDealAccess(deal, orgId, userId, role);

        // Resolve agentId: explicit > stage's configured agent
        const stage = await this.repo.findStageById(deal.stageId, orgId);
        const agentId = input.agentId ?? stage?.agentId;
        if (!agentId) {
            unprocessable("Nenhum agente especificado e a etapa atual não tem um agente configurado.");
        }

        const agent = await this.repo.findAgent(agentId, orgId);
        if (!agent) notFound("Agente");
        if (!agent.isActive || agent.status !== "ACTIVE") {
            unprocessable("O agente não está ativo.");
        }

        // Enqueue activation job — the AI worker creates the session and updates deal.activeAgentSessionId
        await queues.ai().add("agent.activate", {
            dealId,
            orgId,
            agentId,
            agentGoal: stage?.agentGoal,
            trigger: "MANUAL",
            stageId: deal.stageId,
            reason: input.reason,
        });

        return { dealId, agentId, status: "activation_queued" };
    }

    // =========================================================================
    // ACTIVITIES
    // =========================================================================

    async createDealActivity(dealId: string, data: CreateDealActivityInput, orgId: string, userId: string, role: string) {
        const deal = await this.repo.findDealById(dealId, orgId);
        if (!deal) notFound("Deal");
        await this.assertDealAccess(deal, orgId, userId, role);
        return this.repo.createActivity({ ...data, dealId, contactId: deal.contactId, userId, orgId });
    }

    listDealActivities(dealId: string, orgId: string) {
        return this.repo.listDealActivities(dealId, orgId);
    }

    // =========================================================================
    // PRIVATE HELPERS
    // =========================================================================

    private async publishEvent(topic: string, data: Record<string, unknown>) {
        try {
            const pubsub = getPubSub();
            const dataBuffer = Buffer.from(JSON.stringify(data));
            await pubsub.topic(topic).publish(dataBuffer);
        } catch {
            // PubSub errors are non-critical; log if needed
        }
    }

    private checkRequiredFields(
        requiredFields: unknown[],
        customFields: Record<string, unknown>,
    ): string[] {
        if (!requiredFields || requiredFields.length === 0) return [];
        const missing: string[] = [];
        for (const field of requiredFields) {
            const f = field as { key?: string; label?: string };
            if (f.key && (customFields[f.key] === undefined || customFields[f.key] === null || customFields[f.key] === "")) {
                missing.push(f.label ?? f.key);
            }
        }
        return missing;
    }

    private async buildDealScopeWhere(orgId: string, userId: string, role: string): Promise<Record<string, unknown>> {
        if (role === "SUPER_ADMIN" || role === "ADMIN") return {};
        if (role === "MANAGER" || role === "BRANCH_MANAGER") {
            const user = await this.repo.findUser(userId);
            if (!user?.departmentId) return { ownerId: userId };
            const deptUsers = await this.repo.findUsersInDept(user.departmentId, orgId);
            return { ownerId: { in: deptUsers.map((u) => u.id) } };
        }
        return { ownerId: userId };
    }

    private async applyDealScopeToKanbanFilters(
        filters: KanbanFilters,
        orgId: string,
        userId: string,
        role: string,
    ): Promise<KanbanFilters> {
        if (role === "SUPER_ADMIN" || role === "ADMIN") return filters;
        if (role === "MANAGER" || role === "BRANCH_MANAGER") {
            const user = await this.repo.findUser(userId);
            if (!user?.departmentId) return { ...filters, ownerId: filters.ownerId ?? userId };
            const deptUsers = await this.repo.findUsersInDept(user.departmentId, orgId);
            const allowedIds = deptUsers.map((u) => u.id);
            if (filters.ownerId && !allowedIds.includes(filters.ownerId)) return { ...filters, ownerId: userId };
            return filters;
        }
        return { ...filters, ownerId: userId };
    }

    private async assertDealAccess(deal: { ownerId: string }, orgId: string, userId: string, role: string) {
        if (role === "SUPER_ADMIN" || role === "ADMIN") return;
        if (role === "MANAGER" || role === "BRANCH_MANAGER") {
            const user = await this.repo.findUser(userId);
            if (!user?.departmentId) {
                if (deal.ownerId !== userId) forbidden();
                return;
            }
            const deptUsers = await this.repo.findUsersInDept(user.departmentId, orgId);
            if (!new Set(deptUsers.map((u) => u.id)).has(deal.ownerId)) forbidden();
            return;
        }
        if (deal.ownerId !== userId) forbidden();
    }

    // =========================================================================
    // STAGE AUTOMATION LOGS & DRY-RUN
    // =========================================================================

    async getDealAutomationLogs(dealId: string, orgId: string, userId: string, role: string) {
        const deal = await this.repo.findDealById(dealId, orgId);
        if (!deal) notFound("Deal");
        await this.assertDealAccess(deal, orgId, userId, role);
        const { prisma } = await import("../../lib/prisma.js");
        return prisma.stageAutomationLog.findMany({
            where: { dealId, orgId },
            orderBy: { createdAt: "desc" },
            take: 100,
        });
    }

    async getStageAutomationLogs(stageId: string, pipelineId: string, orgId: string) {
        const stage = await this.repo.findStageById(stageId, orgId);
        if (!stage || stage.pipelineId !== pipelineId) notFound("Stage");
        const { prisma } = await import("../../lib/prisma.js");
        return prisma.stageAutomationLog.findMany({
            where: { stageId, orgId },
            orderBy: { createdAt: "desc" },
            take: 200,
        });
    }

    async testStageAutomation(
        stageId: string,
        pipelineId: string,
        body: { trigger: "enter" | "exit" | "rotting"; dealId: string; ruleId?: string },
        orgId: string,
    ) {
        const stage = await this.repo.findStageById(stageId, orgId);
        if (!stage || stage.pipelineId !== pipelineId) notFound("Stage");
        const deal = await this.repo.findDealById(body.dealId, orgId);
        if (!deal) notFound("Deal");

        const { StageRulesArraySchema } = await import("./stage-automation.schema.js");
        const { runStageAutomationRule } = await import("../automations/stage-automation.executor.js");

        const column =
            body.trigger === "enter"
                ? stage.onEnterActions
                : body.trigger === "exit"
                    ? stage.onExitActions
                    : stage.onRottingActions;

        const rules = StageRulesArraySchema.parse(column);
        const out: Array<{ ruleId: string; ruleName: string; results: unknown }> = [];

        for (const rule of rules) {
            if (body.ruleId && rule.id !== body.ruleId) continue;
            const results = await runStageAutomationRule(rule, {
                dealId: body.dealId,
                orgId,
                stageId,
                trigger: body.trigger,
                hops: 0,
                dryRun: true,
            });
            out.push({ ruleId: rule.id, ruleName: rule.name, results });
        }

        return { trigger: body.trigger, stageId, executed: out };
    }
}
