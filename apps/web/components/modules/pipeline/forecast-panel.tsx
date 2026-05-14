"use client";

import { Target, TrendingUp, AlertCircle, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatCurrency } from "@/lib/utils";
import { usePipelineForecast, type DealForecast } from "@/hooks/useForecast";

/**
 * Forecast widget shown at the top of the pipeline view.
 *
 * Three things land here that competitors don't show:
 *   1. The expected revenue for the period is sourced from per-deal
 *      probabilities, not a flat percentage by stage. A deal that's
 *      been ghosted for 3 weeks doesn't count the same as one with
 *      daily activity.
 *   2. The confidence flag is data-driven (sample size in the last
 *      90 days), so a brand-new pipeline doesn't pretend to know.
 *   3. Per-deal "why" lives in the deal drawer — every percentage
 *      point can be traced to a named factor.
 */
export function PipelineForecastPanel({ pipelineId }: { pipelineId: string | null | undefined }) {
    const { data, isLoading, isError } = usePipelineForecast(pipelineId);

    if (!pipelineId) return null;
    if (isLoading) {
        return (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
            </div>
        );
    }
    if (isError || !data) return null;

    const periodLabel = formatPeriodEnd(data.periodEnd);

    return (
        <div className="space-y-3">
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
