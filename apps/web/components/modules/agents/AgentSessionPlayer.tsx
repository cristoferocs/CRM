"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
    ChevronDown,
    ChevronUp,
    Wrench,
    Brain,
    AlertTriangle,
    ArrowRight,
    Clock,
    DollarSign,
    Filter,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { formatUsd } from "@/hooks/useAgentCost";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentTurn {
    id: string;
    turnIndex?: number;
    role: "user" | "assistant" | "tool";
    content: string;
    toolCalls?: ToolCall[];
    reasoning?: string;
    intent?: string;
    intentConfidence?: number;
    currentStage?: string;
    stateChanges?: StateChange[];
    createdAt: string;
    // Cost-tracking fields (May 2026 — older turns lack these and we treat
    // missing values as zero / unknown).
    tokensUsed?: number;
    inputTokens?: number;
    outputTokens?: number;
    model?: string | null;
    costUsd?: number | string | null;
    durationMs?: number | null;
    toolName?: string | null;
    toolParams?: Record<string, unknown> | null;
    toolResult?: string | null;
}

interface ToolCall {
    name: string;
    args?: Record<string, unknown>;
    result?: unknown;
    error?: string;
}

interface StateChange {
    field: string;
    from?: string | null;
    to: string;
}

interface AgentSessionPlayerProps {
    turns: AgentTurn[];
    className?: string;
}

// ---------------------------------------------------------------------------
// Tool call pill
// ---------------------------------------------------------------------------

function ToolCallPill({ tool }: { tool: ToolCall }) {
    const [open, setOpen] = useState(false);
    const hasError = !!tool.error;

    return (
        <div className="mx-auto my-1 max-w-[80%]">
            <button
                onClick={() => setOpen((v) => !v)}
                className={cn(
                    "w-full flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs border transition-colors",
                    hasError
                        ? "bg-rose-dim border-rose/20 text-rose-400"
                        : "bg-[var(--ds-surface3)] border-[var(--rim)] text-t3 hover:text-t2",
                )}
            >
                {hasError ? (
                    <AlertTriangle className="w-3 h-3 text-rose-400 flex-shrink-0" />
                ) : (
                    <Wrench className="w-3 h-3 flex-shrink-0" />
                )}
                <span className="font-mono flex-1 text-left">{tool.name}</span>
                {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {open && (
                <div className="mt-1 rounded-lg bg-[var(--ds-surface3)] border border-[var(--rim)] p-2.5 text-[11px] font-mono text-t3 space-y-1">
                    {tool.args && Object.keys(tool.args).length > 0 && (
                        <div>
                            <p className="text-t4 mb-1">args:</p>
                            <pre className="text-t2 whitespace-pre-wrap break-all">
                                {JSON.stringify(tool.args, null, 2)}
                            </pre>
                        </div>
                    )}
                    {tool.error ? (
                        <p className="text-rose-400">{tool.error}</p>
                    ) : tool.result != null ? (
                        <div>
                            <p className="text-t4 mb-1">resultado:</p>
                            <pre className="text-jade whitespace-pre-wrap break-all">
                                {JSON.stringify(tool.result, null, 2).slice(0, 400)}
                            </pre>
                        </div>
                    ) : null}
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// State change badge
// ---------------------------------------------------------------------------

function StateChangeBadge({ change }: { change: StateChange }) {
    return (
        <span className="inline-flex items-center gap-1 text-[10px] rounded-full px-2 py-0.5 bg-violet-dim border border-violet/20 text-violet">
            {change.field}:
            {change.from != null && (
                <>
                    <span className="text-t3">{String(change.from)}</span>
                    <ArrowRight className="w-2.5 h-2.5 text-t3" />
                </>
            )}
            <span>{String(change.to)}</span>
        </span>
    );
}

// ---------------------------------------------------------------------------
// Single turn bubble
// ---------------------------------------------------------------------------

function TurnBubble({ turn }: { turn: AgentTurn }) {
    const [showReasoning, setShowReasoning] = useState(false);

    // Server-side `role="tool"` turns (added in May 2026 cost-tracking work)
    // are rendered as a single compact pill — same shape as inlined
    // toolCalls, but tracked as their own row so cost-per-tool reporting
    // works.
    if (turn.role === "tool" && turn.toolName) {
        return (
            <div className="w-full">
                <ToolCallPill
                    tool={{
                        name: turn.toolName,
                        args: (turn.toolParams ?? undefined) as Record<string, unknown> | undefined,
                        result: turn.toolResult ?? undefined,
                    }}
                />
                <div className="mx-auto max-w-[80%] -mt-0.5 flex items-center justify-end gap-2 pr-1">
                    <TurnMetricBadges turn={turn} />
                </div>
            </div>
        );
    }

    const isUser = turn.role === "user";

    return (
        <div className={cn("flex flex-col gap-1", isUser ? "items-start" : "items-end")}>
            {/* State changes (before message) */}
            {turn.stateChanges && turn.stateChanges.length > 0 && (
                <div className="flex flex-wrap gap-1 mx-2">
                    {turn.stateChanges.map((sc, i) => (
                        <StateChangeBadge key={i} change={sc} />
                    ))}
                </div>
            )}

            {/* Tool calls (before assistant message) */}
            {!isUser && turn.toolCalls && turn.toolCalls.length > 0 && (
                <div className="w-full space-y-1">
                    {turn.toolCalls.map((tc, i) => (
                        <ToolCallPill key={i} tool={tc} />
                    ))}
                </div>
            )}

            {/* Message bubble */}
            <div
                className={cn(
                    "max-w-[78%] rounded-[12px] px-3.5 py-2.5 text-sm",
                    isUser
                        ? "bg-[var(--ds-surface2)] text-t1 rounded-tl-sm"
                        : "bg-violet-dim border border-violet/20 text-t1 rounded-tr-sm",
                )}
            >
                <p className="leading-relaxed whitespace-pre-wrap">{turn.content}</p>
                <div className="flex flex-wrap items-center justify-between gap-2 mt-1.5">
                    <p className="font-mono text-[10px] text-t3">
                        {turn.turnIndex != null && `T${turn.turnIndex + 1} · `}
                        {formatDate(turn.createdAt, "HH:mm:ss")}
                    </p>
                    {!isUser && (
                        <div className="flex items-center gap-2 text-[10px] text-t3">
                            {turn.intent && (
                                <span>
                                    intent:{" "}
                                    <span className="text-cyan-400">
                                        {turn.intent}
                                        {turn.intentConfidence != null &&
                                            ` (${Math.round(turn.intentConfidence * 100)}%)`}
                                    </span>
                                </span>
                            )}
                            <TurnMetricBadges turn={turn} />
                        </div>
                    )}
                </div>
            </div>

            {/* Reasoning toggle (agent only) */}
            {!isUser && turn.reasoning && (
                <button
                    onClick={() => setShowReasoning((v) => !v)}
                    className="flex items-center gap-1 text-[11px] text-t3 hover:text-violet transition-colors ml-2"
                >
                    <Brain className="w-3 h-3" />
                    {showReasoning ? "Ocultar" : "Ver"} raciocínio interno
                </button>
            )}
            {!isUser && showReasoning && turn.reasoning && (
                <div className="max-w-[85%] rounded-lg bg-[var(--ds-surface3)] border border-violet/10 px-3 py-2.5 text-[11px] text-t3 font-mono leading-relaxed whitespace-pre-wrap">
                    {turn.reasoning}
                </div>
            )}

            {/* Stage badge */}
            {!isUser && turn.currentStage && (
                <p className="text-[10px] text-t3 mx-2">
                    etapa: <span className="text-amber-400">{turn.currentStage}</span>
                </p>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Per-turn metric badges (cost, duration, tokens) — shown only on
// assistant / tool turns where we have provider metadata.
// ---------------------------------------------------------------------------

function TurnMetricBadges({ turn }: { turn: AgentTurn }) {
    const cost = Number(turn.costUsd ?? 0);
    const ms = turn.durationMs ?? 0;
    const tok = turn.tokensUsed ?? 0;
    if (cost <= 0 && ms <= 0 && tok <= 0) return null;
    return (
        <span className="inline-flex items-center gap-2 font-mono text-[10px] text-t3">
            {cost > 0 && (
                <span className="inline-flex items-center gap-0.5" title={turn.model ?? ""}>
                    <DollarSign className="h-3 w-3" aria-hidden="true" />
                    {formatUsd(cost)}
                </span>
            )}
            {ms > 0 && (
                <span className="inline-flex items-center gap-0.5">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    {ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`}
                </span>
            )}
            {tok > 0 && <span>{tok.toLocaleString("pt-BR")} tok</span>}
        </span>
    );
}

// ---------------------------------------------------------------------------
// Main player
// ---------------------------------------------------------------------------

export function AgentSessionPlayer({ turns, className }: AgentSessionPlayerProps) {
    const [toolFilter, setToolFilter] = useState<string>("all");

    // Sort by turnIndex when present (the older shape from
    // /agents/:id/sessions/:sessionId), otherwise fall back to createdAt
    // so flat Prisma rows render in chronological order.
    const sorted = useMemo(() => {
        return [...turns].sort((a, b) => {
            if (a.turnIndex != null && b.turnIndex != null) return a.turnIndex - b.turnIndex;
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        });
    }, [turns]);

    const toolNames = useMemo(() => {
        const set = new Set<string>();
        for (const t of sorted) {
            if (t.toolName) set.add(t.toolName);
            for (const tc of t.toolCalls ?? []) set.add(tc.name);
        }
        return Array.from(set).sort();
    }, [sorted]);

    const visible = useMemo(() => {
        if (toolFilter === "all") return sorted;
        return sorted.filter(
            (t) =>
                t.toolName === toolFilter ||
                t.toolCalls?.some((tc) => tc.name === toolFilter),
        );
    }, [sorted, toolFilter]);

    const totals = useMemo(() => {
        let cost = 0;
        let tokens = 0;
        let durationMs = 0;
        for (const t of sorted) {
            cost += Number(t.costUsd ?? 0);
            tokens += t.tokensUsed ?? 0;
            durationMs += t.durationMs ?? 0;
        }
        return { cost, tokens, durationMs };
    }, [sorted]);

    if (!turns.length) {
        return (
            <div className="flex items-center justify-center h-32 text-t3 text-sm">
                Nenhuma mensagem nesta sessão
            </div>
        );
    }

    return (
        <div className={cn("flex flex-col gap-2", className)}>
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-t3">
                <span className="font-mono">
                    {sorted.length} turnos · {totals.tokens.toLocaleString("pt-BR")} tokens ·{" "}
                    <span className="text-t2">{formatUsd(totals.cost)}</span>
                    {totals.durationMs > 0 && ` · ${(totals.durationMs / 1000).toFixed(1)}s LLM`}
                </span>
                {toolNames.length > 0 && (
                    <label className="inline-flex items-center gap-1.5">
                        <Filter className="h-3 w-3" aria-hidden="true" />
                        <span className="sr-only">Filtrar por ferramenta</span>
                        <select
                            value={toolFilter}
                            onChange={(e) => setToolFilter(e.target.value)}
                            className="rounded-md border border-[var(--rim)] bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-t2 outline-none focus-visible:border-[var(--rim2)]"
                        >
                            <option value="all">todas ferramentas</option>
                            {toolNames.map((n) => (
                                <option key={n} value={n}>
                                    {n}
                                </option>
                            ))}
                        </select>
                    </label>
                )}
            </div>
            <div
                className={cn(
                    "overflow-y-auto rounded-xl bg-[var(--deep)] border border-[var(--rim)] p-4 space-y-3 flex-1",
                )}
            >
                {visible.map((turn) => (
                    <TurnBubble key={turn.id} turn={turn} />
                ))}
                {visible.length === 0 && (
                    <div className="flex items-center justify-center h-24 text-t3 text-sm">
                        Nenhum turno usa <span className="font-mono text-t2 mx-1">{toolFilter}</span>.
                    </div>
                )}
            </div>
        </div>
    );
}
