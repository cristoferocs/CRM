import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AuthUser {
    id: string;
    name: string;
    email: string;
    avatar: string | null;
    role: string;
    organizationId: string;
    branchId: string | null;
    permissions: string[];
}

interface AuthState {
    user: AuthUser | null;
    isAuthenticated: boolean;
    isLoading: boolean;

    setAuth: (user: AuthUser) => void;
    setUser: (user: AuthUser) => void;
    clearAuth: () => void;
    setLoading: (loading: boolean) => void;
}

/**
 * Auth token storage moved to HttpOnly cookies set by the API (see
 * apps/api/src/modules/auth/module.routes.ts). The browser never sees the
 * raw JWT anymore — eliminating the XSS attack surface that came with
 * localStorage. This store now only persists the user profile.
 *
 * If you have an old `crm:auth` blob in localStorage from a previous build,
 * it is silently dropped on rehydrate.
 */
function purgeLegacyTokens() {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.removeItem("crm:access_token");
        document.cookie = "crm:access_token=; path=/; max-age=0";
    } catch {
        // ignore
    }
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            isAuthenticated: false,
            isLoading: false,

            setAuth: (user) => {
                purgeLegacyTokens();
                set({ user, isAuthenticated: true });
            },

            setUser: (user) => set({ user }),

            clearAuth: () => {
                purgeLegacyTokens();
                set({ user: null, isAuthenticated: false });
            },

            setLoading: (isLoading) => set({ isLoading }),
        }),
        {
            name: "crm:auth",
            partialize: (state) => ({
                user: state.user,
                isAuthenticated: state.isAuthenticated,
            }),
            onRehydrateStorage: () => () => {
                purgeLegacyTokens();
            },
        },
    ),
);
