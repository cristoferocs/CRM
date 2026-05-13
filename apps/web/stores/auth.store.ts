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
    token: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;

    setAuth: (user: AuthUser, token: string) => void;
    setUser: (user: AuthUser) => void;
    setToken: (token: string) => void;
    clearAuth: () => void;
    setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,

            setAuth: (user, token) => {
                localStorage.setItem("crm:access_token", token);
                const maxAge = 7 * 24 * 60 * 60; // 7 days, matches JWT_EXPIRES_IN
                document.cookie = `crm:access_token=${token}; path=/; SameSite=Lax; max-age=${maxAge}`;
                set({ user, token, isAuthenticated: true });
            },

            setUser: (user) => set({ user }),

            setToken: (token) => {
                localStorage.setItem("crm:access_token", token);
                const maxAge = 7 * 24 * 60 * 60;
                document.cookie = `crm:access_token=${token}; path=/; SameSite=Lax; max-age=${maxAge}`;
                set({ token, isAuthenticated: true });
            },

            clearAuth: () => {
                localStorage.removeItem("crm:access_token");
                document.cookie = "crm:access_token=; path=/; max-age=0";
                set({ user: null, token: null, isAuthenticated: false });
            },

            setLoading: (isLoading) => set({ isLoading }),
        }),
        {
            name: "crm:auth",
            partialize: (state) => ({
                user: state.user,
                token: state.token,
                isAuthenticated: state.isAuthenticated,
            }),
        },
    ),
);
