"use client";

import { useState } from "react";
import {
    DragDropContext,
    Droppable,
    type DropResult,
} from "@hello-pangea/dnd";
import {
    Bot,
    MoreHorizontal,
    AlertTriangle,
    Plus,
    Flame,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency, getInitials } from "@/lib/utils";
import type { Pipeline, PipelineDeal, PipelineStage } from "@/hooks/usePipeline";
import { DealCard } from "./deal-card";
import { MoveDealDialog } from "./move-deal-dialog";

// ── Stage type colors ──────────────────────────────────────────────────────────

const STAGE_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
    LEAD: { label: "Lead", color: "text-t3 border-t4" },
    NURTURING: { label: "Nutrição", color: "text-cyan border-cyan/20" },
    DECISION: { label: "Decisão", color: "text-violet border-violet/20" },
    PROPOSAL: { label: "Proposta", color: "text-amber border-amber/20" },
    WON: { label: "Ganho", color: "text-jade border-jade/20" },
    LOST: { label: "Perdido", color: "text-rose border-rose/20" },
    CUSTOM: { label: "Etapa", color: "text-t3 border-rim" },
};

// ── Props ──────────────────────────────────────────────────────────────────────

interface KanbanBoardProps {
    pipeline: Pipeline;
    filteredDeals: PipelineDeal[];
    pulsatingDealIds: Set<string>;
    onDealClick: (deal: PipelineDeal) => void;
    onAddDeal: (stageId: string) => void;
    onStageMenu: (stage: PipelineStage) => void;
    onMoveDeal: (dealId: string, toStageId: string, reason: string) => Promise<void>;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function KanbanBoard({
    pipeline,
    filteredDeals,
    pulsatingDealIds,
    onDealClick,
    onAddDeal,
    onStageMenu,
    onMoveDeal,
}: KanbanBoardProps) {
    const [pendingMove, setPendingMove] = useState<{
        dealId: string;
        targetStageId: string;
    } | null>(null);

    // Map dealId → deal for quick lookup
    const dealById = new Map(filteredDeals.map((d) => [d.id, d]));
    const stageById = new Map(pipeline.stages.map((s) => [s.id, s]));

    const onDragEnd = (result: DropResult) => {
        if (!result.destination) return;
        const { draggableId, source, destination } = result;
        if (source.droppableId === destination.droppableId) return;

        setPendingMove({ dealId: draggableId, targetStageId: destination.droppableId });
    };

    const pendingDeal = pendingMove ? dealById.get(pendingMove.dealId) : null;
    const targetStage = pendingMove ? stageById.get(pendingMove.targetStageId) : null;
    const missingFields = (() => {
        if (!targetStage || !pendingDeal) return [];
        const required = (targetStage.requiredFields as string[]) ?? [];
        const custom = (pendingDeal.customFields ?? {}) as Record<string, unknown>;
        return required.filter((f) => !custom[f]);
    })();

    const handleConfirmMove = async (reason: string) => {
        if (!pendingMove) return;
        await onMoveDeal(pendingMove.dealId, pendingMove.targetStageId, reason);
        setPendingMove(null);
    };

    return (
        <>
            <DragDropContext onDragEnd={onDragEnd}>
                <div className="flex h-full gap-3 overflow-x-auto pb-4">
                    {pipeline.stages.map((stage) => {
                        const stageDeals = filteredDeals.filter((d) => d.stageId === stage.id);
                        const totalValue = stageDeals.reduce((acc, d) => acc + (d.value ?? 0), 0);
                        const rottingCount = stageDeals.filter((d) => d.isRotting).length;
                        const typeConf = STAGE_TYPE_CONFIG[stage.type] ?? STAGE_TYPE_CONFIG["CUSTOM"]!;

                        return (
                            <div key={stage.id} className="flex w-[264px] shrink-0 flex-col">
                                {/* Column header */}
                                <div className="mb-3 space-y-2">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            {/* Color dot */}
                                            <span
                                                className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
                                                style={{ backgroundColor: stage.color || "#55556a" }}
                                            />
                                            <span className="truncate text-[12px] font-medium text-t1">
                                                {stage.name}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-1.5 shrink-0">
                                            {/* Rotting indicator */}
                                            {rottingCount > 0 && (
                                                <div className="flex items-center gap-0.5" title={`${rottingCount} deal(s) parado(s)`}>
                                                    <Flame className="h-3 w-3 text-amber" />
                                                    <span className="font-mono text-[10px] text-amber">{rottingCount}</span>
                                                </div>
                                            )}
                                            {/* Agent avatar */}
                                            {stage.agent && (
                                                <div className="relative" title={stage.agent.name}>
                                                    <Avatar className="h-5 w-5">
                                                        {stage.agent.avatar && <AvatarImage src={stage.agent.avatar} />}
                                                        <AvatarFallback className="bg-violet/20 text-[7px] text-violet">
                                                            {getInitials(stage.agent.name, 1)}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <span
                                                        className={cn(
                                                            "absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full border border-void",
                                                            stage.agent.status === "ACTIVE" ? "bg-jade" : "bg-t3",
                                                        )}
                                                    />
                                                </div>
                                            )}
                                            {/* Deal count */}
                                            <span className="rounded-[20px] bg-surface-3 px-1.5 py-px font-mono text-[10px] text-t3">
                                                {stageDeals.length}
                                            </span>
                                            {/* Menu */}
                                            <button
                                                onClick={() => onStageMenu(stage)}
                                                className="flex h-5 w-5 items-center justify-center rounded text-t3 transition-colors hover:bg-surface-3 hover:text-t2"
                                            >
                                                <MoreHorizontal className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Stage type + value row */}
                                    <div className="flex items-center gap-2">
                                        <span
                                            className={cn(
                                                "rounded-[20px] border px-1.5 py-px font-mono text-[10px]",
                                                typeConf.color,
                                            )}
                                        >
                                            {typeConf.label}
                                        </span>
                                        {totalValue > 0 && (
                                            <span className="font-mono text-[10px] text-jade">
                                                {formatCurrency(totalValue, { compact: true })}
                                            </span>
                                        )}
                                    </div>

                                    {/* Stage color bar */}
                                    <div
                                        className="h-0.5 rounded-full opacity-60"
                                        style={{ backgroundColor: stage.color || "var(--t4)" }}
                                    />
                                </div>

                                {/* Drop zone */}
                                <Droppable droppableId={stage.id}>
                                    {(provided, snapshot) => (
                                        <div
                                            ref={provided.innerRef}
                                            {...provided.droppableProps}
                                            className={cn(
                                                "flex-1 space-y-2 rounded-[10px] p-1 transition-colors",
                                                "min-h-[80px]",
                                                snapshot.isDraggingOver && "bg-violet/[0.04] ring-1 ring-inset ring-violet/15",
                                            )}
                                        >
                                            {stageDeals.map((deal, i) => (
                                                <DealCard
                                                    key={deal.id}
                                                    deal={deal}
                                                    index={i}
                                                    onClick={onDealClick}
                                                    pulsating={pulsatingDealIds.has(deal.id)}
                                                />
                                            ))}
                                            {provided.placeholder}
                                        </div>
                                    )}
                                </Droppable>

                                {/* Footer: add deal */}
                                <button
                                    onClick={() => onAddDeal(stage.id)}
                                    className="mt-2 flex w-full items-center gap-2 rounded-[10px] border border-dashed border-[var(--rim)] px-3 py-2 text-xs text-t3 transition-colors hover:border-[var(--rim2)] hover:text-t2"
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                    Adicionar
                                </button>
                            </div>
                        );
                    })}
                </div>
            </DragDropContext>

            {/* Move confirmation dialog */}
            <MoveDealDialog
                open={!!pendingMove}
                onOpenChange={(open) => !open && setPendingMove(null)}
                targetStage={targetStage ?? null}
                dealTitle={pendingDeal?.title ?? ""}
                missingFields={missingFields}
                onConfirm={handleConfirmMove}
            />
        </>
    );
}
