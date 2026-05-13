"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { X, ChevronRight } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FlowStage {
    id: string;
    name: string;
    description?: string;
    order: number;
    entryConditions?: string[];
    keyActions?: string[];
    questionsToAsk?: string[];
    dataToCollect?: string[];
    exitConditions?: string[];
    maxMessages?: number;
    handoffConditions?: string[];
}

interface AgentFlowDiagramProps {
    stages: FlowStage[];
    className?: string;
}

// ---------------------------------------------------------------------------
// Stage node rendering config
// ---------------------------------------------------------------------------

const getStageColor = (index: number, total: number): { fill: string; stroke: string; text: string } => {
    if (index === 0) return { fill: "rgba(0,212,255,0.10)", stroke: "rgba(0,212,255,0.5)", text: "#00d4ff" };
    if (index === total - 1) return { fill: "rgba(0,229,160,0.10)", stroke: "rgba(0,229,160,0.5)", text: "#00e5a0" };
    // Middle stages rotate between violet and amber
    const variants = [
        { fill: "rgba(124,92,252,0.10)", stroke: "rgba(124,92,252,0.5)", text: "#7c5cfc" },
        { fill: "rgba(255,181,71,0.08)", stroke: "rgba(255,181,71,0.4)", text: "#ffb547" },
    ];
    return variants[(index - 1) % variants.length]!;
};

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------

function StageDetail({ stage, onClose }: { stage: FlowStage; onClose: () => void }) {
    const Section = ({ label, items }: { label: string; items?: string[] }) => {
        if (!items?.length) return null;
        return (
            <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-t3 uppercase tracking-wider">{label}</p>
                <ul className="space-y-1">
                    {items.map((item, i) => (
                        <li key={i} className="text-xs text-t2 flex items-start gap-1.5">
                            <ChevronRight className="w-3 h-3 mt-0.5 text-t3 flex-shrink-0" />
                            {item}
                        </li>
                    ))}
                </ul>
            </div>
        );
    };

    return (
        <div className="absolute right-0 top-0 h-full w-72 bg-[var(--ds-surface2)] border-l border-[var(--rim)] overflow-y-auto z-10 animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between p-4 border-b border-[var(--rim)]">
                <p className="font-medium text-t1 text-sm">{stage.name}</p>
                <button onClick={onClose} className="text-t3 hover:text-t1">
                    <X className="w-4 h-4" />
                </button>
            </div>
            <div className="p-4 space-y-4">
                {stage.description && (
                    <p className="text-xs text-t3 leading-relaxed">{stage.description}</p>
                )}
                <Section label="Perguntas a fazer" items={stage.questionsToAsk} />
                <Section label="Dados a coletar" items={stage.dataToCollect} />
                <Section label="Ações-chave" items={stage.keyActions} />
                <Section label="Condições de saída" items={stage.exitConditions} />
                <Section label="Condições de handoff" items={stage.handoffConditions} />
                {stage.maxMessages != null && (
                    <div>
                        <p className="text-[11px] font-medium text-t3 uppercase tracking-wider">Máx. mensagens</p>
                        <p className="text-xs text-t2 mt-1">{stage.maxMessages}</p>
                    </div>
                )}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main diagram
// ---------------------------------------------------------------------------

const NODE_W = 160;
const NODE_H = 56;
const H_GAP = 80;
const COL_W = NODE_W + H_GAP;

export function AgentFlowDiagram({ stages, className }: AgentFlowDiagramProps) {
    const [selected, setSelected] = useState<FlowStage | null>(null);

    if (!stages.length) {
        return (
            <div className="flex items-center justify-center h-40 text-t3 text-sm">
                Nenhuma etapa definida
            </div>
        );
    }

    // Layout: 2 columns zig-zag for > 4 stages, otherwise single column
    const useZigzag = stages.length > 4;
    const sorted = [...stages].sort((a, b) => a.order - b.order);

    // Compute positions
    const positions: { x: number; y: number }[] = sorted.map((_, i) => {
        if (!useZigzag) {
            return { x: 60, y: 30 + i * (NODE_H + 40) };
        }
        const col = i % 2;
        const row = Math.floor(i / 2);
        return { x: 40 + col * COL_W, y: 30 + row * (NODE_H + 40) };
    });

    const svgWidth = useZigzag ? 40 + 2 * COL_W - H_GAP + 60 : NODE_W + 120;
    const svgHeight = (positions[positions.length - 1]?.y ?? 0) + NODE_H + 30;

    // Arrow midpoints
    const arrows: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
        const from = positions[i]!;
        const to = positions[i + 1]!;
        arrows.push({
            x1: from.x + NODE_W / 2,
            y1: from.y + NODE_H,
            x2: to.x + NODE_W / 2,
            y2: to.y,
        });
    }

    return (
        <div className={cn("relative overflow-hidden rounded-xl border border-[var(--rim)] bg-[var(--deep)]", className)}>
            <div className="overflow-auto">
                <svg
                    width={svgWidth}
                    height={svgHeight}
                    className="block mx-auto"
                    style={{ minWidth: svgWidth }}
                >
                    <defs>
                        <marker
                            id="arrowhead"
                            markerWidth="8"
                            markerHeight="8"
                            refX="6"
                            refY="3"
                            orient="auto"
                        >
                            <path d="M0,0 L0,6 L8,3 z" fill="rgba(255,255,255,0.12)" />
                        </marker>
                    </defs>

                    {/* Arrows */}
                    {arrows.map((a, i) => (
                        <line
                            key={i}
                            x1={a.x1}
                            y1={a.y1}
                            x2={a.x2}
                            y2={a.y2}
                            stroke="rgba(255,255,255,0.12)"
                            strokeWidth="1.5"
                            strokeDasharray="4 3"
                            markerEnd="url(#arrowhead)"
                        />
                    ))}

                    {/* Nodes */}
                    {sorted.map((stage, i) => {
                        const pos = positions[i]!;
                        const col = getStageColor(i, sorted.length);
                        const isSelected = selected?.id === stage.id;

                        return (
                            <g
                                key={stage.id}
                                style={{ cursor: "pointer", opacity: 0, animation: `fadeInNode 0.3s ease ${i * 0.07}s forwards` }}
                                onClick={() => setSelected(isSelected ? null : stage)}
                            >
                                <style>{`@keyframes fadeInNode { to { opacity: 1; } }`}</style>
                                <rect
                                    x={pos.x}
                                    y={pos.y}
                                    width={NODE_W}
                                    height={NODE_H}
                                    rx="10"
                                    ry="10"
                                    fill={col.fill}
                                    stroke={isSelected ? col.text : col.stroke}
                                    strokeWidth={isSelected ? 1.5 : 1}
                                />
                                {/* Stage number */}
                                <text
                                    x={pos.x + 14}
                                    y={pos.y + 22}
                                    fontSize="11"
                                    fill={col.text}
                                    fontFamily="JetBrains Mono, monospace"
                                    opacity="0.7"
                                >
                                    {String(i + 1).padStart(2, "0")}
                                </text>
                                {/* Stage name */}
                                <text
                                    x={pos.x + NODE_W / 2}
                                    y={pos.y + NODE_H / 2 + 2}
                                    fontSize="12"
                                    fill="#f0f0f8"
                                    textAnchor="middle"
                                    fontFamily="DM Sans, sans-serif"
                                    fontWeight="500"
                                >
                                    {stage.name.length > 18 ? stage.name.slice(0, 17) + "…" : stage.name}
                                </text>
                                {/* Data count badge */}
                                {(stage.dataToCollect?.length ?? 0) > 0 && (
                                    <text
                                        x={pos.x + NODE_W - 10}
                                        y={pos.y + NODE_H - 8}
                                        fontSize="9"
                                        fill={col.text}
                                        textAnchor="end"
                                        opacity="0.6"
                                    >
                                        {stage.dataToCollect!.length} dados
                                    </text>
                                )}
                            </g>
                        );
                    })}
                </svg>
            </div>

            {/* Detail panel */}
            {selected && (
                <StageDetail stage={selected} onClose={() => setSelected(null)} />
            )}
        </div>
    );
}
