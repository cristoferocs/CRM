"use client";

import { AlertTriangle, DollarSign, TrendingUp, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
    formatUsd,
    useAgentBudget,
    useAgentCostSummary,
    type AgentCostRow,
    type ProviderCostRow,
} from "@/hooks/useAgentCost";
import { cn } from "@/lib/utils";

/**
 * Drop-in panel for the /agents index page showing org-wide LLM spend.
 * Three stats + a top-N agent leaderboard + a per-provider breakdown.
 * Keep it small so it doesn't dominate the page; deeper analytics can
 * live in a future /agents/cost route.
 */
export function AgentCostPanel() {
    const summary = useAgentCostSummary();
    const budget = useAgentBudget();

    if (summary.isLoading) {
        return (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
            </div>
        );
    }

    const data = summary.data;
    if (!data) return null;

    const topAgents = data.byAgent.slice(0, 3);
    const isApproaching = budget.data?.isApproachingBudget ?? false;
    const isOver = budget.data?.isOverBudget ?? false;

    return (
        <div className="space-y-3">
            {(isApproaching || isOver) && (
                <BudgetBanner
                    isOver={isOver}
                    monthToDateUsd={budget.data!.monthToDateUsd}
                    monthlyBudgetUsd={budget.data!.monthlyBudgetUsd!}
                    percent={budget.data!.percentUsed ?? 0}
                />
            )}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Stat
                    icon={<DollarSign className="h-4 w-4" aria-hidden="true" />}
                    label="Custo no período"
                    value={formatUsd(data.totalCostUsd)}
                    sub={`${data.totalTurns} turnos · ${data.totalTokens.toLocaleString("pt-BR")} tokens`}
                />
                <Stat
                    icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
                    label="Mês até agora"
                    value={formatUsd(data.monthToDateUsd)}
                    sub={
                        budget.data?.monthlyBudgetUsd
                            ? `de ${formatUsd(budget.data.monthlyBudgetUsd)} (${Math.round(
                                  (budget.data.percentUsed ?? 0) * 100,
                              )}%)`
                            : "Sem cap configurado"
                    }
                />
                <Stat
                    icon={<Zap className="h-4 w-4" aria-hidden="true" />}
                    label="Agentes ativos"
                    value={String(data.byAgent.filter((a) => a.sessions > 0).length)}
                    sub={`de ${data.byAgent.length} no total`}
                />
            </div>

            {topAgents.length > 0 && (
                <Card className="p-4">
                    <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-t3">
                        Top agentes por custo
                    </h3>
                    <ul className="space-y-2">
                        {topAgents.map((a) => (
                            <AgentRow key={a.agentId} row={a} totalCost={data.totalCostUsd} />
                        ))}
                    </ul>
                </Card>
            )}

            {data.byProvider.length > 0 && (
                <Card className="p-4">
                    <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-t3">
                        Custo por provider
                    </h3>
                    <ul className="space-y-2">
                        {data.byProvider.map((p) => (
                            <ProviderRow key={p.provider} row={p} totalCost={data.totalCostUsd} />
                        ))}
                    </ul>
                </Card>
            )}
        </div>
    );
}

function BudgetBanner({
    isOver,
    monthToDateUsd,
    monthlyBudgetUsd,
    percent,
}: {
    isOver: boolean;
    monthToDateUsd: number;
    monthlyBudgetUsd: number;
    percent: number;
}) {
    return (
        <div
            role="alert"
            className={cn(
                "flex items-start gap-3 rounded-lg border p-3 text-sm",
                isOver
                    ? "border-rose/40 bg-rose-dim text-rose"
                    : "border-amber/40 bg-amber-dim text-amber",
            )}
        >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
                <strong className="block">
                    {isOver
                        ? "Orçamento mensal de IA esgotado"
                        : "Aproximando do orçamento mensal de IA"}
                </strong>
                <span className="text-t2">
                    {formatUsd(monthToDateUsd)} de {formatUsd(monthlyBudgetUsd)} usados (
                    {Math.round(percent * 100)}%).{" "}
                    {isOver
                        ? "Novas sessões vão direto para atendimento humano até virar o mês."
                        : "Considere ajustar AI_MONTHLY_BUDGET_USD ou desativar agentes menos críticos."}
                </span>
            </div>
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

function AgentRow({ row, totalCost }: { row: AgentCostRow; totalCost: number }) {
    const share = totalCost > 0 ? row.totalCostUsd / totalCost : 0;
    return (
        <li>
            <div className="flex items-center justify-between text-sm">
                <span className="truncate font-medium text-t1">{row.agentName}</span>
                <span className="font-mono text-xs text-t2">{formatUsd(row.totalCostUsd)}</span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-3">
                <div
                    className="h-full rounded-full bg-violet"
                    style={{ width: `${Math.max(2, share * 100)}%` }}
                    aria-hidden="true"
                />
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-t3">
                <span>
                    {row.sessions} sessões · {row.turns} turnos
                </span>
                <span>{formatUsd(row.avgCostPerSessionUsd)} / sessão</span>
            </div>
        </li>
    );
}

function ProviderRow({
    row,
    totalCost,
}: {
    row: ProviderCostRow;
    totalCost: number;
}) {
    const share = totalCost > 0 ? row.totalCostUsd / totalCost : 0;
    return (
        <li className="flex items-center justify-between text-sm">
            <span className="text-t1 capitalize">{row.provider}</span>
            <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-t3">
                    {Math.round(share * 100)}%
                </span>
                <span className="font-mono text-xs text-t2">
                    {formatUsd(row.totalCostUsd)}
                </span>
            </div>
        </li>
    );
}
