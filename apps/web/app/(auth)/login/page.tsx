"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/hooks/useAuth";
import { useWhiteLabelStore } from "@/stores/white-label.store";
import { useAuthStore } from "@/stores/auth.store";

const schema = z.object({
    email: z.string().email("E-mail inválido"),
    password: z.string().min(6, "Mínimo 6 caracteres"),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
    const router = useRouter();
    const { settings } = useWhiteLabelStore();
    const { loginWithEmail, loginWithGoogle, isDevMode } = useAuth();
    const { isAuthenticated } = useAuthStore();

    // Redirect away only if the persisted state says we're logged in AND the
    // HttpOnly cookie still validates against /auth/me. We probe the API with
    // `credentials: "include"` — no JWT ever touches client JS now.
    useEffect(() => {
        if (!isAuthenticated) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(
                    `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333"}/auth/me`,
                    { credentials: "include" },
                );
                if (cancelled) return;
                if (res.ok) {
                    router.replace("/");
                } else {
                    useAuthStore.getState().clearAuth();
                }
            } catch {
                // Network error: do not redirect, let the user try to log in
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isAuthenticated, router]);

    const [error, setError] = useState<string | null>(null);

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } = useForm<FormValues>({ resolver: zodResolver(schema as any) });

    const onSubmit = async (data: FormValues) => {
        setError(null);
        try {
            await loginWithEmail.mutateAsync(data);
            router.replace("/");
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Erro ao fazer login");
        }
    };

    const handleGoogle = async () => {
        setError(null);
        try {
            await loginWithGoogle.mutateAsync();
            router.replace("/");
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Erro ao fazer login com Google");
        }
    };

    return (
        <div className="animate-fade-in">
            {/* Logo / brand */}
            <div className="mb-8 flex flex-col items-center text-center">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[14px] bg-gradient-to-br from-violet to-cyan shadow-[0_0_24px_rgba(124,92,252,0.4)]">
                    <span className="font-display text-xl font-bold text-white">
                        {settings?.platformName?.[0] ?? "C"}
                    </span>
                </div>
                <h1 className="font-display text-[24px] font-semibold text-t1">
                    {settings?.platformName ?? "CRM Base"}
                </h1>
                <p className="mt-1 text-sm text-t2">
                    {settings?.loginTagline ?? "Faça login para continuar"}
                </p>
            </div>

            {/* Card */}
            <div className="rounded-[20px] border border-[var(--rim)] bg-surface p-6">
                {!isDevMode && (
                    <>
                        {/* Google OAuth */}
                        <Button
                            variant="outline"
                            className="w-full gap-2.5"
                            onClick={handleGoogle}
                            disabled={loginWithGoogle.isPending}
                            type="button"
                        >
                            {loginWithGoogle.isPending ? (
                                <Spinner size="sm" />
                            ) : (
                                <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                </svg>
                            )}
                            Entrar com Google
                        </Button>

                        <div className="my-5 flex items-center gap-3">
                            <div className="h-px flex-1 bg-[var(--rim)]" />
                            <span className="font-mono text-[11px] text-t3">OU</span>
                            <div className="h-px flex-1 bg-[var(--rim)]" />
                        </div>
                    </>
                )}

                {isDevMode && (
                    <div className="mb-4 space-y-2">
                        <div className="rounded-[10px] border border-amber/30 bg-amber/[0.06] px-3 py-2 text-[11px] text-amber">
                            Modo desenvolvimento — use as credenciais do administrador padrão.
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full gap-2 border-amber/30 text-amber hover:bg-amber/[0.06]"
                            onClick={async () => {
                                const email = process.env.NEXT_PUBLIC_DEV_ADMIN_EMAIL ?? "";
                                const password = process.env.NEXT_PUBLIC_DEV_ADMIN_PASSWORD ?? "";
                                setError(null);
                                try {
                                    await loginWithEmail.mutateAsync({ email, password });
                                    router.replace("/");
                                } catch (err: unknown) {
                                    setError(err instanceof Error ? err.message : "Erro ao fazer login");
                                }
                            }}
                            disabled={loginWithEmail.isPending}
                        >
                            {loginWithEmail.isPending ? <Spinner size="sm" /> : "⚡ Entrar como Super Admin"}
                        </Button>
                    </div>
                )}

                {/* Email / password form */}
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                    <div className="space-y-1.5">
                        <Label htmlFor="email">E-mail</Label>
                        <Input
                            id="email"
                            type="email"
                            placeholder="seu@email.com"
                            autoComplete="email"
                            {...register("email")}
                        />
                        {errors.email && (
                            <p className="text-xs text-rose">{errors.email.message}</p>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="password">Senha</Label>
                        <Input
                            id="password"
                            type="password"
                            placeholder="••••••••"
                            autoComplete="current-password"
                            {...register("password")}
                        />
                        {errors.password && (
                            <p className="text-xs text-rose">{errors.password.message}</p>
                        )}
                    </div>

                    {error && (
                        <div className="rounded-[8px] border border-rose/20 bg-rose/[0.08] px-3 py-2.5 text-sm text-rose">
                            {error}
                        </div>
                    )}

                    <Button type="submit" className="w-full" disabled={isSubmitting}>
                        {isSubmitting ? <Spinner size="sm" /> : "Entrar"}
                    </Button>
                </form>
            </div>

            <p className="mt-5 text-center font-mono text-[11px] text-t3">
                Ao entrar você concorda com os{" "}
                <a href="#" className="text-t2 transition-colors hover:text-t1">
                    Termos de Uso
                </a>
            </p>
        </div>
    );
}
