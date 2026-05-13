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
    type?: string;
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

const CONTACT_TYPE_BY_STATUS: Record<string, string> = {
    lead: "LEAD",
    client: "CUSTOMER",
    customer: "CUSTOMER",
    partner: "PARTNER",
};

const STATUS_BY_CONTACT_TYPE: Record<string, string> = {
    LEAD: "lead",
    CUSTOMER: "client",
    PARTNER: "partner",
};

function normalizeContact(contact: Contact & { type?: string; orgId?: string }): Contact {
    const status = contact.status ?? STATUS_BY_CONTACT_TYPE[contact.type ?? ""] ?? "lead";
    return {
        ...contact,
        channel: contact.channel ?? null,
        status,
        organizationId: contact.organizationId ?? contact.orgId ?? "",
        assignedToId: contact.assignedToId ?? null,
    };
}

function normalizeContactFilters(filters: ContactFilters) {
    const type = filters.status ? CONTACT_TYPE_BY_STATUS[filters.status] : undefined;
    const source = filters.source?.toUpperCase().replace(/\s+/g, "_");
    return {
        search: filters.search,
        type,
        source: source || undefined,
        page: filters.page,
        limit: filters.limit,
    };
}

// ── List contacts ────────────────────────────────────────────────────────────
export function useContacts(filters: ContactFilters = {}) {
    return useQuery({
        queryKey: ["contacts", filters],
        queryFn: async () => {
            const { data } = await api.get("/contacts", { params: normalizeContactFilters(filters) });
            const contacts = (data.data ?? []).map(normalizeContact);
            return {
                contacts,
                total: data.total ?? contacts.length,
                page: data.page ?? filters.page ?? 1,
                pages: data.totalPages ?? 1,
                limit: data.limit ?? filters.limit ?? contacts.length,
            } as { contacts: Contact[]; total: number; page: number; pages: number; limit: number };
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
