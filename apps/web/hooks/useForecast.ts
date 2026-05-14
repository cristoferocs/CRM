"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface ForecastFactor {
    id: string;
    label: string;
    impact: number; // signed [-1, 1]
    explanation: string;
}

export interface DealForecast {
    dealId: string;
    title: string;
    valueUsd: number;
    currency: string;
    stageId: string;
    stageName: string;
    ownerId: string | null;
    contactId: string | null;
    probability: number;
    expectedRevenueUsd: number;
    factors: ForecastFactor[];
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

export function usePipelineForecast(pipelineId: string | null | undefined, periodEnd?: Date) {
    return useQuery({
        queryKey: ["pipeline", "forecast", pipelineId, periodEnd?.toISOString()],
        queryFn: async () => {
            if (!pipelineId) throw new Error("pipelineId required");
            const { data } = await api.get<PipelineForecast>("/pipeline/forecast", {
                params: {
                    pipelineId,
                    ...(periodEnd ? { periodEnd: periodEnd.toISOString() } : {}),
                },
            });
            return data;
        },
        enabled: !!pipelineId,
        staleTime: 1000 * 60 * 2,
    });
}

export function useDealForecast(dealId: string | null | undefined) {
    return useQuery({
        queryKey: ["pipeline", "deal-forecast", dealId],
        queryFn: async () => {
            if (!dealId) throw new Error("dealId required");
            const { data } = await api.get<DealForecast>(`/pipeline/deals/${dealId}/forecast`);
            return data;
        },
        enabled: !!dealId,
        staleTime: 1000 * 60,
    });
}
