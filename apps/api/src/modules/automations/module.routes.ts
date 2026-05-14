import { z } from "zod";
import type { FastifyPluginAsync } from "fastify";
import type { AutomationTriggerEnum } from "@prisma/client";
import { AutomationsService } from "./automations.service.js";
import { SimulatorService } from "./simulator.service.js";
import { createAutomationSchema, updateAutomationSchema, formatZodError } from "./module.schema.js";

const TRIGGER_VALUES = [
    "CONTACT_CREATED", "CONTACT_UPDATED", "CONTACT_TAG_ADDED", "LEAD_SCORE_CHANGED",
    "DEAL_CREATED", "DEAL_STAGE_CHANGED", "DEAL_WON", "DEAL_LOST", "DEAL_ROTTING",
    "MESSAGE_RECEIVED", "MESSAGE_KEYWORD", "CONVERSATION_OPENED", "CONVERSATION_RESOLVED",
    "TIME_DELAY", "SCHEDULED", "DATE_FIELD",
    "PAYMENT_RECEIVED", "PAYMENT_OVERDUE", "PAYMENT_FAILED",
    "AGENT_HANDOFF", "AGENT_GOAL_ACHIEVED",
] as const;

const SimulateBody = z.object({
    triggerType: z.enum(TRIGGER_VALUES),
    triggerConfig: z.record(z.string(), z.unknown()).optional(),
    conditions: z.array(z.object({
        field: z.string(),
        operator: z.string(),
        value: z.unknown().optional(),
        logic: z.string().optional(),
    })).optional(),
    days: z.number().int().min(1).max(90).optional(),
});

export const automationsRoutes: FastifyPluginAsync = async (fastify) => {
    const svc = new AutomationsService();
    const simulator = new SimulatorService();
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

    // POST /automations/simulate
    // Pure-read simulation against historical events. Accepts an
    // unsaved automation config so users can iterate in the editor
    // without persisting.
    fastify.post("/simulate", { ...auth, schema: { body: SimulateBody } }, async (req) => {
        const orgId = req.user.orgId!;
        const body = req.body as z.infer<typeof SimulateBody>;
        return simulator.simulate(orgId, {
            triggerType: body.triggerType as AutomationTriggerEnum,
            triggerConfig: body.triggerConfig,
            conditions: body.conditions,
            days: body.days,
        });
    });

    // POST /automations/:id/simulate — convenience: pull the saved
    // config and run the simulator against it.
    fastify.post("/:id/simulate", auth, async (req, reply) => {
        const orgId = req.user.orgId!;
        const { id } = req.params as { id: string };
        const automation = await svc.findById(id, orgId);
        if (!automation) return reply.status(404).send({ message: "Not found" });
        const days = (req.body as { days?: number })?.days;
        return simulator.simulate(orgId, {
            triggerType: automation.triggerType as AutomationTriggerEnum,
            triggerConfig: automation.triggerConfig as Record<string, unknown> | undefined,
            conditions: (automation.conditions as Array<{ field: string; operator: string; value?: unknown; logic?: string }>) ?? [],
            days,
        });
    });
};
