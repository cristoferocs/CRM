"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Notification {
    id: string;
    type: string;
    title: string;
    body: string;
    read: boolean;
    createdAt: string;
    entityType?: string;
    entityId?: string;
}

const TYPE_ICONS: Record<string, string> = {
    MENTION: "💬",
    DEAL_WON: "🏆",
    DEAL_LOST: "😔",
    TASK_DUE: "⏰",
    NEW_LEAD: "✨",
    AI_INSIGHT: "🤖",
    AUTOMATION: "⚡",
    SYSTEM: "ℹ️",
};

export function NotificationBell() {
    const qc = useQueryClient();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const { data: count = 0 } = useQuery({
        queryKey: ["notifications", "count"],
        queryFn: () => api.get("/collaboration/notifications/count").then(r => r.data.count),
        refetchInterval: 30_000,
    });

    const { data: notifications = [] } = useQuery({
        queryKey: ["notifications"],
        queryFn: () => api.get("/collaboration/notifications?limit=20").then(r => r.data),
        enabled: open,
    });

    const markReadMutation = useMutation({
        mutationFn: (id: string) => api.patch(`/collaboration/notifications/${id}/read`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
    });

    const markAllReadMutation = useMutation({
        mutationFn: () => api.post("/collaboration/notifications/read-all"),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
    });

    // Close on outside click
    useEffect(() => {
        function handler(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen(o => !o)}
                className="relative flex h-9 w-9 items-center justify-center rounded-xl hover:bg-surface2 transition-colors"
                aria-label="Notificações"
            >
                <Bell className="h-5 w-5 text-t2" />
                {count > 0 && (
                    <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                        {count > 99 ? "99+" : count}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-2 z-50 w-80 rounded-xl border border-[var(--rim)] bg-surface shadow-xl">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--rim)]">
                        <span className="font-semibold text-t1">Notificações</span>
                        {count > 0 && (
                            <button
                                onClick={() => markAllReadMutation.mutate()}
                                className="text-xs text-violet hover:underline"
                            >
                                Marcar tudo como lido
                            </button>
                        )}
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="flex flex-col items-center gap-2 py-10 text-center">
                                <Bell className="h-8 w-8 text-t3" />
                                <p className="text-xs text-t3">Nenhuma notificação</p>
                            </div>
                        ) : (
                            notifications.map((n: Notification) => (
                                <div
                                    key={n.id}
                                    onClick={() => !n.read && markReadMutation.mutate(n.id)}
                                    className={cn(
                                        "flex gap-3 px-4 py-3 cursor-pointer hover:bg-surface2 transition-colors border-b border-[var(--rim)] last:border-0",
                                        !n.read && "bg-violet/5",
                                    )}
                                >
                                    <span className="text-xl shrink-0">{TYPE_ICONS[n.type] ?? "🔔"}</span>
                                    <div className="min-w-0 flex-1">
                                        <p className={cn("text-sm", !n.read ? "font-semibold text-t1" : "text-t2")}>{n.title}</p>
                                        <p className="text-xs text-t3 mt-0.5 line-clamp-2">{n.body}</p>
                                        <p className="text-[10px] text-t3 mt-1">
                                            {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: ptBR })}
                                        </p>
                                    </div>
                                    {!n.read && <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-violet" />}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
