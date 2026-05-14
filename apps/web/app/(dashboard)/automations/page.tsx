"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
    Plus,
    Search,
    Zap,
    Play,
    Pause,
    Copy,
    Trash2,
    ChevronRight,
    BarChart2,
    Clock,
    CheckCircle2,
    XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAutomationTemplates, useInstantiateTemplate, type AutomationTemplate } from "@/hooks/useAutomations";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const TRIGGER_LABELS: Record<string, string> = {
    CONTACT_CREATED: "Contato criado",
    CONTACT_UPDATED: "Contato atualizado",
    CONTACT_TAG_ADDED: "Tag adicionada",
    DEAL_CREATED: "Deal criado",
    DEAL_STAGE_CHANGED: "Stage alterado",
    DEAL_WON: "Deal ganho",
    DEAL_LOST: "Deal perdido",
    DEAL_ROTTING: "Deal parado",
    MESSAGE_RECEIVED: "Mensagem recebida",
    CONVERSATION_OPENED: "Conversa aberta",
    CONVERSATION_RESOLVED: "Conversa resolvida",
    LEAD_SCORE_CHANGED: "Score de lead alterado",
    PAYMENT_RECEIVED: "Pagamento recebido",
    PAYMENT_OVERDUE: "Pagamento atrasado",
    TIME_DELAY: "Gatilho de tempo",
    WEBHOOK_RECEIVED: "Webhook recebido",
};

export default function AutomationsPage() {
    const qc = useQueryClient();
    const router = useRouter();
    const [search, setSearch] = useState("");
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [templatesOpen, setTemplatesOpen] = useState(false);
    const { data: templates = [], isLoading: tplLoading } = useAutomationTemplates();
    const instantiate = useInstantiateTemplate();

    const handleUseTemplate = async (tpl: AutomationTemplate) => {
        try {
            const created = await instantiate.mutateAsync(tpl);
            toast.success("Automação criada");
            setTemplatesOpen(false);
            router.push(`/automations/${created.id}`);
        } catch {
            toast.error("Erro ao criar automação");
        }
    };

    const { data: automations = [], isLoading } = useQuery({
        queryKey: ["automations"],
        queryFn: () => api.get("/automations").then(r => r.data),
    });

    const toggleMutation = useMutation({
        mutationFn: (id: string) => api.patch(`/automations/${id}/toggle`),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ["automations"] }); },
        onError: () => toast.error("Erro ao alternar automação"),
    });

    const duplicateMutation = useMutation({
        mutationFn: (id: string) => api.post(`/automations/${id}/duplicate`),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["automations"] });
            toast.success("Automação duplicada");
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => api.delete(`/automations/${id}`),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["automations"] });
            toast.success("Automação excluída");
            setDeleteId(null);
        },
    });

    const filtered = automations.filter((a: { name: string; triggerType: string }) =>
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        TRIGGER_LABELS[a.triggerType]?.toLowerCase().includes(search.toLowerCase()),
    );

    return (
        <div className="flex flex-col gap-6 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-t1">Automações</h1>
                    <p className="text-sm text-t3">Crie fluxos automáticos para o seu processo de vendas</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" className="gap-2" onClick={() => setTemplatesOpen(true)}>
                        <Zap className="h-4 w-4" />
                        Começar de template
                    </Button>
                    <Link href="/automations/new">
                        <Button className="gap-2">
                            <Plus className="h-4 w-4" />
                            Nova Automação
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Search */}
            <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-t3" />
                <Input
                    placeholder="Buscar automações..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-9"
                />
            </div>

            {/* List */}
            {isLoading ? (
                <div className="flex flex-col gap-3">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="h-20 rounded-xl border border-[var(--rim)] bg-surface animate-pulse" />
                    ))}
                </div>
            ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-[var(--rim)] py-16">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet/10">
                        <Zap className="h-7 w-7 text-violet" />
                    </div>
                    <div className="text-center">
                        <p className="font-medium text-t1">Nenhuma automação encontrada</p>
                        <p className="text-sm text-t3">Crie sua primeira automação para começar</p>
                    </div>
                    <Link href="/automations/new">
                        <Button size="sm" className="gap-2">
                            <Plus className="h-4 w-4" /> Criar Automação
                        </Button>
                    </Link>
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    {filtered.map((automation: {
                        id: string; name: string; description?: string; triggerType: string;
                        isActive: boolean; executionCount: number; successCount: number; failureCount: number;
                        lastExecutedAt?: string; _count?: { logs: number };
                    }) => (
                        <div key={automation.id} className="group flex items-center gap-4 rounded-xl border border-[var(--rim)] bg-surface px-5 py-4 transition-all hover:border-violet/30 hover:shadow-md">
                            {/* Icon */}
                            <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", automation.isActive ? "bg-violet/10" : "bg-surface2")}>
                                <Zap className={cn("h-5 w-5", automation.isActive ? "text-violet" : "text-t3")} />
                            </div>

                            {/* Info */}
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <p className="font-semibold text-t1 truncate">{automation.name}</p>
                                    <Badge variant="outline" className="shrink-0 text-[11px]">
                                        {TRIGGER_LABELS[automation.triggerType] ?? automation.triggerType}
                                    </Badge>
                                </div>
                                {automation.description && (
                                    <p className="text-sm text-t3 truncate mt-0.5">{automation.description}</p>
                                )}
                                <div className="mt-1.5 flex items-center gap-4 text-xs text-t3">
                                    <span className="flex items-center gap-1">
                                        <BarChart2 className="h-3 w-3" />
                                        {automation.executionCount} execuções
                                    </span>
                                    {automation.executionCount > 0 && (
                                        <>
                                            <span className="flex items-center gap-1 text-green-500">
                                                <CheckCircle2 className="h-3 w-3" />
                                                {automation.successCount} ok
                                            </span>
                                            {automation.failureCount > 0 && (
                                                <span className="flex items-center gap-1 text-red-400">
                                                    <XCircle className="h-3 w-3" />
                                                    {automation.failureCount} erros
                                                </span>
                                            )}
                                        </>
                                    )}
                                    {automation.lastExecutedAt && (
                                        <span className="flex items-center gap-1">
                                            <Clock className="h-3 w-3" />
                                            {new Date(automation.lastExecutedAt).toLocaleDateString("pt-BR")}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2">
                                <Switch
                                    checked={automation.isActive}
                                    onCheckedChange={() => toggleMutation.mutate(automation.id)}
                                    aria-label="Toggle automation"
                                />
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button variant="ghost" size="icon" className="h-8 w-8"
                                        onClick={() => duplicateMutation.mutate(automation.id)}
                                        title="Duplicar">
                                        <Copy className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-500"
                                        onClick={() => setDeleteId(automation.id)}
                                        title="Excluir">
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                                <Link href={`/automations/${automation.id}`}>
                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Template gallery */}
            <Dialog open={templatesOpen} onOpenChange={setTemplatesOpen}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Galeria de templates</DialogTitle>
                        <DialogDescription>Comece rápido a partir de um modelo pronto.</DialogDescription>
                    </DialogHeader>
                    <div className="mt-4 grid max-h-[60vh] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
                        {tplLoading && [0, 1, 2, 3].map(i => (
                            <div key={i} className="h-24 animate-pulse rounded-lg border border-[var(--rim)] bg-surface" />
                        ))}
                        {!tplLoading && templates.length === 0 && (
                            <p className="col-span-full rounded-lg border border-dashed border-[var(--rim)] px-4 py-10 text-center text-xs text-t3">
                                Nenhum template disponível.
                            </p>
                        )}
                        {templates.map(tpl => (
                            <button
                                key={tpl.id}
                                type="button"
                                disabled={instantiate.isPending}
                                onClick={() => handleUseTemplate(tpl)}
                                className="flex flex-col items-start gap-2 rounded-lg border border-[var(--rim)] bg-surface p-4 text-left transition hover:border-violet/40 hover:shadow-md disabled:opacity-50"
                            >
                                <div className="flex items-center gap-2">
                                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet/10">
                                        <Zap className="h-4 w-4 text-violet" />
                                    </div>
                                    {tpl.category && <Badge variant="outline" className="text-[10px]">{tpl.category}</Badge>}
                                </div>
                                <p className="text-sm font-semibold text-t1">{tpl.name}</p>
                                <p className="text-xs text-t3">{tpl.description}</p>
                                <span className="mt-1 text-[10px] text-t3">
                                    {TRIGGER_LABELS[tpl.triggerType] ?? tpl.triggerType} · {tpl.nodes.length} nós
                                </span>
                            </button>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Delete dialog */}
            <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir automação?</AlertDialogTitle>
                        <AlertDialogDescription>Esta ação não pode ser desfeita. Todos os logs serão removidos.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction className="bg-red-500 hover:bg-red-600"
                            onClick={() => deleteId && deleteMutation.mutate(deleteId)}>
                            Excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
