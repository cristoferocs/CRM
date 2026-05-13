import { prisma } from "../../lib/prisma.js";

// ---------------------------------------------------------------------------
// Achievement definitions (mapped to valid AchievementType enum values)
// ---------------------------------------------------------------------------

const ACHIEVEMENT_DEFS = [
    { key: "FIRST_DEAL_WON", title: "Primeiro Fechamento!", description: "Fechou o primeiro deal", icon: "🏆", points: 100 },
    { key: "DEAL_STREAK", title: "Negociador Experiente", description: "Fechou 10 deals seguidos", icon: "💼", points: 500 },
    { key: "REVENUE_MILESTONE", title: "R$ 100K em vendas", description: "Gerou R$ 100.000 em receita", icon: "💰", points: 1000 },
    { key: "FAST_CLOSER", title: "Fechador Rápido", description: "Fechou um deal em menos de 24h", icon: "⚡", points: 300 },
    { key: "RESPONSE_MASTER", title: "Mestre do Atendimento", description: "Respondeu em menos de 5 min 10 vezes", icon: "🎯", points: 400 },
    { key: "OBJECTION_CRUSHER", title: "Superador de Objeções", description: "Converteu 5 deals com objeções", icon: "🥊", points: 500 },
    { key: "AI_DELEGATOR", title: "Maestro da IA", description: "Delegou 20 atendimentos para agentes IA", icon: "🤖", points: 600 },
    { key: "TOP_PERFORMER", title: "Top Performer", description: "Ficou em 1º lugar por 3 meses", icon: "🏅", points: 1500 },
    { key: "COMEBACK_KID", title: "De Volta por Cima", description: "Recuperou um deal perdido", icon: "🔄", points: 800 },
];

// ---------------------------------------------------------------------------

export class GamificationService {

    // -------------------------------------------------------------------------
    // Rankings
    // -------------------------------------------------------------------------

    async getRanking(orgId: string, period: "week" | "month" | "alltime" = "month") {
        const now = new Date();
        const periodStart = period === "week"
            ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
            : period === "month"
                ? new Date(now.getFullYear(), now.getMonth(), 1)
                : new Date(0);

        const users = await prisma.user.findMany({
            where: { orgId, isActive: true },
            select: {
                id: true, name: true, avatar: true, role: true,
                achievements: { select: { points: true } },
                deals: {
                    where: { closedAt: { gte: periodStart, not: null } },
                    select: { value: true, closedAt: true },
                },
                activities: {
                    where: { completedAt: { gte: periodStart } },
                    select: { type: true },
                },
            },
        });

        const ranked = users.map(user => {
            const achievementPoints = user.achievements.reduce((s: number, a: { points: number }) => s + a.points, 0);
            const dealsWon = user.deals.filter(d => d.closedAt).length;
            const revenue = user.deals.reduce((s: number, d: { value: unknown }) => s + Number(d.value ?? 0), 0);
            const activitiesCompleted = user.activities.length;
            const activityPoints = activitiesCompleted * 5;
            const dealPoints = dealsWon * 50;
            const revenuePoints = Math.floor(revenue / 100);
            const totalPoints = achievementPoints + activityPoints + dealPoints + revenuePoints;

            return {
                id: user.id, name: user.name, avatar: user.avatar, role: user.role,
                totalPoints, achievementPoints, dealsWon, revenue, activitiesCompleted, period,
            };
        }).sort((a, b) => b.totalPoints - a.totalPoints)
            .map((u, i) => ({ ...u, rank: i + 1 }));

        return ranked;
    }

    // -------------------------------------------------------------------------
    // Achievements
    // -------------------------------------------------------------------------

    async getUserAchievements(userId: string, orgId: string) {
        const achievements = await prisma.achievement.findMany({ where: { userId, orgId }, orderBy: { unlockedAt: "desc" } });
        const earned = new Set(achievements.map(a => a.type));
        return {
            earned: achievements,
            available: ACHIEVEMENT_DEFS.filter(d => !earned.has(d.key as never)),
            totalPoints: achievements.reduce((s, a) => s + a.points, 0),
        };
    }

    async checkAndAwardAchievements(userId: string, orgId: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                achievements: { select: { type: true } },
                deals: { where: { closedAt: { not: null } }, select: { value: true } },
                activities: { where: { completedAt: { not: null } }, select: { id: true } },
            },
        });
        if (!user) return [];

        const earned = new Set(user.achievements.map(a => a.type));
        const dealsWon = user.deals.length;
        const revenue = user.deals.reduce((s, d) => s + Number(d.value ?? 0), 0);
        const activitiesCount = user.activities.length;

        const newAchievements: typeof ACHIEVEMENT_DEFS = [];

        for (const def of ACHIEVEMENT_DEFS) {
            if (earned.has(def.key as never)) continue;
            let unlocked = false;
            switch (def.key) {
                case "FIRST_DEAL_WON": unlocked = dealsWon >= 1; break;
                case "DEAL_STREAK": unlocked = dealsWon >= 10; break;
                case "REVENUE_MILESTONE": unlocked = revenue >= 100_000; break;
                case "ACTIVITIES_COMPLETED": unlocked = activitiesCount >= 100; break;
            }
            if (unlocked) newAchievements.push(def);
        }

        if (newAchievements.length > 0) {
            await prisma.achievement.createMany({
                data: newAchievements.map(a => ({
                    userId, orgId, type: a.key as never, title: a.title, description: a.description,
                    icon: a.icon, points: a.points,
                })),
                skipDuplicates: true,
            });
        }

        return newAchievements;
    }

    // -------------------------------------------------------------------------
    // Goals
    // -------------------------------------------------------------------------

    async getGoals(userId: string, orgId: string) {
        return prisma.goal.findMany({ where: { userId, orgId }, orderBy: { endDate: "asc" } });
    }

    async createGoal(data: { userId: string; orgId: string; title: string; metric: string; target: number; period: string; startDate: Date; endDate: Date }) {
        return prisma.goal.create({
            data: { ...data, current: 0 },
        });
    }

    async updateGoalProgress(userId: string, metric: string, amount: number, orgId: string) {
        const goals = await prisma.goal.findMany({
            where: { userId, orgId, metric, isActive: true },
        });
        for (const goal of goals) {
            const newCurrent = goal.current + amount;
            const completed = newCurrent >= goal.target;
            await prisma.goal.update({ where: { id: goal.id }, data: { current: newCurrent, ...(completed ? { isActive: false } : {}) } });
            if (completed) {
                await this.checkAndAwardAchievements(userId, orgId);
            }
        }
    }

    async getOrgStats(orgId: string) {
        const [totalAchievements, topUsers] = await Promise.all([
            prisma.achievement.count({ where: { orgId } }),
            this.getRanking(orgId, "month"),
        ]);
        return { totalAchievements, leaderboard: topUsers.slice(0, 5) };
    }
}
