/**
 * Lightweight challenge-response captcha used to verify human intent on
 * the login endpoint after suspicious activity is detected. We deliberately
 * avoid third-party services here so the platform works offline / on-prem;
 * the goal is to break naive credential-stuffing bots, not nation-state
 * actors. For higher-assurance deployments, swap this module for hCaptcha
 * or reCAPTCHA Enterprise.
 *
 * Flow:
 *   1. Client requests GET /auth/challenge
 *   2. Server stores `{ answer }` in Redis under a random `challengeId`
 *      with a short TTL, and returns `{ challengeId, question }`
 *   3. Client submits the answer with the login body
 *   4. Server `consumeChallenge(challengeId, answer)` — single-use, must
 *      match, must not be expired
 */
import { randomBytes, randomInt } from "node:crypto";
import { getRedis } from "./redis.js";

const PREFIX = "login:challenge:";
const TTL_SEC = 5 * 60;

export interface IssuedChallenge {
    challengeId: string;
    question: string;
}

export async function issueChallenge(): Promise<IssuedChallenge> {
    const a = randomInt(2, 12);
    const b = randomInt(2, 12);
    const op = randomInt(0, 2) === 0 ? "+" : "×";
    const answer = op === "+" ? a + b : a * b;
    const question = `Quanto é ${a} ${op} ${b}?`;
    const challengeId = randomBytes(16).toString("hex");
    await getRedis().set(PREFIX + challengeId, String(answer), "EX", TTL_SEC);
    return { challengeId, question };
}

/**
 * Returns true if the challenge existed, matched, and was consumed.
 * A challenge can only be consumed once — even a wrong answer burns it.
 */
export async function consumeChallenge(
    challengeId: string | undefined,
    rawAnswer: string | number | undefined,
): Promise<boolean> {
    if (!challengeId || rawAnswer === undefined || rawAnswer === null) return false;
    const redis = getRedis();
    const key = PREFIX + challengeId;
    const expected = await redis.get(key);
    // Single-use: drop the challenge regardless of correctness.
    await redis.del(key);
    if (!expected) return false;
    const parsed = Number(String(rawAnswer).trim());
    if (!Number.isFinite(parsed)) return false;
    return parsed === Number(expected);
}
