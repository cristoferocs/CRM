"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
    Legend, ResponsiveContainer, FunnelChart, Funnel, LabelList,
} from "recharts";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
    TrendingUp, TrendingDown, DollarSign, Users, MessageSquare,
    Target, Trophy, Bot, BarChart2, Filter,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

const TABS = [
    { key: "dashboard", label: "Dashboard" },
    { key: "funnel", label: "Funil" },
    { key: "forecast", label: "Previsão" },
    { key: "team", label: "Equipe" },
    { key: "channels", label: "Canais" },
    { key: "ai-agents", label: "Agentes IA" },
    { key: "roi", label: "ROI" },
] as const;

type Tab = typeof TABS[number]["key"];

const COLORS = ["#7c5cfc", "#06b6d4", "#10b981", "#f59e0b", "#ec4899", "#6366f1", "#ef4444"];

// ---------------------------------------------------------------------------
// Metric Card
// ---------------------------------------------------------------------------

function MetricCard({ title, value, delta, icon: Icon, prefix = "", format }: {
    title: string; value: number; delta?: number; icon: React.ComponentType<{ className?: string }>;
    prefix?: string; format?: "currency" | "percent" | "number";
}) {
    const formatted = format === "currency"
        ? `${prefix}R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}`
        : format === "percent" ? `${value}%` : `${prefix}${value.toLocaleString("pt-BR")}`;
    const isPositive = (delta ?? 0) >= 0;

    return (
        <Card>
            <CardContent className="p-5">
                <div className="flex items-start justify-between">
                    <div>
                        <p className="text-xs font-medium text-t3 uppercase tracking-wide">{title}</p>
                        <p className="mt-1.5 text-2xl font-bold text-t1">{formatted}</p>
                        {delta !== undefined && (
                            <div className={cn("mt-1 flex items-center gap-1 text-xs", isPositive ? "text-green-500" : "text-red-400")}>
                                {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                {Math.abs(delta)}% vs período anterior
                            </div>
                        )}
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet/10">
                        <Icon className="h-5 w-5 text-violet" />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

// ---------------------------------------------------------------------------
// Dashboard Tab
// ---------------------------------------------------------------------------

function DashboardTab({ range }: { range: string }) {
    const { data } = useQuery({
        queryKey: ["reports", "dashboard", range],
        queryFn: () => api.get(`/reports/dashboard?range=${range}`).then(r => r.data),
    });

    if (!data) return <div className="grid grid-cols-4 gap-4">{[...Array(8)].map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-surface2" />)}</div>;

    const leadsChartData = (data.leadsChart ?? []).map((d: { date: string; count: number }) => ({
        date: d.date, leads: d.count,
    }));

    const revenueChartData = (data.revenueChart ?? []).map((d: { month: string; revenue: number }) => ({
        month: d.month, receita: d.revenue,
    }));

    return (
        <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <MetricCard title="Novos Leads" value={data.metrics?.leads?.current ?? 0} delta={data.metrics?.leads?.delta} icon={Users} />
                <MetricCard title="Conversações" value={data.metrics?.conversations?.current ?? 0} delta={data.metrics?.conversations?.delta} icon={MessageSquare} />
                <MetricCard title="Receita Mensal" value={data.metrics?.revenue?.current ?? 0} delta={data.metrics?.revenue?.delta} icon={DollarSign} format="currency" />
                <MetricCard title="Taxa de Conversão" value={data.metrics?.conversionRate ?? 0} icon={Target} format="percent" />
            </div>

            <div className="grid grid-cols-2 gap-6">
                <Card>
                    <CardHeader><CardTitle className="text-sm">Novos Leads (30 dias)</CardTitle></CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={200}>
                            <AreaChart data={leadsChartData}>
                                <defs>
                                    <linearGradient id="leadsGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#7c5cfc" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#7c5cfc" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--rim)" />
                                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                                <YAxis tick={{ fontSize: 10 }} />
                                <Tooltip />
                                <Area type="monotone" dataKey="leads" stroke="#7c5cfc" fill="url(#leadsGrad)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader><CardTitle className="text-sm">Receita Mensal (6 meses)</CardTitle></CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={revenueChartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--rim)" />
                                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                                <YAxis tick={{ fontSize: 10 }} />
                                <Tooltip formatter={(v) => [`R$ ${Number(v).toLocaleString("pt-BR")}`, "Receita"]} />
                                <Bar dataKey="receita" fill="#7c5cfc" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Funnel Tab
// ---------------------------------------------------------------------------

function FunnelTab() {
    const { data = [] } = useQuery({
        queryKey: ["reports", "funnel"],
        queryFn: () => api.get("/reports/funnel").then(r => r.data),
    });

    const pipeline = data[0];
    if (!pipeline) return <p className="text-t3 text-sm">Sem dados de funil.</p>;

    const funnelData = pipeline.stages.map((s: { name: string; count: number; totalValue: number }) => ({
        name: s.name, value: s.count, fill: COLORS[pipeline.stages.indexOf(s) % COLORS.length],
    }));

    return (
        <div className="grid grid-cols-2 gap-6">
            <Card>
                <CardHeader><CardTitle className="text-sm">Funil de Vendas — {pipeline.pipelineName}</CardTitle></CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                        <FunnelChart>
                            <Tooltip />
                            <Funnel dataKey="value" data={funnelData} isAnimationActive>
                                <LabelList position="right" fill="#888" stroke="none" dataKey="name" />
                            </Funnel>
                        </FunnelChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle className="text-sm">Valor por Stage</CardTitle></CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={pipeline.stages} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--rim)" />
                            <XAxis type="number" tick={{ fontSize: 10 }} />
                            <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} />
                            <Tooltip formatter={(v) => [`R$ ${Number(v).toLocaleString("pt-BR")}`, "Valor"]} />
                            <Bar dataKey="totalValue" fill="#7c5cfc" radius={[0, 4, 4, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Forecast Tab
// ---------------------------------------------------------------------------

function ForecastTab() {
    const { data } = useQuery({
        queryKey: ["reports", "forecast"],
        queryFn: () => api.get("/reports/forecast?months=6").then(r => r.data),
    });

    if (!data) return <div className="h-64 animate-pulse rounded-xl bg-surface2" />;

    const chartData = (data.forecast ?? []).map((f: { month: string; expected: number; weighted: number }) => ({
        month: f.month, Esperado: Math.round(f.expected), Ponderado: Math.round(f.weighted),
    }));

    return (
        <div className="flex flex-col gap-6">
            <div className="grid grid-cols-3 gap-4">
                <MetricCard title="Total Esperado" value={Math.round(data.totalExpected ?? 0)} icon={TrendingUp} format="currency" />
                <MetricCard title="Ponderado (prob)" value={Math.round(data.totalWeighted ?? 0)} icon={Target} format="currency" />
                <MetricCard title="Média Mensal Histórica" value={Math.round(data.monthlyAvgRevenue ?? 0)} icon={DollarSign} format="currency" />
            </div>
            <Card>
                <CardHeader><CardTitle className="text-sm">Previsão de Receita (6 meses)</CardTitle></CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--rim)" />
                            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} />
                            <Tooltip formatter={(v) => [`R$ ${Number(v).toLocaleString("pt-BR")}`, ""]} />
                            <Legend />
                            <Bar dataKey="Esperado" fill="#7c5cfc" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="Ponderado" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Team Tab
// ---------------------------------------------------------------------------

function TeamTab({ range }: { range: string }) {
    const { data = [] } = useQuery({
        queryKey: ["reports", "team", range],
        queryFn: () => api.get(`/reports/team?range=${range}`).then(r => r.data),
    });

    return (
        <div className="flex flex-col gap-4">
            {data.map((user: { id: string; name: string; avatar?: string; role: string; revenue: number; wonDeals: number; convRate: number; completedActivities: number; rank?: number }, i: number) => (
                <Card key={user.id}>
                    <CardContent className="flex items-center gap-4 p-4">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet/10 text-sm font-bold text-violet">
                            {i + 1}
                        </div>
                        <Avatar className="h-10 w-10">
                            <AvatarImage src={user.avatar} />
                            <AvatarFallback>{user.name?.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                            <p className="font-semibold text-t1">{user.name}</p>
                            <p className="text-xs text-t3">{user.role}</p>
                        </div>
                        <div className="flex gap-6 text-center text-xs">
                            <div>
                                <p className="font-bold text-t1">R$ {user.revenue.toLocaleString("pt-BR")}</p>
                                <p className="text-t3">Receita</p>
                            </div>
                            <div>
                                <p className="font-bold text-t1">{user.wonDeals}</p>
                                <p className="text-t3">Deals ganhos</p>
                            </div>
                            <div>
                                <p className="font-bold text-t1">{user.convRate}%</p>
                                <p className="text-t3">Conversão</p>
                            </div>
                            <div>
                                <p className="font-bold text-t1">{user.completedActivities}</p>
                                <p className="text-t3">Atividades</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Channels Tab
// ---------------------------------------------------------------------------

function ChannelsTab({ range }: { range: string }) {
    const { data = [] } = useQuery({
        queryKey: ["reports", "channels", range],
        queryFn: () => api.get(`/reports/channels?range=${range}`).then(r => r.data),
    });

    const pieData = data.map((c: { channel: string; count: number }) => ({ name: c.channel, value: c.count }));

    return (
        <div className="grid grid-cols-2 gap-6">
            <Card>
                <CardHeader><CardTitle className="text-sm">Distribuição de Canais</CardTitle></CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                            <Pie data={pieData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                                {pieData.map((_: unknown, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                            </Pie>
                            <Tooltip />
                        </PieChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
            <Card>
                <CardHeader><CardTitle className="text-sm">Métricas por Canal</CardTitle></CardHeader>
                <CardContent>
                    <div className="flex flex-col gap-3">
                        {data.map((c: { channel: string; count: number; resolutionRate: number; avgResponseMinutes: number }) => (
                            <div key={c.channel} className="flex items-center gap-3 rounded-lg bg-surface2 px-3 py-2.5">
                                <div className="min-w-0 flex-1">
                                    <p className="font-medium text-t1 capitalize">{c.channel.toLowerCase()}</p>
                                    <p className="text-xs text-t3">{c.count} conversas</p>
                                </div>
                                <div className="text-right text-xs">
                                    <p className="font-semibold text-green-500">{c.resolutionRate}% resolvidas</p>
                                    <p className="text-t3">{c.avgResponseMinutes}min resposta</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

// ---------------------------------------------------------------------------
// AI Agents Tab
// ---------------------------------------------------------------------------

function AIAgentsTab({ range }: { range: string }) {
    const { data = [] } = useQuery({
        queryKey: ["reports", "ai-agents", range],
        queryFn: () => api.get(`/reports/ai-agents?range=${range}`).then(r => r.data),
    });

    return (
        <div className="flex flex-col gap-4">
            {data.map((agent: { id: string; name: string; type: string; totalConversations: number; resolutionRate: number; totalMessages: number; avgMessagesPerConv: number }) => (
                <Card key={agent.id}>
                    <CardContent className="flex items-center gap-4 p-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet/10">
                            <Bot className="h-5 w-5 text-violet" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="font-semibold text-t1">{agent.name}</p>
                            <Badge variant="outline" className="text-[10px] mt-0.5">{agent.type}</Badge>
                        </div>
                        <div className="flex gap-6 text-center text-xs">
                            <div><p className="font-bold text-t1">{agent.totalConversations}</p><p className="text-t3">Conversas</p></div>
                            <div><p className="font-bold text-green-500">{agent.resolutionRate}%</p><p className="text-t3">Resolução</p></div>
                            <div><p className="font-bold text-t1">{agent.totalMessages}</p><p className="text-t3">Mensagens</p></div>
                            <div><p className="font-bold text-t1">{agent.avgMessagesPerConv}</p><p className="text-t3">Média/conv</p></div>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}

// ---------------------------------------------------------------------------
// ROI Tab
// ---------------------------------------------------------------------------

function ROITab() {
    const { data = [] } = useQuery({
        queryKey: ["reports", "roi"],
        queryFn: () => api.get("/reports/client-roi").then(r => r.data),
    });

    const chartData = data.slice(0, 10).map((c: { contactName: string; totalRevenue: number }) => ({
        name: c.contactName?.split(" ")[0] ?? "?", revenue: c.totalRevenue,
    }));

    return (
        <div className="flex flex-col gap-6">
            <Card>
                <CardHeader><CardTitle className="text-sm">Top 10 Clientes por Receita</CardTitle></CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={chartData} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--rim)" />
                            <XAxis type="number" tick={{ fontSize: 10 }} />
                            <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 10 }} />
                            <Tooltip formatter={(v) => [`R$ ${Number(v).toLocaleString("pt-BR")}`, "Receita"]} />
                            <Bar dataKey="revenue" fill="#7c5cfc" radius={[0, 4, 4, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ReportsPage() {
    const [tab, setTab] = useState<Tab>("dashboard");
    const [range, setRange] = useState("30d");

    return (
        <div className="flex flex-col gap-6 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-t1">Relatórios</h1>
                    <p className="text-sm text-t3">Análise completa do seu negócio</p>
                </div>
                <Select value={range} onValueChange={setRange}>
                    <SelectTrigger className="w-36">
                        <Filter className="mr-2 h-3.5 w-3.5 text-t3" />
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="7d">Últimos 7 dias</SelectItem>
                        <SelectItem value="30d">Últimos 30 dias</SelectItem>
                        <SelectItem value="90d">Últimos 90 dias</SelectItem>
                        <SelectItem value="month">Este mês</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 overflow-x-auto rounded-xl bg-surface2 p-1">
                {TABS.map(t => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={cn(
                            "whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all",
                            tab === t.key
                                ? "bg-surface shadow-sm text-t1"
                                : "text-t3 hover:text-t2",
                        )}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            {tab === "dashboard" && <DashboardTab range={range} />}
            {tab === "funnel" && <FunnelTab />}
            {tab === "forecast" && <ForecastTab />}
            {tab === "team" && <TeamTab range={range} />}
            {tab === "channels" && <ChannelsTab range={range} />}
            {tab === "ai-agents" && <AIAgentsTab range={range} />}
            {tab === "roi" && <ROITab />}
        </div>
    );
}
