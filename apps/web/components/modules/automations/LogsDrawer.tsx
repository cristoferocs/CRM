"use client";

import { CheckCircle2, XCircle, AlertCircle, Clock } from "lucide-react";
import {
    Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { useAutomationLogs } from "@/hooks/useAutomations";
import { cn } from "@/lib/utils";

interface LogsDrawerProps {
    automationId: string | undefined;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const STATUS_LABEL: Record<string, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
    success: { label: "Sucesso", cls: "text-green-400 bg-green-500/10 border-green-500/20", icon: CheckCircle2 },
    partial: { label: "Parcial", cls: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20", icon: AlertCircle },
    failed: { label: "Falha", cls: "text-red-400 bg-red-500/10 border-red-500/20", icon: XCircle },
};

export function LogsDrawer({ automationId, open, onOpenChange }: LogsDrawerProps) {
    const { data, isLoading } = useAutomationLogs(automationId, { limit: 50 });
    const logs = data?.logs ?? [];

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-full max-w-xl overflow-y-auto sm:max-w-xl">
                <SheetHeader>
                    <SheetTitle>Histórico de execuções</SheetTitle>
                    <SheetDescription>Últimas execuções desta automação.</SheetDescription>
                </SheetHeader>

                <div className="mt-6 flex flex-col gap-2">
                    {isLoading && (
                        <div className="flex flex-col gap-2">
                            {[0, 1, 2, 3].map(i => (
                                <div key={i} className="h-20 animate-pulse rounded-lg border border-[var(--rim)] bg-surface" />
                            ))}
                        </div>
                    )}
                    {!isLoading && logs.length === 0 && (
                        <p className="rounded-lg border border-dashed border-[var(--rim)] px-4 py-8 text-center text-xs text-t3">
                            Nenhuma execução registrada.
                        </p>
                    )}
                    {logs.map(log => {
                        const meta = STATUS_LABEL[log.status] ?? STATUS_LABEL.failed!;
                        const Icon = meta.icon;
                        return (
                            <details key={log.id} className="group rounded-lg border border-[var(--rim)] bg-surface">
                                <summary className="flex cursor-pointer list-none items-center gap-3 p-3">
                                    <span className={cn("flex h-7 w-7 items-center justify-center rounded-full border", meta.cls)}>
                                        <Icon className="h-3.5 w-3.5" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline" className={cn("text-[10px]", meta.cls)}>{meta.label}</Badge>
                                            <span className="text-[10px] text-t3">
                                                {new Date(log.createdAt).toLocaleString("pt-BR")}
                                            </span>
                                        </div>
                                        <p className="mt-1 truncate text-[11px] text-t2">
                                            {log.nodesExecuted.length} nós · {log.nodesExecuted.filter(n => n.success).length} ok
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1 text-[10px] text-t3">
                                        <Clock className="h-3 w-3" /> {log.duration}ms
                                    </div>
                                </summary>
                                <div className="border-t border-[var(--rim)] px-3 py-2">
                                    <div className="flex flex-col gap-1">
                                        {log.nodesExecuted.map((n, idx) => (
                                            <div key={idx} className="flex items-start gap-2 rounded-md bg-surface2/40 px-2 py-1.5 text-[11px]">
                                                {n.success ? (
                                                    <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-green-400" />
                                                ) : (
                                                    <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-red-400" />
                                                )}
                                                <div className="min-w-0 flex-1">
                                                    <p className="font-mono text-[10px] text-t1">{n.nodeType}</p>
                                                    {n.error && <p className="text-red-400">{n.error}</p>}
                                                    {n.output != null && (
                                                        <pre className="mt-0.5 max-h-24 overflow-auto whitespace-pre-wrap break-all text-[10px] text-t3">
                                                            {JSON.stringify(n.output, null, 2)}
                                                        </pre>
                                                    )}
                                                </div>
                                                <span className="shrink-0 text-[10px] text-t3">{n.durationMs ?? 0}ms</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </details>
                        );
                    })}
                </div>
            </SheetContent>
        </Sheet>
    );
}
