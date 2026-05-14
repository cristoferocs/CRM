/**
 * Handoff timeline — chronological view of every agent (and the final
 * human assignment) that handled a single deal or conversation.
 *
 * Why this matters: in a multi-agent setup (qualification → sales →
 * support) a single contact bounces between several specialists. Today
 * each session is searchable individually but the *flow* between them
 * is invisible — the human who finally picks up the conversation has
 * no idea what the AI already established.
 *
 * The timeline answers three questions:
 *   1. Which agents touched this deal, in what order?
 *   2. Why did each one hand off? (handoffReason + collected data)
 *   3. How much did each step cost in time / tokens / dollars?
 *
 * Plus a final "Humano" node when the conversation has an agentId
 * — this is the moment the operator inherits whatever the AIs collected.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma.js";

export type HandoffNodeKind = "agent" | "human";

export interface HandoffNode {
    kind: HandoffNodeKind;
    sessionId?: string;
    agentId?: string;
    agentName?: string;
    agentType?: string;
    userId?: string;
    userName?: string;
    startedAt: string;
    endedAt: string | null;
    durationMs: number | null;
    status?: string;
    outcome?: string | null;
    goalAchieved?: boolean | null;
    handoffReason?: string | null;
    turnCount: number;
    totalCostUsd: number;
    totalTokens: number;
    /** Snapshot of what the next step receives (collectedData + handoffData). */
    preservedContext: Record<string, unknown>;
}

export interface HandoffTimeline {
    dealId?: string | null;
    conversationId?: string | null;
    nodes: HandoffNode[];
    totals: {
        agents: number;
        durationMs: number;
        costUsd: number;
        tokens: number;
        turns: number;
    };
}

export class HandoffTimelineService {
    async forDeal(dealId: string, orgId: string): Promise<HandoffTimeline | null> {
        const deal = await prisma.deal.findFirst({
            where: { id: dealId, orgId, isActive: true },
            select: { id: true, contactId: true },
        });
        if (!deal) return null;

        const conversation = deal.contactId
            ? await prisma.conversation.findFirst({
                  where: { contactId: deal.contactId, orgId },
                  orderBy: { lastMessageAt: "desc" },
                  select: { id: true, agentId: true },
              })
            : null;

        const sessions = await this.loadSessions(orgId, {
            dealId: deal.id,
            conversationId: conversation?.id,
        });
        const humanNode = conversation?.agentId
            ? await this.buildHumanNode(conversation.agentId, sessions)
            : null;

        return this.assemble({
            dealId: deal.id,
            conversationId: conversation?.id ?? null,
            sessions,
            humanNode,
        });
    }

    async forConversation(conversationId: string, orgId: string): Promise<HandoffTimeline | null> {
        const conv = await prisma.conversation.findFirst({
            where: { id: conversationId, orgId },
            select: { id: true, agentId: true, contactId: true },
        });
        if (!conv) return null;

        const sessions = await this.loadSessions(orgId, { conversationId: conv.id });
        const humanNode = conv.agentId
            ? await this.buildHumanNode(conv.agentId, sessions)
            : null;

        return this.assemble({
            dealId: null,
            conversationId: conv.id,
            sessions,
            humanNode,
        });
    }

    // -----------------------------------------------------------------------

    private async loadSessions(
        orgId: string,
        scope: { dealId?: string; conversationId?: string },
    ) {
        const where: Prisma.AIAgentSessionWhereInput = { orgId };
        // The Deal model doesn't have a sessions relation, so even
        // when a dealId is passed we narrow by the conversation it's
        // tied to (looked up by the caller).
        if (scope.conversationId) {
            where.conversationId = scope.conversationId;
        }

        return prisma.aIAgentSession.findMany({
            where,
            include: {
                agent: { select: { id: true, name: true, type: true } },
                turns: {
                    select: {
                        tokensUsed: true,
                        costUsd: true,
                        durationMs: true,
                    },
                },
            },
            orderBy: { startedAt: "asc" },
        });
    }

    private async buildHumanNode(
        userId: string,
        sessions: Array<{ endedAt: Date | null; startedAt: Date }>,
    ): Promise<HandoffNode | null> {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, name: true },
        });
        if (!user) return null;
        // The human picks up where the last session ended (or now).
        const lastEnded = sessions
            .map((s) => s.endedAt ?? s.startedAt)
            .sort((a, b) => b.getTime() - a.getTime())[0];
        return {
            kind: "human",
            userId: user.id,
            userName: user.name,
            startedAt: (lastEnded ?? new Date()).toISOString(),
            endedAt: null,
            durationMs: null,
            turnCount: 0,
            totalCostUsd: 0,
            totalTokens: 0,
            preservedContext: {},
        };
    }

    private assemble(args: {
        dealId: string | null;
        conversationId: string | null;
        sessions: Array<{
            id: string;
            agent: { id: string; name: string; type: string } | null;
            startedAt: Date;
            endedAt: Date | null;
            status: string;
            outcome: string | null;
            goalAchieved: boolean | null;
            handoffReason: string | null;
            turnCount: number;
            collectedData: unknown;
            handoffData: unknown;
            turns: Array<{
                tokensUsed: number;
                // Prisma returns Decimal — toString() it before Number()ing.
                costUsd: { toString(): string };
                durationMs: number | null;
            }>;
        }>;
        humanNode: HandoffNode | null;
    }): HandoffTimeline {
        const nodes: HandoffNode[] = args.sessions.map((s) => {
            const totals = s.turns.reduce(
                (acc, t) => {
                    acc.cost += Number(t.costUsd.toString());
                    acc.tokens += t.tokensUsed;
                    acc.durationMs += t.durationMs ?? 0;
                    return acc;
                },
                { cost: 0, tokens: 0, durationMs: 0 },
            );
            const startedAt = s.startedAt;
            const endedAt = s.endedAt;
            return {
                kind: "agent" as const,
                sessionId: s.id,
                agentId: s.agent?.id,
                agentName: s.agent?.name ?? "Agente removido",
                agentType: s.agent?.type,
                startedAt: startedAt.toISOString(),
                endedAt: endedAt?.toISOString() ?? null,
                durationMs: endedAt ? endedAt.getTime() - startedAt.getTime() : null,
                status: s.status,
                outcome: s.outcome,
                goalAchieved: s.goalAchieved,
                handoffReason: s.handoffReason,
                turnCount: s.turnCount,
                totalCostUsd: Math.round(totals.cost * 1_000_000) / 1_000_000,
                totalTokens: totals.tokens,
                preservedContext: {
                    collected: (s.collectedData as Record<string, unknown> | null) ?? {},
                    handoff: (s.handoffData as Record<string, unknown> | null) ?? {},
                },
            };
        });

        if (args.humanNode) nodes.push(args.humanNode);

        const totals = nodes.reduce(
            (acc, n) => {
                if (n.kind === "agent") {
                    acc.agents += 1;
                    acc.durationMs += n.durationMs ?? 0;
                    acc.costUsd += n.totalCostUsd;
                    acc.tokens += n.totalTokens;
                    acc.turns += n.turnCount;
                }
                return acc;
            },
            { agents: 0, durationMs: 0, costUsd: 0, tokens: 0, turns: 0 },
        );

        return {
            dealId: args.dealId,
            conversationId: args.conversationId,
            nodes,
            totals: {
                agents: totals.agents,
                durationMs: totals.durationMs,
                costUsd: Math.round(totals.costUsd * 1_000_000) / 1_000_000,
                tokens: totals.tokens,
                turns: totals.turns,
            },
        };
    }
}
