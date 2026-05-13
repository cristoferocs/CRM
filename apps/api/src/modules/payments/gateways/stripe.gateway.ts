import Stripe from "stripe";
import type {
    IGateway,
    CreatePaymentData,
    CreateSubscriptionData,
    PaymentResult,
    SubscriptionResult,
    PaymentStatus,
    WebhookEvent,
    WebhookEventType,
} from "./gateway.interface.js";

// ---------------------------------------------------------------------------
// Status map
// ---------------------------------------------------------------------------

function mapStatus(status: string | undefined | null): PaymentStatus {
    switch (status) {
        case "paid":
        case "complete":
            return "PAID";
        case "unpaid":
        case "open":
        case "incomplete":
        case "trialing":
        case "active":
            return "PENDING";
        case "past_due":
        case "incomplete_expired":
        case "canceled":
        case "void":
            return "FAILED";
        default:
            return "PENDING";
    }
}

// ---------------------------------------------------------------------------
// Gateway
// ---------------------------------------------------------------------------

export class StripeGateway implements IGateway {
    private readonly stripe: Stripe;
    private readonly webhookSecret: string;

    constructor(secretKey: string, webhookSecret = "") {
        this.stripe = new Stripe(secretKey);
        this.webhookSecret = webhookSecret;
    }

    async createPaymentLink(data: CreatePaymentData): Promise<PaymentResult> {
        const session = await this.stripe.checkout.sessions.create({
            mode: "payment",
            payment_method_types: ["card"],
            line_items: [
                {
                    price_data: {
                        currency: data.currency.toLowerCase(),
                        unit_amount: data.amount,
                        product_data: { name: data.description },
                    },
                    quantity: 1,
                },
            ],
            metadata: {
                externalReference: data.externalReference ?? "",
                ...(data.metadata as Record<string, string> | undefined ?? {}),
            },
            client_reference_id: data.externalReference,
            customer_email: data.payerEmail,
            success_url: data.successUrl ?? `${process.env["APP_URL"] ?? "http://localhost:3000"}/payment/success`,
            cancel_url: data.failureUrl ?? `${process.env["APP_URL"] ?? "http://localhost:3000"}/payment/cancel`,
            expires_at: data.expiresAt
                ? Math.floor(data.expiresAt.getTime() / 1000)
                : Math.floor(Date.now() / 1000) + 86400, // 24h default
        });

        return {
            externalId: session.id,
            paymentUrl: session.url ?? undefined,
            status: "PENDING",
            raw: session as unknown as Record<string, unknown>,
        };
    }

    async createSubscription(data: CreateSubscriptionData): Promise<SubscriptionResult> {
        // 1. Find or create customer
        const existingList = await this.stripe.customers.list({
            email: data.payerEmail,
            limit: 1,
        });

        const customer = existingList.data[0]
            ?? await this.stripe.customers.create({
                email: data.payerEmail,
                name: data.payerName,
                metadata: { externalReference: data.externalReference ?? "" },
            });

        // 2. Create subscription (requires a price ID from Stripe dashboard)
        const subscription = await this.stripe.subscriptions.create({
            customer: customer.id,
            items: [{ price: data.planId }],
            trial_period_days: data.trialDays ?? undefined,
            metadata: { externalReference: data.externalReference ?? "" },
            payment_behavior: "default_incomplete",
            expand: ["latest_invoice.payment_intent"],
        });

        return {
            externalId: subscription.id,
            customerId: customer.id,
            status: subscription.status,
            raw: subscription as unknown as Record<string, unknown>,
        };
    }

    async cancelSubscription(externalId: string): Promise<void> {
        await this.stripe.subscriptions.cancel(externalId);
    }

    async refund(externalId: string, amount?: number): Promise<void> {
        // externalId may be a PaymentIntent or Checkout Session id
        let paymentIntentId = externalId;

        if (externalId.startsWith("cs_")) {
            const session = await this.stripe.checkout.sessions.retrieve(externalId);
            paymentIntentId = session.payment_intent as string;
        }

        await this.stripe.refunds.create({
            payment_intent: paymentIntentId,
            ...(amount !== undefined ? { amount } : {}),
        });
    }

    processWebhook(payload: unknown, signature: string): Promise<WebhookEvent> {
        if (!this.webhookSecret) {
            throw Object.assign(new Error("Stripe webhook secret not configured."), { statusCode: 500 });
        }

        const rawBody = typeof payload === "string" ? payload : JSON.stringify(payload);
        const event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);

        let externalId = "";
        let status: PaymentStatus = "PENDING";
        let amount: number | undefined;
        let paidAt: Date | undefined;
        let type: WebhookEventType = "unknown";

        switch (event.type) {
            case "checkout.session.completed": {
                const session = event.data.object as Stripe.Checkout.Session;
                externalId = session.id;
                status = session.payment_status === "paid" ? "PAID" : "PENDING";
                amount = session.amount_total ?? undefined;
                paidAt = status === "PAID" ? new Date() : undefined;
                type = status === "PAID" ? "payment.paid" : "payment.updated";
                break;
            }
            case "checkout.session.expired": {
                const session = event.data.object as Stripe.Checkout.Session;
                externalId = session.id;
                status = "CANCELLED";
                type = "payment.cancelled";
                break;
            }
            case "payment_intent.succeeded": {
                const pi = event.data.object as Stripe.PaymentIntent;
                externalId = pi.id;
                status = "PAID";
                amount = pi.amount_received;
                paidAt = new Date();
                type = "payment.paid";
                break;
            }
            case "payment_intent.payment_failed": {
                const pi = event.data.object as Stripe.PaymentIntent;
                externalId = pi.id;
                status = "FAILED";
                type = "payment.failed";
                break;
            }
            case "charge.refunded": {
                const charge = event.data.object as Stripe.Charge;
                externalId = charge.payment_intent as string ?? charge.id;
                status = "REFUNDED";
                type = "payment.refunded";
                break;
            }
            case "customer.subscription.created": {
                const sub = event.data.object as Stripe.Subscription;
                externalId = sub.id;
                status = mapStatus(sub.status);
                type = "subscription.created";
                break;
            }
            case "customer.subscription.updated": {
                const sub = event.data.object as Stripe.Subscription;
                externalId = sub.id;
                status = mapStatus(sub.status);
                type = "subscription.updated";
                break;
            }
            case "customer.subscription.deleted": {
                const sub = event.data.object as Stripe.Subscription;
                externalId = sub.id;
                status = "CANCELLED";
                type = "subscription.cancelled";
                break;
            }
            default:
                externalId = (event.data.object as { id?: string }).id ?? "";
                type = "unknown";
        }

        return Promise.resolve({
            type,
            externalId,
            status,
            amount,
            paidAt,
            raw: event as unknown as Record<string, unknown>,
        });
    }

    async getPaymentStatus(externalId: string): Promise<PaymentStatus> {
        if (externalId.startsWith("cs_")) {
            const session = await this.stripe.checkout.sessions.retrieve(externalId);
            return session.payment_status === "paid" ? "PAID" : "PENDING";
        }
        if (externalId.startsWith("pi_")) {
            const pi = await this.stripe.paymentIntents.retrieve(externalId);
            return mapStatus(pi.status);
        }
        if (externalId.startsWith("sub_")) {
            const sub = await this.stripe.subscriptions.retrieve(externalId);
            return mapStatus(sub.status);
        }
        return "PENDING";
    }
}

// ---------------------------------------------------------------------------
// Singleton factory
// ---------------------------------------------------------------------------

const cache = new Map<string, StripeGateway>();

export function getStripeGateway(orgId: string): StripeGateway {
    if (!cache.has(orgId)) {
        const secretKey = process.env[`STRIPE_SECRET_KEY_${orgId}`]
            ?? process.env["STRIPE_SECRET_KEY"]
            ?? "";
        const webhookSecret = process.env[`STRIPE_WEBHOOK_SECRET_${orgId}`]
            ?? process.env["STRIPE_WEBHOOK_SECRET"]
            ?? "";
        cache.set(orgId, new StripeGateway(secretKey, webhookSecret));
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return cache.get(orgId)!;
}
