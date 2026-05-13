"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface Contact {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    avatar: string | null;
    source: string | null;
    channel: string | null;
    status: string;
    value: number | null;
    organizationId: string;
    assignedToId: string | null;
    tags: string[];
    createdAt: string;
    updatedAt: string;
}

export interface ContactFilters {
    search?: string;
    status?: string;
    source?: string;
    page?: number;
    limit?: number;
}

// ── List contacts ────────────────────────────────────────────────────────────
export function useContacts(filters: ContactFilters = {}) {
    return useQuery({
        queryKey: ["contacts", filters],
        queryFn: async () => {
            const { data } = await api.get("/contacts", { params: filters });
            return data as { contacts: Contact[]; total: number; page: number; pages: number };
        },
    });
}

// ── Single contact ───────────────────────────────────────────────────────────
export function useContact(id: string) {
    return useQuery({
        queryKey: ["contacts", id],
        queryFn: async () => {
            const { data } = await api.get(`/contacts/${id}`);
            return data as Contact;
        },
        enabled: !!id,
    });
}

// ── Create contact ───────────────────────────────────────────────────────────
export function useCreateContact() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (payload: Partial<Contact>) => {
            const { data } = await api.post("/contacts", payload);
            return data as Contact;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["contacts"] });
        },
    });
}

// ── Update contact ───────────────────────────────────────────────────────────
export function useUpdateContact(id: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (payload: Partial<Contact>) => {
            const { data } = await api.patch(`/contacts/${id}`, payload);
            return data as Contact;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["contacts"] });
        },
    });
}

// ── Delete contact ───────────────────────────────────────────────────────────
export function useDeleteContact() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            await api.delete(`/contacts/${id}`);
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["contacts"] });
        },
    });
}
