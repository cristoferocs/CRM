"use client";

import { ChevronDown, Settings, TrendingUp, Tag, Users, Zap } from "lucide-react";
import Link from "next/link";
import { cn, formatCurrency } from "@/lib/utils";
import type { PipelineSummary } from "@/hooks/usePipeline";

// ── Pipeline type icons ────────────────────────────────────────────────────────

const TYPE_ICON: Record<string, React.ReactNode> = {
    SALES: <TrendingUp className="h-3.5 w-3.5" />,
    LEADS: <Users className="h-3.5 w-3.5" />,
    MARKETING: <Tag className="h-3.5 w-3.5" />,
    ONBOARDING: <Zap className="h-3.5 w-3.5" />,
    CUSTOM: <Settings className="h-3.5 w-3.5" />,
};

const TYPE_LABEL: Record<string, string> = {
    SALES: "Vendas",
    LEADS: "Leads",
    MARKETING: "Marketing",
    ONBOARDING: "Onboarding",
    CUSTOM: "Personalizado",
};

// ── Props ──────────────────────────────────────────────────────────────────────

interface PipelineSelectorProps {
    pipelines: PipelineSummary[];
    value: string;
    onValueChange: (id: string) => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function PipelineSelector({ pipelines, value, onValueChange }: PipelineSelectorProps) {
    const active = pipelines.find((p) => p.id === value);

    return (
        <div className="relative group">
            {/* Trigger */}
            <button className="flex h-9 items-center gap-2.5 rounded-[10px] border border-[var(--rim)] bg-surface-2 px-3 text-sm font-medium text-t1 transition-colors hover:border-[var(--rim2)] hover:bg-surface-3">
                {active && (
                    <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: active.color || "#55556a" }}
                    />
                )}
                <span className="max-w-[160px] truncate">
                    {active?.name ?? "Selecionar pipeline"}
                </span>
                {active && (
                    <span className="font-mono text-[10px] text-t3">
                        {active.type ? TYPE_LABEL[active.type] ?? active.type : ""}
                    </span>
                )}
                <ChevronDown className="h-3.5 w-3.5 text-t3 transition-transform group-focus-within:rotate-180" />
            </button>

            {/* Dropdown */}
            <div className="invisible absolute left-0 top-full z-50 mt-1.5 w-72 translate-y-1 rounded-[12px] border border-[var(--rim)] bg-surface-2 py-1 opacity-0 shadow-2xl transition-all group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
                {pipelines.map((p) => (
                    <button
                        key={p.id}
                        onClick={() => onValueChange(p.id)}
                        className={cn(
                            "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-surface-3",
                            p.id === value && "bg-violet/[0.06]",
                        )}
                    >
                        {/* Color dot */}
                        <span
                            className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: p.color || "#55556a" }}
                        />

                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <span className="truncate font-medium text-t1">{p.name}</span>
                                {p.isDefault && (
                                    <span className="rounded-[20px] bg-violet/10 px-1.5 py-px font-mono text-[9px] text-violet">
                                        Padrão
                                    </span>
                                )}
                            </div>
                            <div className="mt-0.5 flex items-center gap-2">
                                <span className="flex items-center gap-1 text-[10px] text-t3">
                                    {TYPE_ICON[p.type] ?? null}
                                    {TYPE_LABEL[p.type] ?? p.type}
                                </span>
                                {(p.dealsCount ?? 0) > 0 && (
                                    <span className="font-mono text-[10px] text-t3">
                                        {p.dealsCount} deals
                                    </span>
                                )}
                                {(p.totalValue ?? 0) > 0 && (
                                    <span className="font-mono text-[10px] text-jade">
                                        {formatCurrency(p.totalValue!, { compact: true })}
                                    </span>
                                )}
                            </div>
                        </div>

                        {p.id === value && (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet" />
                        )}
                    </button>
                ))}

                {/* Divider */}
                <div className="my-1 border-t border-[var(--rim)]" />

                <Link
                    href="/pipeline/settings"
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-t2 transition-colors hover:bg-surface-3 hover:text-t1"
                >
                    <Settings className="h-3.5 w-3.5" />
                    Gerenciar Pipelines
                </Link>
            </div>
        </div>
    );
}
