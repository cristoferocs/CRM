import { Redis } from "ioredis";

let redis: Redis | null = null;

export function getRedis() {
    if (!redis) {
        redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
            maxRetriesPerRequest: null
        });
    }

    return redis;
}

export async function closeRedis() {
    if (redis) {
        await redis.quit();
        redis = null;
    }
}