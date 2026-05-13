import axios from "axios";
import type { InternalAxiosRequestConfig, AxiosError } from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";

export const api = axios.create({
    baseURL: API_BASE,
    headers: {
        "Content-Type": "application/json",
    },
    timeout: 30_000,
});

// ── Request interceptor: attach JWT ────────────────────────────────────────
api.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
        // Token stored by auth store — read directly to avoid circular dep
        const token =
            typeof window !== "undefined"
                ? localStorage.getItem("crm:access_token")
                : null;
        if (token && config.headers) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error),
);

// ── Response interceptor: handle 401 ──────────────────────────────────────
api.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        if (error.response?.status === 401) {
            if (typeof window !== "undefined") {
                // Wipe both the raw token and the persisted Zustand auth store
                // (otherwise the login page redirects right back to "/" and loops).
                localStorage.removeItem("crm:access_token");
                localStorage.removeItem("crm:auth");
                document.cookie = "crm:access_token=; Max-Age=0; path=/";

                // Avoid bouncing to /login if we are already there — that would
                // cause the page to reload in a loop while the user is typing.
                if (!window.location.pathname.startsWith("/login")) {
                    window.location.href = "/login";
                }
            }
        }
        return Promise.reject(error);
    },
);

export default api;
