"use client";

import { ExternalLink, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const INTEGRATIONS = [
    {
        id: "whatsapp",
        name: "WhatsApp Business",
        desc: "Meta Cloud API ou número oficial",
        icon: "💬",
        color: "bg-[#25d366]/10 border-[#25d366]/20",
        connected: true,
    },
    {
        id: "instagram",
        name: "Instagram DM",
        desc: "Mensagens diretas via Meta API",
        icon: "📸",
        color: "bg-[#e1306c]/10 border-[#e1306c]/20",
        connected: true,
    },
    {
        id: "messenger",
        name: "Facebook Messenger",
        desc: "Integração com página do Facebook",
        icon: "📘",
        color: "bg-[#1877f2]/10 border-[#1877f2]/20",
        connected: false,
    },
    {
        id: "google",
        name: "Google Ads",
        desc: "Importar leads de campanhas",
        icon: "🎯",
        color: "bg-[#ea4335]/10 border-[#ea4335]/20",
        connected: false,
    },
    {
        id: "meta-ads",
        name: "Meta Ads",
        desc: "Formulários de Lead Ads",
        icon: "📣",
        color: "bg-[#1877f2]/10 border-[#1877f2]/20",
        connected: false,
    },
    {
        id: "calendar",
        name: "Google Calendar",
        desc: "Agendamentos e reuniões",
        icon: "📅",
        color: "bg-[#0f9d58]/10 border-[#0f9d58]/20",
        connected: false,
    },
    {
        id: "stripe",
        name: "Stripe",
        desc: "Cobranças e pagamentos",
        icon: "💳",
        color: "bg-violet/10 border-violet/20",
        connected: false,
    },
    {
        id: "openai",
        name: "OpenAI",
        desc: "GPT-4o para agentes de IA",
        icon: "🤖",
        color: "bg-[#10a37f]/10 border-[#10a37f]/20",
        connected: true,
    },
];

export default function IntegrationsSettingsPage() {
    return (
        <div className="space-y-6 animate-fade-in">
            <div>
                <h1 className="font-display text-[28px] font-semibold leading-none tracking-[-0.8px] text-t1">
                    Integrações
                </h1>
                <p className="mt-1.5 text-sm text-t2">Conecte seus canais e ferramentas</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
                {INTEGRATIONS.map((integration) => (
                    <div
                        key={integration.id}
                        className={cn(
                            "flex items-center gap-4 rounded-[16px] border bg-surface p-4 transition-all hover:bg-surface-2",
                            integration.connected
                                ? "border-jade/20"
                                : "border-[var(--rim)]",
                        )}
                    >
                        <div
                            className={cn(
                                "flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] border text-xl",
                                integration.color,
                            )}
                        >
                            {integration.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-medium text-t1">{integration.name}</p>
                            <p className="text-xs text-t2 truncate">{integration.desc}</p>
                        </div>
                        <div className="shrink-0">
                            {integration.connected ? (
                                <Badge variant="jade">
                                    <Check className="h-3 w-3" /> Conectado
                                </Badge>
                            ) : (
                                <Button variant="outline" size="sm">
                                    <ExternalLink className="h-3.5 w-3.5" /> Conectar
                                </Button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
