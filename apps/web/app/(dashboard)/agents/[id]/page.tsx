"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    ArrowLeft, Bot, Save, Loader2, Brain, Play, Pause, CheckCircle2,
    XCircle, TrendingUp, Clock, Zap, AlertTriangle, ChevronDown,
    ChevronUp, RefreshCw, Target, Users, Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentFlowDiagram, type FlowStage } from "@/components/modules/agents/AgentFlowDiagram";
import { AgentSessionPlayer, type AgentTurn } from "@/components/modules/agents/AgentSessionPlayer";
import { useSocket } from "@/hooks/useSocket";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Personality {
    fictitiousName?: string;
    tone?: string;
    style?: string;
}

interface FlowTemplate {
    version: string;
    agentType: string;
    stages: FlowStage[];
    objectionPlaybook?: { objection: string; response: string }[];
    buyingSignals?: string[];
    riskSignals?: string[];
}

interface FlowVersion {
    id: string;
    version: number;
    status: "PENDING" | "APPROVED" | "REJECTED";
    flowTemplate?: FlowTemplate;
    notes?: string;
    createdAt: string;
}

interface AIAgent {
    id: string;
    name: string;
    description?: string;
    type: string;
    provider: string;
    model?: string;
    status: "DRAFT" | "LEARNING" | "REVIEW" | "READY" | "ACTIVE" | "PAUSED" | "RETIRED";
    phase: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    knowledgeBaseIds?: string[];
    tools?: Record<string, { enabled: boolean; limit?: number }>;
    handoffRules?: Record<string, unknown>;
    confidenceThreshold?: number;
    maxTurnsBeforeHuman?: number;
    personality?: Personality;
    goal?: string;
    learnedFromCount?: number;
    flowTemplate?: FlowTemplate;
}

interface LearningStatus {
    status: "IDLE" | "RUNNING" | "COMPLETED" | "FAILED";
    analyzedCount?: number;
    total?: number;
    progress?: number;
    error?: string;
    startedAt?: string;
    completedAt?: string;
    preview?: { stages?: { name: string }[] };
}

interface Performance {
    total: number;
    handedOff: number;
    selfResolved: number;
    goalsAchieved: number;
    avgTurns: number;
    weeks?: { week: string; total: number; selfResolved: number; goalsAchieved: number }[];
}

interface AgentSession {
    id: string;
    status: string;
    goalAchieved: boolean;
    handedOff: boolean;
    turnCount: number;
    startedAt: string;
    endedAt?: string;
}

interface AgentSessionDetail extends AgentSession {
    turns: AgentTurn[];
}

interface KnowledgeBase {
    id: string;
    name: string;
}

const PROVIDERS = ["GOOGLE", "ANTHROPIC", "OPENAI", "OLLAMA"];
const TYPES = ["SALES", "SUPPORT", "SCHEDULER", "QUALIFICATION", "COLLECTIONS", "ONBOARDING", "CUSTOM"];
const TONE_OPTIONS = ["profissional", "amigável", "técnico", "empático", "direto", "consultivo"];
const STYLE_OPTIONS = ["formal", "informal", "conciso", "detalhado", "persuasivo"];

const TYPE_LABEL: Record<string, string> = {
    SALES: "Vendas",
    SUPPORT: "Suporte",
    SCHEDULER: "Agendamento",
    QUALIFICATION: "Qualificação",
    COLLECTIONS: "Cobrança",
    ONBOARDING: "Onboarding",
    CUSTOM: "Personalizado",
};

const AVAILABLE_TOOLS = [
    { key: "search_knowledge_base", label: "Base de conhecimento" },
    { key: "check_calendar", label: "Verificar calendário" },
    { key: "schedule_appointment", label: "Agendar consulta" },
    { key: "create_deal", label: "Criar negócio no pipeline" },
    { key: "send_email", label: "Enviar e-mail" },
    { key: "update_contact", label: "Atualizar contato" },
    { key: "create_task", label: "Criar tarefa" },
    { key: "lookup_payment", label: "Consultar pagamento" },
];

// ---------------------------------------------------------------------------
// Slider
// ---------------------------------------------------------------------------

function SimpleSlider({
    value,
    min,
    max,
    step = 1,
    onChange,
    formatValue,
}: {
    value: number;
    min: number;
    max: number;
    step?: number;
    onChange: (v: number) => void;
    formatValue?: (v: number) => string;
}) {
    return (
        <div className="flex items-center gap-3">
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className="flex-1 h-1.5 accent-violet cursor-pointer"
            />
            <span className="font-mono text-xs text-t2 w-10 text-right">
                {formatValue ? formatValue(value) : value}
            </span>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

function ProgressBar({ value, className }: { value: number; className?: string }) {
    return (
        <div className={cn("h-2 rounded-full bg-[var(--ds-surface3)]", className)}>
            <div
                className="h-full rounded-full bg-gradient-to-r from-violet to-cyan transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
            />
        </div>
    );
}

// ---------------------------------------------------------------------------
// TAB 1 — Configuração
// ---------------------------------------------------------------------------

function ConfigTab({
    agent,
    kbs,
    onSave,
    saving,
    isNew,
}: {
    agent: Partial<AIAgent>;
    kbs: KnowledgeBase[];
    onSave: (updated: Partial<AIAgent>) => void;
    saving: boolean;
    isNew: boolean;
}) {
    const [form, setForm] = useState<Partial<AIAgent>>(agent);

    useEffect(() => { setForm(agent); }, [agent]);

    const set = (key: keyof AIAgent, value: unknown) =>
        setForm((prev) => ({ ...prev, [key]: value }));

    const setPersonality = (key: keyof Personality, value: string) =>
        setForm((prev) => ({ ...prev, personality: { ...prev.personality, [key]: value } }));

    const toggleTool = (toolKey: string) => {
        const current = form.tools ?? {};
        const exists = current[toolKey]?.enabled;
        set("tools", {
            ...current,
            [toolKey]: { ...(current[toolKey] ?? {}), enabled: !exists },
        });
    };

    const toggleKb = (kbId: string) => {
        const current = form.knowledgeBaseIds ?? [];
        if (current.includes(kbId)) {
            set("knowledgeBaseIds", current.filter((id) => id !== kbId));
        } else {
            set("knowledgeBaseIds", [...current, kbId]);
        }
    };

    return (
        <div className="p-6 space-y-8 max-w-2xl">
            <section className="space-y-4">
                <h3 className="text-sm font-semibold text-t1">Identidade</h3>
                <div className="grid gap-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Nome interno</Label>
                            <Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="Ex: Agente de Vendas" />
                        </div>
                        <div className="space-y-2">
                            <Label>Nome fictício do agente</Label>
                            <Input value={form.personality?.fictitiousName ?? ""} onChange={(e) => setPersonality("fictitiousName", e.target.value)} placeholder="Ex: Sofia" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Descrição</Label>
                        <Textarea value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} placeholder="Descreva brevemente o propósito deste agente" className="resize-none h-20" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Tom</Label>
                            <Select value={form.personality?.tone ?? ""} onValueChange={(v) => setPersonality("tone", v)}>
                                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                                <SelectContent>{TONE_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Estilo</Label>
                            <Select value={form.personality?.style ?? ""} onValueChange={(v) => setPersonality("style", v)}>
                                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                                <SelectContent>{STYLE_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>
            </section>

            <section className="space-y-4">
                <h3 className="text-sm font-semibold text-t1">Configuração técnica</h3>
                <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                        <Label>Tipo</Label>
                        <Select value={form.type ?? "SUPPORT"} onValueChange={(v) => set("type", v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{TYPE_LABEL[t] ?? t}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Provedor</Label>
                        <Select value={form.provider ?? "OPENAI"} onValueChange={(v) => set("provider", v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{PROVIDERS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Modelo</Label>
                        <Input value={form.model ?? ""} onChange={(e) => set("model", e.target.value)} placeholder="gpt-4o" />
                    </div>
                </div>
            </section>

            <section className="space-y-4">
                <h3 className="text-sm font-semibold text-t1">Objetivo</h3>
                <Textarea value={form.goal ?? ""} onChange={(e) => set("goal", e.target.value)} placeholder="Descreva o objetivo principal deste agente em uma ou duas frases..." className="resize-none h-24" />
            </section>

            <section className="space-y-4">
                <h3 className="text-sm font-semibold text-t1">Bases de conhecimento</h3>
                {kbs.length === 0 ? (
                    <p className="text-xs text-t3">Nenhuma base de conhecimento cadastrada.</p>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {kbs.map((kb) => {
                            const selected = (form.knowledgeBaseIds ?? []).includes(kb.id);
                            return (
                                <button key={kb.id} type="button" onClick={() => toggleKb(kb.id)}
                                    className={cn("rounded-full px-3 py-1 text-xs border transition-colors",
                                        selected ? "bg-violet-dim border-violet/40 text-violet" : "border-[var(--rim)] text-t3 hover:text-t2")}>
                                    {kb.name}
                                </button>
                            );
                        })}
                    </div>
                )}
            </section>

            <section className="space-y-4">
                <h3 className="text-sm font-semibold text-t1">Ferramentas habilitadas</h3>
                <div className="space-y-2">
                    {AVAILABLE_TOOLS.map(({ key, label }) => {
                        const enabled = form.tools?.[key]?.enabled ?? false;
                        return (
                            <div key={key} className="flex items-center justify-between rounded-lg border border-[var(--rim)] bg-[var(--ds-surface2)] px-3.5 py-3">
                                <span className="text-sm text-t2">{label}</span>
                                <Switch
                                    checked={enabled}
                                    onCheckedChange={() => toggleTool(key)}
                                />
                            </div>
                        );
                    })}
                </div>
            </section>

            <section className="space-y-4">
                <h3 className="text-sm font-semibold text-t1">Limites de autonomia</h3>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>Confiança mínima para responder</Label>
                        <SimpleSlider value={form.confidenceThreshold ?? 0.7} min={0.1} max={1} step={0.05}
                            onChange={(v) => set("confidenceThreshold", v)} formatValue={(v) => `${Math.round(v * 100)}%`} />
                    </div>
                    <div className="space-y-2">
                        <Label>Turnos máximos antes de transferir</Label>
                        <SimpleSlider value={form.maxTurnsBeforeHuman ?? 10} min={1} max={50} onChange={(v) => set("maxTurnsBeforeHuman", v)} />
                    </div>
                </div>
            </section>

            <section className="space-y-4">
                <h3 className="text-sm font-semibold text-t1">Prompt de sistema (opcional)</h3>
                <Textarea value={form.systemPrompt ?? ""} onChange={(e) => set("systemPrompt", e.target.value)}
                    placeholder="Instruções adicionais para o agente..." className="resize-none h-32 font-mono text-xs" />
            </section>

            <Button onClick={() => onSave(form)} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {isNew ? "Criar Agente" : "Salvar alterações"}
            </Button>
        </div>
    );
}

// ---------------------------------------------------------------------------
// TAB 2 — Aprendizado
// ---------------------------------------------------------------------------

function LearningTab({ agentId, agent }: { agentId: string; agent: Partial<AIAgent> }) {
    const [status, setStatus] = useState<LearningStatus | null>(null);
    const [starting, setStarting] = useState(false);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const { socket } = useSocket();

    const fetchStatus = useCallback(async () => {
        try {
            const res = await api.get<LearningStatus>(`/agents/${agentId}/learning/status`);
            setStatus(res.data);
            if (res.data.status === "COMPLETED" || res.data.status === "FAILED") {
                if (pollRef.current) clearInterval(pollRef.current);
            }
        } catch { /* ignore */ }
    }, [agentId]);

    useEffect(() => { void fetchStatus(); }, [fetchStatus]);

    useEffect(() => {
        if (status?.status === "RUNNING") {
            pollRef.current = setInterval(() => void fetchStatus(), 3000);
        }
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [status?.status, fetchStatus]);

    useEffect(() => {
        if (!socket) return;
        socket.on("agent:learning_complete", fetchStatus);
        return () => { socket.off("agent:learning_complete", fetchStatus); };
    }, [socket, fetchStatus]);

    const startLearning = async () => {
        setStarting(true);
        try {
            await api.post(`/agents/${agentId}/learning/start`, {});
            await fetchStatus();
        } finally { setStarting(false); }
    };

    const isRunning = status?.status === "RUNNING";
    const isCompleted = status?.status === "COMPLETED";
    const isFailed = status?.status === "FAILED";

    return (
        <div className="p-6 space-y-6 max-w-xl">
            <Card className="border-[var(--rim)] bg-[var(--ds-surface2)]">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium">Status do Aprendizado</CardTitle>
                        <button onClick={() => void fetchStatus()} className="text-t3 hover:text-t1">
                            <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {!status || status.status === "IDLE" ? (
                        <div className="flex items-center gap-2 text-sm text-t3">
                            <Brain className="w-4 h-4" />
                            Aguardando início do aprendizado
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center gap-2">
                                {isRunning && <span className="flex items-center gap-2 text-amber-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" />Analisando conversas...</span>}
                                {isCompleted && <span className="flex items-center gap-2 text-jade text-sm"><CheckCircle2 className="w-4 h-4" />Análise concluída</span>}
                                {isFailed && <span className="flex items-center gap-2 text-rose-400 text-sm"><XCircle className="w-4 h-4" />Falha no aprendizado</span>}
                            </div>
                            {status.total != null && status.total > 0 && (
                                <div className="space-y-1.5">
                                    <div className="flex justify-between text-xs text-t3">
                                        <span>Conversas analisadas</span>
                                        <span className="text-t2">{status.analyzedCount ?? 0} / {status.total}</span>
                                    </div>
                                    <ProgressBar value={(status.progress ?? 0) * 100} />
                                </div>
                            )}
                            {isFailed && status.error && <p className="text-xs text-rose-400 bg-rose-dim rounded-lg p-2.5">{status.error}</p>}
                            {isCompleted && status.preview?.stages && status.preview.stages.length > 0 && (
                                <div className="space-y-2">
                                    <p className="text-xs text-t3 font-medium">Etapas identificadas:</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {status.preview.stages.map((s, i) => (
                                            <Badge key={i} variant="outline" className="text-xs border-violet/30 text-violet">{s.name}</Badge>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            {(agent.learnedFromCount ?? 0) > 0 && (
                <div className="flex items-center gap-2 text-sm text-t2">
                    <Brain className="w-4 h-4 text-violet" />
                    Este agente aprendeu com <span className="text-violet font-medium">{agent.learnedFromCount}</span> conversas
                </div>
            )}

            {!isRunning && agent.status !== "REVIEW" && (
                <Button onClick={startLearning} disabled={starting} variant="outline" className="gap-2 border-amber-500/30 text-amber-400 hover:bg-amber-dim">
                    {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                    {isCompleted ? "Iniciar novo aprendizado" : "Iniciar Aprendizado"}
                </Button>
            )}

            {agent.status === "DRAFT" && (agent.learnedFromCount ?? 0) === 0 && (
                <div className="flex items-start gap-2 text-xs text-t3 bg-amber-dim border border-amber-500/20 rounded-lg p-3.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                    <span>
                        Para melhores resultados, certifique-se de ter conversas na{" "}
                        <Link href="/inbox" className="text-cyan-400 underline underline-offset-2">caixa de entrada</Link>
                        {" "}antes de iniciar o aprendizado.
                    </span>
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// TAB 3 — Fluxo Aprendido
// ---------------------------------------------------------------------------

function FlowTab({ agentId, agent, onRefresh }: { agentId: string; agent: Partial<AIAgent>; onRefresh: () => void }) {
    const [versions, setVersions] = useState<FlowVersion[]>([]);
    const [selected, setSelected] = useState<FlowVersion | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [objAccordion, setObjAccordion] = useState<number | null>(null);
    const [notes, setNotes] = useState("");

    useEffect(() => {
        api.get<FlowVersion[]>(`/agents/${agentId}/flow-versions`)
            .then((r) => { setVersions(r.data); if (r.data.length > 0) setSelected(r.data[0] ?? null); })
            .catch(() => { });
    }, [agentId]);

    const doAction = async (action: "approve" | "reject") => {
        if (!selected) return;
        setActionLoading(action);
        try {
            if (action === "approve") {
                await api.post(`/agents/${agentId}/flow-versions/${selected.id}/approve`, { notes });
            } else {
                await api.post(`/agents/${agentId}/flow-versions/${selected.id}/reject`, { reason: notes });
            }
            onRefresh();
        } finally { setActionLoading(null); }
    };

    if (!["REVIEW", "READY", "ACTIVE", "PAUSED"].includes(agent.status ?? "")) {
        return (
            <div className="p-6 flex flex-col items-center justify-center py-20 text-center">
                <Brain className="w-10 h-10 text-t4 mb-3" />
                <p className="text-sm text-t3">O fluxo estará disponível após o aprendizado ser concluído.</p>
            </div>
        );
    }

    const flow = selected?.flowTemplate ?? agent.flowTemplate;

    return (
        <div className="p-6 space-y-6">
            {versions.length > 1 && (
                <div className="flex items-center gap-2">
                    <span className="text-xs text-t3">Versão:</span>
                    <div className="flex gap-1">
                        {versions.map((v) => (
                            <button key={v.id} onClick={() => setSelected(v)}
                                className={cn("rounded-full px-3 py-1 text-xs border transition-colors",
                                    selected?.id === v.id ? "bg-violet-dim border-violet/40 text-violet" : "border-[var(--rim)] text-t3")}>
                                v{v.version}
                                {v.status === "APPROVED" && <CheckCircle2 className="inline w-3 h-3 ml-1 text-jade" />}
                                {v.status === "REJECTED" && <XCircle className="inline w-3 h-3 ml-1 text-rose-400" />}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {flow?.stages && flow.stages.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-t1">Fluxo de atendimento</h3>
                        <p className="text-xs text-t3">{flow.stages.length} etapas · clique para detalhes</p>
                    </div>
                    <AgentFlowDiagram stages={flow.stages} className="max-h-96" />
                </div>
            )}

            {flow?.objectionPlaybook && flow.objectionPlaybook.length > 0 && (
                <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-t1">Playbook de objeções</h3>
                    <div className="space-y-1.5">
                        {flow.objectionPlaybook.map((item, i) => (
                            <div key={i} className="rounded-lg border border-[var(--rim)] bg-[var(--ds-surface2)] overflow-hidden">
                                <button className="w-full flex items-center justify-between px-4 py-3 text-sm text-t2 hover:text-t1"
                                    onClick={() => setObjAccordion(objAccordion === i ? null : i)}>
                                    <span>{item.objection}</span>
                                    {objAccordion === i ? <ChevronUp className="w-3.5 h-3.5 text-t3" /> : <ChevronDown className="w-3.5 h-3.5 text-t3" />}
                                </button>
                                {objAccordion === i && (
                                    <div className="px-4 pb-3 text-xs text-t3 leading-relaxed border-t border-[var(--rim)] pt-3">{item.response}</div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {((flow?.buyingSignals?.length ?? 0) > 0 || (flow?.riskSignals?.length ?? 0) > 0) && (
                <div className="grid grid-cols-2 gap-4">
                    {flow?.buyingSignals && flow.buyingSignals.length > 0 && (
                        <div className="space-y-2">
                            <h4 className="text-xs font-medium text-jade">Sinais de compra</h4>
                            <ul className="space-y-1">
                                {flow.buyingSignals.map((s, i) => (
                                    <li key={i} className="text-xs text-t3 flex items-center gap-1.5">
                                        <span className="w-1 h-1 rounded-full bg-jade flex-shrink-0" />{s}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {flow?.riskSignals && flow.riskSignals.length > 0 && (
                        <div className="space-y-2">
                            <h4 className="text-xs font-medium text-rose-400">Sinais de risco</h4>
                            <ul className="space-y-1">
                                {flow.riskSignals.map((s, i) => (
                                    <li key={i} className="text-xs text-t3 flex items-center gap-1.5">
                                        <span className="w-1 h-1 rounded-full bg-rose-400 flex-shrink-0" />{s}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            {selected?.status === "PENDING" && (
                <div className="space-y-3 border-t border-[var(--rim)] pt-5">
                    <h3 className="text-sm font-semibold text-t1">Revisar fluxo</h3>
                    <Textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                        placeholder="Notas opcionais sobre esta revisão..." className="resize-none h-20 text-xs" />
                    <div className="flex gap-2">
                        <Button size="sm" className="gap-1.5 bg-jade/10 border border-jade/30 text-jade hover:bg-jade/20"
                            onClick={() => doAction("approve")} disabled={!!actionLoading}>
                            {actionLoading === "approve" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                            Aprovar e Ativar
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1.5 border-rose/30 text-rose-400 hover:bg-rose-dim"
                            onClick={() => doAction("reject")} disabled={!!actionLoading}>
                            {actionLoading === "reject" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                            Rejeitar
                        </Button>
                    </div>
                </div>
            )}

            {selected?.status === "APPROVED" && (
                <div className="flex items-center gap-2 text-sm text-jade border border-jade/20 bg-jade/5 rounded-lg px-4 py-3">
                    <CheckCircle2 className="w-4 h-4" />
                    Fluxo aprovado e ativo
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// TAB 4 — Performance
// ---------------------------------------------------------------------------

function PerformanceTab({ agentId }: { agentId: string }) {
    const [perf, setPerf] = useState<Performance | null>(null);
    const [sessions, setSessions] = useState<AgentSession[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            api.get<Performance>(`/agents/${agentId}/performance`),
            api.get<AgentSession[]>(`/agents/${agentId}/sessions`, { params: { limit: 20 } }),
        ]).then(([p, s]) => { setPerf(p.data); setSessions(s.data); })
            .catch(() => { }).finally(() => setLoading(false));
    }, [agentId]);

    if (loading) return <div className="p-6"><div className="h-40 bg-[var(--ds-surface2)] animate-pulse rounded-xl" /></div>;
    if (!perf) return <div className="p-6 text-sm text-t3">Sem dados de performance ainda.</div>;

    const autonomyRate = perf.total > 0 ? Math.round((perf.selfResolved / perf.total) * 100) : 0;
    const goalRate = perf.total > 0 ? Math.round((perf.goalsAchieved / perf.total) * 100) : 0;

    return (
        <div className="p-6 space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard icon={<Zap className="w-4 h-4" />} label="Taxa de autonomia" value={`${autonomyRate}%`} accent="jade" />
                <KpiCard icon={<Target className="w-4 h-4" />} label="Metas atingidas" value={`${goalRate}%`} accent="violet" />
                <KpiCard icon={<Clock className="w-4 h-4" />} label="Méd. de turnos" value={perf.avgTurns.toFixed(1)} accent="cyan" />
                <KpiCard icon={<Users className="w-4 h-4" />} label="Total de sessões" value={String(perf.total)} accent="amber" />
            </div>

            {perf.weeks && perf.weeks.length > 0 && (
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-t1">Autonomia semanal</h3>
                    <div className="rounded-xl border border-[var(--rim)] bg-[var(--ds-surface2)] p-4">
                        <div className="flex items-end gap-2 h-28">
                            {perf.weeks.map((w, i) => {
                                const rate = w.total > 0 ? w.selfResolved / w.total : 0;
                                return (
                                    <div key={i} className="flex flex-col items-center flex-1 gap-1" title={`Semana ${w.week}: ${Math.round(rate * 100)}%`}>
                                        <div className="w-full rounded-t bg-gradient-to-t from-violet/40 to-violet transition-all duration-500"
                                            style={{ height: `${Math.max(4, rate * 100)}px` }} />
                                        <p className="text-[9px] text-t3 font-mono">{w.week.slice(-5)}</p>
                                    </div>
                                );
                            })}
                        </div>
                        <p className="text-[10px] text-t3 mt-2">Proporção de sessões resolvidas sem transferência</p>
                    </div>
                </div>
            )}

            {sessions.length > 0 && (
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-t1">Sessões recentes</h3>
                    <div className="rounded-xl border border-[var(--rim)] overflow-hidden">
                        <table className="w-full text-xs">
                            <thead className="bg-[var(--ds-surface2)] border-b border-[var(--rim)]">
                                <tr>
                                    <th className="text-left px-4 py-2.5 text-t3 font-medium">Status</th>
                                    <th className="text-left px-4 py-2.5 text-t3 font-medium">Turnos</th>
                                    <th className="text-left px-4 py-2.5 text-t3 font-medium">Meta</th>
                                    <th className="text-left px-4 py-2.5 text-t3 font-medium">Handoff</th>
                                    <th className="text-left px-4 py-2.5 text-t3 font-medium">Início</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--rim)]">
                                {sessions.map((s) => (
                                    <tr key={s.id} className="bg-[var(--ds-surface)] hover:bg-[var(--ds-surface2)] transition-colors">
                                        <td className="px-4 py-2.5">
                                            <Badge variant="outline" className={cn("text-[10px]",
                                                s.status === "COMPLETED" && "border-jade/30 text-jade",
                                                s.status === "ACTIVE" && "border-cyan/30 text-cyan-400",
                                                s.status === "HANDOFF" && "border-amber-500/30 text-amber-400")}>
                                                {s.status}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-2.5 font-mono text-t2">{s.turnCount}</td>
                                        <td className="px-4 py-2.5">
                                            {s.goalAchieved ? <CheckCircle2 className="w-3.5 h-3.5 text-jade" /> : <XCircle className="w-3.5 h-3.5 text-t4" />}
                                        </td>
                                        <td className="px-4 py-2.5">
                                            {s.handedOff ? <span className="text-amber-400">Sim</span> : <span className="text-t3">Não</span>}
                                        </td>
                                        <td className="px-4 py-2.5 text-t3 font-mono">{new Date(s.startedAt).toLocaleDateString("pt-BR")}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

function KpiCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: "jade" | "violet" | "cyan" | "amber" }) {
    const colors = { jade: "text-jade", violet: "text-violet", cyan: "text-cyan-400", amber: "text-amber-400" };
    return (
        <div className="rounded-xl border border-[var(--rim)] bg-[var(--ds-surface2)] p-4 space-y-1">
            <div className={cn("flex items-center gap-1.5", colors[accent])}>
                {icon}
                <span className="font-mono text-xl font-semibold">{value}</span>
            </div>
            <p className="text-[11px] text-t3">{label}</p>
        </div>
    );
}

// ---------------------------------------------------------------------------
// TAB 5 — Raciocínio
// ---------------------------------------------------------------------------

function ReasoningTab({ agentId }: { agentId: string }) {
    const [sessions, setSessions] = useState<AgentSession[]>([]);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [detail, setDetail] = useState<AgentSessionDetail | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);

    useEffect(() => {
        api.get<AgentSession[]>(`/agents/${agentId}/sessions`, { params: { limit: 20 } })
            .then((r) => setSessions(r.data)).catch(() => { });
    }, [agentId]);

    const toggleSession = async (sessionId: string) => {
        if (expanded === sessionId) { setExpanded(null); setDetail(null); return; }
        setExpanded(sessionId);
        setLoadingDetail(true);
        try {
            const res = await api.get<AgentSessionDetail>(`/agents/${agentId}/sessions/${sessionId}`);
            setDetail(res.data);
        } finally { setLoadingDetail(false); }
    };

    return (
        <div className="p-6 space-y-3">
            <div className="flex items-center gap-2 mb-4">
                <Activity className="w-4 h-4 text-t3" />
                <h3 className="text-sm font-semibold text-t1">Últimas sessões (debug)</h3>
            </div>
            {sessions.length === 0 && <p className="text-sm text-t3">Nenhuma sessão registrada.</p>}
            {sessions.map((s) => (
                <div key={s.id} className="rounded-xl border border-[var(--rim)] bg-[var(--ds-surface2)] overflow-hidden">
                    <button className="w-full flex items-center justify-between px-4 py-3 text-xs text-t2 hover:bg-[var(--ds-surface3)] transition-colors"
                        onClick={() => toggleSession(s.id)}>
                        <div className="flex items-center gap-3">
                            <span className="font-mono text-t3">{s.id.slice(-8)}</span>
                            <Badge variant="outline" className={cn("text-[10px]",
                                s.status === "COMPLETED" && "border-jade/30 text-jade",
                                s.status === "ACTIVE" && "border-cyan/30 text-cyan-400",
                                s.status === "HANDOFF" && "border-amber-500/30 text-amber-400")}>
                                {s.status}
                            </Badge>
                            <span className="text-t3">{s.turnCount} turnos</span>
                            {s.goalAchieved && <CheckCircle2 className="w-3 h-3 text-jade" />}
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-t3">{new Date(s.startedAt).toLocaleDateString("pt-BR")}</span>
                            {expanded === s.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </div>
                    </button>
                    {expanded === s.id && (
                        <div className="border-t border-[var(--rim)] p-4">
                            {loadingDetail
                                ? <div className="h-32 bg-[var(--ds-surface3)] animate-pulse rounded-xl" />
                                : detail
                                    ? <AgentSessionPlayer turns={detail.turns} className="max-h-[480px]" />
                                    : null}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AgentDetailPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const searchParams = useSearchParams();
    const isNew = id === "new";
    const defaultTab = searchParams.get("tab") ?? "config";

    const [agent, setAgent] = useState<Partial<AIAgent>>({
        type: "SUPPORT",
        provider: "OPENAI",
        status: "DRAFT",
        knowledgeBaseIds: [],
        tools: {},
        handoffRules: {},
        confidenceThreshold: 0.7,
        maxTurnsBeforeHuman: 10,
        personality: {},
    });
    const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState(defaultTab);

    const fetchAgent = useCallback(async () => {
        if (isNew) return;
        try {
            const res = await api.get<AIAgent>(`/agents/${id}`);
            setAgent(res.data);
        } catch { /* ignore */ }
    }, [id, isNew]);

    useEffect(() => {
        void api.get<KnowledgeBase[]>("/knowledge-bases").then((r) => setKbs(r.data)).catch(() => { });
        void fetchAgent();
    }, [fetchAgent]);

    const save = async (updated: Partial<AIAgent>) => {
        setSaving(true);
        try {
            if (isNew) {
                const res = await api.post<AIAgent>("/agents", updated);
                router.push(`/agents/${res.data.id}`);
            } else {
                await api.patch(`/agents/${id}`, updated);
                setAgent(updated);
            }
        } finally { setSaving(false); }
    };

    const statusLabel: Record<string, string> = {
        DRAFT: "Rascunho", LEARNING: "Aprendendo", REVIEW: "Revisar",
        READY: "Pronto", ACTIVE: "Ativo", PAUSED: "Pausado", RETIRED: "Aposentado",
    };

    const canShowFlow = ["REVIEW", "READY", "ACTIVE", "PAUSED"].includes(agent.status ?? "");
    const canShowPerformance = ["ACTIVE", "PAUSED"].includes(agent.status ?? "");

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex items-center gap-3 border-b border-[var(--rim)] px-6 py-4 flex-shrink-0">
                <Button variant="ghost" size="icon" asChild>
                    <Link href="/agents"><ArrowLeft className="w-4 h-4" /></Link>
                </Button>
                <div className="w-9 h-9 rounded-xl bg-violet-dim border border-violet/20 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-violet" />
                </div>
                <div className="flex-1 min-w-0">
                    <h1 className="text-sm font-semibold text-t1 truncate">{isNew ? "Novo Agente" : (agent.name || "Agente")}</h1>
                    {!isNew && agent.status && <p className="text-xs text-t3">{statusLabel[agent.status] ?? agent.status}</p>}
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 overflow-hidden">
                <div className="border-b border-[var(--rim)] px-6 flex-shrink-0">
                    <TabsList className="border-none gap-0">
                        <TabsTrigger value="config">Configuração</TabsTrigger>
                        <TabsTrigger value="learning" disabled={isNew}>Aprendizado</TabsTrigger>
                        <TabsTrigger value="flow" disabled={isNew || !canShowFlow}>
                            Fluxo Aprendido
                            {agent.status === "REVIEW" && <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse inline-block" />}
                        </TabsTrigger>
                        <TabsTrigger value="performance" disabled={isNew || !canShowPerformance}>Performance</TabsTrigger>
                        <TabsTrigger value="reasoning" disabled={isNew}>Raciocínio</TabsTrigger>
                    </TabsList>
                </div>

                <div className="flex-1 overflow-y-auto">
                    <TabsContent value="config">
                        <ConfigTab agent={agent} kbs={kbs} onSave={save} saving={saving} isNew={isNew} />
                    </TabsContent>
                    <TabsContent value="learning">
                        {!isNew && <LearningTab agentId={id} agent={agent} />}
                    </TabsContent>
                    <TabsContent value="flow">
                        {!isNew && <FlowTab agentId={id} agent={agent} onRefresh={fetchAgent} />}
                    </TabsContent>
                    <TabsContent value="performance">
                        {!isNew && canShowPerformance && <PerformanceTab agentId={id} />}
                    </TabsContent>
                    <TabsContent value="reasoning">
                        {!isNew && <ReasoningTab agentId={id} />}
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    );
}


