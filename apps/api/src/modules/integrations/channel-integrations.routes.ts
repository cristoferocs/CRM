import type { FastifyPluginAsync } from "fastify";
import { TelegramIntegration, SlackNotifier, ZapierService, MakeService } from "./integrations.service.js";

const zapierSvc = new ZapierService();
const makeSvc = new MakeService();

export const channelIntegrationsRoutes: FastifyPluginAsync = async (fastify) => {

    // -------------------------------------------------------------------------
    // Telegram
    // -------------------------------------------------------------------------

    fastify.post("/telegram/webhook", async (req, reply) => {
        const token = (req.query as Record<string, string>).token;
        if (!token) return reply.status(401).send({ error: "Missing token" });
        const tg = new TelegramIntegration(token);
        const update = tg.parseUpdate(req.body as Record<string, unknown>);
        if (!update) return { ok: true };
        fastify.log.info({ update }, "Telegram update received");
        return { ok: true };
    });

    fastify.post("/telegram/send", { onRequest: [fastify.verifyJWT] }, async (req) => {
        const body = req.body as { token: string; chatId: string; text: string; parseMode?: "HTML" | "Markdown" };
        const tg = new TelegramIntegration(body.token);
        return tg.sendMessage(body.chatId, body.text, body.parseMode);
    });

    fastify.post("/telegram/set-webhook", { onRequest: [fastify.verifyJWT] }, async (req) => {
        const body = req.body as { token: string; webhookUrl: string };
        const tg = new TelegramIntegration(body.token);
        return tg.setWebhook(body.webhookUrl);
    });

    // -------------------------------------------------------------------------
    // Slack
    // -------------------------------------------------------------------------

    fastify.post("/slack/send", { onRequest: [fastify.verifyJWT] }, async (req) => {
        const body = req.body as { webhookUrl: string; text: string; blocks?: unknown[] };
        const slack = new SlackNotifier(body.webhookUrl);
        return slack.send({ text: body.text, blocks: body.blocks });
    });

    // -------------------------------------------------------------------------
    // Zapier
    // -------------------------------------------------------------------------

    fastify.post("/zapier/subscribe", { onRequest: [fastify.verifyJWT] }, async (req, reply) => {
        const { orgId } = req.user as { orgId: string };
        const body = req.body as { hookUrl: string; event: string };
        const sub = await zapierSvc.subscribe(orgId, body);
        return reply.status(201).send(sub);
    });

    fastify.delete("/zapier/unsubscribe", { onRequest: [fastify.verifyJWT] }, async (req) => {
        const { orgId } = req.user as { orgId: string };
        const body = req.body as { hookUrl: string };
        await zapierSvc.unsubscribe(body.hookUrl, orgId);
        return { success: true };
    });

    fastify.post("/zapier/trigger", { onRequest: [fastify.verifyJWT] }, async (req) => {
        const { orgId } = req.user as { orgId: string };
        const body = req.body as { event: string; payload: Record<string, unknown> };
        return zapierSvc.trigger(orgId, body.event, body.payload);
    });

    // -------------------------------------------------------------------------
    // Make.com
    // -------------------------------------------------------------------------

    fastify.post("/make/trigger", { onRequest: [fastify.verifyJWT] }, async (req) => {
        const body = req.body as { webhookUrl: string; payload: Record<string, unknown> };
        return makeSvc.triggerScenario(body.webhookUrl, body.payload);
    });
};
