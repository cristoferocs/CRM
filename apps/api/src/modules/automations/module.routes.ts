import type { FastifyPluginAsync } from "fastify";
import { AutomationsService } from "./automations.service.js";
import { createAutomationSchema, updateAutomationSchema, formatZodError } from "./module.schema.js";

export const automationsRoutes: FastifyPluginAsync = async (fastify) => {
    const svc = new AutomationsService();
    const auth = { onRequest: [fastify.verifyJWT] };

    // GET /automations
    fastify.get("/", auth, async (req) => {
        const orgId = req.user.orgId!;
        const { isActive, triggerType } = req.query as Record<string, string>;
        return svc.list(orgId, {
            isActive: isActive !== undefined ? isActive === "true" : undefined,
            triggerType: triggerType || undefined,
        });
    });

    // GET /automations/templates
    fastify.get("/templates", async () => svc.getTemplates());

    // POST /automations
    fastify.post("/", auth, async (req, reply) => {
        const orgId = req.user.orgId!;
        const parsed = createAutomationSchema.safeParse(req.body);
        if (!parsed.success) return reply.status(400).send(formatZodError(parsed.error));
        const automation = await svc.create(parsed.data, orgId);
        return reply.status(201).send(automation);
    });

    // GET /automations/:id
    fastify.get("/:id", auth, async (req, reply) => {
        const orgId = req.user.orgId!;
        const { id } = req.params as { id: string };
        const automation = await svc.findById(id, orgId);
        if (!automation) return reply.status(404).send({ message: "Not found" });
        return automation;
    });

    // PATCH /automations/:id
    fastify.patch("/:id", auth, async (req, reply) => {
        const orgId = req.user.orgId!;
        const { id } = req.params as { id: string };
        const parsed = updateAutomationSchema.safeParse(req.body);
        if (!parsed.success) return reply.status(400).send(formatZodError(parsed.error));
        return svc.update(id, parsed.data, orgId);
    });

    // DELETE /automations/:id
    fastify.delete("/:id", auth, async (req, reply) => {
        const orgId = req.user.orgId!;
        const { id } = req.params as { id: string };
        await svc.delete(id, orgId);
        return reply.status(204).send();
    });

    // PATCH /automations/:id/toggle
    fastify.patch("/:id/toggle", auth, async (req) => {
        const orgId = req.user.orgId!;
        const { id } = req.params as { id: string };
        return svc.toggle(id, orgId);
    });

    // POST /automations/:id/duplicate
    fastify.post("/:id/duplicate", auth, async (req) => {
        const orgId = req.user.orgId!;
        const { id } = req.params as { id: string };
        return svc.duplicate(id, orgId);
    });

    // GET /automations/:id/logs
    fastify.get("/:id/logs", auth, async (req) => {
        const orgId = req.user.orgId!;
        const { id } = req.params as { id: string };
        const { page, limit } = req.query as Record<string, string>;
        return svc.getLogs(id, orgId, Number(page ?? 1), Number(limit ?? 20));
    });

    // GET /automations/:id/stats
    fastify.get("/:id/stats", auth, async (req) => {
        const orgId = req.user.orgId!;
        const { id } = req.params as { id: string };
        return svc.getStats(id, orgId);
    });

    // POST /automations/:id/test
    fastify.post("/:id/test", auth, async (req) => {
        const orgId = req.user.orgId!;
        const { id } = req.params as { id: string };
        const payload = (req.body as { payload?: Record<string, unknown> })?.payload ?? {};
        return svc.testRun(id, payload, orgId);
    });
};
