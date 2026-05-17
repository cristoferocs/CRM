import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { AuthService } from "./module.service.js";
import {
    LoginSchema,
    LoginResponseSchema,
    MeResponseSchema,
    RefreshSchema,
    RefreshResponseSchema,
    DevLoginSchema,
    ChallengeResponseSchema,
    type LoginInput,
    type RefreshInput,
    type DevLoginInput,
} from "./module.schema.js";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "../../plugins/auth.plugin.js";
import {
    JWT_TTL,
    markRefreshExchange,
    revokeJti,
    revokeUserFamily,
} from "../../lib/jwt-revocation.js";
import {
    getThrottleStatus,
    registerFailure,
    resetAttempts,
} from "../../lib/login-throttle.js";
import { issueChallenge, consumeChallenge } from "../../lib/captcha.js";

interface IssuedTokens {
    accessToken: string;
    refreshToken: string;
    accessJti: string;
    refreshJti: string;
}

function setAuthCookies(reply: FastifyReply, tokens: IssuedTokens) {
    const isProd = process.env.NODE_ENV === "production";
    reply.setCookie(ACCESS_COOKIE, tokens.accessToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: "strict",
        path: "/",
        maxAge: JWT_TTL.accessSec,
    });
    reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: "strict",
        path: "/auth", // Only sent to /auth/* (refresh, logout) — narrower attack surface.
        maxAge: JWT_TTL.refreshSec,
    });
}

function clearAuthCookies(reply: FastifyReply) {
    reply.clearCookie(ACCESS_COOKIE, { path: "/" });
    reply.clearCookie(REFRESH_COOKIE, { path: "/auth" });
}

export const authRoutes: FastifyPluginAsync = async (fastify) => {
    const service = new AuthService();

    function issueTokens(user: { id: string; orgId: string | null; role: string; email: string }): IssuedTokens {
        const accessJti = randomUUID();
        const refreshJti = randomUUID();
        const accessToken = fastify.jwt.sign(
            { id: user.id, orgId: user.orgId ?? undefined, role: user.role, email: user.email, jti: accessJti },
            { expiresIn: "1h" },
        );
        const refreshToken = fastify.jwt.sign(
            { id: user.id, type: "refresh", jti: refreshJti },
            { expiresIn: "7d" },
        );
        return { accessToken, refreshToken, accessJti, refreshJti };
    }

    /**
     * Block the request when the (ip, subject) bucket is locked, and demand a
     * solved captcha challenge once the soft threshold has been crossed.
     * Throws a structured error consumed by the front-end via err.code.
     */
    async function enforceThrottle(
        ip: string,
        subject: string,
        captchaId: string | undefined,
        captchaAnswer: string | number | undefined,
    ) {
        const status = await getThrottleStatus(ip, subject);
        if (status.locked) {
            throw Object.assign(
                new Error(
                    `Muitas tentativas. Tente novamente em ${Math.ceil(status.lockedFor / 60)} minutos.`,
                ),
                { statusCode: 429, code: "LOGIN_LOCKED", retryAfter: status.lockedFor },
            );
        }
        if (status.captchaRequired) {
            const ok = await consumeChallenge(captchaId, captchaAnswer);
            if (!ok) {
                throw Object.assign(
                    new Error("Verificação de segurança necessária."),
                    { statusCode: 428, code: "CAPTCHA_REQUIRED" },
                );
            }
        }
    }

    // GET /auth/challenge — issue a single-use human-verification challenge.
    fastify.get(
        "/challenge",
        {
            config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
            schema: { response: { 200: ChallengeResponseSchema } },
        },
        async () => issueChallenge(),
    );

    // GET /auth/throttle-status?subject=<email> — lets the client know
    // whether captcha will be required / how long the IP is locked.
    fastify.get(
        "/throttle-status",
        {
            config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
            schema: {
                querystring: { type: "object", properties: { subject: { type: "string" } }, required: ["subject"] },
                response: {
                    200: {
                        type: "object",
                        properties: {
                            captchaRequired: { type: "boolean" },
                            locked: { type: "boolean" },
                            lockedFor: { type: "number" },
                        },
                        required: ["captchaRequired", "locked", "lockedFor"],
                    },
                },
            },
        },
        async (request) => {
            const subject = String((request.query as { subject?: string }).subject ?? "");
            const status = await getThrottleStatus(request.ip, subject);
            return {
                captchaRequired: status.captchaRequired,
                locked: status.locked,
                lockedFor: status.lockedFor,
            };
        },
    );

    // POST /auth/login
    fastify.post(
        "/login",
        {
            config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
            schema: {
                body: LoginSchema,
                response: { 200: LoginResponseSchema },
            },
        },
        async (request, reply) => {
            const { firebaseToken, captchaId, captchaAnswer } = request.body as LoginInput;

            // Decode first (cheaply) to know which email bucket to throttle.
            const decoded = await service.verifyFirebaseToken(firebaseToken);
            const subject = decoded.email ?? decoded.uid;

            await enforceThrottle(request.ip, subject, captchaId, captchaAnswer);

            try {
                const user = await service.loginOrRegister(decoded.uid, decoded.email ?? "");
                await resetAttempts(request.ip, subject);
                const tokens = issueTokens(user);
                setAuthCookies(reply, tokens);
                return reply.send({
                    accessToken: tokens.accessToken,
                    refreshToken: tokens.refreshToken,
                    user,
                });
            } catch (err) {
                await registerFailure(request.ip, subject);
                throw err;
            }
        },
    );

    // POST /auth/dev-login (NODE_ENV !== production, and only when explicitly enabled)
    const devLoginEnabled =
        process.env.NODE_ENV !== "production" && process.env.ENABLE_DEV_LOGIN !== "false";
    if (devLoginEnabled) {
        fastify.post(
            "/dev-login",
            {
                config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
                schema: {
                    body: DevLoginSchema,
                    response: { 200: LoginResponseSchema },
                },
            },
            async (request, reply) => {
                const { email, password, captchaId, captchaAnswer } = request.body as DevLoginInput;
                request.log.info({ email, ip: request.ip }, "dev-login attempt");

                await enforceThrottle(request.ip, email, captchaId, captchaAnswer);

                try {
                    const user = await service.devLogin(email, password);
                    await resetAttempts(request.ip, email);
                    const tokens = issueTokens(user);
                    setAuthCookies(reply, tokens);
                    return reply.send({
                        accessToken: tokens.accessToken,
                        refreshToken: tokens.refreshToken,
                        user,
                    });
                } catch (err) {
                    await registerFailure(request.ip, email);
                    throw err;
                }
            },
        );
    }

    // GET /auth/me
    fastify.get(
        "/me",
        {
            onRequest: [fastify.verifyJWT],
            schema: {
                response: { 200: MeResponseSchema },
            },
        },
        async (request) => {
            return service.me(request.user.id!);
        },
    );

    // POST /auth/refresh — rotates the refresh token and detects reuse.
    fastify.post(
        "/refresh",
        {
            config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
            schema: {
                // body remains optional — falls back to the HttpOnly cookie.
                body: RefreshSchema.partial(),
                response: { 200: RefreshResponseSchema },
            },
        },
        async (request, reply) => {
            const cookieToken = request.cookies[REFRESH_COOKIE];
            const bodyToken = (request.body as RefreshInput | undefined)?.refreshToken;
            const refreshToken = cookieToken ?? bodyToken;
            if (!refreshToken) {
                throw Object.assign(new Error("Missing refresh token"), { statusCode: 401 });
            }

            let payload: { id: string; type?: string; jti?: string; iat?: number };
            try {
                payload = fastify.jwt.verify<{ id: string; type?: string; jti?: string; iat?: number }>(
                    refreshToken,
                );
            } catch {
                throw Object.assign(new Error("Invalid or expired refresh token"), { statusCode: 401 });
            }

            if (payload.type !== "refresh" || !payload.jti) {
                throw Object.assign(new Error("Not a refresh token"), { statusCode: 401 });
            }

            // Reuse detection: a refresh jti is only allowed to be exchanged once.
            // If we've already seen it, someone is using a stolen / replayed token
            // — wipe the whole token family for this user and require re-login.
            const first = await markRefreshExchange(payload.jti);
            if (!first) {
                request.log.warn({ userId: payload.id, jti: payload.jti }, "refresh token reuse — revoking family");
                await revokeUserFamily(payload.id);
                clearAuthCookies(reply);
                throw Object.assign(
                    new Error("Refresh token already used — session revoked, please log in again."),
                    { statusCode: 401 },
                );
            }

            // Old refresh jti is dead from this point on.
            await revokeJti(payload.jti, JWT_TTL.refreshSec);

            const user = await service.me(payload.id);
            const tokens = issueTokens(user);
            setAuthCookies(reply, tokens);

            return reply.send({
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
            });
        },
    );

    // POST /auth/logout — clears cookies and revokes both current jtis.
    // Reads the access token from cookie OR Authorization header.
    fastify.post(
        "/logout",
        {
            schema: {
                response: { 200: { type: "object", properties: { ok: { type: "boolean" } } } },
            },
        },
        async (request, reply) => {
            // Best-effort revoke — don't fail logout if Redis is down.
            try {
                await request.jwtVerify<{ jti?: string }>();
                const accessJti = (request.user as { jti?: string })?.jti;
                if (accessJti) await revokeJti(accessJti, JWT_TTL.accessSec);
            } catch {
                // No / invalid access token — still clear the cookies.
            }
            const refreshToken = request.cookies[REFRESH_COOKIE];
            if (refreshToken) {
                try {
                    const payload = fastify.jwt.verify<{ jti?: string }>(refreshToken);
                    if (payload.jti) await revokeJti(payload.jti, JWT_TTL.refreshSec);
                } catch {
                    // Expired / forged — clearing the cookie is still useful.
                }
            }
            clearAuthCookies(reply);
            return reply.send({ ok: true });
        },
    );
};
