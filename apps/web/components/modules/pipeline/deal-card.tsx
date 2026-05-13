"use client";

import { useState } from "react";
import { Draggable } from "@hello-pangea/dnd";
import { AlertTriangle, Bot, Clock, Edit } from "lucide-react";
import { differenceInDays } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, formatCurrency, formatRelative, getInitials } from "@/lib/utils";
import type { PipelineDeal } from "@/hooks/usePipeline";

// ── Helpers ────────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
    "from-violet to-cyan",
    "from-cyan to-jade",
    "from-jade to-cyan",
    "from-rose to-amber",
    "from-amber to-violet",
];

function avatarColor(str: string): string {
    let hash = 0;
    for (const c of str) hash = hash * 31 + c.charCodeAt(0);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] as string;
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface DealCardProps {
    deal: PipelineDeal;
    index: number;
    onClick: (deal: PipelineDeal) => void;
    /** Highlighted by a socket event (proactive contact, etc.) */
    pulsating?: boolean;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function DealCard({ deal, index, onClick, pulsating = false }: DealCardProps) {
    const [hovered, setHovered] = useState(false);

    const daysToClose = deal.expectedCloseAt
        ? differenceInDays(new Date(deal.expectedCloseAt), new Date())
        : null;

    const hasActiveAgent = !!deal.activeAgentSessionId;
    const confidencePct = deal.aiProbability ?? deal.probability ?? 0;

    return (
        <Draggable draggableId={deal.id} index={index}>
            {(provided, snapshot) => (
                <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    onClick={() => onClick(deal)}
                    onMouseEnter={() => setHovered(true)}
                    onMouseLeave={() => setHovered(false)}
                    className={cn(
                        "relative cursor-pointer rounded-[10px] border bg-surface-2 p-3 transition-all duration-200 select-none",
                        // Default
                        !deal.isRotting && !hasActiveAgent && "border-[var(--rim)] hover:border-[var(--rim2)] hover:translate-x-px",
                        // Rotting
                        deal.isRotting && "border-amber/30 bg-amber/[0.03]",
                        // Active agent
                        hasActiveAgent && !deal.isRotting && "border-violet/25",
                        // Socket pulsation
                        pulsating && "ring-1 ring-violet/50",
                        // Dragging
                        snapshot.isDragging && "shadow-2xl scale-[1.03] border-violet/40 bg-surface-3 z-50",
                    )}
                >
                    {/* Animated accent border for active agent */}
                    {hasActiveAgent && !deal.isRotting && (
                        <span className="pointer-events-none absolute inset-0 rounded-[10px] border border-violet/20 animate-pulse" />
                    )}

                    {/* Rotting banner */}
                    {deal.isRotting && (
                        <div className="mb-2 flex items-center gap-1.5">
                            <AlertTriangle className="h-3 w-3 shrink-0 text-amber" />
                            <span className="font-mono text-[10px] text-amber">
                                {deal.rottingDays}d parado
                            </span>
                        </div>
                    )}

                    {/* Title */}
                    <p className="mb-2 text-[12px] font-medium leading-snug text-t1 line-clamp-2">
                        {deal.title}
                    </p>

                    {/* Contact + Owner */}
                    <div className="mb-2 flex items-center justify-between gap-2">
                        {deal.contact ? (
                            <div className="flex min-w-0 items-center gap-1.5">
                                <Avatar className="h-4 w-4 shrink-0">
                                    {deal.contact.avatar && <AvatarImage src={deal.contact.avatar} />}
                                    <AvatarFallback
                                        className={cn("text-[7px] font-bold bg-gradient-to-br", avatarColor(deal.contact.id))}
                                    >
                                        {getInitials(deal.contact.name, 2)}
                                    </AvatarFallback>
                                </Avatar>
                                <span className="truncate text-[10px] text-t2">
                                    {deal.contact.name}
                                </span>
                            </div>
                        ) : (
                            <span className="text-[10px] text-t3">Sem contato</span>
                        )}
                        {deal.owner && (
                            <Avatar className="h-4 w-4 shrink-0" title={deal.owner.name}>
                                {deal.owner.avatar && <AvatarImage src={deal.owner.avatar} />}
                                <AvatarFallback
                                    className={cn("text-[7px] font-bold bg-gradient-to-br", avatarColor(deal.owner.id))}
                                >
                                    {getInitials(deal.owner.name, 1)}
                                </AvatarFallback>
                            </Avatar>
                        )}
                    </div>

                    {/* Value + close date */}
                    <div className="mb-2 flex items-center justify-between gap-2">
                        <span className={cn(
                            "font-mono text-[11px] font-medium",
                            deal.value ? "text-jade" : "text-t3",
                        )}>
                            {deal.value ? formatCurrency(deal.value, { compact: true }) : "—"}
                        </span>
                        {daysToClose !== null && (
                            <span className={cn(
                                "flex items-center gap-0.5 font-mono text-[10px]",
                                daysToClose < 0 ? "text-rose" : daysToClose <= 7 ? "text-amber" : "text-t3",
                            )}>
                                <Clock className="h-2.5 w-2.5" />
                                {daysToClose < 0
                                    ? `${Math.abs(daysToClose)}d atrasado`
                                    : `${daysToClose}d`}
                            </span>
                        )}
                    </div>

                    {/* Active agent indicator */}
                    {hasActiveAgent && (
                        <div className="mb-2 flex items-center gap-1.5 rounded-[6px] bg-violet/[0.08] px-2 py-1">
                            <Bot className="h-3 w-3 text-violet" />
                            <span className="text-[10px] text-violet">Agente ativo</span>
                            {confidencePct > 0 && (
                                <div className="ml-auto flex items-center gap-1">
                                    <div className="h-1 w-10 overflow-hidden rounded-full bg-violet/20">
                                        <div
                                            className="h-full rounded-full bg-violet"
                                            style={{ width: `${confidencePct}%` }}
                                        />
                                    </div>
                                    <span className="font-mono text-[9px] text-violet/70">{confidencePct}%</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* UTM source */}
                    {deal.utmSource && (
                        <p className="mb-1 truncate font-mono text-[10px] text-t3">
                            📣 {deal.utmSource}{deal.utmCampaign ? ` · ${deal.utmCampaign}` : ""}
                        </p>
                    )}

                    {/* Last activity */}
                    {deal.lastActivityAt && (
                        <p className="font-mono text-[10px] text-t3">
                            ⚡ {formatRelative(deal.lastActivityAt)}
                        </p>
                    )}

                    {/* Probability bar (when no agent) */}
                    {confidencePct > 0 && !hasActiveAgent && (
                        <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-surface-3">
                            <div
                                className="h-full rounded-full bg-jade transition-all"
                                style={{ width: `${confidencePct}%` }}
                            />
                        </div>
                    )}

                    {/* Hover quick actions */}
                    {hovered && !snapshot.isDragging && (
                        <div
                            className="absolute -top-2 right-2 flex items-center gap-0.5 rounded-[8px] border border-[var(--rim2)] bg-surface-3 px-1.5 py-1 shadow-xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button
                                className="flex h-5 w-5 items-center justify-center rounded text-t2 transition-colors hover:text-t1"
                                title="Abrir deal"
                                onClick={(e) => { e.stopPropagation(); onClick(deal); }}
                            >
                                <Edit className="h-3 w-3" />
                            </button>
                        </div>
                    )}
                </div>
            )}
        </Draggable>
    );
}
