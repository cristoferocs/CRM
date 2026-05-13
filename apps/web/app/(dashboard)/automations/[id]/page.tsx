"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    ReactFlow as ReactFlowBase,
    addEdge,
    Background,
    Controls,
    MiniMap,
    useNodesState,
    useEdgesState,
    type Connection,
    type Edge,
    type Node,
    Panel,
    MarkerType,
} from "@xyflow/react";
import type { ComponentProps } from "react";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ReactFlow = ReactFlowBase as React.ComponentType<ComponentProps<typeof ReactFlowBase>>;
import "@xyflow/react/dist/style.css";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Save,
    Play,
    ArrowLeft,
    Plus,
    Zap,
    ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ---------------------------------------------------------------------------
// Node definitions
// ---------------------------------------------------------------------------

const NODE_TYPES_DEF = [
    {
        group: "Gatilhos", items: [
            { type: "trigger", label: "Gatilho", color: "violet", description: "Ponto de início do fluxo" },
        ]
    },
    {
        group: "Ações", items: [
            { type: "send_whatsapp", label: "Enviar WhatsApp", color: "green", description: "Envia mensagem via WhatsApp" },
            { type: "send_email", label: "Enviar Email", color: "blue", description: "Envia e-mail para o contato" },
            { type: "add_tag", label: "Adicionar Tag", color: "orange", description: "Adiciona uma tag ao contato" },
            { type: "remove_tag", label: "Remover Tag", color: "orange", description: "Remove uma tag do contato" },
            { type: "update_field", label: "Atualizar Campo", color: "cyan", description: "Atualiza um campo do contato" },
            { type: "create_task", label: "Criar Tarefa", color: "yellow", description: "Cria uma tarefa para o vendedor" },
            { type: "notify_user", label: "Notificar Usuário", color: "pink", description: "Envia notificação interna" },
            { type: "assign_owner", label: "Atribuir Responsável", color: "purple", description: "Atribui dono do deal" },
            { type: "activate_agent", label: "Ativar Agente IA", color: "violet", description: "Ativa agente de IA" },
            { type: "move_pipeline", label: "Mover no Pipeline", color: "indigo", description: "Move deal para outro stage" },
            { type: "webhook", label: "Webhook", color: "gray", description: "Envia requisição HTTP externa" },
            { type: "zapier_trigger", label: "Zapier", color: "orange", description: "Dispara automação no Zapier" },
            { type: "make_trigger", label: "Make.com", color: "purple", description: "Dispara cenário no Make.com" },
        ]
    },
    {
        group: "Lógica", items: [
            { type: "delay", label: "Aguardar", color: "gray", description: "Espera um período de tempo" },
            { type: "condition", label: "Condição", color: "yellow", description: "Ramifica o fluxo por condição" },
            { type: "ab_test", label: "Teste A/B", color: "pink", description: "Divide o fluxo em dois grupos" },
            { type: "end", label: "Fim", color: "red", description: "Encerra o fluxo" },
        ]
    },
];

const NODE_COLORS: Record<string, string> = {
    trigger: "#7c5cfc",
    send_whatsapp: "#25d366",
    send_email: "#4a90e2",
    add_tag: "#f97316",
    remove_tag: "#f97316",
    update_field: "#06b6d4",
    create_task: "#eab308",
    notify_user: "#ec4899",
    assign_owner: "#a855f7",
    activate_agent: "#7c5cfc",
    move_pipeline: "#6366f1",
    webhook: "#6b7280",
    zapier_trigger: "#ff4a00",
    make_trigger: "#6d00fa",
    delay: "#6b7280",
    condition: "#eab308",
    ab_test: "#ec4899",
    end: "#ef4444",
    default: "#6b7280",
};

// ---------------------------------------------------------------------------
// Custom node component
// ---------------------------------------------------------------------------

function AutomationNode({ data }: { data: { label: string; type: string; config?: Record<string, unknown> } }) {
    const color = NODE_COLORS[data.type] ?? NODE_COLORS.default;
    return (
        <div className="min-w-[160px] rounded-xl border-2 bg-white shadow-lg" style={{ borderColor: color }}>
            <div className="flex items-center gap-2 rounded-t-lg px-3 py-2" style={{ backgroundColor: `${color}20` }}>
                <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-xs font-semibold text-gray-700">{data.label}</span>
            </div>
            <div className="px-3 pb-2 pt-1">
                <p className="text-[10px] text-gray-500 capitalize">{data.type.replace(/_/g, " ")}</p>
            </div>
        </div>
    );
}

const nodeTypes = { custom: AutomationNode };

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AutomationBuilderPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const qc = useQueryClient();
    const isNew = id === "new";

    const [name, setName] = useState("Nova Automação");
    const [triggerType, setTriggerType] = useState("CONTACT_CREATED");
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

    // Load existing automation
    const { data: automation } = useQuery({
        queryKey: ["automation", id],
        queryFn: () => api.get(`/automations/${id}`).then(r => r.data),
        enabled: !isNew,
    });

    useEffect(() => {
        if (automation) {
            setName(automation.name);
            setTriggerType(automation.triggerType);
            const flowNodes = (automation.nodes ?? []).map((n: { id: string; type: string; label: string; config: Record<string, unknown>; position: { x: number; y: number } }) => ({
                id: n.id,
                type: "custom",
                position: n.position ?? { x: 100, y: 100 },
                data: { label: n.label ?? n.type, type: n.type, config: n.config },
            }));
            const flowEdges = (automation.edges ?? []).map((e: { from: string; to: string; condition?: string }) => ({
                id: `${e.from}-${e.to}`,
                source: e.from,
                target: e.to,
                label: e.condition,
                markerEnd: { type: MarkerType.ArrowClosed },
            }));
            setNodes(flowNodes);
            setEdges(flowEdges);
        }
    }, [automation, setNodes, setEdges]);

    // Default trigger node for new automations
    useEffect(() => {
        if (isNew && nodes.length === 0) {
            setNodes([{
                id: "trigger",
                type: "custom",
                position: { x: 200, y: 150 },
                data: { label: "Gatilho", type: "trigger", config: {} },
            }]);
        }
    }, [isNew, nodes.length, setNodes]);

    const onConnect = useCallback((params: Connection) => {
        setEdges(eds => addEdge({ ...params, markerEnd: { type: MarkerType.ArrowClosed } }, eds));
    }, [setEdges]);

    const saveMutation = useMutation({
        mutationFn: async () => {
            const flowNodes = nodes.map(n => ({
                id: n.id, type: (n.data as { type: string }).type, label: (n.data as { label: string }).label,
                config: (n.data as { config: Record<string, unknown> }).config ?? {},
                position: n.position,
            }));
            const flowEdges = edges.map(e => ({ from: e.source, to: e.target, condition: e.label }));
            const payload = { name, triggerType, nodes: flowNodes, edges: flowEdges };
            if (isNew) return api.post("/automations", payload);
            return api.patch(`/automations/${id}`, payload);
        },
        onSuccess: (res) => {
            toast.success("Automação salva!");
            qc.invalidateQueries({ queryKey: ["automations"] });
            if (isNew && res?.data?.id) router.replace(`/automations/${res.data.id}`);
        },
        onError: () => toast.error("Erro ao salvar automação"),
    });

    const testMutation = useMutation({
        mutationFn: () => api.post(`/automations/${id}/test`, { payload: {} }),
        onSuccess: () => toast.success("Teste executado! Verifique os logs."),
        onError: () => toast.error("Erro ao testar automação"),
    });

    const addNode = (type: string, label: string) => {
        const id = `node_${Date.now()}`;
        const newNode: Node = {
            id,
            type: "custom",
            position: { x: Math.random() * 400 + 100, y: Math.random() * 300 + 100 },
            data: { label, type, config: {} },
        };
        setNodes(nds => [...nds, newNode]);
    };

    return (
        <div className="flex h-screen flex-col">
            {/* Toolbar */}
            <div className="flex items-center gap-3 border-b border-[var(--rim)] bg-surface px-4 py-2.5">
                <Button variant="ghost" size="icon" onClick={() => router.push("/automations")}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <Input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="h-8 w-64 text-sm font-medium"
                />
                <Badge variant="outline" className="text-xs">{triggerType.replace(/_/g, " ")}</Badge>
                <div className="flex-1" />

                {/* Add node dropdown */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1.5">
                            <Plus className="h-3.5 w-3.5" /> Adicionar Nó <ChevronDown className="h-3 w-3" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56 max-h-80 overflow-y-auto" align="end">
                        {NODE_TYPES_DEF.map(group => (
                            <div key={group.group}>
                                <DropdownMenuLabel className="text-xs text-t3">{group.group}</DropdownMenuLabel>
                                {group.items.map(item => (
                                    <DropdownMenuItem key={item.type} onClick={() => addNode(item.type, item.label)}>
                                        <div className="h-2 w-2 rounded-full mr-2" style={{ backgroundColor: NODE_COLORS[item.type] ?? "#6b7280" }} />
                                        {item.label}
                                    </DropdownMenuItem>
                                ))}
                                <DropdownMenuSeparator />
                            </div>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>

                {!isNew && (
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => testMutation.mutate()}>
                        <Play className="h-3.5 w-3.5" /> Testar
                    </Button>
                )}
                <Button size="sm" className="gap-1.5" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                    <Save className="h-3.5 w-3.5" /> Salvar
                </Button>
            </div>

            {/* Canvas */}
            <div className="flex-1">
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    nodeTypes={nodeTypes}
                    fitView
                    defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeWidth: 2 } }}
                >
                    <Background />
                    <Controls />
                    <MiniMap />
                    <Panel position="top-left" className="rounded-lg border border-[var(--rim)] bg-surface px-3 py-2 text-xs text-t3">
                        <Zap className="mr-1.5 inline h-3 w-3 text-violet" />
                        Arraste os nós para reorganizar · Conecte as saídas às entradas
                    </Panel>
                </ReactFlow>
            </div>
        </div>
    );
}
