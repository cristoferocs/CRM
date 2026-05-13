import { z } from "zod";
import type { FastifyPluginAsync } from "fastify";
import { AgentService } from "./agent.service.js";
import {
    CreateAgentSchema,
    UpdateAgentSchema,
    RunAgentSchema,
} from "./agent.schema.js";
import { requireRole } from "../../../lib/permissions.js";

const IdParams = z.object({ id: z.string() });
const ConvParams = z.object({ conversationId: z.string() });

export const agentRoutes: FastifyPluginAsync = async (fastify) => {
    const service = new AgentService();

    // POST /agents
    fastify.post(
        "/",
        {
            onRequest: [fastify.verifyJWT, requireRole("ADMIN")],
            schema: { body: CreateAgentSchema },
        },
        async (request, reply) => {
            const agent = await service.create(request.body as never, request.user.orgId!);
            return reply.status(201).send(agent);
        },
    );

    // GET /agents
    fastify.get(
        "/",
        { onRequest: [fastify.verifyJWT] },
        async (request) => service.list(request.user.orgId!),
    );

    // GET /agents/:id
    fastify.get(
        "/:id",
        {
            onRequest: [fastify.verifyJWT],
            schema: { params: IdParams },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            return service.findById(id, request.user.orgId!);
        },
    );

    // PATCH /agents/:id
    fastify.patch(
        "/:id",
        {
            onRequest: [fastify.verifyJWT, requireRole("ADMIN")],
            schema: { params: IdParams, body: UpdateAgentSchema },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            return service.update(id, request.body as never, request.user.orgId!);
        },
    );

    // DELETE /agents/:id
    fastify.delete(
        "/:id",
        {
            onRequest: [fastify.verifyJWT, requireRole("ADMIN")],
            schema: { params: IdParams },
        },
        async (request, reply) => {
            const { id } = request.params as { id: string };
            await service.delete(id, request.user.orgId!);
            return reply.status(204).send();
        },
    );

    // POST /agents/:id/run
    fastify.post(
        "/:id/run",
        {
            onRequest: [fastify.verifyJWT],
            schema: { params: IdParams, body: RunAgentSchema },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            return service.run(id, request.body as never, request.user.orgId!);
        },
    );

    // GET /agents/sessions/:conversationId
    fastify.get(
        "/sessions/:conversationId",
        {
            onRequest: [fastify.verifyJWT],
            schema: { params: ConvParams },
        },
        async (request) => {
            const { conversationId } = request.params as { conversationId: string };
            return service.getActiveSession(conversationId);
        },
    );

    // PATCH /agents/:id/toggle — activate/deactivate agent
    fastify.patch(
        "/:id/toggle",
        {
            onRequest: [fastify.verifyJWT, requireRole("ADMIN")],
            schema: { params: IdParams },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            return service.toggle(id, request.user.orgId!);
        },
    );

    // POST /agents/:id/test — one-shot test without saving
    fastify.post(
        "/:id/test",
        {
            onRequest: [fastify.verifyJWT, requireRole("ADMIN")],
            schema: { params: IdParams, body: RunAgentSchema },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            return service.run(id, request.body as never, request.user.orgId!);
        },
    );

    // GET /agents/:id/sessions — list sessions for an agent
    fastify.get(
        "/:id/sessions",
        {
            onRequest: [fastify.verifyJWT],
            schema: { params: IdParams },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            return service.getSessionsForAgent(id, request.user.orgId!);
        },
    );

    // GET /agents/:id/performance — performance metrics
    fastify.get(
        "/:id/performance",
        {
            onRequest: [fastify.verifyJWT],
            schema: { params: IdParams },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            return service.getPerformance(id, request.user.orgId!);
        },
    );
};
