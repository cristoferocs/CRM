"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Bot, Plus, Play, Pause, Eye, Brain, CheckCircle2,
    TrendingUp, Clock, Zap, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSocket } from "@/hooks/useSocket";
import { AgentCostPanel } from "@/components/modules/agents/agent-cost-panel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentMetrics {
    total: number;
    handedOff: number;
    selfResolved: number;
    goalsAchieved: number;
    avgTurns: number;
}

interface AIAgent {
    id: string;
    name: string;
    description?: string;
    avatar?: string;
    type: string;
    status: "DRAFT" | "LEARNING" | "REVIEW" | "READY" | "ACTIVE" | "PAUSED" | "RETIRED";
    phase: string;
    learnedFromCount: number;
    createdAt: string;
}

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const STATUS_CONFIG = {
    DRAFT: {
        label: "Configurando",
        color: "text-t3",
        bg: "bg-surface-2 border-[var(--rim)]",
        dot: "bg-t3",
        pulse: false,
    },
    LEARNING: {
        label: "Aprendendo...",
        color: "text-amber-400",
        bg: "bg-[var(--amber-dim)] border-amber-500/20",
        dot: "bg-amber-400",
        pulse: true,
    },
    REVIEW: {
        label: "Aguarda revisão",
        color: "text-cyan-400",
        bg: "bg-[var(--cyan-dim)] border-cyan-500/20",
        dot: "bg-cyan-400",
        pulse: false,
    },
    READY: {
        label: "Pronto para ativar",
        color: "text-jade",
        bg: "bg-[var(--jade-dim)] border-jade/20",
        dot: "bg-jade",
        pulse: false,
    },
    ACTIVE: {
        label: "Ativo",
        color: "text-jade",
        bg: "bg-[var(--jade-dim)] border-jade/20",
        dot: "bg-jade",
        pulse: true,
    },
    PAUSED: {
        label: "Pausado",
        color: "text-amber-400",
        bg: "bg-[var(--amber-dim)] border-amber-500/20",
        dot: "bg-amber-400",
        pulse: false,
    },
    RETIRED: {
        label: "Aposentado",
        color: "text-t3",
        bg: "bg-surface-2 border-[var(--rim)]",
        dot: "bg-t3",
        pulse: false,
    },
} as const;

const TYPE_LABEL: Record<string, string> = {
    SALES: "Vendas",
    SUPPORT: "Suporte",
    SCHEDULER: "Agendamento",
    QUALIFICATION: "Qualificação",
    COLLECTIONS: "Cobrança",
    ONBOARDING: "Onboarding",
    CUSTOM: "Personalizado",
};

// ---------------------------------------------------------------------------
// AgentCard
// ---------------------------------------------------------------------------

function AgentCard({
    agent,
    metrics,
    onAction,
    actionLoading,
}: {
    agent: AIAgent;
    metrics?: AgentMetrics;
    onAction: (id: string, action: string) => void;
    actionLoading: string | null;
}) {
    const cfg = STATUS_CONFIG[agent.status] ?? STATUS_CONFIG.DRAFT;

    return (
        <Card className="group relative overflow-hidden border-[var(--rim)] bg-[var(--ds-surface)] hover:border-[var(--rim2)] transition-all duration-200">
            {/* Subtle top border accent */}
            <div
                className={cn(
                    "absolute inset-x-0 top-0 h-px",
                    agent.status === "ACTIVE" && "bg-gradient-to-r from-transparent via-jade to-transparent",
                    agent.status === "LEARNING" && "bg-gradient-to-r from-transparent via-amber-400 to-transparent",
                    agent.status === "REVIEW" && "bg-gradient-to-r from-transparent via-cyan-400 to-transparent",
                    agent.status === "READY" && "bg-gradient-to-r from-transparent via-jade/60 to-transparent",
                )}
            />

            <CardHeader className="pb-3 pt-5 px-5">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                        {/* Avatar */}
                        <div className="w-10 h-10 rounded-xl bg-violet-dim border border-violet/20 flex items-center justify-center flex-shrink-0">
                            {agent.avatar
                                ? <img src={agent.avatar} alt={agent.name} className="w-full h-full rounded-xl object-cover" />
                                : <Bot className="w-5 h-5 text-violet" />}
                        </div>
                        <div className="min-w-0">
                            <p className="font-medium text-t1 truncate leading-tight">{agent.name}</p>
                            <p className="text-xs text-t3 mt-0.5">{TYPE_LABEL[agent.type] ?? agent.type}</p>
                        </div>
                    </div>

                    {/* Status badge */}
                    <div className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 border text-xs font-medium flex-shrink-0", cfg.bg, cfg.color)}>
                        <span className={cn("w-1.5 h-1.5 rounded-full", cfg.dot, cfg.pulse && "animate-pulse")} />
                        {cfg.label}
                    </div>
                </div>
            </CardHeader>

            <CardContent className="px-5 pb-5 space-y-4">
                {agent.description && (
                    <p className="text-xs text-t3 leading-relaxed line-clamp-2">{agent.description}</p>
                )}

                {/* Active metrics */}
                {agent.status === "ACTIVE" && metrics && (
                    <div className="grid grid-cols-3 gap-2">
                        <MetricPill
                            icon={<Zap className="w-3 h-3" />}
                            label="Autonomia"
                            value={
                                metrics.total > 0
                                    ? `${Math.round((metrics.selfResolved / metrics.total) * 100)}%`
                                    : "—"
                            }
                            accent="jade"
                        />
                        <MetricPill
                            icon={<TrendingUp className="w-3 h-3" />}
                            label="Sessões"
                            value={String(metrics.total)}
                            accent="violet"
                        />
                        <MetricPill
                            icon={<Clock className="w-3 h-3" />}
                            label="Méd. turns"
                            value={metrics.avgTurns.toFixed(1)}
                            accent="cyan"
                        />
                    </div>
                )}

                {/* Learning info */}
                {(agent.status === "LEARNING" || agent.status === "REVIEW") && (
                    <div className="flex items-center gap-2 text-xs text-t3">
                        <Brain className="w-3.5 h-3.5 text-amber-400" />
                        {agent.status === "REVIEW"
                            ? "Padrões aprendidos aguardam sua revisão"
                            : "Analisando conversas em segundo plano..."}
                    </div>
                )}

                {/* Learned from */}
                {agent.learnedFromCount > 0 && (
                    <p className="text-[11px] text-t3">
                        Aprendeu com <span className="text-t2">{agent.learnedFromCount}</span> conversas
                    </p>
                )}

                {/* Action buttons */}
                <div className="flex gap-2 pt-1">
                    {agent.status === "DRAFT" && (
                        <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 text-xs border-amber-500/30 text-amber-400 hover:bg-amber-dim"
                            onClick={() => onAction(agent.id, "start-learning")}
                            disabled={actionLoading === agent.id}
                        >
                            <Brain className="w-3 h-3 mr-1" />
                            Iniciar Aprendizado
                        </Button>
                    )}
                    {agent.status === "LEARNING" && (
                        <Button size="sm" variant="outline" className="flex-1 text-xs" asChild>
                            <Link href={`/agents/${agent.id}?tab=learning`}>
                                <Eye className="w-3 h-3 mr-1" />
                                Ver Progresso
                            </Link>
                        </Button>
                    )}
                    {agent.status === "REVIEW" && (
                        <Button
                            size="sm"
                            className="flex-1 text-xs bg-cyan/10 border border-cyan/30 text-cyan-400 hover:bg-cyan/20"
                            asChild
                        >
                            <Link href={`/agents/${agent.id}?tab=flow`}>
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                Revisar Fluxo
                            </Link>
                        </Button>
                    )}
                    {agent.status === "READY" && (
                        <Button
                            size="sm"
                            className="flex-1 text-xs bg-jade/10 border border-jade/30 text-jade hover:bg-jade/20"
                            onClick={() => onAction(agent.id, "activate")}
                            disabled={actionLoading === agent.id}
                        >
                            <Play className="w-3 h-3 mr-1" />
                            Ativar Agente
                        </Button>
                    )}
                    {agent.status === "ACTIVE" && (
                        <>
                            <Button size="sm" variant="outline" className="flex-1 text-xs" asChild>
                                <Link href={`/agents/${agent.id}?tab=performance`}>
                                    <TrendingUp className="w-3 h-3 mr-1" />
                                    Performance
                                </Link>
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                className="text-xs text-amber-400 border-amber-500/30 hover:bg-amber-dim"
                                onClick={() => onAction(agent.id, "pause")}
                                disabled={actionLoading === agent.id}
                            >
                                <Pause className="w-3 h-3" />
                            </Button>
                        </>
                    )}
                    {agent.status === "PAUSED" && (
                        <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 text-xs text-jade border-jade/30 hover:bg-jade/10"
                            onClick={() => onAction(agent.id, "activate")}
                            disabled={actionLoading === agent.id}
                        >
                            <Play className="w-3 h-3 mr-1" />
                            Retomar
                        </Button>
                    )}
                    {/* Always: link to config */}
                    <Button size="sm" variant="ghost" className="text-xs text-t3" asChild>
                        <Link href={`/agents/${agent.id}`}>
                            Config
                        </Link>
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

function MetricPill({
    icon,
    label,
    value,
    accent,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    accent: "jade" | "violet" | "cyan";
}) {
    const colors = {
        jade: "text-jade",
        violet: "text-violet",
        cyan: "text-cyan-400",
    };
    return (
        <div className="rounded-lg bg-[var(--ds-surface2)] border border-[var(--rim)] p-2 text-center">
            <div className={cn("flex items-center justify-center gap-1 mb-0.5", colors[accent])}>
                {icon}
                <span className="font-mono text-sm font-medium">{value}</span>
            </div>
            <p className="text-[10px] text-t3">{label}</p>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AgentsPage() {
    const [agents, setAgents] = useState<AIAgent[]>([]);
    const [metrics, setMetrics] = useState<Record<string, AgentMetrics>>({});
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const { socket } = useSocket();

    const fetchAgents = useCallback(async () => {
        try {
            const res = await api.get<AIAgent[]>("/agents");
            setAgents(res.data);
            // Fetch metrics for active agents
            for (const a of res.data) {
                if (a.status === "ACTIVE") {
                    api.get<AgentMetrics>(`/agents/${a.id}/performance`)
                        .then((r) => setMetrics((prev) => ({ ...prev, [a.id]: r.data })))
                        .catch(() => { });
                }
            }
        } catch {
            // ignore
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void fetchAgents(); }, [fetchAgents]);

    // Live updates from socket
    useEffect(() => {
        if (!socket) return;
        const refresh = () => void fetchAgents();
        socket.on("agent:learning_complete", refresh);
        socket.on("agent:flow_approved", refresh);
        return () => {
            socket.off("agent:learning_complete", refresh);
            socket.off("agent:flow_approved", refresh);
        };
    }, [socket, fetchAgents]);

    const handleAction = async (id: string, action: string) => {
        setActionLoading(id);
        try {
            if (action === "activate") await api.post(`/agents/${id}/activate`);
            else if (action === "pause") await api.post(`/agents/${id}/pause`);
            else if (action === "start-learning") {
                await api.post(`/agents/${id}/learning/start`, {});
            }
            await fetchAgents();
        } catch (err) {
            console.error(err);
        } finally {
            setActionLoading(null);
        }
    };

    const activeCount = agents.filter((a) => a.status === "ACTIVE").length;
    const learningCount = agents.filter((a) => a.status === "LEARNING" || a.status === "REVIEW").length;

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-semibold text-t1">Super Agentes</h1>
                    <p className="text-sm text-t3 mt-0.5">
                        {activeCount > 0 && (
                            <span className="text-jade">{activeCount} ativo{activeCount > 1 ? "s" : ""} · </span>
                        )}
                        {learningCount > 0 && (
                            <span className="text-amber-400">{learningCount} em aprendizado · </span>
                        )}
                        Assistentes autônomos com aprendizado contínuo
                    </p>
                </div>
                <Link href="/agents/new">
                    <Button size="sm" className="gap-1.5">
                        <Plus className="w-3.5 h-3.5" />
                        Novo Agente
                    </Button>
                </Link>
            </div>

            {/* Cost & budget overview */}
            <AgentCostPanel />

            {/* Grid */}
            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-52 rounded-xl bg-[var(--ds-surface)] border border-[var(--rim)] animate-pulse" />
                    ))}
                </div>
            ) : agents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-violet-dim border border-violet/20 flex items-center justify-center mb-4">
                        <Bot className="w-8 h-8 text-violet opacity-60" />
                    </div>
                    <p className="font-medium text-t2">Nenhum agente criado</p>
                    <p className="text-sm text-t3 mt-1 mb-4">
                        Crie seu primeiro super agente e deixe-o aprender com suas conversas.
                    </p>
                    <Link href="/agents/new">
                        <Button size="sm" variant="outline">
                            <Plus className="w-3.5 h-3.5 mr-1.5" />
                            Criar Agente
                        </Button>
                    </Link>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {agents.map((agent) => (
                        <AgentCard
                            key={agent.id}
                            agent={agent}
                            metrics={metrics[agent.id]}
                            onAction={handleAction}
                            actionLoading={actionLoading}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
