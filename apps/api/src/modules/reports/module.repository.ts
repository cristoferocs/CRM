import { prisma } from "../../lib/prisma.js";
import type { DashboardRange, DashboardResponse, ReportsHealthResponse } from "./module.schema.js";

function startOfDay(date: Date) {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
}

function addDays(date: Date, days: number) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
}

function getRangeDates(range: DashboardRange) {
    const now = new Date();
    if (range === "today") {
        const currentStart = startOfDay(now);
        return {
            currentStart,
            previousStart: addDays(currentStart, -1),
            previousEnd: currentStart,
        };
    }

    if (range === "week") {
        const currentStart = addDays(startOfDay(now), -7);
        return {
            currentStart,
            previousStart: addDays(currentStart, -7),
            previousEnd: currentStart,
        };
    }

    const days = range === "30d" ? 30 : 30;
    const currentStart = range === "month"
        ? new Date(now.getFullYear(), now.getMonth(), 1)
        : addDays(startOfDay(now), -days);
    const previousStart = range === "month"
        ? new Date(now.getFullYear(), now.getMonth() - 1, 1)
        : addDays(currentStart, -days);
    const previousEnd = range === "month"
        ? new Date(now.getFullYear(), now.getMonth(), 1)
        : currentStart;

    return { currentStart, previousStart, previousEnd };
}

function percentDelta(current: number, previous: number) {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
}

function dateKey(date: Date) {
    return date.toISOString().slice(0, 10);
}

function monthKey(date: Date) {
    return date.toISOString().slice(0, 7);
}

function toIso(date: Date | null | undefined) {
    return date ? date.toISOString() : null;
}

export class ReportsRepository {
    async health(): Promise<ReportsHealthResponse> {
        return {
            module: "reports",
            status: "ok"
        };
    }

    async dashboard(orgId: string, range: DashboardRange): Promise<DashboardResponse> {
        const { currentStart, previousStart, previousEnd } = getRangeDates(range);
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const sixMonthsStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        const chartStart = addDays(startOfDay(now), -29);

        const [
            currentLeads,
            previousLeads,
            currentOpenConversations,
            previousOpenConversations,
            totalContacts,
            customers,
            paidThisMonth,
            paidPreviousMonth,
            leadsForChart,
            paymentsForChart,
            recentConversations,
            closingDeals,
            recentActivities,
        ] = await Promise.all([
            prisma.contact.count({ where: { orgId, isActive: true, type: "LEAD", createdAt: { gte: currentStart } } }),
            prisma.contact.count({ where: { orgId, isActive: true, type: "LEAD", createdAt: { gte: previousStart, lt: previousEnd } } }),
            prisma.conversation.count({ where: { orgId, status: { in: ["OPEN", "PENDING", "BOT"] }, createdAt: { gte: currentStart } } }),
            prisma.conversation.count({ where: { orgId, status: { in: ["OPEN", "PENDING", "BOT"] }, createdAt: { gte: previousStart, lt: previousEnd } } }),
            prisma.contact.count({ where: { orgId, isActive: true } }),
            prisma.contact.count({ where: { orgId, isActive: true, type: "CUSTOMER" } }),
            prisma.payment.aggregate({ where: { orgId, status: "PAID", paidAt: { gte: monthStart } }, _sum: { amount: true } }),
            prisma.payment.aggregate({ where: { orgId, status: "PAID", paidAt: { gte: previousMonthStart, lt: monthStart } }, _sum: { amount: true } }),
            prisma.contact.findMany({
                where: { orgId, isActive: true, type: "LEAD", createdAt: { gte: chartStart } },
                select: { createdAt: true },
            }),
            prisma.payment.findMany({
                where: { orgId, status: "PAID", paidAt: { gte: sixMonthsStart } },
                select: { amount: true, paidAt: true, createdAt: true },
            }),
            prisma.conversation.findMany({
                where: { orgId },
                orderBy: { lastMessageAt: "desc" },
                take: 5,
                select: {
                    id: true,
                    channel: true,
                    unreadCount: true,
                    lastMessageAt: true,
                    contact: { select: { name: true, avatar: true } },
                    messages: { select: { content: true, sentAt: true }, orderBy: { sentAt: "desc" }, take: 1 },
                },
            }),
            prisma.deal.findMany({
                where: { orgId, isActive: true, closedAt: null, expectedCloseAt: { not: null } },
                orderBy: { expectedCloseAt: "asc" },
                take: 5,
                select: {
                    id: true,
                    title: true,
                    value: true,
                    expectedCloseAt: true,
                    probability: true,
                    contact: { select: { name: true } },
                },
            }),
            prisma.activity.findMany({
                where: { orgId },
                orderBy: { createdAt: "desc" },
                take: 6,
                select: {
                    id: true,
                    type: true,
                    title: true,
                    description: true,
                    createdAt: true,
                    contact: { select: { name: true } },
                },
            }),
        ]);

        const leadsByDayCounts = new Map<string, number>();
        for (let index = 0; index < 30; index += 1) {
            leadsByDayCounts.set(dateKey(addDays(chartStart, index)), 0);
        }
        for (const lead of leadsForChart) {
            const key = dateKey(lead.createdAt);
            leadsByDayCounts.set(key, (leadsByDayCounts.get(key) ?? 0) + 1);
        }

        const revenueByMonthCounts = new Map<string, number>();
        for (let index = 5; index >= 0; index -= 1) {
            revenueByMonthCounts.set(monthKey(new Date(now.getFullYear(), now.getMonth() - index, 1)), 0);
        }
        for (const payment of paymentsForChart) {
            const key = monthKey(payment.paidAt ?? payment.createdAt);
            revenueByMonthCounts.set(key, (revenueByMonthCounts.get(key) ?? 0) + Number(payment.amount));
        }

        const monthRevenue = Number(paidThisMonth._sum.amount ?? 0);
        const previousMonthRevenue = Number(paidPreviousMonth._sum.amount ?? 0);
        const conversionRate = totalContacts > 0 ? Math.round((customers / totalContacts) * 100) : 0;

        return {
            kpis: {
                totalLeads: currentLeads,
                totalLeadsDelta: percentDelta(currentLeads, previousLeads),
                openConversations: currentOpenConversations,
                openConversationsDelta: percentDelta(currentOpenConversations, previousOpenConversations),
                monthRevenue,
                monthRevenueDelta: percentDelta(monthRevenue, previousMonthRevenue),
                conversionRate,
                conversionRateDelta: 0,
            },
            leadsByDay: Array.from(leadsByDayCounts, ([date, count]) => ({ date, count })),
            revenueByMonth: Array.from(revenueByMonthCounts, ([month, value]) => ({ month, value })),
            recentConversations: recentConversations.map((conversation) => ({
                id: conversation.id,
                contact: conversation.contact,
                channel: conversation.channel.toLowerCase(),
                lastMessage: conversation.messages[0]?.content ?? null,
                lastMessageAt: toIso(conversation.lastMessageAt ?? conversation.messages[0]?.sentAt),
                unreadCount: conversation.unreadCount,
            })),
            closingDeals: closingDeals.map((deal) => ({
                id: deal.id,
                title: deal.title,
                value: Number(deal.value),
                expectedCloseDate: toIso(deal.expectedCloseAt),
                contact: deal.contact,
                probability: deal.probability,
            })),
            recentActivities: recentActivities.map((activity) => ({
                id: activity.id,
                type: activity.type.toLowerCase(),
                description: activity.description ?? activity.title,
                createdAt: activity.createdAt.toISOString(),
                contact: activity.contact,
            })),
        };
    }
}