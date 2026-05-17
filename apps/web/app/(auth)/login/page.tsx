"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import axios from "axios";
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

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";

interface ApiErrorBody {
    message?: string;
    code?: string;
    retryAfter?: number;
}

function extractApiError(err: unknown): ApiErrorBody & { fallback: string } {
    if (axios.isAxiosError(err)) {
        const body = (err.response?.data ?? {}) as ApiErrorBody;
        return {
            message: body.message,
            code: body.code,
            retryAfter: body.retryAfter,
            fallback: body.message ?? err.message ?? "Erro ao fazer login",
        };
    }
    if (err instanceof Error) return { fallback: err.message };
    return { fallback: "Erro ao fazer login" };
}

function formatRetryAfter(seconds: number | undefined): string {
    if (!seconds || seconds <= 0) return "alguns minutos";
    if (seconds >= 60) return `${Math.ceil(seconds / 60)} minutos`;
    return `${seconds} segundos`;
}

interface Challenge {
    challengeId: string;
    question: string;
}

export default function LoginPage() {
    const router = useRouter();
    const { settings } = useWhiteLabelStore();
    const { loginWithEmail, loginWithGoogle, isDevMode } = useAuth();
    const { isAuthenticated } = useAuthStore();

    // Redirect away only if the persisted state says we're logged in AND the
    // HttpOnly cookie still validates against /auth/me.
    useEffect(() => {
        if (!isAuthenticated) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
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
    const [challenge, setChallenge] = useState<Challenge | null>(null);
    const [captchaAnswer, setCaptchaAnswer] = useState("");
    const [lockedUntil, setLockedUntil] = useState<number | null>(null);
    const [now, setNow] = useState(() => Date.now());

    // Live countdown for the lockout banner.
    useEffect(() => {
        if (!lockedUntil) return;
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, [lockedUntil]);

    const lockSecondsLeft =
        lockedUntil != null ? Math.max(0, Math.ceil((lockedUntil - now) / 1000)) : 0;
    const isLocked = lockSecondsLeft > 0;

    useEffect(() => {
        if (lockedUntil != null && lockSecondsLeft === 0) {
            setLockedUntil(null);
            setError(null);
        }
    }, [lockedUntil, lockSecondsLeft]);

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } = useForm<FormValues>({ resolver: zodResolver(schema as any) });

    const fetchChallenge = useCallback(async () => {
        const { data } = await axios.get<Challenge>(`${API_BASE}/auth/challenge`, {
            withCredentials: true,
        });
        setChallenge(data);
        setCaptchaAnswer("");
    }, []);

    // After the user types an email, ask the server whether captcha is already
    // required for that subject (in case they reopened the page mid-throttle).
    const refreshThrottleStatus = useCallback(
        async (email: string) => {
            if (!email) return;
            try {
                const { data } = await axios.get<{
                    captchaRequired: boolean;
                    locked: boolean;
                    lockedFor: number;
                }>(`${API_BASE}/auth/throttle-status`, {
                    params: { subject: email },
                    withCredentials: true,
                });
                if (data.locked) {
                    setLockedUntil(Date.now() + data.lockedFor * 1000);
                    setError(
                        `Acesso temporariamente bloqueado por excesso de tentativas. ` +
                        `Tente novamente em ${formatRetryAfter(data.lockedFor)}.`,
                    );
                } else if (data.captchaRequired && !challenge) {
                    await fetchChallenge();
                }
            } catch {
                // Non-fatal — endpoint is informational.
            }
        },
        [challenge, fetchChallenge],
    );

    const handleApiError = useCallback(
        async (err: unknown) => {
            const parsed = extractApiError(err);
            if (parsed.code === "LOGIN_LOCKED") {
                setLockedUntil(Date.now() + (parsed.retryAfter ?? 0) * 1000);
                setChallenge(null);
                setError(
                    `Acesso temporariamente bloqueado por excesso de tentativas. ` +
                    `Tente novamente em ${formatRetryAfter(parsed.retryAfter)}.`,
                );
                return;
            }
            if (parsed.code === "CAPTCHA_REQUIRED") {
                await fetchChallenge();
                setError("Por favor, confirme que você é humano resolvendo o desafio abaixo.");
                return;
            }
            // Generic credential / network error: if we already had a challenge,
            // burn it (single-use) and fetch a fresh one in case the next
            // attempt still needs one.
            if (challenge) {
                await fetchChallenge().catch(() => undefined);
            }
            setError(parsed.fallback);
        },
        [challenge, fetchChallenge],
    );

    const onSubmit = async (data: FormValues) => {
        if (isLocked) return;
        setError(null);
        try {
            await loginWithEmail.mutateAsync({
                email: data.email,
                password: data.password,
                captchaId: challenge?.challengeId,
                captchaAnswer: challenge ? captchaAnswer : undefined,
            });
            setChallenge(null);
            setCaptchaAnswer("");
            router.replace("/");
        } catch (err: unknown) {
            await handleApiError(err);
        }
    };

    const handleGoogle = async () => {
        if (isLocked) return;
        setError(null);
        try {
            await loginWithGoogle.mutateAsync({
                captchaId: challenge?.challengeId,
                captchaAnswer: challenge ? captchaAnswer : undefined,
            });
            setChallenge(null);
            setCaptchaAnswer("");
            router.replace("/");
        } catch (err: unknown) {
            await handleApiError(err);
        }
    };

    // Form-wide busy state — covers RHF submission AND the mutation network call.
    const busy = isSubmitting || loginWithEmail.isPending || loginWithGoogle.isPending;
    const disableAll = busy || isLocked;

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
                        <Button
                            variant="outline"
                            className="w-full gap-2.5"
                            onClick={handleGoogle}
                            disabled={disableAll}
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
                    <div className="mb-4 rounded-[10px] border border-amber/30 bg-amber/[0.06] px-3 py-2 text-[11px] text-amber">
                        Modo desenvolvimento — use as credenciais do administrador padrão.
                    </div>
                )}

                {/* Email / password form */}
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                    <fieldset disabled={disableAll} className="space-y-4 disabled:opacity-70">
                        <div className="space-y-1.5">
                            <Label htmlFor="email">E-mail</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="seu@email.com"
                                autoComplete="email"
                                aria-busy={busy}
                                {...register("email", {
                                    onBlur: (e) => {
                                        const v = (e.target as HTMLInputElement).value;
                                        if (v) void refreshThrottleStatus(v);
                                    },
                                })}
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
                                aria-busy={busy}
                                {...register("password")}
                            />
                            {errors.password && (
                                <p className="text-xs text-rose">{errors.password.message}</p>
                            )}
                        </div>

                        {challenge && (
                            <div className="space-y-1.5 rounded-[10px] border border-cyan/30 bg-cyan/[0.06] p-3">
                                <Label htmlFor="captcha" className="text-cyan">
                                    Verificação de segurança
                                </Label>
                                <p className="text-xs text-t2">{challenge.question}</p>
                                <Input
                                    id="captcha"
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="off"
                                    placeholder="Sua resposta"
                                    value={captchaAnswer}
                                    onChange={(e) => setCaptchaAnswer(e.target.value)}
                                    required
                                />
                            </div>
                        )}

                        {error && (
                            <div
                                role="alert"
                                className="rounded-[8px] border border-rose/20 bg-rose/[0.08] px-3 py-2.5 text-sm text-rose"
                            >
                                {error}
                                {isLocked && (
                                    <div className="mt-1 font-mono text-[11px] opacity-80">
                                        Desbloqueio em {formatRetryAfter(lockSecondsLeft)}.
                                    </div>
                                )}
                            </div>
                        )}

                        <Button
                            type="submit"
                            className="w-full"
                            disabled={
                                disableAll ||
                                (challenge !== null && captchaAnswer.trim() === "")
                            }
                        >
                            {busy ? (
                                <span className="flex items-center gap-2">
                                    <Spinner size="sm" /> Entrando...
                                </span>
                            ) : isLocked ? (
                                "Bloqueado temporariamente"
                            ) : (
                                "Entrar"
                            )}
                        </Button>
                    </fieldset>
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
