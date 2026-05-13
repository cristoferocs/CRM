"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PipelineAgent {
    id: string;
    name: string;
    status: string;
    avatar?: string | null;
}

export interface PipelineStage {
    id: string;
    name: string;
    color: string;
    order: number;
    pipelineId: string;
    probability: number | null;
    type: string;
    isWon: boolean;
    isLost: boolean;
    agentId: string | null;
    agentTrigger: string;
    agentGoal: string | null;
    rottingDays: number | null;
    maxDeals: number | null;
    requiredFields: unknown[];
    onEnterActions: unknown[];
    onExitActions: unknown[];
    onRottingActions: unknown[];
    agent: PipelineAgent | null;
}

export interface PipelineDeal {
    id: string;
    title: string;
    value: number | null;
    currency: string;
    stageId: string;
    pipelineId: string;
    contactId: string | null;
    ownerId: string | null;
    probability: number | null;
    aiProbability: number | null;
    isRotting: boolean;
    rottingDays: number;
    activeAgentSessionId: string | null;
    customFields: Record<string, unknown>;
    stageEnteredAt: string;
    expectedCloseAt: string | null;
    closedAt: string | null;
    lastActivityAt: string | null;
    utmSource: string | null;
    utmCampaign: string | null;
    adId: string | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    contact: {
        id: string;
        name: string;
        email: string | null;
        phone: string | null;
        avatar: string | null;
    } | null;
    owner: {
        id: string;
        name: string;
        avatar: string | null;
    } | null;
    stage: {
        id: string;
        name: string;
        color: string;
        agentId: string | null;
    } | null;
}

export interface PipelineSummary {
    id: string;
    name: string;
    type: string;
    color: string;
    isDefault: boolean;
    rottingDays: number | null;
    stagesCount?: number;
    dealsCount?: number;
    totalValue?: number;
}

export interface Pipeline extends PipelineSummary {
    stages: PipelineStage[];
    deals: PipelineDeal[];
}

export interface DealMovement {
    id: string;
    fromStageId: string | null;
    toStageId: string;
    fromStageName: string | null;
    toStageName: string;
    movedBy: "HUMAN" | "AGENT" | "AUTOMATION" | "SYSTEM";
    userId: string | null;
    agentId: string | null;
    agentSessionId: string | null;
    reason: string | null;
    daysInPreviousStage: number | null;
    createdAt: string;
}

export interface DealActivity {
    id: string;
    type: string;
    title: string;
    description: string | null;
    dueAt: string | null;
    completedAt: string | null;
    createdAt: string;
    user: { id: string; name: string; avatar: string | null } | null;
}

export interface AgentSession {
    id: string;
    agentId: string;
    status: string;
    intent: string | null;
    intentConfidence: number | null;
    collectedData: Record<string, unknown>;
    pendingQuestions: unknown[];
    turnCount: number;
    startedAt: string;
    lastActivityAt: string;
    agent: {
        id: string;
        name: string;
        type: string;
        avatar: string | null;
    };
}

export interface FunnelStage {
    stageId: string;
    stageName: string;
    deals: number;
    value: number;
    conversionFromPrev: number | null;
    avgDaysInStage: number | null;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function usePipelines() {
    return useQuery({
        queryKey: ["pipelines"],
        queryFn: async () => {
            const { data } = await api.get("/pipeline/pipelines");
            return data as PipelineSummary[];
        },
    });
}

export function usePipeline(id: string) {
    return useQuery({
        queryKey: ["pipelines", id, "kanban"],
        queryFn: async () => {
            const { data } = await api.get(`/pipeline/pipelines/${id}/kanban`);
            return data as Pipeline;
        },
        enabled: !!id,
    });
}

export function useDeal(dealId: string) {
    return useQuery({
        queryKey: ["deals", dealId],
        queryFn: async () => {
            const { data } = await api.get(`/pipeline/deals/${dealId}`);
            return data as PipelineDeal & {
                activities: DealActivity[];
                stageMovements: DealMovement[];
            };
        },
        enabled: !!dealId,
    });
}

export function useDealMovements(dealId: string) {
    return useQuery({
        queryKey: ["deals", dealId, "movements"],
        queryFn: async () => {
            const { data } = await api.get(`/pipeline/deals/${dealId}/movements`);
            return data as DealMovement[];
        },
        enabled: !!dealId,
    });
}

export function useDealAgentSessions(dealId: string) {
    return useQuery({
        queryKey: ["deals", dealId, "agent-sessions"],
        queryFn: async () => {
            const { data } = await api.get(`/pipeline/deals/${dealId}/agent-sessions`);
            return data as AgentSession[];
        },
        enabled: !!dealId,
    });
}

export function usePipelineStats(pipelineId: string) {
    return useQuery({
        queryKey: ["pipelines", pipelineId, "stats"],
        queryFn: async () => {
            const { data } = await api.get(`/pipeline/pipelines/${pipelineId}/stats`);
            return data as {
                overview: {
                    totalDeals: number;
                    totalValue: number;
                    wonDeals: number;
                    lostDeals: number;
                    rottingDeals: number;
                    avgSalesCycleDays: number;
                    winRate: number;
                };
                conversionFunnel: FunnelStage[];
            };
        },
        enabled: !!pipelineId,
    });
}

export function useMoveDeal() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({
            dealId,
            toStageId,
            movedBy = "HUMAN",
            reason,
        }: {
            dealId: string;
            toStageId: string;
            movedBy?: string;
            reason?: string;
        }) => {
            const { data } = await api.patch(`/pipeline/deals/${dealId}/move`, {
                toStageId,
                movedBy,
                reason,
            });
            return data;
        },
        onSuccess: (_data, variables) => {
            qc.invalidateQueries({ queryKey: ["pipelines"] });
            qc.invalidateQueries({ queryKey: ["deals", variables.dealId] });
        },
    });
}

export function useCreateDeal() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (payload: {
            title: string;
            pipelineId: string;
            stageId: string;
            value?: number;
            probability?: number;
            contactId?: string;
            ownerId?: string;
            expectedCloseAt?: string;
            customFields?: Record<string, unknown>;
        }) => {
            const { data } = await api.post("/pipeline/deals", payload);
            return data as PipelineDeal;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["pipelines"] });
        },
    });
}

export function useUpdateDeal(dealId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (payload: Partial<{
            title: string;
            value: number;
            probability: number;
            ownerId: string;
            expectedCloseAt: string;
            customFields: Record<string, unknown>;
        }>) => {
            const { data } = await api.patch(`/pipeline/deals/${dealId}`, payload);
            return data as PipelineDeal;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["pipelines"] });
            qc.invalidateQueries({ queryKey: ["deals", dealId] });
        },
    });
}

export function useCreatePipeline() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (payload: {
            name: string;
            description?: string;
            type: string;
            color: string;
            rottingDays?: number;
        }) => {
            const { data } = await api.post("/pipeline/pipelines", payload);
            return data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["pipelines"] });
        },
    });
}

export function useUpdatePipeline(pipelineId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (payload: Partial<{
            name: string;
            description: string;
            type: string;
            color: string;
            rottingDays: number;
            isDefault: boolean;
        }>) => {
            const { data } = await api.patch(`/pipeline/pipelines/${pipelineId}`, payload);
            return data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["pipelines"] });
        },
    });
}

export function useUpdateStage(stageId: string, pipelineId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (payload: Partial<{
            name: string;
            color: string;
            type: string;
            probability: number;
            rottingDays: number;
            maxDeals: number;
            agentId: string | null;
            agentTrigger: string;
            agentGoal: string;
            onEnterActions: unknown[];
            onRottingActions: unknown[];
            requiredFields: string[];
        }>) => {
            const { data } = await api.patch(
                `/pipeline/pipelines/${pipelineId}/stages/${stageId}`,
                payload,
            );
            return data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["pipelines"] });
        },
    });
}
