"use client";

import type { StageAutomationRule } from "@crm-base/shared";

/**
 * Ready-made automation templates inspired by HubSpot / Pipedrive / Kommo /
 * Monday / Close / Salesforce. Each preset is a single rule the user can drop
 * into onEnter/onExit/onRotting and customize.
 */

export interface AutomationPreset {
    id: string;
    name: string;
    description: string;
    trigger: "enter" | "exit" | "rotting";
    category: "engagement" | "qualification" | "handoff" | "operational" | "ai";
    icon: string;
    rule: Omit<StageAutomationRule, "id">;
}

function rid(): string {
    return Math.random().toString(36).slice(2, 11);
}

export const AUTOMATION_PRESETS: AutomationPreset[] = [
    {
        id: "welcome-whatsapp",
        name: "Boas-vindas no WhatsApp",
        description: "Envia mensagem automática de boas-vindas quando o lead entra na etapa.",
        trigger: "enter",
        category: "engagement",
        icon: "MessageCircle",
        rule: {
            name: "Boas-vindas via WhatsApp",
            trigger: "enter",
            isActive: true,
            conditions: null,
            actions: [
                {
                    type: "send_whatsapp",
                    message:
                        "Olá {{contact.name}}! Recebemos seu interesse em {{deal.title}}. Em breve um consultor entrará em contato.",
                },
            ],
        },
    },
    {
        id: "create-followup-task",
        name: "Tarefa de follow-up em 1 dia",
        description: "Cria automaticamente uma tarefa para o responsável fazer follow-up.",
        trigger: "enter",
        category: "operational",
        icon: "CheckSquare",
        rule: {
            name: "Follow-up D+1",
            trigger: "enter",
            isActive: true,
            conditions: null,
            actions: [
                {
                    type: "create_task",
                    title: "Follow-up: {{deal.title}}",
                    description: "Entrar em contato com {{contact.name}} ({{contact.phone}}).",
                    dueIn: "1d",
                    activityType: "TASK",
                },
            ],
        },
    },
    {
        id: "notify-owner-hot-lead",
        name: "Notificar dono sobre lead quente",
        description: "Avisa o responsável quando um deal de alto valor entra em uma etapa.",
        trigger: "enter",
        category: "operational",
        icon: "Bell",
        rule: {
            name: "Alerta: lead quente",
            trigger: "enter",
            isActive: true,
            conditions: {
                kind: "group",
                operator: "AND",
                children: [
                    {
                        kind: "condition",
                        field: "deal.value",
                        operator: "gte",
                        value: 10000,
                    },
                ],
            },
            actions: [
                {
                    type: "notify_user",
                    target: "owner",
                    title: "🔥 Lead quente: {{deal.title}}",
                    message: "Deal de alto valor entrou na sua etapa. Aja rápido!",
                },
            ],
        },
    },
    {
        id: "assign-qualifier-agent",
        name: "Ativar agente qualificador",
        description: "Aciona o super-agente de IA para qualificar leads automaticamente.",
        trigger: "enter",
        category: "ai",
        icon: "Sparkles",
        rule: {
            name: "Qualificação automática por IA",
            trigger: "enter",
            isActive: true,
            conditions: null,
            actions: [
                {
                    type: "assign_ai_agent",
                    agentId: "__SET_AGENT_ID__",
                    goal:
                        "Qualifique este lead: descubra orçamento, urgência e tomador de decisão.",
                },
            ],
        },
    },
    {
        id: "rotting-recovery",
        name: "Resgate de deal parado",
        description: "Envia mensagem e cria tarefa quando o deal fica parado.",
        trigger: "rotting",
        category: "engagement",
        icon: "AlarmClock",
        rule: {
            name: "Resgate automático",
            trigger: "rotting",
            isActive: true,
            conditions: null,
            actions: [
                {
                    type: "send_whatsapp",
                    message:
                        "Oi {{contact.name}}, faz um tempo que não falamos. Posso te ajudar com {{deal.title}}?",
                },
                {
                    type: "wait",
                    duration: "2d",
                },
                {
                    type: "notify_user",
                    target: "owner",
                    title: "Deal ainda parado: {{deal.title}}",
                    message: "Já enviamos mensagem automática há 2 dias; verifique se houve resposta.",
                },
            ],
        },
    },
    {
        id: "won-celebration",
        name: "Celebrar venda ganha",
        description: "Envia agradecimento e notifica time quando o deal é movido para Ganho.",
        trigger: "enter",
        category: "handoff",
        icon: "Trophy",
        rule: {
            name: "Comemorar venda",
            trigger: "enter",
            isActive: true,
            conditions: null,
            actions: [
                {
                    type: "send_email",
                    subject: "Bem-vindo(a) à bordo, {{contact.name}}!",
                    body:
                        "Obrigado por escolher nossa solução. Em breve nossa equipe entrará em contato para o onboarding.",
                },
                {
                    type: "notify_user",
                    target: "role:ADMIN",
                    title: "🎉 Nova venda fechada",
                    message: "{{deal.title}} foi marcado como ganho.",
                },
                {
                    type: "add_tag",
                    target: "contact",
                    tag: "cliente",
                },
            ],
        },
    },
    {
        id: "lost-tag-and-survey",
        name: "Tag de perda + pesquisa",
        description: "Marca o contato como 'lead frio' e dispara webhook de pesquisa de perda.",
        trigger: "enter",
        category: "qualification",
        icon: "ThumbsDown",
        rule: {
            name: "Pesquisa de perda",
            trigger: "enter",
            isActive: true,
            conditions: null,
            actions: [
                {
                    type: "add_tag",
                    target: "contact",
                    tag: "lead-frio",
                },
                {
                    type: "webhook",
                    method: "POST",
                    url: "https://hooks.example.com/lost-survey",
                    body: '{"dealId":"{{deal.title}}","contactEmail":"{{contact.email}}"}',
                },
            ],
        },
    },
    {
        id: "exit-cleanup",
        name: "Limpeza ao sair da etapa",
        description: "Remove tag temporária e atualiza probabilidade ao sair da etapa.",
        trigger: "exit",
        category: "operational",
        icon: "Eraser",
        rule: {
            name: "Limpeza de saída",
            trigger: "exit",
            isActive: true,
            conditions: null,
            actions: [
                {
                    type: "remove_tag",
                    target: "contact",
                    tag: "novo-lead",
                },
            ],
        },
    },
];

export function instantiatePreset(preset: AutomationPreset): StageAutomationRule {
    return {
        id: rid(),
        ...preset.rule,
    };
}
