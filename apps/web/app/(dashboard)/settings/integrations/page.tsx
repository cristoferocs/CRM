"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, Zap, Settings2, ExternalLink, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export default function IntegrationsPage() {
    const [telegram, setTelegram] = useState({ botToken: "", webhookUrl: "" });
    const [slack, setSlack] = useState({ webhookUrl: "" });
    const [zapier, setZapier] = useState({ hookUrl: "" });
    const [make, setMake] = useState({ hookUrl: "" });

    const telegramMutation = useMutation({
        mutationFn: () => api.post("/integrations/telegram/set-webhook", {
            token: telegram.botToken, url: telegram.webhookUrl,
        }),
        onSuccess: () => toast.success("Webhook do Telegram configurado!"),
        onError: () => toast.error("Erro ao configurar Telegram."),
    });

    const testSlackMutation = useMutation({
        mutationFn: () => api.post("/integrations/slack/send", {
            webhookUrl: slack.webhookUrl,
            text: "Integração Slack testada com sucesso do CRM!",
        }),
        onSuccess: () => toast.success("Mensagem de teste enviada no Slack!"),
        onError: () => toast.error("Erro ao testar Slack. Verifique a URL."),
    });

    const testZapierMutation = useMutation({
        mutationFn: () => api.post("/integrations/zapier/trigger", {
            event: "test", data: { message: "Test from CRM", timestamp: new Date().toISOString() },
        }),
        onSuccess: () => toast.success("Evento enviado ao Zapier!"),
        onError: () => toast.error("Erro ao acionar Zapier."),
    });

    const testMakeMutation = useMutation({
        mutationFn: () => api.post("/integrations/make/trigger", {
            hookUrl: make.hookUrl, data: { message: "Test from CRM", timestamp: new Date().toISOString() },
        }),
        onSuccess: () => toast.success("Cenário Make.com acionado!"),
        onError: () => toast.error("Erro ao acionar Make.com."),
    });

    return (
        <div className="flex flex-col gap-6 p-6">
            <div>
                <h1 className="text-2xl font-bold text-t1">Integrações</h1>
                <p className="text-sm text-t3">Conecte o CRM com ferramentas externas</p>
            </div>

            <div className="grid grid-cols-2 gap-6">
                {/* Telegram */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-2xl">🤖</div>
                            <div>
                                <CardTitle className="text-sm">Telegram Bot</CardTitle>
                                <CardDescription>Receba e envie mensagens via bot</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                        <div>
                            <Label className="text-xs text-t3 mb-1.5">Bot Token</Label>
                            <Input placeholder="123456:ABC-DEF..." value={telegram.botToken}
                                onChange={e => setTelegram(p => ({ ...p, botToken: e.target.value }))} type="password" />
                        </div>
                        <div>
                            <Label className="text-xs text-t3 mb-1.5">URL do Webhook</Label>
                            <Input placeholder="https://seu-dominio.com/integrations/telegram/webhook"
                                value={telegram.webhookUrl} onChange={e => setTelegram(p => ({ ...p, webhookUrl: e.target.value }))} />
                        </div>
                        <Button className="gap-2 w-full" onClick={() => telegramMutation.mutate()} disabled={telegramMutation.isPending}>
                            <Save className="h-4 w-4" /> Salvar Configuração
                        </Button>
                        <a href="https://core.telegram.org/bots/tutorial" target="_blank" rel="noreferrer"
                            className="flex items-center gap-1 text-xs text-violet hover:underline">
                            <ExternalLink className="h-3 w-3" /> Como criar um bot Telegram
                        </a>
                    </CardContent>
                </Card>

                {/* Slack */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-2xl">💬</div>
                            <div>
                                <CardTitle className="text-sm">Slack</CardTitle>
                                <CardDescription>Notificações automáticas no Slack</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                        <div>
                            <Label className="text-xs text-t3 mb-1.5">Incoming Webhook URL</Label>
                            <Input placeholder="https://hooks.slack.com/services/..." value={slack.webhookUrl}
                                onChange={e => setSlack({ webhookUrl: e.target.value })} />
                        </div>
                        <Button variant="outline" className="gap-2 w-full" onClick={() => testSlackMutation.mutate()}
                            disabled={testSlackMutation.isPending || !slack.webhookUrl}>
                            <CheckCircle2 className="h-4 w-4" /> Testar Conexão
                        </Button>
                        <a href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noreferrer"
                            className="flex items-center gap-1 text-xs text-violet hover:underline">
                            <ExternalLink className="h-3 w-3" /> Criar Incoming Webhook no Slack
                        </a>
                    </CardContent>
                </Card>

                {/* Zapier */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-2xl">⚡</div>
                            <div>
                                <CardTitle className="text-sm">Zapier</CardTitle>
                                <CardDescription>Conecte com +6.000 aplicativos</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                        <div className="rounded-lg border border-[var(--rim)] bg-surface2 p-3 text-xs text-t3">
                            <p className="font-medium text-t2 mb-1">Como funciona:</p>
                            <ol className="list-decimal list-inside space-y-1">
                                <li>Crie um Zap com trigger "Webhooks by Zapier"</li>
                                <li>Use o Catch Hook e copie a URL</li>
                                <li>Configure nas automações do CRM</li>
                            </ol>
                        </div>
                        <div>
                            <Label className="text-xs text-t3 mb-1.5">URL do Webhook (para teste)</Label>
                            <Input placeholder="https://hooks.zapier.com/hooks/catch/..." value={zapier.hookUrl}
                                onChange={e => setZapier({ hookUrl: e.target.value })} />
                        </div>
                        <Button variant="outline" className="gap-2 w-full" onClick={() => testZapierMutation.mutate()}
                            disabled={testZapierMutation.isPending || !zapier.hookUrl}>
                            <Zap className="h-4 w-4" /> Enviar Evento de Teste
                        </Button>
                    </CardContent>
                </Card>

                {/* Make.com */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-2xl">🔄</div>
                            <div>
                                <CardTitle className="text-sm">Make.com</CardTitle>
                                <CardDescription>Automatize fluxos complexos sem código</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                        <div className="rounded-lg border border-[var(--rim)] bg-surface2 p-3 text-xs text-t3">
                            <p className="font-medium text-t2 mb-1">Como funciona:</p>
                            <ol className="list-decimal list-inside space-y-1">
                                <li>Crie um Cenário no Make.com</li>
                                <li>Adicione o módulo "Webhooks" como gatilho</li>
                                <li>Copie a URL do Custom Webhook</li>
                            </ol>
                        </div>
                        <div>
                            <Label className="text-xs text-t3 mb-1.5">URL do Webhook</Label>
                            <Input placeholder="https://hook.make.com/..." value={make.hookUrl}
                                onChange={e => setMake({ hookUrl: e.target.value })} />
                        </div>
                        <Button variant="outline" className="gap-2 w-full" onClick={() => testMakeMutation.mutate()}
                            disabled={testMakeMutation.isPending || !make.hookUrl}>
                            <Settings2 className="h-4 w-4" /> Acionar Cenário de Teste
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
