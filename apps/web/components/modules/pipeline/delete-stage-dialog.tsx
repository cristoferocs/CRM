"use client";

import { useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDeleteStage } from "@/hooks/usePipeline";
import type { PipelineStage, PipelineDeal } from "@/hooks/usePipeline";

interface DeleteStageDialogProps {
    pipelineId: string;
    stage: PipelineStage | null;
    allStages: PipelineStage[];
    dealsInStage: PipelineDeal[];
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function DeleteStageDialog({
    pipelineId,
    stage,
    allStages,
    dealsInStage,
    open,
    onOpenChange,
}: DeleteStageDialogProps) {
    const candidates = allStages.filter(
        (s) => stage && s.id !== stage.id && !s.isWon && !s.isLost,
    );
    const [targetStageId, setTargetStageId] = useState<string>(candidates[0]?.id ?? "");
    const deleteStage = useDeleteStage(pipelineId);

    if (!stage) return null;

    const requiresTarget = dealsInStage.length > 0;
    const canSubmit = !requiresTarget || !!targetStageId;

    const handleDelete = async () => {
        try {
            await deleteStage.mutateAsync({
                stageId: stage.id,
                targetStageId: requiresTarget ? targetStageId : undefined,
            });
            toast.success(`Etapa "${stage.name}" removida.`);
            onOpenChange(false);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Erro ao remover etapa.");
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber" />
                        Remover etapa "{stage.name}"
                    </DialogTitle>
                    <DialogDescription>
                        Esta ação é permanente. As automações configuradas nesta etapa também serão excluídas.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 py-2">
                    {requiresTarget ? (
                        <>
                            <div className="rounded-[10px] border border-amber/20 bg-amber/5 px-3 py-2 text-xs text-amber">
                                Existem <b>{dealsInStage.length}</b> deal(s) nesta etapa. Eles serão movidos
                                para a etapa que você selecionar abaixo.
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-medium text-t2">
                                    Mover deals para:
                                </label>
                                <Select value={targetStageId} onValueChange={setTargetStageId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecione uma etapa" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {candidates.map((s) => (
                                            <SelectItem key={s.id} value={s.id}>
                                                {s.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {candidates.length === 0 && (
                                    <p className="text-[11px] text-rose">
                                        Não há etapa disponível para receber os deals. Crie outra etapa antes de remover esta.
                                    </p>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="rounded-[10px] border border-[var(--rim)] bg-surface-2 px-3 py-2 text-xs text-t3">
                            Nenhum deal está atualmente nesta etapa. A remoção é segura.
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>
                        Cancelar
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={handleDelete}
                        disabled={!canSubmit || deleteStage.isPending}
                    >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        Remover etapa
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
