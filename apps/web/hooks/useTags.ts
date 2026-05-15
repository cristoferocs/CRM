"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface Tag {
    id: string;
    name: string;
    color: string;
    orgId: string;
    createdBy: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface TagUsage {
    tagId: string;
    contactCount: number;
    dealCount: number;
}

const KEY = ["tags"] as const;

/** List/search tags for the current org. */
export function useTags(filters: { search?: string; limit?: number } = {}) {
    return useQuery({
        queryKey: [...KEY, filters],
        queryFn: async () => {
            const { data } = await api.get("/tags", { params: filters });
            return (data?.data ?? []) as Tag[];
        },
        // Tags rarely change — keep fresh for a couple minutes to avoid extra
        // round-trips while the autocomplete is being opened/closed repeatedly.
        staleTime: 60_000 * 2,
    });
}

export function useCreateTag() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (input: { name: string; color?: string }) => {
            const { data } = await api.post("/tags", input);
            return data as Tag;
        },
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: KEY });
        },
    });
}

export function useUpdateTag() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, ...patch }: { id: string; name?: string; color?: string }) => {
            const { data } = await api.patch(`/tags/${id}`, patch);
            return data as Tag;
        },
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: KEY });
            void qc.invalidateQueries({ queryKey: ["contacts"] });
            void qc.invalidateQueries({ queryKey: ["deals"] });
            void qc.invalidateQueries({ queryKey: ["pipeline"] });
        },
    });
}

export function useDeleteTag() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const { data } = await api.delete(`/tags/${id}`);
            return data as { deleted: true; removedFromContacts: number; removedFromDeals: number };
        },
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: KEY });
            void qc.invalidateQueries({ queryKey: ["contacts"] });
            void qc.invalidateQueries({ queryKey: ["deals"] });
            void qc.invalidateQueries({ queryKey: ["pipeline"] });
        },
    });
}

export function useTagUsage(id: string | null | undefined) {
    return useQuery({
        queryKey: [...KEY, id, "usage"],
        queryFn: async () => {
            const { data } = await api.get(`/tags/${id}/usage`);
            return data as TagUsage;
        },
        enabled: !!id,
        staleTime: 30_000,
    });
}
