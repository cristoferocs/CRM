"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    MessageSquare,
    TrendingUp,
    TrendingDown,
    Lightbulb,
    Target,
    AlertCircle,
    Loader2,
} from "lucide-react";

interface Objection {
    id: string;
    text: string;
    frequency: number;
    category?: string;
}

interface Approach {
    id: string;
    description: string;
    successRate: number;
    context?: string;
}

interface InsightsData {
    objections: Objection[];
    approaches: Approach[];
    summary?: string;
}

export default function InsightsPage() {
    const [data, setData] = useState<InsightsData>({ objections: [], approaches: [] });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.allSettled([
            api.get<Objection[]>("/insights/objections"),
            api.get<Approach[]>("/insights/approaches"),
        ]).then(([objRes, appRes]) => {
            setData({
                objections: objRes.status === "fulfilled" ? objRes.value.data : [],
                approaches: appRes.status === "fulfilled" ? appRes.value.data : [],
            });
        }).finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="p-6 flex items-center justify-center py-32">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Insights de IA</h1>
                <p className="text-muted-foreground text-sm mt-1">
                    Padrões e aprendizados gerados automaticamente das conversas.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Objections */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-destructive" />
                            Principais Objeções
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {data.objections.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-6">
                                Nenhuma objeção registrada ainda.
                            </p>
                        ) : (
                            <div className="space-y-3">
                                {data.objections.map((obj) => (
                                    <div key={obj.id} className="flex items-start justify-between gap-3">
                                        <div className="flex-1">
                                            <p className="text-sm">{obj.text}</p>
                                            {obj.category && (
                                                <Badge variant="outline" className="text-xs mt-1">
                                                    {obj.category}
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                                            <TrendingDown className="w-3 h-3 text-destructive" />
                                            <span>{obj.frequency}x</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Best approaches */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <Target className="w-4 h-4 text-green-500" />
                            Melhores Abordagens
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {data.approaches.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-6">
                                Nenhuma abordagem registrada ainda.
                            </p>
                        ) : (
                            <div className="space-y-3">
                                {data.approaches.map((app) => (
                                    <div key={app.id} className="flex items-start justify-between gap-3">
                                        <div className="flex-1">
                                            <p className="text-sm">{app.description}</p>
                                            {app.context && (
                                                <p className="text-xs text-muted-foreground mt-0.5">{app.context}</p>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1 text-xs text-green-600 shrink-0">
                                            <TrendingUp className="w-3 h-3" />
                                            <span>{Math.round(app.successRate * 100)}%</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Coaching tips */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <Lightbulb className="w-4 h-4 text-yellow-500" />
                        Dicas de Coaching
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">
                        Os insights de coaching são gerados automaticamente conforme os agentes de IA
                        processam mais conversas. Volte aqui após algumas interações.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
