/**
 * Lightweight async request context backed by Node's AsyncLocalStorage.
 *
 * Set by the Fastify onRequest hook for every inbound request; read
 * transparently from anywhere downstream (services, repositories, queue
 * helpers, LLM provider wrappers) so we can stamp logs and out-of-process
 * messages with the originating reqId / orgId / userId.
 *
 * Outside a request (boot, cron sweep, BullMQ worker without a parent
 * request) the store is undefined and helpers degrade gracefully.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
    reqId: string;
    orgId?: string;
    userId?: string;
    role?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
    return requestContext.getStore();
}

export function getReqId(): string | undefined {
    return requestContext.getStore()?.reqId;
}

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
    return requestContext.run(ctx, fn);
}

/** Decorate an arbitrary object with the current reqId for cross-process plumbing. */
export function withReqId<T extends Record<string, unknown>>(payload: T): T & { reqId?: string } {
    const reqId = getReqId();
    if (!reqId) return payload;
    return { ...payload, reqId };
}
