"use client";

import { useEffect, useState } from "react";
import {
    Target,
    TrendingUp,
    AlertCircle,
    ChevronRight,
    ChevronDown,
    ChevronUp,
    X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatCurrency } from "@/lib/utils";
import { usePipelineForecast, type DealForecast } from "@/hooks/useForecast";

/**
 * Forecast widget shown at the top of the pipeline view.
 *
 * Three view modes, persisted in localStorage per pipelineId so each
 * pipeline can default to whatever the operator prefers:
 *
 *   - `hidden`   → 0px footprint, replaced by a tiny "Mostrar previsão"
 *                  button that doesn't fight the kanban for space.
 *   - `compact`  → single thin strip (~48px) with the three KPIs inline.
 *                  Default, scannable in one glance.
 *   - `expanded` → full layout with KPI cards + top deals list. The
 *                  per-deal "why" lives in the deal drawer
 *                  (DealForecastCard), so this view is for "what's the
 *                  shape of the pipeline overall" not "tell me about
 *                  each deal."
 */
type ForecastViewMode = "hidden" | "compact" | "expanded";

const STORAGE_KEY = (pipelineId: string) => `crm:pipeline:forecast-mode:${pipelineId}`;
const DEFAULT_MODE: ForecastViewMode = "compact";

function readMode(pipelineId: string | null | undefined): ForecastViewMode {
    if (!pipelineId || typeof window === "undefined") return DEFAULT_MODE;
    const raw = window.localStorage.getItem(STORAGE_KEY(pipelineId));
    if (raw === "hidden" || raw === "compact" || raw === "expanded") return raw;
    return DEFAULT_MODE;
}

function writeMode(pipelineId: string, mode: ForecastViewMode) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY(pipelineId), mode);
}

export function PipelineForecastPanel({ pipelineId }: { pipelineId: string | null | undefined }) {
    const [mode, setMode] = useState<ForecastViewMode>(DEFAULT_MODE);

    // Hydrate from localStorage once we know the pipelineId (and we're in
    // the browser). Pipeline changes also re-read the preference.
    useEffect(() => {
        if (!pipelineId) return;
        setMode(readMode(pipelineId));
    }, [pipelineId]);

    const updateMode = (next: ForecastViewMode) => {
        setMode(next);
        if (pipelineId) writeMode(pipelineId, next);
    };

    const { data, isLoading, isError } = usePipelineForecast(pipelineId);

    if (!pipelineId) return null;
    if (isError) return null;

    if (mode === "hidden") {
        // Minimal-footprint affordance to bring the panel back. Sits as a
        // tiny chip; no wrapping div with padding so the kanban gets
        // almost the full vertical space.
        return (
            <div className="shrink-0 border-b border-[var(--rim)] px-6 py-1.5">
                <button
                    type="button"
                    onClick={() => updateMode("compact")}
                    aria-label="Mostrar previsão do pipeline"
                    className="inline-flex items-center gap-1.5 rounded-md border border-[var(--rim)] bg-surface-2 px-2.5 py-1 text-xs text-t2 transition-colors hover:border-[var(--rim2)] hover:bg-surface-3 hover:text-t1"
                >
                    <TrendingUp className="h-3 w-3" aria-hidden="true" />
                    Mostrar previsão
                </button>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="shrink-0 border-b border-[var(--rim)] px-6 py-3">
                {mode === "compact" ? (
                    <Skeleton className="h-10" />
                ) : (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <Skeleton className="h-24" />
                        <Skeleton className="h-24" />
                        <Skeleton className="h-24" />
                    </div>
                )}
            </div>
        );
    }
    if (!data) return null;

    const periodLabel = formatPeriodEnd(data.periodEnd);

    if (mode === "compact") {
        return (
            <div className="shrink-0 border-b border-[var(--rim)] px-6 py-2">
                <CompactBar
                    data={data}
                    periodLabel={periodLabel}
                    onExpand={() => updateMode("expanded")}
                    onHide={() => updateMode("hidden")}
                />
            </div>
        );
    }

    return (
        <div className="shrink-0 border-b border-[var(--rim)] px-6 py-3">
            <ExpandedPanel
                data={data}
                periodLabel={periodLabel}
                onCollapse={() => updateMode("compact")}
                onHide={() => updateMode("hidden")}
            />
        </div>
    );
}

// ── Compact bar ────────────────────────────────────────────────────────────

function CompactBar({
    data,
    periodLabel,
    onExpand,
    onHide,
}: {
    data: NonNullable<ReturnType<typeof usePipelineForecast>["data"]>;
    periodLabel: string;
    onExpand: () => void;
    onHide: () => void;
}) {
    return (
        <div className="flex items-center gap-3 rounded-lg border border-[var(--rim)] bg-surface-2 px-3 py-2 text-sm">
            <span className="inline-flex items-center gap-1.5 text-t2">
                <TrendingUp className="h-3.5 w-3.5 text-jade" aria-hidden="true" />
                <strong className="text-t1">{formatCurrency(data.totals.expectedRevenueUsd)}</strong>
                <span className="text-t3">esperados · até {periodLabel}</span>
            </span>
            <span className="text-t4" aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1.5 text-t2">
                <Target className="h-3.5 w-3.5 text-violet" aria-hidden="true" />
                <strong className="text-t1">{data.totals.openDeals}</strong>
                <span className="text-t3">deals em jogo</span>
            </span>
            <span className="text-t4" aria-hidden="true">·</span>
            <ConfidenceChip confidence={data.confidence} sample={data.closedSampleSize} />

            <div className="ml-auto flex items-center gap-1">
                <button
                    type="button"
                    onClick={onExpand}
                    aria-expanded={false}
                    aria-controls="forecast-expanded-panel"
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-t3 transition-colors hover:bg-surface-3 hover:text-t1"
                >
                    Ver detalhes
                    <ChevronDown className="h-3 w-3" aria-hidden="true" />
                </button>
                <button
                    type="button"
                    onClick={onHide}
                    aria-label="Ocultar previsão"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-t3 transition-colors hover:bg-surface-3 hover:text-t1"
                >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
            </div>
        </div>
    );
}

// ── Expanded panel ─────────────────────────────────────────────────────────

function ExpandedPanel({
    data,
    periodLabel,
    onCollapse,
    onHide,
}: {
    data: NonNullable<ReturnType<typeof usePipelineForecast>["data"]>;
    periodLabel: string;
    onCollapse: () => void;
    onHide: () => void;
}) {
    return (
        <div id="forecast-expanded-panel" className="space-y-3">
            <div className="flex items-center justify-end gap-1">
                <button
                    type="button"
                    onClick={onCollapse}
                    aria-expanded={true}
                    aria-controls="forecast-expanded-panel"
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-t3 transition-colors hover:bg-surface-2 hover:text-t1"
                >
                    Minimizar
                    <ChevronUp className="h-3 w-3" aria-hidden="true" />
                </button>
                <button
                    type="button"
                    onClick={onHide}
                    aria-label="Ocultar previsão"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-t3 transition-colors hover:bg-surface-2 hover:text-t1"
                >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Stat
                    icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
                    label={`Receita esperada · até ${periodLabel}`}
                    value={formatCurrency(data.totals.expectedRevenueUsd)}
                    sub={
                        data.totals.totalValueUsd > 0
                            ? `de ${formatCurrency(data.totals.totalValueUsd)} em pipeline (${Math.round(data.totals.weightedProbability * 100)}% médio)`
                            : "Sem deals abertos"
                    }
                />
                <Stat
                    icon={<Target className="h-4 w-4" aria-hidden="true" />}
                    label="Deals em jogo"
                    value={String(data.totals.openDeals)}
                    sub={
                        data.byStage[0]
                            ? `Top: ${data.byStage[0].stageName} (${formatCurrency(data.byStage[0].expectedRevenueUsd)} esperados)`
                            : "Crie um deal para começar"
                    }
                />
                <ConfidenceStat confidence={data.confidence} sample={data.closedSampleSize} />
            </div>

            {data.deals.length > 0 && (
                <Card className="p-4">
                    <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-t3">
                        Top deals previstos
                    </h3>
                    <ul className="space-y-3">
                        {data.deals.slice(0, 5).map((d) => (
                            <DealRow key={d.dealId} deal={d} />
                        ))}
                    </ul>
                </Card>
            )}
        </div>
    );
}

// ── Pieces ────────────────────────────────────────────────────────────────

function ConfidenceChip({
    confidence,
    sample,
}: {
    confidence: "low" | "medium" | "high";
    sample: number;
}) {
    const cfg = {
        high: { label: "Alta", className: "bg-jade-dim text-jade border-jade/30" },
        medium: { label: "Média", className: "bg-amber-dim text-amber border-amber/30" },
        low: { label: "Baixa", className: "bg-rose-dim text-rose border-rose/30" },
    }[confidence];
    return (
        <span
            className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs", cfg.className)}
            title={`${sample} deals fechados nos últimos 90d`}
        >
            <AlertCircle className="h-3 w-3" aria-hidden="true" />
            Confiança {cfg.label.toLowerCase()}
        </span>
    );
}

function Stat({
    icon,
    label,
    value,
    sub,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    sub: string;
}) {
    return (
        <Card className="p-4">
            <div className="flex items-center gap-2 text-t3">
                {icon}
                <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
            </div>
            <p className="mt-2 font-display text-2xl font-semibold text-t1">{value}</p>
            <p className="mt-1 text-xs text-t3">{sub}</p>
        </Card>
    );
}

function ConfidenceStat({
    confidence,
    sample,
}: {
    confidence: "low" | "medium" | "high";
    sample: number;
}) {
    const cfg = {
        high: { label: "Alta", className: "bg-jade-dim text-jade border-jade/30" },
        medium: { label: "Média", className: "bg-amber-dim text-amber border-amber/30" },
        low: { label: "Baixa", className: "bg-rose-dim text-rose border-rose/30" },
    }[confidence];
    return (
        <Card className="p-4">
            <div className="flex items-center gap-2 text-t3">
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                <span className="text-xs font-medium uppercase tracking-wider">Confiança</span>
            </div>
            <p className="mt-2 font-display text-2xl font-semibold text-t1">
                <span className={cn("rounded-md border px-2 py-0.5 text-sm font-normal", cfg.className)}>
                    {cfg.label}
                </span>
            </p>
            <p className="mt-1 text-xs text-t3">
                {sample} deals fechados nos últimos 90d {sample < 10 ? "— pouco histórico" : ""}
            </p>
        </Card>
    );
}

function DealRow({ deal }: { deal: DealForecast }) {
    const pct = Math.round(deal.probability * 100);
    const topFactor = deal.factors[0];
    return (
        <li>
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-t1">{deal.title}</p>
                    <p className="text-[11px] text-t3">{deal.stageName}</p>
                </div>
                <div className="text-right">
                    <p className="font-mono text-sm text-t1">
                        {formatCurrency(deal.expectedRevenueUsd)}
                    </p>
                    <p className="text-[11px] text-t3">
                        {pct}% × {formatCurrency(deal.valueUsd)}
                    </p>
                </div>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-3">
                <div
                    aria-hidden="true"
                    className={cn(
                        "h-full rounded-full",
                        pct >= 70 ? "bg-jade" : pct >= 40 ? "bg-violet" : "bg-amber",
                    )}
                    style={{ width: `${Math.max(2, pct)}%` }}
                />
            </div>
            {topFactor && (
                <p className="mt-1 flex items-start gap-1 text-[11px] text-t3">
                    <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-t4" aria-hidden="true" />
                    <span>
                        <span className={topFactor.impact > 0 ? "text-jade" : "text-rose"}>
                            {topFactor.impact > 0 ? "+" : ""}
                            {Math.round(topFactor.impact * 100)}%
                        </span>{" "}
                        {topFactor.explanation}
                    </span>
                </p>
            )}
        </li>
    );
}

function formatPeriodEnd(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
