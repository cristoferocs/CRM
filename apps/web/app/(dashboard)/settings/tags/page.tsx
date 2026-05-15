"use client";

import { useMemo, useState } from "react";
import { Plus, Search, Trash2, Loader2, Tag as TagIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ColorPicker } from "@/components/ui/color-picker";
import { TagChip } from "@/components/ui/tag-chip";
import { Label } from "@/components/ui/label";
import {
    useTags,
    useCreateTag,
    useUpdateTag,
    useDeleteTag,
    useTagUsage,
    type Tag,
} from "@/hooks/useTags";
import { usePermissions } from "@/hooks/usePermissions";

export default function TagsSettingsPage() {
    const [search, setSearch] = useState("");
    const [createOpen, setCreateOpen] = useState(false);
    const [toDelete, setToDelete] = useState<Tag | null>(null);
    const { data: tags, isLoading } = useTags({ search, limit: 200 });
    const { can, role } = usePermissions();
    // The backend's PATCH/DELETE require ADMIN; mirror that on the frontend so
    // sellers see disabled controls instead of failing requests.
    const isAdmin = role === "SUPER_ADMIN" || role === "ADMIN";

    const sortedTags = useMemo(
        () => [...(tags ?? [])].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
        [tags],
    );

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-end justify-between gap-4">
                <div>
                    <h1 className="font-display text-[28px] font-semibold leading-none tracking-[-0.8px] text-t1">
                        Tags
                    </h1>
                    <p className="mt-1.5 text-sm text-t2">
                        Gerencie etiquetas reutilizáveis para contatos e deals.
                    </p>
                </div>
                <Button onClick={() => setCreateOpen(true)} disabled={!can("settings", "update") && !isAdmin}>
                    <Plus className="h-4 w-4" /> Nova tag
                </Button>
            </div>

            <div className="relative max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-t3" />
                <Input
                    placeholder="Buscar tag..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                />
            </div>

            <Card>
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="space-y-3 p-4">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <Skeleton key={i} className="h-10 w-full" />
                            ))}
                        </div>
                    ) : sortedTags.length === 0 ? (
                        <div className="flex flex-col items-center gap-3 py-12 text-center">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-3 text-t3">
                                <TagIcon className="h-4 w-4" />
                            </div>
                            <p className="text-sm text-t2">Nenhuma tag criada ainda.</p>
                            <Button variant="outline" onClick={() => setCreateOpen(true)}>
                                <Plus className="h-4 w-4" /> Criar primeira tag
                            </Button>
                        </div>
                    ) : (
                        <ul className="divide-y divide-rim">
                            {sortedTags.map((tag) => (
                                <TagRow
                                    key={tag.id}
                                    tag={tag}
                                    isAdmin={isAdmin}
                                    onDelete={() => setToDelete(tag)}
                                />
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>

            <CreateTagDialog open={createOpen} onOpenChange={setCreateOpen} />
            <DeleteTagDialog
                tag={toDelete}
                onOpenChange={(open) => !open && setToDelete(null)}
            />
        </div>
    );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function TagRow({
    tag,
    isAdmin,
    onDelete,
}: {
    tag: Tag;
    isAdmin: boolean;
    onDelete: () => void;
}) {
    const update = useUpdateTag();
    const usage = useTagUsage(tag.id);
    const [editing, setEditing] = useState(false);
    const [draftName, setDraftName] = useState(tag.name);

    const commitName = async () => {
        const next = draftName.trim();
        setEditing(false);
        if (!next || next === tag.name) {
            setDraftName(tag.name);
            return;
        }
        try {
            await update.mutateAsync({ id: tag.id, name: next });
            toast.success("Tag renomeada");
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Erro ao renomear";
            toast.error(message);
            setDraftName(tag.name);
        }
    };

    const changeColor = async (color: string) => {
        try {
            await update.mutateAsync({ id: tag.id, color });
        } catch {
            toast.error("Erro ao atualizar cor");
        }
    };

    return (
        <li className="flex items-center gap-3 px-4 py-3">
            <Popover>
                <PopoverTrigger
                    disabled={!isAdmin}
                    className="h-7 w-7 shrink-0 rounded-[8px] border border-rim transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-violet/60 disabled:cursor-not-allowed"
                    style={{ backgroundColor: tag.color }}
                    aria-label="Alterar cor"
                />
                <PopoverContent className="w-64 p-3">
                    <ColorPicker value={tag.color} onChange={changeColor} />
                </PopoverContent>
            </Popover>

            <div className="flex-1 min-w-0">
                {editing ? (
                    <Input
                        autoFocus
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        onBlur={commitName}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") commitName();
                            else if (e.key === "Escape") {
                                setEditing(false);
                                setDraftName(tag.name);
                            }
                        }}
                        className="h-7 text-sm"
                    />
                ) : (
                    <button
                        type="button"
                        disabled={!isAdmin}
                        onClick={() => isAdmin && setEditing(true)}
                        className="text-left text-sm font-medium text-t1 hover:text-violet disabled:cursor-default disabled:hover:text-t1"
                    >
                        <TagChip name={tag.name} color={tag.color} />
                    </button>
                )}
            </div>

            <div className="shrink-0 text-xs text-t3">
                {usage.isLoading ? (
                    <Skeleton className="h-3 w-12" />
                ) : usage.data ? (
                    `${usage.data.contactCount + usage.data.dealCount} usos`
                ) : (
                    "—"
                )}
            </div>

            {isAdmin && (
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onDelete}
                    className="h-7 w-7 text-t3 hover:text-rose"
                    aria-label="Excluir tag"
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            )}
        </li>
    );
}

// ---------------------------------------------------------------------------
// Create dialog
// ---------------------------------------------------------------------------

function CreateTagDialog({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const create = useCreateTag();
    const [name, setName] = useState("");
    const [color, setColor] = useState("#7c5cfc");

    const reset = () => {
        setName("");
        setColor("#7c5cfc");
    };

    const submit = async () => {
        const trimmed = name.trim();
        if (!trimmed) return;
        try {
            await create.mutateAsync({ name: trimmed, color });
            toast.success("Tag criada");
            reset();
            onOpenChange(false);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Erro ao criar tag";
            toast.error(message);
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                onOpenChange(next);
                if (!next) reset();
            }}
        >
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Nova tag</DialogTitle>
                    <DialogDescription>
                        Defina o nome e a cor que será usada em toda a organização.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="tag-name">Nome</Label>
                        <Input
                            id="tag-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="VIP, parceiro, frio..."
                            maxLength={50}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label>Cor</Label>
                        <div className="rounded-[10px] border border-rim bg-surface-3 p-3">
                            <ColorPicker value={color} onChange={setColor} />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs text-t3">Pré-visualização</Label>
                        <div>
                            <TagChip name={name.trim() || "Tag exemplo"} color={color} />
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
                        Cancelar
                    </Button>
                    <Button onClick={submit} disabled={!name.trim() || create.isPending}>
                        {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                        Criar tag
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ---------------------------------------------------------------------------
// Delete dialog
// ---------------------------------------------------------------------------

function DeleteTagDialog({
    tag,
    onOpenChange,
}: {
    tag: Tag | null;
    onOpenChange: (open: boolean) => void;
}) {
    const remove = useDeleteTag();
    const usage = useTagUsage(tag?.id ?? null);

    const submit = async () => {
        if (!tag) return;
        try {
            const result = await remove.mutateAsync(tag.id);
            const total = result.removedFromContacts + result.removedFromDeals;
            toast.success(
                total === 0
                    ? "Tag excluída"
                    : `Tag excluída. Removida de ${result.removedFromContacts} contatos e ${result.removedFromDeals} deals.`,
            );
            onOpenChange(false);
        } catch {
            toast.error("Erro ao excluir tag");
        }
    };

    return (
        <AlertDialog open={!!tag} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Excluir tag &ldquo;{tag?.name}&rdquo;?</AlertDialogTitle>
                    <AlertDialogDescription>
                        {usage.isLoading
                            ? "Carregando uso..."
                            : usage.data
                                ? `Esta tag está em ${usage.data.contactCount} contatos e ${usage.data.dealCount} deals. Os vínculos serão removidos.`
                                : "Esta ação não pode ser desfeita."}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={remove.isPending}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={submit}
                        disabled={remove.isPending}
                        className="bg-rose hover:bg-rose/90"
                    >
                        {remove.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                        Excluir
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
