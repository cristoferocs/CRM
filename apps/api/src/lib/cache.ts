/**
 * Tiny typed cache layer over Redis. Pattern: `getOrSet(key, ttl, loader)`.
 *
 * Goals:
 *  - Cut latency on hot read paths that we know don't change every second
 *    (white-label settings, lead-scoring config, knowledge-base search).
 *  - Fail open: a Redis hiccup logs a warning but never blocks the request
 *    — we just run the loader.
 *  - Compose with our request-context so cache hits / misses are
 *    correlated with reqId in logs.
 *
 * Not a write-through cache — invalidation is the caller's job. Helpers
 * `invalidate(key)` and `invalidatePrefix(prefix)` are provided for that.
 */
import { getRedis } from "./redis.js";
import { logger } from "./logger.js";

const cacheLog = logger.child({ component: "cache" });

export async function cacheGet<T>(key: string): Promise<T | null> {
    try {
        const raw = await getRedis().get(key);
        if (!raw) return null;
        return JSON.parse(raw) as T;
    } catch (err) {
        cacheLog.warn({ err, key }, "cache get failed");
        return null;
    }
}

export async function cacheSet<T>(key: string, value: T, ttlSec: number): Promise<void> {
    try {
        await getRedis().set(key, JSON.stringify(value), "EX", Math.max(1, ttlSec));
    } catch (err) {
        cacheLog.warn({ err, key }, "cache set failed");
    }
}

export async function invalidate(key: string): Promise<void> {
    try {
        await getRedis().del(key);
    } catch (err) {
        cacheLog.warn({ err, key }, "cache invalidate failed");
    }
}

/**
 * Delete every key matching `prefix*`. Uses SCAN to avoid blocking Redis
 * on large keyspaces. Safe to call on a hot path — completes async without
 * holding the request.
 */
export async function invalidatePrefix(prefix: string): Promise<void> {
    try {
        const client = getRedis();
        const stream = client.scanStream({ match: `${prefix}*`, count: 200 });
        const toDelete: string[] = [];
        for await (const keys of stream) {
            toDelete.push(...(keys as string[]));
            if (toDelete.length >= 500) {
                await client.del(...toDelete);
                toDelete.length = 0;
            }
        }
        if (toDelete.length > 0) await client.del(...toDelete);
    } catch (err) {
        cacheLog.warn({ err, prefix }, "cache invalidatePrefix failed");
    }
}

/**
 * Look up `key` in Redis; on miss, run `loader` and cache its result.
 * `loader` is awaited inline, so callers see a coherent value even on a
 * cold cache. If the value is `null`/`undefined` it is NOT cached
 * (treated as a transient miss — caller can model that with a sentinel
 * if needed).
 */
export async function getOrSet<T>(
    key: string,
    ttlSec: number,
    loader: () => Promise<T>,
): Promise<T> {
    const cached = await cacheGet<T>(key);
    if (cached !== null) return cached;

    const value = await loader();
    if (value !== null && value !== undefined) {
        await cacheSet(key, value, ttlSec);
    }
    return value;
}
