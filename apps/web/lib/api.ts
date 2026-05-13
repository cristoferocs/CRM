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
            // Clear stored tokens and redirect to login
            if (typeof window !== "undefined") {
                localStorage.removeItem("crm:access_token");
                window.location.href = "/login";
            }
        }
        return Promise.reject(error);
    },
);

export default api;
