"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface PipelineStage {
    id: string;
    name: string;
    color: string;
    order: number;
    pipelineId: string;
    probability: number | null;
}

export interface PipelineDeal {
    id: string;
    title: string;
    value: number | null;
    stageId: string;
    contactId: string | null;
    assignedToId: string | null;
    probability: number | null;
    expectedCloseDate: string | null;
    contact: { id: string; name: string; avatar: string | null } | null;
    createdAt: string;
    updatedAt: string;
}

export interface Pipeline {
    id: string;
    name: string;
    stages: PipelineStage[];
    deals: PipelineDeal[];
}

export function usePipelines() {
    return useQuery({
        queryKey: ["pipelines"],
        queryFn: async () => {
            const { data } = await api.get("/pipeline/pipelines");
            return data as Pipeline[];
        },
    });
}

export function usePipeline(id: string) {
    return useQuery({
        queryKey: ["pipelines", id],
        queryFn: async () => {
            const { data } = await api.get(`/pipeline/pipelines/${id}/kanban`);
            return data as Pipeline;
        },
        enabled: !!id,
    });
}

export function useMoveDeal() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({
            dealId,
            stageId,
        }: {
            dealId: string;
            stageId: string;
        }) => {
            const { data } = await api.patch(`/pipeline/deals/${dealId}/move`, {
                stageId,
            });
            return data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["pipelines"] });
        },
    });
}

export function useCreateDeal() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (payload: Partial<PipelineDeal> & { pipelineId: string }) => {
            const { data } = await api.post("/pipeline/deals", payload);
            return data as PipelineDeal;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["pipelines"] });
        },
    });
}
