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

type ApiConversation = Omit<Conversation, "status" | "channel" | "assignedToId" | "lastMessage"> & {
    status: string;
    channel: string;
    agentId?: string | null;
    assignedToId?: string | null;
    lastMessage?: string | null;
    messages?: Array<{ content: string; sentAt?: string; direction?: string; type?: string; id: string; mediaUrl?: string | null }>;
};

type ApiMessage = Omit<Message, "type" | "sender" | "createdAt"> & {
    type: string;
    direction?: string;
    sender?: unknown;
    sentAt?: string;
    createdAt?: string;
};

function toApiFilters(filters: InboxFilters) {
    return {
        ...filters,
        status: filters.status?.toUpperCase(),
        channel: filters.channel?.toUpperCase(),
        agentId: filters.assignedToId,
        assignedToId: undefined,
    };
}

function normalizeMessage(message: ApiMessage): Message {
    return {
        ...message,
        type: message.type.toLowerCase() as Message["type"],
        sender: message.direction === "OUTBOUND" ? "agent" : "contact",
        senderId: typeof message.sender === "object" && message.sender && "id" in message.sender
            ? String(message.sender.id)
            : message.senderId,
        createdAt: message.createdAt ?? message.sentAt ?? new Date().toISOString(),
    };
}

function normalizeConversation(conversation: ApiConversation): Conversation {
    const lastMessage = conversation.lastMessage ?? conversation.messages?.[0]?.content ?? null;
    return {
        ...conversation,
        status: conversation.status.toLowerCase() as Conversation["status"],
        channel: conversation.channel.toLowerCase() as Conversation["channel"],
        assignedToId: conversation.assignedToId ?? conversation.agentId ?? null,
        lastMessage,
        lastMessageAt: conversation.lastMessageAt ?? conversation.messages?.[0]?.sentAt ?? null,
    };
}

export function useConversations(filters: InboxFilters = {}) {
    return useQuery({
        queryKey: ["inbox", filters],
        queryFn: async () => {
            const { data } = await api.get("/inbox/conversations", { params: toApiFilters(filters) });
            const conversations = (data.data ?? []).map(normalizeConversation);
            return {
                conversations,
                total: data.total ?? conversations.length,
                page: data.page,
                limit: data.limit,
                totalPages: data.totalPages,
            } as { conversations: Conversation[]; total: number; page?: number; limit?: number; totalPages?: number };
        },
    });
}

export function useConversation(id: string) {
    return useQuery({
        queryKey: ["inbox", id],
        queryFn: async () => {
            const { data } = await api.get(`/inbox/conversations/${id}`);
            const conversation = normalizeConversation(data);
            const messages = (data.messages ?? []).slice().reverse().map(normalizeMessage);
            return { ...conversation, messages } as Conversation & { messages: Message[] };
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
            const { data } = await api.patch(`/inbox/conversations/${conversationId}/status`, { status: "RESOLVED" });
            return data;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["inbox"] });
        },
    });
}
