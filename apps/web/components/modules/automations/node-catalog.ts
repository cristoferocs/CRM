import {
    Zap, MessageCircle, Mail, MessageSquare, Tag, TagsIcon, Edit3, ListTodo,
    Bell, Hash, BotMessageSquare, Brain, ChartLine, Move, Webhook, Workflow,
    Clock, GitFork, Beaker, Square, type LucideIcon,
} from "lucide-react";

export type NodeKind =
    | "trigger"
    | "send_whatsapp" | "send_email" | "send_sms"
    | "add_tag" | "remove_tag" | "update_field" | "create_task" | "notify_user" | "notify_slack" | "assign_owner"
    | "activate_agent" | "analyze_sentiment" | "score_lead"
    | "move_pipeline"
    | "webhook" | "zapier_trigger" | "make_trigger"
    | "delay" | "condition" | "ab_test" | "end";

export interface NodeDef {
    type: NodeKind;
    label: string;
    description: string;
    color: string;       // hex used by React Flow node visuals
    bgClass: string;     // tailwind class for sidebar icon bg
    textClass: string;   // tailwind class for sidebar icon color
    icon: LucideIcon;
    category: "Gatilho" | "Mensagens" | "CRM" | "IA" | "Lógica" | "Integrações";
}

export const NODE_CATALOG: NodeDef[] = [
    // Gatilhos
    { type: "trigger", label: "Gatilho", description: "Ponto de início do fluxo", color: "#7c5cfc", bgClass: "bg-violet-500/15", textClass: "text-violet-400", icon: Zap, category: "Gatilho" },

    // Mensagens
    { type: "send_whatsapp", label: "Enviar WhatsApp", description: "Envia mensagem via WhatsApp", color: "#25d366", bgClass: "bg-emerald-500/15", textClass: "text-emerald-400", icon: MessageCircle, category: "Mensagens" },
    { type: "send_email", label: "Enviar Email", description: "Envia e-mail para o contato", color: "#4a90e2", bgClass: "bg-blue-500/15", textClass: "text-blue-400", icon: Mail, category: "Mensagens" },
    { type: "send_sms", label: "Enviar SMS", description: "Envia SMS via gateway", color: "#3b82f6", bgClass: "bg-sky-500/15", textClass: "text-sky-400", icon: MessageSquare, category: "Mensagens" },

    // CRM
    { type: "add_tag", label: "Adicionar Tag", description: "Adiciona tag ao contato", color: "#f97316", bgClass: "bg-orange-500/15", textClass: "text-orange-400", icon: Tag, category: "CRM" },
    { type: "remove_tag", label: "Remover Tag", description: "Remove tag do contato", color: "#f97316", bgClass: "bg-orange-500/15", textClass: "text-orange-400", icon: TagsIcon, category: "CRM" },
    { type: "update_field", label: "Atualizar Campo", description: "Atualiza um campo do contato/deal", color: "#06b6d4", bgClass: "bg-cyan-500/15", textClass: "text-cyan-400", icon: Edit3, category: "CRM" },
    { type: "create_task", label: "Criar Tarefa", description: "Cria tarefa para o vendedor", color: "#eab308", bgClass: "bg-yellow-500/15", textClass: "text-yellow-400", icon: ListTodo, category: "CRM" },
    { type: "notify_user", label: "Notificar Usuário", description: "Envia notificação interna", color: "#ec4899", bgClass: "bg-pink-500/15", textClass: "text-pink-400", icon: Bell, category: "CRM" },
    { type: "notify_slack", label: "Notificar Slack", description: "Envia mensagem ao Slack", color: "#9333ea", bgClass: "bg-purple-500/15", textClass: "text-purple-400", icon: Hash, category: "CRM" },
    { type: "assign_owner", label: "Atribuir Responsável", description: "Atribui dono do deal/contato", color: "#a855f7", bgClass: "bg-fuchsia-500/15", textClass: "text-fuchsia-400", icon: Workflow, category: "CRM" },
    { type: "move_pipeline", label: "Mover no Pipeline", description: "Move deal para outro estágio", color: "#6366f1", bgClass: "bg-indigo-500/15", textClass: "text-indigo-400", icon: Move, category: "CRM" },

    // IA
    { type: "activate_agent", label: "Ativar Agente IA", description: "Ativa um agente para a conversa", color: "#7c5cfc", bgClass: "bg-violet-500/15", textClass: "text-violet-400", icon: BotMessageSquare, category: "IA" },
    { type: "analyze_sentiment", label: "Analisar Sentimento", description: "Analisa sentimento da conversa", color: "#a78bfa", bgClass: "bg-violet-500/15", textClass: "text-violet-400", icon: Brain, category: "IA" },
    { type: "score_lead", label: "Calcular Score", description: "Recalcula o score do lead", color: "#f59e0b", bgClass: "bg-amber-500/15", textClass: "text-amber-400", icon: ChartLine, category: "IA" },

    // Lógica
    { type: "delay", label: "Aguardar", description: "Espera um período de tempo", color: "#6b7280", bgClass: "bg-zinc-500/15", textClass: "text-zinc-400", icon: Clock, category: "Lógica" },
    { type: "condition", label: "Condição", description: "Ramifica o fluxo por condição", color: "#eab308", bgClass: "bg-yellow-500/15", textClass: "text-yellow-400", icon: GitFork, category: "Lógica" },
    { type: "ab_test", label: "Teste A/B", description: "Divide o fluxo em dois grupos", color: "#ec4899", bgClass: "bg-pink-500/15", textClass: "text-pink-400", icon: Beaker, category: "Lógica" },
    { type: "end", label: "Fim", description: "Encerra o fluxo", color: "#ef4444", bgClass: "bg-red-500/15", textClass: "text-red-400", icon: Square, category: "Lógica" },

    // Integrações
    { type: "webhook", label: "Webhook", description: "Envia requisição HTTP externa", color: "#6b7280", bgClass: "bg-zinc-500/15", textClass: "text-zinc-400", icon: Webhook, category: "Integrações" },
    { type: "zapier_trigger", label: "Zapier", description: "Dispara fluxo no Zapier", color: "#ff4a00", bgClass: "bg-orange-500/15", textClass: "text-orange-400", icon: Workflow, category: "Integrações" },
    { type: "make_trigger", label: "Make.com", description: "Dispara cenário no Make.com", color: "#6d00fa", bgClass: "bg-purple-500/15", textClass: "text-purple-400", icon: Workflow, category: "Integrações" },
];

export function getNodeDef(type: string): NodeDef | undefined {
    return NODE_CATALOG.find(n => n.type === type);
}

export const NODE_CATEGORIES: NodeDef["category"][] = ["Gatilho", "Mensagens", "CRM", "IA", "Lógica", "Integrações"];

// Variable namespaces available in templates
export const VARIABLE_CHIPS: { label: string; value: string }[] = [
    { label: "Nome do contato", value: "{{contact.name}}" },
    { label: "Telefone", value: "{{contact.phone}}" },
    { label: "E-mail", value: "{{contact.email}}" },
    { label: "Empresa", value: "{{contact.company}}" },
    { label: "Título do deal", value: "{{deal.title}}" },
    { label: "Valor do deal", value: "{{deal.value}}" },
    { label: "Stage", value: "{{deal.stage}}" },
    { label: "Vendedor", value: "{{owner.name}}" },
    { label: "Organização", value: "{{org.name}}" },
];
