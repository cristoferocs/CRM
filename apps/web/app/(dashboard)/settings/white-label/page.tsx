"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useWhiteLabelStore } from "@/stores/white-label.store";
import { applyWhiteLabel } from "@/lib/white-label";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";

async function apiPatch(orgId: string, token: string, data: object) {
    const res = await fetch(`${API}/organizations/${orgId}/white-label`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error((await res.json())?.message ?? "Erro ao salvar");
    return res.json();
}

async function apiUpload(
    orgId: string,
    token: string,
    endpoint: "logo" | "favicon",
    file: File,
) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${API}/organizations/${orgId}/white-label/${endpoint}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
    });
    if (!res.ok) throw new Error((await res.json())?.message ?? "Erro no upload");
    return (await res.json()) as { url: string };
}

async function apiDomain(orgId: string, token: string, domain: string) {
    const res = await fetch(`${API}/organizations/${orgId}/white-label/domain`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ domain }),
    });
    if (!res.ok) throw new Error((await res.json())?.message ?? "Erro ao cadastrar domínio");
    return res.json();
}

async function apiVerifyDomain(orgId: string, token: string) {
    const res = await fetch(`${API}/organizations/${orgId}/white-label/domain/verify`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error((await res.json())?.message ?? "Erro ao verificar");
    return (await res.json()) as { verified: boolean };
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida (ex: #5b5bff)");

const VisualSchema = z.object({
    primaryColor: hexColor,
    secondaryColor: hexColor,
    accentColor: hexColor,
});

const LoginSchema = z.object({
    platformName: z.string().min(1, "Obrigatório").max(100),
    loginTagline: z.string().max(200).nullable(),
});

const EmailSchema = z.object({
    emailFromName: z.string().min(1, "Obrigatório").max(100),
    emailFromAddress: z.string().email("E-mail inválido"),
    emailFooter: z.string().max(500).nullable(),
});

const SupportSchema = z.object({
    supportEmail: z.string().email("E-mail inválido").nullable().or(z.literal("")),
    supportWhatsapp: z.string().max(30).nullable(),
    termsUrl: z.string().url("URL inválida").nullable().or(z.literal("")),
    privacyUrl: z.string().url("URL inválida").nullable().or(z.literal("")),
});

// ---------------------------------------------------------------------------
// Tiny UI atoms
// ---------------------------------------------------------------------------

function SectionTitle({ children }: { children: React.ReactNode }) {
    return (
        <h2 className="mb-4 text-base font-semibold text-slate-800 border-b border-slate-100 pb-2">
            {children}
        </h2>
    );
}

function Field({
    label,
    error,
    children,
}: {
    label: string;
    error?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">{label}</label>
            {children}
            {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
    );
}

function Input({
    className = "",
    ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <input
            className={`rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 ${className}`}
            {...props}
        />
    );
}

function Textarea({
    className = "",
    ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return (
        <textarea
            rows={3}
            className={`rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 ${className}`}
            {...props}
        />
    );
}

function SaveBtn({
    loading,
    children = "Salvar seção",
}: {
    loading?: boolean;
    children?: React.ReactNode;
}) {
    return (
        <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-lg px-5 py-2 text-sm font-semibold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--color-primary)" }}
        >
            {loading ? "Salvando…" : children}
        </button>
    );
}

function Toast({ msg, ok }: { msg: string; ok: boolean }) {
    return (
        <div
            className={`rounded-lg px-4 py-2 text-sm font-medium ${ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                }`}
        >
            {msg}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Colour preview swatch
// ---------------------------------------------------------------------------

function ColorSwatch({ color, label }: { color: string; label: string }) {
    return (
        <div className="flex items-center gap-2">
            <span
                className="h-6 w-6 rounded-full border border-slate-200 shadow-sm"
                style={{ background: color }}
            />
            <span className="text-xs text-slate-500">{label}</span>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Section: Visual identity (colors + uploads)
// ---------------------------------------------------------------------------

function VisualSection({
    orgId,
    token,
}: {
    orgId: string;
    token: string;
}) {
    const { settings, setSettings } = useWhiteLabelStore();
    const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
    const [uploading, setUploading] = useState<"logo" | "favicon" | null>(null);
    const [saving, setSaving] = useState(false);

    const {
        register,
        handleSubmit,
        watch,
        formState: { errors },
    } = useForm<z.infer<typeof VisualSchema>>({
        resolver: zodResolver(VisualSchema),
        defaultValues: {
            primaryColor: settings.primaryColor,
            secondaryColor: settings.secondaryColor,
            accentColor: settings.accentColor,
        },
    });

    const liveColors = watch();

    const onSave = handleSubmit(async (data) => {
        setSaving(true);
        setToast(null);
        try {
            const updated = await apiPatch(orgId, token, data);
            const next = { ...settings, ...updated };
            setSettings(next);
            applyWhiteLabel(next);
            setToast({ msg: "Identidade visual salva!", ok: true });
        } catch (e: unknown) {
            setToast({ msg: (e as Error).message, ok: false });
        } finally {
            setSaving(false);
        }
    });

    async function handleUpload(e: React.ChangeEvent<HTMLInputElement>, type: "logo" | "favicon") {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(type);
        setToast(null);
        try {
            const { url } = await apiUpload(orgId, token, type, file);
            const patch: Partial<typeof settings> =
                type === "logo" ? { logoUrl: url } : { faviconUrl: url };
            const next = { ...settings, ...patch };
            setSettings(next);
            applyWhiteLabel(next);
            setToast({ msg: `${type === "logo" ? "Logo" : "Favicon"} atualizado!`, ok: true });
        } catch (e: unknown) {
            setToast({ msg: (e as Error).message, ok: false });
        } finally {
            setUploading(null);
            e.target.value = "";
        }
    }

    return (
        <section className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
            <SectionTitle>1. Identidade Visual</SectionTitle>

            {/* Upload row */}
            <div className="mb-6 flex flex-wrap gap-6">
                {/* Logo */}
                <div className="flex flex-col gap-2">
                    <span className="text-xs font-medium text-slate-600">Logo</span>
                    {settings.logoUrl && (
                        <img src={settings.logoUrl} alt="Logo" className="h-12 w-auto object-contain" />
                    )}
                    <label className="cursor-pointer rounded-lg border border-dashed border-slate-300 px-4 py-2 text-xs text-slate-500 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">
                        {uploading === "logo" ? "Enviando…" : "Selecionar PNG/SVG/WEBP (max 2 MB)"}
                        <input
                            type="file"
                            accept="image/png,image/jpeg,image/svg+xml,image/webp"
                            className="hidden"
                            onChange={(e) => handleUpload(e, "logo")}
                            disabled={!!uploading}
                        />
                    </label>
                </div>

                {/* Favicon */}
                <div className="flex flex-col gap-2">
                    <span className="text-xs font-medium text-slate-600">Favicon</span>
                    {settings.faviconUrl && (
                        <img src={settings.faviconUrl} alt="Favicon" className="h-8 w-8 object-contain" />
                    )}
                    <label className="cursor-pointer rounded-lg border border-dashed border-slate-300 px-4 py-2 text-xs text-slate-500 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">
                        {uploading === "favicon" ? "Enviando…" : "Selecionar ICO/PNG (max 2 MB)"}
                        <input
                            type="file"
                            accept="image/x-icon,image/vnd.microsoft.icon,image/png"
                            className="hidden"
                            onChange={(e) => handleUpload(e, "favicon")}
                            disabled={!!uploading}
                        />
                    </label>
                </div>
            </div>

            {/* Colour pickers */}
            <form onSubmit={onSave} className="flex flex-col gap-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <Field label="Cor primária" error={errors.primaryColor?.message}>
                        <div className="flex items-center gap-2">
                            <input type="color" {...register("primaryColor")} className="h-9 w-12 cursor-pointer rounded border border-slate-200 p-0.5" />
                            <Input placeholder="#5b5bff" {...register("primaryColor")} className="flex-1" />
                        </div>
                    </Field>
                    <Field label="Cor secundária" error={errors.secondaryColor?.message}>
                        <div className="flex items-center gap-2">
                            <input type="color" {...register("secondaryColor")} className="h-9 w-12 cursor-pointer rounded border border-slate-200 p-0.5" />
                            <Input placeholder="#00e5c0" {...register("secondaryColor")} className="flex-1" />
                        </div>
                    </Field>
                    <Field label="Cor de destaque" error={errors.accentColor?.message}>
                        <div className="flex items-center gap-2">
                            <input type="color" {...register("accentColor")} className="h-9 w-12 cursor-pointer rounded border border-slate-200 p-0.5" />
                            <Input placeholder="#ff5b8d" {...register("accentColor")} className="flex-1" />
                        </div>
                    </Field>
                </div>

                {/* Live preview */}
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                    <p className="mb-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Preview ao vivo</p>
                    <div
                        className="flex h-12 items-center gap-4 rounded-lg px-4"
                        style={{ backgroundColor: liveColors.primaryColor }}
                    >
                        <span className="text-sm font-semibold text-white">Sidebar / Header</span>
                        <span
                            className="ml-auto rounded px-3 py-1 text-xs font-semibold"
                            style={{ backgroundColor: liveColors.accentColor, color: "#fff" }}
                        >
                            Botão destaque
                        </span>
                    </div>
                    <div className="mt-2 flex gap-3">
                        <ColorSwatch color={liveColors.primaryColor} label="Primária" />
                        <ColorSwatch color={liveColors.secondaryColor} label="Secundária" />
                        <ColorSwatch color={liveColors.accentColor} label="Destaque" />
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <SaveBtn loading={saving} />
                    {toast && <Toast {...toast} />}
                </div>
            </form>
        </section>
    );
}

// ---------------------------------------------------------------------------
// Section: Login screen
// ---------------------------------------------------------------------------

function LoginSection({ orgId, token }: { orgId: string; token: string }) {
    const { settings, setSettings } = useWhiteLabelStore();
    const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
    const [saving, setSaving] = useState(false);
    const [bgUploading, setBgUploading] = useState(false);

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<z.infer<typeof LoginSchema>>({
        resolver: zodResolver(LoginSchema),
        defaultValues: {
            platformName: settings.platformName,
            loginTagline: settings.loginTagline,
        },
    });

    const onSave = handleSubmit(async (data) => {
        setSaving(true);
        setToast(null);
        try {
            const updated = await apiPatch(orgId, token, data);
            const next = { ...settings, ...updated };
            setSettings(next);
            applyWhiteLabel(next);
            setToast({ msg: "Tela de login salva!", ok: true });
        } catch (e: unknown) {
            setToast({ msg: (e as Error).message, ok: false });
        } finally {
            setSaving(false);
        }
    });

    async function handleBgUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setBgUploading(true);
        setToast(null);
        // Upload via logo endpoint then patch loginBackground
        try {
            const fd = new FormData();
            fd.append("file", file);
            const res = await fetch(`${API}/organizations/${orgId}/white-label/logo`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                body: fd,
            });
            if (!res.ok) throw new Error("Erro no upload do fundo");
            const { url } = (await res.json()) as { url: string };
            const updated = await apiPatch(orgId, token, { loginBackground: url });
            const next = { ...settings, ...updated };
            setSettings(next);
            applyWhiteLabel(next);
            setToast({ msg: "Fundo da tela de login atualizado!", ok: true });
        } catch (e: unknown) {
            setToast({ msg: (e as Error).message, ok: false });
        } finally {
            setBgUploading(false);
            e.target.value = "";
        }
    }

    return (
        <section className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
            <SectionTitle>2. Tela de Login</SectionTitle>
            <form onSubmit={onSave} className="flex flex-col gap-4">
                <Field label="Nome da plataforma" error={errors.platformName?.message}>
                    <Input placeholder="CRM Agência XYZ" {...register("platformName")} />
                </Field>

                <Field label="Tagline (abaixo do logo)" error={errors.loginTagline?.message}>
                    <Input
                        placeholder="Gerencie seus clientes de forma inteligente"
                        {...register("loginTagline")}
                    />
                </Field>

                <div className="flex flex-col gap-2">
                    <span className="text-xs font-medium text-slate-600">Imagem de fundo</span>
                    {settings.loginBackground && (
                        <img
                            src={settings.loginBackground}
                            alt="Fundo"
                            className="h-24 w-full rounded-lg object-cover"
                        />
                    )}
                    <label className="cursor-pointer rounded-lg border border-dashed border-slate-300 px-4 py-2 text-xs text-slate-500 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">
                        {bgUploading ? "Enviando…" : "Selecionar imagem (JPG/PNG/WEBP, max 2 MB)"}
                        <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="hidden"
                            onChange={handleBgUpload}
                            disabled={bgUploading}
                        />
                    </label>
                </div>

                <div className="flex items-center gap-3">
                    <SaveBtn loading={saving} />
                    {toast && <Toast {...toast} />}
                </div>
            </form>
        </section>
    );
}

// ---------------------------------------------------------------------------
// Section: E-mail
// ---------------------------------------------------------------------------

function EmailSection({ orgId, token }: { orgId: string; token: string }) {
    const { settings, setSettings } = useWhiteLabelStore();
    const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
    const [saving, setSaving] = useState(false);

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<z.infer<typeof EmailSchema>>({
        resolver: zodResolver(EmailSchema),
        defaultValues: {
            emailFromName: settings.emailFromName ?? "",
            emailFromAddress: settings.emailFromAddress ?? "",
            emailFooter: settings.emailFooter ?? "",
        },
    });

    const onSave = handleSubmit(async (data) => {
        setSaving(true);
        setToast(null);
        try {
            const updated = await apiPatch(orgId, token, data);
            setSettings({ ...settings, ...updated });
            setToast({ msg: "Configurações de e-mail salvas!", ok: true });
        } catch (e: unknown) {
            setToast({ msg: (e as Error).message, ok: false });
        } finally {
            setSaving(false);
        }
    });

    return (
        <section className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
            <SectionTitle>3. E-mail</SectionTitle>
            <form onSubmit={onSave} className="flex flex-col gap-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Nome do remetente" error={errors.emailFromName?.message}>
                        <Input placeholder="CRM Agência XYZ" {...register("emailFromName")} />
                    </Field>
                    <Field label="E-mail remetente" error={errors.emailFromAddress?.message}>
                        <Input
                            type="email"
                            placeholder="noreply@agenciaxyz.com.br"
                            {...register("emailFromAddress")}
                        />
                    </Field>
                </div>

                <Field label="Rodapé dos e-mails" error={errors.emailFooter?.message}>
                    <Textarea
                        placeholder="© 2026 Agência XYZ. Todos os direitos reservados."
                        {...register("emailFooter")}
                    />
                </Field>

                <div className="flex items-center gap-3">
                    <SaveBtn loading={saving} />
                    {toast && <Toast {...toast} />}
                </div>
            </form>
        </section>
    );
}

// ---------------------------------------------------------------------------
// Section: Custom domain
// ---------------------------------------------------------------------------

function DomainSection({ orgId, token }: { orgId: string; token: string }) {
    const [domain, setDomain] = useState("");
    const [dnsInfo, setDnsInfo] = useState<{
        verificationTxtRecord: string;
        verificationValue: string;
        isVerified: boolean;
    } | null>(null);
    const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
    const [loading, setLoading] = useState(false);
    const [verifying, setVerifying] = useState(false);

    async function handleAdd(e: React.FormEvent) {
        e.preventDefault();
        if (!domain.trim()) return;
        setLoading(true);
        setToast(null);
        try {
            const data = await apiDomain(orgId, token, domain.trim());
            setDnsInfo({
                verificationTxtRecord: data.verificationTxtRecord,
                verificationValue: data.verificationValue,
                isVerified: data.isVerified,
            });
            setToast({ msg: "Domínio cadastrado! Configure o registro TXT abaixo.", ok: true });
        } catch (e: unknown) {
            setToast({ msg: (e as Error).message, ok: false });
        } finally {
            setLoading(false);
        }
    }

    async function handleVerify() {
        setVerifying(true);
        setToast(null);
        try {
            const { verified } = await apiVerifyDomain(orgId, token);
            if (verified) {
                setDnsInfo((prev) => (prev ? { ...prev, isVerified: true } : prev));
                setToast({ msg: "Domínio verificado com sucesso!", ok: true });
            } else {
                setToast({
                    msg: "Registro TXT não encontrado. Aguarde a propagação do DNS (pode levar até 24h).",
                    ok: false,
                });
            }
        } catch (e: unknown) {
            setToast({ msg: (e as Error).message, ok: false });
        } finally {
            setVerifying(false);
        }
    }

    return (
        <section className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
            <SectionTitle>4. Domínio Customizado</SectionTitle>

            <form onSubmit={handleAdd} className="flex gap-3">
                <Input
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    placeholder="crm.suaagencia.com.br"
                    className="flex-1"
                />
                <button
                    type="submit"
                    disabled={loading}
                    className="rounded-lg px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    style={{ backgroundColor: "var(--color-primary)" }}
                >
                    {loading ? "Cadastrando…" : "Cadastrar"}
                </button>
            </form>

            {dnsInfo && (
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                    <p className="mb-1 font-medium text-slate-700">Configure o registro TXT no seu DNS:</p>
                    <table className="w-full text-xs">
                        <tbody>
                            <tr>
                                <td className="py-1 pr-4 text-slate-500 font-medium">Registro</td>
                                <td className="font-mono text-slate-800">{dnsInfo.verificationTxtRecord}</td>
                            </tr>
                            <tr>
                                <td className="py-1 pr-4 text-slate-500 font-medium">Valor</td>
                                <td className="font-mono text-slate-800">{dnsInfo.verificationValue}</td>
                            </tr>
                            <tr>
                                <td className="py-1 pr-4 text-slate-500 font-medium">Status</td>
                                <td>
                                    {dnsInfo.isVerified ? (
                                        <span className="text-emerald-600 font-semibold">✓ Verificado</span>
                                    ) : (
                                        <span className="text-amber-600 font-semibold">Pendente</span>
                                    )}
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    {!dnsInfo.isVerified && (
                        <button
                            onClick={handleVerify}
                            disabled={verifying}
                            className="mt-3 rounded-lg px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                            style={{ backgroundColor: "var(--color-secondary)" }}
                        >
                            {verifying ? "Verificando…" : "Verificar agora"}
                        </button>
                    )}
                </div>
            )}

            {toast && (
                <div className="mt-3">
                    <Toast {...toast} />
                </div>
            )}
        </section>
    );
}

// ---------------------------------------------------------------------------
// Section: Support
// ---------------------------------------------------------------------------

function SupportSection({ orgId, token }: { orgId: string; token: string }) {
    const { settings, setSettings } = useWhiteLabelStore();
    const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
    const [saving, setSaving] = useState(false);

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<z.infer<typeof SupportSchema>>({
        resolver: zodResolver(SupportSchema),
        defaultValues: {
            supportEmail: settings.supportEmail ?? "",
            supportWhatsapp: settings.supportWhatsapp ?? "",
            termsUrl: settings.termsUrl ?? "",
            privacyUrl: settings.privacyUrl ?? "",
        },
    });

    const onSave = handleSubmit(async (data) => {
        setSaving(true);
        setToast(null);
        const clean = {
            supportEmail: data.supportEmail || null,
            supportWhatsapp: data.supportWhatsapp || null,
            termsUrl: data.termsUrl || null,
            privacyUrl: data.privacyUrl || null,
        };
        try {
            const updated = await apiPatch(orgId, token, clean);
            setSettings({ ...settings, ...updated });
            setToast({ msg: "Informações de suporte salvas!", ok: true });
        } catch (e: unknown) {
            setToast({ msg: (e as Error).message, ok: false });
        } finally {
            setSaving(false);
        }
    });

    return (
        <section className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
            <SectionTitle>5. Suporte e Documentos Legais</SectionTitle>
            <form onSubmit={onSave} className="flex flex-col gap-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="E-mail de suporte" error={errors.supportEmail?.message}>
                        <Input type="email" placeholder="suporte@agencia.com.br" {...register("supportEmail")} />
                    </Field>
                    <Field label="WhatsApp de suporte" error={errors.supportWhatsapp?.message}>
                        <Input placeholder="+55 11 99999-9999" {...register("supportWhatsapp")} />
                    </Field>
                    <Field label="URL dos Termos de Uso" error={errors.termsUrl?.message}>
                        <Input type="url" placeholder="https://agencia.com.br/termos" {...register("termsUrl")} />
                    </Field>
                    <Field label="URL da Política de Privacidade" error={errors.privacyUrl?.message}>
                        <Input
                            type="url"
                            placeholder="https://agencia.com.br/privacidade"
                            {...register("privacyUrl")}
                        />
                    </Field>
                </div>

                <div className="flex items-center gap-3">
                    <SaveBtn loading={saving} />
                    {toast && <Toast {...toast} />}
                </div>
            </form>
        </section>
    );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function WhiteLabelSettingsPage() {
    // In a real app these would come from auth context / cookies
    const orgId = process.env.NEXT_PUBLIC_ORG_ID ?? "";
    const token = typeof window !== "undefined" ? (localStorage.getItem("accessToken") ?? "") : "";

    return (
        <div className="mx-auto max-w-3xl px-4 py-8">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-slate-900">White Label</h1>
                <p className="mt-1 text-sm text-slate-500">
                    Personalize a identidade visual da plataforma para os seus clientes.
                </p>
            </div>

            <div className="flex flex-col gap-6">
                <VisualSection orgId={orgId} token={token} />
                <LoginSection orgId={orgId} token={token} />
                <EmailSection orgId={orgId} token={token} />
                <DomainSection orgId={orgId} token={token} />
                <SupportSection orgId={orgId} token={token} />
            </div>
        </div>
    );
}
