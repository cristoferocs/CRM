/**
 * Single Pino logger used outside Fastify (workers, schedulers, boot
 * scripts). Inside an HTTP request you should still prefer `request.log`
 * — it auto-binds reqId for you. This logger is for everything else.
 *
 * To get correlation in worker logs, create a child with `{ reqId }`:
 *
 *   const log = workerLogger.child({ worker: "automation", reqId });
 *   log.info({ jobId }, "processing");
 *
 * PII redaction is on by default for fields we know carry contact /
 * authentication data. Anything matching a path below is replaced with
 * `[REDACTED]` before serialization, so accidental wide logs of `deal`,
 * `contact`, or `user` objects still don't leak phone numbers, emails,
 * CPFs, or tokens. Add new paths here when introducing new sensitive
 * fields.
 */
import { pino } from "pino";
import { getReqId } from "./request-context.js";

const REDACT_PATHS = [
    // Direct sensitive headers / auth payloads
    "req.headers.authorization",
    "req.headers.cookie",
    "headers.authorization",
    "headers.cookie",
    "*.password",
    "*.passwordHash",
    "*.firebaseToken",
    "*.accessToken",
    "*.refreshToken",
    "*.token",
    "*.apiKey",
    "*.api_key",
    "*.secret",
    "*.credentials",
    // Contact / user PII at any depth
    "*.email",
    "*.phone",
    "*.document",   // CPF / CNPJ
    "*.cpf",
    "*.cnpj",
    "*.taxId",
    "contact.email",
    "contact.phone",
    "contact.document",
    "user.email",
    "user.phone",
    "user.document",
    // Webhook bodies (often carry message text + sender phone)
    "payload.contacts",
    "payload.messages",
    "payload.statuses",
];

export const logger = pino({
    level: process.env.LOG_LEVEL ?? "info",
    base: { service: "crm-api" },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
        paths: REDACT_PATHS,
        censor: "[REDACTED]",
        remove: false,
    },
    // Mix in current AsyncLocalStorage reqId on every log line when present —
    // lets workers that re-enter the context get correlation "for free".
    mixin() {
        const reqId = getReqId();
        return reqId ? { reqId } : {};
    },
});

export type Logger = typeof logger;

/**
 * Helper for redacting PII at call sites that build their own log payloads
 * (e.g. AuditLog rows, AutomationLog executedActions). Keeps key shapes
 * intact for downstream consumers, but replaces sensitive values.
 */
const SENSITIVE_KEYS = new Set([
    "password", "passwordHash", "token", "accessToken", "refreshToken",
    "firebaseToken", "apiKey", "secret", "credentials", "authorization",
    "email", "phone", "document", "cpf", "cnpj", "taxId",
]);

export function redactPii<T>(value: T): T {
    if (value === null || value === undefined || typeof value !== "object") {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(redactPii) as unknown as T;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (SENSITIVE_KEYS.has(k.toLowerCase())) {
            out[k] = "[REDACTED]";
        } else if (v && typeof v === "object") {
            out[k] = redactPii(v);
        } else {
            out[k] = v;
        }
    }
    return out as T;
}
