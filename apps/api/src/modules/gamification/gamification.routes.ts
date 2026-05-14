import type { FastifyPluginAsync } from "fastify";
import { GamificationService } from "./gamification.service.js";

export const gamificationRoutes: FastifyPluginAsync = async (fastify) => {
    const svc = new GamificationService();

    // GET /gamification/ranking
    fastify.get("/ranking", { onRequest: [fastify.verifyJWT] }, async (req) => {
        const { orgId } = req.user as { orgId: string };
        const { period } = req.query as { period?: "week" | "month" | "alltime" };
        return svc.getRanking(orgId, period ?? "month");
    });

    // GET /gamification/achievements
    fastify.get("/achievements", { onRequest: [fastify.verifyJWT] }, async (req) => {
        const { orgId, id: userId } = req.user as { orgId: string; id: string };
        return svc.getUserAchievements(userId, orgId);
    });

    // GET /gamification/achievements/:userId
    fastify.get("/achievements/:userId", { onRequest: [fastify.verifyJWT] }, async (req) => {
        const { orgId } = req.user as { orgId: string };
        const { userId } = req.params as { userId: string };
        return svc.getUserAchievements(userId, orgId);
    });

    // POST /gamification/achievements/check
    fastify.post("/achievements/check", { onRequest: [fastify.verifyJWT] }, async (req) => {
        const { orgId, id: userId } = req.user as { orgId: string; id: string };
        return svc.checkAndAwardAchievements(userId, orgId);
    });

    // GET /gamification/goals
    fastify.get("/goals", { onRequest: [fastify.verifyJWT] }, async (req) => {
        const { orgId, id: userId } = req.user as { orgId: string; id: string };
        return svc.getGoals(userId, orgId);
    });

    // POST /gamification/goals
    fastify.post("/goals", { onRequest: [fastify.verifyJWT] }, async (req, reply) => {
        const { orgId, id: userId } = req.user as { orgId: string; id: string };
        const body = req.body as { title: string; metric: string; target: number; period: string; startDate: string; endDate: string };
        const goal = await svc.createGoal({
            ...body,
            userId,
            orgId,
            startDate: new Date(body.startDate ?? Date.now()),
            endDate: new Date(body.endDate ?? Date.now() + 30 * 24 * 60 * 60 * 1000),
            period: body.period ?? "month",
        });
        return reply.status(201).send(goal);
    });

    // GET /gamification/stats
    fastify.get("/stats", { onRequest: [fastify.verifyJWT] }, async (req) => {
        const { orgId } = req.user as { orgId: string };
        return svc.getOrgStats(orgId);
    });
};
