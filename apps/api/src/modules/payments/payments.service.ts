import { PaymentsRepository } from "./payments.repository.js";
import type { CreatePaymentInput, PaymentFilters, RefundInput, StatsQuery, GatewayEnumValue } from "./payments.schema.js";
import type { IGateway } from "./gateways/gateway.interface.js";
import { getMercadoPagoGateway } from "./gateways/mercadopago.gateway.js";
import { getStripeGateway } from "./gateways/stripe.gateway.js";
import { getPayPalGateway } from "./gateways/paypal.gateway.js";
import { getInfinityPayGateway } from "./gateways/infinitypay.gateway.js";

export class PaymentsService {
    constructor(private readonly repo = new PaymentsRepository()) { }

    // -------------------------------------------------------------------------
    // Gateway factory
    // -------------------------------------------------------------------------

    getGateway(gateway: GatewayEnumValue, orgId: string): IGateway {
        switch (gateway) {
            case "MERCADOPAGO":
                return getMercadoPagoGateway(orgId);
            case "STRIPE":
                return getStripeGateway(orgId);
            case "PAYPAL":
                return getPayPalGateway(orgId);
            case "INFINITYPAY":
                return getInfinityPayGateway(orgId);
            default:
                throw Object.assign(
                    new Error(`Gateway "${gateway}" is not yet implemented.`),
                    { statusCode: 400 },
                );
        }
    }

    // -------------------------------------------------------------------------
    // List & find
    // -------------------------------------------------------------------------

    async listPayments(orgId: string, filters: PaymentFilters) {
        const { data, total } = await this.repo.list(orgId, filters);
        return {
            data,
            total,
            page: filters.page,
            limit: filters.limit,
            totalPages: Math.ceil(total / filters.limit),
        };
    }

    async getPayment(id: string, orgId: string) {
        const payment = await this.repo.findById(id, orgId);
        if (!payment) {
            throw Object.assign(new Error("Payment not found."), { statusCode: 404 });
        }
        return payment;
    }

    // -------------------------------------------------------------------------
    // Create payment / link
    // -------------------------------------------------------------------------

    async createPayment(data: CreatePaymentInput, orgId: string, _userId: string) {
        const gw = this.getGateway(data.gateway, orgId);

        if (data.type === "SUBSCRIPTION") {
            return this.createSubscriptionInternal(data, orgId, gw);
        }

        const result = await gw.createPaymentLink({
            amount: data.amount,
            currency: data.currency,
            description: data.description,
            payerEmail: data.payerEmail,
            payerName: data.payerName,
            payerDocument: data.payerDocument,
            successUrl: data.successUrl,
            failureUrl: data.failureUrl,
            pendingUrl: data.pendingUrl,
            expiresAt: data.expiresAt,
            metadata: data.metadata,
        });

        const payment = await this.repo.create({
            gateway: data.gateway,
            type: data.type,
            amount: data.amount,
            currency: data.currency,
            description: data.description,
            contactId: data.contactId,
            dealId: data.dealId,
            orgId,
            externalId: result.externalId,
            dueAt: data.dueAt,
            expiresAt: data.expiresAt,
            metadata: {
                paymentUrl: result.paymentUrl,
                qrCode: result.qrCode,
                qrCodeBase64: result.qrCodeBase64,
                ...(data.metadata ?? {}),
            },
        });

        return { ...payment, paymentUrl: result.paymentUrl, qrCode: result.qrCode };
    }

    private async createSubscriptionInternal(
        data: CreatePaymentInput,
        orgId: string,
        gw: IGateway,
    ) {
        if (!data.planId || !data.payerEmail) {
            throw Object.assign(
                new Error("planId and payerEmail are required for subscriptions."),
                { statusCode: 400 },
            );
        }

        const result = await gw.createSubscription({
            planId: data.planId,
            amount: data.amount,
            currency: data.currency,
            intervalUnit: data.intervalUnit ?? "month",
            intervalCount: data.intervalCount ?? 1,
            payerEmail: data.payerEmail,
            payerName: data.payerName,
            trialDays: data.trialDays,
            metadata: data.metadata,
        });

        return this.repo.create({
            gateway: data.gateway,
            type: "SUBSCRIPTION",
            amount: data.amount,
            currency: data.currency,
            description: data.description,
            contactId: data.contactId,
            dealId: data.dealId,
            orgId,
            externalId: result.externalId,
            dueAt: data.dueAt,
            metadata: {
                subscriptionStatus: result.status,
                customerId: result.customerId,
                ...(data.metadata ?? {}),
            },
        });
    }

    // -------------------------------------------------------------------------
    // Refund
    // -------------------------------------------------------------------------

    async refund(paymentId: string, orgId: string, input: RefundInput) {
        const payment = await this.repo.findById(paymentId, orgId);
        if (!payment) {
            throw Object.assign(new Error("Payment not found."), { statusCode: 404 });
        }
        if (payment.status !== "PAID") {
            throw Object.assign(new Error("Only paid payments can be refunded."), { statusCode: 422 });
        }
        if (!payment.externalId) {
            throw Object.assign(new Error("Payment has no external ID to refund."), { statusCode: 422 });
        }

        const gw = this.getGateway(payment.gateway as GatewayEnumValue, orgId);
        await gw.refund(payment.externalId, input.amount);

        return this.repo.updateStatus(paymentId, orgId, { status: "REFUNDED" });
    }

    // -------------------------------------------------------------------------
    // Webhook processing
    // -------------------------------------------------------------------------

    async processWebhook(
        gateway: GatewayEnumValue,
        payload: unknown,
        signature: string,
        orgId: string,
    ) {
        const gw = this.getGateway(gateway, orgId);
        const event = await gw.processWebhook(payload, signature);

        // Log the raw webhook
        await this.repo.logWebhook({
            gateway,
            event: event.type,
            payload,
            orgId,
            status: "PROCESSED",
        });

        if (!event.externalId) return event;

        // Update matching payment if we have one
        const payment = await this.repo.findByExternalId(event.externalId, orgId);
        if (payment) {
            await this.repo.updateStatus(payment.id, orgId, {
                status: event.status,
                paidAt: event.paidAt,
            });
        }

        return event;
    }

    // -------------------------------------------------------------------------
    // Stats
    // -------------------------------------------------------------------------

    getPaymentStats(orgId: string, query: StatsQuery) {
        return this.repo.getStats(orgId, query);
    }
}
