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
    const { setAuth, clearAuth, user, token, isAuthenticated, isLoading } =
        useAuthStore();

    // ── Fetch current user from API ──────────────────────────────────────────
    const meQuery = useQuery({
        queryKey: ["auth", "me"],
        queryFn: async () => {
            const { data } = await api.get("/auth/me");
            return data;
        },
        enabled: !!token,
        staleTime: 1000 * 60 * 5,
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
                return data as {
                    user: Parameters<typeof setAuth>[0];
                    accessToken: string;
                };
            }
            const credential = await signInWithEmailAndPassword(
                firebaseAuth,
                email,
                password,
            );
            const firebaseToken = await credential.user.getIdToken();
            const { data } = await api.post("/auth/login", { firebaseToken });
            return data as {
                user: Parameters<typeof setAuth>[0];
                accessToken: string;
            };
        },
        onSuccess: ({ user, accessToken }) => {
            setAuth(user, accessToken);
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
            return data as {
                user: Parameters<typeof setAuth>[0];
                accessToken: string;
            };
        },
        onSuccess: ({ user, accessToken }) => {
            setAuth(user, accessToken);
            router.push("/");
        },
    });

    // ── Logout ───────────────────────────────────────────────────────────────
    const logout = useCallback(async () => {
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
        token,
        isAuthenticated,
        isLoading: isLoading || meQuery.isLoading,
        loginWithEmail,
        loginWithGoogle,
        logout,
        isDevMode: USE_DEV_LOGIN,
    };
}
