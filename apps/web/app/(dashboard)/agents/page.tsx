"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot, Plus, Power, PowerOff, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface AIAgent {
    id: string;
    name: string;
    description?: string;
    type: string;
    provider: string;
    status: string;
    createdAt: string;
}

export default function AgentsPage() {
    const [agents, setAgents] = useState<AIAgent[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchAgents = async () => {
        try {
            const res = await api.get<AIAgent[]>("/agents");
            setAgents(res.data);
        } catch {
            // ignore
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void fetchAgents(); }, []);

    const toggle = async (id: string) => {
        await api.patch(`/agents/${id}/toggle`);
        void fetchAgents();
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Agentes de IA</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Configure assistentes automáticos para atendimento, vendas e agendamentos.
                    </p>
                </div>
                <Link href="/agents/new">
                    <Button>
                        <Plus className="w-4 h-4 mr-2" />
                        Novo Agente
                    </Button>
                </Link>
            </div>

            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="h-48 bg-muted animate-pulse rounded-xl" />
                    ))}
                </div>
            ) : agents.length === 0 ? (
                <div className="text-center py-20 text-muted-foreground">
                    <Bot className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">Nenhum agente criado</p>
                    <p className="text-sm">Crie seu primeiro agente para começar.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {agents.map((agent) => (
                        <Card key={agent.id} className="relative group hover:shadow-md transition-shadow">
                            <CardHeader className="pb-3">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                                            <Bot className="w-5 h-5 text-primary" />
                                        </div>
                                        <div>
                                            <CardTitle className="text-base">{agent.name}</CardTitle>
                                            <CardDescription className="text-xs capitalize">{agent.type.toLowerCase()}</CardDescription>
                                        </div>
                                    </div>
                                    <Badge
                                        variant="outline"
                                        className={cn(
                                            "text-xs",
                                            agent.status === "ACTIVE"
                                                ? "border-green-500 text-green-600"
                                                : "border-muted-foreground/30 text-muted-foreground",
                                        )}
                                    >
                                        {agent.status === "ACTIVE" ? "Ativo" : "Inativo"}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {agent.description && (
                                    <p className="text-sm text-muted-foreground line-clamp-2">{agent.description}</p>
                                )}
                                <div className="text-xs text-muted-foreground">
                                    Provedor: <span className="font-medium">{agent.provider}</span>
                                </div>
                                <div className="flex gap-2">
                                    <Link href={`/agents/${agent.id}`} className="flex-1">
                                        <Button variant="outline" size="sm" className="w-full">
                                            <MessageSquare className="w-3 h-3 mr-1" />
                                            Configurar
                                        </Button>
                                    </Link>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => toggle(agent.id)}
                                        title={agent.status === "ACTIVE" ? "Desativar" : "Ativar"}
                                    >
                                        {agent.status === "ACTIVE" ? (
                                            <PowerOff className="w-3 h-3" />
                                        ) : (
                                            <Power className="w-3 h-3" />
                                        )}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
