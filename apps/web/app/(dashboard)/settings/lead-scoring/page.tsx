"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Slider } from "@/components/ui/slider";
import { Save, Thermometer, TrendingUp, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const TEMP_COLORS = {
    COLD: { label: "Frio", color: "bg-blue-500/10 text-blue-400", dot: "bg-blue-400" },
    WARM: { label: "Morno", color: "bg-yellow-500/10 text-yellow-400", dot: "bg-yellow-400" },
    HOT: { label: "Quente", color: "bg-red-500/10 text-red-400", dot: "bg-red-400" },
};

type ScoringConfig = {
    hasEmail: number; hasPhone: number; hasCompany: number;
    sourceBonus: number; dealCount: number; dealWon: number;
    openConversations: number; recentActivity: number; highValueDeal: number;
};

const WEIGHT_LABELS: Record<keyof ScoringConfig, string> = {
    hasEmail: "Tem email",
    hasPhone: "Tem telefone",
    hasCompany: "Tem empresa",
    sourceBonus: "Bônus por origem",
    dealCount: "Por deal aberto",
    dealWon: "Por deal ganho",
    openConversations: "Conversas abertas",
    recentActivity: "Atividade recente",
    highValueDeal: "Deal de alto valor",
};

export default function LeadScoringPage() {
    const qc = useQueryClient();

    const { data: config } = useQuery({
        queryKey: ["lead-scoring", "config"],
        queryFn: () => api.get("/contacts/lead-scoring/config").then(r => r.data),
    });

    const { data: leaderboard = [] } = useQuery({
        queryKey: ["lead-scoring", "leaderboard"],
        queryFn: () => api.get("/contacts/lead-scoring/leaderboard?limit=10").then(r => r.data),
    });

    const [weights, setWeights] = useState<ScoringConfig | null>(null);

    const currentWeights: ScoringConfig = weights ?? config?.weights ?? {
        hasEmail: 10, hasPhone: 8, hasCompany: 5, sourceBonus: 10,
        dealCount: 8, dealWon: 25, openConversations: 5, recentActivity: 10, highValueDeal: 15,
    };

    const saveMutation = useMutation({
        mutationFn: () => api.put("/contacts/lead-scoring/config", { weights: currentWeights }),
        onSuccess: () => { toast.success("Configuração salva!"); qc.invalidateQueries({ queryKey: ["lead-scoring"] }); },
        onError: () => toast.error("Erro ao salvar configuração."),
    });

    const scoreMutation = useMutation({
        mutationFn: () => api.post("/contacts/lead-scoring/score-all"),
        onSuccess: () => { toast.success("Pontuação recalculada!"); qc.invalidateQueries({ queryKey: ["lead-scoring"] }); },
        onError: () => toast.error("Erro ao recalcular pontuações."),
    });

    return (
        <div className="flex flex-col gap-6 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-t1">Lead Scoring</h1>
                    <p className="text-sm text-t3">Configure os pesos de pontuação dos leads</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" className="gap-2" onClick={() => scoreMutation.mutate()} disabled={scoreMutation.isPending}>
                        <TrendingUp className="h-4 w-4" /> Recalcular Todos
                    </Button>
                    <Button className="gap-2" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                        <Save className="h-4 w-4" /> Salvar Config
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-6">
                {/* Weights config */}
                <div className="col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">Pesos de Pontuação</CardTitle>
                            <CardDescription>Ajuste o peso de cada fator no cálculo do score (0-50)</CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-5">
                            {(Object.keys(currentWeights) as (keyof ScoringConfig)[]).map(key => (
                                <div key={key}>
                                    <div className="flex items-center justify-between mb-2">
                                        <Label className="text-sm text-t2">{WEIGHT_LABELS[key]}</Label>
                                        <span className="w-8 text-right text-sm font-bold text-violet">{currentWeights[key]}</span>
                                    </div>
                                    <Slider
                                        min={0} max={50} step={1}
                                        value={[currentWeights[key]]}
                                        onValueChange={(values: number[]) => setWeights(prev => ({ ...currentWeights, ...prev, [key]: values[0] ?? 0 }))}
                                        className="w-full"
                                    />
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    {/* Temperature thresholds info */}
                    <Card className="mt-4">
                        <CardHeader>
                            <CardTitle className="text-sm">Faixas de Temperatura</CardTitle>
                        </CardHeader>
                        <CardContent className="flex gap-4">
                            {(Object.entries(TEMP_COLORS) as [string, { label: string; color: string; dot: string }][]).map(([key, t]) => (
                                <div key={key} className={cn("flex-1 rounded-xl p-3 text-center", t.color.split(" ")[0])}>
                                    <div className={cn("mx-auto mb-1.5 h-3 w-3 rounded-full", t.dot)} />
                                    <p className={cn("font-semibold text-sm", t.color.split(" ")[1])}>{t.label}</p>
                                    <p className="text-xs opacity-70">
                                        {key === "COLD" ? "< 30 pts" : key === "WARM" ? "30–59 pts" : "≥ 60 pts"}
                                    </p>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>

                {/* Leaderboard preview */}
                <div>
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm flex items-center gap-2">
                                <Users className="h-4 w-4" /> Top Leads
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-2">
                            {leaderboard.slice(0, 10).map((contact: {
                                id: string; name: string; email?: string;
                                leadScore: number; leadTemperature: string; company?: string;
                            }, i: number) => {
                                const temp = TEMP_COLORS[contact.leadTemperature as keyof typeof TEMP_COLORS] ?? TEMP_COLORS.COLD;
                                return (
                                    <div key={contact.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface2 transition-colors">
                                        <span className="w-4 text-xs text-t3">{i + 1}</span>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium text-t1">{contact.name}</p>
                                            <p className="truncate text-xs text-t3">{contact.company ?? contact.email}</p>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <div className={cn("h-2 w-2 rounded-full", temp.dot)} />
                                            <span className="text-xs font-bold text-t1">{contact.leadScore}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
