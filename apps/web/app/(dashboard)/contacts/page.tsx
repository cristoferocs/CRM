"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Filter, Upload, X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
} from "@/components/ui/table";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ContactSheet } from "@/components/modules/contacts/contact-sheet";
import { TagAutocomplete, type TagOption } from "@/components/ui/tag-autocomplete";
import { TagChip } from "@/components/ui/tag-chip";
import { useContacts } from "@/hooks/useContacts";
import { useTags } from "@/hooks/useTags";
import { getInitials, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_VARIANTS: Record<string, "default" | "jade" | "cyan" | "amber" | "rose" | "muted"> = {
    lead: "default",
    client: "jade",
    partner: "cyan",
    prospect: "cyan",
    proposal: "amber",
    lost: "rose",
    inactive: "muted",
};

const STATUS_LABELS: Record<string, string> = {
    lead: "Lead",
    client: "Cliente",
    partner: "Parceiro",
    prospect: "Prospect",
    proposal: "Proposta",
    lost: "Perdido",
    inactive: "Inativo",
};

const AVATAR_COLORS = [
    "from-violet to-cyan",
    "from-cyan to-jade",
    "from-jade to-cyan",
    "from-rose to-amber",
    "from-amber to-violet",
];

const CHANNEL_ICON: Record<string, string> = {
    whatsapp: "💬",
    instagram: "📸",
    messenger: "📘",
    email: "✉",
    web: "🌐",
    phone: "📞",
};

// ── useDebounce ───────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay = 400): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);
    return debounced;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ContactsPage() {
    const router = useRouter();

    // ── Filter state ──────────────────────────────────────────────────────────
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("");
    const [sourceFilter, setSourceFilter] = useState<string>("");
    const [channelFilter, setChannelFilter] = useState<string>("");
    const [tagFilters, setTagFilters] = useState<TagOption[]>([]);
    const [tagSearch, setTagSearch] = useState("");
    const { data: tagOptions = [] } = useTags({ search: tagSearch, limit: 50 });
    const [showFilters, setShowFilters] = useState(false);
    const [page, setPage] = useState(1);

    // ── ContactSheet state ────────────────────────────────────────────────────
    const [sheetOpen, setSheetOpen] = useState(false);

    // ── CSV import ref ────────────────────────────────────────────────────────
    const csvInputRef = useRef<HTMLInputElement>(null);

    const debouncedSearch = useDebounce(search);

    const { data, isLoading } = useContacts({
        search: debouncedSearch || undefined,
        status: statusFilter || undefined,
        source: sourceFilter || undefined,
        tags: tagFilters.length > 0 ? tagFilters.map((t) => t.id).join(",") : undefined,
        page,
        limit: 20,
    });

    // Reset page on filter change
    useEffect(() => {
        setPage(1);
    }, [debouncedSearch, statusFilter, sourceFilter, channelFilter, tagFilters]);

    const hasFilters = !!statusFilter || !!sourceFilter || !!channelFilter || tagFilters.length > 0;

    const clearFilters = useCallback(() => {
        setStatusFilter("");
        setSourceFilter("");
        setChannelFilter("");
        setTagFilters([]);
    }, []);

    const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        // TODO: implement CSV import via API
        console.log("CSV import:", file.name);
        e.target.value = "";
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-end justify-between">
                <div>
                    <h1 className="font-display text-[28px] font-semibold leading-none tracking-[-0.8px] text-t1">
                        Contatos
                    </h1>
                    <p className="mt-1.5 text-sm text-t2">
                        {isLoading ? "Carregando..." : `${data?.total ?? 0} contatos no total`}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <input
                        ref={csvInputRef}
                        type="file"
                        accept=".csv"
                        className="hidden"
                        onChange={handleCsvImport}
                    />
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => csvInputRef.current?.click()}
                    >
                        <Upload className="h-4 w-4" /> Importar CSV
                    </Button>
                    <Button onClick={() => setSheetOpen(true)}>
                        <Plus className="h-4 w-4" /> Novo Contato
                    </Button>
                </div>
            </div>

            {/* Search + filters toolbar */}
            <div className="space-y-3">
                <div className="flex items-center gap-3">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-t3" />
                        <Input
                            placeholder="Buscar por nome, email, telefone..."
                            className="pl-9"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        {search && (
                            <button
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-t3 hover:text-t1"
                                onClick={() => setSearch("")}
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowFilters((v) => !v)}
                        className={cn(showFilters && "border-violet/40 bg-violet/[0.06] text-violet")}
                    >
                        <Filter className="h-4 w-4" />
                        Filtros
                        {hasFilters && (
                            <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-violet text-[9px] text-white">
                                !
                            </span>
                        )}
                        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showFilters && "rotate-180")} />
                    </Button>
                    {hasFilters && (
                        <button
                            className="font-mono text-[11px] text-t3 hover:text-rose transition-colors"
                            onClick={clearFilters}
                        >
                            Limpar filtros
                        </button>
                    )}
                </div>

                {/* Expanded filters */}
                {showFilters && (
                    <div className="flex items-center gap-3 rounded-[12px] border border-[var(--rim)] bg-surface-2 px-4 py-3">
                        <span className="font-mono text-[11px] text-t3 uppercase tracking-widest">Filtrar por:</span>

                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="h-8 w-36 text-xs">
                                <SelectValue placeholder="Tipo" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="lead">Lead</SelectItem>
                                <SelectItem value="client">Cliente</SelectItem>
                                <SelectItem value="partner">Parceiro</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={channelFilter} onValueChange={setChannelFilter}>
                            <SelectTrigger className="h-8 w-36 text-xs">
                                <SelectValue placeholder="Canal" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="whatsapp">💬 WhatsApp</SelectItem>
                                <SelectItem value="instagram">📸 Instagram</SelectItem>
                                <SelectItem value="messenger">📘 Messenger</SelectItem>
                                <SelectItem value="email">✉ Email</SelectItem>
                                <SelectItem value="web">🌐 Web</SelectItem>
                            </SelectContent>
                        </Select>

                        <Input
                            className="h-8 w-48 text-xs"
                            placeholder="Origem (ex: Google Ads)"
                            value={sourceFilter}
                            onChange={(e) => setSourceFilter(e.target.value)}
                        />

                        <div className="min-w-[200px]">
                            <TagAutocomplete
                                value={tagFilters}
                                options={tagOptions}
                                onChange={setTagFilters}
                                onSearchChange={setTagSearch}
                                placeholder="Tags..."
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Table */}
            <div className="rounded-[16px] border border-[var(--rim)] bg-surface overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="hover:bg-transparent">
                            <TableHead>Contato</TableHead>
                            <TableHead>Telefone</TableHead>
                            <TableHead>Origem</TableHead>
                            <TableHead>Canal</TableHead>
                            <TableHead>Tags</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Cadastrado</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading
                            ? Array.from({ length: 8 }).map((_, i) => (
                                <TableRow key={i} className="hover:bg-transparent">
                                    <TableCell>
                                        <div className="flex items-center gap-2.5">
                                            <Skeleton className="h-8 w-8 rounded-full" />
                                            <div className="space-y-1.5">
                                                <Skeleton className="h-3 w-32" />
                                                <Skeleton className="h-3 w-24" />
                                            </div>
                                        </div>
                                    </TableCell>
                                    {Array.from({ length: 6 }).map((_, j) => (
                                        <TableCell key={j}>
                                            <Skeleton className="h-3 w-20" />
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                            : (data?.contacts ?? []).length === 0
                                ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="py-20 text-center text-t3">
                                            <p className="text-sm">Nenhum contato encontrado</p>
                                            {hasFilters && (
                                                <button
                                                    className="mt-2 font-mono text-[11px] text-cyan hover:opacity-70"
                                                    onClick={clearFilters}
                                                >
                                                    Limpar filtros
                                                </button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                )
                                : (data?.contacts ?? []).map((contact, i) => (
                                    <TableRow
                                        key={contact.id}
                                        className="cursor-pointer"
                                        onClick={() => router.push(`/contacts/${contact.id}`)}
                                    >
                                        <TableCell>
                                            <div className="flex items-center gap-2.5">
                                                <Avatar className="h-8 w-8">
                                                    <AvatarFallback
                                                        className={cn(
                                                            "bg-gradient-to-br text-[11px]",
                                                            AVATAR_COLORS[i % AVATAR_COLORS.length],
                                                        )}
                                                    >
                                                        {getInitials(contact.name)}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <p className="font-medium text-t1">{contact.name}</p>
                                                    <p className="text-[11px] text-t2">{contact.email ?? "—"}</p>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="font-mono text-[12px] text-t2">
                                            {contact.phone ?? "—"}
                                        </TableCell>
                                        <TableCell className="text-[11px] text-t2">
                                            {contact.source ?? "—"}
                                        </TableCell>
                                        <TableCell>
                                            {contact.channel ? (
                                                <span className="font-mono text-[11px] text-t2">
                                                    {CHANNEL_ICON[contact.channel] ?? ""} {contact.channel}
                                                </span>
                                            ) : (
                                                <span className="text-t3">—</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1">
                                                {contact.tags?.slice(0, 2).map((tag) => (
                                                    <TagChip key={tag.id} name={tag.name} color={tag.color} compact />
                                                ))}
                                                {(contact.tags?.length ?? 0) > 2 && (
                                                    <Badge variant="muted">+{contact.tags!.length - 2}</Badge>
                                                )}
                                                {(!contact.tags || contact.tags.length === 0) && (
                                                    <span className="text-t3">—</span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={STATUS_VARIANTS[contact.status] ?? "muted"}>
                                                {STATUS_LABELS[contact.status] ?? contact.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="font-mono text-[11px] text-t3">
                                            {formatDate(contact.createdAt)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                    </TableBody>
                </Table>

                {/* Pagination */}
                {data && data.pages > 1 && (
                    <div className="flex items-center justify-between border-t border-[var(--rim)] px-4 py-3">
                        <span className="font-mono text-xs text-t3">
                            Página {data.page} de {data.pages} · {data.total} contatos
                        </span>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={page <= 1}
                                onClick={() => setPage((p) => p - 1)}
                            >
                                Anterior
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={page >= data.pages}
                                onClick={() => setPage((p) => p + 1)}
                            >
                                Próximo
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* ContactSheet */}
            <ContactSheet
                open={sheetOpen}
                onOpenChange={setSheetOpen}
            />
        </div>
    );
}
