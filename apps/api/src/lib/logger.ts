/**
 * Single Pino logger used outside Fastify (workers, schedulers, boot
 * scripts). Inside an HTTP request you should still prefer `request.log`
 * — it auto-binds reqId for you. This logger is for everything else.
 *
 * To get correlation in worker logs, create a child with `{ reqId }`:
 *
 *   const log = workerLogger.child({ worker: "automation", reqId });
 *   log.info({ jobId }, "processing");
 */
import { pino } from "pino";
import { getReqId } from "./request-context.js";

export const logger = pino({
    level: process.env.LOG_LEVEL ?? "info",
    base: { service: "crm-api" },
    timestamp: pino.stdTimeFunctions.isoTime,
    // Mix in current AsyncLocalStorage reqId on every log line when present —
    // lets workers that re-enter the context get correlation "for free".
    mixin() {
        const reqId = getReqId();
        return reqId ? { reqId } : {};
    },
});

export type Logger = typeof logger;
