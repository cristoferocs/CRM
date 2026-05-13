"use client";

import { useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PipelineStage } from "@/hooks/usePipeline";

interface MoveDealDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    targetStage: PipelineStage | null;
    dealTitle: string;
    missingFields?: string[];
    onConfirm: (reason: string) => Promise<void>;
}

export function MoveDealDialog({
    open,
    onOpenChange,
    targetStage,
    dealTitle,
    missingFields = [],
    onConfirm,
}: MoveDealDialogProps) {
    const [reason, setReason] = useState("");
    const [loading, setLoading] = useState(false);

    const hasMissing = missingFields.length > 0;

    const handleConfirm = async () => {
        setLoading(true);
        try {
            await onConfirm(reason);
            onOpenChange(false);
            setReason("");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle className="text-base">
                        Mover para "{targetStage?.name}"?
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <p className="text-sm text-t2">
                        Deal: <span className="font-medium text-t1">{dealTitle}</span>
                    </p>

                    {hasMissing && (
                        <div className="flex gap-2.5 rounded-[10px] border border-amber/20 bg-amber/[0.06] p-3">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
                            <div>
                                <p className="mb-1 text-xs font-medium text-amber">
                                    Campos obrigatórios faltando
                                </p>
                                <ul className="list-disc pl-4 text-xs text-t2">
                                    {missingFields.map((f) => (
                                        <li key={f}>{String(f)}</li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <Label className="text-xs text-t2">
                            Motivo da movimentação
                            <span className="ml-1 text-t3">(opcional)</span>
                        </Label>
                        <Textarea
                            placeholder="Ex: Cliente confirmou interesse após reunião..."
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            className="min-h-[72px] resize-none text-sm"
                            disabled={hasMissing}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onOpenChange(false)}
                        disabled={loading}
                    >
                        Cancelar
                    </Button>
                    <Button
                        size="sm"
                        onClick={handleConfirm}
                        disabled={loading || hasMissing}
                    >
                        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        Confirmar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
