import crypto from "node:crypto";

function timingSafeStrEq(a: string, b: string): boolean {
    if (typeof a !== "string" || typeof b !== "string") return false;
    if (a.length !== b.length) return false;
    try {
        return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
    } catch {
        return false;
    }
}

export function verifyMetaSignature(
    rawBody: Buffer | string | undefined,
    signatureHeader: string | undefined,
    appSecret: string | undefined,
): boolean {
    if (!rawBody || !signatureHeader || !appSecret) return false;
    if (!signatureHeader.startsWith("sha256=")) return false;
    const provided = signatureHeader.slice("sha256=".length);
    const buf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
    const computed = crypto.createHmac("sha256", appSecret).update(buf).digest("hex");
    return timingSafeStrEq(computed, provided);
}

export function verifyEvolutionApiKey(
    headerValue: string | undefined,
    expected: string | undefined,
): boolean {
    if (!headerValue || !expected) return false;
    return timingSafeStrEq(headerValue, expected);
}

export function verifyStripeSignature(
    rawBody: Buffer | string | undefined,
    signatureHeader: string | undefined,
    webhookSecret: string | undefined,
    toleranceSec = 300,
): boolean {
    if (!rawBody || !signatureHeader || !webhookSecret) return false;
    const parts = signatureHeader.split(",").map((p) => p.trim());
    const tsPart = parts.find((p) => p.startsWith("t="));
    const v1Part = parts.find((p) => p.startsWith("v1="));
    if (!tsPart || !v1Part) return false;
    const ts = Number(tsPart.slice(2));
    const v1 = v1Part.slice(3);
    if (!Number.isFinite(ts)) return false;
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - ts) > toleranceSec) return false;
    const buf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
    const signedPayload = Buffer.concat([Buffer.from(`${ts}.`), buf]);
    const computed = crypto
        .createHmac("sha256", webhookSecret)
        .update(signedPayload)
        .digest("hex");
    return timingSafeStrEq(computed, v1);
}

export function verifyGenericHmacSha256(
    rawBody: Buffer | string | undefined,
    providedHex: string | undefined,
    secret: string | undefined,
): boolean {
    if (!rawBody || !providedHex || !secret) return false;
    const buf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
    const computed = crypto.createHmac("sha256", secret).update(buf).digest("hex");
    return timingSafeStrEq(computed, providedHex);
}
