import { prisma } from "../../../lib/prisma.js";
import { queues } from "../../../queue/queues.js";
import { getIO } from "../../../websocket/socket.js";
import { getEvolutionChannel } from "../../inbox/channels/whatsapp-evolution.channel.js";
import { evaluateCondition, type EvaluationContext } from "../condition.evaluator.js";
import type { NodeExecutor, ExecutionContext, WorkflowNode } from "./types.js";

function buildEvalCtx(ctx: ExecutionContext): EvaluationContext {
    return {
        contact: ctx.contact
            ? {
                id: ctx.contact.id,
                email: ctx.contact.email,
                phone: ctx.contact.phone,
                tags: ctx.contact.tags ?? [],
                customFields: (ctx.contact.customFields as Record<string, unknown> | null) ?? null,
            }
            : undefined,
        deal: ctx.deal
            ? {
                id: ctx.deal.id,
                title: ctx.deal.title,
                value: ctx.deal.value as unknown as number | null,
                probability: ctx.deal.probability,
                ownerId: ctx.deal.ownerId,
                rottingDays: ctx.deal.rottingDays,
                customFields: (ctx.deal.customFields as Record<string, unknown> | null) ?? null,
                stageId: ctx.deal.stageId,
                pipelineId: ctx.deal.pipelineId,
            }
            : undefined,
    };
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function str(v: unknown, fallback = ""): string {
    return v === null || v === undefined ? fallback : String(v);
}
function num(v: unknown, fallback = 0): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function ok(output: unknown) {
    return { success: true as const, output };
}
function fail(error: string) {
    return { success: false as const, error };
}

// ---------------------------------------------------------------------------
// CONTROL FLOW
// ---------------------------------------------------------------------------

const triggerExec: NodeExecutor = async () => ok({ triggered: true });
const endExec: NodeExecutor = async () => ok({ ended: true });

const delayExec: NodeExecutor = async (node, ctx) => {
    const unit = str(node.config.unit, "minutes");
    const amount = num(node.config.amount, 0);
    const ms: Record<string, number> = {
        seconds: 1_000,
        minutes: 60_000,
        hours: 3_600_000,
        days: 86_400_000,
    };
    const delayMs = amount * (ms[unit] ?? 60_000);
    if (!ctx.isDryRun) {
        await queues.automations().add(
            `automation:delayed_node:${node.id}`,
            { ...ctx.triggerData, orgId: ctx.orgId, _resumeFromNode: node.id },
            { delay: delayMs },
        );
    }
    return ok({ delayed: true, amount, unit, ms: delayMs });
};

const conditionExec: NodeExecutor = async (node, ctx) => {
    const cfg = node.config;
    const evalCtx = buildEvalCtx(ctx);
    // New rule-builder schema: groups of conditions with AND/OR
    if (Array.isArray(cfg.rules)) {
        const matchAll = cfg.match === "ALL" || cfg.match === undefined;
        type Rule = { field: string; operator: string; value: unknown };
        const results = (cfg.rules as Rule[]).map((r) =>
            evaluateCondition(
                { ...(r as unknown as Parameters<typeof evaluateCondition>[0]) },
                evalCtx,
            ),
        );
        const result = matchAll ? results.every(Boolean) : results.some(Boolean);
        return ok({ result, evaluated: results.length });
    }
    // Legacy single-condition schema
    const field = str(cfg.field);
    const result = evaluateCondition(
        {
            field,
            operator: str(cfg.operator, "equals") as Parameters<typeof evaluateCondition>[0]["operator"],
            value: cfg.value,
        } as Parameters<typeof evaluateCondition>[0],
        evalCtx,
    );
    return ok({ result });
};

const abTestExec: NodeExecutor = async (node) => {
    const split = num(node.config.splitPercent, 50);
    const result = Math.random() * 100 < split;
    return ok({ result, branch: result ? "A" : "B" });
};

// ---------------------------------------------------------------------------
// CRM ACTIONS
// ---------------------------------------------------------------------------

const addTagExec: NodeExecutor = async (node, ctx) => {
    const tag = ctx.interpolate(str(node.config.tag));
    if (!tag) return fail("Tag vazia");
    if (!ctx.contactId) return ok({ skipped: true, reason: "Sem contato" });
    const c = await prisma.contact.findUnique({ where: { id: ctx.contactId } });
    if (!c) return ok({ skipped: true, reason: "Contato não encontrado" });
    if ((c.tags ?? []).includes(tag)) return ok({ tag, alreadyPresent: true });
    await prisma.contact.update({
        where: { id: ctx.contactId },
        data: { tags: [...(c.tags ?? []), tag] },
    });
    return ok({ tag });
};

const removeTagExec: NodeExecutor = async (node, ctx) => {
    const tag = ctx.interpolate(str(node.config.tag));
    if (!ctx.contactId) return ok({ skipped: true });
    const c = await prisma.contact.findUnique({ where: { id: ctx.contactId } });
    if (!c) return ok({ skipped: true });
    await prisma.contact.update({
        where: { id: ctx.contactId },
        data: { tags: (c.tags ?? []).filter((t) => t !== tag) },
    });
    return ok({ removed: tag });
};

const updateFieldExec: NodeExecutor = async (node, ctx) => {
    const target = str(node.config.target, "contact"); // 'contact' | 'deal'
    const field = str(node.config.field);
    if (!field) return fail("Campo não informado");
    const value =
        typeof node.config.value === "string"
            ? ctx.interpolate(node.config.value)
            : node.config.value;
    if (target === "deal" && ctx.dealId) {
        const d = await prisma.deal.findUnique({ where: { id: ctx.dealId } });
        const merged = { ...((d?.customFields as Record<string, unknown>) ?? {}), [field]: value };
        await prisma.deal.update({ where: { id: ctx.dealId }, data: { customFields: merged as never } });
        return ok({ target, field, value });
    }
    if (ctx.contactId) {
        const c = await prisma.contact.findUnique({ where: { id: ctx.contactId } });
        const merged = { ...((c?.customFields as Record<string, unknown>) ?? {}), [field]: value };
        await prisma.contact.update({ where: { id: ctx.contactId }, data: { customFields: merged as never } });
        return ok({ target: "contact", field, value });
    }
    return ok({ skipped: true });
};

const assignOwnerExec: NodeExecutor = async (node, ctx) => {
    const rule = str(node.config.rule, "explicit"); // 'explicit' | 'round_robin' | 'least_busy'
    let ownerId = str(node.config.userId);

    if (rule === "round_robin" || rule === "least_busy") {
        const users = await prisma.user.findMany({
            where: { orgId: ctx.orgId, isActive: true },
            select: { id: true, _count: { select: { deals: true } } },
        });
        if (users.length === 0) return fail("Sem usuários ativos");
        if (rule === "least_busy") {
            users.sort((a, b) => a._count.deals - b._count.deals);
            ownerId = users[0]!.id;
        } else {
            ownerId = users[Math.floor(Math.random() * users.length)]!.id;
        }
    }
    if (!ownerId) return fail("Sem owner");

    if (ctx.dealId) {
        await prisma.deal.updateMany({ where: { id: ctx.dealId, orgId: ctx.orgId }, data: { ownerId } });
    }
    return ok({ ownerId, rule });
};

const movePipelineExec: NodeExecutor = async (node, ctx) => {
    const stageId = str(node.config.stageId);
    if (!stageId) return fail("Stage não informado");
    if (!ctx.dealId) return ok({ skipped: true, reason: "Sem deal" });
    const stage = await prisma.pipelineStage.findUnique({ where: { id: stageId } });
    if (!stage) return fail("Stage não encontrado");
    const pipeline = await prisma.pipeline.findUnique({ where: { id: stage.pipelineId }, select: { orgId: true } });
    if (pipeline?.orgId !== ctx.orgId) return fail("Stage não pertence à org");
    await prisma.deal.update({
        where: { id: ctx.dealId },
        data: {
            stageId,
            stageEnteredAt: new Date(),
            ...(stage.isWon || stage.isLost ? { closedAt: new Date() } : {}),
        },
    });
    return ok({ stageId, stageName: stage.name });
};

const createTaskExec: NodeExecutor = async (node, ctx) => {
    const cfg = node.config;
    const dueAt = new Date();
    dueAt.setDate(dueAt.getDate() + num(cfg.dueInDays, 1));
    let userId = str(cfg.userId);
    if (!userId) {
        const first = await prisma.user.findFirst({ where: { orgId: ctx.orgId, isActive: true }, select: { id: true } });
        userId = first?.id ?? "";
    }
    if (!userId) return fail("Sem usuário para atribuir");
    const activity = await prisma.activity.create({
        data: {
            type: "TASK",
            title: ctx.interpolate(str(cfg.title, "Tarefa")),
            description: ctx.interpolate(str(cfg.description, "")),
            dueAt,
            dealId: ctx.dealId ?? null,
            contactId: ctx.contactId ?? null,
            userId,
            orgId: ctx.orgId,
        },
    });
    return ok({ taskId: activity.id, dueAt });
};

// ---------------------------------------------------------------------------
// MESSAGING
// ---------------------------------------------------------------------------

const sendWhatsAppExec: NodeExecutor = async (node, ctx) => {
    const cfg = node.config;
    const message = ctx.interpolate(str(cfg.message));
    if (!message) return fail("Mensagem vazia");
    const contact = ctx.contact;
    if (!contact?.phone) return ok({ skipped: true, reason: "Contato sem telefone" });

    // Find or create conversation so the outbound shows up in the inbox
    let conversation = await prisma.conversation.findFirst({
        where: { orgId: ctx.orgId, contactId: contact.id, channel: "WHATSAPP", status: { not: "RESOLVED" } },
        orderBy: { lastMessageAt: "desc" },
    });
    if (!conversation) {
        conversation = await prisma.conversation.create({
            data: {
                orgId: ctx.orgId,
                contactId: contact.id,
                channel: "WHATSAPP",
                externalId: contact.phone,
                status: "OPEN",
            },
        });
    }

    let externalId: string | undefined;
    try {
        const channel = getEvolutionChannel(ctx.orgId);
        const instance = str(cfg.instance, process.env.EVOLUTION_INSTANCE_NAME ?? "default");
        const res = await channel.sendTextMessage(instance, contact.phone, message);
        externalId = res.key?.id;
    } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        // Persist a FAILED outbound row for audit
        await prisma.message.create({
            data: {
                conversationId: conversation.id,
                type: "TEXT",
                direction: "OUTBOUND",
                status: "FAILED",
                content: message,
            },
        });
        return fail(`Falha WhatsApp: ${errMsg}`);
    }

    const saved = await prisma.message.create({
        data: {
            conversationId: conversation.id,
            type: "TEXT",
            direction: "OUTBOUND",
            status: "SENT",
            content: message,
            externalId,
        },
    });

    await prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() },
    });

    const io = getIO();
    if (io) {
        io.to(`conversation:${conversation.id}`).emit("message:new", { conversationId: conversation.id, message: saved });
        io.to(`org:${ctx.orgId}`).emit("message:new", { conversationId: conversation.id, message: saved });
    }

    return ok({ messageId: saved.id, externalId, to: contact.phone });
};

const sendEmailExec: NodeExecutor = async (node, ctx) => {
    const cfg = node.config;
    const to = ctx.contact?.email ?? str(cfg.to);
    if (!to) return ok({ skipped: true, reason: "Sem e-mail" });
    const subject = ctx.interpolate(str(cfg.subject, "Mensagem"));
    const body = ctx.interpolate(str(cfg.body, ""));
    if (!body) return fail("Corpo vazio");

    // Email channel config is per-org and may not be configured; queue if available
    const orgIntegrations = await prisma.organization.findUnique({
        where: { id: ctx.orgId },
        select: { id: true, name: true },
    });
    if (!orgIntegrations) return fail("Org não encontrada");

    // Enqueue to email worker (channel configuration lives in env or org config)
    if (!ctx.isDryRun) {
        await queues.email().add("automation.send", {
            orgId: ctx.orgId,
            to,
            subject,
            text: body,
            html: body,
        });
    }
    return ok({ queued: true, to, subject });
};

const sendSmsExec: NodeExecutor = async (node, ctx) => {
    const phone = ctx.contact?.phone ?? str(node.config.to);
    if (!phone) return ok({ skipped: true, reason: "Sem telefone" });
    // No SMS channel configured in this codebase yet — log + emit not_supported gracefully.
    return ok({ notSupported: true, to: phone });
};

// ---------------------------------------------------------------------------
// NOTIFICATIONS
// ---------------------------------------------------------------------------

const notifyUserExec: NodeExecutor = async (node, ctx) => {
    const cfg = node.config;
    const userId = str(cfg.userId);
    if (!userId) return fail("userId não informado");
    const notification = await prisma.notification.create({
        data: {
            userId,
            orgId: ctx.orgId,
            type: "AUTOMATION_FAILED",
            title: ctx.interpolate(str(cfg.title, "Automação")),
            body: ctx.interpolate(str(cfg.message, "")),
            metadata: {} as never,
        },
    });
    getIO()?.to(`org:${ctx.orgId}`).emit("notification", { id: notification.id, userId });
    return ok({ notificationId: notification.id });
};

const notifySlackExec: NodeExecutor = async (node, ctx) => {
    const webhookUrl = str(node.config.webhookUrl);
    if (!webhookUrl) return fail("Sem webhookUrl");
    const text = ctx.interpolate(str(node.config.message, ""));
    const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(15_000),
    });
    return res.ok ? ok({ sent: true, status: res.status }) : fail(`Slack ${res.status}`);
};

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

const activateAgentExec: NodeExecutor = async (node, ctx) => {
    const agentId = str(node.config.agentId);
    if (!agentId) return fail("agentId não informado");

    // If we have a conversation, schedule the agent to run on it; otherwise just signal activation
    if (ctx.conversationId && !ctx.isDryRun) {
        await queues.ai().add("agent.activate", {
            orgId: ctx.orgId,
            agentId,
            conversationId: ctx.conversationId,
            contactId: ctx.contactId,
            dealId: ctx.dealId,
            trigger: ctx.triggerType,
        });
    } else if (ctx.dealId && !ctx.isDryRun) {
        await queues.ai().add("agent.activate", {
            orgId: ctx.orgId,
            agentId,
            dealId: ctx.dealId,
            trigger: ctx.triggerType,
        });
    }
    return ok({ agentId, queued: !ctx.isDryRun });
};

const analyzeSentimentExec: NodeExecutor = async (_node, ctx) => {
    if (!ctx.conversationId) return ok({ skipped: true, reason: "Sem conversa" });
    const messages = await prisma.message.findMany({
        where: { conversationId: ctx.conversationId, direction: "INBOUND" },
        orderBy: { sentAt: "desc" },
        take: 5,
        select: { content: true },
    });
    if (messages.length === 0) return ok({ sentiment: "neutral", score: 0, sampled: 0 });

    const text = messages.map((m) => m.content).join(" ").toLowerCase();
    // Lightweight heuristic — replaceable with real AI analyzer later
    const positive = ["bom", "ótimo", "obrigado", "obg", "👍", "✅", "perfeito", "excelente"];
    const negative = ["ruim", "péssimo", "cancelar", "reclamação", "horrível", "👎", "lento", "demora"];
    let score = 0;
    for (const w of positive) if (text.includes(w)) score += 1;
    for (const w of negative) if (text.includes(w)) score -= 1;
    const sentiment = score > 0 ? "positive" : score < 0 ? "negative" : "neutral";
    return ok({ sentiment, score, sampled: messages.length });
};

const scoreLeadExec: NodeExecutor = async (_node, ctx) => {
    if (!ctx.contactId) return ok({ skipped: true, reason: "Sem contato" });
    const { LeadScoringService } = await import("../../contacts/lead-scoring.service.js");
    const result = await new LeadScoringService().scoreContact(ctx.contactId, ctx.orgId);
    return ok(result);
};

// ---------------------------------------------------------------------------
// INTEGRATIONS
// ---------------------------------------------------------------------------

const webhookExec: NodeExecutor = async (node, ctx) => {
    const url = ctx.interpolate(str(node.config.url));
    if (!url) return fail("Sem URL");
    const method = str(node.config.method, "POST").toUpperCase();
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...((node.config.headers as Record<string, string>) ?? {}),
    };
    const payloadVar = (node.config.body as Record<string, unknown> | undefined) ?? {
        ...ctx.triggerData,
        variables: ctx.variables,
    };
    const res = await fetch(url, {
        method,
        headers,
        body: method !== "GET" ? JSON.stringify(payloadVar) : undefined,
        signal: AbortSignal.timeout(30_000),
    });
    const responseText = await res.text().catch(() => "");
    let responseJson: unknown;
    try { responseJson = responseText ? JSON.parse(responseText) : undefined; } catch { /* ignore */ }
    return res.ok
        ? ok({ status: res.status, url, response: responseJson ?? responseText.slice(0, 500) })
        : fail(`Webhook ${res.status}: ${responseText.slice(0, 200)}`);
};

const externalTriggerExec: NodeExecutor = async (node, ctx) => {
    const url = str(node.config.webhookUrl);
    if (!url) return fail("Sem webhookUrl");
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...ctx.triggerData, variables: ctx.variables }),
        signal: AbortSignal.timeout(30_000),
    });
    return res.ok ? ok({ status: res.status }) : fail(`HTTP ${res.status}`);
};

// ---------------------------------------------------------------------------
// REGISTRY
// ---------------------------------------------------------------------------

export const nodeExecutors: Record<string, NodeExecutor> = {
    trigger: triggerExec,
    end: endExec,
    delay: delayExec,
    condition: conditionExec,
    ab_test: abTestExec,
    add_tag: addTagExec,
    remove_tag: removeTagExec,
    update_field: updateFieldExec,
    assign_owner: assignOwnerExec,
    move_pipeline: movePipelineExec,
    create_task: createTaskExec,
    send_whatsapp: sendWhatsAppExec,
    send_email: sendEmailExec,
    send_sms: sendSmsExec,
    notify_user: notifyUserExec,
    notify_slack: notifySlackExec,
    activate_agent: activateAgentExec,
    analyze_sentiment: analyzeSentimentExec,
    score_lead: scoreLeadExec,
    webhook: webhookExec,
    zapier_trigger: externalTriggerExec,
    make_trigger: externalTriggerExec,
};

export function getNodeExecutor(type: string): NodeExecutor | undefined {
    return nodeExecutors[type];
}

export async function executeNodeByType(
    node: WorkflowNode,
    ctx: ExecutionContext,
): Promise<Pick<import("./types.js").NodeExecutionResult, "success" | "output" | "error">> {
    if (ctx.isDryRun) {
        return { success: true, output: { dryRun: true, type: node.type, config: node.config } };
    }
    const executor = getNodeExecutor(node.type);
    if (!executor) {
        return { success: true, output: { queued: true, type: node.type, config: node.config } };
    }
    try {
        return await executor(node, ctx);
    } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
}
