import { z } from "zod";
import type { FastifyPluginAsync } from "fastify";
import { PipelineService } from "./module.service.js";
import {
    CreatePipelineSchema,
    UpdatePipelineSchema,
    CreateDealSchema,
    UpdateDealSchema,
    MoveDealSchema,
    DealFiltersSchema,
    CreateDealActivitySchema,
    ForecastQuerySchema,
    type CreatePipelineInput,
    type UpdatePipelineInput,
    type CreateDealInput,
    type UpdateDealInput,
    type MoveDealInput,
    type DealFilters,
    type CreateDealActivityInput,
    type ForecastQuery,
} from "./module.schema.js";
import { requireRole } from "../../lib/permissions.js";

const IdParams = z.object({ id: z.string() });

export const pipelineRoutes: FastifyPluginAsync = async (fastify) => {
    const service = new PipelineService();

    // =========================================================================
    // PIPELINES
    // =========================================================================

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
            const body = request.body as CreatePipelineInput;
            const pipeline = await service.createPipeline(body, request.user.orgId!);
            return reply.code(201).send(pipeline);
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
            const body = request.body as UpdatePipelineInput;
            return service.updatePipeline(id, body, request.user.orgId!);
        },
    );

    // GET /pipeline/pipelines/:id/kanban
    fastify.get(
        "/pipelines/:id/kanban",
        {
            onRequest: [fastify.verifyJWT],
            schema: { params: IdParams },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            const user = request.user;
            return service.getKanban(id, user.orgId!, user.id!, user.role!);
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
            return service.listDeals(
                user.orgId!,
                request.query as DealFilters,
                user.id!,
                user.role!,
            );
        },
    );

    // GET /pipeline/deals/forecast  — must come before /:id
    fastify.get(
        "/deals/forecast",
        {
            onRequest: [fastify.verifyJWT, requireRole("MANAGER")],
            schema: { querystring: ForecastQuerySchema },
        },
        async (request) => {
            const { period } = request.query as ForecastQuery;
            return service.getForecast(request.user.orgId!, period);
        },
    );

    // GET /pipeline/deals/stats  — must come before /:id
    fastify.get(
        "/deals/stats",
        {
            onRequest: [fastify.verifyJWT, requireRole("MANAGER")],
        },
        async (request) => {
            return service.getDealStats(request.user.orgId!);
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

    // POST /pipeline/deals
    fastify.post(
        "/deals",
        {
            onRequest: [fastify.verifyJWT],
            schema: { body: CreateDealSchema },
        },
        async (request, reply) => {
            const body = request.body as CreateDealInput;
            const user = request.user;
            const deal = await service.createDeal(body, user.orgId!, user.id!);
            return reply.code(201).send(deal);
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
            const body = request.body as UpdateDealInput;
            const user = request.user;
            return service.updateDeal(id, body, user.orgId!, user.id!, user.role!);
        },
    );

    // PATCH /pipeline/deals/:id/move
    fastify.patch(
        "/deals/:id/move",
        {
            onRequest: [fastify.verifyJWT],
            schema: { params: IdParams, body: MoveDealSchema },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            const body = request.body as MoveDealInput;
            const user = request.user;
            return service.moveDeal(id, body, user.orgId!, user.id!, user.role!);
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

    // =========================================================================
    // DEAL ACTIVITIES
    // =========================================================================

    // POST /pipeline/deals/:id/activities
    fastify.post(
        "/deals/:id/activities",
        {
            onRequest: [fastify.verifyJWT],
            schema: { params: IdParams, body: CreateDealActivitySchema },
        },
        async (request, reply) => {
            const { id } = request.params as { id: string };
            const body = request.body as CreateDealActivityInput;
            const user = request.user;
            const activity = await service.createDealActivity(
                id,
                body,
                user.orgId!,
                user.id!,
                user.role!,
            );
            return reply.code(201).send(activity);
        },
    );

    // GET /pipeline/deals/:id/activities
    fastify.get(
        "/deals/:id/activities",
        {
            onRequest: [fastify.verifyJWT],
            schema: { params: IdParams },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            return service.listDealActivities(id, request.user.orgId!);
        },
    );
};
