import { z } from "zod";
import type { FastifyPluginAsync } from "fastify";
import { PipelineService } from "./module.service.js";
import {
    CreatePipelineSchema,
    UpdatePipelineSchema,
    CreateStageSchema,
    UpdateStageSchema,
    ReorderStagesSchema,
    AssignAgentToStageSchema,
    RemoveStageBodySchema,
    TestStageAutomationSchema,
    CreateDealSchema,
    UpdateDealSchema,
    MoveDealSchema,
    DealFiltersSchema,
    KanbanFiltersSchema,
    PipelineStatsQuerySchema,
    OverviewQuerySchema,
    CreateDealActivitySchema,
    ActivateAgentSchema,
    type CreatePipelineInput,
    type UpdatePipelineInput,
    type CreateStageInput,
    type UpdateStageInput,
    type ReorderStagesInput,
    type AssignAgentToStageInput,
    type CreateDealInput,
    type UpdateDealInput,
    type MoveDealInput,
    type DealFilters,
    type KanbanFilters,
    type PipelineStatsQuery,
    type OverviewQuery,
    type CreateDealActivityInput,
    type ActivateAgentInput,
} from "./module.schema.js";
import { requireRole } from "../../lib/permissions.js";

const IdParams = z.object({ id: z.string() });
const StageParams = z.object({ id: z.string(), stageId: z.string() });
const DuplicateBody = z.object({ name: z.string().min(1).max(100) });

export const pipelineRoutes: FastifyPluginAsync = async (fastify) => {
    const service = new PipelineService();

    // =========================================================================
    // PIPELINES
    // =========================================================================

    // GET /pipeline/pipelines/overview  — must come before /:id
    fastify.get(
        "/pipelines/overview",
        {
            onRequest: [fastify.verifyJWT, requireRole("MANAGER")],
            schema: { querystring: OverviewQuerySchema },
        },
        async (request) => {
            return service.getMultiPipelineOverview(request.user.orgId!, request.query as OverviewQuery);
        },
    );

    // GET /pipeline/pipelines
    fastify.get(
        "/pipelines",
        { onRequest: [fastify.verifyJWT] },
        async (request) => {
            return service.listPipelines(request.user.orgId!);
        },
    );

    // POST /pipeline/pipelines
    fastify.post(
        "/pipelines",
        {
            onRequest: [fastify.verifyJWT, requireRole("MANAGER")],
            schema: { body: CreatePipelineSchema },
        },
        async (request, reply) => {
            const pipeline = await service.createPipeline(
                request.body as CreatePipelineInput,
                request.user.orgId!,
            );
            return reply.code(201).send(pipeline);
        },
    );

    // GET /pipeline/pipelines/:id
    fastify.get(
        "/pipelines/:id",
        {
            onRequest: [fastify.verifyJWT],
            schema: { params: IdParams },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            return service.findPipelineById(id, request.user.orgId!);
        },
    );

    // PATCH /pipeline/pipelines/:id
    fastify.patch(
        "/pipelines/:id",
        {
            onRequest: [fastify.verifyJWT, requireRole("MANAGER")],
            schema: { params: IdParams, body: UpdatePipelineSchema },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            return service.updatePipeline(id, request.body as UpdatePipelineInput, request.user.orgId!);
        },
    );

    // DELETE /pipeline/pipelines/:id
    fastify.delete(
        "/pipelines/:id",
        {
            onRequest: [fastify.verifyJWT, requireRole("MANAGER")],
            schema: { params: IdParams },
        },
        async (request, reply) => {
            const { id } = request.params as { id: string };
            await service.deactivatePipeline(id, request.user.orgId!);
            return reply.code(204).send();
        },
    );

    // POST /pipeline/pipelines/:id/duplicate
    fastify.post(
        "/pipelines/:id/duplicate",
        {
            onRequest: [fastify.verifyJWT, requireRole("MANAGER")],
            schema: { params: IdParams, body: DuplicateBody },
        },
        async (request, reply) => {
            const { id } = request.params as { id: string };
            const { name } = request.body as { name: string };
            const pipeline = await service.duplicatePipeline(id, name, request.user.orgId!);
            return reply.code(201).send(pipeline);
        },
    );

    // GET /pipeline/pipelines/:id/kanban
    fastify.get(
        "/pipelines/:id/kanban",
        {
            onRequest: [fastify.verifyJWT],
            schema: { params: IdParams, querystring: KanbanFiltersSchema },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            const user = request.user;
            return service.getPipelineKanban(
                id,
                user.orgId!,
                request.query as KanbanFilters,
                user.id!,
                user.role!,
            );
        },
    );

    // GET /pipeline/pipelines/:id/stats
    fastify.get(
        "/pipelines/:id/stats",
        {
            onRequest: [fastify.verifyJWT, requireRole("MANAGER")],
            schema: { params: IdParams, querystring: PipelineStatsQuerySchema },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            return service.getPipelineStats(id, request.user.orgId!, request.query as PipelineStatsQuery);
        },
    );

    // =========================================================================
    // STAGES
    // =========================================================================

    // POST /pipeline/pipelines/:id/stages
    fastify.post(
        "/pipelines/:id/stages",
        {
            onRequest: [fastify.verifyJWT, requireRole("MANAGER")],
            schema: { params: IdParams, body: CreateStageSchema },
        },
        async (request, reply) => {
            const { id } = request.params as { id: string };
            const stage = await service.createStage(id, request.body as CreateStageInput, request.user.orgId!);
            return reply.code(201).send(stage);
        },
    );

    // PATCH /pipeline/pipelines/:id/stages/reorder  — must come before /:stageId
    fastify.patch(
        "/pipelines/:id/stages/reorder",
        {
            onRequest: [fastify.verifyJWT, requireRole("MANAGER")],
            schema: { params: IdParams, body: ReorderStagesSchema },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            return service.reorderStages(id, request.body as ReorderStagesInput, request.user.orgId!);
        },
    );

    // PATCH /pipeline/pipelines/:id/stages/:stageId
    fastify.patch(
        "/pipelines/:id/stages/:stageId",
        {
            onRequest: [fastify.verifyJWT, requireRole("MANAGER")],
            schema: { params: StageParams, body: UpdateStageSchema },
        },
        async (request) => {
            const { id, stageId } = request.params as { id: string; stageId: string };
            return service.updateStage(stageId, id, request.body as UpdateStageInput, request.user.orgId!);
        },
    );

    // DELETE /pipeline/pipelines/:id/stages/:stageId
    fastify.delete(
        "/pipelines/:id/stages/:stageId",
        {
            onRequest: [fastify.verifyJWT, requireRole("MANAGER")],
            schema: { params: StageParams, body: RemoveStageBodySchema.optional() },
        },
        async (request, reply) => {
            const { id, stageId } = request.params as { id: string; stageId: string };
            const body = (request.body ?? {}) as { targetStageId?: string };
            await service.removeStage(stageId, id, request.user.orgId!, body.targetStageId);
            return reply.code(204).send();
        },
    );

    // GET /pipeline/pipelines/:id/stages/:stageId/automation-logs
    fastify.get(
        "/pipelines/:id/stages/:stageId/automation-logs",
        {
            onRequest: [fastify.verifyJWT, requireRole("MANAGER")],
            schema: { params: StageParams },
        },
        async (request) => {
            const { id, stageId } = request.params as { id: string; stageId: string };
            return service.getStageAutomationLogs(stageId, id, request.user.orgId!);
        },
    );

    // POST /pipeline/pipelines/:id/stages/:stageId/automation-test (dry-run)
    fastify.post(
        "/pipelines/:id/stages/:stageId/automation-test",
        {
            onRequest: [fastify.verifyJWT, requireRole("MANAGER")],
            schema: { params: StageParams, body: TestStageAutomationSchema },
        },
        async (request) => {
            const { id, stageId } = request.params as { id: string; stageId: string };
            return service.testStageAutomation(
                stageId,
                id,
                request.body as { trigger: "enter" | "exit" | "rotting"; dealId: string; ruleId?: string },
                request.user.orgId!,
            );
        },
    );

    // POST /pipeline/pipelines/:id/stages/:stageId/agent
    fastify.post(
        "/pipelines/:id/stages/:stageId/agent",
        {
            onRequest: [fastify.verifyJWT, requireRole("MANAGER")],
            schema: { params: StageParams, body: AssignAgentToStageSchema },
        },
        async (request) => {
            const { stageId } = request.params as { id: string; stageId: string };
            return service.assignAgentToStage(stageId, request.body as AssignAgentToStageInput, request.user.orgId!);
        },
    );

    // DELETE /pipeline/pipelines/:id/stages/:stageId/agent
    fastify.delete(
        "/pipelines/:id/stages/:stageId/agent",
        {
            onRequest: [fastify.verifyJWT, requireRole("MANAGER")],
            schema: { params: StageParams },
        },
        async (request, reply) => {
            const { stageId } = request.params as { id: string; stageId: string };
            await service.removeAgentFromStage(stageId, request.user.orgId!);
            return reply.code(204).send();
        },
    );

    // =========================================================================
    // DEALS
    // =========================================================================

    // GET /pipeline/deals
    fastify.get(
        "/deals",
        {
            onRequest: [fastify.verifyJWT],
            schema: { querystring: DealFiltersSchema },
        },
        async (request) => {
            const user = request.user;
            return service.listDeals(user.orgId!, request.query as DealFilters, user.id!, user.role!);
        },
    );

    // POST /pipeline/deals
    fastify.post(
        "/deals",
        {
            onRequest: [fastify.verifyJWT],
            schema: { body: CreateDealSchema },
        },
        async (request, reply) => {
            const user = request.user;
            const deal = await service.createDeal(request.body as CreateDealInput, user.orgId!, user.id!);
            return reply.code(201).send(deal);
        },
    );

    // GET /pipeline/deals/:id
    fastify.get(
        "/deals/:id",
        {
            onRequest: [fastify.verifyJWT],
            schema: { params: IdParams },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            const user = request.user;
            return service.findDealById(id, user.orgId!, user.id!, user.role!);
        },
    );

    // GET /pipeline/deals/:id/automation-logs
    fastify.get(
        "/deals/:id/automation-logs",
        {
            onRequest: [fastify.verifyJWT],
            schema: { params: IdParams },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            const user = request.user;
            return service.getDealAutomationLogs(id, user.orgId!, user.id!, user.role!);
        },
    );

    // PATCH /pipeline/deals/:id
    fastify.patch(
        "/deals/:id",
        {
            onRequest: [fastify.verifyJWT],
            schema: { params: IdParams, body: UpdateDealSchema },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            const user = request.user;
            return service.updateDeal(id, request.body as UpdateDealInput, user.orgId!, user.id!, user.role!);
        },
    );

    // POST /pipeline/deals/:id/move
    fastify.post(
        "/deals/:id/move",
        {
            onRequest: [fastify.verifyJWT],
            schema: { params: IdParams, body: MoveDealSchema },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            const user = request.user;
            return service.moveDeal(id, request.body as MoveDealInput, user.orgId!, user.id!, user.role!);
        },
    );

    // POST /pipeline/deals/:id/activities
    fastify.post(
        "/deals/:id/activities",
        {
            onRequest: [fastify.verifyJWT],
            schema: { params: IdParams, body: CreateDealActivitySchema },
        },
        async (request, reply) => {
            const { id } = request.params as { id: string };
            const user = request.user;
            const activity = await service.createDealActivity(
                id,
                request.body as CreateDealActivityInput,
                user.orgId!,
                user.id!,
                user.role!,
            );
            return reply.code(201).send(activity);
        },
    );

    // GET /pipeline/deals/:id/movements
    fastify.get(
        "/deals/:id/movements",
        {
            onRequest: [fastify.verifyJWT],
            schema: { params: IdParams },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            const user = request.user;
            return service.listDealMovements(id, user.orgId!, user.id!, user.role!);
        },
    );

    // GET /pipeline/deals/:id/agent-sessions
    fastify.get(
        "/deals/:id/agent-sessions",
        {
            onRequest: [fastify.verifyJWT],
            schema: { params: IdParams },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            const user = request.user;
            return service.listDealAgentSessions(id, user.orgId!, user.id!, user.role!);
        },
    );

    // POST /pipeline/deals/:id/activate-agent
    fastify.post(
        "/deals/:id/activate-agent",
        {
            onRequest: [fastify.verifyJWT],
            schema: { params: IdParams, body: ActivateAgentSchema },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            const user = request.user;
            return service.activateAgentOnDeal(
                id,
                request.body as ActivateAgentInput,
                user.orgId!,
                user.id!,
                user.role!,
            );
        },
    );

    // DELETE /pipeline/deals/:id
    fastify.delete(
        "/deals/:id",
        {
            onRequest: [fastify.verifyJWT],
            schema: { params: IdParams },
        },
        async (request, reply) => {
            const { id } = request.params as { id: string };
            const user = request.user;
            await service.deleteDeal(id, user.orgId!, user.id!, user.role!);
            return reply.code(204).send();
        },
    );
};
