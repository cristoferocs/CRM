"use client";

import { useEffect, useRef, useState } from "react";
import {
    DragDropContext,
    Droppable,
    Draggable,
    type DropResult,
} from "@hello-pangea/dnd";
import {
    MoreHorizontal,
    Plus,
    Flame,
    Pencil,
    Trash2,
    Settings2,
    GripVertical,
} from "lucide-react";
import { toast } from "sonner";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, formatCurrency, getInitials } from "@/lib/utils";
import type { Pipeline, PipelineDeal, PipelineStage } from "@/hooks/usePipeline";
import {
    useReorderStages,
    useUpdateStage,
} from "@/hooks/usePipeline";
import { DealCard } from "./deal-card";
import { MoveDealDialog } from "./move-deal-dialog";
import { AddStageButton } from "./add-stage-button";
import { DeleteStageDialog } from "./delete-stage-dialog";

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

// ── Inline rename header ───────────────────────────────────────────────────────

function StageNameDisplay({
    stage,
    pipelineId,
}: {
    stage: PipelineStage;
    pipelineId: string;
}) {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(stage.name);
    const inputRef = useRef<HTMLInputElement>(null);
    const updateStage = useUpdateStage(stage.id, pipelineId);

    useEffect(() => {
        setValue(stage.name);
    }, [stage.name]);

    useEffect(() => {
        if (editing) {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [editing]);

    const commit = async () => {
        const trimmed = value.trim();
        if (!trimmed || trimmed === stage.name) {
            setEditing(false);
            setValue(stage.name);
            return;
        }
        try {
            await updateStage.mutateAsync({ name: trimmed });
            toast.success("Etapa renomeada.");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Erro ao renomear.");
            setValue(stage.name);
        }
        setEditing(false);
    };

    if (editing) {
        return (
            <input
                ref={inputRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === "Enter") commit();
                    if (e.key === "Escape") {
                        setValue(stage.name);
                        setEditing(false);
                    }
                }}
                className="min-w-0 flex-1 rounded border border-violet/40 bg-surface-2 px-1.5 py-0.5 text-[12px] font-medium text-t1 outline-none focus:border-violet"
            />
        );
    }

    return (
        <button
            onDoubleClick={() => setEditing(true)}
            className="truncate rounded text-left text-[12px] font-medium text-t1 hover:bg-surface-2 px-1 -mx-1"
            title="Duplo clique para renomear"
        >
            {stage.name}
        </button>
    );
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
    const [deleteTarget, setDeleteTarget] = useState<PipelineStage | null>(null);

    const reorderStages = useReorderStages(pipeline.id);

    const dealById = new Map(filteredDeals.map((d) => [d.id, d]));
    const stageById = new Map(pipeline.stages.map((s) => [s.id, s]));

    const sortedStages = [...pipeline.stages].sort((a, b) => a.order - b.order);

    const onDragEnd = (result: DropResult) => {
        if (!result.destination) return;
        const { type, draggableId, source, destination } = result;

        if (type === "COLUMN") {
            if (source.index === destination.index) return;
            const next = [...sortedStages];
            const [moved] = next.splice(source.index, 1);
            if (!moved) return;
            next.splice(destination.index, 0, moved);
            const payload = next.map((s, i) => ({ id: s.id, order: i }));
            reorderStages.mutate(payload, {
                onError: (err) => {
                    toast.error(err instanceof Error ? err.message : "Erro ao reordenar etapas.");
                },
            });
            return;
        }

        // DEAL drag
        if (source.droppableId === destination.droppableId) return;
        setPendingMove({ dealId: draggableId, targetStageId: destination.droppableId });
    };

    const pendingDeal = pendingMove ? dealById.get(pendingMove.dealId) : null;
    const targetStage = pendingMove ? stageById.get(pendingMove.targetStageId) : null;
    const missingFields = (() => {
        if (!targetStage || !pendingDeal) return [];
        const required = (targetStage.requiredFields as Array<string | { key: string }>) ?? [];
        const keys = required.map((f) =>
            typeof f === "string" ? f : (f as { key: string }).key,
        );
        const custom = (pendingDeal.customFields ?? {}) as Record<string, unknown>;
        return keys.filter((k) => !custom[k]);
    })();

    const handleConfirmMove = async (reason: string) => {
        if (!pendingMove) return;
        await onMoveDeal(pendingMove.dealId, pendingMove.targetStageId, reason);
        setPendingMove(null);
    };

    return (
        <>
            <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="board" type="COLUMN" direction="horizontal">
                    {(provided) => (
                        <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className="flex h-full gap-3 overflow-x-auto pb-4"
                        >
                            {sortedStages.map((stage, index) => {
                                const stageDeals = filteredDeals.filter((d) => d.stageId === stage.id);
                                const totalValue = stageDeals.reduce((acc, d) => acc + (d.value ?? 0), 0);
                                const rottingCount = stageDeals.filter((d) => d.isRotting).length;
                                const typeConf = STAGE_TYPE_CONFIG[stage.type] ?? STAGE_TYPE_CONFIG["CUSTOM"]!;
                                const autoCount =
                                    (stage.onEnterActions?.length ?? 0) +
                                    (stage.onExitActions?.length ?? 0) +
                                    (stage.onRottingActions?.length ?? 0);

                                return (
                                    <Draggable
                                        key={stage.id}
                                        draggableId={`stage:${stage.id}`}
                                        index={index}
                                    >
                                        {(dragProvided, dragSnapshot) => (
                                            <div
                                                ref={dragProvided.innerRef}
                                                {...dragProvided.draggableProps}
                                                className={cn(
                                                    "flex w-[264px] shrink-0 flex-col",
                                                    dragSnapshot.isDragging && "opacity-90",
                                                )}
                                            >
                                                <div className="mb-3 space-y-2">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                                            <button
                                                                {...dragProvided.dragHandleProps}
                                                                className="text-t4 hover:text-t2 cursor-grab active:cursor-grabbing"
                                                                title="Arrastar etapa"
                                                            >
                                                                <GripVertical className="h-3.5 w-3.5" />
                                                            </button>
                                                            <span
                                                                className="h-2 w-2 shrink-0 rounded-full"
                                                                style={{ backgroundColor: stage.color || "#55556a" }}
                                                            />
                                                            <StageNameDisplay stage={stage} pipelineId={pipeline.id} />
                                                        </div>

                                                        <div className="flex items-center gap-1.5 shrink-0">
                                                            {rottingCount > 0 && (
                                                                <div className="flex items-center gap-0.5" title={`${rottingCount} deal(s) parado(s)`}>
                                                                    <Flame className="h-3 w-3 text-amber" />
                                                                    <span className="font-mono text-[10px] text-amber">{rottingCount}</span>
                                                                </div>
                                                            )}
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
                                                            {autoCount > 0 && (
                                                                <span
                                                                    className="rounded-[20px] bg-violet/10 px-1.5 py-px font-mono text-[10px] text-violet"
                                                                    title={`${autoCount} automação(ões) configurada(s)`}
                                                                >
                                                                    ⚡ {autoCount}
                                                                </span>
                                                            )}
                                                            <span className="rounded-[20px] bg-surface-3 px-1.5 py-px font-mono text-[10px] text-t3">
                                                                {stageDeals.length}
                                                            </span>
                                                            <DropdownMenu>
                                                                <DropdownMenuTrigger asChild>
                                                                    <button className="flex h-5 w-5 items-center justify-center rounded text-t3 transition-colors hover:bg-surface-3 hover:text-t2">
                                                                        <MoreHorizontal className="h-3.5 w-3.5" />
                                                                    </button>
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent align="end" className="w-48">
                                                                    <DropdownMenuItem onClick={() => onStageMenu(stage)}>
                                                                        <Settings2 className="mr-2 h-3.5 w-3.5" />
                                                                        Configurar etapa
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuSeparator />
                                                                    <DropdownMenuItem
                                                                        onClick={() => setDeleteTarget(stage)}
                                                                        className="text-rose focus:text-rose"
                                                                    >
                                                                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                                                                        Excluir etapa
                                                                    </DropdownMenuItem>
                                                                </DropdownMenuContent>
                                                            </DropdownMenu>
                                                        </div>
                                                    </div>

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

                                                    <div
                                                        className="h-0.5 rounded-full opacity-60"
                                                        style={{ backgroundColor: stage.color || "var(--t4)" }}
                                                    />
                                                </div>

                                                <Droppable droppableId={stage.id} type="DEAL">
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

                                                <button
                                                    onClick={() => onAddDeal(stage.id)}
                                                    className="mt-2 flex w-full items-center gap-2 rounded-[10px] border border-dashed border-[var(--rim)] px-3 py-2 text-xs text-t3 transition-colors hover:border-[var(--rim2)] hover:text-t2"
                                                >
                                                    <Plus className="h-3.5 w-3.5" />
                                                    Adicionar
                                                </button>
                                            </div>
                                        )}
                                    </Draggable>
                                );
                            })}
                            {provided.placeholder}

                            <AddStageButton pipelineId={pipeline.id} nextOrder={sortedStages.length} />
                        </div>
                    )}
                </Droppable>
            </DragDropContext>

            <MoveDealDialog
                open={!!pendingMove}
                onOpenChange={(open) => !open && setPendingMove(null)}
                targetStage={targetStage ?? null}
                dealTitle={pendingDeal?.title ?? ""}
                missingFields={missingFields}
                onConfirm={handleConfirmMove}
            />

            <DeleteStageDialog
                pipelineId={pipeline.id}
                stage={deleteTarget}
                allStages={pipeline.stages}
                dealsInStage={filteredDeals.filter((d) => d.stageId === deleteTarget?.id)}
                open={!!deleteTarget}
                onOpenChange={(open) => !open && setDeleteTarget(null)}
            />
        </>
    );
}
