import { z } from "zod";
import { randomBytes } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { GoogleWorkspaceClient } from "../../lib/google-workspace.js";
import { getRedis } from "../../lib/redis.js";

const OAUTH_STATE_TTL = 600; // 10 minutes in seconds

const SlotParams = z.object({
    date: z.string().min(1),
    duration: z.coerce.number().int().min(15).max(480).default(60),
});

const EventsParams = z.object({
    contactEmail: z.string().email().optional(),
});

const IndexFolderBody = z.object({
    folderId: z.string().min(1),
    knowledgeBaseId: z.string().min(1),
});

const DriveSearchParams = z.object({
    q: z.string().min(1),
});

export const integrationsRoutes: FastifyPluginAsync = async (fastify) => {
    // -------------------------------------------------------------------------
    // Google OAuth
    // -------------------------------------------------------------------------

    // GET /integrations/google/auth-url
    fastify.get(
        "/google/auth-url",
        { onRequest: [fastify.verifyJWT] },
        async (request) => {
            const orgId = request.user.orgId!;
            // Generate a cryptographically random nonce and store orgId → nonce in Redis
            // so the callback can safely look up the correct org without trusting the state param.
            const nonce = randomBytes(24).toString("hex");
            const redis = getRedis();
            await redis.set(`oauth:state:${nonce}`, orgId, "EX", OAUTH_STATE_TTL);

            const gws = new GoogleWorkspaceClient(orgId);
            const url = gws.getAuthUrl(nonce); // nonce is passed as state, NOT orgId
            return { url };
        },
    );

    // GET /integrations/google/callback?code=&state=
    fastify.get(
        "/google/callback",
        async (request, reply) => {
            const { code, state } = request.query as { code?: string; state?: string };
            if (!code) return reply.status(400).send({ message: "Missing code" });
            if (!state) return reply.status(400).send({ message: "Missing state" });

            // Validate state nonce — prevents CSRF / open-redirect abuse
            const redis = getRedis();
            const orgId = await redis.getdel(`oauth:state:${state}`);
            if (!orgId) {
                return reply.status(400).send({ message: "Invalid or expired OAuth state. Please try again." });
            }

            const gws = new GoogleWorkspaceClient(orgId);
            await gws.exchangeCode(code);

            const redirectBase = process.env.WEB_URL ?? "http://localhost:3000";
            return reply.redirect(`${redirectBase}/settings/integrations?google=connected`);
        },
    );

    // GET /integrations/google/status
    fastify.get(
        "/google/status",
        { onRequest: [fastify.verifyJWT] },
        async (request) => {
            const gws = new GoogleWorkspaceClient(request.user.orgId!);
            return gws.getStatus();
        },
    );

    // DELETE /integrations/google
    fastify.delete(
        "/google",
        { onRequest: [fastify.verifyJWT] },
        async (request, reply) => {
            const gws = new GoogleWorkspaceClient(request.user.orgId!);
            await gws.revoke();
            return reply.status(204).send();
        },
    );

    // -------------------------------------------------------------------------
    // Google Calendar
    // -------------------------------------------------------------------------

    // GET /integrations/calendar/slots?date=YYYY-MM-DD&duration=60
    fastify.get(
        "/calendar/slots",
        { onRequest: [fastify.verifyJWT] },
        async (request) => {
            const query = SlotParams.parse(request.query);
            const gws = new GoogleWorkspaceClient(request.user.orgId!);
            return gws.getAvailableSlots(new Date(query.date), Number(query.duration));
        },
    );

    // GET /integrations/calendar/events?contactEmail=
    fastify.get(
        "/calendar/events",
        { onRequest: [fastify.verifyJWT] },
        async (request) => {
            const { contactEmail } = EventsParams.parse(request.query);
            const gws = new GoogleWorkspaceClient(request.user.orgId!);
            return gws.listUpcomingEvents(contactEmail ?? "");
        },
    );

    // -------------------------------------------------------------------------
    // Google Drive
    // -------------------------------------------------------------------------

    // POST /integrations/drive/index-folder
    fastify.post(
        "/drive/index-folder",
        { onRequest: [fastify.verifyJWT] },
        async (request) => {
            const { folderId, knowledgeBaseId } = IndexFolderBody.parse(request.body);
            const orgId = request.user.orgId!;
            const gws = new GoogleWorkspaceClient(orgId);
            await gws.indexDriveFolder(folderId, knowledgeBaseId, orgId);
            return { ok: true };
        },
    );

    // GET /integrations/drive/search?q=
    fastify.get(
        "/drive/search",
        { onRequest: [fastify.verifyJWT] },
        async (request) => {
            const { q } = DriveSearchParams.parse(request.query);
            const gws = new GoogleWorkspaceClient(request.user.orgId!);
            return gws.searchFiles(q);
        },
    );
};
