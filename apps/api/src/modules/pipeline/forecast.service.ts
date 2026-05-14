/**
 * Pipeline forecast service — produces an explainable probability for
 * each open deal closing by a target date, plus pipeline-level totals.
 *
 * The "explainable" half is what differentiates this from RD/Pipedrive
 * AI scoring: every percentage point is sourced from a named factor
 * (see ../../lib/forecast/factors.ts) so a sales manager can ask
 * "why?" and get a real answer instead of a vibe.
 *
 * Aggregation strategy:
 *   - dealValue * probability = expected revenue contribution
 *   - sum across open deals = pipeline expected revenue
 *   - confidence is derived from data density (>= 30 closed deals in
 *     the last 90 days = high; 10-29 = medium; < 10 = low). A salesperson
 *     should treat low-confidence forecasts as directional only.
 */
import { prisma } from "../../lib/prisma.js";
import { evaluateFactors, type Factor } from "../../lib/forecast/factors.js";

export interface DealForecast {
    dealId: string;
    title: string;
    valueUsd: number;
    currency: string;
    stageId: string;
    stageName: string;
    ownerId: string | null;
    contactId: string | null;
    /** [0, 1] probability of closing by periodEnd. */
    probability: number;
    /** valueUsd × probability. */
    expectedRevenueUsd: number;
    factors: Factor[];
    periodEnd: string;
}

export interface PipelineForecast {
    pipelineId: string;
    periodEnd: string;
    confidence: "low" | "medium" | "high";
    closedSampleSize: number;
    deals: DealForecast[];
    totals: {
        openDeals: number;
        totalValueUsd: number;
        expectedRevenueUsd: number;
        weightedProbability: number;
    };
    byStage: Array<{
        stageId: string;
        stageName: string;
        deals: number;
        expectedRevenueUsd: number;
    }>;
}

export class ForecastService {
    /** Forecast a single deal, used by the deal drawer / detail page. */
    async forecastDeal(dealId: string, orgId: string, periodEnd: Date = defaultPeriodEnd()): Promise<DealForecast | null> {
        const deal = await prisma.deal.findFirst({
            where: { id: dealId, orgId, isActive: true, closedAt: null },
            include: {
                stage: { select: { id: true, name: true, probability: true, avgDaysInStage: true } },
                contact: { select: { id: true } },
            },
        });
        if (!deal) return null;
        return this.buildDealForecast(deal, periodEnd);
    }

    /** Forecast every open deal in a pipeline. */
    async forecastPipeline(
        pipelineId: string,
        orgId: string,
        periodEnd: Date = defaultPeriodEnd(),
    ): Promise<PipelineForecast> {
        const deals = await prisma.deal.findMany({
            where: { pipelineId, orgId, isActive: true, closedAt: null },
            include: {
                stage: { select: { id: true, name: true, probability: true, avgDaysInStage: true } },
                contact: { select: { id: true } },
            },
        });

        const forecasts = await Promise.all(deals.map((d) => this.buildDealForecast(d, periodEnd)));

        const totalValueUsd = forecasts.reduce((sum, f) => sum + f.valueUsd, 0);
        const expectedRevenueUsd = forecasts.reduce((sum, f) => sum + f.expectedRevenueUsd, 0);
        const weightedProbability = totalValueUsd > 0 ? expectedRevenueUsd / totalValueUsd : 0;

        // Group expected revenue per stage for a stacked bar in the UI.
        const byStageMap = new Map<string, { stageId: string; stageName: string; deals: number; expectedRevenueUsd: number }>();
        for (const f of forecasts) {
            const cur = byStageMap.get(f.stageId) ?? {
                stageId: f.stageId,
                stageName: f.stageName,
                deals: 0,
                expectedRevenueUsd: 0,
            };
            cur.deals += 1;
            cur.expectedRevenueUsd += f.expectedRevenueUsd;
            byStageMap.set(f.stageId, cur);
        }
        const byStage = Array.from(byStageMap.values()).sort(
            (a, b) => b.expectedRevenueUsd - a.expectedRevenueUsd,
        );

        const closedSampleSize = await this.closedDealCountLast90d(pipelineId, orgId);

        return {
            pipelineId,
            periodEnd: periodEnd.toISOString(),
            confidence: deriveConfidence(closedSampleSize),
            closedSampleSize,
            deals: forecasts.sort((a, b) => b.expectedRevenueUsd - a.expectedRevenueUsd),
            totals: {
                openDeals: forecasts.length,
                totalValueUsd,
                expectedRevenueUsd,
                weightedProbability,
            },
            byStage,
        };
    }

    // -----------------------------------------------------------------------

    private async buildDealForecast(
        deal: {
            id: string;
            title: string;
            value: { toString(): string };
            currency: string;
            stageId: string;
            stageEnteredAt: Date;
            ownerId: string | null;
            contactId: string | null;
            lastActivityAt: Date;
            isRotting: boolean;
            aiProbability: number | null;
            expectedCloseAt: Date | null;
            activeAgentSessionId: string | null;
            stage: { id: string; name: string; probability: number; avgDaysInStage: number | null };
            contact: { id: string } | null;
        },
        periodEnd: Date,
    ): Promise<DealForecast> {
        const now = Date.now();
        const valueUsd = Number(deal.value.toString());
        const daysInCurrentStage = Math.max(
            0,
            (now - new Date(deal.stageEnteredAt).getTime()) / 86_400_000,
        );
        const daysSinceLastActivity = Math.max(
            0,
            Math.floor((now - new Date(deal.lastActivityAt).getTime()) / 86_400_000),
        );
        const daysToExpectedClose = deal.expectedCloseAt
            ? Math.floor((new Date(deal.expectedCloseAt).getTime() - now) / 86_400_000)
            : null;
        const inboundMessages7d = deal.contact
            ? await this.countInboundMessages(deal.contact.id, 7)
            : 0;

        const { probability, factors } = evaluateFactors({
            stageProbability: deal.stage.probability,
            avgDaysInStage: deal.stage.avgDaysInStage,
            daysInCurrentStage,
            daysSinceLastActivity,
            isRotting: deal.isRotting,
            aiProbability: deal.aiProbability,
            daysToExpectedClose,
            valueUsd,
            inboundMessages7d,
            hasActiveAgent: !!deal.activeAgentSessionId,
        });

        // Apply a soft penalty if expectedCloseAt is past periodEnd —
        // unlikely to close within the requested window.
        let effectiveProb = probability;
        if (deal.expectedCloseAt && deal.expectedCloseAt > periodEnd) {
            effectiveProb *= 0.6;
        }

        return {
            dealId: deal.id,
            title: deal.title,
            valueUsd,
            currency: deal.currency,
            stageId: deal.stageId,
            stageName: deal.stage.name,
            ownerId: deal.ownerId,
            contactId: deal.contactId,
            probability: Math.round(effectiveProb * 10_000) / 10_000,
            expectedRevenueUsd: Math.round(valueUsd * effectiveProb * 100) / 100,
            factors,
            periodEnd: periodEnd.toISOString(),
        };
    }

    private async countInboundMessages(contactId: string, daysBack: number): Promise<number> {
        const since = new Date(Date.now() - daysBack * 86_400_000);
        return prisma.message.count({
            where: {
                direction: "INBOUND",
                sentAt: { gte: since },
                conversation: { contactId },
            },
        });
    }

    private async closedDealCountLast90d(pipelineId: string, orgId: string): Promise<number> {
        const since = new Date(Date.now() - 90 * 86_400_000);
        return prisma.deal.count({
            where: { pipelineId, orgId, closedAt: { gte: since } },
        });
    }
}

function defaultPeriodEnd(): Date {
    // End of the current calendar quarter (UTC).
    const now = new Date();
    const year = now.getUTCFullYear();
    const quarter = Math.floor(now.getUTCMonth() / 3);
    const endMonth = quarter * 3 + 2; // last month of quarter
    return new Date(Date.UTC(year, endMonth + 1, 0, 23, 59, 59));
}

function deriveConfidence(closedSample: number): "low" | "medium" | "high" {
    if (closedSample >= 30) return "high";
    if (closedSample >= 10) return "medium";
    return "low";
}
