"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
    StageAutomationRule,
    StageRequiredField,
    StageAutomationLogEntry,
} from "@crm-base/shared";
import type { Tag } from "@/hooks/useTags";

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
    tags?: Tag[];
}

function normalizeDeal<T extends { tagRelations?: Array<{ tag: Tag }>; tags?: Tag[] | unknown }>(deal: T): T & { tags: Tag[] } {
    // The API returns `tagRelations: [{ tag: Tag }]` from the join. Flatten so
    // callers always see a clean `tags: Tag[]` on the deal.
    if (Array.isArray((deal as { tagRelations?: unknown }).tagRelations)) {
        return {
            ...deal,
            tags: (deal.tagRelations as Array<{ tag: Tag }>).map((r) => r.tag),
        };
    }
    return { ...deal, tags: Array.isArray(deal.tags) ? (deal.tags as Tag[]) : [] };
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

export function usePipeline(id: string, filters: { tags?: string } = {}) {
    return useQuery({
        queryKey: ["pipelines", id, "kanban", filters],
        queryFn: async () => {
            const { data } = await api.get(`/pipeline/pipelines/${id}/kanban`, {
                params: filters.tags ? { tags: filters.tags } : undefined,
            });
            // API returns { pipeline, columns: [{stage, deals}] } — transform to Pipeline shape
            const result = data as {
                pipeline: PipelineSummary & Record<string, unknown>;
                columns: Array<{ stage: PipelineStage; deals: PipelineDeal[] }>;
            };
            return {
                ...result.pipeline,
                stages: result.columns.map((c) => c.stage),
                deals: result.columns.flatMap((c) => c.deals.map(normalizeDeal)),
            } as Pipeline;
        },
        enabled: !!id,
    });
}

export function useDeal(dealId: string) {
    return useQuery({
        queryKey: ["deals", dealId],
        queryFn: async () => {
            const { data } = await api.get(`/pipeline/deals/${dealId}`);
            return normalizeDeal(data) as PipelineDeal & {
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
            tagIds?: string[];
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
            tagIds: string[];
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
            onEnterActions: StageAutomationRule[];
            onExitActions: StageAutomationRule[];
            onRottingActions: StageAutomationRule[];
            requiredFields: StageRequiredField[];
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

// ── Stage CRUD + Automations ──────────────────────────────────────────────────

export function useCreateStage(pipelineId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (payload: {
            name: string;
            color?: string;
            type?: string;
            probability?: number;
            rottingDays?: number | null;
            maxDeals?: number | null;
            order?: number;
            onEnterActions?: StageAutomationRule[];
            onExitActions?: StageAutomationRule[];
            onRottingActions?: StageAutomationRule[];
            requiredFields?: StageRequiredField[];
        }) => {
            const { data } = await api.post(
                `/pipeline/pipelines/${pipelineId}/stages`,
                payload,
            );
            return data as PipelineStage;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["pipelines"] });
        },
    });
}

export function useDeleteStage(pipelineId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({
            stageId,
            targetStageId,
        }: {
            stageId: string;
            targetStageId?: string;
        }) => {
            await api.delete(
                `/pipeline/pipelines/${pipelineId}/stages/${stageId}`,
                { data: targetStageId ? { targetStageId } : {} },
            );
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["pipelines"] });
        },
    });
}

export function useReorderStages(pipelineId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (stages: Array<{ id: string; order: number }>) => {
            const { data } = await api.patch(
                `/pipeline/pipelines/${pipelineId}/stages/reorder`,
                { stages },
            );
            return data as PipelineStage[];
        },
        onMutate: async (stages) => {
            await qc.cancelQueries({ queryKey: ["pipelines", pipelineId, "kanban"] });
            const previous = qc.getQueryData<Pipeline>(["pipelines", pipelineId, "kanban"]);
            if (previous) {
                const orderMap = new Map(stages.map((s) => [s.id, s.order]));
                qc.setQueryData<Pipeline>(["pipelines", pipelineId, "kanban"], {
                    ...previous,
                    stages: [...previous.stages]
                        .map((s) => ({ ...s, order: orderMap.get(s.id) ?? s.order }))
                        .sort((a, b) => a.order - b.order),
                });
            }
            return { previous };
        },
        onError: (_err, _vars, ctx) => {
            if (ctx?.previous) {
                qc.setQueryData(["pipelines", pipelineId, "kanban"], ctx.previous);
            }
        },
        onSettled: () => {
            qc.invalidateQueries({ queryKey: ["pipelines"] });
        },
    });
}

export function useDealAutomationLogs(dealId: string) {
    return useQuery({
        queryKey: ["deals", dealId, "automation-logs"],
        queryFn: async () => {
            const { data } = await api.get(`/pipeline/deals/${dealId}/automation-logs`);
            return data as StageAutomationLogEntry[];
        },
        enabled: !!dealId,
    });
}

export function useStageAutomationLogs(pipelineId: string, stageId: string) {
    return useQuery({
        queryKey: ["pipelines", pipelineId, "stages", stageId, "automation-logs"],
        queryFn: async () => {
            const { data } = await api.get(
                `/pipeline/pipelines/${pipelineId}/stages/${stageId}/automation-logs`,
            );
            return data as StageAutomationLogEntry[];
        },
        enabled: !!pipelineId && !!stageId,
    });
}

export function useTestStageAutomation(pipelineId: string, stageId: string) {
    return useMutation({
        mutationFn: async (payload: {
            trigger: "enter" | "exit" | "rotting";
            dealId: string;
            ruleId?: string;
        }) => {
            const { data } = await api.post(
                `/pipeline/pipelines/${pipelineId}/stages/${stageId}/automation-test`,
                payload,
            );
            return data as {
                trigger: string;
                stageId: string;
                executed: Array<{
                    ruleId: string;
                    ruleName: string;
                    results: Array<{
                        actionType: string;
                        success: boolean;
                        output?: unknown;
                        error?: string;
                    }>;
                }>;
            };
        },
    });
}
