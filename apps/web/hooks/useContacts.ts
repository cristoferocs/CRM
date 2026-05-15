"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Tag } from "@/hooks/useTags";

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
    tags: Tag[];
    createdAt: string;
    updatedAt: string;
}

export interface ContactFilters {
    search?: string;
    status?: string;
    source?: string;
    /** Comma-separated list of tag ids or names. The API resolves either form. */
    tags?: string;
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
        tags: Array.isArray(contact.tags) ? (contact.tags as Tag[]) : [],
    };
}

function normalizeContactFilters(filters: ContactFilters) {
    const type = filters.status ? CONTACT_TYPE_BY_STATUS[filters.status] : undefined;
    const source = filters.source?.toUpperCase().replace(/\s+/g, "_");
    return {
        search: filters.search,
        type,
        source: source || undefined,
        tags: filters.tags || undefined,
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

// ── Contact detail: timeline, deals, conversations ───────────────────────────

export interface ContactTimelineEvent {
    id: string;
    type: string;
    title: string;
    description: string | null;
    metadata: Record<string, unknown>;
    contactId: string;
    userId: string | null;
    orgId: string;
    createdAt: string;
    user: { id: string; name: string; avatar: string | null } | null;
}

export interface ContactDeal {
    id: string;
    title: string;
    value: number | null;
    status: string;
    stage: { id: string; name: string; color: string };
    pipeline: { id: string; name: string };
    owner: { id: string; name: string; avatar: string | null } | null;
    createdAt: string;
}

export interface ContactConversation {
    id: string;
    channel: string;
    status: string;
    contactId: string;
    agent: { id: string; name: string; avatar: string | null } | null;
    messages: { content: string | null; sentAt: string; direction: string }[];
    createdAt: string;
    updatedAt: string;
}

export function useContactTimeline(id: string) {
    return useQuery({
        queryKey: ["contacts", id, "timeline"],
        queryFn: async () => {
            const { data } = await api.get(`/contacts/${id}/timeline`);
            return (data.events ?? []) as ContactTimelineEvent[];
        },
        enabled: !!id,
    });
}

export function useContactDeals(id: string) {
    return useQuery({
        queryKey: ["contacts", id, "deals"],
        queryFn: async () => {
            const { data } = await api.get(`/contacts/${id}/deals`);
            return (Array.isArray(data) ? data : []) as ContactDeal[];
        },
        enabled: !!id,
    });
}

export function useContactConversations(id: string) {
    return useQuery({
        queryKey: ["contacts", id, "conversations"],
        queryFn: async () => {
            const { data } = await api.get(`/contacts/${id}/conversations`);
            return (Array.isArray(data) ? data : []) as ContactConversation[];
        },
        enabled: !!id,
    });
}
