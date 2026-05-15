"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Settings } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    usePipelines,
    usePipeline,
    useMoveDeal,
    useCreateDeal,
} from "@/hooks/usePipeline";
import type { PipelineDeal, PipelineStage } from "@/hooks/usePipeline";
import { useSocket } from "@/hooks/useSocket";
import { PipelineSelector } from "@/components/modules/pipeline/pipeline-selector";
import { FilterBar, DEFAULT_FILTERS } from "@/components/modules/pipeline/filter-bar";
import type { FilterState } from "@/components/modules/pipeline/filter-bar";
import { KanbanBoard } from "@/components/modules/pipeline/kanban-board";
import { ListView } from "@/components/modules/pipeline/list-view";
import { FunnelView } from "@/components/modules/pipeline/funnel-view";
import { DealDrawer } from "@/components/modules/pipeline/deal-drawer";
import { StageConfigModal } from "@/components/modules/pipeline/stage-config-modal";
import { PipelineForecastPanel } from "@/components/modules/pipeline/forecast-panel";

// ── Constants ──────────────────────────────────────────────────────────────────

const LS_KEY = "crm:pipeline:selected";
const PULSE_TTL = 4_000; // ms highlight duration after socket event

// ── New Deal Dialog ────────────────────────────────────────────────────────────

interface NewDealForm {
    title: string;
    value: string;
    stageId: string;
}

function NewDealDialog({
    open,
    onOpenChange,
    pipelineId,
    stages,
    defaultStageId,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    pipelineId: string;
    stages: PipelineStage[];
    defaultStageId: string;
}) {
    const [form, setForm] = useState<NewDealForm>({
        title: "",
        value: "",
        stageId: defaultStageId || stages[0]?.id || "",
    });
    const createDeal = useCreateDeal();

    useEffect(() => {
        if (open) {
            setForm({ title: "", value: "", stageId: defaultStageId || stages[0]?.id || "" });
        }
    }, [open, defaultStageId, stages]);

    const set = <K extends keyof NewDealForm>(k: K, v: NewDealForm[K]) =>
        setForm((f) => ({ ...f, [k]: v }));

    const handleCreate = async () => {
        if (!form.title.trim()) { toast.error("Informe o título do deal"); return; }
        try {
            await createDeal.mutateAsync({
                title: form.title.trim(),
                pipelineId,
                stageId: form.stageId,
                value: form.value ? Number(form.value) : undefined,
            });
            toast.success("Deal criado");
            onOpenChange(false);
        } catch {
            toast.error("Erro ao criar deal");
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>Novo deal</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <Label className="text-xs text-t2">Título</Label>
                        <Input
                            placeholder="Ex: Proposta Empresa XYZ"
                            value={form.title}
                            onChange={(e) => set("title", e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                            className="text-sm"
                            autoFocus
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs text-t2">Valor <span className="text-t3">(opcional)</span></Label>
                        <Input
                            type="number"
                            placeholder="0,00"
                            value={form.value}
                            onChange={(e) => set("value", e.target.value)}
                            className="text-sm"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs text-t2">Etapa</Label>
                        <Select value={form.stageId} onValueChange={(v) => set("stageId", v)}>
                            <SelectTrigger className="text-sm">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {stages.map((s) => (
                                    <SelectItem key={s.id} value={s.id}>
                                        <div className="flex items-center gap-2">
                                            <span
                                                className="h-1.5 w-1.5 rounded-full"
                                                style={{ backgroundColor: s.color }}
                                            />
                                            {s.name}
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                        Cancelar
                    </Button>
                    <Button size="sm" onClick={handleCreate} disabled={createDeal.isPending}>
                        Criar deal
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function PipelinePage() {
    const qc = useQueryClient();
    const { socket } = useSocket();

    // ── Selected pipeline (persisted in localStorage) ─────────────────────────
    const [selectedId, setSelectedId] = useState<string>(() => {
        if (typeof window !== "undefined") {
            return localStorage.getItem(LS_KEY) ?? "";
        }
        return "";
    });

    const handleSelectPipeline = (id: string) => {
        setSelectedId(id);
        localStorage.setItem(LS_KEY, id);
    };

    // ── Data ───────────────────────────────────────────────────────────────────
    const { data: pipelines = [], isLoading: loadingPipelines } = usePipelines();
    const activePipelineId = selectedId || pipelines[0]?.id || "";
    // ── UI state ───────────────────────────────────────────────────────────────
    const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
    const { data: pipeline, isLoading: loadingPipeline } = usePipeline(activePipelineId, {
        tags: filters.tagIds.length > 0 ? filters.tagIds.join(",") : undefined,
    });

    useEffect(() => {
        if (!selectedId && pipelines.length > 0 && pipelines[0]) {
            handleSelectPipeline(pipelines[0].id);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pipelines]);

    const moveDeal = useMoveDeal();

    // ── UI state ───────────────────────────────────────────────────────────────
    const [selectedDeal, setSelectedDeal] = useState<PipelineDeal | null>(null);
    const [newDealOpen, setNewDealOpen] = useState(false);
    const [defaultStageId, setDefaultStageId] = useState("");
    const [stageConfigOpen, setStageConfigOpen] = useState(false);
    const [configStage, setConfigStage] = useState<PipelineStage | null>(null);
    const [pulsatingDealIds, setPulsatingDealIds] = useState<Set<string>>(new Set());
    const pulseTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    const pulseDeal = useCallback((dealId: string) => {
        setPulsatingDealIds((prev) => new Set([...prev, dealId]));
        const existing = pulseTimers.current.get(dealId);
        if (existing) clearTimeout(existing);
        const timer = setTimeout(() => {
            setPulsatingDealIds((prev) => {
                const next = new Set(prev);
                next.delete(dealId);
                return next;
            });
            pulseTimers.current.delete(dealId);
        }, PULSE_TTL);
        pulseTimers.current.set(dealId, timer);
    }, []);

    // ── Realtime socket events ─────────────────────────────────────────────────
    useEffect(() => {
        if (!socket) return;

        const onDealMoved = (payload: {
            dealId: string;
            dealTitle: string;
            toStageName: string;
            movedBy: string;
        }) => {
            qc.invalidateQueries({ queryKey: ["pipelines"] });
            qc.invalidateQueries({ queryKey: ["deals", payload.dealId] });
            pulseDeal(payload.dealId);
            if (payload.movedBy === "AGENT") {
                toast.info(`🤖 Agente moveu "${payload.dealTitle}" para ${payload.toStageName}`);
            }
        };

        const onDealsRotting = () => {
            qc.invalidateQueries({ queryKey: ["pipelines"] });
            toast.warning("⚠️ Deals parados detectados");
        };

        const onAgentProactive = (payload: { dealTitle?: string; contactName?: string }) => {
            toast.info(
                `🤖 Agente iniciou contato${payload.contactName ? ` com ${payload.contactName}` : ""}${payload.dealTitle ? ` em "${payload.dealTitle}"` : ""}`,
            );
        };

        const onStageChanged = () => {
            qc.invalidateQueries({ queryKey: ["pipelines"] });
        };

        const onAutomationExecuted = (payload: {
            ruleName?: string;
            stageName?: string;
            status?: "SUCCESS" | "FAILED" | "SKIPPED";
        }) => {
            qc.invalidateQueries({ queryKey: ["pipelines"] });
            if (payload.status === "FAILED") {
                toast.error(`⚡ Automação falhou: ${payload.ruleName ?? "regra"}`);
            } else if (payload.status === "SUCCESS") {
                toast.success(`⚡ ${payload.ruleName ?? "Automação"} executada${payload.stageName ? ` em ${payload.stageName}` : ""}`);
            }
        };

        socket.on("pipeline:deal_moved", onDealMoved);
        socket.on("pipeline:movement", onDealMoved);
        socket.on("pipeline:deals_rotting", onDealsRotting);
        socket.on("agent:proactive_contact", onAgentProactive);
        socket.on("pipeline:stage_created", onStageChanged);
        socket.on("pipeline:stage_updated", onStageChanged);
        socket.on("pipeline:stage_deleted", onStageChanged);
        socket.on("pipeline:stage_reordered", onStageChanged);
        socket.on("pipeline:automation_executed", onAutomationExecuted);

        return () => {
            socket.off("pipeline:deal_moved", onDealMoved);
            socket.off("pipeline:movement", onDealMoved);
            socket.off("pipeline:deals_rotting", onDealsRotting);
            socket.off("agent:proactive_contact", onAgentProactive);
            socket.off("pipeline:stage_created", onStageChanged);
            socket.off("pipeline:stage_updated", onStageChanged);
            socket.off("pipeline:stage_deleted", onStageChanged);
            socket.off("pipeline:stage_reordered", onStageChanged);
            socket.off("pipeline:automation_executed", onAutomationExecuted);
        };
    }, [socket, qc, pulseDeal]);

    // ── Filter deals ───────────────────────────────────────────────────────────
    const allDeals = pipeline?.deals ?? [];
    const filteredDeals = allDeals.filter((d) => {
        if (filters.search && !d.title.toLowerCase().includes(filters.search.toLowerCase())) return false;
        if (filters.isRotting && !d.isRotting) return false;
        if (filters.hasAgent && !d.activeAgentSessionId) return false;
        if (filters.ownerId && d.ownerId !== filters.ownerId) return false;
        if (filters.tagIds.length > 0) {
            const dealTagIds = new Set((d.tags ?? []).map((t) => t.id));
            // OR semantics: keep deals matching at least one selected tag.
            if (!filters.tagIds.some((id) => dealTagIds.has(id))) return false;
        }
        return true;
    });

    // ── Handlers ───────────────────────────────────────────────────────────────
    const handleMoveDeal = async (dealId: string, toStageId: string, reason: string) => {
        await moveDeal.mutateAsync({ dealId, toStageId, reason });
    };

    const handleAddDeal = (stageId: string) => {
        setDefaultStageId(stageId);
        setNewDealOpen(true);
    };

    const handleStageMenu = (stage: PipelineStage) => {
        setConfigStage(stage);
        setStageConfigOpen(true);
    };

    // ── Loading skeleton ───────────────────────────────────────────────────────
    if (loadingPipelines || (!pipeline && loadingPipeline)) {
        return (
            <div className="flex h-full flex-col gap-4 p-6">
                <div className="flex items-center gap-3">
                    <Skeleton className="h-9 w-52 rounded-[10px]" />
                    <Skeleton className="ml-auto h-9 w-24 rounded-[10px]" />
                </div>
                <Skeleton className="h-8 w-full rounded-[8px]" />
                <div className="flex gap-3 overflow-hidden">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="w-[264px] shrink-0 space-y-2">
                            <Skeleton className="h-14 rounded-[10px]" />
                            {[...Array(3)].map((_, j) => (
                                <Skeleton key={j} className="h-28 rounded-[10px]" />
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col overflow-hidden">
            {/* ── Header ──────────────────────────────────────────────────────── */}
            <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--rim)] px-6 py-3">
                <PipelineSelector
                    pipelines={pipelines}
                    value={activePipelineId}
                    onValueChange={handleSelectPipeline}
                />
                <div className="flex flex-1 items-center justify-end gap-2">
                    <Link href="/pipeline/settings">
                        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-t2">
                            <Settings className="h-3.5 w-3.5" />
                            Pipelines
                        </Button>
                    </Link>
                    <Button
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                        onClick={() => { setDefaultStageId(""); setNewDealOpen(true); }}
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Novo Deal
                    </Button>
                </div>
            </div>

            {/* ── Forecast widget ─────────────────────────────────────────────── */}
            {/* The panel manages its own padding / border so the "hidden"
                mode collapses cleanly without leaving an empty strip. */}
            <PipelineForecastPanel pipelineId={activePipelineId} />

            {/* ── Filter bar ──────────────────────────────────────────────────── */}
            <div className="shrink-0 border-b border-[var(--rim)] px-6 py-2">
                <FilterBar filters={filters} onFiltersChange={setFilters} />
            </div>

            {/* ── Content ─────────────────────────────────────────────────────── */}
            <div className="min-h-0 flex-1 overflow-auto p-6">
                {!pipeline ? (
                    <div className="flex h-full items-center justify-center text-sm text-t3">
                        Selecione um pipeline para visualizar.
                    </div>
                ) : filters.view === "kanban" ? (
                    <KanbanBoard
                        pipeline={pipeline}
                        filteredDeals={filteredDeals}
                        pulsatingDealIds={pulsatingDealIds}
                        onDealClick={setSelectedDeal}
                        onAddDeal={handleAddDeal}
                        onStageMenu={handleStageMenu}
                        onMoveDeal={handleMoveDeal}
                    />
                ) : filters.view === "list" ? (
                    <ListView
                        deals={filteredDeals}
                        stages={pipeline.stages}
                        onDealClick={setSelectedDeal}
                    />
                ) : (
                    <FunnelView pipelineId={activePipelineId} />
                )}
            </div>

            {/* ── Deal drawer ─────────────────────────────────────────────────── */}
            <DealDrawer
                deal={selectedDeal}
                open={!!selectedDeal}
                onOpenChange={(open) => !open && setSelectedDeal(null)}
            />

            {/* ── New deal dialog ──────────────────────────────────────────────── */}
            <NewDealDialog
                open={newDealOpen}
                onOpenChange={setNewDealOpen}
                pipelineId={activePipelineId}
                stages={pipeline?.stages ?? []}
                defaultStageId={defaultStageId}
            />

            {/* ── Stage config modal ───────────────────────────────────────────── */}
            {configStage && (
                <StageConfigModal
                    stage={configStage}
                    pipelineId={activePipelineId}
                    open={stageConfigOpen}
                    onOpenChange={(open) => {
                        setStageConfigOpen(open);
                        if (!open) setConfigStage(null);
                    }}
                />
            )}
        </div>
    );
}
