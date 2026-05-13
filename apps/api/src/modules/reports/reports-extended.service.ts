import { prisma } from "../../lib/prisma.js";

function addDays(date: Date, days: number) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
}

function getRangeStart(range: string) {
    const now = new Date();
    const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : 30;
    return addDays(now, -days);
}

// ---------------------------------------------------------------------------

export class ReportsExtendedService {

    // -------------------------------------------------------------------------
    // Funnel
    // -------------------------------------------------------------------------

    async funnel(orgId: string, filters: { pipelineId?: string; range?: string }) {
        const rangeStart = filters.range ? getRangeStart(filters.range) : undefined;

        const pipelines = await prisma.pipeline.findMany({
            where: { orgId, ...(filters.pipelineId ? { id: filters.pipelineId } : {}) },
            include: {
                stages: {
                    orderBy: { order: "asc" },
                    include: {
                        deals: {
                            where: { isActive: true, ...(rangeStart ? { createdAt: { gte: rangeStart } } : {}) },
                            select: { value: true, probability: true, closedAt: true },
                        },
                    },
                },
            },
        });

        return pipelines.map(pipeline => ({
            pipelineId: pipeline.id,
            pipelineName: pipeline.name,
            stages: pipeline.stages.map(stage => ({
                id: stage.id,
                name: stage.name,
                order: stage.order,
                count: stage.deals.length,
                totalValue: stage.deals.reduce((s, d) => s + Number(d.value ?? 0), 0),
                avgValue: stage.deals.length > 0
                    ? stage.deals.reduce((s, d) => s + Number(d.value ?? 0), 0) / stage.deals.length
                    : 0,
                wonCount: stage.deals.filter(d => d.closedAt).length,
            })),
        }));
    }

    // -------------------------------------------------------------------------
    // Forecast
    // -------------------------------------------------------------------------

    async forecast(orgId: string, months = 3) {
        const now = new Date();

        const openDeals = await prisma.deal.findMany({
            where: { orgId, isActive: true, closedAt: null, stage: { isLost: false } },
            select: { value: true, probability: true, expectedCloseAt: true },
        });

        const buckets: Record<string, { expected: number; weighted: number; count: number }> = {};
        for (let i = 0; i < months; i++) {
            const key = new Date(now.getFullYear(), now.getMonth() + i, 1).toISOString().slice(0, 7);
            buckets[key] = { expected: 0, weighted: 0, count: 0 };
        }

        for (const deal of openDeals) {
            if (!deal.expectedCloseAt) continue;
            const key = deal.expectedCloseAt.toISOString().slice(0, 7);
            if (buckets[key]) {
                const val = Number(deal.value ?? 0);
                const prob = (deal.probability ?? 50) / 100;
                buckets[key].expected += val;
                buckets[key].weighted += val * prob;
                buckets[key].count += 1;
            }
        }

        // Historical average for comparison
        const last3MonthsRevenue = await prisma.payment.aggregate({
            where: { orgId, status: "PAID", paidAt: { gte: new Date(now.getFullYear(), now.getMonth() - 3, 1) } },
            _sum: { amount: true },
        });
        const monthlyAvgRevenue = Number(last3MonthsRevenue._sum.amount ?? 0) / 3;

        return {
            forecast: Object.entries(buckets).map(([month, data]) => ({ month, ...data })),
            monthlyAvgRevenue,
            totalExpected: Object.values(buckets).reduce((s, b) => s + b.expected, 0),
            totalWeighted: Object.values(buckets).reduce((s, b) => s + b.weighted, 0),
        };
    }

    // -------------------------------------------------------------------------
    // Team
    // -------------------------------------------------------------------------

    async team(orgId: string, range: string) {
        const rangeStart = getRangeStart(range);

        const users = await prisma.user.findMany({
            where: { orgId, isActive: true },
            select: {
                id: true, name: true, avatar: true, role: true,
                deals: {
                    where: { isActive: true, createdAt: { gte: rangeStart } },
                    select: { value: true, closedAt: true, probability: true },
                },
                activities: {
                    where: { createdAt: { gte: rangeStart } },
                    select: { type: true, completedAt: true },
                },
            },
        });

        return users.map(user => {
            const totalDeals = user.deals.length;
            const wonDeals = user.deals.filter(d => d.closedAt).length;
            const revenue = user.deals.filter(d => d.closedAt).reduce((s: number, d: { value: unknown }) => s + Number(d.value ?? 0), 0);
            const pipeline = user.deals.filter(d => !d.closedAt).reduce((s, d) => s + Number(d.value ?? 0), 0);
            const convRate = totalDeals > 0 ? Math.round((wonDeals / totalDeals) * 100) : 0;
            const completedActivities = user.activities.filter(a => a.completedAt).length;

            return {
                id: user.id, name: user.name, avatar: user.avatar, role: user.role,
                totalDeals, wonDeals, revenue, pipeline, convRate, completedActivities,
            };
        }).sort((a, b) => b.revenue - a.revenue);
    }

    // -------------------------------------------------------------------------
    // Pipeline Health
    // -------------------------------------------------------------------------

    async pipelineHealth(orgId: string, pipelineId?: string) {
        const pipelines = await prisma.pipeline.findMany({
            where: { orgId, ...(pipelineId ? { id: pipelineId } : {}) },
            include: {
                stages: {
                    orderBy: { order: "asc" },
                    include: {
                        deals: {
                            where: { isActive: true, closedAt: null },
                            select: { value: true, probability: true, createdAt: true, expectedCloseAt: true, ownerId: true },
                        },
                    },
                },
            },
        });

        const now = new Date();
        return pipelines.map(pipeline => {
            const allDeals = pipeline.stages.flatMap(s => s.deals);
            const overdueDeals = allDeals.filter(d => d.expectedCloseAt && d.expectedCloseAt < now);
            const rottingDeals = allDeals.filter(d => {
                const age = (now.getTime() - d.createdAt.getTime()) / (1000 * 60 * 60 * 24);
                return age > 14; // 14 days without movement
            });

            return {
                pipelineId: pipeline.id,
                pipelineName: pipeline.name,
                totalDeals: allDeals.length,
                totalValue: allDeals.reduce((s, d) => s + Number(d.value ?? 0), 0),
                overdueCount: overdueDeals.length,
                rottingCount: rottingDeals.length,
                healthScore: Math.max(0, 100 - (overdueDeals.length * 5) - (rottingDeals.length * 3)),
                stages: pipeline.stages.map(s => ({
                    id: s.id, name: s.name, count: s.deals.length,
                    value: s.deals.reduce((sum, d) => sum + Number(d.value ?? 0), 0),
                })),
            };
        });
    }

    // -------------------------------------------------------------------------
    // Channels
    // -------------------------------------------------------------------------

    async channels(orgId: string, range: string) {
        const rangeStart = getRangeStart(range);

        const conversations = await prisma.conversation.findMany({
            where: { orgId, createdAt: { gte: rangeStart } },
            select: {
                channel: true, status: true, createdAt: true,
                messages: { select: { sentAt: true }, orderBy: { sentAt: "asc" }, take: 1 },
            },
        });

        const byChannel: Record<string, { count: number; resolved: number; avgResponseMs: number[]; open: number }> = {};
        for (const conv of conversations) {
            const ch = conv.channel;
            if (!byChannel[ch]) byChannel[ch] = { count: 0, resolved: 0, avgResponseMs: [], open: 0 };
            byChannel[ch].count++;
            if (conv.status === "RESOLVED") byChannel[ch].resolved++;
            if (conv.status === "OPEN") byChannel[ch].open++;
            if (conv.messages[0] && conv.createdAt) {
                const responseMs = conv.messages[0].sentAt.getTime() - conv.createdAt.getTime();
                if (responseMs > 0) byChannel[ch].avgResponseMs.push(responseMs);
            }
        }

        return Object.entries(byChannel).map(([channel, data]) => ({
            channel,
            count: data.count,
            resolved: data.resolved,
            openCount: data.open,
            resolutionRate: data.count > 0 ? Math.round((data.resolved / data.count) * 100) : 0,
            avgResponseMinutes: data.avgResponseMs.length > 0
                ? Math.round(data.avgResponseMs.reduce((s, v) => s + v, 0) / data.avgResponseMs.length / 60_000)
                : 0,
        }));
    }

    // -------------------------------------------------------------------------
    // AI Agents
    // -------------------------------------------------------------------------

    async aiAgents(orgId: string, range: string) {
        const rangeStart = getRangeStart(range);

        const agents = await prisma.aIAgent.findMany({
            where: { orgId, isActive: true },
            select: {
                id: true, name: true, type: true,
                sessions: {
                    where: { startedAt: { gte: rangeStart } },
                    select: { status: true, turnCount: true },
                },
            },
        });

        return agents.map((agent: { id: string; name: string; type: string; sessions: Array<{ status: string; turnCount: number }> }) => {
            const totalSessions = agent.sessions.length;
            const resolved = agent.sessions.filter(s => s.status === "ENDED").length;
            const totalMessages = agent.sessions.reduce((sum: number, s: { turnCount: number }) => sum + s.turnCount, 0);
            return {
                id: agent.id, name: agent.name, type: agent.type,
                totalConversations: totalSessions,
                resolvedConversations: resolved,
                resolutionRate: totalSessions > 0 ? Math.round((resolved / totalSessions) * 100) : 0,
                totalMessages,
                avgMessagesPerConv: totalSessions > 0 ? Math.round(totalMessages / totalSessions) : 0,
            };
        });
    }

    // -------------------------------------------------------------------------
    // Client ROI
    // -------------------------------------------------------------------------

    async clientROI(orgId: string, contactId?: string) {
        const where = { orgId, ...(contactId ? { contactId } : {}) };

        const [deals, payments, activities] = await Promise.all([
            prisma.deal.findMany({ where, select: { value: true, closedAt: true, contactId: true, contact: { select: { name: true } } } }),
            prisma.payment.findMany({ where: { orgId, ...(contactId ? { deal: { contactId } } : {}) }, select: { amount: true, status: true, deal: { select: { contactId: true } } } }),
            prisma.activity.count({ where: { orgId, ...(contactId ? { contactId } : {}), completedAt: { not: null } } }),
        ]);

        if (contactId) {
            const revenue = payments.filter(p => p.status === "PAID").reduce((s, p) => s + Number(p.amount ?? 0), 0);
            const totalDeals = deals.length;
            const wonDeals = deals.filter(d => d.closedAt).length;
            return {
                contactId,
                contactName: deals[0]?.contact?.name ?? "Unknown",
                totalDeals, wonDeals,
                totalRevenue: revenue,
                totalActivities: activities,
                ltv: revenue,
                convRate: totalDeals > 0 ? Math.round((wonDeals / totalDeals) * 100) : 0,
            };
        }

        // Summary across all contacts
        const contactMap: Record<string, { name: string; revenue: number; deals: number; wonDeals: number }> = {};
        for (const deal of deals) {
            if (!deal.contactId) continue;
            if (!contactMap[deal.contactId]) contactMap[deal.contactId] = { name: deal.contact?.name ?? "", revenue: 0, deals: 0, wonDeals: 0 };
            const entry = contactMap[deal.contactId]!;
            entry.deals++;
            if (deal.closedAt) entry.wonDeals++;
        }
        for (const payment of payments) {
            if (payment.status !== "PAID" || !payment.deal?.contactId) continue;
            const cid = payment.deal.contactId;
            const entry = contactMap[cid];
            if (entry) entry.revenue += Number(payment.amount ?? 0);
        }

        return Object.entries(contactMap)
            .map(([id, data]) => ({ contactId: id, ...data }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 20);
    }

    // -------------------------------------------------------------------------
    // Custom Report
    // -------------------------------------------------------------------------

    async custom(orgId: string, config: {
        entity: "contact" | "deal" | "conversation" | "activity";
        filters?: Record<string, unknown>;
        groupBy?: string;
        metric?: string;
        range?: string;
    }) {
        const rangeStart = config.range ? getRangeStart(config.range) : undefined;
        const dateFilter = rangeStart ? { createdAt: { gte: rangeStart } } : {};

        switch (config.entity) {
            case "contact": {
                const contacts = await prisma.contact.groupBy({
                    by: [(config.groupBy as "type" | "source") ?? "type"],
                    where: { orgId, ...dateFilter },
                    _count: true,
                });
                return contacts;
            }
            case "deal": {
                const deals = await prisma.deal.groupBy({
                    by: [(config.groupBy as "stageId" | "ownerId") ?? "stageId"],
                    where: { orgId, isActive: true, ...dateFilter },
                    _count: true,
                    _sum: { value: true },
                });
                return deals;
            }
            case "conversation": {
                const convs = await prisma.conversation.groupBy({
                    by: [(config.groupBy as "channel" | "status") ?? "channel"],
                    where: { orgId, ...dateFilter },
                    _count: true,
                });
                return convs;
            }
            default:
                return [];
        }
    }

    // -------------------------------------------------------------------------
    // Export
    // -------------------------------------------------------------------------

    async export(orgId: string, type: string, range: string) {
        let json: unknown[] = [];

        switch (type) {
            case "funnel": json = await this.funnel(orgId, { range }); break;
            case "team": json = await this.team(orgId, range); break;
            case "channels": json = await this.channels(orgId, range); break;
            case "ai-agents": json = await this.aiAgents(orgId, range); break;
            default: json = [];
        }

        const csv = jsonToCsv(json as Record<string, unknown>[]);
        return { json, csv };
    }
}

// ---------------------------------------------------------------------------
// CSV helper
// ---------------------------------------------------------------------------

function jsonToCsv(rows: Record<string, unknown>[]): string {
    if (rows.length === 0) return "";
    const firstRow = rows[0];
    if (!firstRow) return "";
    const headers = Object.keys(firstRow);
    const lines = [headers.join(",")];
    for (const row of rows) {
        lines.push(headers.map(h => {
            const val = row[h];
            if (val === null || val === undefined) return "";
            const str = String(val);
            return str.includes(",") || str.includes('"') || str.includes("\n")
                ? `"${str.replace(/"/g, '""')}"` : str;
        }).join(","));
    }
    return lines.join("\n");
}
