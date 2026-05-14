"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type HandoffNodeKind = "agent" | "human";

export interface HandoffNode {
    kind: HandoffNodeKind;
    sessionId?: string;
    agentId?: string;
    agentName?: string;
    agentType?: string;
    userId?: string;
    userName?: string;
    startedAt: string;
    endedAt: string | null;
    durationMs: number | null;
    status?: string;
    outcome?: string | null;
    goalAchieved?: boolean | null;
    handoffReason?: string | null;
    turnCount: number;
    totalCostUsd: number;
    totalTokens: number;
    preservedContext: Record<string, unknown>;
}

export interface HandoffTimeline {
    dealId?: string | null;
    conversationId?: string | null;
    nodes: HandoffNode[];
    totals: {
        agents: number;
        durationMs: number;
        costUsd: number;
        tokens: number;
        turns: number;
    };
}

export function useHandoffTimeline(opts: { dealId?: string; conversationId?: string }) {
    const enabled = !!opts.dealId || !!opts.conversationId;
    return useQuery({
        queryKey: ["agents", "timeline", opts],
        queryFn: async () => {
            const { data } = await api.get<HandoffTimeline>("/agents/timeline", {
                params: opts,
            });
            return data;
        },
        enabled,
        staleTime: 1000 * 60,
    });
}
