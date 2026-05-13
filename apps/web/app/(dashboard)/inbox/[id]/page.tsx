"use client";

import { useState, useRef, useEffect } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Send, Phone, MoreVertical, CheckCheck } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useConversation, useSendMessage } from "@/hooks/useInbox";
import { formatRelative, cn } from "@/lib/utils";

export default function ConversationPage() {
    const { id } = useParams<{ id: string }>();
    const [message, setMessage] = useState("");
    const bottomRef = useRef<HTMLDivElement>(null);

    const { data, isLoading } = useConversation(id);
    const sendMessage = useSendMessage(id);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [data?.messages]);

    const handleSend = async () => {
        const trimmed = message.trim();
        if (!trimmed) return;
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
        <div className="flex h-full flex-col animate-fade-in overflow-hidden rounded-[16px] border border-[var(--rim)] bg-surface">
            {/* Chat header */}
            <div className="flex items-center gap-3 border-b border-[var(--rim)] px-5 py-3.5">
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
                                {(data?.contact.name ?? "?")
                                    .split(" ")
                                    .slice(0, 2)
                                    .map((n) => n[0])
                                    .join("")}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                            <p className="text-sm font-medium text-t1">{data?.contact.name}</p>
                            <p className="font-mono text-[10px] text-t3">
                                {data?.channel} · {data?.status}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            {data?.status === "open" && (
                                <Badge variant="jade">Aberta</Badge>
                            )}
                            <Button variant="outline" size="icon">
                                <MoreVertical className="h-4 w-4" />
                            </Button>
                        </div>
                    </>
                )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {isLoading
                    ? Array.from({ length: 4 }).map((_, i) => (
                        <div
                            key={i}
                            className={cn(
                                "flex",
                                i % 2 === 0 ? "justify-start" : "justify-end",
                            )}
                        >
                            <Skeleton className="h-10 w-48 rounded-[10px]" />
                        </div>
                    ))
                    : (data?.messages ?? []).map((msg) => (
                        <div
                            key={msg.id}
                            className={cn(
                                "flex",
                                msg.sender !== "contact" ? "justify-end" : "justify-start",
                            )}
                        >
                            <div
                                className={cn(
                                    "max-w-[70%] rounded-[10px] px-3.5 py-2.5 text-sm",
                                    msg.sender === "contact"
                                        ? "bg-surface-2 text-t1"
                                        : msg.sender === "bot"
                                            ? "bg-cyan-dim border border-cyan/20 text-t1"
                                            : "bg-violet text-white",
                                )}
                            >
                                <p className="leading-relaxed">{msg.content}</p>
                                <p
                                    className={cn(
                                        "mt-1 font-mono text-[10px]",
                                        msg.sender !== "contact" ? "text-white/60" : "text-t3",
                                    )}
                                >
                                    {formatRelative(msg.createdAt)}
                                    {msg.sender !== "contact" && (
                                        <CheckCheck className="inline ml-1 h-3 w-3" />
                                    )}
                                </p>
                            </div>
                        </div>
                    ))}
                <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="border-t border-[var(--rim)] p-4">
                <div className="flex items-center gap-2">
                    <Input
                        placeholder="Digite uma mensagem..."
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="flex-1"
                    />
                    <Button
                        onClick={handleSend}
                        disabled={!message.trim() || sendMessage.isPending}
                        size="icon"
                    >
                        <Send className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
