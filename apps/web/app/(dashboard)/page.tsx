"use client";

import { useState } from "react";
import Link from "next/link";
import {
    TrendingUp,
    TrendingDown,
    MessageSquare,
    Users,
    DollarSign,
    Target,
    Briefcase,
} from "lucide-react";
import {
    LineChart,
    Line,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { cn, formatCurrency, formatRelative } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

interface DashboardData {
    kpis: {
        totalLeads: number;
        totalLeadsDelta: number;
        openConversations: number;
        openConversationsDelta: number;
        monthRevenue: number;
        monthRevenueDelta: number;
        conversionRate: number;
        conversionRateDelta: number;
    };
    openOpportunities: {
        count: number;
        totalValue: number;
        weightedProbability: number;
    };
    leadsByDay: { date: string; count: number }[];
    revenueByMonth: { month: string; value: number }[];
    recentConversations: {
        id: string;
        contact: { name: string; avatar: string | null };
        channel: string;
        lastMessage: string | null;
        lastMessageAt: string | null;
        unreadCount: number;
    }[];
    closingDeals: {
        id: string;
        title: string;
        value: number | null;
        expectedCloseDate: string | null;
        contact: { name: string } | null;
        probability: number | null;
    }[];
    recentActivities: {
        id: string;
        type: string;
        description: string;
        createdAt: string;
        contact?: { name: string } | null;
    }[];
}

// ── KPI Card ─────────────────────────────────────────────────────────────────

const ACCENT_STYLES = {
    cyan: {
        glow: "before:bg-[radial-gradient(circle,rgba(0,212,255,0.08)_0%,transparent_70%)]",
        top: "bg-gradient-to-r from-transparent via-cyan to-transparent",
        delta: "bg-cyan-dim text-cyan border-cyan/20",
    },
    violet: {
        glow: "before:bg-[radial-gradient(circle,rgba(124,92,252,0.08)_0%,transparent_70%)]",
        top: "bg-gradient-to-r from-transparent via-violet to-transparent",
        delta: "bg-violet-dim text-violet border-violet/20",
    },
    jade: {
        glow: "before:bg-[radial-gradient(circle,rgba(0,229,160,0.08)_0%,transparent_70%)]",
        top: "bg-gradient-to-r from-transparent via-jade to-transparent",
        delta: "bg-jade-dim text-jade border-jade/20",
    },
    amber: {
        glow: "before:bg-[radial-gradient(circle,rgba(255,181,71,0.08)_0%,transparent_70%)]",
        top: "bg-gradient-to-r from-transparent via-amber to-transparent",
        delta: "bg-amber-dim text-amber border-amber/20",
    },
};

function KpiCard({
    value,
    label,
    delta,
    positive,
    accent,
    icon,
    loading,
}: {
    value: string;
    label: string;
    delta: string;
    positive: boolean;
    accent: keyof typeof ACCENT_STYLES;
    icon: React.ReactNode;
    loading?: boolean;
}) {
    const s = ACCENT_STYLES[accent];
    return (
        <div
            className={cn(
                "relative overflow-hidden rounded-[16px] border border-[var(--rim)] bg-surface p-5",
                "transition-all duration-200 cursor-default hover:border-[var(--rim2)] hover:-translate-y-0.5",
                "before:pointer-events-none before:absolute before:-right-8 before:-top-8 before:h-24 before:w-24 before:rounded-full",
                s.glow,
            )}
        >
            <div className={cn("absolute left-0 right-0 top-0 h-px opacity-50", s.top)} />
            <span className="mb-3.5 block text-[18px]">{icon}</span>
            {loading ? (
                <>
                    <Skeleton className="h-8 w-24 mb-2" />
                    <Skeleton className="h-3 w-32 mb-3.5" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                </>
            ) : (
                <>
                    <p className="font-display text-[30px] font-semibold leading-none tracking-[-1px] text-t1">
                        {value}
                    </p>
                    <p className="mb-3.5 mt-1.5 text-xs text-t2">{label}</p>
                    <span
                        className={cn(
                            "inline-flex items-center gap-1 rounded-[20px] border px-2 py-0.5 font-mono text-[11px]",
                            s.delta,
                        )}
                    >
                        {positive ? (
                            <TrendingUp className="h-3 w-3" />
                        ) : (
                            <TrendingDown className="h-3 w-3" />
                        )}
                        {delta}
                    </span>
                </>
            )}
        </div>
    );
}

// ── Channel visuals ───────────────────────────────────────────────────────────

const CHANNEL_COLORS: Record<string, string> = {
    whatsapp: "from-[#25d366] to-[#128c7e]",
    instagram: "from-[#e1306c] to-[#833ab4]",
    messenger: "from-[#00b2ff] to-[#006aff]",
    email: "from-t3 to-t2",
    web: "from-violet to-cyan",
};

const CHANNEL_BADGE: Record<string, string> = {
    whatsapp: "💬",
    instagram: "📸",
    messenger: "📘",
    email: "✉",
    web: "🌐",
};

// ── Activity icons ────────────────────────────────────────────────────────────

const ACTIVITY_ICONS: Record<string, string> = {
    contact_created: "👤",
    deal_created: "💼",
    deal_moved: "📦",
    message_received: "💬",
    deal_won: "🏆",
    deal_lost: "❌",
    note_added: "📝",
};

// ── Range options ─────────────────────────────────────────────────────────────

const RANGE_OPTIONS = ["Hoje", "Semana", "Mês"] as const;
type RangeOption = (typeof RANGE_OPTIONS)[number];

const RANGE_MAP: Record<RangeOption, string> = {
    Hoje: "today",
    Semana: "week",
    Mês: "month",
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
    const [range, setRange] = useState<RangeOption>("Mês");

    const { data, isLoading } = useQuery({
        queryKey: ["reports", "dashboard", range],
        queryFn: async () => {
            const { data } = await api.get("/reports/dashboard", {
                params: { range: RANGE_MAP[range] },
            });
            return data as DashboardData;
        },
    });

    const today = new Intl.DateTimeFormat("pt-BR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
    }).format(new Date());

    const kpis = data?.kpis;

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-end justify-between">
                <div>
                    <h1 className="font-display text-[28px] font-semibold leading-none tracking-[-0.8px] text-t1">
                        Visão Geral
                    </h1>
                    <p className="mt-1.5 text-sm text-t2 capitalize">{today}</p>
                </div>
                <div className="flex gap-1 rounded-[10px] border border-[var(--rim)] bg-surface-2 p-1">
                    {RANGE_OPTIONS.map((label) => (
                        <button
                            key={label}
                            onClick={() => setRange(label)}
                            className={cn(
                                "rounded-[6px] px-3.5 py-1.5 text-xs font-medium transition-all",
                                range === label
                                    ? "bg-surface-3 text-t1 shadow-sm"
                                    : "text-t2 hover:text-t1",
                            )}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* KPI Grid */}
            <div className="grid grid-cols-4 gap-3">
                <KpiCard
                    loading={isLoading}
                    value={kpis ? String(kpis.totalLeads) : "—"}
                    label="Total de Leads"
                    delta={kpis ? `${kpis.totalLeadsDelta >= 0 ? "+" : ""}${kpis.totalLeadsDelta}% vs anterior` : "—"}
                    positive={(kpis?.totalLeadsDelta ?? 0) >= 0}
                    accent="cyan"
                    icon={<Users className="h-5 w-5 text-cyan" />}
                />
                <KpiCard
                    loading={isLoading}
                    value={kpis ? String(kpis.openConversations) : "—"}
                    label="Total Conversas"
                    delta={kpis ? `${kpis.openConversationsDelta >= 0 ? "+" : ""}${kpis.openConversationsDelta}% vs anterior` : "—"}
                    positive={(kpis?.openConversationsDelta ?? 0) >= 0}
                    accent="violet"
                    icon={<MessageSquare className="h-5 w-5 text-violet" />}
                />
                <KpiCard
                    loading={isLoading}
                    value={kpis ? formatCurrency(kpis.monthRevenue, { compact: true }) : "—"}
                    label="Receita do Mês"
                    delta={kpis ? `${kpis.monthRevenueDelta >= 0 ? "+" : ""}${kpis.monthRevenueDelta}% vs meta` : "—"}
                    positive={(kpis?.monthRevenueDelta ?? 0) >= 0}
                    accent="jade"
                    icon={<DollarSign className="h-5 w-5 text-jade" />}
                />
                <KpiCard
                    loading={isLoading}
                    value={kpis ? `${kpis.conversionRate}%` : "—"}
                    label="Taxa de Conversão"
                    delta={kpis ? `${kpis.conversionRateDelta >= 0 ? "+" : ""}${kpis.conversionRateDelta}% vs mês` : "—"}
                    positive={(kpis?.conversionRateDelta ?? 0) >= 0}
                    accent="amber"
                    icon={<Target className="h-5 w-5 text-amber" />}
                />
            </div>

            {/* Open Opportunities Banner */}
            <div className="rounded-[16px] border border-[var(--rim)] bg-surface overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3.5 border-b border-[var(--rim)]">
                    <Briefcase className="h-4 w-4 text-violet" />
                    <span className="text-sm font-medium text-t1">Oportunidades em aberto</span>
                    <Link href="/pipeline" className="ml-auto font-mono text-[11px] text-cyan hover:opacity-70">
                        ver pipeline →
                    </Link>
                </div>
                <div className="grid grid-cols-3 divide-x divide-[var(--rim)]">
                    {/* Count */}
                    <div className="px-6 py-4">
                        {isLoading ? (
                            <Skeleton className="h-7 w-16 mb-1" />
                        ) : (
                            <p className="font-display text-[26px] font-semibold leading-none tracking-[-0.6px] text-t1">
                                {data?.openOpportunities?.count ?? 0}
                            </p>
                        )}
                        <p className="mt-1.5 text-xs text-t2">Deals em andamento</p>
                    </div>
                    {/* Total value */}
                    <div className="px-6 py-4">
                        {isLoading ? (
                            <Skeleton className="h-7 w-28 mb-1" />
                        ) : (
                            <p className="font-display text-[26px] font-semibold leading-none tracking-[-0.6px] text-jade">
                                {formatCurrency(data?.openOpportunities?.totalValue ?? 0, { compact: true })}
                            </p>
                        )}
                        <p className="mt-1.5 text-xs text-t2">Volume total do pipeline</p>
                    </div>
                    {/* Weighted probability */}
                    <div className="px-6 py-4">
                        {isLoading ? (
                            <Skeleton className="h-7 w-20 mb-1" />
                        ) : (
                            <>
                                <div className="flex items-baseline gap-2">
                                    <p className="font-display text-[26px] font-semibold leading-none tracking-[-0.6px] text-amber">
                                        {data?.openOpportunities?.weightedProbability ?? 0}%
                                    </p>
                                </div>
                                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                                    <div
                                        className="h-full rounded-full bg-gradient-to-r from-amber to-jade transition-all duration-500"
                                        style={{ width: `${data?.openOpportunities?.weightedProbability ?? 0}%` }}
                                    />
                                </div>
                                <p className="mt-1.5 text-xs text-t2">Probabilidade média ponderada de fechamento</p>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Main grid */}
            <div className="grid grid-cols-[1fr_340px] gap-4">
                {/* Left: charts + deals */}
                <div className="space-y-4">
                    {/* Line chart: leads per day */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Leads por dia (últimos 30 dias)</CardTitle>
                            <Link href="/contacts" className="ml-auto font-mono text-[11px] text-cyan hover:opacity-70">
                                ver contatos →
                            </Link>
                        </CardHeader>
                        <CardContent>
                            {isLoading ? (
                                <Skeleton className="h-48 w-full rounded-[10px]" />
                            ) : (
                                <ResponsiveContainer width="100%" height={192}>
                                    <LineChart data={data?.leadsByDay ?? []}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--rim)" vertical={false} />
                                        <XAxis
                                            dataKey="date"
                                            tick={{ fontSize: 10, fill: "var(--t3)" }}
                                            tickLine={false}
                                            axisLine={false}
                                            tickFormatter={(v: string) => {
                                                const d = new Date(v);
                                                return `${d.getDate()}/${d.getMonth() + 1}`;
                                            }}
                                        />
                                        <YAxis
                                            tick={{ fontSize: 10, fill: "var(--t3)" }}
                                            tickLine={false}
                                            axisLine={false}
                                            width={28}
                                        />
                                        <Tooltip
                                            content={({ active, payload, label }) => {
                                                if (!active || !payload?.length) return null;
                                                return (
                                                    <div className="rounded-[10px] border border-[var(--rim)] bg-surface px-3 py-2 shadow-xl">
                                                        <p className="font-mono text-[10px] text-t3">{String(label)}</p>
                                                        <p className="font-display text-sm font-semibold text-t1">{payload[0]?.value as number} leads</p>
                                                    </div>
                                                );
                                            }}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="count"
                                            stroke="#7c5cfc"
                                            strokeWidth={2}
                                            dot={false}
                                            activeDot={{ r: 4, fill: "#7c5cfc" }}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            )}
                        </CardContent>
                    </Card>

                    {/* Bar chart: revenue per month */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Receita por mês</CardTitle>
                            <Link href="/reports" className="ml-auto font-mono text-[11px] text-cyan hover:opacity-70">
                                ver relatório →
                            </Link>
                        </CardHeader>
                        <CardContent>
                            {isLoading ? (
                                <Skeleton className="h-48 w-full rounded-[10px]" />
                            ) : (
                                <ResponsiveContainer width="100%" height={192}>
                                    <BarChart data={data?.revenueByMonth ?? []}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--rim)" vertical={false} />
                                        <XAxis
                                            dataKey="month"
                                            tick={{ fontSize: 10, fill: "var(--t3)" }}
                                            tickLine={false}
                                            axisLine={false}
                                        />
                                        <YAxis
                                            tick={{ fontSize: 10, fill: "var(--t3)" }}
                                            tickLine={false}
                                            axisLine={false}
                                            width={40}
                                            tickFormatter={(v: number) =>
                                                v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                                            }
                                        />
                                        <Tooltip
                                            content={({ active, payload, label }) => {
                                                if (!active || !payload?.length) return null;
                                                return (
                                                    <div className="rounded-[10px] border border-[var(--rim)] bg-surface px-3 py-2 shadow-xl">
                                                        <p className="font-mono text-[10px] text-t3">{String(label)}</p>
                                                        <p className="font-display text-sm font-semibold text-jade">
                                                            {formatCurrency((payload[0]?.value ?? 0) as number)}
                                                        </p>
                                                    </div>
                                                );
                                            }}
                                        />
                                        <Bar dataKey="value" fill="#00e5a0" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </CardContent>
                    </Card>

                    {/* Closing deals */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Deals próximos do fechamento</CardTitle>
                            <Link href="/pipeline" className="ml-auto font-mono text-[11px] text-cyan hover:opacity-70">
                                ver pipeline →
                            </Link>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {isLoading
                                ? Array.from({ length: 3 }).map((_, i) => (
                                    <div key={i} className="flex items-center gap-3 rounded-[10px] border border-[var(--rim)] p-3">
                                        <Skeleton className="h-8 w-8 rounded-full" />
                                        <div className="flex-1 space-y-1">
                                            <Skeleton className="h-3 w-40" />
                                            <Skeleton className="h-3 w-24" />
                                        </div>
                                        <Skeleton className="h-5 w-16 rounded-full" />
                                    </div>
                                ))
                                : (data?.closingDeals ?? []).length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-10 text-t3">
                                        <p className="text-sm">Nenhum deal próximo do fechamento</p>
                                    </div>
                                ) : (
                                    (data?.closingDeals ?? []).map((deal) => (
                                        <Link
                                            key={deal.id}
                                            href="/pipeline"
                                            className="flex cursor-pointer items-center gap-3 rounded-[10px] border border-[var(--rim)] bg-surface-2 p-3 transition-all hover:border-[var(--rim2)]"
                                        >
                                            <Avatar className="h-8 w-8">
                                                <AvatarFallback className="bg-gradient-to-br from-violet to-cyan text-[11px]">
                                                    {(deal.contact?.name ?? "?")
                                                        .split(" ")
                                                        .slice(0, 2)
                                                        .map((n) => n[0])
                                                        .join("")}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-[13px] font-medium text-t1">{deal.title}</p>
                                                <p className="text-[11px] text-t2">
                                                    {deal.contact?.name ?? "Sem contato"}
                                                    {deal.expectedCloseDate && (
                                                        <span className="text-amber">
                                                            {" · "}fecha{" "}
                                                            {new Date(deal.expectedCloseDate).toLocaleDateString("pt-BR")}
                                                        </span>
                                                    )}
                                                </p>
                                            </div>
                                            {deal.value && (
                                                <span className="font-mono text-sm font-semibold text-jade">
                                                    {formatCurrency(deal.value, { compact: true })}
                                                </span>
                                            )}
                                            {deal.probability !== null && (
                                                <Badge variant="muted">{deal.probability}%</Badge>
                                            )}
                                        </Link>
                                    ))
                                )}
                        </CardContent>
                    </Card>
                </div>

                {/* Right column */}
                <div className="space-y-4">
                    {/* Recent conversations */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Últimas conversas</CardTitle>
                            <Link href="/inbox" className="ml-auto font-mono text-[11px] text-cyan hover:opacity-70">
                                ver tudo →
                            </Link>
                        </CardHeader>
                        <div className="flex flex-col border-t border-[var(--rim)]">
                            {isLoading
                                ? Array.from({ length: 4 }).map((_, i) => (
                                    <div key={i} className="flex items-start gap-3 border-b border-[var(--rim)] px-5 py-3.5 last:border-none">
                                        <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                                        <div className="flex-1 space-y-1.5">
                                            <Skeleton className="h-3 w-28" />
                                            <Skeleton className="h-3 w-44" />
                                        </div>
                                    </div>
                                ))
                                : (data?.recentConversations ?? []).length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-10 text-t3 px-5">
                                        <p className="text-sm">Sem conversas abertas</p>
                                    </div>
                                ) : (
                                    (data?.recentConversations ?? []).map((conv) => (
                                        <Link
                                            key={conv.id}
                                            href={`/inbox/${conv.id}`}
                                            className={cn(
                                                "flex cursor-pointer items-start gap-3 border-b border-[var(--rim)] px-5 py-3.5 transition-colors last:border-none hover:bg-surface-2",
                                                conv.unreadCount > 0 && "bg-violet/[0.04]",
                                            )}
                                        >
                                            <div className="relative shrink-0">
                                                <Avatar className="h-9 w-9">
                                                    <AvatarFallback
                                                        className={cn(
                                                            "bg-gradient-to-br text-[13px] font-semibold",
                                                            CHANNEL_COLORS[conv.channel] ?? "from-violet to-cyan",
                                                        )}
                                                    >
                                                        {conv.contact.name
                                                            .split(" ")
                                                            .slice(0, 2)
                                                            .map((n) => n[0])
                                                            .join("")}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border-[1.5px] border-surface bg-surface-2 text-[7px]">
                                                    {CHANNEL_BADGE[conv.channel] ?? "💬"}
                                                </span>
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[13px] font-medium text-t1">{conv.contact.name}</p>
                                                <p className={cn("truncate text-xs", conv.unreadCount > 0 ? "text-t1" : "text-t2")}>
                                                    {conv.lastMessage ?? "Nenhuma mensagem"}
                                                </p>
                                            </div>
                                            <div className="flex shrink-0 flex-col items-end gap-1">
                                                <span className="font-mono text-[10px] text-t3">
                                                    {conv.lastMessageAt ? formatRelative(conv.lastMessageAt) : ""}
                                                </span>
                                                {conv.unreadCount > 0 && (
                                                    <span className="h-2 w-2 rounded-full bg-violet shadow-[0_0_6px_#7c5cfc]" />
                                                )}
                                            </div>
                                        </Link>
                                    ))
                                )}
                        </div>
                    </Card>

                    {/* Recent activities */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Atividades recentes</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-0">
                            {isLoading
                                ? Array.from({ length: 5 }).map((_, i) => (
                                    <div key={i} className="flex gap-3 border-b border-[var(--rim)] py-3 last:border-none">
                                        <Skeleton className="h-8 w-8 shrink-0 rounded-[6px]" />
                                        <div className="flex-1 space-y-1">
                                            <Skeleton className="h-3 w-48" />
                                            <Skeleton className="h-3 w-20" />
                                        </div>
                                    </div>
                                ))
                                : (data?.recentActivities ?? []).length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-10 text-t3">
                                        <p className="text-sm">Nenhuma atividade recente</p>
                                    </div>
                                ) : (
                                    (data?.recentActivities ?? []).map((activity) => (
                                        <div
                                            key={activity.id}
                                            className="flex gap-3 border-b border-[var(--rim)] py-3 last:border-none"
                                        >
                                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] bg-surface-2 text-sm">
                                                {ACTIVITY_ICONS[activity.type] ?? "📌"}
                                            </div>
                                            <div>
                                                <p className="text-xs text-t1">{activity.description}</p>
                                                {activity.contact && (
                                                    <p className="text-[11px] text-t2">{activity.contact.name}</p>
                                                )}
                                                <p className="mt-0.5 font-mono text-[10px] text-t3">
                                                    {formatRelative(activity.createdAt)}
                                                </p>
                                            </div>
                                        </div>
                                    ))
                                )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
