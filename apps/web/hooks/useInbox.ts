"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface Conversation {
    id: string;
    status: "open" | "bot" | "resolved" | "pending";
    channel: "whatsapp" | "instagram" | "messenger" | "email" | "web";
    contactId: string;
    assignedToId: string | null;
    lastMessage: string | null;
    lastMessageAt: string | null;
    unreadCount: number;
    contact: { id: string; name: string; avatar: string | null };
    createdAt: string;
    updatedAt: string;
}

export interface Message {
    id: string;
    conversationId: string;
    content: string;
    type: "text" | "image" | "document" | "audio";
    sender: "contact" | "agent" | "bot";
    senderId: string | null;
    mediaUrl: string | null;
    createdAt: string;
}

export interface InboxFilters {
    status?: string;
    channel?: string;
    assignedToId?: string;
    page?: number;
    limit?: number;
}

export function useConversations(filters: InboxFilters = {}) {
    return useQuery({
        queryKey: ["inbox", filters],
        queryFn: async () => {
            const { data } = await api.get("/inbox/conversations", { params: filters });
            return data as { conversations: Conversation[]; total: number };
        },
    });
}

export function useConversation(id: string) {
    return useQuery({
        queryKey: ["inbox", id],
        queryFn: async () => {
            const { data } = await api.get(`/inbox/conversations/${id}`);
            return data as Conversation & { messages: Message[] };
        },
        enabled: !!id,
        refetchInterval: 5_000,
    });
}

export function useSendMessage(conversationId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (content: string) => {
            const { data } = await api.post(`/inbox/conversations/${conversationId}/messages`, {
                content,
            });
            return data as Message;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["inbox", conversationId] });
        },
    });
}

export function useAssignConversation() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({
            conversationId,
            userId,
        }: {
            conversationId: string;
            userId: string | null;
        }) => {
            const { data } = await api.patch(`/inbox/conversations/${conversationId}/assign`, {
                userId,
            });
            return data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["inbox"] });
        },
    });
}

export function useResolveConversation() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (conversationId: string) => {
            const { data } = await api.patch(`/inbox/conversations/${conversationId}/status`, { status: "resolved" });
            return data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["inbox"] });
        },
    });
}
