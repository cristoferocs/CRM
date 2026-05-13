import { prisma } from "../../../lib/prisma.js";
import { analyzeConversation } from "./analyzers/conversation.analyzer.js";
import { learnObjections } from "./analyzers/objection.analyzer.js";
import { learnBestApproaches } from "./analyzers/approach.analyzer.js";

export class InsightsService {
    // -------------------------------------------------------------------------
    // Insights
    // -------------------------------------------------------------------------

    list(orgId: string, filters: { type?: string; since?: string }) {
        const where: Record<string, unknown> = { orgId };
        if (filters.type) where["type"] = filters.type;
        if (filters.since) where["createdAt"] = { gte: new Date(filters.since) };
        return prisma.aIInsight.findMany({
            where: where as never,
            orderBy: { createdAt: "desc" },
        });
    }

    analyzeConversation(conversationId: string, orgId: string) {
        return analyzeConversation(conversationId, orgId);
    }

    // -------------------------------------------------------------------------
    // Objections & Approaches
    // -------------------------------------------------------------------------

    getObjections(orgId: string) {
        return prisma.aITrainingData.findMany({
            where: { orgId, type: "OBJECTION_RESPONSE" },
            orderBy: { createdAt: "desc" },
        });
    }

    async learnObjections(orgId: string, period?: string) {
        return learnObjections(orgId, period);
    }

    getApproaches(orgId: string) {
        return prisma.aIInsight.findMany({
            where: { orgId, type: "BEST_APPROACH" },
            orderBy: { createdAt: "desc" },
        });
    }

    async learnApproaches(orgId: string) {
        return learnBestApproaches(orgId);
    }

    // -------------------------------------------------------------------------
    // Dashboard
    // -------------------------------------------------------------------------

    async dashboard(orgId: string) {
        const [totalInsights, byType, recentObjections, recentApproaches] =
            await Promise.all([
                prisma.aIInsight.count({ where: { orgId } }),
                prisma.aIInsight.groupBy({
                    by: ["type"],
                    _count: { id: true },
                    where: { orgId },
                }),
                prisma.aIInsight.findMany({
                    where: { orgId, type: "OBJECTION" },
                    orderBy: { createdAt: "desc" },
                    take: 5,
                    select: { title: true, content: true, createdAt: true },
                }),
                prisma.aIInsight.findFirst({
                    where: { orgId, type: "BEST_APPROACH" },
                    orderBy: { createdAt: "desc" },
                    select: { content: true, createdAt: true },
                }),
            ]);

        return {
            totalInsights,
            byType: byType.map((b) => ({ type: b.type, count: b._count.id })),
            recentObjections,
            latestApproach: recentApproaches
                ? JSON.parse(recentApproaches.content as string)
                : null,
        };
    }

    // -------------------------------------------------------------------------
    // Training Data
    // -------------------------------------------------------------------------

    listTrainingData(orgId: string, type?: string) {
        return prisma.aITrainingData.findMany({
            where: { orgId, ...(type ? { type: type as never } : {}) },
            orderBy: { createdAt: "desc" },
        });
    }

    createTrainingData(
        data: { type: string; input: string; output: string },
        orgId: string,
    ) {
        return prisma.aITrainingData.create({
            data: { ...data, orgId } as never,
        });
    }

    async validateTrainingData(id: string, validatedBy: string, orgId: string) {
        const existing = await prisma.aITrainingData.findFirst({ where: { id, orgId } });
        if (!existing) {
            const err = new Error("Dado de treinamento não encontrado") as Error & {
                statusCode: number;
            };
            err.statusCode = 404;
            throw err;
        }
        return prisma.aITrainingData.update({
            where: { id },
            data: { isValidated: true, validatedBy },
        });
    }
}
