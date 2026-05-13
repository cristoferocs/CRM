"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
    ArrowLeft,
    MessageSquare,
    Phone,
    Mail,
    Edit,
    MoreVertical,
    MapPin,
    Globe,
    Tag,
    Calendar,
    DollarSign,
    ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ContactSheet } from "@/components/modules/contacts/contact-sheet";
import { useContact } from "@/hooks/useContacts";
import { useConversations } from "@/hooks/useInbox";
import { getInitials, formatDate, formatCurrency, formatRelative, cn } from "@/lib/utils";

// ── Status styles ─────────────────────────────────────────────────────────────

const STATUS_VARIANTS: Record<string, "default" | "jade" | "cyan" | "amber" | "rose" | "muted"> = {
    lead: "default",
    client: "jade",
    prospect: "cyan",
    proposal: "amber",
    lost: "rose",
    inactive: "muted",
};

const STATUS_LABELS: Record<string, string> = {
    lead: "Lead",
    client: "Cliente",
    prospect: "Prospect",
    proposal: "Proposta",
    lost: "Perdido",
    inactive: "Inativo",
};

const CHANNEL_ICON: Record<string, string> = {
    whatsapp: "💬",
    instagram: "📸",
    messenger: "📘",
    email: "✉",
    web: "🌐",
    phone: "📞",
};

// ── Timeline event types ──────────────────────────────────────────────────────

const TIMELINE_ICONS: Record<string, { icon: string; color: string }> = {
    contact_created: { icon: "👤", color: "bg-violet-dim" },
    deal_created: { icon: "💼", color: "bg-cyan-dim" },
    deal_moved: { icon: "📦", color: "bg-amber-dim" },
    message_received: { icon: "💬", color: "bg-jade-dim" },
    deal_won: { icon: "🏆", color: "bg-jade-dim" },
    deal_lost: { icon: "❌", color: "bg-rose-dim" },
    note_added: { icon: "📝", color: "bg-surface-3" },
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ContactDetailPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const [editOpen, setEditOpen] = useState(false);

    const { data: contact, isLoading } = useContact(id);
    const { data: conversationsData } = useConversations({ limit: 50 });

    // Filter conversations for this contact
    const contactConversations = (conversationsData?.conversations ?? []).filter(
        (c) => c.contactId === id,
    );

    if (isLoading) {
        return (
            <div className="space-y-6 animate-fade-in">
                <Skeleton className="h-8 w-48" />
                <div className="grid grid-cols-[320px_1fr] gap-4">
                    <div className="space-y-4">
                        <Skeleton className="h-64 w-full rounded-[16px]" />
                        <Skeleton className="h-32 w-full rounded-[16px]" />
                    </div>
                    <Skeleton className="h-96 w-full rounded-[16px]" />
                </div>
            </div>
        );
    }

    if (!contact) {
        return (
            <div className="flex flex-col items-center justify-center py-32 text-t3">
                <p className="text-lg">Contato não encontrado</p>
                <Button variant="outline" className="mt-4" asChild>
                    <Link href="/contacts">Voltar</Link>
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Back nav */}
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" asChild>
                    <Link href="/contacts">
                        <ArrowLeft className="h-4 w-4" /> Contatos
                    </Link>
                </Button>
                <span className="text-t3">›</span>
                <span className="text-sm font-medium text-t1">{contact.name}</span>
            </div>

            {/* Header bar */}
            <div className="flex items-center gap-4 rounded-[16px] border border-[var(--rim)] bg-surface px-5 py-4">
                <Avatar className="h-12 w-12">
                    <AvatarFallback className="bg-gradient-to-br from-violet to-cyan text-lg">
                        {getInitials(contact.name)}
                    </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h1 className="font-display text-xl font-semibold text-t1">{contact.name}</h1>
                        <Badge variant={STATUS_VARIANTS[contact.status] ?? "muted"}>
                            {STATUS_LABELS[contact.status] ?? contact.status}
                        </Badge>
                        {contact.tags?.map((tag) => (
                            <Badge key={tag} variant="muted">
                                <Tag className="h-2.5 w-2.5" /> {tag}
                            </Badge>
                        ))}
                    </div>
                    <p className="mt-0.5 text-sm text-t2">
                        {contact.phone && <span className="mr-3">{contact.phone}</span>}
                        {contact.email && <span>{contact.email}</span>}
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Button size="sm" variant="outline" asChild>
                        <Link href="/inbox">
                            <MessageSquare className="h-4 w-4" /> Mensagem
                        </Link>
                    </Button>
                    {contact.phone && (
                        <Button size="sm" variant="outline">
                            <Phone className="h-4 w-4" /> Ligar
                        </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                        <Edit className="h-4 w-4" /> Editar
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="outline">
                                <MoreVertical className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem className="text-rose">Excluir contato</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* Main grid */}
            <div className="grid grid-cols-[320px_1fr] gap-4">
                {/* Left: info */}
                <div className="space-y-4">
                    {/* Contact info card */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Informações</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {contact.phone && (
                                <div className="flex items-center gap-2.5 text-sm">
                                    <Phone className="h-4 w-4 shrink-0 text-t3" />
                                    <span className="font-mono text-t2">{contact.phone}</span>
                                </div>
                            )}
                            {contact.email && (
                                <div className="flex items-center gap-2.5 text-sm">
                                    <Mail className="h-4 w-4 shrink-0 text-t3" />
                                    <span className="text-t2">{contact.email}</span>
                                </div>
                            )}
                            {contact.source && (
                                <div className="flex items-center gap-2.5 text-sm">
                                    <Globe className="h-4 w-4 shrink-0 text-t3" />
                                    <span className="text-t2">{contact.source}</span>
                                </div>
                            )}
                            {contact.channel && (
                                <div className="flex items-center gap-2.5 text-sm">
                                    <MessageSquare className="h-4 w-4 shrink-0 text-t3" />
                                    <span className="text-t2">
                                        {CHANNEL_ICON[contact.channel] ?? ""} {contact.channel}
                                    </span>
                                </div>
                            )}
                            {contact.value && (
                                <div className="flex items-center gap-2.5 text-sm">
                                    <DollarSign className="h-4 w-4 shrink-0 text-t3" />
                                    <span className="font-mono font-semibold text-jade">
                                        {formatCurrency(contact.value)}
                                    </span>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Tags */}
                    {contact.tags && contact.tags.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Tags</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex flex-wrap gap-1.5">
                                    {contact.tags.map((tag) => (
                                        <Badge key={tag} variant="muted">
                                            {tag}
                                        </Badge>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Dates */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Datas</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex items-center gap-2.5 text-sm">
                                <Calendar className="h-4 w-4 shrink-0 text-t3" />
                                <div>
                                    <p className="text-[11px] text-t3">Cadastrado</p>
                                    <p className="font-mono text-[12px] text-t2">
                                        {formatDate(contact.createdAt, "dd/MM/yyyy 'às' HH:mm")}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2.5 text-sm">
                                <Calendar className="h-4 w-4 shrink-0 text-t3" />
                                <div>
                                    <p className="text-[11px] text-t3">Atualizado</p>
                                    <p className="font-mono text-[12px] text-t2">
                                        {formatDate(contact.updatedAt, "dd/MM/yyyy 'às' HH:mm")}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* UTM / origem */}
                    {contact.source && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Origem UTM</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-t3">utm_source</span>
                                    <span className="font-mono text-[11px] text-t2">{contact.source}</span>
                                </div>
                                {contact.channel && (
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-t3">utm_medium</span>
                                        <span className="font-mono text-[11px] text-t2">{contact.channel}</span>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Right: tabs */}
                <div>
                    <Tabs defaultValue="timeline">
                        <TabsList className="mb-4 flex w-auto gap-0 border border-[var(--rim)] bg-surface-2 rounded-[10px] p-1">
                            <TabsTrigger
                                value="timeline"
                                className="flex-1 border-none py-1.5 rounded-[6px] data-[state=active]:bg-surface-3"
                            >
                                Timeline
                            </TabsTrigger>
                            <TabsTrigger
                                value="conversations"
                                className="flex-1 border-none py-1.5 rounded-[6px] data-[state=active]:bg-surface-3"
                            >
                                Conversas
                                {contactConversations.length > 0 && (
                                    <span className="ml-1.5 rounded-full bg-violet px-1.5 py-px text-[10px] text-white">
                                        {contactConversations.length}
                                    </span>
                                )}
                            </TabsTrigger>
                            <TabsTrigger
                                value="deals"
                                className="flex-1 border-none py-1.5 rounded-[6px] data-[state=active]:bg-surface-3"
                            >
                                Deals
                            </TabsTrigger>
                        </TabsList>

                        {/* Timeline tab */}
                        <TabsContent value="timeline">
                            <Card>
                                <CardContent className="pt-5">
                                    {/* Synthetic timeline from contact creation */}
                                    <div className="relative space-y-0">
                                        {/* Creation event always present */}
                                        <TimelineEvent
                                            icon="👤"
                                            iconBg="bg-violet-dim"
                                            title="Contato criado"
                                            description={`${contact.name} foi adicionado ao CRM`}
                                            time={contact.createdAt}
                                            isLast={contactConversations.length === 0}
                                        />
                                        {contactConversations.map((conv, i) => (
                                            <TimelineEvent
                                                key={conv.id}
                                                icon={conv.channel === "whatsapp" ? "💬" : conv.channel === "instagram" ? "📸" : "📨"}
                                                iconBg="bg-jade-dim"
                                                title="Nova conversa iniciada"
                                                description={`via ${conv.channel}${conv.lastMessage ? ` · "${conv.lastMessage}"` : ""}`}
                                                time={conv.createdAt}
                                                isLast={i === contactConversations.length - 1}
                                            />
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* Conversations tab */}
                        <TabsContent value="conversations">
                            <Card>
                                <CardContent className="pt-5">
                                    {contactConversations.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-16 text-t3">
                                            <MessageSquare className="h-10 w-10 mb-3 opacity-30" />
                                            <p className="text-sm">Nenhuma conversa ainda</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {contactConversations.map((conv) => (
                                                <Link
                                                    key={conv.id}
                                                    href={`/inbox/${conv.id}`}
                                                    className="flex cursor-pointer items-center gap-3 rounded-[10px] border border-[var(--rim)] bg-surface-2 p-3.5 transition-all hover:border-[var(--rim2)]"
                                                >
                                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet to-cyan text-sm">
                                                        {conv.channel === "whatsapp" ? "💬" : conv.channel === "instagram" ? "📸" : "📨"}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[13px] font-medium text-t1 capitalize">{conv.channel}</span>
                                                            <Badge
                                                                variant={conv.status === "open" ? "jade" : conv.status === "resolved" ? "muted" : "default"}
                                                            >
                                                                {conv.status}
                                                            </Badge>
                                                        </div>
                                                        <p className="truncate text-xs text-t2">{conv.lastMessage ?? "Nenhuma mensagem"}</p>
                                                    </div>
                                                    <div className="flex shrink-0 flex-col items-end gap-1">
                                                        {conv.lastMessageAt && (
                                                            <span className="font-mono text-[10px] text-t3">
                                                                {formatRelative(conv.lastMessageAt)}
                                                            </span>
                                                        )}
                                                        <ExternalLink className="h-3 w-3 text-t3" />
                                                    </div>
                                                </Link>
                                            ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* Deals tab */}
                        <TabsContent value="deals">
                            <Card>
                                <CardContent className="pt-5">
                                    <div className="flex flex-col items-center justify-center py-16 text-t3">
                                        <DollarSign className="h-10 w-10 mb-3 opacity-30" />
                                        <p className="text-sm">Nenhum deal associado</p>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="mt-3"
                                            onClick={() => router.push("/pipeline")}
                                        >
                                            Ver Pipeline
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>

            {/* Edit sheet */}
            <ContactSheet
                open={editOpen}
                onOpenChange={setEditOpen}
                contact={contact}
            />
        </div>
    );
}

// ── TimelineEvent ─────────────────────────────────────────────────────────────

function TimelineEvent({
    icon,
    iconBg,
    title,
    description,
    time,
    isLast,
}: {
    icon: string;
    iconBg: string;
    title: string;
    description: string;
    time: string;
    isLast?: boolean;
}) {
    return (
        <div className="relative flex gap-4 pb-6 last:pb-0">
            {/* Connector line */}
            {!isLast && (
                <div className="absolute left-4 top-9 bottom-0 w-px bg-[var(--rim)]" />
            )}
            <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm", iconBg)}>
                {icon}
            </div>
            <div className="pt-1">
                <p className="text-[13px] font-medium text-t1">{title}</p>
                <p className="mt-0.5 text-[11px] text-t2">{description}</p>
                <p className="mt-1 font-mono text-[10px] text-t3">{formatRelative(time)}</p>
            </div>
        </div>
    );
}
