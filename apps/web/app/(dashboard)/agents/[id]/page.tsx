"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Bot, Send, Loader2 } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface AIAgent {
    id: string;
    name: string;
    description?: string;
    type: string;
    provider: string;
    model?: string;
    status: string;
    systemPrompt: string;
    temperature: number;
    maxTokens: number;
    knowledgeBaseIds: string[];
    tools: Record<string, unknown>;
    handoffRules: Record<string, unknown>;
}

interface KnowledgeBase {
    id: string;
    name: string;
}

interface ChatMsg {
    role: "user" | "assistant";
    content: string;
}

const PROVIDERS = ["GOOGLE", "ANTHROPIC", "OPENAI", "OLLAMA"];
const TYPES = ["SALES", "SUPPORT", "SCHEDULER", "CUSTOM"];

export default function AgentDetailPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const isNew = id === "new";

    const [agent, setAgent] = useState<Partial<AIAgent>>({
        type: "SUPPORT",
        provider: "OPENAI",
        temperature: 0.3,
        maxTokens: 2048,
        knowledgeBaseIds: [],
        tools: {},
        handoffRules: {},
        status: "INACTIVE",
    });
    const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
    const [saving, setSaving] = useState(false);
    const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
    const [chatInput, setChatInput] = useState("");
    const [chatLoading, setChatLoading] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        void api.get<KnowledgeBase[]>("/knowledge-bases").then((r) => setKbs(r.data));
        if (!isNew) {
            void api.get<AIAgent>(`/agents/${id}`).then((r) => setAgent(r.data));
        }
    }, [id, isNew]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [chatMessages]);

    const save = async () => {
        setSaving(true);
        try {
            if (isNew) {
                const res = await api.post<AIAgent>("/agents", agent);
                router.push(`/agents/${res.data.id}`);
            } else {
                await api.patch(`/agents/${id}`, agent);
            }
        } finally {
            setSaving(false);
        }
    };

    const sendTestMessage = async () => {
        if (!chatInput.trim() || isNew) return;
        const userMsg = chatInput.trim();
        setChatInput("");
        setChatMessages((prev) => [...prev, { role: "user", content: userMsg }]);
        setChatLoading(true);
        try {
            const res = await api.post<{ response: string }>(`/agents/${id}/test`, {
                conversationId: `test-${id}`,
                message: userMsg,
            });
            setChatMessages((prev) => [...prev, { role: "assistant", content: res.data.response }]);
        } catch (e) {
            setChatMessages((prev) => [
                ...prev,
                { role: "assistant", content: "Erro ao obter resposta do agente." },
            ]);
        } finally {
            setChatLoading(false);
        }
    };

    return (
        <div className="p-6 space-y-6 max-w-6xl mx-auto">
            <div className="flex items-center gap-3">
                <Link href="/agents">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold">
                        {isNew ? "Novo Agente" : (agent.name ?? "Agente")}
                    </h1>
                    {!isNew && (
                        <Badge
                            variant="outline"
                            className={cn(
                                "text-xs mt-1",
                                agent.status === "ACTIVE"
                                    ? "border-green-500 text-green-600"
                                    : "border-muted-foreground/30",
                            )}
                        >
                            {agent.status === "ACTIVE" ? "Ativo" : "Inativo"}
                        </Badge>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {/* Config form */}
                <div className="space-y-5">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Configurações Gerais</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <Label>Nome</Label>
                                <Input
                                    value={agent.name ?? ""}
                                    onChange={(e) => setAgent((a) => ({ ...a, name: e.target.value }))}
                                    placeholder="Ex: Assistente de Vendas"
                                />
                            </div>
                            <div>
                                <Label>Descrição</Label>
                                <Input
                                    value={agent.description ?? ""}
                                    onChange={(e) => setAgent((a) => ({ ...a, description: e.target.value }))}
                                    placeholder="Opcional"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label>Tipo</Label>
                                    <Select
                                        value={agent.type}
                                        onValueChange={(v) => setAgent((a) => ({ ...a, type: v }))}
                                    >
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {TYPES.map((t) => (
                                                <SelectItem key={t} value={t}>{t}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label>Provedor</Label>
                                    <Select
                                        value={agent.provider}
                                        onValueChange={(v) => setAgent((a) => ({ ...a, provider: v }))}
                                    >
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {PROVIDERS.map((p) => (
                                                <SelectItem key={p} value={p}>{p}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div>
                                <Label>System Prompt</Label>
                                <Textarea
                                    rows={6}
                                    value={agent.systemPrompt ?? ""}
                                    onChange={(e) => setAgent((a) => ({ ...a, systemPrompt: e.target.value }))}
                                    placeholder="Você é um assistente de vendas..."
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label>Temperature ({agent.temperature})</Label>
                                    <input
                                        type="range"
                                        min={0} max={2} step={0.1}
                                        value={agent.temperature}
                                        onChange={(e) => setAgent((a) => ({ ...a, temperature: Number(e.target.value) }))}
                                        className="w-full"
                                    />
                                </div>
                                <div>
                                    <Label>Max Tokens</Label>
                                    <Input
                                        type="number"
                                        value={agent.maxTokens}
                                        onChange={(e) => setAgent((a) => ({ ...a, maxTokens: Number(e.target.value) }))}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Bases de Conhecimento</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {kbs.length === 0 ? (
                                <p className="text-sm text-muted-foreground">Nenhuma base criada.</p>
                            ) : (
                                <div className="space-y-2">
                                    {kbs.map((kb) => {
                                        const selected = agent.knowledgeBaseIds?.includes(kb.id);
                                        return (
                                            <label key={kb.id} className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={!!selected}
                                                    onChange={() =>
                                                        setAgent((a) => ({
                                                            ...a,
                                                            knowledgeBaseIds: selected
                                                                ? (a.knowledgeBaseIds ?? []).filter((x) => x !== kb.id)
                                                                : [...(a.knowledgeBaseIds ?? []), kb.id],
                                                        }))
                                                    }
                                                />
                                                <span className="text-sm">{kb.name}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Button onClick={save} disabled={saving} className="w-full">
                        {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        {isNew ? "Criar Agente" : "Salvar Alterações"}
                    </Button>
                </div>

                {/* Test chat */}
                {!isNew && (
                    <div>
                        <Card className="h-full flex flex-col">
                            <CardHeader>
                                <CardTitle className="text-base flex items-center gap-2">
                                    <Bot className="w-4 h-4" />
                                    Testar Agente
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="flex flex-col flex-1 gap-3">
                                <div className="flex-1 overflow-y-auto space-y-3 max-h-96 pr-1">
                                    {chatMessages.length === 0 && (
                                        <p className="text-sm text-muted-foreground text-center mt-8">
                                            Envie uma mensagem para testar o agente.
                                        </p>
                                    )}
                                    {chatMessages.map((m, i) => (
                                        <div
                                            key={i}
                                            className={cn(
                                                "rounded-xl px-4 py-2 text-sm max-w-[85%]",
                                                m.role === "user"
                                                    ? "bg-primary text-primary-foreground ml-auto"
                                                    : "bg-muted",
                                            )}
                                        >
                                            {m.content}
                                        </div>
                                    ))}
                                    {chatLoading && (
                                        <div className="bg-muted rounded-xl px-4 py-2 text-sm max-w-[85%]">
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        </div>
                                    )}
                                    <div ref={chatEndRef} />
                                </div>
                                <Separator />
                                <div className="flex gap-2">
                                    <Input
                                        placeholder="Escreva uma mensagem..."
                                        value={chatInput}
                                        onChange={(e) => setChatInput(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && void sendTestMessage()}
                                        disabled={chatLoading}
                                    />
                                    <Button
                                        size="icon"
                                        onClick={() => void sendTestMessage()}
                                        disabled={chatLoading || !chatInput.trim()}
                                    >
                                        <Send className="w-4 h-4" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}
            </div>
        </div>
    );
}
