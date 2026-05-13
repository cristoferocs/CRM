"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Wrench, Brain, AlertTriangle, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentTurn {
    id: string;
    turnIndex: number;
    role: "user" | "assistant";
    content: string;
    toolCalls?: ToolCall[];
    reasoning?: string;
    intent?: string;
    intentConfidence?: number;
    currentStage?: string;
    stateChanges?: StateChange[];
    createdAt: string;
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
                <div className="flex items-center justify-between gap-2 mt-1.5">
                    <p className="font-mono text-[10px] text-t3">
                        T{turn.turnIndex + 1} · {formatDate(turn.createdAt, "HH:mm:ss")}
                    </p>
                    {!isUser && turn.intent && (
                        <p className="text-[10px] text-t3">
                            intent:{" "}
                            <span className="text-cyan-400">
                                {turn.intent}
                                {turn.intentConfidence != null &&
                                    ` (${Math.round(turn.intentConfidence * 100)}%)`}
                            </span>
                        </p>
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
// Main player
// ---------------------------------------------------------------------------

export function AgentSessionPlayer({ turns, className }: AgentSessionPlayerProps) {
    if (!turns.length) {
        return (
            <div className="flex items-center justify-center h-32 text-t3 text-sm">
                Nenhuma mensagem nesta sessão
            </div>
        );
    }

    const sorted = [...turns].sort((a, b) => a.turnIndex - b.turnIndex);

    return (
        <div
            className={cn(
                "overflow-y-auto rounded-xl bg-[var(--deep)] border border-[var(--rim)] p-4 space-y-3",
                className,
            )}
        >
            {sorted.map((turn) => (
                <TurnBubble key={turn.id} turn={turn} />
            ))}
        </div>
    );
}
