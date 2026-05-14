import type { FastifyPluginAsync } from "fastify";
import { DocumentsService } from "./documents.service.js";

export const documentsRoutes: FastifyPluginAsync = async (fastify) => {
    const svc = new DocumentsService();

    // GET /documents
    fastify.get("/", { onRequest: [fastify.verifyJWT] }, async (req) => {
        const { orgId } = req.user as { orgId: string };
        const filters = req.query as Record<string, string>;
        return svc.list(orgId, filters);
    });

    // POST /documents
    fastify.post("/", { onRequest: [fastify.verifyJWT] }, async (req, reply) => {
        const { orgId, id: createdById } = req.user as { orgId: string; id: string };
        const body = req.body as Parameters<typeof svc.create>[0];
        const doc = await svc.create({ ...body, orgId, createdById });
        return reply.status(201).send(doc);
    });

    // GET /documents/templates
    fastify.get("/templates", { onRequest: [fastify.verifyJWT] }, async (req) => {
        const { orgId } = req.user as { orgId: string };
        return svc.listTemplates(orgId);
    });

    // POST /documents/templates
    fastify.post("/templates", { onRequest: [fastify.verifyJWT] }, async (req, reply) => {
        const { orgId, id: createdById } = req.user as { orgId: string; id: string };
        const body = req.body as Parameters<typeof svc.createTemplate>[0];
        const template = await svc.createTemplate({ ...body, orgId, createdById });
        return reply.status(201).send(template);
    });

    // POST /documents/templates/:id/render
    fastify.post("/templates/:id/render", { onRequest: [fastify.verifyJWT] }, async (req) => {
        const { orgId } = req.user as { orgId: string };
        const { id } = req.params as { id: string };
        const { vars } = req.body as { vars: Record<string, string> };
        return svc.renderTemplate(id, orgId, vars);
    });

    // GET /documents/sign/:docId?token=xxx (public)
    fastify.get("/sign/:docId", async (req) => {
        const { docId } = req.params as { docId: string };
        const { token } = req.query as { token: string };
        return svc.getSigningInfo(docId, token);
    });

    // POST /documents/sign/:docId?token=xxx
    fastify.post("/sign/:docId", async (req) => {
        const { docId } = req.params as { docId: string };
        const { token } = req.query as { token: string };
        const { signerName } = req.body as { signerName: string };
        return svc.sign(docId, token, signerName);
    });

    // GET /documents/:id
    fastify.get("/:id", { onRequest: [fastify.verifyJWT] }, async (req, reply) => {
        const { orgId } = req.user as { orgId: string };
        const { id } = req.params as { id: string };
        const doc = await svc.findById(id, orgId);
        if (!doc) return reply.status(404).send({ message: "Not found" });
        return doc;
    });

    // PATCH /documents/:id
    fastify.patch("/:id", { onRequest: [fastify.verifyJWT] }, async (req) => {
        const { orgId, id: userId } = req.user as { orgId: string; id: string };
        const { id } = req.params as { id: string };
        const body = req.body as Parameters<typeof svc.update>[1];
        return svc.update(id, body, userId, orgId);
    });

    // DELETE /documents/:id
    fastify.delete("/:id", { onRequest: [fastify.verifyJWT] }, async (req, reply) => {
        const { orgId } = req.user as { orgId: string };
        const { id } = req.params as { id: string };
        await svc.delete(id, orgId);
        return reply.status(204).send();
    });

    // POST /documents/:id/send-for-signature
    fastify.post("/:id/send-for-signature", { onRequest: [fastify.verifyJWT] }, async (req) => {
        const { orgId } = req.user as { orgId: string };
        const { id } = req.params as { id: string };
        const { signers } = req.body as { signers: Array<{ email: string; name: string }> };
        return svc.sendForSignature(id, signers, orgId);
    });
};
