"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

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
    date: string;
    costUsd: number;
    tokens: number;
    turns: number;
}

export interface ProviderCostRow {
    provider: string;
    totalCostUsd: number;
    totalTokens: number;
    turns: number;
}

export interface OrgCostSummary {
    totalCostUsd: number;
    totalTokens: number;
    totalTurns: number;
    rangeFrom: string;
    rangeTo: string;
    byAgent: AgentCostRow[];
    byProvider: ProviderCostRow[];
    daily: DailyCostPoint[];
    monthToDateUsd: number;
}

export interface BudgetStatus {
    monthToDateUsd: number;
    monthlyBudgetUsd: number | null;
    percentUsed: number | null;
    alertThreshold: number;
    isOverBudget: boolean;
    isApproachingBudget: boolean;
}

export function useAgentCostSummary(opts?: { from?: Date; to?: Date }) {
    const params: Record<string, string> = {};
    if (opts?.from) params.from = opts.from.toISOString();
    if (opts?.to) params.to = opts.to.toISOString();
    return useQuery({
        queryKey: ["agents", "cost", "summary", params],
        queryFn: async () => {
            const { data } = await api.get<OrgCostSummary>("/agents/cost/summary", { params });
            return data;
        },
        staleTime: 1000 * 60, // costs don't move every second
    });
}

export function useAgentBudget() {
    return useQuery({
        queryKey: ["agents", "cost", "budget"],
        queryFn: async () => {
            const { data } = await api.get<BudgetStatus>("/agents/cost/budget");
            return data;
        },
        refetchInterval: 1000 * 120,
    });
}

const USD = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
});

export function formatUsd(value: number | null | undefined): string {
    return USD.format(value ?? 0);
}
