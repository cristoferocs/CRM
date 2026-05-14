"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import {
    signInWithEmailAndPassword,
    signInWithPopup,
    GoogleAuthProvider,
    signOut as firebaseSignOut,
} from "firebase/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { firebaseAuth } from "@/lib/firebase";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth.store";

const googleProvider = new GoogleAuthProvider();

/**
 * When the real Firebase project isn't configured (local dev), we bypass
 * Firebase entirely and authenticate against the API's `/auth/dev-login`
 * endpoint using the platform default super-admin credentials.
 */
const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const USE_DEV_LOGIN =
    !FIREBASE_API_KEY ||
    FIREBASE_API_KEY === "build-placeholder" ||
    process.env.NEXT_PUBLIC_USE_DEV_LOGIN === "1";

export function useAuth() {
    const router = useRouter();
    const qc = useQueryClient();
    const { setAuth, clearAuth, user, isAuthenticated, isLoading } =
        useAuthStore();

    // ── Fetch current user from API ──────────────────────────────────────────
    // The HttpOnly auth cookie is sent automatically by axios (withCredentials:true)
    // so we can just hit /auth/me and rely on the server for the source of truth.
    const meQuery = useQuery({
        queryKey: ["auth", "me"],
        queryFn: async () => {
            const { data } = await api.get("/auth/me");
            return data;
        },
        enabled: isAuthenticated,
        staleTime: 1000 * 60 * 5,
        retry: false,
    });

    // ── Login with email/password ────────────────────────────────────────────
    const loginWithEmail = useMutation({
        mutationFn: async ({
            email,
            password,
        }: {
            email: string;
            password: string;
        }) => {
            if (USE_DEV_LOGIN) {
                const { data } = await api.post("/auth/dev-login", { email, password });
                return data as { user: Parameters<typeof setAuth>[0] };
            }
            const credential = await signInWithEmailAndPassword(
                firebaseAuth,
                email,
                password,
            );
            const firebaseToken = await credential.user.getIdToken();
            const { data } = await api.post("/auth/login", { firebaseToken });
            return data as { user: Parameters<typeof setAuth>[0] };
        },
        onSuccess: ({ user }) => {
            setAuth(user);
            router.push("/");
        },
    });

    // ── Login with Google ────────────────────────────────────────────────────
    const loginWithGoogle = useMutation({
        mutationFn: async () => {
            if (USE_DEV_LOGIN) {
                throw new Error(
                    "Login com Google indisponível em modo de desenvolvimento. " +
                    "Use e-mail e senha do administrador padrão.",
                );
            }
            const result = await signInWithPopup(firebaseAuth, googleProvider);
            const firebaseToken = await result.user.getIdToken();
            const { data } = await api.post("/auth/login", { firebaseToken });
            return data as { user: Parameters<typeof setAuth>[0] };
        },
        onSuccess: ({ user }) => {
            setAuth(user);
            router.push("/");
        },
    });

    // ── Logout ───────────────────────────────────────────────────────────────
    const logout = useCallback(async () => {
        // Hit the API first so it can clear cookies + revoke the jti.
        try {
            await api.post("/auth/logout");
        } catch {
            // ignore — we still want to clear local state.
        }
        if (!USE_DEV_LOGIN) {
            try {
                await firebaseSignOut(firebaseAuth);
            } catch {
                // ignore — Firebase may not be initialized
            }
        }
        clearAuth();
        qc.clear();
        router.push("/login");
    }, [clearAuth, qc, router]);

    return {
        user: meQuery.data ?? user,
        isAuthenticated,
        isLoading: isLoading || meQuery.isLoading,
        loginWithEmail,
        loginWithGoogle,
        logout,
        isDevMode: USE_DEV_LOGIN,
    };
}
