"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
    ReactFlow as ReactFlowBase,
    ReactFlowProvider,
    addEdge,
    Background,
    Controls,
    MiniMap,
    useNodesState,
    useEdgesState,
    Handle,
    Position,
    type Connection,
    type Edge,
    type Node,
    Panel,
    MarkerType,
    useReactFlow,
    type ReactFlowInstance,
} from "@xyflow/react";
import type { ComponentProps } from "react";
import "@xyflow/react/dist/style.css";
import {
    Save, Play, ArrowLeft, Zap, History, Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import {
    useAutomation, useSaveAutomation, useTestAutomation, useToggleAutomation,
    TRIGGER_LABELS, type AutomationNodeData, type AutomationEdgeData,
} from "@/hooks/useAutomations";
import { NodeLibrary } from "@/components/modules/automations/NodeLibrary";
import { PropertiesPanel } from "@/components/modules/automations/PropertiesPanel";
import { LogsDrawer } from "@/components/modules/automations/LogsDrawer";
import { SimulatorModal } from "@/components/modules/automations/simulator-modal";
import { TestTube2 } from "lucide-react";
import type { SimulateInput } from "@/hooks/useSimulator";
import { NODE_CATALOG, getNodeDef, type NodeDef } from "@/components/modules/automations/node-catalog";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ReactFlow = ReactFlowBase as React.ComponentType<ComponentProps<typeof ReactFlowBase>>;

type FlowNodeData = { label: string; type: string; config: Record<string, unknown> };

// Short config summary shown below the node type label in the canvas card.
function getNodeSummary(type: string, config: Record<string, unknown>): string | null {
    switch (type) {
        case "send_whatsapp": case "send_sms":
            return config.message ? String(config.message).slice(0, 40) + (String(config.message).length > 40 ? "…" : "") : null;
        case "send_email":
            return config.subject ? String(config.subject).slice(0, 40) : null;
        case "add_tag": case "remove_tag":
            return config.tag ? `#${config.tag}` : null;
        case "delay":
            return config.amount ? `${config.amount} ${config.unit ?? "min"}` : null;
        case "condition": {
            const rules = Array.isArray(config.rules) ? config.rules.length : 0;
            return `${config.match ?? "ALL"} · ${rules} regra${rules !== 1 ? "s" : ""}`;
        }
        case "ab_test": {
            const p = Number(config.splitPercent ?? 50);
            return `A: ${p}% / B: ${100 - p}%`;
        }
        case "webhook":
            return config.url ? String(config.url).replace(/^https?:\/\//, "").slice(0, 35) : null;
        case "move_pipeline":
            return config.stageId ? `→ stage ${config.stageId}` : null;
        case "assign_owner":
            return String(config.rule ?? "round_robin");
        case "trigger":
            return config.triggerType ? String(config.triggerType).replace(/_/g, " ").toLowerCase() : null;
        default:
            return null;
    }
}

function AutomationFlowNode({
    data,
    selected,
    isConnectable,
}: {
    data: FlowNodeData;
    selected?: boolean;
    isConnectable?: boolean;
}) {
    const def = getNodeDef(data.type);
    const color = def?.color ?? "#6b7280";
    const Icon = def?.icon;
    const isTrigger = data.type === "trigger";
    const summary = getNodeSummary(data.type, data.config);
    return (
        <div
            className="min-w-[180px] rounded-xl border-2 bg-white shadow-lg transition-all"
            style={{
                borderColor: color,
                boxShadow: selected ? `0 0 0 3px ${color}33` : undefined,
            }}
        >
            {!isTrigger && (
                <Handle
                    type="target"
                    position={Position.Top}
                    isConnectable={isConnectable}
                    className="!h-3.5 !w-3.5 !rounded-full !border-2 !border-white"
                    style={{ background: color }}
                />
            )}
            <div className="flex items-center gap-2 rounded-t-lg px-3 py-2" style={{ backgroundColor: `${color}1f` }}>
                {Icon && <Icon className="h-3.5 w-3.5" style={{ color }} />}
                <span className="text-xs font-semibold text-gray-700">{data.label || def?.label || data.type}</span>
            </div>
            <div className="px-3 pb-2 pt-1">
                <p className="text-[10px] uppercase tracking-wide text-gray-500">{data.type.replace(/_/g, " ")}</p>
                {summary && <p className="mt-0.5 truncate text-[10px] italic text-gray-400">{summary}</p>}
            </div>
            <Handle
                type="source"
                position={Position.Bottom}
                isConnectable={isConnectable}
                className="!h-3.5 !w-3.5 !rounded-full !border-2 !border-white"
                style={{ background: color }}
            />
        </div>
    );
}

const nodeTypes = { custom: AutomationFlowNode };

function AutomationEditorInner() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const qc = useQueryClient();
    const isNew = id === "new";

    const wrapperRef = useRef<HTMLDivElement>(null);
    const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

    const [name, setName] = useState("Nova Automação");
    const [triggerType, setTriggerType] = useState("CONTACT_CREATED");
    const [isActive, setIsActive] = useState(false);
    const [logsOpen, setLogsOpen] = useState(false);
    const [simulatorOpen, setSimulatorOpen] = useState(false);

    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const { data: automation } = useAutomation(isNew ? undefined : id);
    const save = useSaveAutomation(isNew ? undefined : id);
    const test = useTestAutomation(isNew ? undefined : (id ?? ""));
    const toggle = useToggleAutomation();

    useEffect(() => {
        if (!automation) return;
        setName(automation.name);
        setTriggerType(automation.triggerType);
        setIsActive(automation.isActive);
        setNodes(
            (automation.nodes ?? []).map((n: AutomationNodeData) => ({
                id: n.id,
                type: "custom",
                position: n.position ?? { x: 100, y: 100 },
                data: { label: n.label ?? getNodeDef(n.type)?.label ?? n.type, type: n.type, config: n.config ?? {} },
            })),
        );
        setEdges(
            (automation.edges ?? []).map((e: AutomationEdgeData) => ({
                id: `${e.from}-${e.to}-${e.condition ?? ""}`,
                source: e.from,
                target: e.to,
                label: e.condition ?? undefined,
                markerEnd: { type: MarkerType.ArrowClosed },
            })),
        );
    }, [automation, setNodes, setEdges]);

    useEffect(() => {
        if (isNew && nodes.length === 0) {
            setNodes([{
                id: "trigger",
                type: "custom",
                position: { x: 240, y: 200 },
                data: { label: "Gatilho", type: "trigger", config: { triggerType: "CONTACT_CREATED" } },
            }]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isNew]);

    const onConnect = useCallback((params: Connection) => {
        const sourceNode = nodes.find(n => n.id === params.source);
        const sourceType = (sourceNode?.data as FlowNodeData | undefined)?.type;
        let label: string | undefined;
        if (sourceType === "condition") {
            const existing = edges.filter(e => e.source === params.source);
            label = existing.length === 0 ? "true" : "false";
        } else if (sourceType === "ab_test") {
            const existing = edges.filter(e => e.source === params.source);
            label = existing.length === 0 ? "A" : "B";
        }
        setEdges(eds => addEdge({
            ...params,
            markerEnd: { type: MarkerType.ArrowClosed },
            label,
            style: { strokeWidth: 2, stroke: "#8b5cf6" },
        }, eds));
    }, [setEdges, nodes, edges]);

    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
    }, []);

    const addNodeAtPosition = useCallback((def: NodeDef, position: { x: number; y: number }) => {
        const newId = `node_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const newNode: Node = {
            id: newId,
            type: "custom",
            position,
            data: { label: def.label, type: def.type, config: def.type === "trigger" ? { triggerType } : {} },
        };
        setNodes(nds => [...nds, newNode]);
        setSelectedId(newId);
    }, [setNodes, triggerType]);

    const onDrop = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        const kind = event.dataTransfer.getData("application/x-automation-node");
        if (!kind || !rfInstance) return;
        const def = NODE_CATALOG.find(d => d.type === kind);
        if (!def) return;
        const position = rfInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
        addNodeAtPosition(def, position);
    }, [rfInstance, addNodeAtPosition]);

    const onAddViaDoubleClick = useCallback((def: NodeDef) => {
        const center = rfInstance?.screenToFlowPosition({
            x: (wrapperRef.current?.clientWidth ?? 600) / 2,
            y: (wrapperRef.current?.clientHeight ?? 400) / 2,
        }) ?? { x: 200, y: 200 };
        addNodeAtPosition(def, center);
    }, [rfInstance, addNodeAtPosition]);

    const selectedNode = useMemo(
        () => (nodes.find(n => n.id === selectedId) as Node<FlowNodeData> | undefined) ?? null,
        [nodes, selectedId],
    );

    const updateNode = useCallback((nodeId: string, patch: { label?: string; config?: Record<string, unknown> }) => {
        setNodes(nds => nds.map(n => {
            if (n.id !== nodeId) return n;
            const data = n.data as FlowNodeData;
            const nextData: FlowNodeData = {
                ...data,
                ...(patch.label !== undefined ? { label: patch.label } : {}),
                ...(patch.config !== undefined ? { config: patch.config } : {}),
            };
            if (data.type === "trigger" && patch.config && typeof patch.config.triggerType === "string") {
                setTriggerType(patch.config.triggerType as string);
            }
            return { ...n, data: nextData };
        }));
    }, [setNodes]);

    const deleteNode = useCallback((nodeId: string) => {
        setNodes(nds => nds.filter(n => n.id !== nodeId));
        setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
        setSelectedId(null);
    }, [setNodes, setEdges]);

    const buildSavePayload = useCallback(() => {
        const flowNodes: AutomationNodeData[] = nodes.map(n => {
            const d = n.data as FlowNodeData;
            return { id: n.id, type: d.type, label: d.label, config: d.config ?? {}, position: n.position };
        });
        const flowEdges: AutomationEdgeData[] = edges.map(e => ({
            from: e.source,
            to: e.target,
            condition: (typeof e.label === "string" ? e.label : null) || null,
        }));
        const triggerNode = nodes.find(n => (n.data as FlowNodeData).type === "trigger");
        const triggerConfig = (triggerNode?.data as FlowNodeData | undefined)?.config ?? {};
        return { name, triggerType, triggerConfig, nodes: flowNodes, edges: flowEdges, isActive };
    }, [nodes, edges, name, triggerType, isActive]);

    const handleSave = useCallback(async () => {
        try {
            const payload = buildSavePayload();
            const res = await save.mutateAsync(payload);
            toast.success("Automação salva");
            qc.invalidateQueries({ queryKey: ["automations"] });
            if (isNew && (res as { id?: string })?.id) {
                router.replace(`/automations/${(res as { id: string }).id}`);
            }
        } catch (err) {
            console.error(err);
            toast.error("Erro ao salvar");
        }
    }, [buildSavePayload, save, qc, isNew, router]);

    const handleTest = useCallback(async () => {
        if (isNew) return toast.error("Salve a automação antes de testar");
        try {
            await test.mutateAsync({});
            toast.success("Teste executado");
        } catch {
            toast.error("Erro no teste");
        }
    }, [test, isNew]);

    const handleToggle = useCallback(async (next: boolean) => {
        if (isNew) {
            setIsActive(next);
            return;
        }
        try {
            await toggle.mutateAsync(id!);
            setIsActive(next);
        } catch {
            toast.error("Erro ao alternar status");
        }
    }, [toggle, isNew, id]);

    const stats = useMemo(() => ({ nodes: nodes.length, edges: edges.length }), [nodes.length, edges.length]);

    return (
        <div className="flex h-screen flex-col bg-bg">
            <header className="flex items-center gap-3 border-b border-[var(--rim)] bg-surface px-4 py-2.5">
                <Button variant="ghost" size="icon" onClick={() => router.push("/automations")}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <Input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="h-8 w-72 text-sm font-medium"
                    placeholder="Nome da automação"
                />
                <div className="flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-violet" />
                    <Select value={triggerType} onValueChange={v => {
                        setTriggerType(v);
                        setNodes(nds => nds.map(n => {
                            if ((n.data as FlowNodeData).type !== "trigger") return n;
                            const d = n.data as FlowNodeData;
                            return { ...n, data: { ...d, config: { ...(d.config ?? {}), triggerType: v } } };
                        }));
                    }}>
                        <SelectTrigger className="h-7 w-48 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent className="max-h-72">
                            {Object.entries(TRIGGER_LABELS).map(([k, label]) => (
                                <SelectItem key={k} value={k}>{label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <Badge variant="outline" className="text-[10px] text-t3">
                    {stats.nodes} nós · {stats.edges} conexões
                </Badge>

                <div className="flex-1" />

                <div className="flex items-center gap-2">
                    <Switch checked={isActive} onCheckedChange={handleToggle} disabled={isNew} />
                    <span className="text-xs text-t2">{isActive ? "Ativa" : "Inativa"}</span>
                </div>

                {!isNew && (
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setLogsOpen(true)}>
                        <History className="h-3.5 w-3.5" /> Histórico
                    </Button>
                )}
                {!isNew && (
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={handleTest} disabled={test.isPending}>
                        {test.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                        Testar
                    </Button>
                )}
                <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setSimulatorOpen(true)}
                    title="Replay desta regra contra o histórico recente, sem executar nenhuma ação"
                >
                    <TestTube2 className="h-3.5 w-3.5" />
                    Simular
                </Button>
                <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={save.isPending}>
                    {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Salvar
                </Button>
            </header>

            <div className="flex min-h-0 flex-1">
                <NodeLibrary onAddNode={onAddViaDoubleClick} />

                <div ref={wrapperRef} className="relative min-w-0 flex-1" onDragOver={onDragOver} onDrop={onDrop}>
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onInit={setRfInstance}
                        onNodeClick={(_e, n) => setSelectedId(n.id)}
                        onPaneClick={() => setSelectedId(null)}
                        nodeTypes={nodeTypes}
                        fitView
                        defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeWidth: 2, stroke: "#8b5cf6" } }}
                        connectionLineStyle={{ strokeWidth: 2, stroke: "#8b5cf6" }}
                        deleteKeyCode="Backspace"
                        proOptions={{ hideAttribution: true }}
                    >
                        <Background />
                        <Controls />
                        <MiniMap pannable zoomable className="!bg-surface" />
                        <Panel position="top-left" className="rounded-lg border border-[var(--rim)] bg-surface px-3 py-2 text-xs text-t3">
                            <Zap className="mr-1.5 inline h-3 w-3 text-violet" />
                            Arraste nós da esquerda · Conecte arrastando entre os pontos · Backspace remove
                        </Panel>
                    </ReactFlow>
                </div>

                <PropertiesPanel
                    node={selectedNode}
                    onChange={updateNode}
                    onDelete={deleteNode}
                    onClose={() => setSelectedId(null)}
                />
            </div>

            <LogsDrawer automationId={isNew ? undefined : id} open={logsOpen} onOpenChange={setLogsOpen} />

            <SimulatorModal
                open={simulatorOpen}
                onOpenChange={setSimulatorOpen}
                input={
                    simulatorOpen
                        ? ({
                              triggerType,
                              triggerConfig: (nodes.find(n => (n.data as FlowNodeData).type === "trigger")
                                  ?.data as FlowNodeData | undefined)?.config,
                              // The visual editor doesn't currently surface a separate
                              // conditions list at the automation level — that lives
                              // inside specific nodes. For now we simulate trigger-only;
                              // node-level conditions get evaluated in the actual run.
                              conditions: [],
                          } satisfies SimulateInput)
                        : null
                }
            />
        </div>
    );
}

export default function AutomationBuilderPage() {
    void useReactFlow;
    return (
        <ReactFlowProvider>
            <AutomationEditorInner />
        </ReactFlowProvider>
    );
}
