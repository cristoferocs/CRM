"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
    DragDropContext,
    Droppable,
    Draggable,
    type DropResult,
} from "@hello-pangea/dnd";
import { Plus, Loader2, Calendar, DollarSign, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from "@/components/ui/sheet";
import {
    usePipelines,
    usePipeline,
    useMoveDeal,
    useCreateDeal,
    type PipelineDeal,
} from "@/hooks/usePipeline";
import { useContacts } from "@/hooks/useContacts";
import { formatCurrency, formatDate, cn } from "@/lib/utils";

// ── Deal schema ───────────────────────────────────────────────────────────────

const dealSchema = z.object({
    title: z.string().min(2, "Título obrigatório"),
    value: z.string().optional(),
    stageId: z.string().min(1, "Selecione um estágio"),
    contactId: z.string().optional(),
    expectedCloseDate: z.string().optional(),
    probability: z.string().optional(),
});

type DealFormValues = z.infer<typeof dealSchema>;

// ── Stage colors ──────────────────────────────────────────────────────────────

const STAGE_BG_COLORS: Record<number, string> = {
    0: "bg-violet",
    1: "bg-cyan",
    2: "bg-amber",
    3: "bg-rose",
    4: "bg-jade",
};

// ── Deal Card ─────────────────────────────────────────────────────────────────

function DealCard({
    deal,
    index,
    onClick,
}: {
    deal: PipelineDeal;
    index: number;
    onClick: (deal: PipelineDeal) => void;
}) {
    return (
        <Draggable draggableId={deal.id} index={index}>
            {(provided, snapshot) => (
                <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    onClick={() => onClick(deal)}
                    className={cn(
                        "cursor-pointer rounded-[10px] border border-[var(--rim)] bg-surface-2 p-3",
                        "transition-all hover:border-[var(--rim2)] hover:translate-x-0.5",
                        snapshot.isDragging && "shadow-2xl scale-105 border-violet/30 bg-surface-3",
                    )}
                >
                    <p className="mb-2 text-xs font-medium leading-tight text-t1">{deal.title}</p>
                    <div className="flex items-center justify-between">
                        <span className="font-mono text-[11px] text-jade">
                            {deal.value ? formatCurrency(deal.value, { compact: true }) : "—"}
                        </span>
                        {deal.contact && (
                            <Avatar className="h-[18px] w-[18px]">
                                <AvatarFallback className="text-[8px] font-bold bg-gradient-to-br from-violet to-cyan">
                                    {deal.contact.name
                                        .split(" ")
                                        .slice(0, 2)
                                        .map((n) => n[0])
                                        .join("")}
                                </AvatarFallback>
                            </Avatar>
                        )}
                    </div>
                    {deal.expectedCloseDate && (
                        <p className="mt-1.5 font-mono text-[10px] text-t3">
                            📅 {formatDate(deal.expectedCloseDate)}
                        </p>
                    )}
                    {deal.probability !== null && (
                        <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-surface-3">
                            <div
                                className="h-full rounded-full bg-jade transition-all"
                                style={{ width: `${deal.probability}%` }}
                            />
                        </div>
                    )}
                </div>
            )}
        </Draggable>
    );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PipelinePage() {
    const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
    const [newDealDialogOpen, setNewDealDialogOpen] = useState(false);
    const [selectedDeal, setSelectedDeal] = useState<PipelineDeal | null>(null);
    const [defaultStageId, setDefaultStageId] = useState<string | null>(null);

    const { data: pipelines, isLoading: pipelinesLoading } = usePipelines();

    // Use first pipeline if none selected
    const activePipelineId = selectedPipelineId ?? pipelines?.[0]?.id ?? "";
    const { data: pipeline, isLoading: pipelineLoading } = usePipeline(activePipelineId);

    const moveDeal = useMoveDeal();
    const createDeal = useCreateDeal();
    const { data: contactsData } = useContacts({ limit: 100 });

    const isLoading = pipelinesLoading || pipelineLoading;

    // ── Form ──────────────────────────────────────────────────────────────────

    const {
        register,
        handleSubmit,
        reset,
        setValue,
        watch,
        formState: { errors, isSubmitting },
    } = useForm<DealFormValues>({
        resolver: zodResolver(dealSchema),
        defaultValues: { title: "", value: "", stageId: "", contactId: "", expectedCloseDate: "", probability: "" },
    });

    const stageIdValue = watch("stageId");
    const contactIdValue = watch("contactId");

    const openNewDeal = (stageId?: string) => {
        reset({ title: "", value: "", stageId: stageId ?? pipeline?.stages?.[0]?.id ?? "", contactId: "", expectedCloseDate: "", probability: "" });
        if (stageId) setDefaultStageId(stageId);
        setNewDealDialogOpen(true);
    };

    const onSubmitDeal = async (values: DealFormValues) => {
        try {
            await createDeal.mutateAsync({
                title: values.title,
                stageId: values.stageId,
                pipelineId: activePipelineId,
                value: values.value ? Number(values.value) : undefined,
                contactId: values.contactId || undefined,
                expectedCloseDate: values.expectedCloseDate || undefined,
                probability: values.probability ? Number(values.probability) : undefined,
            });
            toast.success("Deal criado com sucesso");
            setNewDealDialogOpen(false);
        } catch {
            toast.error("Erro ao criar deal");
        }
    };

    // ── Drag and Drop ─────────────────────────────────────────────────────────

    const onDragEnd = async (result: DropResult) => {
        if (!result.destination) return;
        const { draggableId, destination } = result;
        if (result.source.droppableId === destination.droppableId) return;

        await moveDeal.mutateAsync({
            dealId: draggableId,
            stageId: destination.droppableId,
        });
    };

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="flex h-full flex-col space-y-5 animate-fade-in">
            {/* Header */}
            <div className="flex items-end justify-between">
                <div>
                    <h1 className="font-display text-[28px] font-semibold leading-none tracking-[-0.8px] text-t1">
                        Pipeline
                    </h1>
                    <p className="mt-1.5 text-sm text-t2">
                        {pipeline?.name ?? "Funil Principal"}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Pipeline selector */}
                    {(pipelines?.length ?? 0) > 1 && (
                        <Select
                            value={activePipelineId}
                            onValueChange={setSelectedPipelineId}
                        >
                            <SelectTrigger className="w-48">
                                <SelectValue placeholder="Selecionar pipeline" />
                            </SelectTrigger>
                            <SelectContent>
                                {pipelines?.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>
                                        {p.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                    <Button onClick={() => openNewDeal()}>
                        <Plus className="h-4 w-4" /> Novo Deal
                    </Button>
                </div>
            </div>

            {/* Stats row */}
            {pipeline && (
                <div className="flex items-center gap-6 font-mono text-[11px] text-t3">
                    <span>
                        <span className="text-t1 font-semibold">{pipeline.deals?.length ?? 0}</span> deals
                    </span>
                    <span>
                        <span className="text-jade font-semibold">
                            {formatCurrency(
                                (pipeline.deals ?? []).reduce((acc, d) => acc + (d.value ?? 0), 0),
                                { compact: true },
                            )}
                        </span>{" "}
                        em aberto
                    </span>
                </div>
            )}

            {/* Kanban board */}
            {isLoading ? (
                <div className="flex flex-1 gap-3 overflow-x-auto pb-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="w-64 shrink-0 space-y-2">
                            <Skeleton className="h-8 w-full rounded-[10px]" />
                            <Skeleton className="h-24 w-full rounded-[10px]" />
                            <Skeleton className="h-24 w-full rounded-[10px]" />
                        </div>
                    ))}
                </div>
            ) : (
                <DragDropContext onDragEnd={onDragEnd}>
                    <div className="flex flex-1 gap-3 overflow-x-auto pb-4">
                        {(pipeline?.stages ?? []).map((stage, si) => {
                            const stageDeals = (pipeline?.deals ?? []).filter(
                                (d) => d.stageId === stage.id,
                            );
                            const totalValue = stageDeals.reduce(
                                (acc, d) => acc + (d.value ?? 0),
                                0,
                            );

                            return (
                                <div key={stage.id} className="w-64 shrink-0 flex flex-col">
                                    {/* Column header */}
                                    <div className="mb-3 flex items-center justify-between">
                                        <span className="font-mono text-[11px] font-medium text-t1">
                                            {stage.name}
                                        </span>
                                        <div className="flex items-center gap-2">
                                            {totalValue > 0 && (
                                                <span className="font-mono text-[10px] text-jade">
                                                    {formatCurrency(totalValue, { compact: true })}
                                                </span>
                                            )}
                                            <span className="rounded-[10px] bg-surface-2 px-1.5 py-px font-mono text-[10px] text-t3">
                                                {stageDeals.length}
                                            </span>
                                        </div>
                                    </div>
                                    <div
                                        className={cn(
                                            "mb-3 h-0.5 rounded-full",
                                            STAGE_BG_COLORS[si] ?? "bg-t3",
                                        )}
                                    />

                                    {/* Drop zone */}
                                    <Droppable droppableId={stage.id}>
                                        {(provided, snapshot) => (
                                            <div
                                                ref={provided.innerRef}
                                                {...provided.droppableProps}
                                                className={cn(
                                                    "flex-1 space-y-2 rounded-[10px] transition-colors min-h-[100px]",
                                                    snapshot.isDraggingOver && "bg-violet/[0.04] ring-1 ring-violet/20",
                                                )}
                                            >
                                                {stageDeals.map((deal, index) => (
                                                    <DealCard
                                                        key={deal.id}
                                                        deal={deal}
                                                        index={index}
                                                        onClick={setSelectedDeal}
                                                    />
                                                ))}
                                                {provided.placeholder}
                                                <button
                                                    onClick={() => openNewDeal(stage.id)}
                                                    className="flex w-full items-center gap-2 rounded-[10px] border border-dashed border-[var(--rim)] px-3 py-2.5 text-xs text-t3 transition-colors hover:border-[var(--rim2)] hover:text-t2"
                                                >
                                                    <Plus className="h-3.5 w-3.5" /> Adicionar
                                                </button>
                                            </div>
                                        )}
                                    </Droppable>
                                </div>
                            );
                        })}
                    </div>
                </DragDropContext>
            )}

            {/* New Deal Dialog */}
            <Dialog open={newDealDialogOpen} onOpenChange={setNewDealDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Novo Deal</DialogTitle>
                    </DialogHeader>

                    <form onSubmit={handleSubmit(onSubmitDeal)} className="space-y-4">
                        <div className="space-y-1.5">
                            <Label>Título *</Label>
                            <Input placeholder="Ex: Proposta Empresa XYZ" {...register("title")} />
                            {errors.title && (
                                <p className="text-[11px] text-rose">{errors.title.message}</p>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>Valor (R$)</Label>
                                <Input type="number" placeholder="0" {...register("value")} />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Probabilidade (%)</Label>
                                <Input type="number" min={0} max={100} placeholder="50" {...register("probability")} />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label>Estágio *</Label>
                            <Select
                                value={stageIdValue}
                                onValueChange={(v) => setValue("stageId", v)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione o estágio" />
                                </SelectTrigger>
                                <SelectContent>
                                    {(pipeline?.stages ?? []).map((s) => (
                                        <SelectItem key={s.id} value={s.id}>
                                            {s.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {errors.stageId && (
                                <p className="text-[11px] text-rose">{errors.stageId.message}</p>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <Label>Contato</Label>
                            <Select
                                value={contactIdValue ?? ""}
                                onValueChange={(v) => setValue("contactId", v)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Vincular contato (opcional)" />
                                </SelectTrigger>
                                <SelectContent>
                                    {(contactsData?.contacts ?? []).map((c) => (
                                        <SelectItem key={c.id} value={c.id}>
                                            {c.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label>Data esperada de fechamento</Label>
                            <Input type="date" {...register("expectedCloseDate")} />
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setNewDealDialogOpen(false)}>
                                Cancelar
                            </Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                                Criar Deal
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Deal detail sheet */}
            <Sheet open={!!selectedDeal} onOpenChange={(open) => !open && setSelectedDeal(null)}>
                <SheetContent side="right">
                    <SheetHeader>
                        <SheetTitle>{selectedDeal?.title}</SheetTitle>
                        <SheetDescription>Detalhes do deal</SheetDescription>
                    </SheetHeader>

                    {selectedDeal && (
                        <div className="flex flex-col gap-5 px-6 py-5">
                            {/* Value */}
                            <div className="rounded-[12px] border border-[var(--rim)] bg-surface-2 p-4">
                                <p className="font-mono text-[10px] uppercase tracking-widest text-t3">Valor</p>
                                <p className="mt-1 font-display text-2xl font-semibold text-jade">
                                    {selectedDeal.value
                                        ? formatCurrency(selectedDeal.value)
                                        : "Não definido"}
                                </p>
                            </div>

                            {/* Info rows */}
                            <div className="space-y-3">
                                {selectedDeal.contact && (
                                    <div className="flex items-center gap-3">
                                        <User className="h-4 w-4 text-t3" />
                                        <div>
                                            <p className="text-[11px] text-t3">Contato</p>
                                            <p className="text-sm text-t1">{selectedDeal.contact.name}</p>
                                        </div>
                                    </div>
                                )}
                                {selectedDeal.expectedCloseDate && (
                                    <div className="flex items-center gap-3">
                                        <Calendar className="h-4 w-4 text-t3" />
                                        <div>
                                            <p className="text-[11px] text-t3">Fechamento esperado</p>
                                            <p className="text-sm text-t1">
                                                {formatDate(selectedDeal.expectedCloseDate)}
                                            </p>
                                        </div>
                                    </div>
                                )}
                                {selectedDeal.probability !== null && (
                                    <div className="flex items-center gap-3">
                                        <DollarSign className="h-4 w-4 text-t3" />
                                        <div>
                                            <p className="text-[11px] text-t3">Probabilidade</p>
                                            <div className="mt-1 flex items-center gap-2">
                                                <div className="h-1.5 w-32 overflow-hidden rounded-full bg-surface-3">
                                                    <div
                                                        className="h-full rounded-full bg-jade"
                                                        style={{ width: `${selectedDeal.probability}%` }}
                                                    />
                                                </div>
                                                <span className="font-mono text-xs text-jade">
                                                    {selectedDeal.probability}%
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Stage badges */}
                            <div>
                                <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-t3">Mover para estágio</p>
                                <div className="flex flex-wrap gap-2">
                                    {(pipeline?.stages ?? []).map((s) => (
                                        <Badge
                                            key={s.id}
                                            variant={s.id === selectedDeal.stageId ? "default" : "muted"}
                                            className={cn(
                                                "cursor-pointer transition-all hover:opacity-80",
                                                s.id !== selectedDeal.stageId && "hover:border-[var(--rim2)]",
                                            )}
                                            onClick={async () => {
                                                if (s.id === selectedDeal.stageId) return;
                                                await moveDeal.mutateAsync({ dealId: selectedDeal.id, stageId: s.id });
                                                setSelectedDeal((prev) => prev ? { ...prev, stageId: s.id } : null);
                                                toast.success("Deal movido");
                                            }}
                                        >
                                            {s.name}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </SheetContent>
            </Sheet>
        </div>
    );
}
