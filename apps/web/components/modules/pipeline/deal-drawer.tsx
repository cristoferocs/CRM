"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    Phone,
    Mail,
    Bot,
    ExternalLink,
    ChevronRight,
    Loader2,
    User,
    Clock,
    AlertCircle,
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { TagAutocomplete, type TagOption } from "@/components/ui/tag-autocomplete";
import { useTags, useCreateTag } from "@/hooks/useTags";
import { api } from "@/lib/api";
import { cn, formatCurrency, formatRelative, getInitials } from "@/lib/utils";
import {
    useDeal,
    useDealMovements,
    useDealAgentSessions,
    useUpdateDeal,
} from "@/hooks/usePipeline";
import type { PipelineDeal, DealMovement, AgentSession } from "@/hooks/usePipeline";
import { DealForecastCard } from "@/components/modules/pipeline/deal-forecast-card";
import { HandoffTimeline } from "@/components/modules/agents/handoff-timeline";

// ── Helpers ────────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
    "from-violet to-cyan",
    "from-cyan to-jade",
    "from-jade to-cyan",
    "from-rose to-amber",
    "from-amber to-violet",
];

function avatarColor(str: string) {
    let hash = 0;
    for (const c of str) hash = hash * 31 + c.charCodeAt(0);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] as string;
}

const MOVED_BY_COLORS: Record<DealMovement["movedBy"], string> = {
    HUMAN: "cyan",
    AGENT: "default",
    AUTOMATION: "jade",
    SYSTEM: "muted",
};

const MOVED_BY_LABELS: Record<DealMovement["movedBy"], string> = {
    HUMAN: "Humano",
    AGENT: "Agente",
    AUTOMATION: "Automação",
    SYSTEM: "Sistema",
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function MovementTimeline({ movements }: { movements: DealMovement[] }) {
    if (!movements.length) {
        return <p className="py-8 text-center text-xs text-t3">Sem histórico de movimentos.</p>;
    }
    return (
        <div className="relative space-y-0 pl-5">
            <div className="absolute left-2 top-0 h-full w-px bg-surface-3" />
            {movements.map((m) => (
                <div key={m.id} className="relative pb-5">
                    <span className="absolute -left-[13px] mt-0.5 h-2 w-2 rounded-full bg-violet ring-2 ring-surface" />
                    <div className="rounded-[10px] border border-[var(--rim)] bg-surface-2 p-3">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                            <span className="text-xs font-medium text-t1">
                                {m.fromStageName ?? "Início"} → {m.toStageName}
                            </span>
                            <Badge variant={MOVED_BY_COLORS[m.movedBy] as any}>
                                {MOVED_BY_LABELS[m.movedBy]}
                            </Badge>
                        </div>
                        {m.reason && (
                            <p className="mb-1 text-xs text-t2">{m.reason}</p>
                        )}
                        <div className="flex items-center gap-3">
                            {m.daysInPreviousStage != null && (
                                <span className="font-mono text-[10px] text-t3">
                                    {m.daysInPreviousStage}d na etapa anterior
                                </span>
                            )}
                            <span className="font-mono text-[10px] text-t3">
                                {format(new Date(m.createdAt), "dd/MM/yy HH:mm", { locale: ptBR })}
                            </span>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

function AgentSessionCard({ session }: { session: AgentSession }) {
    const STATUS_COLOR: Record<string, string> = {
        ACTIVE: "jade",
        PAUSED: "amber",
        COMPLETED: "muted",
        FAILED: "rose",
    };
    return (
        <div className="rounded-[12px] border border-violet/25 bg-violet/[0.05] p-4 space-y-3">
            <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                    {session.agent.avatar && <AvatarImage src={session.agent.avatar} />}
                    <AvatarFallback className="bg-violet/20 text-xs text-violet">
                        {getInitials(session.agent.name, 2)}
                    </AvatarFallback>
                </Avatar>
                <div>
                    <p className="text-sm font-medium text-t1">{session.agent.name}</p>
                    <div className="flex items-center gap-2">
                        <Badge variant={STATUS_COLOR[session.status] as any}>{session.status}</Badge>
                        <span className="font-mono text-[10px] text-t3">{session.turnCount} turnos</span>
                    </div>
                </div>
            </div>
            {session.intent && (
                <div>
                    <p className="mb-0.5 text-[10px] text-t3">Intenção detectada</p>
                    <div className="flex items-center gap-2">
                        <p className="text-xs text-t1">{session.intent}</p>
                        {session.intentConfidence != null && (
                            <span className="font-mono text-[10px] text-jade">
                                {Math.round(session.intentConfidence * 100)}%
                            </span>
                        )}
                    </div>
                </div>
            )}
            {Object.keys(session.collectedData).length > 0 && (
                <div>
                    <p className="mb-1 text-[10px] text-t3">Dados coletados</p>
                    <pre className="overflow-auto rounded-[8px] bg-surface-3 p-2 font-mono text-[10px] text-t2 max-h-32">
                        {JSON.stringify(session.collectedData, null, 2)}
                    </pre>
                </div>
            )}
            {Array.isArray(session.pendingQuestions) && session.pendingQuestions.length > 0 && (
                <div>
                    <p className="mb-1 text-[10px] text-t3">Perguntas pendentes</p>
                    <ul className="space-y-0.5">
                        {(session.pendingQuestions as string[]).map((q, i) => (
                            <li key={i} className="flex gap-1.5 text-xs text-amber">
                                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                                {q}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-t3">
                    Iniciado {formatRelative(session.startedAt)}
                </span>
                <Button size="sm" variant="outline" className="h-7 text-xs">
                    Assumir conversa
                </Button>
            </div>
        </div>
    );
}

// ── Main drawer ────────────────────────────────────────────────────────────────

interface DealDrawerProps {
    deal: PipelineDeal | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onOpenInbox?: (conversationId: string) => void;
}

export function DealDrawer({ deal, open, onOpenChange, onOpenInbox }: DealDrawerProps) {
    const [activeTab, setActiveTab] = useState("overview");

    const dealId = deal?.id ?? "";

    const { data: fullDeal, isLoading: loadingDeal } = useDeal(dealId);
    const { data: movements = [], isLoading: loadingMovements } = useDealMovements(dealId);
    const { data: sessions = [], isLoading: loadingSessions } = useDealAgentSessions(dealId);
    const updateDeal = useUpdateDeal(dealId);

    // Tags state — initialized from the deal once it loads and kept in sync
    // with optimistic updates.
    const [tagSearch, setTagSearch] = useState("");
    const { data: tagOptions = [] } = useTags({ search: tagSearch, limit: 50 });
    const createTag = useCreateTag();
    const dealTags: TagOption[] = ((fullDeal as { tags?: { id: string; name: string; color: string }[] } | undefined)?.tags
        ?? (deal as { tags?: { id: string; name: string; color: string }[] } | undefined)?.tags
        ?? []) as TagOption[];

    const persistTags = async (next: TagOption[]) => {
        try {
            await updateDeal.mutateAsync({ tagIds: next.map((t) => t.id) });
        } catch {
            toast.error("Erro ao atualizar tags");
        }
    };

    const { data: conversations = [], isLoading: loadingConversations } = useQuery({
        queryKey: ["inbox", "conversations", deal?.contactId],
        queryFn: async () => {
            const { data } = await api.get(
                `/inbox/conversations?contactId=${deal!.contactId}&limit=20`,
            );
            return data as {
                id: string;
                title: string | null;
                status: string;
                lastMessageAt: string | null;
                assignedTo: { name: string } | null;
            }[];
        },
        enabled: !!deal?.contactId && activeTab === "conversations",
    });

    const displayDeal = fullDeal ?? deal;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="flex w-[600px] max-w-full flex-col gap-0 overflow-hidden p-0">
                {!displayDeal ? (
                    <div className="flex flex-1 items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-t3" />
                    </div>
                ) : (
                    <>
                        {/* Header */}
                        <SheetHeader className="shrink-0 border-b border-[var(--rim)] px-6 py-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <SheetTitle className="truncate text-base font-semibold text-t1">
                                        {displayDeal.title}
                                    </SheetTitle>
                                    <div className="mt-1 flex flex-wrap items-center gap-2">
                                        {displayDeal.value != null && (
                                            <span className="font-mono text-sm text-jade">
                                                {formatCurrency(displayDeal.value)}
                                            </span>
                                        )}
                                        {displayDeal.stage && (
                                            <div className="flex items-center gap-1.5">
                                                <span
                                                    className="h-1.5 w-1.5 rounded-full"
                                                    style={{ backgroundColor: displayDeal.stage.color }}
                                                />
                                                <span className="text-xs text-t2">{displayDeal.stage.name}</span>
                                            </div>
                                        )}
                                        {displayDeal.isRotting && (
                                            <Badge variant="amber">Parado {displayDeal.rottingDays}d</Badge>
                                        )}
                                        {displayDeal.activeAgentSessionId && (
                                            <Badge variant="default">
                                                <Bot className="mr-1 h-3 w-3" />
                                                Agente ativo
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </SheetHeader>

                        {/* Tabs */}
                        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
                            <TabsList className="shrink-0 border-b border-[var(--rim)] bg-transparent px-6 justify-start rounded-none h-10">
                                {[
                                    { id: "overview", label: "Visão Geral" },
                                    { id: "activities", label: "Atividades" },
                                    { id: "conversations", label: "Conversas" },
                                    { id: "agent", label: "Agente" },
                                    { id: "history", label: "Histórico" },
                                ].map((t) => (
                                    <TabsTrigger
                                        key={t.id}
                                        value={t.id}
                                        className="h-full rounded-none border-b-2 border-transparent px-3 text-xs data-[state=active]:border-violet data-[state=active]:text-t1 data-[state=inactive]:text-t3"
                                    >
                                        {t.label}
                                    </TabsTrigger>
                                ))}
                            </TabsList>

                            <div className="min-h-0 flex-1 overflow-y-auto">
                                {/* ── OVERVIEW ─────────────────────────────── */}
                                <TabsContent value="overview" className="mt-0 p-6 space-y-5">
                                    {/* Explainable forecast — server-computed
                                        per-deal probability with the named
                                        factors driving it. */}
                                    {dealId && <DealForecastCard dealId={dealId} />}

                                    {/* Probability row */}
                                    <div className="grid grid-cols-2 gap-3">
                                        {[
                                            {
                                                label: "Probabilidade manual",
                                                value: displayDeal.probability,
                                                color: "bg-jade",
                                            },
                                            {
                                                label: "Probabilidade IA",
                                                value: displayDeal.aiProbability,
                                                color: "bg-violet",
                                            },
                                        ].map((item) => (
                                            <div key={item.label} className="rounded-[10px] border border-[var(--rim)] bg-surface-2 p-3">
                                                <p className="mb-2 text-[10px] text-t3">{item.label}</p>
                                                {item.value != null ? (
                                                    <>
                                                        <p className="mb-1.5 font-mono text-lg font-semibold text-t1">
                                                            {item.value}%
                                                        </p>
                                                        <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                                                            <div
                                                                className={cn("h-full rounded-full transition-all", item.color)}
                                                                style={{ width: `${item.value}%` }}
                                                            />
                                                        </div>
                                                    </>
                                                ) : (
                                                    <p className="font-mono text-sm text-t3">—</p>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Contact card */}
                                    {displayDeal.contact && (
                                        <div className="rounded-[12px] border border-[var(--rim)] bg-surface-2 p-4">
                                            <p className="mb-3 text-[10px] font-medium uppercase tracking-wider text-t3">
                                                Contato
                                            </p>
                                            <div className="flex items-center gap-3">
                                                <Avatar className="h-10 w-10">
                                                    {displayDeal.contact.avatar && (
                                                        <AvatarImage src={displayDeal.contact.avatar} />
                                                    )}
                                                    <AvatarFallback
                                                        className={cn(
                                                            "text-sm font-bold bg-gradient-to-br",
                                                            avatarColor(displayDeal.contact.id),
                                                        )}
                                                    >
                                                        {getInitials(displayDeal.contact.name, 2)}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <p className="font-medium text-t1">
                                                        {displayDeal.contact.name}
                                                    </p>
                                                    <div className="mt-1 flex items-center gap-3">
                                                        {displayDeal.contact.phone && (
                                                            <span className="flex items-center gap-1 font-mono text-[11px] text-t2">
                                                                <Phone className="h-3 w-3" />
                                                                {displayDeal.contact.phone}
                                                            </span>
                                                        )}
                                                        {displayDeal.contact.email && (
                                                            <span className="flex items-center gap-1 font-mono text-[11px] text-t2">
                                                                <Mail className="h-3 w-3" />
                                                                {displayDeal.contact.email}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Tags */}
                                    <div>
                                        <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-t3">
                                            Tags
                                        </p>
                                        <TagAutocomplete
                                            value={dealTags}
                                            options={tagOptions}
                                            onChange={persistTags}
                                            onSearchChange={setTagSearch}
                                            onCreate={async (name) => {
                                                const created = await createTag.mutateAsync({ name });
                                                return { id: created.id, name: created.name, color: created.color };
                                            }}
                                            placeholder="Adicionar tag..."
                                            loading={updateDeal.isPending}
                                        />
                                    </div>

                                    {/* Custom fields */}
                                    {displayDeal.customFields &&
                                        Object.keys(displayDeal.customFields).length > 0 && (
                                            <div>
                                                <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-t3">
                                                    Campos personalizados
                                                </p>
                                                <div className="rounded-[10px] border border-[var(--rim)] divide-y divide-[var(--rim)]">
                                                    {Object.entries(displayDeal.customFields).map(([k, v]) => (
                                                        <div key={k} className="flex items-center justify-between px-3 py-2">
                                                            <span className="text-xs text-t3">{k}</span>
                                                            <span className="font-mono text-xs text-t1">
                                                                {String(v)}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                    {/* Mini movement timeline */}
                                    {loadingDeal ? (
                                        <Skeleton className="h-20 rounded-[10px]" />
                                    ) : (
                                        movements.slice(0, 3).length > 0 && (
                                            <div>
                                                <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-t3">
                                                    Últimas movimentações
                                                </p>
                                                <MovementTimeline movements={movements.slice(0, 3)} />
                                            </div>
                                        )
                                    )}
                                </TabsContent>

                                {/* ── ACTIVITIES ───────────────────────────── */}
                                <TabsContent value="activities" className="mt-0 p-6">
                                    {loadingDeal ? (
                                        <div className="space-y-3">
                                            {[...Array(3)].map((_, i) => (
                                                <Skeleton key={i} className="h-16 rounded-[10px]" />
                                            ))}
                                        </div>
                                    ) : (fullDeal as any)?.activities?.length ? (
                                        <div className="space-y-3">
                                            {((fullDeal as any).activities as any[]).map((act: any) => (
                                                <div
                                                    key={act.id}
                                                    className="rounded-[10px] border border-[var(--rim)] bg-surface-2 p-3"
                                                >
                                                    <div className="mb-1 flex items-start justify-between">
                                                        <p className="text-xs font-medium text-t1">{act.title}</p>
                                                        <span className="ml-2 shrink-0 rounded-[20px] bg-surface-3 px-1.5 py-px font-mono text-[9px] text-t3">
                                                            {act.type}
                                                        </span>
                                                    </div>
                                                    {act.description && (
                                                        <p className="text-xs text-t2">{act.description}</p>
                                                    )}
                                                    <p className="mt-1 font-mono text-[10px] text-t3">
                                                        {formatRelative(act.createdAt)}
                                                        {act.user && ` · ${act.user.name}`}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="py-12 text-center text-xs text-t3">Sem atividades registradas.</p>
                                    )}
                                </TabsContent>

                                {/* ── CONVERSATIONS ────────────────────────── */}
                                <TabsContent value="conversations" className="mt-0 p-6">
                                    {loadingConversations ? (
                                        <div className="space-y-3">
                                            {[...Array(3)].map((_, i) => (
                                                <Skeleton key={i} className="h-14 rounded-[10px]" />
                                            ))}
                                        </div>
                                    ) : conversations.length ? (
                                        <div className="space-y-2">
                                            {conversations.map((conv) => (
                                                <div
                                                    key={conv.id}
                                                    className="flex cursor-pointer items-center gap-3 rounded-[10px] border border-[var(--rim)] bg-surface-2 p-3 transition-colors hover:bg-surface-3"
                                                    onClick={() => onOpenInbox?.(conv.id)}
                                                >
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-xs font-medium text-t1">
                                                            {conv.title ?? "Conversa"}
                                                        </p>
                                                        <div className="mt-0.5 flex items-center gap-2">
                                                            <Badge
                                                                variant={
                                                                    conv.status === "OPEN"
                                                                        ? "jade"
                                                                        : conv.status === "PENDING"
                                                                            ? "amber"
                                                                            : "muted"
                                                                }
                                                            >
                                                                {conv.status}
                                                            </Badge>
                                                            {conv.lastMessageAt && (
                                                                <span className="font-mono text-[10px] text-t3">
                                                                    {formatRelative(conv.lastMessageAt)}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-t3" />
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="py-12 text-center text-xs text-t3">
                                            {deal?.contactId
                                                ? "Sem conversas para este contato."
                                                : "Este deal não tem contato vinculado."}
                                        </p>
                                    )}
                                </TabsContent>

                                {/* ── AGENT ────────────────────────────────── */}
                                <TabsContent value="agent" className="mt-0 p-6">
                                    {/* Cross-session flow visualization: which agents
                                        (and final human) handled this deal, in order. */}
                                    {dealId && <HandoffTimeline dealId={dealId} />}

                                    {loadingSessions ? (
                                        <Skeleton className="mt-4 h-40 rounded-[12px]" />
                                    ) : sessions.length ? (
                                        <div className="mt-4 space-y-4">
                                            {sessions.map((s) => (
                                                <AgentSessionCard key={s.id} session={s} />
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="space-y-4 py-4">
                                            <p className="text-center text-xs text-t3">
                                                Nenhum agente ativo neste deal.
                                            </p>
                                            <div className="flex justify-center">
                                                <Button variant="outline" size="sm" className="gap-2">
                                                    <Bot className="h-3.5 w-3.5" />
                                                    Ativar agente
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </TabsContent>

                                {/* ── HISTORY ──────────────────────────────── */}
                                <TabsContent value="history" className="mt-0 p-6">
                                    {loadingMovements ? (
                                        <div className="space-y-3">
                                            {[...Array(4)].map((_, i) => (
                                                <Skeleton key={i} className="h-20 rounded-[10px]" />
                                            ))}
                                        </div>
                                    ) : (
                                        <MovementTimeline movements={movements} />
                                    )}
                                </TabsContent>
                            </div>
                        </Tabs>
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
}
