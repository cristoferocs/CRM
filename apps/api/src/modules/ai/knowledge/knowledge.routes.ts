import { z } from "zod";
import type { FastifyPluginAsync } from "fastify";
import { KnowledgeService } from "./knowledge.service.js";
import {
    CreateKnowledgeBaseSchema,
    AddDocumentSchema,
    SearchKnowledgeSchema,
} from "./knowledge.schema.js";
import { requireRole } from "../../../lib/permissions.js";

const IdParams = z.object({ id: z.string() });
const DocParams = z.object({ id: z.string(), docId: z.string() });

export const knowledgeRoutes: FastifyPluginAsync = async (fastify) => {
    const service = new KnowledgeService();

    // POST /knowledge-bases
    fastify.post(
        "/",
        {
            onRequest: [fastify.verifyJWT, requireRole("MANAGER")],
            schema: { body: CreateKnowledgeBaseSchema },
        },
        async (request, reply) => {
            const orgId = request.user.orgId!;
            const kb = await service.createKnowledgeBase(
                request.body as never,
                orgId,
            );
            return reply.status(201).send(kb);
        },
    );

    // GET /knowledge-bases
    fastify.get(
        "/",
        { onRequest: [fastify.verifyJWT] },
        async (request) => {
            return service.listKnowledgeBases(request.user.orgId!);
        },
    );

    // GET /knowledge-bases/:id
    fastify.get(
        "/:id",
        {
            onRequest: [fastify.verifyJWT],
            schema: { params: IdParams },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            return service.getKnowledgeBase(id, request.user.orgId!);
        },
    );

    // DELETE /knowledge-bases/:id
    fastify.delete(
        "/:id",
        {
            onRequest: [fastify.verifyJWT, requireRole("ADMIN")],
            schema: { params: IdParams },
        },
        async (request, reply) => {
            const { id } = request.params as { id: string };
            await service.deleteKnowledgeBase(id, request.user.orgId!);
            return reply.status(204).send();
        },
    );

    // POST /knowledge-bases/:id/documents
    fastify.post(
        "/:id/documents",
        {
            onRequest: [fastify.verifyJWT, requireRole("MANAGER")],
            schema: { params: IdParams, body: AddDocumentSchema },
        },
        async (request, reply) => {
            const { id } = request.params as { id: string };
            const doc = await service.addDocument(
                id,
                request.body as never,
                request.user.orgId!,
            );
            return reply.status(202).send(doc); // 202 Accepted — indexing is async
        },
    );

    // DELETE /knowledge-bases/:id/documents/:docId
    fastify.delete(
        "/:id/documents/:docId",
        {
            onRequest: [fastify.verifyJWT, requireRole("MANAGER")],
            schema: { params: DocParams },
        },
        async (request, reply) => {
            const { docId } = request.params as { id: string; docId: string };
            await service.deleteDocument(docId, request.user.orgId!);
            return reply.status(204).send();
        },
    );

    // GET /knowledge-bases/:id/documents/:docId/status
    fastify.get(
        "/:id/documents/:docId/status",
        {
            onRequest: [fastify.verifyJWT],
            schema: { params: DocParams },
        },
        async (request) => {
            const { docId } = request.params as { id: string; docId: string };
            return service.getDocumentStatus(docId, request.user.orgId!);
        },
    );

    // POST /knowledge-bases/:id/search
    fastify.post(
        "/:id/search",
        {
            onRequest: [fastify.verifyJWT, requireRole("MANAGER")],
            schema: {
                params: IdParams,
                body: SearchKnowledgeSchema.omit({ knowledgeBaseIds: true }),
            },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            const body = request.body as { query: string; limit?: number };
            return service.search(
                { query: body.query, knowledgeBaseIds: [id], limit: body.limit ?? 5 },
                request.user.orgId!,
            );
        },
    );
};
