"use client";

import { Brain, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatCurrency } from "@/lib/utils";
import { useDealForecast } from "@/hooks/useForecast";

/**
 * Drop-in card for the deal drawer showing per-deal forecast with the
 * full list of explanatory factors. Each factor is signed and ranked
 * by absolute impact server-side.
 *
 * Surfaces what RD/Pipedrive's AI score deliberately hides: a salesperson
 * can read the rows and know exactly what to do next.
 */
export function DealForecastCard({ dealId }: { dealId: string }) {
    const { data, isLoading, isError } = useDealForecast(dealId);

    if (isLoading) return <Skeleton className="h-44" />;
    if (isError || !data) return null;

    const pct = Math.round(data.probability * 100);

    return (
        <Card className="p-4">
            <div className="flex items-center gap-2 text-t3">
                <Brain className="h-4 w-4" aria-hidden="true" />
                <span className="text-xs font-medium uppercase tracking-wider">
                    Previsão até {formatPeriodEnd(data.periodEnd)}
                </span>
            </div>
            <div className="mt-3 flex items-baseline justify-between gap-3">
                <span className="font-display text-3xl font-semibold text-t1">{pct}%</span>
                <div className="text-right">
                    <p className="font-mono text-sm text-t2">
                        {formatCurrency(data.expectedRevenueUsd)}
                    </p>
                    <p className="text-[11px] text-t3">de {formatCurrency(data.valueUsd)}</p>
                </div>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                <div
                    aria-hidden="true"
                    className={cn(
                        "h-full rounded-full",
                        pct >= 70 ? "bg-jade" : pct >= 40 ? "bg-violet" : "bg-amber",
                    )}
                    style={{ width: `${Math.max(2, pct)}%` }}
                />
            </div>

            {data.factors.length > 0 && (
                <ul className="mt-4 space-y-2">
                    {data.factors.map((f) => {
                        const impactPct = Math.round(f.impact * 100);
                        const Icon =
                            impactPct > 0 ? TrendingUp : impactPct < 0 ? TrendingDown : Minus;
                        return (
                            <li key={f.id} className="flex items-start gap-2 text-[12px]">
                                <Icon
                                    className={cn(
                                        "mt-0.5 h-3.5 w-3.5 shrink-0",
                                        impactPct > 0
                                            ? "text-jade"
                                            : impactPct < 0
                                              ? "text-rose"
                                              : "text-t4",
                                    )}
                                    aria-hidden="true"
                                />
                                <div className="min-w-0 flex-1">
                                    <p className="flex items-baseline gap-2">
                                        <span className="font-medium text-t1">{f.label}</span>
                                        {impactPct !== 0 && (
                                            <span
                                                className={cn(
                                                    "font-mono text-[11px]",
                                                    impactPct > 0 ? "text-jade" : "text-rose",
                                                )}
                                            >
                                                {impactPct > 0 ? "+" : ""}
                                                {impactPct}%
                                            </span>
                                        )}
                                    </p>
                                    <p className="text-t3">{f.explanation}</p>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </Card>
    );
}

function formatPeriodEnd(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
