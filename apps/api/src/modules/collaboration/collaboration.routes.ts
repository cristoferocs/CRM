import type { FastifyPluginAsync } from "fastify";
import { CollaborationService } from "./collaboration.service.js";

export const collaborationRoutes: FastifyPluginAsync = async (fastify) => {
    const svc = new CollaborationService();

    // GET /collaboration/comments/:entityType/:entityId
    fastify.get("/comments/:entityType/:entityId", { onRequest: [fastify.verifyJWT] }, async (req) => {
        const { orgId } = req.user as { orgId: string };
        const { entityType, entityId } = req.params as { entityType: string; entityId: string };
        return svc.listComments(entityType, entityId, orgId);
    });

    // POST /collaboration/comments
    fastify.post("/comments", { onRequest: [fastify.verifyJWT] }, async (req, reply) => {
        const { orgId, id: authorId } = req.user as { orgId: string; id: string };
        const body = req.body as { entityType: "deal" | "contact" | "conversation"; entityId: string; content: string; mentions?: string[] };
        const comment = await svc.createComment({ ...body, authorId, orgId });
        return reply.status(201).send(comment);
    });

    // PATCH /collaboration/comments/:id
    fastify.patch("/comments/:id", { onRequest: [fastify.verifyJWT] }, async (req) => {
        const { orgId, id: authorId } = req.user as { orgId: string; id: string };
        const { id } = req.params as { id: string };
        const { content } = req.body as { content: string };
        return svc.updateComment(id, content, authorId, orgId);
    });

    // DELETE /collaboration/comments/:id
    fastify.delete("/comments/:id", { onRequest: [fastify.verifyJWT] }, async (req, reply) => {
        const { orgId, id: authorId } = req.user as { orgId: string; id: string };
        const { id } = req.params as { id: string };
        await svc.deleteComment(id, authorId, orgId);
        return reply.status(204).send();
    });

    // GET /collaboration/notifications
    fastify.get("/notifications", { onRequest: [fastify.verifyJWT] }, async (req) => {
        const { orgId, id: userId } = req.user as { orgId: string; id: string };
        const { unread } = req.query as { unread?: string };
        return svc.listNotifications(userId, orgId, unread === "true");
    });

    // GET /collaboration/notifications/count
    fastify.get("/notifications/count", { onRequest: [fastify.verifyJWT] }, async (req) => {
        const { orgId, id: userId } = req.user as { orgId: string; id: string };
        return svc.getUnreadCount(userId, orgId);
    });

    // PATCH /collaboration/notifications/:id/read
    fastify.patch("/notifications/:id/read", { onRequest: [fastify.verifyJWT] }, async (req) => {
        const { id: userId } = req.user as { id: string };
        const { id } = req.params as { id: string };
        return svc.markRead(id, userId);
    });

    // POST /collaboration/notifications/read-all
    fastify.post("/notifications/read-all", { onRequest: [fastify.verifyJWT] }, async (req) => {
        const { orgId, id: userId } = req.user as { orgId: string; id: string };
        await svc.markAllRead(userId, orgId);
        return { success: true };
    });
};
