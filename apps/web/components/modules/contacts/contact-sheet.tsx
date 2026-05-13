"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
    SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useCreateContact, useUpdateContact, type Contact } from "@/hooks/useContacts";

// ── Schema ───────────────────────────────────────────────────────────────────

const contactSchema = z.object({
    name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
    email: z.string().email("Email inválido").or(z.literal("")).optional(),
    phone: z.string().min(8, "Telefone inválido").or(z.literal("")).optional(),
    status: z.enum(["lead", "prospect", "client", "proposal", "lost", "inactive"]),
    source: z.string().optional(),
    channel: z.string().optional(),
    tags: z.string().optional(), // comma-separated
});

type ContactFormValues = z.infer<typeof contactSchema>;

// ── Props ────────────────────────────────────────────────────────────────────

interface ContactSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    contact?: Contact | null; // if provided, edit mode
}

// ── Component ────────────────────────────────────────────────────────────────

export function ContactSheet({ open, onOpenChange, contact }: ContactSheetProps) {
    const isEditing = !!contact;

    const createContact = useCreateContact();
    const updateContact = useUpdateContact(contact?.id ?? "");

    const {
        register,
        handleSubmit,
        reset,
        setValue,
        watch,
        formState: { errors, isSubmitting },
    } = useForm<ContactFormValues>({
        resolver: zodResolver(contactSchema),
        defaultValues: {
            name: "",
            email: "",
            phone: "",
            status: "lead",
            source: "",
            channel: "",
            tags: "",
        },
    });

    // Populate form when editing
    useEffect(() => {
        if (contact) {
            reset({
                name: contact.name,
                email: contact.email ?? "",
                phone: contact.phone ?? "",
                status: contact.status as ContactFormValues["status"],
                source: contact.source ?? "",
                channel: contact.channel ?? "",
                tags: contact.tags?.join(", ") ?? "",
            });
        } else {
            reset({
                name: "",
                email: "",
                phone: "",
                status: "lead",
                source: "",
                channel: "",
                tags: "",
            });
        }
    }, [contact, reset]);

    const onSubmit = async (values: ContactFormValues) => {
        try {
            const payload = {
                ...values,
                tags: values.tags
                    ? values.tags.split(",").map((t) => t.trim()).filter(Boolean)
                    : [],
                email: values.email || undefined,
                phone: values.phone || undefined,
                source: values.source || undefined,
                channel: values.channel || undefined,
            };

            if (isEditing) {
                await updateContact.mutateAsync(payload);
                toast.success("Contato atualizado com sucesso");
            } else {
                await createContact.mutateAsync(payload);
                toast.success("Contato criado com sucesso");
            }
            onOpenChange(false);
        } catch {
            toast.error("Ocorreu um erro. Tente novamente.");
        }
    };

    const statusValue = watch("status");
    const channelValue = watch("channel");

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-full max-w-md overflow-y-auto">
                <SheetHeader>
                    <SheetTitle>{isEditing ? "Editar Contato" : "Novo Contato"}</SheetTitle>
                    <SheetDescription>
                        {isEditing
                            ? "Atualize as informações do contato."
                            : "Preencha os dados para criar um novo contato."}
                    </SheetDescription>
                </SheetHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5 px-6 py-5">
                    {/* Name */}
                    <div className="space-y-1.5">
                        <Label htmlFor="name">Nome *</Label>
                        <Input
                            id="name"
                            placeholder="João Silva"
                            {...register("name")}
                        />
                        {errors.name && (
                            <p className="text-[11px] text-rose">{errors.name.message}</p>
                        )}
                    </div>

                    {/* Email */}
                    <div className="space-y-1.5">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            placeholder="joao@email.com"
                            {...register("email")}
                        />
                        {errors.email && (
                            <p className="text-[11px] text-rose">{errors.email.message}</p>
                        )}
                    </div>

                    {/* Phone */}
                    <div className="space-y-1.5">
                        <Label htmlFor="phone">Telefone</Label>
                        <Input
                            id="phone"
                            placeholder="+55 11 99999-9999"
                            {...register("phone")}
                        />
                        {errors.phone && (
                            <p className="text-[11px] text-rose">{errors.phone.message}</p>
                        )}
                    </div>

                    {/* Status */}
                    <div className="space-y-1.5">
                        <Label>Tipo</Label>
                        <Select
                            value={statusValue}
                            onValueChange={(v) => setValue("status", v as ContactFormValues["status"])}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Selecione o tipo" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="lead">Lead</SelectItem>
                                <SelectItem value="prospect">Prospect</SelectItem>
                                <SelectItem value="client">Cliente</SelectItem>
                                <SelectItem value="proposal">Proposta</SelectItem>
                                <SelectItem value="lost">Perdido</SelectItem>
                                <SelectItem value="inactive">Inativo</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Source */}
                    <div className="space-y-1.5">
                        <Label htmlFor="source">Origem</Label>
                        <Input
                            id="source"
                            placeholder="Google Ads, Instagram, Indicação..."
                            {...register("source")}
                        />
                    </div>

                    {/* Channel */}
                    <div className="space-y-1.5">
                        <Label>Canal</Label>
                        <Select
                            value={channelValue ?? ""}
                            onValueChange={(v) => setValue("channel", v)}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Selecione o canal" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                                <SelectItem value="instagram">Instagram</SelectItem>
                                <SelectItem value="messenger">Messenger</SelectItem>
                                <SelectItem value="email">Email</SelectItem>
                                <SelectItem value="web">Web</SelectItem>
                                <SelectItem value="phone">Telefone</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Tags */}
                    <div className="space-y-1.5">
                        <Label htmlFor="tags">Tags</Label>
                        <Input
                            id="tags"
                            placeholder="vip, premium, parceiro (separadas por vírgula)"
                            {...register("tags")}
                        />
                        <p className="text-[11px] text-t3">Separe as tags por vírgula</p>
                    </div>
                </form>

                <SheetFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isSubmitting}
                    >
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleSubmit(onSubmit)}
                        disabled={isSubmitting}
                    >
                        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                        {isEditing ? "Salvar alterações" : "Criar contato"}
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
