"use client";

import { useState } from "react";
import {
    Bot,
    User,
    ArrowRight,
    CheckCircle2,
    XCircle,
    Clock,
    Coins,
    ChevronDown,
    ChevronUp,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatUsd } from "@/hooks/useAgentCost";
import { useHandoffTimeline, type HandoffNode } from "@/hooks/useHandoffTimeline";

/**
 * Visual flow of every agent (and the final human assignment) that
 * handled a single deal or conversation, in chronological order.
 *
 * Each agent step renders as a card with:
 *   - icon + name + type
 *   - duration / turns / cost
 *   - outcome flag (goal achieved / handoff / ended)
 *   - expandable "preserved context" (collected + handoff data) so the
 *     next agent / human can see exactly what was inherited
 *
 * The final human node (when set) renders without metrics — it's a
 * marker for "this is where the AI handed off."
 */
export function HandoffTimeline({
    dealId,
    conversationId,
}: {
    dealId?: string;
    conversationId?: string;
}) {
    const { data, isLoading, isError } = useHandoffTimeline({ dealId, conversationId });

    if (isLoading) return <Skeleton className="h-44" />;
    if (isError || !data) return null;
    if (data.nodes.length === 0) {
        return (
            <Card className="p-4 text-sm text-t3">
                Ainda não houve atuação de agente IA neste{" "}
                {dealId ? "deal" : "atendimento"}.
            </Card>
        );
    }

    return (
        <div className="space-y-3">
            <Card className="p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[11px] uppercase tracking-wider text-t3">
                    <span>Histórico de handoff</span>
                    <span className="font-mono normal-case tracking-normal">
                        {data.totals.agents} agente{data.totals.agents !== 1 ? "s" : ""} ·{" "}
                        {data.totals.turns} turnos · {formatDuration(data.totals.durationMs)} ·{" "}
                        <span className="text-t2">{formatUsd(data.totals.costUsd)}</span>
                    </span>
                </div>
                <div className="flex flex-wrap items-stretch gap-2">
                    {data.nodes.map((node, i) => (
                        <div key={i} className="flex items-stretch gap-2">
                            <TimelineCard node={node} />
                            {i < data.nodes.length - 1 && (
                                <ArrowRight
                                    aria-hidden="true"
                                    className="my-auto h-4 w-4 shrink-0 text-t4"
                                />
                            )}
                        </div>
                    ))}
                </div>
            </Card>
        </div>
    );
}

function TimelineCard({ node }: { node: HandoffNode }) {
    const [open, setOpen] = useState(false);
    const isHuman = node.kind === "human";
    const tone =
        isHuman
            ? { wrap: "border-jade/40 bg-jade-dim", icon: <User className="h-3.5 w-3.5 text-jade" aria-hidden="true" /> }
            : { wrap: "border-violet/30 bg-violet-dim", icon: <Bot className="h-3.5 w-3.5 text-violet" aria-hidden="true" /> };

    const hasContext = !isHuman && hasPreservedContext(node);

    return (
        <div className={cn("min-w-[180px] rounded-lg border p-3", tone.wrap)}>
            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-t2">
                {tone.icon}
                <span className="truncate">
                    {isHuman ? node.userName ?? "Humano" : node.agentType ?? "Agente"}
                </span>
            </div>
            <p className="mt-1 truncate text-sm font-medium text-t1">
                {isHuman ? "Atendimento humano" : node.agentName}
            </p>

            {!isHuman && (
                <>
                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] text-t3">
                        <span className="inline-flex items-center gap-0.5">
                            <Clock className="h-3 w-3" aria-hidden="true" />
                            {formatDuration(node.durationMs)}
                        </span>
                        {node.totalCostUsd > 0 && (
                            <span className="inline-flex items-center gap-0.5">
                                <Coins className="h-3 w-3" aria-hidden="true" />
                                {formatUsd(node.totalCostUsd)}
                            </span>
                        )}
                        <span>{node.turnCount} turnos</span>
                    </div>
                    <div className="mt-2">
                        <OutcomeBadge node={node} />
                    </div>
                    {node.handoffReason && (
                        <p className="mt-2 text-[11px] text-t3" title={node.handoffReason}>
                            ↪ {truncate(node.handoffReason, 60)}
                        </p>
                    )}
                </>
            )}

            {hasContext && (
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    className="mt-2 inline-flex items-center gap-0.5 text-[10px] text-violet transition-colors hover:underline"
                >
                    {open ? (
                        <ChevronUp className="h-3 w-3" aria-hidden="true" />
                    ) : (
                        <ChevronDown className="h-3 w-3" aria-hidden="true" />
                    )}
                    {open ? "Ocultar contexto" : "Ver contexto preservado"}
                </button>
            )}
            {open && hasContext && (
                <pre className="mt-2 max-h-40 overflow-y-auto rounded border border-[var(--rim)] bg-surface-3 p-2 text-[10px] text-t2">
                    {JSON.stringify(node.preservedContext, null, 2)}
                </pre>
            )}
        </div>
    );
}

function OutcomeBadge({ node }: { node: HandoffNode }) {
    if (node.goalAchieved) {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-jade-dim px-2 py-0.5 text-[10px] text-jade">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                Objetivo alcançado
            </span>
        );
    }
    if (node.status === "HANDOFF") {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-dim px-2 py-0.5 text-[10px] text-amber">
                ↪ Handoff
            </span>
        );
    }
    if (node.status === "ENDED") {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-3 px-2 py-0.5 text-[10px] text-t3">
                Encerrada
            </span>
        );
    }
    if (node.status === "ACTIVE" || node.status === "WAITING_USER") {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-dim px-2 py-0.5 text-[10px] text-violet">
                Em andamento
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-dim px-2 py-0.5 text-[10px] text-rose">
            <XCircle className="h-3 w-3" aria-hidden="true" />
            {node.status ?? "Sem status"}
        </span>
    );
}

function hasPreservedContext(node: HandoffNode): boolean {
    const ctx = node.preservedContext;
    if (!ctx) return false;
    const collected = (ctx as { collected?: Record<string, unknown> }).collected ?? {};
    const handoff = (ctx as { handoff?: Record<string, unknown> }).handoff ?? {};
    return Object.keys(collected).length > 0 || Object.keys(handoff).length > 0;
}

function formatDuration(ms: number | null): string {
    if (ms == null) return "—";
    if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3_600_000) return `${Math.round(ms / 60_000)}min`;
    if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(1)}h`;
    return `${(ms / 86_400_000).toFixed(1)}d`;
}

function truncate(s: string, max: number): string {
    if (s.length <= max) return s;
    return s.slice(0, max - 1) + "…";
}
