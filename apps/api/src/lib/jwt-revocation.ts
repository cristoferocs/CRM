/**
 * JWT revocation list backed by Redis.
 *
 * We sign every access / refresh token with a `jti` (JWT ID, a random UUID).
 * Logout, refresh-token rotation, and "session compromised" events insert
 * that jti into a Redis SET keyed `jwt:revoked` with a TTL matching the
 * token's remaining lifetime. The authPlugin checks the SET on every
 * authenticated request and rejects revoked jtis with 401.
 *
 * For refresh-token reuse detection we also stamp each refresh jti into
 * `jwt:refresh-seen:<jti>` on the FIRST exchange; if it ever shows up
 * again we treat it as theft, revoke the entire user-token-family, and
 * force a re-login.
 */
import { getRedis } from "./redis.js";

const REVOKED_PREFIX = "jwt:revoked:";
const REFRESH_SEEN_PREFIX = "jwt:refresh-seen:";
const USER_FAMILY_PREFIX = "jwt:user-revoked:";

const ACCESS_TTL_SEC = 60 * 60; // 1h — matches access token expiresIn
const REFRESH_TTL_SEC = 7 * 24 * 60 * 60; // 7d — matches refresh token expiresIn

export async function revokeJti(jti: string, ttlSec: number = REFRESH_TTL_SEC): Promise<void> {
    await getRedis().set(REVOKED_PREFIX + jti, "1", "EX", Math.max(60, ttlSec));
}

export async function isJtiRevoked(jti: string | undefined | null): Promise<boolean> {
    if (!jti) return false;
    const v = await getRedis().get(REVOKED_PREFIX + jti);
    return v === "1";
}

/**
 * Mark a refresh-token jti as "exchanged once". Returns true if this is the
 * first exchange (allow), false if the jti was already seen (reuse → suspect
 * theft, caller should revoke the family).
 */
export async function markRefreshExchange(jti: string): Promise<boolean> {
    const result = await getRedis().set(
        REFRESH_SEEN_PREFIX + jti,
        "1",
        "EX",
        REFRESH_TTL_SEC,
        "NX",
    );
    return result === "OK";
}

/**
 * Revoke every token issued to a given user (used when refresh-token reuse
 * is detected — we don't know which family of tokens is compromised, so we
 * blow up all of them). Records a revocation timestamp; tokens issued before
 * that ts are considered revoked even without a per-jti entry.
 */
export async function revokeUserFamily(userId: string): Promise<void> {
    await getRedis().set(
        USER_FAMILY_PREFIX + userId,
        String(Date.now()),
        "EX",
        REFRESH_TTL_SEC,
    );
}

export async function isUserFamilyRevokedSince(
    userId: string,
    tokenIssuedAt: number,
): Promise<boolean> {
    const v = await getRedis().get(USER_FAMILY_PREFIX + userId);
    if (!v) return false;
    return Number(v) > tokenIssuedAt * 1000; // iat is in seconds
}

export const JWT_TTL = {
    accessSec: ACCESS_TTL_SEC,
    refreshSec: REFRESH_TTL_SEC,
};
