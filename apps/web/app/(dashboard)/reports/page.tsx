"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function BarChart({
    data,
    label,
    color,
}: {
    data: { x: string; y: number }[];
    label: string;
    color: string;
}) {
    const max = Math.max(...data.map((d) => d.y));
    return (
        <div>
            <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-t3">
                {label}
            </p>
            <div className="flex h-20 items-end gap-1">
                {data.map((d) => (
                    <div key={d.x} className="flex flex-1 flex-col items-center gap-1">
                        <div
                            className={cn("w-full rounded-t-[3px] bg-gradient-to-b", color)}
                            style={{ height: `${(d.y / max) * 100}%`, minHeight: "4px" }}
                        />
                        <span className="font-mono text-[8px] text-t3">{d.x}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const REVENUE = [120, 145, 132, 190, 165, 210, 185, 230, 208, 252, 275, 284];
const LEADS = [45, 62, 58, 80, 72, 95, 88, 104, 96, 115, 128, 140];
const CONVERSION = [55, 60, 48, 62, 70, 65, 72, 68, 75, 78, 80, 68];

export default function ReportsPage() {
    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div>
                <h1 className="font-display text-[28px] font-semibold leading-none tracking-[-0.8px] text-t1">
                    Relatórios
                </h1>
                <p className="mt-1.5 text-sm text-t2">Análise de desempenho</p>
            </div>

            {/* Summary KPIs */}
            <div className="grid grid-cols-4 gap-3">
                {[
                    { label: "Leads gerados", value: "1.284", delta: "+18%", color: "text-cyan" },
                    { label: "Conversas", value: "3.721", delta: "+24%", color: "text-violet" },
                    { label: "Receita total", value: "R$2.4M", delta: "+31%", color: "text-jade" },
                    { label: "Taxa conversão", value: "68%", delta: "+5pp", color: "text-amber" },
                ].map((kpi) => (
                    <Card key={kpi.label}>
                        <CardContent className="pt-5">
                            <p className={cn("font-display text-2xl font-semibold", kpi.color)}>
                                {kpi.value}
                            </p>
                            <p className="mt-1 text-xs text-t2">{kpi.label}</p>
                            <span className="mt-2 inline-block rounded-[20px] bg-jade/10 px-2 py-0.5 font-mono text-[10px] text-jade border border-jade/20">
                                {kpi.delta}
                            </span>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-3 gap-4">
                <Card className="col-span-2">
                    <CardHeader>
                        <CardTitle>Receita mensal</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <BarChart
                            data={MONTHS.map((x, i) => ({ x, y: REVENUE[i]! }))}
                            label="R$ mil"
                            color="from-jade to-jade/40"
                        />
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Conversão</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <BarChart
                            data={MONTHS.map((x, i) => ({ x, y: CONVERSION[i]! }))}
                            label="%"
                            color="from-violet to-violet/40"
                        />
                    </CardContent>
                </Card>
            </div>

            {/* Leads chart */}
            <Card>
                <CardHeader>
                    <CardTitle>Leads por mês</CardTitle>
                </CardHeader>
                <CardContent>
                    <BarChart
                        data={MONTHS.map((x, i) => ({ x, y: LEADS[i]! }))}
                        label="quantidade"
                        color="from-cyan to-cyan/30"
                    />
                </CardContent>
            </Card>

            {/* Channel breakdown */}
            <Card>
                <CardHeader>
                    <CardTitle>Performance por canal</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    {[
                        { channel: "WhatsApp", leads: 520, revenue: "R$980k", conversion: "78%" },
                        { channel: "Instagram", leads: 310, revenue: "R$620k", conversion: "52%" },
                        { channel: "Meta Ads", leads: 248, revenue: "R$480k", conversion: "67%" },
                        { channel: "Google Ads", leads: 156, revenue: "R$240k", conversion: "41%" },
                        { channel: "E-mail", leads: 50, revenue: "R$80k", conversion: "29%" },
                    ].map((row) => (
                        <div
                            key={row.channel}
                            className="flex items-center justify-between rounded-[10px] border border-[var(--rim)] bg-surface-2 px-4 py-3"
                        >
                            <span className="text-sm font-medium text-t1 w-24">{row.channel}</span>
                            <span className="font-mono text-xs text-t2">{row.leads} leads</span>
                            <span className="font-mono text-xs text-jade">{row.revenue}</span>
                            <span className="font-mono text-xs text-cyan">{row.conversion}</span>
                        </div>
                    ))}
                </CardContent>
            </Card>
        </div>
    );
}
