import type {
    StageAutomationRule,
    StageAutomationAction,
    StageAutomationTrigger,
} from "@crm-base/shared";
import { prisma } from "../../lib/prisma.js";
import { queues } from "../../queue/queues.js";
import { getIO } from "../../websocket/socket.js";
import { evaluateConditionGroup, type EvaluationContext } from "./condition.evaluator.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StageAutomationJobData {
    dealId: string;
    orgId: string;
    stageId: string;
    stageName?: string;
    trigger: StageAutomationTrigger;
    /** Index into the rule's actions to resume from (used by `wait` actions). */
    resumeFrom?: number;
    ruleId?: string;
    /** Re-injected rule when resuming (avoids stale DB reads). */
    rule?: StageAutomationRule;
    /** Hop counter to prevent infinite move_stage loops. */
    hops?: number;
    /** Set true when the runner should treat this as a dry-run preview. */
    dryRun?: boolean;
}

export interface ActionExecutionResult {
    actionType: StageAutomationAction["type"];
    success: boolean;
    output?: unknown;
    error?: string;
    /** If true, the runner should pause execution (e.g. wait was re-enqueued). */
    pausedForResume?: boolean;
}

const MAX_HOPS = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDurationMs(duration: string): number {
    const match = duration.match(/^(\d+)(d|h|m|s)$/);
    if (!match) return 0;
    const value = parseInt(match[1]!, 10);
    switch (match[2]) {
        case "d": return value * 86_400_000;
        case "h": return value * 3_600_000;
        case "m": return value * 60_000;
        case "s": return value * 1_000;
        default: return 0;
    }
}

function interpolate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => vars[key] ?? "");
}

const ALLOWED_DEAL_FIELDS = new Set([
    "probability",
    "ownerId",
    "expectedCloseAt",
    "value",
    "title",
]);

// ---------------------------------------------------------------------------
// Context builder
// ---------------------------------------------------------------------------

async function buildContext(dealId: string, orgId: string) {
    const deal = await prisma.deal.findFirst({
        where: { id: dealId, orgId },
    });
    if (!deal) return null;

    let contact = null;
    if (deal.contactId) {
        contact = await prisma.contact.findFirst({ where: { id: deal.contactId, orgId } });
    }

    const evalCtx: EvaluationContext = {
        deal: {
            id: deal.id,
            title: deal.title,
            value: deal.value as unknown as number | null,
            probability: deal.probability,
            ownerId: deal.ownerId,
            rottingDays: deal.rottingDays,
            customFields: deal.customFields as Record<string, unknown> | null,
            tags: (deal as unknown as { tags?: string[] }).tags ?? [],
            stageId: deal.stageId,
            pipelineId: deal.pipelineId,
        },
        contact: contact
            ? {
                id: contact.id,
                email: contact.email,
                phone: contact.phone,
                tags: contact.tags ?? [],
                customFields: contact.customFields as Record<string, unknown> | null,
            }
            : undefined,
    };

    const vars: Record<string, string> = {
        "deal.title": deal.title ?? "",
        "deal.value": String(deal.value ?? ""),
        "deal.probability": String(deal.probability ?? ""),
        "contact.name": contact?.name ?? "",
        "contact.email": contact?.email ?? "",
        "contact.phone": contact?.phone ?? "",
    };

    return { deal, contact, evalCtx, vars };
}

// ---------------------------------------------------------------------------
// Action runner (single action)
// ---------------------------------------------------------------------------

export async function executeStageAction(
    action: StageAutomationAction,
    ctx: {
        dealId: string;
        contactId?: string | null;
        orgId: string;
        ownerId?: string | null;
        vars: Record<string, string>;
        hops: number;
        dryRun: boolean;
        rule: StageAutomationRule;
        actionIndex: number;
        stageId: string;
        trigger: StageAutomationTrigger;
    },
): Promise<ActionExecutionResult> {
    if (ctx.dryRun) {
        return { actionType: action.type, success: true, output: { preview: action } };
    }

    try {
        switch (action.type) {
            case "send_whatsapp": {
                const message = interpolate(action.message, ctx.vars);
                if (!ctx.contactId) {
                    return { actionType: "send_whatsapp", success: false, error: "Deal sem contato." };
                }
                const conv = await prisma.conversation.findFirst({
                    where: { contactId: ctx.contactId, orgId: ctx.orgId, channel: "WHATSAPP" },
                    orderBy: { lastMessageAt: "desc" },
                });
                if (!conv) {
                    return {
                        actionType: "send_whatsapp",
                        success: false,
                        error: "Nenhuma conversa de WhatsApp aberta para este contato.",
                    };
                }
                // Enqueue outbound message dispatch through inbox channel
                await queues.inbox().add("outbound:whatsapp", {
                    type: "inbox:outbound",
                    conversationId: conv.id,
                    orgId: ctx.orgId,
                    content: message,
                    contentType: "TEXT",
                    source: "stage_automation",
                }).catch(() => null);
                return { actionType: "send_whatsapp", success: true, output: { conversationId: conv.id } };
            }

            case "send_email": {
                await queues.email().add("send_email", {
                    to: ctx.vars["contact.email"],
                    subject: interpolate(action.subject, ctx.vars),
                    body: interpolate(action.body, ctx.vars),
                    fromName: action.fromName,
                    fromEmail: action.fromEmail,
                    orgId: ctx.orgId,
                });
                return { actionType: "send_email", success: true };
            }

            case "create_task": {
                const assigneeId = action.assigneeId ?? ctx.ownerId ?? undefined;
                if (!assigneeId) {
                    return { actionType: "create_task", success: false, error: "Sem responsável definido." };
                }
                let dueAt: Date | null = null;
                if (action.dueIn) {
                    dueAt = new Date(Date.now() + parseDurationMs(action.dueIn));
                }
                await prisma.activity.create({
                    data: {
                        type: (action.activityType ?? "TASK") as never,
                        title: interpolate(action.title, ctx.vars),
                        description: action.description ? interpolate(action.description, ctx.vars) : null,
                        dueAt,
                        dealId: ctx.dealId,
                        contactId: ctx.contactId ?? null,
                        userId: assigneeId,
                        orgId: ctx.orgId,
                    },
                });
                return { actionType: "create_task", success: true };
            }

            case "assign_ai_agent": {
                await queues.ai().add("agent.activate", {
                    dealId: ctx.dealId,
                    orgId: ctx.orgId,
                    agentId: action.agentId,
                    agentGoal: action.goal,
                    trigger: "AUTOMATION",
                    stageId: ctx.stageId,
                });
                return { actionType: "assign_ai_agent", success: true };
            }

            case "add_tag": {
                if (action.target === "contact" && ctx.contactId) {
                    const c = await prisma.contact.findUnique({ where: { id: ctx.contactId }, select: { tags: true } });
                    if (c && !c.tags.includes(action.tag)) {
                        await prisma.contact.update({
                            where: { id: ctx.contactId },
                            data: { tags: { push: action.tag } },
                        });
                    }
                }
                // Deal tags are not yet a first-class column; ignored gracefully.
                return { actionType: "add_tag", success: true };
            }

            case "remove_tag": {
                if (action.target === "contact" && ctx.contactId) {
                    const c = await prisma.contact.findUnique({ where: { id: ctx.contactId }, select: { tags: true } });
                    if (c) {
                        await prisma.contact.update({
                            where: { id: ctx.contactId },
                            data: { tags: c.tags.filter((t) => t !== action.tag) },
                        });
                    }
                }
                return { actionType: "remove_tag", success: true };
            }

            case "notify_user": {
                // Resolve target → userId(s)
                let userIds: string[] = [];
                if (action.target === "owner" && ctx.ownerId) {
                    userIds = [ctx.ownerId];
                } else if (action.target.startsWith("role:")) {
                    const role = action.target.slice(5);
                    const users = await prisma.user.findMany({
                        where: { orgId: ctx.orgId, role: role as never, isActive: true },
                        select: { id: true },
                    });
                    userIds = users.map((u) => u.id);
                } else {
                    userIds = [action.target];
                }
                const io = getIO();
                const title = interpolate(action.title, ctx.vars);
                const message = action.message ? interpolate(action.message, ctx.vars) : undefined;
                for (const userId of userIds) {
                    io?.to(`user:${userId}`).emit("notification:new", {
                        type: "stage_automation",
                        title,
                        message,
                        dealId: ctx.dealId,
                        stageId: ctx.stageId,
                    });
                }
                io?.to(`org:${ctx.orgId}`).emit("pipeline:automation_executed", {
                    dealId: ctx.dealId,
                    stageId: ctx.stageId,
                    ruleId: ctx.rule.id,
                    actionType: "notify_user",
                });
                return { actionType: "notify_user", success: true, output: { notified: userIds.length } };
            }

            case "update_field": {
                const field = action.field;
                if (field.startsWith("customFields.")) {
                    const key = field.slice("customFields.".length);
                    const deal = await prisma.deal.findUnique({
                        where: { id: ctx.dealId },
                        select: { customFields: true },
                    });
                    const next = { ...((deal?.customFields as Record<string, unknown>) ?? {}), [key]: action.value };
                    await prisma.deal.update({
                        where: { id: ctx.dealId },
                        data: { customFields: next as never },
                    });
                    return { actionType: "update_field", success: true };
                }
                if (!ALLOWED_DEAL_FIELDS.has(field)) {
                    return {
                        actionType: "update_field",
                        success: false,
                        error: `Campo "${field}" não pode ser atualizado por automação.`,
                    };
                }
                const data: Record<string, unknown> = {};
                if (field === "expectedCloseAt") {
                    data[field] = action.value ? new Date(String(action.value)) : null;
                } else {
                    data[field] = action.value;
                }
                await prisma.deal.update({ where: { id: ctx.dealId }, data: data as never });
                return { actionType: "update_field", success: true };
            }

            case "move_stage": {
                if (ctx.hops >= MAX_HOPS) {
                    return {
                        actionType: "move_stage",
                        success: false,
                        error: `Limite de ${MAX_HOPS} saltos de stage por execução excedido.`,
                    };
                }
                const target = await prisma.pipelineStage.findUnique({
                    where: { id: action.targetStageId },
                    select: { id: true, probability: true, isWon: true, isLost: true, pipelineId: true },
                });
                if (!target) {
                    return { actionType: "move_stage", success: false, error: "Stage destino não encontrado." };
                }
                await prisma.deal.update({
                    where: { id: ctx.dealId },
                    data: {
                        stageId: target.id,
                        probability: target.probability,
                        stageEnteredAt: new Date(),
                        ...(target.isWon || target.isLost ? { closedAt: new Date() } : {}),
                    },
                });
                getIO()?.to(`org:${ctx.orgId}`).emit("pipeline:deal_moved", {
                    dealId: ctx.dealId,
                    toStageId: target.id,
                    movedBy: "AUTOMATION",
                });
                return { actionType: "move_stage", success: true };
            }

            case "webhook": {
                const body = action.body
                    ? interpolate(action.body, ctx.vars)
                    : JSON.stringify({ dealId: ctx.dealId, contactId: ctx.contactId, orgId: ctx.orgId });
                const res = await fetch(action.url, {
                    method: action.method,
                    headers: { "Content-Type": "application/json", ...(action.headers ?? {}) },
                    body: ["POST", "PUT", "PATCH"].includes(action.method) ? body : undefined,
                });
                if (!res.ok) {
                    return { actionType: "webhook", success: false, error: `HTTP ${res.status}` };
                }
                return { actionType: "webhook", success: true, output: { status: res.status } };
            }

            case "wait": {
                const delay = parseDurationMs(action.duration);
                // Re-enqueue the rule resuming from the next action
                await queues.automations().add(
                    `stage.${ctx.trigger}`,
                    {
                        dealId: ctx.dealId,
                        orgId: ctx.orgId,
                        stageId: ctx.stageId,
                        trigger: ctx.trigger,
                        resumeFrom: ctx.actionIndex + 1,
                        ruleId: ctx.rule.id,
                        rule: ctx.rule,
                        hops: ctx.hops,
                    } satisfies StageAutomationJobData,
                    { delay, attempts: 3, backoff: { type: "exponential", delay: 5_000 } },
                );
                return { actionType: "wait", success: true, pausedForResume: true };
            }

            default: {
                const _exhaustive: never = action;
                return {
                    actionType: (_exhaustive as StageAutomationAction).type,
                    success: false,
                    error: "Tipo de ação desconhecido.",
                };
            }
        }
    } catch (err) {
        return {
            actionType: action.type,
            success: false,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}

// ---------------------------------------------------------------------------
// Rule runner
// ---------------------------------------------------------------------------

export async function runStageAutomationRule(
    rule: StageAutomationRule,
    job: StageAutomationJobData,
): Promise<ActionExecutionResult[]> {
    const built = await buildContext(job.dealId, job.orgId);
    if (!built) {
        return [{ actionType: "wait" as never, success: false, error: "Deal não encontrado." }];
    }

    // Evaluate conditions on first run (resumeFrom === 0 or undefined)
    if (!job.resumeFrom || job.resumeFrom === 0) {
        const ok = evaluateConditionGroup(rule.conditions ?? null, built.evalCtx);
        if (!ok) {
            return [];
        }
    }

    const results: ActionExecutionResult[] = [];
    const actions = rule.actions;
    const start = job.resumeFrom ?? 0;

    for (let i = start; i < actions.length; i++) {
        const action = actions[i]!;
        const r = await executeStageAction(action, {
            dealId: job.dealId,
            contactId: built.deal.contactId ?? null,
            orgId: job.orgId,
            ownerId: built.deal.ownerId,
            vars: built.vars,
            hops: job.hops ?? 0,
            dryRun: job.dryRun ?? false,
            rule,
            actionIndex: i,
            stageId: job.stageId,
            trigger: job.trigger,
        });
        results.push(r);
        if (r.pausedForResume) break; // wait re-enqueued the rest
        if (!r.success) break; // stop on failure
    }

    return results;
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

export async function persistStageAutomationLog(opts: {
    rule: StageAutomationRule;
    job: StageAutomationJobData;
    results: ActionExecutionResult[];
}) {
    if (opts.job.dryRun) return null;
    const allOk = opts.results.every((r) => r.success);
    const skipped = opts.results.length === 0;
    return prisma.stageAutomationLog.create({
        data: {
            dealId: opts.job.dealId,
            orgId: opts.job.orgId,
            stageId: opts.job.stageId,
            ruleId: opts.rule.id,
            ruleName: opts.rule.name,
            trigger: opts.job.trigger,
            status: skipped ? "SKIPPED" : allOk ? "SUCCESS" : "FAILED",
            executedActions: opts.results as never,
            error: opts.results.find((r) => !r.success)?.error ?? null,
        },
    });
}
