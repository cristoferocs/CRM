/**
 * Rollups of AIAgentTurn cost data — drives the dashboard, budget alerts,
 * and the per-session replay view.
 *
 * Everything is scoped to orgId; cross-tenant queries are unreachable here.
 */
import { prisma } from "../../../lib/prisma.js";

export interface CostSummaryRange {
    /** Inclusive start. Defaults to now() - 30d. */
    from?: Date;
    /** Exclusive end. Defaults to now(). */
    to?: Date;
}

export interface AgentCostRow {
    agentId: string;
    agentName: string;
    totalCostUsd: number;
    totalTokens: number;
    sessions: number;
    turns: number;
    avgCostPerSessionUsd: number;
}

export interface DailyCostPoint {
    date: string; // YYYY-MM-DD (UTC)
    costUsd: number;
    tokens: number;
    turns: number;
}

export interface ProviderCostRow {
    provider: string; // e.g. "anthropic", "openai"
    totalCostUsd: number;
    totalTokens: number;
    turns: number;
}

export interface OrgCostSummary {
    totalCostUsd: number;
    totalTokens: number;
    totalTurns: number;
    rangeFrom: Date;
    rangeTo: Date;
    byAgent: AgentCostRow[];
    byProvider: ProviderCostRow[];
    daily: DailyCostPoint[];
    monthToDateUsd: number;
}

function defaultRange(range?: CostSummaryRange): { from: Date; to: Date } {
    const to = range?.to ?? new Date();
    const from = range?.from ?? new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { from, to };
}

export class AgentCostService {
    /**
     * One-shot rollup used by `GET /agents/cost/summary` and the
     * dashboard widget. Three SQL queries, all org-scoped.
     */
    async summary(orgId: string, range?: CostSummaryRange): Promise<OrgCostSummary> {
        const { from, to } = defaultRange(range);

        const byAgent = await this.byAgent(orgId, from, to);
        const byProvider = await this.byProvider(orgId, from, to);
        const daily = await this.daily(orgId, from, to);

        const totalCostUsd = byAgent.reduce((sum, r) => sum + r.totalCostUsd, 0);
        const totalTokens = byAgent.reduce((sum, r) => sum + r.totalTokens, 0);
        const totalTurns = byAgent.reduce((sum, r) => sum + r.turns, 0);

        const monthStart = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
        const monthToDateUsd = await this.totalBetween(orgId, monthStart, to);

        return {
            totalCostUsd,
            totalTokens,
            totalTurns,
            rangeFrom: from,
            rangeTo: to,
            byAgent,
            byProvider,
            daily,
            monthToDateUsd,
        };
    }

    /** Used by the budget pre-flight check in agent.runner. */
    async monthToDateCost(orgId: string, now = new Date()): Promise<number> {
        const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        return this.totalBetween(orgId, start, now);
    }

    private async totalBetween(orgId: string, from: Date, to: Date): Promise<number> {
        const rows = (await prisma.$queryRaw<Array<{ total: string | number | null }>>`
            SELECT COALESCE(SUM(t."costUsd"), 0) AS total
            FROM ai_agent_turns t
            INNER JOIN ai_agent_sessions s ON s.id = t."sessionId"
            WHERE s."orgId" = ${orgId}
              AND t."createdAt" >= ${from}
              AND t."createdAt" < ${to}
        `);
        return Number(rows[0]?.total ?? 0);
    }

    private async byAgent(orgId: string, from: Date, to: Date): Promise<AgentCostRow[]> {
        const rows = await prisma.$queryRaw<Array<{
            agentId: string;
            agentName: string;
            totalCostUsd: string | number | null;
            totalTokens: bigint | number | null;
            sessions: bigint | number | null;
            turns: bigint | number | null;
        }>>`
            SELECT
                a.id AS "agentId",
                a.name AS "agentName",
                COALESCE(SUM(t."costUsd"), 0) AS "totalCostUsd",
                COALESCE(SUM(t."tokensUsed"), 0) AS "totalTokens",
                COUNT(DISTINCT s.id) AS "sessions",
                COUNT(t.id) AS "turns"
            FROM ai_agents a
            LEFT JOIN ai_agent_sessions s
                ON s."agentId" = a.id
                AND s."startedAt" < ${to}
            LEFT JOIN ai_agent_turns t
                ON t."sessionId" = s.id
                AND t."createdAt" >= ${from}
                AND t."createdAt" < ${to}
            WHERE a."orgId" = ${orgId}
            GROUP BY a.id, a.name
            ORDER BY "totalCostUsd" DESC
        `;
        return rows.map((r) => {
            const cost = Number(r.totalCostUsd ?? 0);
            const sessions = Number(r.sessions ?? 0);
            return {
                agentId: r.agentId,
                agentName: r.agentName,
                totalCostUsd: cost,
                totalTokens: Number(r.totalTokens ?? 0),
                sessions,
                turns: Number(r.turns ?? 0),
                avgCostPerSessionUsd: sessions > 0 ? cost / sessions : 0,
            };
        });
    }

    private async byProvider(orgId: string, from: Date, to: Date): Promise<ProviderCostRow[]> {
        const rows = await prisma.$queryRaw<Array<{
            provider: string | null;
            totalCostUsd: string | number | null;
            totalTokens: bigint | number | null;
            turns: bigint | number | null;
        }>>`
            SELECT
                split_part(t.model, ':', 1) AS provider,
                COALESCE(SUM(t."costUsd"), 0) AS "totalCostUsd",
                COALESCE(SUM(t."tokensUsed"), 0) AS "totalTokens",
                COUNT(t.id) AS "turns"
            FROM ai_agent_turns t
            INNER JOIN ai_agent_sessions s ON s.id = t."sessionId"
            WHERE s."orgId" = ${orgId}
              AND t."createdAt" >= ${from}
              AND t."createdAt" < ${to}
              AND t.model IS NOT NULL
            GROUP BY split_part(t.model, ':', 1)
            ORDER BY "totalCostUsd" DESC
        `;
        return rows.map((r) => ({
            provider: r.provider ?? "unknown",
            totalCostUsd: Number(r.totalCostUsd ?? 0),
            totalTokens: Number(r.totalTokens ?? 0),
            turns: Number(r.turns ?? 0),
        }));
    }

    private async daily(orgId: string, from: Date, to: Date): Promise<DailyCostPoint[]> {
        const rows = await prisma.$queryRaw<Array<{
            date: Date;
            costUsd: string | number | null;
            tokens: bigint | number | null;
            turns: bigint | number | null;
        }>>`
            SELECT
                date_trunc('day', t."createdAt") AS date,
                COALESCE(SUM(t."costUsd"), 0) AS "costUsd",
                COALESCE(SUM(t."tokensUsed"), 0) AS tokens,
                COUNT(t.id) AS turns
            FROM ai_agent_turns t
            INNER JOIN ai_agent_sessions s ON s.id = t."sessionId"
            WHERE s."orgId" = ${orgId}
              AND t."createdAt" >= ${from}
              AND t."createdAt" < ${to}
            GROUP BY date_trunc('day', t."createdAt")
            ORDER BY date ASC
        `;
        return rows.map((r) => ({
            date: r.date.toISOString().slice(0, 10),
            costUsd: Number(r.costUsd ?? 0),
            tokens: Number(r.tokens ?? 0),
            turns: Number(r.turns ?? 0),
        }));
    }
}
