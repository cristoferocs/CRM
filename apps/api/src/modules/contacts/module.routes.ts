import { z } from "zod";
import type { FastifyPluginAsync } from "fastify";
import { ContactsService } from "./module.service.js";
import { LeadScoringService } from "./lead-scoring.service.js";
import {
    ContactFiltersSchema,
    CreateContactSchema,
    UpdateContactSchema,
    AddTagSchema,
    ContactListResponseSchema,
    ContactResponseSchema,
    ContactStatsResponseSchema,
    ContactTimelineResponseSchema,
    ImportResultResponseSchema,
    type ContactFilters,
    type CreateContactInput,
    type UpdateContactInput,
    type AddTagInput,
} from "./module.schema.js";
import { requireRole } from "../../lib/permissions.js";

const IdParams = z.object({ id: z.string() });
const TagParams = z.object({ id: z.string(), tag: z.string() });

export const contactsRoutes: FastifyPluginAsync = async (fastify) => {
    const service = new ContactsService();
    const leadScoring = new LeadScoringService();
    const auth = { onRequest: [fastify.verifyJWT] };

    // GET /contacts
    fastify.get(
        "/",
        {
            onRequest: [fastify.verifyJWT],
            schema: {
                querystring: ContactFiltersSchema,
                response: { 200: ContactListResponseSchema },
            },
        },
        async (request) => {
            const orgId = request.user.orgId!;
            return service.list(orgId, request.query as ContactFilters);
        },
    );

    // GET /contacts/stats
    fastify.get(
        "/stats",
        {
            onRequest: [fastify.verifyJWT],
            schema: {
                response: { 200: ContactStatsResponseSchema },
            },
        },
        async (request) => {
            const orgId = request.user.orgId!;
            return service.getStats(orgId);
        },
    );

    // -----------------------------------------------------------------------
    // Lead-Scoring routes (must be registered BEFORE /:id)
    // -----------------------------------------------------------------------

    // GET /contacts/lead-scoring/config
    fastify.get("/lead-scoring/config", auth, async (req) => {
        return leadScoring.getConfig(req.user.orgId!);
    });

    // PUT /contacts/lead-scoring/config
    fastify.put("/lead-scoring/config", auth, async (req) => {
        return leadScoring.upsertConfig(req.user.orgId!, req.body as Parameters<typeof leadScoring.upsertConfig>[1]);
    });

    // POST /contacts/lead-scoring/score-all
    fastify.post("/lead-scoring/score-all", auth, async (req) => {
        return leadScoring.scoreAllContacts(req.user.orgId!);
    });

    // GET /contacts/lead-scoring/leaderboard
    fastify.get("/lead-scoring/leaderboard", auth, async (req) => {
        const { limit } = req.query as Record<string, string>;
        return leadScoring.getLeaderboard(req.user.orgId!, Number(limit ?? 20));
    });

    // POST /contacts/:id/lead-score  (score a single contact)
    fastify.post("/:id/lead-score", auth, async (req) => {
        const { id } = req.params as { id: string };
        return leadScoring.scoreContact(id, req.user.orgId!);
    });

    // -----------------------------------------------------------------------

    // GET /contacts/:id
    fastify.get(
        "/:id",
        {
            onRequest: [fastify.verifyJWT],
            schema: {
                params: IdParams,
                response: { 200: ContactResponseSchema },
            },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            const orgId = request.user.orgId!;
            return service.findById(id, orgId);
        },
    );

    // GET /contacts/:id/timeline
    fastify.get(
        "/:id/timeline",
        {
            onRequest: [fastify.verifyJWT],
            schema: {
                params: IdParams,
                response: { 200: ContactTimelineResponseSchema },
            },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            const orgId = request.user.orgId!;
            return service.getTimeline(id, orgId);
        },
    );

    // GET /contacts/:id/deals
    fastify.get(
        "/:id/deals",
        {
            onRequest: [fastify.verifyJWT],
            schema: {
                params: IdParams,
            },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            const orgId = request.user.orgId!;
            return service.getDeals(id, orgId);
        },
    );

    // GET /contacts/:id/conversations
    fastify.get(
        "/:id/conversations",
        {
            onRequest: [fastify.verifyJWT],
            schema: {
                params: IdParams,
            },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            const orgId = request.user.orgId!;
            return service.getConversations(id, orgId);
        },
    );

    // POST /contacts
    fastify.post(
        "/",
        {
            onRequest: [fastify.verifyJWT],
            schema: {
                body: CreateContactSchema,
                response: { 201: ContactResponseSchema },
            },
        },
        async (request, reply) => {
            const orgId = request.user.orgId!;
            const userId = request.user.id!;
            const contact = await service.create(
                request.body as CreateContactInput,
                orgId,
                userId,
            );
            return reply.code(201).send(contact);
        },
    );

    // POST /contacts/import
    fastify.post(
        "/import",
        {
            onRequest: [fastify.verifyJWT, requireRole("MANAGER")],
            schema: {
                response: { 200: ImportResultResponseSchema },
            },
        },
        async (request, reply) => {
            const orgId = request.user.orgId!;
            const userId = request.user.id!;

            const file = await request.file();
            if (!file) {
                throw Object.assign(new Error("No file uploaded."), { statusCode: 400 });
            }

            const contentType = file.mimetype ?? "";
            const isCSV =
                contentType === "text/csv" ||
                contentType === "application/csv" ||
                contentType === "application/vnd.ms-excel" ||
                file.filename?.endsWith(".csv");

            if (!isCSV) {
                throw Object.assign(
                    new Error("Only CSV files are accepted."),
                    { statusCode: 400 },
                );
            }

            const chunks: Buffer[] = [];
            for await (const chunk of file.file) {
                chunks.push(chunk as Buffer);
            }
            const buffer = Buffer.concat(chunks);

            const result = await service.importCSV(buffer, orgId, userId);
            return reply.send(result);
        },
    );

    // PATCH /contacts/:id
    fastify.patch(
        "/:id",
        {
            onRequest: [fastify.verifyJWT],
            schema: {
                params: IdParams,
                body: UpdateContactSchema,
                response: { 200: ContactResponseSchema },
            },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            const orgId = request.user.orgId!;
            const userId = request.user.id!;
            return service.update(id, request.body as UpdateContactInput, orgId, userId);
        },
    );

    // DELETE /contacts/:id
    fastify.delete(
        "/:id",
        {
            onRequest: [fastify.verifyJWT, requireRole("MANAGER")],
            schema: {
                params: IdParams,
                response: { 200: z.object({ message: z.string() }) },
            },
        },
        async (request, reply) => {
            const { id } = request.params as { id: string };
            const orgId = request.user.orgId!;
            const userId = request.user.id!;
            await service.delete(id, orgId, userId);
            return reply.send({ message: "Contact deleted." });
        },
    );

    // POST /contacts/:id/tags
    fastify.post(
        "/:id/tags",
        {
            onRequest: [fastify.verifyJWT],
            schema: {
                params: IdParams,
                body: AddTagSchema,
                response: { 200: ContactResponseSchema },
            },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            const orgId = request.user.orgId!;
            const userId = request.user.id!;
            const { tag } = request.body as AddTagInput;
            return service.addTag(id, tag, orgId, userId);
        },
    );

    // DELETE /contacts/:id/tags/:tag
    fastify.delete(
        "/:id/tags/:tag",
        {
            onRequest: [fastify.verifyJWT],
            schema: {
                params: TagParams,
                response: { 200: ContactResponseSchema },
            },
        },
        async (request) => {
            const { id, tag } = request.params as { id: string; tag: string };
            const orgId = request.user.orgId!;
            const userId = request.user.id!;
            return service.removeTag(id, tag, orgId, userId);
        },
    );
};
