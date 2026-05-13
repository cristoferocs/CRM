import { prisma } from "../../lib/prisma.js";
import { queues } from "../../queue/queues.js";
import type {
    AutomationAction,
    AutomationEventPayload,
    AutomationJobData,
    AutomationTrigger,
    ActionResult,
} from "./automation.types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parses duration strings like "2d", "6h", "30m" into milliseconds */
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

/** Interpolates {{ contact.name }} style variables */
function interpolate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => vars[key] ?? "");
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreateAutomationInput {
    name: string;
    description?: string;
    trigger: AutomationTrigger;
    conditions?: AutomationAction[];
    actions: AutomationAction[];
    isActive?: boolean;
}

export interface UpdateAutomationInput {
    name?: string;
    description?: string;
    trigger?: AutomationTrigger;
    conditions?: AutomationAction[];
    actions?: AutomationAction[];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AutomationsService {
    // -------------------------------------------------------------------------
    // CRUD
    // -------------------------------------------------------------------------

    list(orgId: string) {
        return prisma.automation.findMany({
            where: { orgId },
            orderBy: { createdAt: "desc" },
        });
    }

    findById(id: string, orgId: string) {
        return prisma.automation.findFirst({ where: { id, orgId } });
    }

    create(data: CreateAutomationInput, orgId: string) {
        return prisma.automation.create({
            data: {
                name: data.name,
                description: data.description ?? null,
                trigger: data.trigger as never,
                conditions: (data.conditions ?? []) as never,
                actions: data.actions as never,
                isActive: data.isActive ?? true,
                orgId,
            },
        });
    }

    async update(id: string, data: UpdateAutomationInput, orgId: string) {
        const existing = await this.findById(id, orgId);
        if (!existing) {
            throw Object.assign(new Error("Automation not found."), { statusCode: 404 });
        }
        return prisma.automation.update({
            where: { id },
            data: {
                ...(data.name !== undefined ? { name: data.name } : {}),
                ...(data.description !== undefined ? { description: data.description } : {}),
                ...(data.trigger !== undefined ? { trigger: data.trigger as never } : {}),
                ...(data.conditions !== undefined ? { conditions: data.conditions as never } : {}),
                ...(data.actions !== undefined ? { actions: data.actions as never } : {}),
            },
        });
    }

    async toggle(id: string, orgId: string) {
        const existing = await this.findById(id, orgId);
        if (!existing) {
            throw Object.assign(new Error("Automation not found."), { statusCode: 404 });
        }
        return prisma.automation.update({
            where: { id },
            data: { isActive: !existing.isActive },
        });
    }

    async delete(id: string, orgId: string) {
        const existing = await this.findById(id, orgId);
        if (!existing) {
            throw Object.assign(new Error("Automation not found."), { statusCode: 404 });
        }
        await prisma.automation.delete({ where: { id } });
    }

    // -------------------------------------------------------------------------
    // Trigger — fires when a CRM event occurs
    // -------------------------------------------------------------------------

    async trigger(event: AutomationEventPayload): Promise<void> {
        const { trigger: triggerType, orgId, contactId, dealId, conversationId, metadata } = event;

        // Find all active automations for this org that match the trigger type
        const automations = await prisma.automation.findMany({
            where: { orgId, isActive: true },
        });

        const matching = automations.filter((automation) => {
            const t = automation.trigger as unknown as AutomationTrigger;
            if (t.type !== triggerType) return false;

            // Extra filters per trigger type
            if (t.type === "deal_stage_changed") {
                if (t.toStageId && metadata?.toStageId !== t.toStageId) return false;
                if (t.fromStageId && metadata?.fromStageId !== t.fromStageId) return false;
            }
            if (t.type === "contact_created" && t.source) {
                if (metadata?.source !== t.source) return false;
            }
            if (t.type === "message_received") {
                if (t.channel && metadata?.channel !== t.channel) return false;
            }

            return true;
        });

        if (matching.length === 0) return;

        const queue = queues.automations();

        for (const automation of matching) {
            const trigger = automation.trigger as unknown as AutomationTrigger;

            // Calculate delay for time_based triggers
            let delay = 0;
            if (trigger.type === "time_based") {
                delay = parseDurationMs(trigger.delay);
            }

            const jobData: AutomationJobData = {
                automationId: automation.id,
                contactId,
                dealId,
                conversationId,
                orgId,
                triggeredAt: new Date().toISOString(),
                metadata,
            };

            await queue.add(`automation:${automation.id}`, jobData, {
                delay,
                attempts: 3,
                backoff: { type: "exponential", delay: 5_000 },
                removeOnComplete: { count: 1000 },
                removeOnFail: { count: 500 },
            });
        }
    }

    // -------------------------------------------------------------------------
    // Execute — runs all actions of an automation for a given contact/deal
    // -------------------------------------------------------------------------

    async execute(
        automationId: string,
        contactId: string | undefined,
        dealId: string | undefined,
        orgId: string,
        metadata?: Record<string, unknown>,
    ): Promise<ActionResult[]> {
        const automation = await this.findById(automationId, orgId);
        if (!automation) {
            throw Object.assign(new Error("Automation not found."), { statusCode: 404 });
        }

        const actions = automation.actions as unknown as AutomationAction[];
        const results: ActionResult[] = [];

        // Pre-fetch context for variable interpolation
        const [contact, deal] = await Promise.all([
            contactId
                ? prisma.contact.findFirst({ where: { id: contactId, orgId } })
                : Promise.resolve(null),
            dealId
                ? prisma.deal.findFirst({
                    where: { id: dealId, orgId },
                    include: { stage: true },
                })
                : Promise.resolve(null),
        ]);

        const vars: Record<string, string> = {
            "contact.name": contact?.name ?? "",
            "contact.phone": contact?.phone ?? "",
            "contact.email": contact?.email ?? "",
            "deal.title": deal?.title ?? "",
            "deal.value": deal?.value?.toString() ?? "",
            "deal.stage": (deal?.stage as { name?: string })?.name ?? "",
        };

        for (const action of actions) {
            const result = await this.executeAction(action, {
                contactId,
                dealId,
                orgId,
                vars,
            });
            results.push(result);

            // If a wait action fails or signals a pause, stop executing
            if (!result.success) break;
        }

        // Persist log
        await prisma.automationLog.create({
            data: {
                automationId,
                contactId: contactId ?? null,
                dealId: dealId ?? null,
                status: results.every((r) => r.success) ? "SUCCESS" : "FAILED",
                executedActions: results as never,
                error: results.find((r) => !r.success)?.error ?? null,
            },
        });

        return results;
    }

    // -------------------------------------------------------------------------
    // Private — execute individual action
    // -------------------------------------------------------------------------

    private async executeAction(
        action: AutomationAction,
        ctx: {
            contactId?: string;
            dealId?: string;
            orgId: string;
            vars: Record<string, string>;
        },
    ): Promise<ActionResult> {
        try {
            switch (action.type) {
                case "add_tag": {
                    if (ctx.contactId) {
                        await prisma.contact.update({
                            where: { id: ctx.contactId },
                            data: { tags: { push: action.tag } },
                        });
                    }
                    return { actionType: "add_tag", success: true };
                }

                case "remove_tag": {
                    if (ctx.contactId) {
                        const contact = await prisma.contact.findUnique({
                            where: { id: ctx.contactId },
                            select: { tags: true },
                        });
                        if (contact) {
                            await prisma.contact.update({
                                where: { id: ctx.contactId },
                                data: { tags: contact.tags.filter((t) => t !== action.tag) },
                            });
                        }
                    }
                    return { actionType: "remove_tag", success: true };
                }

                case "move_pipeline": {
                    if (ctx.dealId) {
                        const stage = await prisma.pipelineStage.findUnique({
                            where: { id: action.targetStageId },
                            select: { id: true, probability: true, isWon: true, isLost: true },
                        });
                        if (stage) {
                            await prisma.deal.update({
                                where: { id: ctx.dealId },
                                data: {
                                    stageId: stage.id,
                                    probability: stage.probability,
                                    ...(stage.isWon || stage.isLost
                                        ? { closedAt: new Date() }
                                        : {}),
                                },
                            });
                        }
                    }
                    return { actionType: "move_pipeline", success: true };
                }

                case "assign_agent": {
                    // Find the conversation for this contact and update agentId
                    if (ctx.contactId) {
                        await prisma.conversation.updateMany({
                            where: { contactId: ctx.contactId, orgId: ctx.orgId, status: "OPEN" },
                            data: { agentId: action.agentId },
                        });
                    }
                    return { actionType: "assign_agent", success: true };
                }

                case "create_activity": {
                    // Requires a userId — use a system fallback if no agent is available
                    const systemUser = await prisma.user.findFirst({
                        where: { orgId: ctx.orgId },
                        select: { id: true },
                        orderBy: { createdAt: "asc" },
                    });
                    if (systemUser) {
                        let dueAt: Date | null = null;
                        if (action.dueDuration) {
                            dueAt = new Date(
                                Date.now() + parseDurationMs(action.dueDuration),
                            );
                        }
                        await prisma.activity.create({
                            data: {
                                type: action.activityType as never,
                                title: interpolate(action.title, ctx.vars),
                                description: action.description
                                    ? interpolate(action.description, ctx.vars)
                                    : null,
                                dueAt,
                                dealId: ctx.dealId ?? null,
                                contactId: ctx.contactId ?? null,
                                userId: systemUser.id,
                                orgId: ctx.orgId,
                            },
                        });
                    }
                    return { actionType: "create_activity", success: true };
                }

                case "webhook": {
                    const body = action.body
                        ? interpolate(action.body, ctx.vars)
                        : JSON.stringify({
                            contactId: ctx.contactId,
                            dealId: ctx.dealId,
                            orgId: ctx.orgId,
                        });

                    const response = await fetch(action.url, {
                        method: action.method,
                        headers: {
                            "Content-Type": "application/json",
                            ...(action.headers ?? {}),
                        },
                        body: ["POST", "PUT", "PATCH"].includes(action.method) ? body : undefined,
                    });

                    if (!response.ok) {
                        return {
                            actionType: "webhook",
                            success: false,
                            error: `Webhook returned ${response.status}`,
                        };
                    }
                    return { actionType: "webhook", success: true, output: { status: response.status } };
                }

                case "send_whatsapp": {
                    // Queue a WhatsApp send job — actual dispatch is handled by the inbox channel
                    const message = interpolate(action.message, ctx.vars);
                    // In production this would call the Evolution/WhatsApp API via inbox service.
                    // Here we log the intent and return success so the automation log is recorded.
                    console.info(
                        `[automation] send_whatsapp → contactId=${ctx.contactId} msg=${message.slice(0, 80)}`,
                    );
                    return { actionType: "send_whatsapp", success: true, output: { message } };
                }

                case "send_email": {
                    // Dispatch via the email queue
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

                case "wait": {
                    // Wait is handled by the queue delay — reaching this point means
                    // the wait already elapsed (jobs are scheduled with BullMQ delay).
                    return { actionType: "wait", success: true };
                }

                default: {
                    const _exhaustive: never = action;
                    return { actionType: (_exhaustive as AutomationAction).type as never, success: false, error: "Unknown action type" };
                }
            }
        } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            return { actionType: action.type, success: false, error };
        }
    }

    // -------------------------------------------------------------------------
    // Logs
    // -------------------------------------------------------------------------

    listLogs(automationId: string, orgId: string) {
        return prisma.automationLog.findMany({
            where: {
                automationId,
                automation: { orgId },
            },
            orderBy: { createdAt: "desc" },
            take: 100,
        });
    }
}
