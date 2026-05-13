"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { Search, Send, Paperclip, MoreVertical, UserPlus, CheckCheck, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useConversations, useConversation, useSendMessage, type Conversation, type Message } from "@/hooks/useInbox";
import { useSocket } from "@/hooks/useSocket";
import { useAuthStore } from "@/stores/auth.store";
import { useSocketStore } from "@/stores/socket.store";
import { useQueryClient } from "@tanstack/react-query";
import { formatRelative, cn } from "@/lib/utils";

// ── Channel visuals ───────────────────────────────────────────────────────────

const CHANNEL_COLORS: Record<string, string> = {
    whatsapp: "from-[#25d366] to-[#128c7e]",
    instagram: "from-[#e1306c] to-[#833ab4]",
    messenger: "from-[#00b2ff] to-[#006aff]",
    email: "from-t3 to-t2",
    web: "from-violet to-cyan",
};

const CHANNEL_BADGE: Record<string, string> = {
    whatsapp: "💬",
    instagram: "📸",
    messenger: "📘",
    email: "✉",
    web: "🌐",
};

const CHANNEL_LABEL: Record<string, string> = {
    whatsapp: "WhatsApp",
    instagram: "Instagram",
    messenger: "Messenger",
    email: "Email",
    web: "Web",
};

// ── Typing indicator ──────────────────────────────────────────────────────────

function TypingIndicator() {
    return (
        <div className="flex justify-start">
            <div className="flex h-8 items-center gap-1 rounded-[14px] rounded-bl-[4px] border border-[var(--rim)] bg-surface-2 px-4">
                {[0, 1, 2].map((i) => (
                    <span
                        key={i}
                        className="h-1.5 w-1.5 rounded-full bg-t3 animate-bounce"
                        style={{ animationDelay: `${i * 150}ms` }}
                    />
                ))}
            </div>
        </div>
    );
}

// ── Message Bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
    const isAgent = msg.sender === "agent" || msg.sender === "bot";
    return (
        <div className={cn("flex", isAgent ? "justify-end" : "justify-start")}>
            <div
                className={cn(
                    "max-w-[70%] rounded-[14px] px-4 py-2.5 text-sm",
                    isAgent
                        ? "rounded-br-[4px] bg-gradient-to-br from-violet to-violet/80 text-white"
                        : "rounded-bl-[4px] border border-[var(--rim)] bg-surface-2 text-t1",
                )}
            >
                <p className="leading-relaxed">{msg.content}</p>
                <div className={cn("mt-1 flex items-center gap-1", isAgent ? "justify-end" : "justify-start")}>
                    <span className={cn("font-mono text-[10px]", isAgent ? "text-white/60" : "text-t3")}>
                        {new Date(msg.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {isAgent && <CheckCheck className="h-3 w-3 text-white/60" />}
                </div>
            </div>
        </div>
    );
}

// ── Conversation Item ─────────────────────────────────────────────────────────

function ConversationItem({
    conv,
    active,
    onClick,
}: {
    conv: Conversation;
    active: boolean;
    onClick: (id: string) => void;
}) {
    return (
        <button
            onClick={() => onClick(conv.id)}
            className={cn(
                "flex w-full cursor-pointer items-start gap-3 border-b border-[var(--rim)] px-4 py-3.5 text-left transition-colors last:border-none",
                active ? "bg-violet/[0.08]" : "hover:bg-surface-2",
                conv.unreadCount > 0 && !active && "bg-violet/[0.04]",
            )}
        >
            <div className="relative shrink-0">
                <Avatar className="h-9 w-9">
                    <AvatarFallback
                        className={cn(
                            "bg-gradient-to-br text-[13px] font-semibold",
                            CHANNEL_COLORS[conv.channel] ?? "from-violet to-cyan",
                        )}
                    >
                        {conv.contact.name
                            .split(" ")
                            .slice(0, 2)
                            .map((n) => n[0])
                            .join("")}
                    </AvatarFallback>
                </Avatar>
                <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border-[1.5px] border-surface bg-surface-2 text-[7px]">
                    {CHANNEL_BADGE[conv.channel] ?? "💬"}
                </span>
            </div>
            <div className="min-w-0 flex-1">
                <p className={cn("text-[13px]", conv.unreadCount > 0 ? "font-semibold text-t1" : "font-medium text-t1")}>
                    {conv.contact.name}
                </p>
                <p className={cn("truncate text-xs", conv.unreadCount > 0 ? "text-t1" : "text-t2")}>
                    {conv.lastMessage ?? "Nenhuma mensagem"}
                </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span className="font-mono text-[10px] text-t3">
                    {conv.lastMessageAt ? formatRelative(conv.lastMessageAt) : ""}
                </span>
                {conv.unreadCount > 0 && (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-violet text-[9px] font-bold text-white shadow-[0_0_6px_#7c5cfc]">
                        {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                    </span>
                )}
            </div>
        </button>
    );
}

// ── Conversation Panel ────────────────────────────────────────────────────────

function ConversationPanel({ conversationId }: { conversationId: string }) {
    const [message, setMessage] = useState("");
    const [isTyping, setIsTyping] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const { data, isLoading } = useConversation(conversationId);
    const sendMessage = useSendMessage(conversationId);
    const { socket } = useSocketStore();

    // Scroll to bottom on new messages
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [data?.messages]);

    // Join conversation room via socket
    useEffect(() => {
        if (!socket || !conversationId) return;
        socket.emit("join:conversation", conversationId);
        return () => {
            socket.emit("leave:conversation", conversationId);
        };
    }, [socket, conversationId]);

    // Listen for typing indicator
    useEffect(() => {
        if (!socket) return;
        const handleTyping = (id: string) => {
            if (id !== conversationId) return;
            setIsTyping(true);
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 3000);
        };
        socket.on("typing", handleTyping);
        return () => { socket.off("typing", handleTyping); };
    }, [socket, conversationId]);

    const handleSend = async () => {
        const trimmed = message.trim();
        if (!trimmed || sendMessage.isPending) return;
        setMessage("");
        await sendMessage.mutateAsync(trimmed);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="flex flex-1 flex-col overflow-hidden">
            {/* Chat header */}
            <div className="flex items-center gap-3 border-b border-[var(--rim)] px-5 py-3.5 shrink-0">
                {isLoading ? (
                    <div className="flex flex-1 items-center gap-3">
                        <Skeleton className="h-9 w-9 rounded-full" />
                        <Skeleton className="h-4 w-32" />
                    </div>
                ) : (
                    <>
                        <Avatar className="h-9 w-9">
                            <AvatarFallback
                                className={cn(
                                    "bg-gradient-to-br text-sm font-semibold",
                                    CHANNEL_COLORS[data?.channel ?? ""] ?? "from-violet to-cyan",
                                )}
                            >
                                {(data?.contact.name ?? "?")
                                    .split(" ")
                                    .slice(0, 2)
                                    .map((n) => n[0])
                                    .join("")}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-t1">{data?.contact.name}</p>
                                {data?.channel && (
                                    <Badge variant="muted">
                                        {CHANNEL_BADGE[data.channel]} {CHANNEL_LABEL[data.channel]}
                                    </Badge>
                                )}
                                {data?.status === "open" && <Badge variant="jade">Aberta</Badge>}
                                {data?.status === "bot" && <Badge variant="violet">Bot</Badge>}
                                {data?.status === "resolved" && <Badge variant="muted">Resolvida</Badge>}
                            </div>
                            <Link
                                href={`/contacts/${data?.contactId}`}
                                className="font-mono text-[10px] text-t3 hover:text-cyan transition-colors"
                            >
                                ver contato →
                            </Link>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <Button variant="outline" size="sm">
                                <UserPlus className="h-4 w-4" /> Atribuir
                            </Button>
                            <Button variant="outline" size="icon">
                                <MoreVertical className="h-4 w-4" />
                            </Button>
                        </div>
                    </>
                )}
            </div>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {isLoading
                    ? Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className={cn("flex", i % 2 === 0 ? "justify-start" : "justify-end")}>
                            <Skeleton className="h-10 w-48 rounded-[14px]" />
                        </div>
                    ))
                    : (data?.messages ?? []).map((msg) => (
                        <MessageBubble key={msg.id} msg={msg} />
                    ))}

                {isTyping && <TypingIndicator />}
                <div ref={bottomRef} />
            </div>

            {/* Input area */}
            <div className="border-t border-[var(--rim)] p-4 shrink-0">
                <div className="flex items-end gap-2">
                    <Button variant="ghost" size="icon" className="shrink-0 text-t3 hover:text-t1">
                        <Paperclip className="h-4 w-4" />
                    </Button>
                    <div className="relative flex-1">
                        <Input
                            placeholder="Digite uma mensagem... (Enter para enviar)"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="pr-10"
                        />
                    </div>
                    <Button
                        size="icon"
                        onClick={handleSend}
                        disabled={!message.trim() || sendMessage.isPending}
                        className="shrink-0"
                    >
                        <Send className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InboxPage() {
    const [search, setSearch] = useState("");
    const [activeConvId, setActiveConvId] = useState<string | null>(null);
    const [channelFilter, setChannelFilter] = useState<string>("");
    const qc = useQueryClient();

    // Connect socket
    useSocket();
    const { socket, connected } = useSocketStore();
    const { user } = useAuthStore();

    const { data, isLoading } = useConversations({
        status: "open",
        channel: channelFilter || undefined,
    });

    // Join org room and listen for real-time events
    useEffect(() => {
        if (!socket || !user?.organizationId) return;

        socket.emit("join:org", user.organizationId);

        const handleNewMessage = (msg: Message & { conversationId: string }) => {
            // Invalidate the conversation query to refetch messages
            qc.invalidateQueries({ queryKey: ["inbox", msg.conversationId] });
            qc.invalidateQueries({ queryKey: ["inbox"] });
        };

        const handleNewConversation = () => {
            qc.invalidateQueries({ queryKey: ["inbox"] });
        };

        const handleConversationUpdated = () => {
            qc.invalidateQueries({ queryKey: ["inbox"] });
        };

        socket.on("message:new", handleNewMessage);
        socket.on("conversation:new", handleNewConversation);
        socket.on("conversation:updated", handleConversationUpdated);

        return () => {
            socket.off("message:new", handleNewMessage);
            socket.off("conversation:new", handleNewConversation);
            socket.off("conversation:updated", handleConversationUpdated);
        };
    }, [socket, user?.organizationId, qc]);

    const filteredConversations = (data?.conversations ?? []).filter((c) =>
        search
            ? c.contact.name.toLowerCase().includes(search.toLowerCase()) ||
            (c.lastMessage ?? "").toLowerCase().includes(search.toLowerCase())
            : true,
    );

    const CHANNELS = ["whatsapp", "instagram", "messenger", "email", "web"] as const;

    return (
        <div className="flex h-full flex-col animate-fade-in overflow-hidden">
            {/* Header */}
            <div className="mb-4 flex items-end justify-between shrink-0">
                <div>
                    <h1 className="font-display text-[28px] font-semibold leading-none tracking-[-0.8px] text-t1">
                        Inbox
                    </h1>
                    <p className="mt-1.5 text-sm text-t2">
                        {data?.total ?? 0} conversas abertas
                        {connected && (
                            <span className="ml-2 inline-flex items-center gap-1 font-mono text-[10px] text-jade">
                                <span className="h-1.5 w-1.5 rounded-full bg-jade animate-pulse" />
                                ao vivo
                            </span>
                        )}
                    </p>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden rounded-[16px] border border-[var(--rim)] bg-surface">
                {/* Left panel: conversation list */}
                <div className="flex w-80 shrink-0 flex-col border-r border-[var(--rim)] overflow-hidden">
                    {/* Search */}
                    <div className="p-3 border-b border-[var(--rim)] shrink-0">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-t3" />
                            <Input
                                placeholder="Buscar conversa..."
                                className="pl-9"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Channel filters */}
                    <div className="flex gap-1 border-b border-[var(--rim)] p-2 shrink-0 overflow-x-auto">
                        <button
                            onClick={() => setChannelFilter("")}
                            className={cn(
                                "flex h-7 shrink-0 items-center gap-1 rounded-[6px] px-2.5 text-xs transition-colors",
                                !channelFilter ? "bg-violet/[0.12] text-violet" : "text-t3 hover:text-t1",
                            )}
                        >
                            Todos
                        </button>
                        {CHANNELS.map((ch) => (
                            <button
                                key={ch}
                                onClick={() => setChannelFilter(ch === channelFilter ? "" : ch)}
                                className={cn(
                                    "flex h-7 shrink-0 items-center gap-1 rounded-[6px] px-2.5 text-xs transition-colors",
                                    channelFilter === ch ? "bg-violet/[0.12] text-violet" : "text-t3 hover:text-t1",
                                )}
                            >
                                {CHANNEL_BADGE[ch]} {ch}
                            </button>
                        ))}
                    </div>

                    {/* Conversations list with status tabs */}
                    <Tabs defaultValue="open" className="flex flex-1 flex-col overflow-hidden">
                        <TabsList className="mx-3 mt-3 flex w-auto shrink-0 gap-0 border border-[var(--rim)] bg-surface-2 rounded-[10px] p-1">
                            <TabsTrigger value="open" className="flex-1 border-none py-1.5 rounded-[6px] data-[state=active]:bg-surface-3">
                                Abertas
                            </TabsTrigger>
                            <TabsTrigger value="bot" className="flex-1 border-none py-1.5 rounded-[6px] data-[state=active]:bg-surface-3">
                                Bot
                            </TabsTrigger>
                            <TabsTrigger value="resolved" className="flex-1 border-none py-1.5 rounded-[6px] data-[state=active]:bg-surface-3">
                                Resolvidas
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="open" className="mt-2 flex-1 overflow-y-auto">
                            {isLoading
                                ? Array.from({ length: 5 }).map((_, i) => (
                                    <div key={i} className="flex items-start gap-3 border-b border-[var(--rim)] px-4 py-3.5">
                                        <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                                        <div className="flex-1 space-y-1.5">
                                            <Skeleton className="h-3 w-28" />
                                            <Skeleton className="h-3 w-48" />
                                        </div>
                                    </div>
                                ))
                                : filteredConversations.length === 0
                                    ? (
                                        <div className="flex flex-col items-center justify-center py-16 text-t3">
                                            <p className="text-sm">Nenhuma conversa</p>
                                        </div>
                                    )
                                    : filteredConversations.map((conv) => (
                                        <ConversationItem
                                            key={conv.id}
                                            conv={conv}
                                            active={activeConvId === conv.id}
                                            onClick={setActiveConvId}
                                        />
                                    ))}
                        </TabsContent>
                        <TabsContent value="bot" className="mt-2 flex-1 overflow-y-auto">
                            <BotConversationsList onSelect={setActiveConvId} activeId={activeConvId} />
                        </TabsContent>
                        <TabsContent value="resolved" className="mt-2 flex-1 overflow-y-auto">
                            <ResolvedConversationsList onSelect={setActiveConvId} activeId={activeConvId} />
                        </TabsContent>
                    </Tabs>
                </div>

                {/* Right panel: active conversation or empty state */}
                {activeConvId ? (
                    <ConversationPanel conversationId={activeConvId} />
                ) : (
                    <div className="flex flex-1 flex-col items-center justify-center text-t3">
                        <span className="mb-3 text-5xl">💬</span>
                        <p className="text-sm font-medium">Selecione uma conversa</p>
                        <p className="mt-1 text-xs">Clique em uma conversa à esquerda para começar</p>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Sub-lists for other tabs ──────────────────────────────────────────────────

function BotConversationsList({
    onSelect,
    activeId,
}: {
    onSelect: (id: string) => void;
    activeId: string | null;
}) {
    const { data, isLoading } = useConversations({ status: "bot" });
    if (isLoading) {
        return (
            <div className="space-y-0">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-start gap-3 border-b border-[var(--rim)] px-4 py-3.5">
                        <Skeleton className="h-9 w-9 rounded-full" />
                        <div className="flex-1 space-y-1.5">
                            <Skeleton className="h-3 w-28" />
                            <Skeleton className="h-3 w-48" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }
    if (!data?.conversations.length) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-t3">
                <p className="text-sm">Nenhuma conversa com bot</p>
            </div>
        );
    }
    return (
        <>
            {data.conversations.map((conv) => (
                <ConversationItem key={conv.id} conv={conv} active={activeId === conv.id} onClick={onSelect} />
            ))}
        </>
    );
}

function ResolvedConversationsList({
    onSelect,
    activeId,
}: {
    onSelect: (id: string) => void;
    activeId: string | null;
}) {
    const { data, isLoading } = useConversations({ status: "resolved" });
    if (isLoading) {
        return (
            <div className="space-y-0">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-start gap-3 border-b border-[var(--rim)] px-4 py-3.5">
                        <Skeleton className="h-9 w-9 rounded-full" />
                        <div className="flex-1 space-y-1.5">
                            <Skeleton className="h-3 w-28" />
                            <Skeleton className="h-3 w-48" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }
    if (!data?.conversations.length) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-t3">
                <p className="text-sm">Nenhuma conversa resolvida</p>
            </div>
        );
    }
    return (
        <>
            {data.conversations.map((conv) => (
                <ConversationItem key={conv.id} conv={conv} active={activeId === conv.id} onClick={onSelect} />
            ))}
        </>
    );
}
