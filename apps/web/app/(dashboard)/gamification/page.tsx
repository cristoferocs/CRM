"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trophy, Target, Star, Zap, TrendingUp, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const TABS = [
    { key: "ranking", label: "Ranking" },
    { key: "achievements", label: "Conquistas" },
    { key: "goals", label: "Metas" },
] as const;

type Tab = typeof TABS[number]["key"];

const RANK_COLORS = ["#f59e0b", "#9ca3af", "#b45309", "#7c5cfc", "#7c5cfc"];
const RANK_ICONS = ["👑", "🥈", "🥉"];

export default function GamificationPage() {
    const qc = useQueryClient();
    const [tab, setTab] = useState<Tab>("ranking");
    const [period, setPeriod] = useState<"week" | "month" | "alltime">("month");

    const { data: ranking = [] } = useQuery({
        queryKey: ["gamification", "ranking", period],
        queryFn: () => api.get(`/gamification/ranking?period=${period}`).then(r => r.data),
    });

    const { data: achievements } = useQuery({
        queryKey: ["gamification", "achievements"],
        queryFn: () => api.get("/gamification/achievements").then(r => r.data),
    });

    const { data: goals = [] } = useQuery({
        queryKey: ["gamification", "goals"],
        queryFn: () => api.get("/gamification/goals").then(r => r.data),
    });

    const checkMutation = useMutation({
        mutationFn: () => api.post("/gamification/achievements/check"),
        onSuccess: (res) => {
            const newOnes = res.data ?? [];
            if (newOnes.length > 0) toast.success(`🎉 ${newOnes.length} nova(s) conquista(s) desbloqueada(s)!`);
            else toast.info("Nenhuma conquista nova por agora.");
            qc.invalidateQueries({ queryKey: ["gamification"] });
        },
    });

    return (
        <div className="flex flex-col gap-6 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-t1">Gamificação</h1>
                    <p className="text-sm text-t3">Rankings, conquistas e metas da equipe</p>
                </div>
                <Button variant="outline" className="gap-2" onClick={() => checkMutation.mutate()} disabled={checkMutation.isPending}>
                    <Zap className="h-4 w-4" />
                    Verificar Conquistas
                </Button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 rounded-xl bg-surface2 p-1 w-fit">
                {TABS.map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)}
                        className={cn("rounded-lg px-4 py-2 text-sm font-medium transition-all",
                            tab === t.key ? "bg-surface shadow-sm text-t1" : "text-t3 hover:text-t2")}>
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Ranking Tab */}
            {tab === "ranking" && (
                <div className="flex flex-col gap-4">
                    <div className="flex justify-end">
                        <Select value={period} onValueChange={v => setPeriod(v as typeof period)}>
                            <SelectTrigger className="w-36">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="week">Esta semana</SelectItem>
                                <SelectItem value="month">Este mês</SelectItem>
                                <SelectItem value="alltime">Todos os tempos</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Top 3 podium */}
                    {ranking.length >= 3 && (
                        <div className="flex items-end justify-center gap-4 py-6">
                            {[ranking[1], ranking[0], ranking[2]].map((user: { id: string; name: string; avatar?: string; totalPoints: number }, podiumIdx: number) => {
                                const heights = ["h-24", "h-32", "h-20"];
                                const ranks = [2, 1, 3];
                                const rank = ranks[podiumIdx]!;
                                return (
                                    <div key={user.id} className="flex flex-col items-center gap-2">
                                        <div className="text-2xl">{RANK_ICONS[rank - 1]}</div>
                                        <Avatar className="h-12 w-12 border-2" style={{ borderColor: RANK_COLORS[rank - 1] }}>
                                            <AvatarImage src={user.avatar} />
                                            <AvatarFallback>{user.name?.charAt(0)}</AvatarFallback>
                                        </Avatar>
                                        <div className="text-center">
                                            <p className="text-sm font-semibold text-t1">{user.name?.split(" ")[0]}</p>
                                            <p className="text-xs text-t3">{user.totalPoints} pts</p>
                                        </div>
                                        <div className={cn("w-20 rounded-t-lg", heights[podiumIdx])} style={{ backgroundColor: `${RANK_COLORS[rank - 1]}30`, border: `2px solid ${RANK_COLORS[rank - 1]}` }} />
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Full list */}
                    <div className="flex flex-col gap-2">
                        {ranking.map((user: { id: string; name: string; avatar?: string; role: string; totalPoints: number; dealsWon: number; revenue: number; activitiesCompleted: number; rank: number }) => (
                            <Card key={user.id} className={cn("transition-all", user.rank <= 3 && "border-violet/20")}>
                                <CardContent className="flex items-center gap-4 p-4">
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                                        style={{ backgroundColor: `${RANK_COLORS[Math.min(user.rank - 1, 4)]}20`, color: RANK_COLORS[Math.min(user.rank - 1, 4)] }}>
                                        {user.rank}
                                    </div>
                                    <Avatar className="h-10 w-10">
                                        <AvatarImage src={user.avatar} />
                                        <AvatarFallback>{user.name?.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0 flex-1">
                                        <p className="font-semibold text-t1">{user.name}</p>
                                        <p className="text-xs text-t3">{user.role}</p>
                                    </div>
                                    <div className="flex gap-4 text-center text-xs">
                                        <div><p className="font-bold text-violet">{user.totalPoints}</p><p className="text-t3">Pontos</p></div>
                                        <div><p className="font-bold text-t1">{user.dealsWon}</p><p className="text-t3">Deals</p></div>
                                        <div><p className="font-bold text-t1">{user.activitiesCompleted}</p><p className="text-t3">Atividades</p></div>
                                        <div><p className="font-bold text-green-500">R$ {user.revenue.toLocaleString("pt-BR")}</p><p className="text-t3">Receita</p></div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            )}

            {/* Achievements Tab */}
            {tab === "achievements" && achievements && (
                <div className="flex flex-col gap-6">
                    {/* Earned */}
                    <div>
                        <h2 className="mb-3 text-sm font-semibold text-t2">Conquistadas ({achievements.earned?.length ?? 0})</h2>
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                            {(achievements.earned ?? []).map((a: { id: string; key: string; icon: string; title: string; description: string; points: number; earnedAt: string }) => (
                                <Card key={a.id} className="border-violet/20">
                                    <CardContent className="flex flex-col items-center gap-2 p-4 text-center">
                                        <div className="text-3xl">{a.icon}</div>
                                        <div>
                                            <p className="font-semibold text-t1 text-sm">{a.title}</p>
                                            <p className="text-xs text-t3">{a.description}</p>
                                        </div>
                                        <Badge className="bg-violet/10 text-violet border-0 text-xs">+{a.points} pts</Badge>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </div>
                    {/* Available */}
                    <div>
                        <h2 className="mb-3 text-sm font-semibold text-t2">Disponíveis ({achievements.available?.length ?? 0})</h2>
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                            {(achievements.available ?? []).map((a: { key: string; icon: string; title: string; description: string; points: number }) => (
                                <Card key={a.key} className="opacity-50">
                                    <CardContent className="flex flex-col items-center gap-2 p-4 text-center">
                                        <div className="text-3xl grayscale">{a.icon}</div>
                                        <div>
                                            <p className="font-semibold text-t1 text-sm">{a.title}</p>
                                            <p className="text-xs text-t3">{a.description}</p>
                                        </div>
                                        <Badge variant="outline" className="text-xs">+{a.points} pts</Badge>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Goals Tab */}
            {tab === "goals" && (
                <div className="flex flex-col gap-4">
                    {goals.length === 0 ? (
                        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--rim)] py-16">
                            <Target className="h-10 w-10 text-t3" />
                            <p className="text-t3">Nenhuma meta cadastrada</p>
                        </div>
                    ) : goals.map((goal: { id: string; title: string; metric: string; current: number; target: number; status: string; dueAt: string }) => (
                        <Card key={goal.id}>
                            <CardContent className="p-5">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <p className="font-semibold text-t1">{goal.title}</p>
                                            <Badge variant={goal.status === "COMPLETED" ? "default" : "outline"} className="text-xs">
                                                {goal.status === "COMPLETED" ? "✓ Concluída" : goal.status === "ACTIVE" ? "Em andamento" : goal.status}
                                            </Badge>
                                        </div>
                                        <p className="text-xs text-t3 mt-0.5">Métrica: {goal.metric} · Vence em {new Date(goal.dueAt).toLocaleDateString("pt-BR")}</p>
                                        <div className="mt-3">
                                            <div className="flex justify-between text-xs mb-1.5">
                                                <span className="text-t3">{goal.current} / {goal.target}</span>
                                                <span className="font-medium text-t2">{Math.min(100, Math.round((goal.current / goal.target) * 100))}%</span>
                                            </div>
                                            <Progress value={Math.min(100, (goal.current / goal.target) * 100)} className="h-2" />
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
