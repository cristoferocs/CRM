"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useCreatePipeline, useUpdatePipeline } from "@/hooks/usePipeline";
import type { PipelineSummary } from "@/hooks/usePipeline";

// ── Pipeline types ─────────────────────────────────────────────────────────────

const PIPELINE_TYPES = [
    {
        value: "SALES",
        label: "Vendas",
        description: "Qualificação → proposta → fechamento",
    },
    {
        value: "LEADS",
        label: "Geração de Leads",
        description: "Captura e qualificação de novos leads",
    },
    {
        value: "MARKETING",
        label: "Marketing",
        description: "Nutrição de leads por conteúdo e campanhas",
    },
    {
        value: "ONBOARDING",
        label: "Onboarding",
        description: "Acompanhamento de novos clientes",
    },
    {
        value: "CUSTOM",
        label: "Personalizado",
        description: "Fluxo customizado para o seu negócio",
    },
];

// ── Colors ─────────────────────────────────────────────────────────────────────

const COLORS = [
    "#7c5cfc", "#00d4ff", "#00e5a0", "#ff4d6d",
    "#ffb547", "#a78bfa",
];

// ── Props ──────────────────────────────────────────────────────────────────────

interface CreatePipelineModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Pass to edit an existing pipeline */
    pipeline?: PipelineSummary;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function CreatePipelineModal({ open, onOpenChange, pipeline }: CreatePipelineModalProps) {
    const isEdit = !!pipeline;

    const [form, setForm] = useState({
        name: "",
        description: "",
        type: "SALES",
        color: COLORS[0]!,
        rottingDays: "14",
    });

    // Sync when opening in edit mode
    useEffect(() => {
        if (open && pipeline) {
            setForm({
                name: pipeline.name,
                description: "",
                type: pipeline.type,
                color: pipeline.color ?? COLORS[0]!,
                rottingDays: String(pipeline.rottingDays ?? 14),
            });
        } else if (open && !pipeline) {
            setForm({ name: "", description: "", type: "SALES", color: COLORS[0]!, rottingDays: "14" });
        }
    }, [open, pipeline]);

    const createPipeline = useCreatePipeline();
    const updatePipeline = useUpdatePipeline(pipeline?.id ?? "");

    const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
        setForm((f) => ({ ...f, [k]: v }));

    const handleSubmit = async () => {
        if (!form.name.trim()) {
            toast.error("Informe um nome para o pipeline");
            return;
        }
        try {
            const payload = {
                name: form.name.trim(),
                description: form.description.trim() || undefined,
                type: form.type,
                color: form.color,
                rottingDays: form.rottingDays ? Number(form.rottingDays) : undefined,
            };
            if (isEdit) {
                await updatePipeline.mutateAsync(payload);
                toast.success("Pipeline atualizado");
            } else {
                await createPipeline.mutateAsync(payload);
                toast.success("Pipeline criado");
            }
            onOpenChange(false);
        } catch {
            toast.error("Erro ao salvar pipeline");
        }
    };

    const isPending = createPipeline.isPending || updatePipeline.isPending;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{isEdit ? "Editar pipeline" : "Novo pipeline"}</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Name */}
                    <div className="space-y-1.5">
                        <Label className="text-xs text-t2">Nome</Label>
                        <Input
                            placeholder="Ex: Vendas Enterprise"
                            value={form.name}
                            onChange={(e) => set("name", e.target.value)}
                            className="text-sm"
                        />
                    </div>

                    {/* Description */}
                    <div className="space-y-1.5">
                        <Label className="text-xs text-t2">
                            Descrição <span className="text-t3">(opcional)</span>
                        </Label>
                        <Textarea
                            placeholder="Para que serve este pipeline..."
                            value={form.description}
                            onChange={(e) => set("description", e.target.value)}
                            className="min-h-[60px] resize-none text-sm"
                        />
                    </div>

                    {/* Type */}
                    <div className="space-y-1.5">
                        <Label className="text-xs text-t2">Tipo</Label>
                        <div className="grid grid-cols-1 gap-2">
                            {PIPELINE_TYPES.map((t) => (
                                <button
                                    key={t.value}
                                    onClick={() => set("type", t.value)}
                                    className={cn(
                                        "rounded-[10px] border px-3 py-2.5 text-left transition-colors",
                                        form.type === t.value
                                            ? "border-violet/40 bg-violet/[0.08] text-t1"
                                            : "border-[var(--rim)] bg-surface-2 text-t2 hover:border-[var(--rim2)]",
                                    )}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-medium">{t.label}</span>
                                        {form.type === t.value && (
                                            <span className="h-1.5 w-1.5 rounded-full bg-violet" />
                                        )}
                                    </div>
                                    <p className="mt-0.5 text-[11px] text-t3">{t.description}</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Color */}
                    <div className="space-y-1.5">
                        <Label className="text-xs text-t2">Cor</Label>
                        <div className="flex gap-2">
                            {COLORS.map((c) => (
                                <button
                                    key={c}
                                    onClick={() => set("color", c)}
                                    className={cn(
                                        "h-7 w-7 rounded-full transition-transform hover:scale-110",
                                        form.color === c && "ring-2 ring-white ring-offset-2 ring-offset-surface",
                                    )}
                                    style={{ backgroundColor: c }}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Rotting days */}
                    <div className="space-y-1.5">
                        <Label className="text-xs text-t2">Dias até considerar deal parado</Label>
                        <Input
                            type="number"
                            placeholder="14"
                            value={form.rottingDays}
                            onChange={(e) => set("rottingDays", e.target.value)}
                            className="text-sm"
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                        Cancelar
                    </Button>
                    <Button size="sm" onClick={handleSubmit} disabled={isPending}>
                        {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        {isEdit ? "Salvar alterações" : "Criar pipeline"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
