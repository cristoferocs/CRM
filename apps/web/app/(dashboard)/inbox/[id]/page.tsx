"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Send, MoreVertical, CheckCheck, Bot, UserCheck, ChevronDown, ChevronUp, AlertTriangle, Target, Database } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useConversation, useSendMessage } from "@/hooks/useInbox";
import { HandoffTimeline } from "@/components/modules/agents/handoff-timeline";
import { formatRelative, cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useSocket } from "@/hooks/useSocket";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentSession {
    id: string;
    status: string;
    intent?: string;
    intentConfidence?: number;
    currentStage?: string;
    collectedData?: Record<string, unknown>;
    pendingQuestions?: string[];
    handoffData?: {
        reason?: string;
        recommendedAction?: string;
        collectedData?: Record<string, unknown>;
        suggestedMessage?: string;
        summary?: string;
    };
}

// ---------------------------------------------------------------------------
// Active agent panel
// ---------------------------------------------------------------------------

function AgentPanel({
    session,
    onTakeOver,
    takingOver,
    onSendSuggested,
}: {
    session: AgentSession;
    onTakeOver: () => void;
    takingOver: boolean;
    onSendSuggested?: (msg: string) => void;
}) {
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [dataExpanded, setDataExpanded] = useState(false);
    const isHandoff = session.status === "HANDOFF";

    const collectedEntries = Object.entries(session.collectedData ?? {}).filter(([, v]) => v != null);

    return (
        <div className="w-64 flex-shrink-0 border-l border-[var(--rim)] flex flex-col overflow-y-auto">
            {/* Header */}
            <div className="px-4 py-3.5 border-b border-[var(--rim)] flex items-center gap-2">
                <Bot className="w-3.5 h-3.5 text-cyan-400" />
                <p className="text-xs font-medium text-t1">Agente Ativo</p>
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-jade animate-pulse" />
            </div>

            <div className="flex-1 p-4 space-y-4">
                {/* HANDOFF alert */}
                {isHandoff && session.handoffData && (
                    <div className="rounded-lg bg-amber-dim border border-amber-500/20 p-3 space-y-2">
                        <div className="flex items-center gap-1.5 text-amber-400 text-xs font-medium">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Transferência solicitada
                        </div>
                        {session.handoffData.reason && (
                            <p className="text-[11px] text-t3">{session.handoffData.reason}</p>
                        )}
                        {session.handoffData.recommendedAction && (
                            <div className="rounded bg-[var(--ds-surface3)] px-2.5 py-2 text-[11px] text-t2">
                                <p className="text-[10px] text-t3 mb-1">Ação recomendada</p>
                                {session.handoffData.recommendedAction}
                            </div>
                        )}
                        {session.handoffData.suggestedMessage && onSendSuggested && (
                            <button
                                onClick={() => onSendSuggested(session.handoffData!.suggestedMessage!)}
                                className="w-full text-left rounded bg-violet-dim border border-violet/20 px-2.5 py-2 text-[11px] text-violet hover:bg-violet/20 transition-colors"
                            >
                                <p className="text-[10px] text-t3 mb-1">Mensagem sugerida</p>
                                "{session.handoffData.suggestedMessage}"
                            </button>
                        )}
                    </div>
                )}

                {/* Intent */}
                {session.intent && (
                    <div className="space-y-1">
                        <p className="text-[10px] text-t3 uppercase tracking-wider">Intenção detectada</p>
                        <div className="flex items-center gap-2">
                            <Target className="w-3 h-3 text-violet" />
                            <span className="text-xs text-t2">{session.intent}</span>
                            {session.intentConfidence != null && (
                                <span className="ml-auto text-[10px] text-jade font-mono">
                                    {Math.round(session.intentConfidence * 100)}%
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {/* Current stage */}
                {session.currentStage && (
                    <div className="space-y-1">
                        <p className="text-[10px] text-t3 uppercase tracking-wider">Etapa atual</p>
                        <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400">
                            {session.currentStage}
                        </Badge>
                    </div>
                )}

                {/* Pending questions */}
                {session.pendingQuestions && session.pendingQuestions.length > 0 && (
                    <div className="space-y-1.5">
                        <p className="text-[10px] text-t3 uppercase tracking-wider">Perguntas pendentes</p>
                        <ul className="space-y-1">
                            {session.pendingQuestions.map((q, i) => (
                                <li key={i} className="text-[11px] text-t2 flex items-start gap-1.5">
                                    <span className="text-cyan-400 flex-shrink-0 mt-0.5">?</span>
                                    {q}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Collected data */}
                {collectedEntries.length > 0 && (
                    <div className="space-y-1.5">
                        <button
                            onClick={() => setDataExpanded((v) => !v)}
                            className="flex items-center gap-1.5 text-[10px] text-t3 uppercase tracking-wider hover:text-t2 w-full"
                        >
                            <Database className="w-3 h-3" />
                            Dados coletados ({collectedEntries.length})
                            {dataExpanded ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
                        </button>
                        {dataExpanded && (
                            <div className="rounded-lg bg-[var(--ds-surface2)] border border-[var(--rim)] p-2.5 space-y-1">
                                {collectedEntries.map(([key, value]) => (
                                    <div key={key} className="flex items-start gap-2 text-[11px]">
                                        <span className="text-t3 flex-shrink-0">{key}:</span>
                                        <span className="text-t2 break-all">{String(value)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Takeover */}
            <div className="p-4 border-t border-[var(--rim)]">
                {!confirmOpen ? (
                    <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs gap-1.5"
                        onClick={() => setConfirmOpen(true)}
                    >
                        <UserCheck className="w-3 h-3" />
                        Assumir conversa
                    </Button>
                ) : (
                    <div className="space-y-2">
                        <p className="text-[11px] text-t3 text-center">Confirmar assumir conversa?</p>
                        <div className="flex gap-1.5">
                            <Button size="sm" className="flex-1 text-xs" onClick={onTakeOver} disabled={takingOver}>
                                {takingOver ? "..." : "Confirmar"}
                            </Button>
                            <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => setConfirmOpen(false)}>
                                Cancelar
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ConversationPage() {
    const { id } = useParams<{ id: string }>();
    const [message, setMessage] = useState("");
    const [agentSession, setAgentSession] = useState<AgentSession | null>(null);
    const [takingOver, setTakingOver] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);
    const { socket } = useSocket();

    const { data, isLoading } = useConversation(id);
    const sendMessage = useSendMessage(id);

    const fetchAgentSession = useCallback(async () => {
        try {
            const res = await api.get<AgentSession | null>(`/agents/sessions/${id}`);
            setAgentSession(res.data?.id ? res.data : null);
        } catch {
            setAgentSession(null);
        }
    }, [id]);

    useEffect(() => { void fetchAgentSession(); }, [fetchAgentSession]);

    // Listen for socket events
    useEffect(() => {
        if (!socket) return;
        const onHandoff = (e: { conversationId: string }) => {
            if (e.conversationId === id) void fetchAgentSession();
        };
        const onUpdate = (e: { conversationId: string }) => {
            if (e.conversationId === id) void fetchAgentSession();
        };
        socket.on("agent:handoff", onHandoff);
        socket.on("agent:session_updated", onUpdate);
        return () => {
            socket.off("agent:handoff", onHandoff);
            socket.off("agent:session_updated", onUpdate);
        };
    }, [socket, id, fetchAgentSession]);

    const takeOver = async () => {
        setTakingOver(true);
        try {
            await api.patch(`/inbox/conversations/${id}/status`, { status: "open" });
            setAgentSession(null);
        } finally {
            setTakingOver(false);
        }
    };

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [data?.messages]);

    const handleSend = async (text?: string) => {
        const trimmed = (text ?? message).trim();
        if (!trimmed) return;
        if (!text) setMessage("");
        await sendMessage.mutateAsync(trimmed);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void handleSend();
        }
    };

    const botActive = !!agentSession;

    return (
        <div className="flex h-full overflow-hidden rounded-[16px] border border-[var(--rim)] bg-surface animate-fade-in">
            {/* Main chat */}
            <div className="flex flex-col flex-1 overflow-hidden">
                {/* Header */}
                <div className="flex items-center gap-3 border-b border-[var(--rim)] px-5 py-3.5 flex-shrink-0">
                    <Button variant="ghost" size="icon" asChild>
                        <Link href="/inbox">
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                    </Button>
                    {isLoading ? (
                        <div className="flex items-center gap-3">
                            <Skeleton className="h-9 w-9 rounded-full" />
                            <Skeleton className="h-4 w-32" />
                        </div>
                    ) : (
                        <>
                            <Avatar className="h-9 w-9">
                                <AvatarFallback className="bg-gradient-to-br from-violet to-cyan text-sm font-semibold">
                                    {(data?.contact.name ?? "?").split(" ").slice(0, 2).map((n) => n[0]).join("")}
                                </AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                                <p className="text-sm font-medium text-t1">{data?.contact.name}</p>
                                <p className="font-mono text-[10px] text-t3">{data?.channel} · {data?.status}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                {botActive && (
                                    <Badge variant="outline" className="border-cyan-500 text-cyan-600 text-xs flex items-center gap-1">
                                        <Bot className="w-3 h-3" />
                                        Bot ativo
                                    </Badge>
                                )}
                                {data?.status === "open" && <Badge variant="jade">Aberta</Badge>}
                                <Button variant="outline" size="icon">
                                    <MoreVertical className="h-4 w-4" />
                                </Button>
                            </div>
                        </>
                    )}
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-5 space-y-3">
                    {/* Cross-session handoff visualization — shows which AI
                        agents (and the final human) have handled this
                        conversation, in order. */}
                    {id && <HandoffTimeline conversationId={id} />}

                    {isLoading
                        ? Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className={cn("flex", i % 2 === 0 ? "justify-start" : "justify-end")}>
                                <Skeleton className="h-10 w-48 rounded-[10px]" />
                            </div>
                        ))
                        : (data?.messages ?? []).map((msg) => (
                            <div key={msg.id} className={cn("flex", msg.sender !== "contact" ? "justify-end" : "justify-start")}>
                                <div className={cn(
                                    "max-w-[70%] rounded-[10px] px-3.5 py-2.5 text-sm",
                                    msg.sender === "contact"
                                        ? "bg-surface-2 text-t1"
                                        : msg.sender === "bot"
                                            ? "bg-cyan-dim border border-cyan/20 text-t1"
                                            : "bg-violet text-white",
                                )}>
                                    <p className="leading-relaxed">{msg.content}</p>
                                    <p className={cn("mt-1 font-mono text-[10px]", msg.sender !== "contact" ? "text-white/60" : "text-t3")}>
                                        {formatRelative(msg.createdAt)}
                                        {msg.sender !== "contact" && <CheckCheck className="inline ml-1 h-3 w-3" />}
                                    </p>
                                </div>
                            </div>
                        ))}
                    <div ref={bottomRef} />
                </div>

                {/* Input */}
                <div className="border-t border-[var(--rim)] p-4 flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <Input
                            placeholder="Digite uma mensagem..."
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="flex-1"
                        />
                        <Button
                            onClick={() => void handleSend()}
                            disabled={!message.trim() || sendMessage.isPending}
                            size="icon"
                        >
                            <Send className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Agent panel */}
            {botActive && agentSession && (
                <AgentPanel
                    session={agentSession}
                    onTakeOver={() => void takeOver()}
                    takingOver={takingOver}
                    onSendSuggested={(msg) => void handleSend(msg)}
                />
            )}
        </div>
    );
}

