import type { FastifyPluginAsync } from "fastify";
import { AuthService } from "./module.service.js";
import {
    LoginSchema,
    LoginResponseSchema,
    MeResponseSchema,
    RefreshSchema,
    RefreshResponseSchema,
    DevLoginSchema,
    type LoginInput,
    type RefreshInput,
    type DevLoginInput,
} from "./module.schema.js";

export const authRoutes: FastifyPluginAsync = async (fastify) => {
    const service = new AuthService();

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
            const { firebaseToken } = request.body as LoginInput;

            const decoded = await service.verifyFirebaseToken(firebaseToken);
            const user = await service.loginOrRegister(decoded.uid, decoded.email ?? "");

            const accessToken = fastify.jwt.sign(
                { id: user.id, orgId: user.orgId, role: user.role, email: user.email },
                { expiresIn: "1h" },
            );
            const refreshToken = fastify.jwt.sign(
                { id: user.id, type: "refresh" },
                { expiresIn: "7d" },
            );

            return reply.send({ accessToken, refreshToken, user });
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
                const { email, password } = request.body as DevLoginInput;
                request.log.info({ email, ip: request.ip }, "dev-login attempt");
                const user = await service.devLogin(email, password);

                const accessToken = fastify.jwt.sign(
                    { id: user.id, orgId: user.orgId, role: user.role, email: user.email },
                    { expiresIn: "1h" },
                );
                const refreshToken = fastify.jwt.sign(
                    { id: user.id, type: "refresh" },
                    { expiresIn: "7d" },
                );

                return reply.send({ accessToken, refreshToken, user });
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

    // POST /auth/refresh
    fastify.post(
        "/refresh",
        {
            schema: {
                body: RefreshSchema,
                response: { 200: RefreshResponseSchema },
            },
        },
        async (request, reply) => {
            const { refreshToken } = request.body as RefreshInput;

            let payload: { id: string; type?: string };
            try {
                payload = fastify.jwt.verify<{ id: string; type?: string }>(refreshToken);
            } catch {
                throw Object.assign(new Error("Invalid or expired refresh token"), { statusCode: 401 });
            }

            if (payload.type !== "refresh") {
                throw Object.assign(new Error("Not a refresh token"), { statusCode: 401 });
            }

            const user = await service.me(payload.id);
            const accessToken = fastify.jwt.sign(
                { id: user.id, orgId: user.orgId, role: user.role, email: user.email },
                { expiresIn: "1h" },
            );

            return reply.send({ accessToken });
        },
    );
};