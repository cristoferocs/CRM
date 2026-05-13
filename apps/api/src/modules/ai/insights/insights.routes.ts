import { z } from "zod";
import type { FastifyPluginAsync } from "fastify";
import { InsightsService } from "./insights.service.js";
import { requireRole } from "../../../lib/permissions.js";

const ConvParams = z.object({ conversationId: z.string() });
const TrainingIdParams = z.object({ id: z.string() });

const InsightFiltersSchema = z.object({
    type: z.string().optional(),
    since: z.string().optional(),
});

const CreateTrainingDataSchema = z.object({
    type: z.enum(["OBJECTION_RESPONSE", "SALES_APPROACH", "PRODUCT_INFO", "FAQ"]),
    input: z.string().min(1),
    output: z.string().min(1),
});

const TrainingDataFiltersSchema = z.object({
    type: z.string().optional(),
});

export const insightsRoutes: FastifyPluginAsync = async (fastify) => {
    const service = new InsightsService();

    // GET /insights
    fastify.get(
        "/",
        {
            onRequest: [fastify.verifyJWT],
            schema: { querystring: InsightFiltersSchema },
        },
        async (request) => {
            const filters = request.query as { type?: string; since?: string };
            return service.list(request.user.orgId!, filters);
        },
    );

    // POST /insights/analyze-conversation/:conversationId
    fastify.post(
        "/analyze-conversation/:conversationId",
        {
            onRequest: [fastify.verifyJWT, requireRole("MANAGER")],
            schema: { params: ConvParams },
        },
        async (request) => {
            const { conversationId } = request.params as { conversationId: string };
            return service.analyzeConversation(conversationId, request.user.orgId!);
        },
    );

    // GET /insights/objections
    fastify.get(
        "/objections",
        { onRequest: [fastify.verifyJWT] },
        async (request) => service.getObjections(request.user.orgId!),
    );

    // POST /insights/objections/learn
    fastify.post(
        "/objections/learn",
        {
            onRequest: [fastify.verifyJWT, requireRole("MANAGER")],
            schema: { querystring: z.object({ period: z.string().optional() }) },
        },
        async (request) => {
            const { period } = request.query as { period?: string };
            return service.learnObjections(request.user.orgId!, period);
        },
    );

    // GET /insights/approaches
    fastify.get(
        "/approaches",
        { onRequest: [fastify.verifyJWT] },
        async (request) => service.getApproaches(request.user.orgId!),
    );

    // POST /insights/approaches/learn
    fastify.post(
        "/approaches/learn",
        {
            onRequest: [fastify.verifyJWT, requireRole("MANAGER")],
        },
        async (request) => service.learnApproaches(request.user.orgId!),
    );

    // GET /insights/dashboard
    fastify.get(
        "/dashboard",
        { onRequest: [fastify.verifyJWT] },
        async (request) => service.dashboard(request.user.orgId!),
    );

    // POST /training-data
    fastify.post(
        "/training-data",
        {
            onRequest: [fastify.verifyJWT, requireRole("MANAGER")],
            schema: { body: CreateTrainingDataSchema },
        },
        async (request, reply) => {
            const data = await service.createTrainingData(
                request.body as never,
                request.user.orgId!,
            );
            return reply.status(201).send(data);
        },
    );

    // PATCH /training-data/:id/validate
    fastify.patch(
        "/training-data/:id/validate",
        {
            onRequest: [fastify.verifyJWT, requireRole("MANAGER")],
            schema: { params: TrainingIdParams },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            return service.validateTrainingData(id, request.user.id!, request.user.orgId!);
        },
    );

    // GET /training-data
    fastify.get(
        "/training-data",
        {
            onRequest: [fastify.verifyJWT],
            schema: { querystring: TrainingDataFiltersSchema },
        },
        async (request) => {
            const { type } = request.query as { type?: string };
            return service.listTrainingData(request.user.orgId!, type);
        },
    );
};
