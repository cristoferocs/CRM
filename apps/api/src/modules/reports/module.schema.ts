import { z } from "zod";

export const reportsHealthResponseSchema = z.object({
    module: z.literal("reports"),
    status: z.literal("ok")
});

export type ReportsHealthResponse = z.infer<typeof reportsHealthResponseSchema>;

export const dashboardQuerySchema = z.object({
    range: z.enum(["today", "week", "month", "30d"]).default("month"),
});

export const dashboardResponseSchema = z.object({
    kpis: z.object({
        totalLeads: z.number(),
        totalLeadsDelta: z.number(),
        openConversations: z.number(),
        openConversationsDelta: z.number(),
        monthRevenue: z.number(),
        monthRevenueDelta: z.number(),
        conversionRate: z.number(),
        conversionRateDelta: z.number(),
    }),
    leadsByDay: z.array(z.object({ date: z.string(), count: z.number() })),
    revenueByMonth: z.array(z.object({ month: z.string(), value: z.number() })),
    recentConversations: z.array(z.object({
        id: z.string(),
        contact: z.object({ name: z.string(), avatar: z.string().nullable() }),
        channel: z.string(),
        lastMessage: z.string().nullable(),
        lastMessageAt: z.string().nullable(),
        unreadCount: z.number(),
    })),
    openOpportunities: z.object({
        count: z.number(),
        totalValue: z.number(),
        weightedProbability: z.number(),
    }),
    closingDeals: z.array(z.object({
        id: z.string(),
        title: z.string(),
        value: z.number().nullable(),
        expectedCloseDate: z.string().nullable(),
        contact: z.object({ name: z.string() }).nullable(),
        probability: z.number().nullable(),
    })),
    recentActivities: z.array(z.object({
        id: z.string(),
        type: z.string(),
        description: z.string(),
        createdAt: z.string(),
        contact: z.object({ name: z.string() }).nullable().optional(),
    })),
});

export type DashboardRange = z.infer<typeof dashboardQuerySchema>["range"];
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;