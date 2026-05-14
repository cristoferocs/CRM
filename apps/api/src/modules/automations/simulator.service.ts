/**
 * Automation simulator — "what would this rule have done?"
 *
 * Replays an automation's trigger + conditions against the org's recent
 * history WITHOUT executing any actions. Returns:
 *   - total events the trigger would have fired on
 *   - how many also passed the conditions
 *   - up to N sample matches with entity context for the UI
 *   - a daily histogram for a small chart
 *
 * Intent: reduce the fear of activating aggressive rules. A salesops
 * manager can write "send WhatsApp to every lead 24h after creation if
 * leadScore > 50" and confirm it would only fire ~30 times in 30 days
 * — not 300 — before flipping the switch.
 *
 * Hard guarantees:
 *   - Pure reads. Nothing is created, updated, sent, or queued.
 *   - Scoped to the caller's orgId. Cross-tenant access is unreachable.
 *   - Hard cap on event lookback (90d) and sample size (1000 events
 *     considered, 25 returned) to keep latency predictable.
 */
import { prisma } from "../../lib/prisma.js";
import type { AutomationTriggerEnum } from "@prisma/client";
import { evaluateCondition as evalCond } from "./condition.evaluator.js";
import type { EvaluationContext } from "./condition.evaluator.js";

export interface SimulatorInput {
    triggerType: AutomationTriggerEnum;
    /** triggerConfig from the automation form — same shape as automation.triggerConfig. */
    triggerConfig?: Record<string, unknown>;
    /** conditions from the automation form — legacy flat array shape. */
    conditions?: Array<{ field: string; operator: string; value?: unknown; logic?: string }>;
    /** How far back to replay. Default 30d, capped at 90d. */
    days?: number;
}

export interface SimulatorSample {
    entityType: "deal" | "contact" | "conversation" | "message" | "payment";
    entityId: string;
    label: string;
    occurredAt: string;
    matchedConditions: boolean;
}

export interface SimulatorResult {
    triggerType: AutomationTriggerEnum;
    rangeDays: number;
    rangeFrom: string;
    rangeTo: string;
    /** Total events of this trigger type in the range. */
    eventCount: number;
    /** Events that also passed the conditions. */
    wouldFire: number;
    /** Sample of up to 25 events for the UI. */
    samples: SimulatorSample[];
    /** Daily histogram of would-fire events. */
    daily: Array<{ date: string; total: number; wouldFire: number }>;
    /** True if we hit the event cap and stopped scanning. */
    truncated: boolean;
    /** Generic note when the trigger type doesn't have a replay source. */
    note?: string;
}

const MAX_DAYS = 90;
const DEFAULT_DAYS = 30;
const EVENT_CAP = 1000;
const SAMPLE_LIMIT = 25;

export class SimulatorService {
    async simulate(orgId: string, input: SimulatorInput): Promise<SimulatorResult> {
        const days = Math.min(MAX_DAYS, Math.max(1, input.days ?? DEFAULT_DAYS));
        const rangeTo = new Date();
        const rangeFrom = new Date(rangeTo.getTime() - days * 86_400_000);

        const events = await this.loadEvents(orgId, input.triggerType, input.triggerConfig, rangeFrom, rangeTo);

        const conditions = (input.conditions ?? []).filter((c) => c.logic !== "OR");
        const samples: SimulatorSample[] = [];
        const dailyMap = new Map<string, { total: number; wouldFire: number }>();
        let wouldFire = 0;

        for (const ev of events.list) {
            const day = ev.occurredAt.toISOString().slice(0, 10);
            const bucket = dailyMap.get(day) ?? { total: 0, wouldFire: 0 };
            bucket.total += 1;

            const evalContext = await this.buildEvalContext(orgId, ev);
            const matched =
                conditions.length === 0
                    ? true
                    : conditions.every((c) =>
                          evalCond(
                              {
                                  field: c.field,
                                  operator: c.operator as Parameters<typeof evalCond>[0]["operator"],
                                  value: c.value,
                              } as Parameters<typeof evalCond>[0],
                              evalContext,
                          ),
                      );
            if (matched) {
                wouldFire += 1;
                bucket.wouldFire += 1;
                if (samples.length < SAMPLE_LIMIT) {
                    samples.push({
                        entityType: ev.entityType,
                        entityId: ev.entityId,
                        label: ev.label,
                        occurredAt: ev.occurredAt.toISOString(),
                        matchedConditions: true,
                    });
                }
            } else if (samples.length < SAMPLE_LIMIT) {
                samples.push({
                    entityType: ev.entityType,
                    entityId: ev.entityId,
                    label: ev.label,
                    occurredAt: ev.occurredAt.toISOString(),
                    matchedConditions: false,
                });
            }
            dailyMap.set(day, bucket);
        }

        // Fill days with no events for a flat histogram.
        const daily: SimulatorResult["daily"] = [];
        for (let i = 0; i < days; i++) {
            const d = new Date(rangeFrom.getTime() + i * 86_400_000);
            const key = d.toISOString().slice(0, 10);
            const b = dailyMap.get(key) ?? { total: 0, wouldFire: 0 };
            daily.push({ date: key, total: b.total, wouldFire: b.wouldFire });
        }

        return {
            triggerType: input.triggerType,
            rangeDays: days,
            rangeFrom: rangeFrom.toISOString(),
            rangeTo: rangeTo.toISOString(),
            eventCount: events.list.length,
            wouldFire,
            samples,
            daily,
            truncated: events.truncated,
            note: events.note,
        };
    }

    // -----------------------------------------------------------------------
    // Per-trigger event sourcing
    // -----------------------------------------------------------------------

    private async loadEvents(
        orgId: string,
        trigger: AutomationTriggerEnum,
        triggerConfig: Record<string, unknown> | undefined,
        from: Date,
        to: Date,
    ): Promise<{ list: NormalizedEvent[]; truncated: boolean; note?: string }> {
        switch (trigger) {
            case "CONTACT_CREATED": {
                const source = triggerConfig?.["source"] as string | undefined;
                const rows = await prisma.contact.findMany({
                    where: {
                        orgId,
                        createdAt: { gte: from, lt: to },
                        ...(source ? { source: source as never } : {}),
                    },
                    select: { id: true, name: true, email: true, phone: true, createdAt: true },
                    orderBy: { createdAt: "desc" },
                    take: EVENT_CAP + 1,
                });
                return wrap(
                    rows.map((r) => ({
                        entityType: "contact" as const,
                        entityId: r.id,
                        label: r.name || r.email || r.phone || r.id,
                        occurredAt: r.createdAt,
                    })),
                );
            }

            case "DEAL_CREATED": {
                const pipelineId = triggerConfig?.["pipelineId"] as string | undefined;
                const rows = await prisma.deal.findMany({
                    where: {
                        orgId,
                        createdAt: { gte: from, lt: to },
                        ...(pipelineId ? { pipelineId } : {}),
                    },
                    select: { id: true, title: true, createdAt: true },
                    orderBy: { createdAt: "desc" },
                    take: EVENT_CAP + 1,
                });
                return wrap(
                    rows.map((r) => ({
                        entityType: "deal" as const,
                        entityId: r.id,
                        label: r.title,
                        occurredAt: r.createdAt,
                    })),
                );
            }

            case "DEAL_STAGE_CHANGED": {
                const toStageId = triggerConfig?.["toStageId"] as string | undefined;
                const rows = await prisma.dealStageMovement.findMany({
                    where: {
                        orgId,
                        createdAt: { gte: from, lt: to },
                        ...(toStageId ? { toStageId } : {}),
                    },
                    select: { id: true, dealId: true, toStageName: true, createdAt: true },
                    orderBy: { createdAt: "desc" },
                    take: EVENT_CAP + 1,
                });
                return wrap(
                    rows.map((r) => ({
                        entityType: "deal" as const,
                        entityId: r.dealId,
                        label: `Deal → ${r.toStageName}`,
                        occurredAt: r.createdAt,
                    })),
                );
            }

            case "DEAL_WON":
            case "DEAL_LOST": {
                const rows = await prisma.deal.findMany({
                    where: {
                        orgId,
                        closedAt: { gte: from, lt: to, not: null },
                        stage: trigger === "DEAL_WON" ? { isWon: true } : { isLost: true },
                    },
                    select: { id: true, title: true, closedAt: true },
                    orderBy: { closedAt: "desc" },
                    take: EVENT_CAP + 1,
                });
                return wrap(
                    rows
                        .filter((r) => r.closedAt !== null)
                        .map((r) => ({
                            entityType: "deal" as const,
                            entityId: r.id,
                            label: r.title,
                            occurredAt: r.closedAt as Date,
                        })),
                );
            }

            case "MESSAGE_RECEIVED":
            case "MESSAGE_KEYWORD": {
                const channel = triggerConfig?.["channel"] as string | undefined;
                const keyword =
                    trigger === "MESSAGE_KEYWORD"
                        ? (triggerConfig?.["keyword"] as string | undefined)
                        : undefined;
                const rows = await prisma.message.findMany({
                    where: {
                        direction: "INBOUND",
                        sentAt: { gte: from, lt: to },
                        conversation: {
                            orgId,
                            ...(channel ? { channel: channel as never } : {}),
                        },
                        ...(keyword ? { content: { contains: keyword, mode: "insensitive" } } : {}),
                    },
                    select: {
                        id: true,
                        content: true,
                        sentAt: true,
                        conversationId: true,
                    },
                    orderBy: { sentAt: "desc" },
                    take: EVENT_CAP + 1,
                });
                return wrap(
                    rows.map((r) => ({
                        entityType: "message" as const,
                        entityId: r.id,
                        label: r.content.slice(0, 60),
                        occurredAt: r.sentAt,
                    })),
                );
            }

            case "CONVERSATION_OPENED": {
                const rows = await prisma.conversation.findMany({
                    where: { orgId, createdAt: { gte: from, lt: to } },
                    select: { id: true, channel: true, createdAt: true, contact: { select: { name: true } } },
                    orderBy: { createdAt: "desc" },
                    take: EVENT_CAP + 1,
                });
                return wrap(
                    rows.map((r) => ({
                        entityType: "conversation" as const,
                        entityId: r.id,
                        label: `${r.channel} — ${r.contact?.name ?? r.id}`,
                        occurredAt: r.createdAt,
                    })),
                );
            }

            case "DEAL_ROTTING": {
                // Approximated: deals currently marked rotting whose lastActivityAt
                // is in the range. Good enough for "would this rule have caught
                // them?" purposes.
                const rows = await prisma.deal.findMany({
                    where: { orgId, isRotting: true, lastActivityAt: { gte: from, lt: to } },
                    select: { id: true, title: true, lastActivityAt: true },
                    orderBy: { lastActivityAt: "desc" },
                    take: EVENT_CAP + 1,
                });
                return wrap(
                    rows.map((r) => ({
                        entityType: "deal" as const,
                        entityId: r.id,
                        label: r.title,
                        occurredAt: r.lastActivityAt,
                    })),
                );
            }

            case "PAYMENT_RECEIVED": {
                const rows = await prisma.payment.findMany({
                    where: {
                        orgId,
                        paidAt: { gte: from, lt: to, not: null },
                        status: "PAID",
                    },
                    select: { id: true, amount: true, paidAt: true },
                    orderBy: { paidAt: "desc" },
                    take: EVENT_CAP + 1,
                });
                return wrap(
                    rows
                        .filter((r) => r.paidAt !== null)
                        .map((r) => ({
                            entityType: "payment" as const,
                            entityId: r.id,
                            label: `R$ ${r.amount.toString()}`,
                            occurredAt: r.paidAt as Date,
                        })),
                );
            }

            // Triggers that don't have a clear "past event" replay source —
            // we tell the user explicitly instead of returning a misleading
            // empty result.
            case "SCHEDULED":
            case "TIME_DELAY":
            case "DATE_FIELD":
                return {
                    list: [],
                    truncated: false,
                    note:
                        "Este tipo de gatilho é baseado em tempo (cron / agenda). Use o histórico de execuções para avaliar — a simulação contra dados passados não se aplica.",
                };

            default:
                return {
                    list: [],
                    truncated: false,
                    note: `Tipo de gatilho "${trigger}" ainda não suportado pelo simulador.`,
                };
        }
    }

    /**
     * Build an EvaluationContext from a historical event so the same
     * `evaluateCondition` used at runtime can check this event.
     */
    private async buildEvalContext(orgId: string, ev: NormalizedEvent): Promise<EvaluationContext> {
        const ctx: EvaluationContext = {};

        if (ev.entityType === "deal") {
            const deal = await prisma.deal.findFirst({ where: { id: ev.entityId, orgId } });
            if (deal) {
                ctx.deal = {
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
                };
                if (deal.contactId) {
                    const contact = await prisma.contact.findFirst({
                        where: { id: deal.contactId, orgId },
                    });
                    if (contact) ctx.contact = mapContact(contact);
                }
            }
        } else if (ev.entityType === "contact") {
            const contact = await prisma.contact.findFirst({ where: { id: ev.entityId, orgId } });
            if (contact) ctx.contact = mapContact(contact);
        } else if (ev.entityType === "conversation" || ev.entityType === "message") {
            const conv = await prisma.conversation.findFirst({
                where:
                    ev.entityType === "conversation"
                        ? { id: ev.entityId, orgId }
                        : { messages: { some: { id: ev.entityId } }, orgId },
                select: { contactId: true },
            });
            if (conv?.contactId) {
                const contact = await prisma.contact.findFirst({
                    where: { id: conv.contactId, orgId },
                });
                if (contact) ctx.contact = mapContact(contact);
            }
        }
        return ctx;
    }
}

// -- Helpers ----------------------------------------------------------------

interface NormalizedEvent {
    entityType: "deal" | "contact" | "conversation" | "message" | "payment";
    entityId: string;
    label: string;
    occurredAt: Date;
}

function wrap(list: NormalizedEvent[]): { list: NormalizedEvent[]; truncated: boolean } {
    if (list.length > EVENT_CAP) {
        return { list: list.slice(0, EVENT_CAP), truncated: true };
    }
    return { list, truncated: false };
}

function mapContact(c: {
    id: string;
    email: string | null;
    phone: string | null;
    tags: string[];
    customFields: unknown;
}): NonNullable<EvaluationContext["contact"]> {
    return {
        id: c.id,
        email: c.email,
        phone: c.phone,
        tags: c.tags,
        customFields: (c.customFields as Record<string, unknown> | null) ?? null,
    };
}
