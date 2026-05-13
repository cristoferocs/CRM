"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, ChevronRight, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useUpdateStage } from "@/hooks/usePipeline";
import type { PipelineStage } from "@/hooks/usePipeline";

// ── Stage type options ─────────────────────────────────────────────────────────

const STAGE_TYPES = [
    { value: "LEAD", label: "Lead" },
    { value: "NURTURING", label: "Nutrição" },
    { value: "PROPOSAL", label: "Proposta" },
    { value: "DECISION", label: "Decisão" },
    { value: "WON", label: "Ganho" },
    { value: "LOST", label: "Perdido" },
    { value: "CUSTOM", label: "Personalizado" },
];

const AGENT_TRIGGERS = [
    { value: "NONE", label: "Nenhum" },
    { value: "AUTO_ENTER", label: "Ao entrar na etapa" },
    { value: "AUTO_ROTTING", label: "Ao ficar parado" },
    { value: "MANUAL", label: "Manual apenas" },
];

// ── Stage colors ───────────────────────────────────────────────────────────────

const COLORS = [
    "#7c5cfc", "#00d4ff", "#00e5a0", "#ff4d6d",
    "#ffb547", "#a78bfa", "#38bdf8", "#34d399",
];

// ── Props ──────────────────────────────────────────────────────────────────────

interface StageConfigModalProps {
    stage: PipelineStage | null;
    pipelineId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function StageConfigModal({ stage, pipelineId, open, onOpenChange }: StageConfigModalProps) {
    const [form, setForm] = useState(() => ({
        name: stage?.name ?? "",
        color: stage?.color ?? COLORS[0],
        type: stage?.type ?? "CUSTOM",
        probability: stage?.probability ?? 50,
        rottingDays: stage?.rottingDays ?? "",
        agentId: stage?.agentId ?? "",
        agentTrigger: stage?.agentTrigger ?? "NONE",
        agentGoal: stage?.agentGoal ?? "",
        maxDeals: stage?.maxDeals ?? "",
        requiredFields: (stage?.requiredFields as string[]) ?? [],
        newField: "",
    }));

    const updateStage = useUpdateStage(stage?.id ?? "", pipelineId);

    const { data: agents = [], isLoading: loadingAgents } = useQuery({
        queryKey: ["agents"],
        queryFn: async () => {
            const { data } = await api.get("/agents");
            return data as { id: string; name: string; status: string }[];
        },
        enabled: open,
    });

    const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
        setForm((f) => ({ ...f, [k]: v }));

    const handleSave = async () => {
        if (!stage) return;
        try {
            await updateStage.mutateAsync({
                name: form.name,
                color: form.color,
                type: form.type,
                probability: Number(form.probability),
                rottingDays: form.rottingDays ? Number(form.rottingDays) : undefined,
                agentId: form.agentId || null,
                agentTrigger: form.agentTrigger,
                agentGoal: form.agentGoal || undefined,
                maxDeals: form.maxDeals ? Number(form.maxDeals) : undefined,
                requiredFields: form.requiredFields,
            });
            toast.success("Etapa atualizada");
            onOpenChange(false);
        } catch {
            toast.error("Erro ao salvar etapa");
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Configurar etapa</DialogTitle>
                </DialogHeader>

                <Tabs defaultValue="basic" className="space-y-4">
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="basic" className="text-xs">Básico</TabsTrigger>
                        <TabsTrigger value="agent" className="text-xs">Agente</TabsTrigger>
                        <TabsTrigger value="automations" className="text-xs">Automações</TabsTrigger>
                        <TabsTrigger value="limits" className="text-xs">Limites</TabsTrigger>
                    </TabsList>

                    {/* ── BASIC ──────────────────────────────────────────── */}
                    <TabsContent value="basic" className="space-y-4">
                        <div className="space-y-1.5">
                            <Label className="text-xs text-t2">Nome</Label>
                            <Input
                                value={form.name}
                                onChange={(e) => set("name", e.target.value)}
                                className="text-sm"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs text-t2">Cor</Label>
                            <div className="flex gap-2">
                                {COLORS.map((c) => (
                                    <button
                                        key={c}
                                        onClick={() => set("color", c)}
                                        className={`h-6 w-6 rounded-full transition-transform hover:scale-110 ${form.color === c ? "ring-2 ring-white ring-offset-1 ring-offset-surface-2" : ""}`}
                                        style={{ backgroundColor: c }}
                                    />
                                ))}
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs text-t2">Tipo</Label>
                            <Select value={form.type} onValueChange={(v) => set("type", v)}>
                                <SelectTrigger className="text-sm">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {STAGE_TYPES.map((t) => (
                                        <SelectItem key={t.value} value={t.value}>
                                            {t.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs text-t2">
                                Probabilidade padrão: <span className="font-mono text-violet">{form.probability}%</span>
                            </Label>
                            <input
                                type="range"
                                min={0}
                                max={100}
                                value={form.probability}
                                onChange={(e) => set("probability", Number(e.target.value))}
                                className="w-full accent-violet"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs text-t2">Dias para considerar parado</Label>
                            <Input
                                type="number"
                                placeholder="Ex: 7"
                                value={form.rottingDays}
                                onChange={(e) => set("rottingDays", e.target.value)}
                                className="text-sm"
                            />
                        </div>
                    </TabsContent>

                    {/* ── AGENT ──────────────────────────────────────────── */}
                    <TabsContent value="agent" className="space-y-4">
                        <div className="space-y-1.5">
                            <Label className="text-xs text-t2">Agente responsável</Label>
                            {loadingAgents ? (
                                <Skeleton className="h-9 rounded-[8px]" />
                            ) : (
                                <Select
                                    value={form.agentId}
                                    onValueChange={(v) => set("agentId", v === "__none" ? "" : v)}
                                >
                                    <SelectTrigger className="text-sm">
                                        <SelectValue placeholder="Sem agente" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__none">Sem agente</SelectItem>
                                        {agents.map((a) => (
                                            <SelectItem key={a.id} value={a.id}>
                                                <div className="flex items-center gap-2">
                                                    <span
                                                        className={`h-1.5 w-1.5 rounded-full ${a.status === "ACTIVE" ? "bg-jade" : "bg-t3"}`}
                                                    />
                                                    {a.name}
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        </div>

                        {form.agentId && (
                            <>
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-t2">Trigger</Label>
                                    <Select
                                        value={form.agentTrigger}
                                        onValueChange={(v) => set("agentTrigger", v)}
                                    >
                                        <SelectTrigger className="text-sm">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {AGENT_TRIGGERS.map((t) => (
                                                <SelectItem key={t.value} value={t.value}>
                                                    {t.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs text-t2">Objetivo do agente nesta etapa</Label>
                                    <Textarea
                                        placeholder="Ex: Qualificar o lead, verificar orçamento disponível..."
                                        value={form.agentGoal}
                                        onChange={(e) => set("agentGoal", e.target.value)}
                                        className="min-h-[80px] resize-none text-sm"
                                    />
                                </div>
                            </>
                        )}
                    </TabsContent>

                    {/* ── AUTOMATIONS ────────────────────────────────────── */}
                    <TabsContent value="automations" className="space-y-4">
                        <div className="space-y-2">
                            <Label className="text-xs text-t2">Campos obrigatórios para sair</Label>
                            <div className="flex gap-2">
                                <Input
                                    placeholder="Nome do campo..."
                                    value={form.newField}
                                    onChange={(e) => set("newField", e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && form.newField.trim()) {
                                            set("requiredFields", [...form.requiredFields, form.newField.trim()]);
                                            set("newField", "");
                                        }
                                    }}
                                    className="text-sm"
                                />
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        if (form.newField.trim()) {
                                            set("requiredFields", [...form.requiredFields, form.newField.trim()]);
                                            set("newField", "");
                                        }
                                    }}
                                >
                                    Adicionar
                                </Button>
                            </div>
                            {form.requiredFields.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {form.requiredFields.map((f, i) => (
                                        <span
                                            key={i}
                                            className="flex items-center gap-1 rounded-[6px] bg-surface-3 px-2 py-1 font-mono text-[11px] text-t2"
                                        >
                                            {f}
                                            <button
                                                onClick={() =>
                                                    set(
                                                        "requiredFields",
                                                        form.requiredFields.filter((_, j) => j !== i),
                                                    )
                                                }
                                                className="text-t3 hover:text-rose"
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="rounded-[10px] border border-[var(--rim)] bg-surface-3 px-4 py-3">
                            <p className="text-xs text-t3">
                                Automações avançadas (ao entrar, ao sair, ao apodrecer) estarão disponíveis em breve.
                            </p>
                        </div>
                    </TabsContent>

                    {/* ── LIMITS ─────────────────────────────────────────── */}
                    <TabsContent value="limits" className="space-y-4">
                        <div className="space-y-1.5">
                            <Label className="text-xs text-t2">Máximo de deals simultâneos</Label>
                            <Input
                                type="number"
                                placeholder="Sem limite"
                                value={form.maxDeals}
                                onChange={(e) => set("maxDeals", e.target.value)}
                                className="text-sm"
                            />
                            <p className="text-[10px] text-t3">
                                Novos deals não poderão ser adicionados quando o limite for atingido.
                            </p>
                        </div>
                    </TabsContent>
                </Tabs>

                <DialogFooter>
                    <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                        Cancelar
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={updateStage.isPending}>
                        {updateStage.isPending && <RotateCcw className="h-3.5 w-3.5 animate-spin" />}
                        Salvar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
