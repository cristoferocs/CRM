import { prisma } from "../../lib/prisma.js";
import { fireAutomation } from "../automations/automation-dispatcher.js";

// ---------------------------------------------------------------------------
// Scoring weights
// ---------------------------------------------------------------------------

const WEIGHTS = {
    hasEmail: 10,
    hasPhone: 8,
    hasCompany: 5,
    hasAvatar: 2,
    hasAddress: 3,
    leadSource_paid: 15,
    leadSource_referral: 20,
    leadSource_organic: 10,
    dealCount: 8,           // per deal
    dealWon: 25,            // per won deal
    openConversations: 5,   // per open conversation
    recentActivity: 10,     // activity in last 7 days
    highValueDeal: 15,      // any deal > R$ 5000
    customFieldScore: 5,    // any custom field filled
};

// ---------------------------------------------------------------------------

export class LeadScoringService {

    async scoreContact(contactId: string, orgId: string): Promise<{
        score: number;
        temperature: "COLD" | "WARM" | "HOT";
        breakdown: Record<string, number>;
    }> {
        const contact = await prisma.contact.findFirst({
            where: { id: contactId, orgId },
            include: {
                deals: { select: { value: true, closedAt: true } },
                conversations: { where: { status: "OPEN" }, select: { id: true } },
                activities: {
                    where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
                    select: { id: true },
                },
            },
        });

        if (!contact) throw Object.assign(new Error("Contact not found"), { statusCode: 404 });

        const config = await prisma.leadScoringConfig.findFirst({ where: { orgId, isActive: true } });
        // demographicRules stores custom weights as a JSON object override
        const demographicOverrides = (config?.demographicRules as Record<string, number> | null) ?? {};
        const w: Record<string, number> = { ...WEIGHTS, ...demographicOverrides };

        const breakdown: Record<string, number> = {};
        let score = 0;

        // Profile completeness
        if (contact.email) { breakdown.hasEmail = w.hasEmail ?? WEIGHTS.hasEmail; score += breakdown.hasEmail; }
        if (contact.phone) { breakdown.hasPhone = w.hasPhone ?? WEIGHTS.hasPhone; score += breakdown.hasPhone; }
        const cf = contact.customFields as Record<string, unknown> | null;
        if (cf?.company) { breakdown.hasCompany = w.hasCompany ?? WEIGHTS.hasCompany; score += breakdown.hasCompany; }
        if (contact.avatar) { breakdown.hasAvatar = w.hasAvatar ?? WEIGHTS.hasAvatar; score += breakdown.hasAvatar; }

        // Custom fields filled count
        const filledFields = Object.values(cf ?? {}).filter(v => v !== null && v !== "" && v !== undefined).length;
        if (filledFields > 2) {
            breakdown.customFields = (w.customFieldScore ?? WEIGHTS.customFieldScore) * Math.min(filledFields, 5);
            score += breakdown.customFields;
        }

        // Source bonus
        const sourceMap: Record<string, number> = {
            PAID_TRAFFIC: w["leadSource_paid"] ?? WEIGHTS.leadSource_paid,
            REFERRAL: w["leadSource_referral"] ?? WEIGHTS.leadSource_referral,
            ORGANIC: w["leadSource_organic"] ?? WEIGHTS.leadSource_organic,
        };
        if (contact.source && sourceMap[contact.source] !== undefined) {
            const srcScore = sourceMap[contact.source] as number;
            breakdown.source = srcScore;
            score += srcScore;
        }

        // Deals
        if (contact.deals.length > 0) {
            breakdown.dealCount = contact.deals.length * (w.dealCount ?? WEIGHTS.dealCount);
            score += breakdown.dealCount;
            const wonCount = contact.deals.filter(d => d.closedAt !== null).length;
            if (wonCount > 0) {
                breakdown.wonDeals = wonCount * (w.dealWon ?? WEIGHTS.dealWon);
                score += breakdown.wonDeals;
            }
            const highValue = contact.deals.some(d => Number(d.value ?? 0) > 5000);
            if (highValue) {
                breakdown.highValueDeal = w.highValueDeal ?? WEIGHTS.highValueDeal;
                score += breakdown.highValueDeal;
            }
        }

        // Engagement
        if (contact.conversations.length > 0) {
            breakdown.openConversations = contact.conversations.length * (w.openConversations ?? WEIGHTS.openConversations);
            score += breakdown.openConversations;
        }
        if (contact.activities.length > 0) {
            breakdown.recentActivity = w.recentActivity ?? WEIGHTS.recentActivity;
            score += breakdown.recentActivity;
        }

        // Cap at 100
        score = Math.min(100, Math.max(0, score));
        const temperature: "COLD" | "WARM" | "HOT" = score >= 60 ? "HOT" : score >= 30 ? "WARM" : "COLD";

        // Persist
        const history = (contact.scoreHistory as Array<{ score: number; at: string }> | null) ?? [];
        history.push({ score, at: new Date().toISOString() });
        if (history.length > 30) history.shift(); // keep last 30

        await prisma.contact.update({
            where: { id: contactId },
            data: { leadScore: score, leadTemperature: temperature, lastScoredAt: new Date(), scoreHistory: history as never },
        });

        if (contact.leadScore !== score) {
            fireAutomation("LEAD_SCORE_CHANGED", {
                contactId,
                previousScore: contact.leadScore ?? 0,
                score,
                temperature,
            }, orgId);
        }

        return { score, temperature, breakdown };
    }

    async scoreAllContacts(orgId: string): Promise<{ processed: number; errors: number }> {
        const contacts = await prisma.contact.findMany({
            where: { orgId, isActive: true },
            select: { id: true },
        });
        // Run in parallel chunks. Sequential awaits would take ~N seconds for
        // N contacts (each scoreContact is a few DB round-trips); chunking
        // at 25 keeps the connection pool happy while shrinking total time
        // by ~20-25x for orgs with 10k+ contacts.
        const CONCURRENCY = Number(process.env.LEAD_SCORING_CONCURRENCY ?? 25);
        let errors = 0;
        for (let i = 0; i < contacts.length; i += CONCURRENCY) {
            const chunk = contacts.slice(i, i + CONCURRENCY);
            const results = await Promise.allSettled(
                chunk.map((c) => this.scoreContact(c.id, orgId)),
            );
            errors += results.filter((r) => r.status === "rejected").length;
        }
        return { processed: contacts.length - errors, errors };
    }

    async getConfig(orgId: string) {
        return prisma.leadScoringConfig.findFirst({ where: { orgId } });
    }

    async upsertConfig(orgId: string, data: { weights?: Record<string, number>; hotThreshold?: number; warmThreshold?: number; isActive?: boolean }) {
        const existing = await prisma.leadScoringConfig.findFirst({ where: { orgId } });
        const updateData = {
            isActive: data.isActive,
            hotThreshold: data.hotThreshold,
            warmThreshold: data.warmThreshold,
            // Store custom weights in demographicRules as a JSON override map
            demographicRules: (data.weights ?? undefined) as never,
        };
        if (existing) {
            return prisma.leadScoringConfig.update({ where: { id: existing.id }, data: updateData });
        }
        return prisma.leadScoringConfig.create({
            data: { orgId, ...updateData, isActive: true },
        });
    }

    async getLeaderboard(orgId: string, limit = 20) {
        return prisma.contact.findMany({
            where: { orgId, isActive: true, leadScore: { gt: 0 } },
            orderBy: { leadScore: "desc" },
            take: limit,
            select: { id: true, name: true, avatar: true, leadScore: true, leadTemperature: true, lastScoredAt: true, type: true },
        });
    }
}
