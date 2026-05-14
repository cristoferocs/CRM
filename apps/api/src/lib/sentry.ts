/**
 * Sentry bootstrap and helpers.
 *
 * Off-by-default — turns on only when SENTRY_DSN is set. Keeps CI / local
 * dev silent unless the operator explicitly opts in.
 *
 * Usage:
 *   await initSentry();             // call once at boot, before workers/Fastify
 *   captureFromWorker(err, { ... }); // from worker.on('failed')
 *   withScope(...)                   // for ad-hoc attaching of tags / context
 *
 * Fastify integration is wired in server.ts via setErrorHandler.
 */
import * as Sentry from "@sentry/node";
import { getRequestContext } from "./request-context.js";

let initialized = false;

export function initSentry(): void {
    if (initialized) return;
    const dsn = process.env.SENTRY_DSN;
    if (!dsn) return;

    Sentry.init({
        dsn,
        environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
        release: process.env.SENTRY_RELEASE,
        tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
        // Default integrations include HTTP + uncaughtException; we add a
        // beforeSend that injects reqId / org / user from AsyncLocalStorage
        // so every event has correlation even when raised deep in a service.
        beforeSend(event) {
            const ctx = getRequestContext();
            if (ctx) {
                event.tags = { ...(event.tags ?? {}), reqId: ctx.reqId };
                if (ctx.orgId) event.tags.orgId = ctx.orgId;
                if (ctx.userId) {
                    event.user = { ...(event.user ?? {}), id: ctx.userId };
                }
            }
            return event;
        },
    });

    initialized = true;
}

export function isSentryEnabled(): boolean {
    return initialized;
}

export function captureFromWorker(
    err: unknown,
    context: { worker: string; jobId?: string; jobType?: string; reqId?: string },
): void {
    if (!initialized) return;
    Sentry.withScope((scope) => {
        scope.setTag("source", "worker");
        scope.setTag("worker", context.worker);
        if (context.jobType) scope.setTag("jobType", context.jobType);
        if (context.jobId) scope.setExtra("jobId", context.jobId);
        if (context.reqId) scope.setTag("reqId", context.reqId);
        Sentry.captureException(err);
    });
}

export function captureFromSocket(
    err: unknown,
    context: { event?: string; reqId?: string; orgId?: string },
): void {
    if (!initialized) return;
    Sentry.withScope((scope) => {
        scope.setTag("source", "socket.io");
        if (context.event) scope.setTag("event", context.event);
        if (context.reqId) scope.setTag("reqId", context.reqId);
        if (context.orgId) scope.setTag("orgId", context.orgId);
        Sentry.captureException(err);
    });
}

/** Re-export so call sites don't need to import @sentry/node directly. */
export const sentry = Sentry;
