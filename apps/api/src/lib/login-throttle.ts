/**
 * Login attempt throttling backed by Redis.
 *
 * Tracks failed login attempts per (ip + email-or-uid) bucket and escalates:
 *   - 1..(SOFT_LIMIT-1) failures → no friction
 *   - SOFT_LIMIT..(HARD_LIMIT-1)  → captcha required on next attempt
 *   - >= HARD_LIMIT               → temporary lockout (retryAfter seconds)
 *
 * Successful logins reset the counter immediately.
 */
import { getRedis } from "./redis.js";

const ATTEMPT_PREFIX = "login:attempts:";
const LOCK_PREFIX = "login:lock:";

export const SOFT_LIMIT = Number(process.env.LOGIN_THROTTLE_SOFT_LIMIT ?? 3);
export const HARD_LIMIT = Number(process.env.LOGIN_THROTTLE_HARD_LIMIT ?? 8);
export const WINDOW_SEC = Number(process.env.LOGIN_THROTTLE_WINDOW_SEC ?? 15 * 60);
export const LOCK_SEC = Number(process.env.LOGIN_THROTTLE_LOCK_SEC ?? 15 * 60);

export interface ThrottleStatus {
    /** Number of failed attempts inside the current window. */
    attempts: number;
    /** Seconds remaining until the lock expires, 0 if not locked. */
    lockedFor: number;
    /** True once `attempts >= SOFT_LIMIT` and not yet locked. */
    captchaRequired: boolean;
    /** True once `attempts >= HARD_LIMIT` — request must be rejected. */
    locked: boolean;
}

function bucket(ip: string, subject: string): string {
    return `${ATTEMPT_PREFIX}${ip}:${subject.toLowerCase()}`;
}
function lockKey(ip: string, subject: string): string {
    return `${LOCK_PREFIX}${ip}:${subject.toLowerCase()}`;
}

export async function getThrottleStatus(
    ip: string,
    subject: string,
): Promise<ThrottleStatus> {
    const redis = getRedis();
    const [attemptsRaw, lockedTtl] = await Promise.all([
        redis.get(bucket(ip, subject)),
        redis.ttl(lockKey(ip, subject)),
    ]);
    const attempts = Number(attemptsRaw ?? 0);
    const lockedFor = lockedTtl > 0 ? lockedTtl : 0;
    return {
        attempts,
        lockedFor,
        captchaRequired: attempts >= SOFT_LIMIT && lockedFor === 0,
        locked: lockedFor > 0,
    };
}

export async function registerFailure(
    ip: string,
    subject: string,
): Promise<ThrottleStatus> {
    const redis = getRedis();
    const key = bucket(ip, subject);
    const count = await redis.incr(key);
    if (count === 1) {
        await redis.expire(key, WINDOW_SEC);
    }
    if (count >= HARD_LIMIT) {
        await redis.set(lockKey(ip, subject), "1", "EX", LOCK_SEC);
    }
    return getThrottleStatus(ip, subject);
}

export async function resetAttempts(ip: string, subject: string): Promise<void> {
    const redis = getRedis();
    await Promise.all([
        redis.del(bucket(ip, subject)),
        redis.del(lockKey(ip, subject)),
    ]);
}
