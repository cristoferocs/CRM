"use client";

import { useState } from "react";
import { ArrowLeft, Edit2, Plus, TrendingUp, Tag, Users, Zap, Settings } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { usePipelines } from "@/hooks/usePipeline";
import type { PipelineSummary } from "@/hooks/usePipeline";
import { CreatePipelineModal } from "@/components/modules/pipeline/create-pipeline-modal";

// ── Pipeline type icons ────────────────────────────────────────────────────────

const TYPE_ICON: Record<string, React.ReactNode> = {
    SALES: <TrendingUp className="h-4 w-4" />,
    LEADS: <Users className="h-4 w-4" />,
    MARKETING: <Tag className="h-4 w-4" />,
    ONBOARDING: <Zap className="h-4 w-4" />,
    CUSTOM: <Settings className="h-4 w-4" />,
};

const TYPE_LABEL: Record<string, string> = {
    SALES: "Vendas",
    LEADS: "Leads",
    MARKETING: "Marketing",
    ONBOARDING: "Onboarding",
    CUSTOM: "Personalizado",
};

const TYPE_BADGE_VARIANT: Record<string, string> = {
    SALES: "default",
    LEADS: "cyan",
    MARKETING: "amber",
    ONBOARDING: "jade",
    CUSTOM: "muted",
};

// ── Pipeline Card ──────────────────────────────────────────────────────────────

function PipelineCard({
    pipeline,
    onEdit,
}: {
    pipeline: PipelineSummary;
    onEdit: (p: PipelineSummary) => void;
}) {
    return (
        <div className="group flex items-start justify-between gap-4 rounded-[14px] border border-[var(--rim)] bg-surface-2 p-5 transition-all hover:border-[var(--rim2)]">
            <div className="flex items-start gap-4 min-w-0">
                {/* Color dot + type icon */}
                <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-white/80"
                    style={{ backgroundColor: `${pipeline.color}22`, border: `1px solid ${pipeline.color}44` }}
                >
                    <span style={{ color: pipeline.color }}>
                        {TYPE_ICON[pipeline.type] ?? <Settings className="h-4 w-4" />}
                    </span>
                </div>

                <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-t1">{pipeline.name}</h3>
                        {pipeline.isDefault && (
                            <span className="rounded-[20px] bg-violet/10 px-1.5 py-px font-mono text-[9px] text-violet">
                                Padrão
                            </span>
                        )}
                        <Badge variant={TYPE_BADGE_VARIANT[pipeline.type] as any}>
                            {TYPE_LABEL[pipeline.type] ?? pipeline.type}
                        </Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 font-mono text-[11px] text-t3">
                        {(pipeline.stagesCount ?? 0) > 0 && (
                            <span>
                                <span className="text-t2">{pipeline.stagesCount}</span> etapas
                            </span>
                        )}
                        {(pipeline.dealsCount ?? 0) > 0 && (
                            <span>
                                <span className="text-t2">{pipeline.dealsCount}</span> deals
                            </span>
                        )}
                        {pipeline.rottingDays && (
                            <span>
                                Parado após <span className="text-amber">{pipeline.rottingDays}d</span>
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <Button
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 gap-1.5 text-xs opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => onEdit(pipeline)}
            >
                <Edit2 className="h-3.5 w-3.5" />
                Editar
            </Button>
        </div>
    );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function PipelineSettingsPage() {
    const { data: pipelines = [], isLoading } = usePipelines();
    const [createOpen, setCreateOpen] = useState(false);
    const [editPipeline, setEditPipeline] = useState<PipelineSummary | undefined>();

    const handleEdit = (p: PipelineSummary) => {
        setEditPipeline(p);
        setCreateOpen(true);
    };

    return (
        <div className="mx-auto max-w-3xl space-y-6 p-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center gap-3">
                <Link href="/pipeline">
                    <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-t2">
                        <ArrowLeft className="h-3.5 w-3.5" />
                        Voltar
                    </Button>
                </Link>
                <div className="flex-1">
                    <h1 className="font-display text-xl font-semibold text-t1">Pipelines</h1>
                    <p className="text-xs text-t2">
                        Gerencie seus funis de vendas e configure as etapas de cada um.
                    </p>
                </div>
                <Button
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => { setEditPipeline(undefined); setCreateOpen(true); }}
                >
                    <Plus className="h-3.5 w-3.5" />
                    Novo Pipeline
                </Button>
            </div>

            {/* List */}
            {isLoading ? (
                <div className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                        <Skeleton key={i} className="h-20 w-full rounded-[14px]" />
                    ))}
                </div>
            ) : pipelines.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-[14px] border border-dashed border-[var(--rim)] py-16 text-center">
                    <Settings className="h-8 w-8 text-t3" />
                    <div>
                        <p className="text-sm font-medium text-t2">Nenhum pipeline criado</p>
                        <p className="mt-0.5 text-xs text-t3">
                            Crie seu primeiro pipeline para começar a gerenciar deals.
                        </p>
                    </div>
                    <Button
                        size="sm"
                        className="mt-2 gap-1.5 text-xs"
                        onClick={() => { setEditPipeline(undefined); setCreateOpen(true); }}
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Criar pipeline
                    </Button>
                </div>
            ) : (
                <div className="space-y-3">
                    {pipelines.map((p) => (
                        <PipelineCard key={p.id} pipeline={p} onEdit={handleEdit} />
                    ))}
                </div>
            )}

            {/* Create / Edit modal */}
            <CreatePipelineModal
                open={createOpen}
                onOpenChange={(open) => {
                    setCreateOpen(open);
                    if (!open) setEditPipeline(undefined);
                }}
                pipeline={editPipeline}
            />
        </div>
    );
}
