"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Cell,
    ResponsiveContainer,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import type { FunnelStage } from "@/hooks/usePipeline";

interface FunnelViewProps {
    pipelineId: string;
}

function FunnelSkeleton() {
    return (
        <div className="space-y-4 p-6">
            <Skeleton className="h-64 w-full rounded-[12px]" />
            <div className="grid grid-cols-4 gap-3">
                {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-20 rounded-[10px]" />
                ))}
            </div>
        </div>
    );
}

export function FunnelView({ pipelineId }: FunnelViewProps) {
    const { data, isLoading, isError } = useQuery({
        queryKey: ["pipelines", pipelineId, "stats"],
        queryFn: async () => {
            const { data: raw } = await api.get(`/pipeline/pipelines/${pipelineId}/stats`);
            // API returns { stageStats, conversionFunnel, winRate, lostRate, ... }
            const stageStats = (raw.stageStats ?? []) as Array<{
                stageId: string;
                stageName: string;
                isWon: boolean;
                isLost: boolean;
                dealCount: number;
                totalValue: number;
                rottingCount: number;
                avgDaysInStage: number | null;
            }>;
            const conversionFunnel: FunnelStage[] = stageStats.map((s, i) => ({
                stageId: s.stageId,
                stageName: s.stageName,
                deals: s.dealCount,
                value: s.totalValue,
                conversionFromPrev:
                    i === 0
                        ? null
                        : (() => {
                            const prev = stageStats[i - 1];
                            if (!prev || prev.dealCount === 0) return null;
                            return Math.round((s.dealCount / prev.dealCount) * 10000) / 100;
                        })(),
                avgDaysInStage: s.avgDaysInStage,
            }));
            return {
                overview: {
                    totalDeals: stageStats.reduce((a, s) => a + s.dealCount, 0),
                    totalValue: stageStats.reduce((a, s) => a + s.totalValue, 0),
                    wonDeals: stageStats.filter((s) => s.isWon).reduce((a, s) => a + s.dealCount, 0),
                    lostDeals: stageStats.filter((s) => s.isLost).reduce((a, s) => a + s.dealCount, 0),
                    rottingDeals: stageStats.reduce((a, s) => a + s.rottingCount, 0),
                    avgSalesCycleDays:
                        stageStats.length > 0
                            ? stageStats.reduce((a, s) => a + (s.avgDaysInStage ?? 0), 0) / stageStats.length
                            : 0,
                    winRate: raw.winRate ?? 0,
                },
                conversionFunnel,
            };
        },
        enabled: !!pipelineId,
    });

    if (isLoading) return <FunnelSkeleton />;
    if (isError || !data) {
        return (
            <div className="flex h-64 items-center justify-center text-sm text-t3">
                Falha ao carregar estatísticas.
            </div>
        );
    }

    const { overview, conversionFunnel } = data;

    // Find stage with highest drop-off
    const maxDropStageId = conversionFunnel.reduce<string | null>((acc, s, i) => {
        if (i === 0) return acc;
        const prev = conversionFunnel[i - 1];
        if (!prev) return acc;
        const prevAcc = acc
            ? conversionFunnel.find((x) => x.stageId === acc)
            : null;
        const prevDrop = prevAcc
            ? (conversionFunnel.find((x) => x.stageId === acc)?.conversionFromPrev ?? 100) - 100
            : 0;
        const thisDrop = (s.conversionFromPrev ?? 100) - 100;
        return thisDrop < prevDrop ? s.stageId : acc;
    }, null);

    return (
        <div className="space-y-6 p-2">
            {/* KPI row */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                    { label: "Total de Deals", value: overview.totalDeals, mono: true },
                    { label: "Valor Total", value: formatCurrency(overview.totalValue), mono: true },
                    { label: "Taxa de Conversão", value: `${overview.winRate.toFixed(1)}%`, mono: true, color: "text-jade" },
                    { label: "Ciclo Médio", value: `${Math.round(overview.avgSalesCycleDays ?? 0)}d`, mono: true },
                ].map((kpi) => (
                    <div
                        key={kpi.label}
                        className="rounded-[12px] border border-[var(--rim)] bg-surface-2 p-4"
                    >
                        <p className="mb-1 text-[11px] text-t3">{kpi.label}</p>
                        <p className={`font-mono text-xl font-semibold ${kpi.color ?? "text-t1"}`}>
                            {kpi.value}
                        </p>
                    </div>
                ))}
            </div>

            {/* Funnel chart */}
            <div className="rounded-[12px] border border-[var(--rim)] bg-surface-2 p-4">
                <h3 className="mb-4 text-sm font-medium text-t1">Funil de Conversão</h3>
                <ResponsiveContainer width="100%" height={280}>
                    <BarChart
                        data={conversionFunnel}
                        layout="vertical"
                        margin={{ left: 12, right: 40, top: 0, bottom: 0 }}
                    >
                        <CartesianGrid
                            strokeDasharray="3 3"
                            horizontal={false}
                            stroke="rgba(255,255,255,0.04)"
                        />
                        <XAxis type="number" tick={{ fontSize: 10, fill: "#55556a" }} />
                        <YAxis
                            type="category"
                            dataKey="stageName"
                            tick={{ fontSize: 11, fill: "#9898b0" }}
                            width={100}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: "#17171f",
                                borderColor: "rgba(255,255,255,0.06)",
                                borderRadius: 10,
                                fontSize: 12,
                            }}
                            formatter={(value, name) => {
                                if (name === "deals") return [`${value} deals`, "Deals"];
                                return [value, name];
                            }}
                        />
                        <Bar dataKey="deals" radius={[0, 6, 6, 0]}>
                            {conversionFunnel.map((entry) => (
                                <Cell
                                    key={entry.stageId}
                                    fill={
                                        entry.stageId === maxDropStageId
                                            ? "rgba(255, 77, 109, 0.7)"
                                            : "rgba(124, 92, 252, 0.7)"
                                    }
                                />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* Stage details table */}
            <div className="rounded-[12px] border border-[var(--rim)] bg-surface-2 overflow-hidden">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="border-b border-[var(--rim)] bg-surface-3">
                            <th className="px-4 py-2.5 text-left font-medium text-t3">Etapa</th>
                            <th className="px-4 py-2.5 text-right font-medium text-t3">Deals</th>
                            <th className="px-4 py-2.5 text-right font-medium text-t3">Valor</th>
                            <th className="px-4 py-2.5 text-right font-medium text-t3">Conversão</th>
                            <th className="px-4 py-2.5 text-right font-medium text-t3">Tempo Médio</th>
                        </tr>
                    </thead>
                    <tbody>
                        {conversionFunnel.map((s, i) => {
                            const isDropoff = s.stageId === maxDropStageId;
                            return (
                                <tr
                                    key={s.stageId}
                                    className={`border-b border-[var(--rim)] last:border-0 ${isDropoff ? "bg-rose/[0.04]" : ""}`}
                                >
                                    <td className="px-4 py-2.5 font-medium text-t1">
                                        {s.stageName}
                                        {isDropoff && (
                                            <span className="ml-2 rounded-[20px] bg-rose/10 px-1.5 py-px font-mono text-[9px] text-rose">
                                                Maior perda
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-2.5 text-right font-mono text-t1">{s.deals}</td>
                                    <td className="px-4 py-2.5 text-right font-mono text-jade">
                                        {formatCurrency(s.value, { compact: true })}
                                    </td>
                                    <td className="px-4 py-2.5 text-right font-mono">
                                        {i === 0 ? (
                                            <span className="text-t3">—</span>
                                        ) : (
                                            <span className={s.conversionFromPrev != null && s.conversionFromPrev < 50 ? "text-rose" : "text-jade"}>
                                                {s.conversionFromPrev != null
                                                    ? `${s.conversionFromPrev.toFixed(0)}%`
                                                    : "—"}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-2.5 text-right font-mono text-t2">
                                        {s.avgDaysInStage != null ? `${Math.round(s.avgDaysInStage)}d` : "—"}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
