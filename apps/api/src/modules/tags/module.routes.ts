import { z } from "zod";
import type { FastifyPluginAsync } from "fastify";
import { TagsService } from "./module.service.js";
import {
    CreateTagSchema,
    UpdateTagSchema,
    TagFiltersSchema,
    TagResponseSchema,
    TagListResponseSchema,
    TagUsageResponseSchema,
    TagDeleteResponseSchema,
    type CreateTagInput,
    type UpdateTagInput,
    type TagFilters,
} from "./module.schema.js";
import { requireRole } from "../../lib/permissions.js";

const IdParams = z.object({ id: z.string() });

export const tagsRoutes: FastifyPluginAsync = async (fastify) => {
    const service = new TagsService();

    // GET /tags
    fastify.get(
        "/",
        {
            onRequest: [fastify.verifyJWT],
            schema: {
                querystring: TagFiltersSchema,
                response: { 200: TagListResponseSchema },
            },
        },
        async (request) => {
            const orgId = request.user.orgId!;
            return service.list(orgId, request.query as TagFilters);
        },
    );

    // POST /tags  — any authenticated user can create
    fastify.post(
        "/",
        {
            onRequest: [fastify.verifyJWT],
            schema: {
                body: CreateTagSchema,
                response: { 201: TagResponseSchema },
            },
        },
        async (request, reply) => {
            const orgId = request.user.orgId!;
            const userId = request.user.id!;
            const tag = await service.create(request.body as CreateTagInput, orgId, userId);
            return reply.code(201).send(tag);
        },
    );

    // GET /tags/:id
    fastify.get(
        "/:id",
        {
            onRequest: [fastify.verifyJWT],
            schema: { params: IdParams, response: { 200: TagResponseSchema } },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            return service.findById(id, request.user.orgId!);
        },
    );

    // GET /tags/:id/usage
    fastify.get(
        "/:id/usage",
        {
            onRequest: [fastify.verifyJWT],
            schema: { params: IdParams, response: { 200: TagUsageResponseSchema } },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            return service.usage(id, request.user.orgId!);
        },
    );

    // PATCH /tags/:id  — admin only (rename / recolor)
    fastify.patch(
        "/:id",
        {
            onRequest: [fastify.verifyJWT, requireRole("ADMIN")],
            schema: {
                params: IdParams,
                body: UpdateTagSchema,
                response: { 200: TagResponseSchema },
            },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            return service.update(id, request.body as UpdateTagInput, request.user.orgId!);
        },
    );

    // DELETE /tags/:id  — admin only
    fastify.delete(
        "/:id",
        {
            onRequest: [fastify.verifyJWT, requireRole("ADMIN")],
            schema: { params: IdParams, response: { 200: TagDeleteResponseSchema } },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            return service.delete(id, request.user.orgId!);
        },
    );
};
