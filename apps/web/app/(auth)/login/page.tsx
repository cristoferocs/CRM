"use client";

import { useWhiteLabelStore } from "@/stores/white-label.store";
import { Logo } from "@/components/ui/logo";

export default function LoginPage() {
    const { loginBackground, loginTagline, primaryColor } = useWhiteLabelStore(
        (s) => s.settings,
    );

    const backgroundStyle = loginBackground
        ? {
            backgroundImage: `url(${loginBackground})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
        }
        : {
            background: `linear-gradient(135deg, ${primaryColor}22 0%, ${primaryColor}11 100%)`,
        };

    return (
        <div className="flex min-h-screen items-center justify-center" style={backgroundStyle}>
            {/* Backdrop blur card */}
            <div className="w-full max-w-sm rounded-2xl border border-white/30 bg-white/80 p-8 shadow-xl backdrop-blur-sm">
                {/* Logo */}
                <div className="mb-6 flex flex-col items-center gap-3">
                    <Logo size="lg" />
                    {loginTagline && (
                        <p className="text-center text-sm text-slate-500">{loginTagline}</p>
                    )}
                </div>

                {/* Login form placeholder — replace with real auth form */}
                <form className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-slate-600" htmlFor="email">
                            E-mail
                        </label>
                        <input
                            id="email"
                            type="email"
                            autoComplete="email"
                            placeholder="voce@empresa.com.br"
                            className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                        />
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-slate-600" htmlFor="password">
                            Senha
                        </label>
                        <input
                            id="password"
                            type="password"
                            autoComplete="current-password"
                            placeholder="••••••••"
                            className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
                        />
                    </div>

                    <button
                        type="submit"
                        className="mt-2 rounded-lg py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                        style={{ backgroundColor: "var(--color-primary)" }}
                    >
                        Entrar
                    </button>
                </form>
            </div>
        </div>
    );
}
