"use client";

import { useState } from "react";
import { Plus, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { useCreateStage } from "@/hooks/usePipeline";
import { cn } from "@/lib/utils";

const QUICK_COLORS = [
    "#7c5cfc", "#00d4ff", "#00e5a0", "#ff4d6d",
    "#ffb547", "#a78bfa", "#38bdf8", "#34d399",
];

interface AddStageButtonProps {
    pipelineId: string;
    nextOrder: number;
}

export function AddStageButton({ pipelineId, nextOrder }: AddStageButtonProps) {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    const [color, setColor] = useState(QUICK_COLORS[0]!);
    const createStage = useCreateStage(pipelineId);

    const reset = () => {
        setName("");
        setColor(QUICK_COLORS[0]!);
        setOpen(false);
    };

    const handleCreate = async () => {
        const trimmed = name.trim();
        if (!trimmed) {
            toast.error("Informe um nome para a etapa.");
            return;
        }
        try {
            await createStage.mutateAsync({
                name: trimmed,
                color,
                type: "CUSTOM",
                probability: 50,
                order: nextOrder,
            });
            toast.success("Etapa criada.");
            reset();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Erro ao criar etapa.");
        }
    };

    if (!open) {
        return (
            <div className="flex w-[264px] shrink-0 flex-col">
                <button
                    onClick={() => setOpen(true)}
                    className="mt-7 flex h-full min-h-[200px] w-full flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--rim)] text-t3 transition-colors hover:border-violet/40 hover:bg-violet/5 hover:text-violet"
                >
                    <Plus className="h-5 w-5" />
                    <span className="text-xs">Adicionar etapa</span>
                </button>
            </div>
        );
    }

    return (
        <div className="flex w-[264px] shrink-0 flex-col gap-2 rounded-[10px] border border-violet/20 bg-surface-2 p-3">
            <div className="text-[11px] font-medium text-t2">Nova etapa</div>
            <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome da etapa"
                onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") reset();
                }}
                className="h-8 text-xs"
            />
            <div className="flex flex-wrap gap-1.5">
                {QUICK_COLORS.map((c) => (
                    <button
                        key={c}
                        onClick={() => setColor(c)}
                        className={cn(
                            "h-5 w-5 rounded-full transition-transform",
                            color === c && "ring-2 ring-offset-2 ring-offset-surface-2 ring-t2 scale-110",
                        )}
                        style={{ backgroundColor: c }}
                    />
                ))}
            </div>
            <div className="flex justify-end gap-1.5">
                <button
                    onClick={reset}
                    className="flex h-7 w-7 items-center justify-center rounded-[8px] text-t3 hover:bg-surface-3"
                    title="Cancelar (Esc)"
                >
                    <X className="h-3.5 w-3.5" />
                </button>
                <button
                    onClick={handleCreate}
                    disabled={createStage.isPending}
                    className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-violet text-void hover:bg-violet/90 disabled:opacity-50"
                    title="Criar (Enter)"
                >
                    <Check className="h-3.5 w-3.5" />
                </button>
            </div>
        </div>
    );
}
