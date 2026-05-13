import { z } from "zod";
import type { FastifyPluginAsync } from "fastify";
import { AgentService } from "./agent.service.js";
import {
    CreateAgentSchema,
    UpdateAgentSchema,
    RunAgentSchema,
    StartLearningSchema,
    ApproveFlowSchema,
    RejectFlowSchema,
} from "./agent.schema.js";
import { requireRole } from "../../../lib/permissions.js";

const IdParams = z.object({ id: z.string() });
const ConvParams = z.object({ conversationId: z.string() });
const SessionParams = z.object({ sessionId: z.string() });

export const agentRoutes: FastifyPluginAsync = async (fastify) => {
    const service = new AgentService();

    // -----------------------------------------------------------------------
    // CRUD
    // -----------------------------------------------------------------------

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
        { onRequest: [fastify.verifyJWT], schema: { params: IdParams } },
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
        { onRequest: [fastify.verifyJWT, requireRole("ADMIN")], schema: { params: IdParams } },
        async (request, reply) => {
            const { id } = request.params as { id: string };
            await service.delete(id, request.user.orgId!);
            return reply.status(204).send();
        },
    );

    // -----------------------------------------------------------------------
    // Run
    // -----------------------------------------------------------------------

    // POST /agents/:id/run
    fastify.post(
        "/:id/run",
        { onRequest: [fastify.verifyJWT], schema: { params: IdParams, body: RunAgentSchema } },
        async (request) => {
            const { id } = request.params as { id: string };
            return service.run(id, request.body as never, request.user.orgId!);
        },
    );

    // POST /agents/:id/test — one-shot test without saving session
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

    // -----------------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------------

    // POST /agents/:id/activate
    fastify.post(
        "/:id/activate",
        { onRequest: [fastify.verifyJWT, requireRole("ADMIN")], schema: { params: IdParams } },
        async (request) => {
            const { id } = request.params as { id: string };
            return service.activate(id, request.user.orgId!);
        },
    );

    // POST /agents/:id/pause
    fastify.post(
        "/:id/pause",
        { onRequest: [fastify.verifyJWT, requireRole("ADMIN")], schema: { params: IdParams } },
        async (request) => {
            const { id } = request.params as { id: string };
            return service.pause(id, request.user.orgId!);
        },
    );

    // POST /agents/:id/retire
    fastify.post(
        "/:id/retire",
        { onRequest: [fastify.verifyJWT, requireRole("ADMIN")], schema: { params: IdParams } },
        async (request) => {
            const { id } = request.params as { id: string };
            return service.retire(id, request.user.orgId!);
        },
    );

    // PATCH /agents/:id/toggle — legacy shim
    fastify.patch(
        "/:id/toggle",
        { onRequest: [fastify.verifyJWT, requireRole("ADMIN")], schema: { params: IdParams } },
        async (request) => {
            const { id } = request.params as { id: string };
            return service.toggle(id, request.user.orgId!);
        },
    );

    // -----------------------------------------------------------------------
    // Learning phase
    // -----------------------------------------------------------------------

    // POST /agents/:id/learning/start
    fastify.post(
        "/:id/learning/start",
        {
            onRequest: [fastify.verifyJWT, requireRole("ADMIN")],
            schema: { params: IdParams, body: StartLearningSchema },
        },
        async (request, reply) => {
            const { id } = request.params as { id: string };
            const result = await service.startLearning(id, request.body as never, request.user.orgId!);
            return reply.status(202).send(result);
        },
    );

    // GET /agents/:id/learning/jobs
    fastify.get(
        "/:id/learning/jobs",
        { onRequest: [fastify.verifyJWT, requireRole("ADMIN")], schema: { params: IdParams } },
        async (request) => {
            const { id } = request.params as { id: string };
            return service.listLearningJobs(id, request.user.orgId!);
        },
    );

    // -----------------------------------------------------------------------
    // Flow versions
    // -----------------------------------------------------------------------

    // GET /agents/:id/flow-versions
    fastify.get(
        "/:id/flow-versions",
        { onRequest: [fastify.verifyJWT, requireRole("ADMIN")], schema: { params: IdParams } },
        async (request) => {
            const { id } = request.params as { id: string };
            return service.listFlowVersions(id, request.user.orgId!);
        },
    );

    // POST /agents/:id/flow-versions/approve
    fastify.post(
        "/:id/flow-versions/approve",
        {
            onRequest: [fastify.verifyJWT, requireRole("ADMIN")],
            schema: { params: IdParams, body: ApproveFlowSchema },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            return service.approveFlow(id, request.user.id!, request.body as never, request.user.orgId!);
        },
    );

    // POST /agents/:id/flow-versions/reject
    fastify.post(
        "/:id/flow-versions/reject",
        {
            onRequest: [fastify.verifyJWT, requireRole("ADMIN")],
            schema: { params: IdParams, body: RejectFlowSchema },
        },
        async (request, reply) => {
            const { id } = request.params as { id: string };
            await service.rejectFlow(id, request.body as never, request.user.orgId!);
            return reply.status(204).send();
        },
    );

    // -----------------------------------------------------------------------
    // Sessions
    // -----------------------------------------------------------------------

    // GET /agents/sessions/:conversationId — active session for a conversation
    fastify.get(
        "/sessions/:conversationId",
        { onRequest: [fastify.verifyJWT], schema: { params: ConvParams } },
        async (request) => {
            const { conversationId } = request.params as { conversationId: string };
            return service.getActiveSession(conversationId);
        },
    );

    // GET /agents/:id/sessions — all sessions for an agent
    fastify.get(
        "/:id/sessions",
        { onRequest: [fastify.verifyJWT], schema: { params: IdParams } },
        async (request) => {
            const { id } = request.params as { id: string };
            return service.getSessionsForAgent(id, request.user.orgId!);
        },
    );

    // GET /agents/sessions/:sessionId/turns — turn log for a session
    fastify.get(
        "/sessions/:sessionId/turns",
        { onRequest: [fastify.verifyJWT], schema: { params: SessionParams } },
        async (request) => {
            const { sessionId } = request.params as { sessionId: string };
            return service.getSessionTurns(sessionId, request.user.orgId!);
        },
    );

    // -----------------------------------------------------------------------
    // Performance
    // -----------------------------------------------------------------------

    // GET /agents/:id/performance
    fastify.get(
        "/:id/performance",
        { onRequest: [fastify.verifyJWT], schema: { params: IdParams } },
        async (request) => {
            const { id } = request.params as { id: string };
            return service.getPerformance(id, request.user.orgId!);
        },
    );
};


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
