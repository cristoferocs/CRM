import { z } from "zod";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { InboxService } from "./module.service.js";
import {
    ConversationFiltersSchema,
    CreateConversationSchema,
    AssignAgentSchema,
    ChangeStatusSchema,
    SendMessageSchema,
    MessageCursorSchema,
    type ConversationFilters,
    type CreateConversationInput,
    type AssignAgentInput,
    type ChangeStatusInput,
    type SendMessageInput,
    type MessageCursorInput,
} from "./module.schema.js";
import { verifyMetaChallenge } from "./webhooks/meta.webhook.js";
import { queues } from "../../queue/queues.js";
import {
    verifyMetaSignature,
    verifyEvolutionApiKey,
} from "../../lib/webhook-signatures.js";

declare module "fastify" {
    interface FastifyRequest {
        rawBody?: Buffer;
    }
}

const IdParams = z.object({ id: z.string() });

export const inboxRoutes: FastifyPluginAsync = async (fastify) => {
    const service = new InboxService();

    // Capture raw body for HMAC verification on webhook routes (scoped to inbox plugin).
    fastify.addContentTypeParser(
        "application/json",
        { parseAs: "buffer" },
        (req: FastifyRequest, body: Buffer, done) => {
            req.rawBody = body;
            try {
                const parsed = body.length > 0 ? JSON.parse(body.toString("utf8")) : {};
                done(null, parsed);
            } catch (err) {
                const error = err as Error & { statusCode?: number };
                error.statusCode = 400;
                done(error, undefined);
            }
        },
    );

    // =========================================================================
    // CONVERSATIONS
    // =========================================================================

    // GET /inbox/conversations
    fastify.get(
        "/conversations",
        {
            onRequest: [fastify.verifyJWT],
            schema: { querystring: ConversationFiltersSchema },
        },
        async (request) => {
            return service.listConversations(
                request.user.orgId!,
                request.query as ConversationFilters,
            );
        },
    );

    // POST /inbox/conversations
    fastify.post(
        "/conversations",
        {
            onRequest: [fastify.verifyJWT],
            schema: { body: CreateConversationSchema },
        },
        async (request, reply) => {
            const body = request.body as CreateConversationInput;
            const conv = await service.createConversation(body, request.user.orgId!);
            return reply.code(201).send(conv);
        },
    );

    // GET /inbox/conversations/:id
    fastify.get(
        "/conversations/:id",
        {
            onRequest: [fastify.verifyJWT],
            schema: { params: IdParams },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            return service.getConversation(id, request.user.orgId!);
        },
    );

    // GET /inbox/conversations/:id/messages
    fastify.get(
        "/conversations/:id/messages",
        {
            onRequest: [fastify.verifyJWT],
            schema: { params: IdParams, querystring: MessageCursorSchema },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            return service.getMessages(
                id,
                request.user.orgId!,
                request.query as MessageCursorInput,
            );
        },
    );

    // POST /inbox/conversations/:id/messages
    fastify.post(
        "/conversations/:id/messages",
        {
            onRequest: [fastify.verifyJWT],
            schema: { params: IdParams, body: SendMessageSchema },
        },
        async (request, reply) => {
            const { id } = request.params as { id: string };
            const body = request.body as SendMessageInput;
            const user = request.user;
            const msg = await service.sendMessage(id, body, user.orgId!, user.id!);
            return reply.code(201).send(msg);
        },
    );

    // PATCH /inbox/conversations/:id/assign
    fastify.patch(
        "/conversations/:id/assign",
        {
            onRequest: [fastify.verifyJWT],
            schema: { params: IdParams, body: AssignAgentSchema },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            const body = request.body as AssignAgentInput;
            return service.assignAgent(id, body, request.user.orgId!);
        },
    );

    // PATCH /inbox/conversations/:id/status
    fastify.patch(
        "/conversations/:id/status",
        {
            onRequest: [fastify.verifyJWT],
            schema: { params: IdParams, body: ChangeStatusSchema },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            const body = request.body as ChangeStatusInput;
            return service.changeStatus(id, body, request.user.orgId!);
        },
    );

    // PATCH /inbox/conversations/:id/read
    fastify.patch(
        "/conversations/:id/read",
        {
            onRequest: [fastify.verifyJWT],
            schema: { params: IdParams },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            return service.markAsRead(id, request.user.orgId!);
        },
    );

    // =========================================================================
    // WEBHOOKS (no authentication — verified by payload signature / token)
    // =========================================================================

    // POST /inbox/webhooks/evolution
    fastify.post(
        "/webhooks/evolution",
        { config: { rateLimit: { max: 500, timeWindow: "1 minute" } } },
        async (request, reply) => {
            const expectedKey = process.env.EVOLUTION_WEBHOOK_API_KEY ?? process.env.EVOLUTION_API_KEY;
            const providedKey =
                (request.headers["apikey"] as string | undefined) ??
                (request.headers["x-api-key"] as string | undefined);
            if (!expectedKey) {
                request.log.error("EVOLUTION_WEBHOOK_API_KEY not configured — refusing webhook");
                return reply.code(500).send({ ok: false, error: "webhook_not_configured" });
            }
            if (!verifyEvolutionApiKey(providedKey, expectedKey)) {
                request.log.warn(
                    { ip: request.ip, hasHeader: !!providedKey },
                    "Evolution webhook: invalid API key",
                );
                return reply.code(401).send({ ok: false, error: "invalid_signature" });
            }
            // Enqueue the raw payload and return 200 immediately.
            // All processing happens in the inbox worker.
            await queues.inbox().add(
                "inbox:evolution",
                { type: "inbox:evolution", payload: request.body as Record<string, unknown> },
                { attempts: 3, backoff: { type: "exponential", delay: 5_000 } },
            );
            return reply.code(200).send({ ok: true });
        },
    );

    // GET /inbox/webhooks/meta — challenge verification
    fastify.get(
        "/webhooks/meta",
        {
            schema: {
                querystring: z.object({
                    "hub.mode": z.string(),
                    "hub.verify_token": z.string(),
                    "hub.challenge": z.string(),
                }),
            },
        },
        async (request, reply) => {
            const qs = request.query as {
                "hub.mode": string;
                "hub.verify_token": string;
                "hub.challenge": string;
            };
            const challenge = verifyMetaChallenge(
                qs["hub.mode"],
                qs["hub.verify_token"],
                qs["hub.challenge"],
            );
            if (challenge) return reply.send(challenge);
            return reply.code(403).send({ message: "Forbidden" });
        },
    );

    // POST /inbox/webhooks/meta
    fastify.post(
        "/webhooks/meta",
        { config: { rateLimit: { max: 500, timeWindow: "1 minute" } } },
        async (request, reply) => {
            const appSecret = process.env.META_APP_SECRET;
            const signature =
                (request.headers["x-hub-signature-256"] as string | undefined) ??
                (request.headers["X-Hub-Signature-256"] as string | undefined);
            if (!appSecret) {
                request.log.error("META_APP_SECRET not configured — refusing webhook");
                return reply.code(500).send({ ok: false, error: "webhook_not_configured" });
            }
            if (!verifyMetaSignature(request.rawBody, signature, appSecret)) {
                request.log.warn(
                    { ip: request.ip, hasHeader: !!signature },
                    "Meta webhook: invalid HMAC signature",
                );
                return reply.code(401).send({ ok: false, error: "invalid_signature" });
            }
            await queues.inbox().add(
                "inbox:meta",
                { type: "inbox:meta", payload: request.body as Record<string, unknown> },
                { attempts: 3, backoff: { type: "exponential", delay: 5_000 } },
            );
            return reply.code(200).send({ ok: true });
        },
    );
};
