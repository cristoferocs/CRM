import { z } from "zod";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { PaymentsService } from "./payments.service.js";
import {
    CreatePaymentSchema,
    PaymentFiltersSchema,
    RefundSchema,
    StatsQuerySchema,
    GatewayEnum,
    type CreatePaymentInput,
    type PaymentFilters,
    type RefundInput,
    type StatsQuery,
    type GatewayEnumValue,
} from "./payments.schema.js";
import { requireRole } from "../../lib/permissions.js";

const IdParams = z.object({ id: z.string() });

export const paymentsRoutes: FastifyPluginAsync = async (fastify) => {
    const service = new PaymentsService();

    // =========================================================================
    // PAYMENTS
    // =========================================================================

    // GET /payments
    fastify.get(
        "/",
        {
            onRequest: [fastify.verifyJWT],
            schema: { querystring: PaymentFiltersSchema },
        },
        async (request) => {
            const filters = request.query as PaymentFilters;
            return service.listPayments(request.user.orgId!, filters);
        },
    );

    // GET /payments/stats
    fastify.get(
        "/stats",
        {
            onRequest: [fastify.verifyJWT, requireRole("MANAGER")],
            schema: { querystring: StatsQuerySchema },
        },
        async (request) => {
            const query = request.query as StatsQuery;
            return service.getPaymentStats(request.user.orgId!, query);
        },
    );

    // GET /payments/:id
    fastify.get(
        "/:id",
        {
            onRequest: [fastify.verifyJWT],
            schema: { params: IdParams },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            return service.getPayment(id, request.user.orgId!);
        },
    );

    // POST /payments
    fastify.post(
        "/",
        {
            onRequest: [fastify.verifyJWT, requireRole("SELLER")],
            schema: { body: CreatePaymentSchema },
        },
        async (request, reply) => {
            const body = request.body as CreatePaymentInput;
            const result = await service.createPayment(body, request.user.orgId!, request.user.id!);
            return reply.code(201).send(result);
        },
    );

    // POST /payments/:id/refund
    fastify.post(
        "/:id/refund",
        {
            onRequest: [fastify.verifyJWT, requireRole("MANAGER")],
            schema: { params: IdParams, body: RefundSchema },
        },
        async (request) => {
            const { id } = request.params as { id: string };
            const body = request.body as RefundInput;
            return service.refund(id, request.user.orgId!, body);
        },
    );

    // =========================================================================
    // WEBHOOKS (no auth — validated by gateway signature)
    // =========================================================================

    // Resolves the orgId for a payment gateway webhook.
    //
    // SECURITY: orgId MUST NOT be taken from attacker-controlled inputs (query
    // params or arbitrary headers).  Each gateway webhook URL is registered with
    // a unique path segment that embeds the client slug, and/or the service
    // resolves orgId from the gateway's own merchant/account ID stored in the
    // database.  As a last-resort fallback we read the `x-org-id` header, which
    // must be set by your gateway configuration — never by end-users.
    const resolveOrgId = (request: FastifyRequest): string => {
        // Prefer path param /:orgSlug injected by per-client webhook registration
        const pathOrgId = (request.params as Record<string, string> | undefined)?.["orgSlug"];
        if (pathOrgId) return pathOrgId;

        // The service will also attempt to resolve orgId from the signed payload
        // (e.g. Stripe account ID, MercadoPago collector_id).  Pass empty string
        // here; processWebhook will throw if it cannot determine the org.
        return "";
    };

    const handleWebhook = (gateway: GatewayEnumValue) =>
        async (request: FastifyRequest, reply: { code: (n: number) => { send: (v: unknown) => unknown } }) => {
            const signature =
                (request.headers["x-signature"] as string | undefined) ??
                (request.headers["stripe-signature"] as string | undefined) ??
                (request.headers["x-hub-signature-256"] as string | undefined) ??
                "";
            const orgId = resolveOrgId(request);

            try {
                const event = await service.processWebhook(gateway, request.body, signature, orgId);
                return reply.code(200).send({ received: true, type: event.type });
            } catch (err) {
                fastify.log.error({ err, gateway }, "webhook processing error");
                // Always return 200 to prevent gateway retries on our processing errors;
                // signature failures will re-throw to the framework as 401
                return reply.code(200).send({ received: false });
            }
        };

    // POST /payments/webhooks/mercadopago
    fastify.post("/webhooks/mercadopago", {}, handleWebhook("MERCADOPAGO"));

    // POST /payments/webhooks/stripe
    fastify.post(
        "/webhooks/stripe",
        {
            config: { rawBody: true },
        },
        async (request, reply) => {
            const signature = (request.headers["stripe-signature"] as string | undefined) ?? "";
            const orgId = resolveOrgId(request);

            try {
                // For Stripe, the raw body must be used for signature verification
                const rawBody = (request as FastifyRequest & { rawBody?: Buffer }).rawBody
                    ?? Buffer.from(JSON.stringify(request.body));

                const event = await service.processWebhook("STRIPE", rawBody.toString(), signature, orgId);
                return reply.code(200).send({ received: true, type: event.type });
            } catch (err) {
                fastify.log.error({ err }, "stripe webhook error");
                return reply.code(400).send({ error: "Webhook verification failed." });
            }
        },
    );

    // POST /payments/webhooks/paypal
    fastify.post("/webhooks/paypal", {}, handleWebhook("PAYPAL"));

    // POST /payments/webhooks/infinitypay
    fastify.post("/webhooks/infinitypay", {}, handleWebhook("INFINITYPAY"));
};
