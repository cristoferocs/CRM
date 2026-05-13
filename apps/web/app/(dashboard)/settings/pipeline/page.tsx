"use client";

import { useState } from "react";
import { Plus, GripVertical, MoreVertical, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePipelines, usePipeline } from "@/hooks/usePipeline";
import { cn } from "@/lib/utils";

const STAGE_COLORS = [
    "bg-violet",
    "bg-cyan",
    "bg-amber",
    "bg-rose",
    "bg-jade",
    "bg-t2",
];

export default function PipelineSettingsPage() {
    const { data: pipelines, isLoading: pipelinesLoading } = usePipelines();
    const firstId = pipelines?.[0]?.id ?? "";
    const { data: pipeline, isLoading: pipelineLoading } = usePipeline(firstId);
    const isLoading = pipelinesLoading || pipelineLoading;

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-end justify-between">
                <div>
                    <h1 className="font-display text-[28px] font-semibold leading-none tracking-[-0.8px] text-t1">
                        Funis de Venda
                    </h1>
                    <p className="mt-1.5 text-sm text-t2">Configure etapas e campos</p>
                </div>
                <Button>
                    <Plus className="h-4 w-4" /> Novo Funil
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>{pipeline?.name ?? "Funil Principal"}</CardTitle>
                    <Button variant="outline" size="sm" className="ml-auto">
                        <Pencil className="h-3.5 w-3.5" /> Editar
                    </Button>
                </CardHeader>
                <CardContent className="space-y-2">
                    {isLoading
                        ? Array.from({ length: 4 }).map((_, i) => (
                            <Skeleton key={i} className="h-14 w-full rounded-[10px]" />
                        ))
                        : (pipeline?.stages ?? []).map((stage, i) => (
                            <div
                                key={stage.id}
                                className="flex items-center gap-3 rounded-[10px] border border-[var(--rim)] bg-surface-2 px-3 py-3"
                            >
                                <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-t3" />
                                <div
                                    className={cn(
                                        "h-2.5 w-2.5 shrink-0 rounded-full",
                                        STAGE_COLORS[i] ?? "bg-t3",
                                    )}
                                />
                                <span className="flex-1 text-sm font-medium text-t1">
                                    {stage.name}
                                </span>
                                {stage.probability !== null && (
                                    <span className="font-mono text-[11px] text-t3">
                                        {stage.probability}%
                                    </span>
                                )}
                                <Button variant="ghost" size="icon">
                                    <MoreVertical className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}

                    <button className="flex w-full items-center gap-2 rounded-[10px] border border-dashed border-[var(--rim)] px-3 py-3 text-sm text-t3 transition-colors hover:border-[var(--rim2)] hover:text-t2">
                        <Plus className="h-4 w-4" /> Adicionar etapa
                    </button>
                </CardContent>
            </Card>
        </div>
    );
}
