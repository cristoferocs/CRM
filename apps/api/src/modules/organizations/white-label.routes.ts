import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { WhiteLabelService } from "./white-label.service.js";
import {
    UpdateWhiteLabelSchema,
    WhiteLabelPublicSchema,
    WhiteLabelDomainResponseSchema,
    WhiteLabelSettingsSchema,
    type UpdateWhiteLabelInput,
} from "./white-label.schema.js";
import { requireRole, requireSameOrg } from "../../lib/permissions.js";
import { getRedis } from "../../lib/redis.js";

// ---------------------------------------------------------------------------
// Shared param / body schemas
// ---------------------------------------------------------------------------

const OrgIdParams = z.object({ orgId: z.string() });
const AddDomainBodySchema = z.object({ domain: z.string().min(3).max(253) });
const UploadResponseSchema = z.object({ url: z.string() });

// ---------------------------------------------------------------------------
// Public routes — no authentication required
// Register at /public prefix in server.ts
// ---------------------------------------------------------------------------

export async function whiteLabelPublicRoutes(fastify: FastifyInstance) {
    const service = new WhiteLabelService();

    // GET /public/white-label?domain=crm.agenciaxyz.com.br
    fastify.get(
        "/white-label",
        {
            schema: {
                querystring: z.object({ domain: z.string().min(1) }),
                response: { 200: WhiteLabelPublicSchema.nullable() },
            },
        },
        async (request, reply) => {
            const { domain } = request.query as { domain: string };

            const redis = getRedis();
            const cacheKey = `wl:public:${domain}`;

            const cached = await redis.get(cacheKey);
            if (cached) {
                return reply.send(JSON.parse(cached));
            }

            const settings = await service.getPublicByDomain(domain);

            // Cache for 5 minutes — even null responses to avoid DB hammering
            await redis.setex(cacheKey, 300, JSON.stringify(settings));

            return reply.send(settings);
        },
    );
}

// ---------------------------------------------------------------------------
// Authenticated routes — registered from within organizationsRoutes
// All paths follow the /:orgId/white-label/... convention
// ---------------------------------------------------------------------------

export async function whiteLabelRoutes(fastify: FastifyInstance) {
    const service = new WhiteLabelService();

    // GET /organizations/:orgId/white-label
    fastify.get(
        "/:orgId/white-label",
        {
            onRequest: [fastify.verifyJWT, requireRole("ADMIN"), requireSameOrg("orgId")],
            schema: {
                params: OrgIdParams,
                response: { 200: WhiteLabelSettingsSchema },
            },
        },
        async (request) => {
            const { orgId } = request.params as { orgId: string };
            return service.getSettings(orgId);
        },
    );

    // PATCH /organizations/:orgId/white-label
    fastify.patch(
        "/:orgId/white-label",
        {
            onRequest: [fastify.verifyJWT, requireRole("ADMIN"), requireSameOrg("orgId")],
            schema: {
                params: OrgIdParams,
                body: UpdateWhiteLabelSchema,
                response: { 200: WhiteLabelSettingsSchema },
            },
        },
        async (request) => {
            const { orgId } = request.params as { orgId: string };
            const userId = request.user.id!;
            return service.updateSettings(orgId, request.body as UpdateWhiteLabelInput, userId);
        },
    );

    // POST /organizations/:orgId/white-label/logo
    fastify.post(
        "/:orgId/white-label/logo",
        {
            onRequest: [fastify.verifyJWT, requireRole("ADMIN"), requireSameOrg("orgId")],
            schema: {
                params: OrgIdParams,
                response: { 200: UploadResponseSchema },
            },
        },
        async (request, reply) => {
            const { orgId } = request.params as { orgId: string };
            const userId = request.user.id!;

            const file = await request.file();
            if (!file) {
                throw Object.assign(new Error("No file uploaded."), { statusCode: 400 });
            }

            const chunks: Buffer[] = [];
            for await (const chunk of file.file) chunks.push(chunk as Buffer);
            const buffer = Buffer.concat(chunks);

            const url = await service.uploadLogo(buffer, file.mimetype, orgId);

            // Persist the new URL into whiteLabelSettings
            await service.updateSettings(orgId, { logoUrl: url }, userId);

            return reply.send({ url });
        },
    );

    // POST /organizations/:orgId/white-label/favicon
    fastify.post(
        "/:orgId/white-label/favicon",
        {
            onRequest: [fastify.verifyJWT, requireRole("ADMIN"), requireSameOrg("orgId")],
            schema: {
                params: OrgIdParams,
                response: { 200: UploadResponseSchema },
            },
        },
        async (request, reply) => {
            const { orgId } = request.params as { orgId: string };
            const userId = request.user.id!;

            const file = await request.file();
            if (!file) {
                throw Object.assign(new Error("No file uploaded."), { statusCode: 400 });
            }

            const chunks: Buffer[] = [];
            for await (const chunk of file.file) chunks.push(chunk as Buffer);
            const buffer = Buffer.concat(chunks);

            const url = await service.uploadFavicon(buffer, file.mimetype, orgId);

            await service.updateSettings(orgId, { faviconUrl: url }, userId);

            return reply.send({ url });
        },
    );

    // POST /organizations/:orgId/white-label/domain
    fastify.post(
        "/:orgId/white-label/domain",
        {
            onRequest: [fastify.verifyJWT, requireRole("SUPER_ADMIN")],
            schema: {
                params: OrgIdParams,
                body: AddDomainBodySchema,
                response: { 201: WhiteLabelDomainResponseSchema },
            },
        },
        async (request, reply) => {
            const { orgId } = request.params as { orgId: string };
            const { domain } = request.body as { domain: string };
            const record = await service.addDomain(domain, orgId);
            return reply.code(201).send(record);
        },
    );

    // POST /organizations/:orgId/white-label/domain/verify
    fastify.post(
        "/:orgId/white-label/domain/verify",
        {
            onRequest: [fastify.verifyJWT, requireRole("SUPER_ADMIN")],
            schema: {
                params: OrgIdParams,
                response: { 200: z.object({ verified: z.boolean() }) },
            },
        },
        async (request, reply) => {
            const { orgId } = request.params as { orgId: string };
            const verified = await service.verifyDomain(orgId);
            return reply.send({ verified });
        },
    );

    // DELETE /organizations/:orgId/white-label/domain
    fastify.delete(
        "/:orgId/white-label/domain",
        {
            onRequest: [fastify.verifyJWT, requireRole("SUPER_ADMIN")],
            schema: {
                params: OrgIdParams,
                response: { 200: z.object({ message: z.string() }) },
            },
        },
        async (request, reply) => {
            const { orgId } = request.params as { orgId: string };
            await service.removeDomain(orgId);
            return reply.send({ message: "Domain removed." });
        },
    );
}
