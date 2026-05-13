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
    RefineFlowSchema,
    SessionFiltersSchema,
} from "./agent.schema.js";
import { requireRole } from "../../../lib/permissions.js";

const IdParams = z.object({ id: z.string() });
const ConvParams = z.object({ conversationId: z.string() });
const SessionParams = z.object({ sessionId: z.string() });
const VersionParams = z.object({ id: z.string(), versionId: z.string() });
const TurnParams = z.object({ id: z.string(), turnId: z.string() });
const AgentSessionParams = z.object({ id: z.string(), sessionId: z.string() });

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

    // GET /agents/:id/learning/status
    fastify.get(
        "/:id/learning/status",
        { onRequest: [fastify.verifyJWT, requireRole("ADMIN")], schema: { params: IdParams } },
        async (request) => {
            const { id } = request.params as { id: string };
            return service.getLearningStatus(id, request.user.orgId!);
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

    // GET /agents/:id/flow-versions/:versionId
    fastify.get(
        "/:id/flow-versions/:versionId",
        { onRequest: [fastify.verifyJWT, requireRole("ADMIN")], schema: { params: VersionParams } },
        async (request) => {
            const { id, versionId } = request.params as { id: string; versionId: string };
            return service.getFlowVersion(id, versionId, request.user.orgId!);
        },
    );

    // POST /agents/:id/flow-versions/:versionId/approve
    fastify.post(
        "/:id/flow-versions/:versionId/approve",
        {
            onRequest: [fastify.verifyJWT, requireRole("ADMIN")],
            schema: { params: VersionParams, body: ApproveFlowSchema },
        },
        async (request) => {
            const { id, versionId } = request.params as { id: string; versionId: string };
            return service.approveFlowVersionById(
                id, versionId, request.user.id!, request.body as never, request.user.orgId!,
            );
        },
    );

    // POST /agents/:id/flow-versions/:versionId/reject
    fastify.post(
        "/:id/flow-versions/:versionId/reject",
        {
            onRequest: [fastify.verifyJWT, requireRole("ADMIN")],
            schema: { params: VersionParams, body: RejectFlowSchema },
        },
        async (request, reply) => {
            const { id, versionId } = request.params as { id: string; versionId: string };
            await service.rejectFlowVersionById(
                id, versionId, request.body as never, request.user.id!, request.user.orgId!,
            );
            return reply.status(204).send();
        },
    );

    // PATCH /agents/:id/flow-versions/:versionId/refine
    fastify.patch(
        "/:id/flow-versions/:versionId/refine",
        {
            onRequest: [fastify.verifyJWT, requireRole("ADMIN")],
            schema: { params: VersionParams, body: RefineFlowSchema },
        },
        async (request) => {
            const { id, versionId } = request.params as { id: string; versionId: string };
            return service.refineFlowVersion(
                id, versionId, request.body as never, request.user.id!, request.user.orgId!,
            );
        },
    );

    // Legacy: POST /agents/:id/flow-versions/approve (uses latest version)
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

    // Legacy: POST /agents/:id/flow-versions/reject (uses latest version)
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

    // GET /agents/:id/sessions — filtered list of sessions
    fastify.get(
        "/:id/sessions",
        { onRequest: [fastify.verifyJWT], schema: { params: IdParams, querystring: SessionFiltersSchema } },
        async (request) => {
            const { id } = request.params as { id: string };
            return service.getSessionsFiltered(id, request.user.orgId!, request.query as never);
        },
    );

    // GET /agents/:id/sessions/:sessionId — session detail with all turns
    fastify.get(
        "/:id/sessions/:sessionId",
        { onRequest: [fastify.verifyJWT], schema: { params: AgentSessionParams } },
        async (request) => {
            const { id, sessionId } = request.params as { id: string; sessionId: string };
            return service.getSessionDetail(id, sessionId, request.user.orgId!);
        },
    );

    // GET /agents/sessions/:sessionId/turns — turn log (legacy, kept for backwards compat)
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

    // GET /agents/:id/performance — aggregated metrics + weekly chart
    fastify.get(
        "/:id/performance",
        { onRequest: [fastify.verifyJWT], schema: { params: IdParams } },
        async (request) => {
            const { id } = request.params as { id: string };
            return service.getWeeklyPerformance(id, request.user.orgId!);
        },
    );

    // -----------------------------------------------------------------------
    // Turns
    // -----------------------------------------------------------------------

    // GET /agents/:id/turns/:turnId — detailed reasoning for a specific turn
    fastify.get(
        "/:id/turns/:turnId",
        { onRequest: [fastify.verifyJWT], schema: { params: TurnParams } },
        async (request) => {
            const { turnId } = request.params as { id: string; turnId: string };
            return service.getTurnDetail(turnId, request.user.orgId!);
        },
    );
};
