import axios from "axios";
import type { AxiosError, AxiosRequestConfig } from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";

/**
 * Browser auth model: the API sets an HttpOnly cookie at login that is sent
 * automatically with every cross-site request thanks to `withCredentials`.
 * We no longer read or attach a JWT from localStorage — eliminates the XSS
 * attack surface.
 *
 * If the API is on a different origin than the front-end, the API's CORS
 * config must echo `Access-Control-Allow-Credentials: true` and the cookie
 * must be `SameSite=None; Secure` in production (we use `SameSite=Strict`
 * by default for tighter CSRF — works when API and web share a parent
 * domain in production).
 */
export const api = axios.create({
    baseURL: API_BASE,
    headers: {
        "Content-Type": "application/json",
    },
    timeout: 30_000,
    withCredentials: true,
});

let isRefreshing = false;
let pendingRefresh: Promise<void> | null = null;

async function refreshSession(): Promise<void> {
    if (pendingRefresh) return pendingRefresh;
    isRefreshing = true;
    pendingRefresh = axios
        .post(`${API_BASE}/auth/refresh`, {}, { withCredentials: true })
        .then(() => undefined)
        .finally(() => {
            isRefreshing = false;
            pendingRefresh = null;
        });
    return pendingRefresh;
}

// ── Response interceptor: 401 → try refresh once, then bounce to /login ───
api.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        const status = error.response?.status;
        const originalRequest = error.config as
            | (AxiosRequestConfig & { _retried?: boolean; url?: string })
            | undefined;

        // Don't try to refresh /auth/* endpoints — that would loop.
        const isAuthEndpoint = originalRequest?.url?.includes("/auth/");
        if (status === 401 && originalRequest && !originalRequest._retried && !isAuthEndpoint) {
            originalRequest._retried = true;
            try {
                await refreshSession();
                return api.request(originalRequest);
            } catch {
                // Fall through to logout below.
            }
        }

        if (status === 401 && typeof window !== "undefined" && !isRefreshing) {
            try {
                window.localStorage.removeItem("crm:auth");
                window.localStorage.removeItem("crm:access_token");
                document.cookie = "crm:access_token=; Max-Age=0; path=/";
            } catch {
                // ignore
            }
            if (!window.location.pathname.startsWith("/login")) {
                window.location.href = "/login";
            }
        }
        return Promise.reject(error);
    },
);

export default api;
