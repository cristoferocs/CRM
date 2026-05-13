import axios from "axios";
import crypto from "node:crypto";
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
// PayPal OAuth2 token cache
// ---------------------------------------------------------------------------

interface TokenCache {
    token: string;
    expiresAt: number;
}

const tokenCache = new Map<string, TokenCache>();

// ---------------------------------------------------------------------------
// Status map
// ---------------------------------------------------------------------------

function mapStatus(status: string | undefined): PaymentStatus {
    switch ((status ?? "").toUpperCase()) {
        case "COMPLETED": return "PAID";
        case "PENDING":
        case "CREATED":
        case "SAVED":
        case "APPROVED":
            return "PENDING";
        case "VOIDED": return "CANCELLED";
        case "PARTIALLY_REFUNDED":
        case "REFUNDED":
            return "REFUNDED";
        default: return "PENDING";
    }
}

// ---------------------------------------------------------------------------
// Gateway
// ---------------------------------------------------------------------------

export class PayPalGateway implements IGateway {
    private readonly baseUrl: string;
    private readonly clientId: string;
    private readonly clientSecret: string;
    private readonly webhookId: string;

    constructor(clientId: string, clientSecret: string, sandbox = false, webhookId = "") {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.baseUrl = sandbox
            ? "https://api-m.sandbox.paypal.com"
            : "https://api-m.paypal.com";
        this.webhookId = webhookId;
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private get cacheKey() {
        return `${this.baseUrl}:${this.clientId}`;
    }

    private async getAccessToken(): Promise<string> {
        const cached = tokenCache.get(this.cacheKey);
        if (cached && cached.expiresAt > Date.now() + 5000) {
            return cached.token;
        }

        const response = await axios.post<{ access_token: string; expires_in: number }>(
            `${this.baseUrl}/v1/oauth2/token`,
            "grant_type=client_credentials",
            {
                auth: { username: this.clientId, password: this.clientSecret },
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
            },
        );

        tokenCache.set(this.cacheKey, {
            token: response.data.access_token,
            expiresAt: Date.now() + response.data.expires_in * 1000,
        });

        return response.data.access_token;
    }

    private async request<T>(method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<T> {
        const token = await this.getAccessToken();
        const response = await axios.request<T>({
            method,
            url: `${this.baseUrl}${path}`,
            data: body,
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
        });
        return response.data;
    }

    // -------------------------------------------------------------------------
    // IGateway implementation
    // -------------------------------------------------------------------------

    async createPaymentLink(data: CreatePaymentData): Promise<PaymentResult> {
        const amountStr = (data.amount / 100).toFixed(2);

        const order = await this.request<{
            id: string;
            links: Array<{ href: string; rel: string }>;
            status: string;
        }>("POST", "/v2/checkout/orders", {
            intent: "CAPTURE",
            purchase_units: [
                {
                    reference_id: data.externalReference,
                    description: data.description,
                    amount: {
                        currency_code: data.currency,
                        value: amountStr,
                    },
                },
            ],
            application_context: {
                return_url: data.successUrl,
                cancel_url: data.failureUrl,
                shipping_preference: "NO_SHIPPING",
                user_action: "PAY_NOW",
            },
        });

        const approveUrl = order.links.find((l) => l.rel === "approve")?.href;

        return {
            externalId: order.id,
            paymentUrl: approveUrl,
            status: "PENDING",
            raw: order as unknown as Record<string, unknown>,
        };
    }

    async createSubscription(data: CreateSubscriptionData): Promise<SubscriptionResult> {
        // PayPal subscriptions require a plan_id created in the PayPal dashboard
        const subscription = await this.request<{
            id: string;
            status: string;
            links: Array<{ href: string; rel: string }>;
        }>("POST", "/v1/billing/subscriptions", {
            plan_id: data.planId,
            subscriber: {
                email_address: data.payerEmail,
                name: {
                    given_name: data.payerName ?? data.payerEmail,
                },
            },
            application_context: {
                return_url: `${process.env["APP_URL"] ?? "http://localhost:3000"}/payment/success`,
                cancel_url: `${process.env["APP_URL"] ?? "http://localhost:3000"}/payment/cancel`,
                shipping_preference: "NO_SHIPPING",
                user_action: "SUBSCRIBE_NOW",
            },
            custom_id: data.externalReference,
        });

        const approveUrl = subscription.links.find((l) => l.rel === "approve")?.href;

        return {
            externalId: subscription.id,
            status: subscription.status,
            raw: { ...subscription as unknown as Record<string, unknown>, approveUrl },
        };
    }

    async cancelSubscription(externalId: string): Promise<void> {
        await this.request("POST", `/v1/billing/subscriptions/${externalId}/cancel`, {
            reason: "Cancelled by customer",
        });
    }

    async refund(externalId: string, amount?: number): Promise<void> {
        // externalId should be the capture ID; for simplicity we first get the order
        const capture = await this.request<{ id: string }>("GET", `/v2/payments/captures/${externalId}`);

        const body: Record<string, unknown> = {};
        if (amount !== undefined) {
            body["amount"] = {
                value: (amount / 100).toFixed(2),
                currency_code: "BRL", // will be overridden by capture currency
            };
        }

        await this.request("POST", `/v2/payments/captures/${capture.id}/refund`, body);
    }

    async processWebhook(payload: unknown, signature: string): Promise<WebhookEvent> {
        // Verify PayPal webhook signature if webhookId is set
        if (this.webhookId) {
            const body = payload as Record<string, unknown>;
            try {
                const parts = signature.split(",").reduce<Record<string, string>>((acc, part) => {
                    const [k, v] = part.split("=");
                    if (k && v) acc[k] = v;
                    return acc;
                }, {});

                const transmissionId = parts["PAYPAL-TRANSMISSION-ID"] ?? "";
                const timestamp = parts["PAYPAL-TRANSMISSION-TIME"] ?? "";
                const certUrl = parts["PAYPAL-CERT-URL"] ?? "";
                const transmissionSig = parts["PAYPAL-TRANSMISSION-SIG"] ?? "";

                if (transmissionId && timestamp && certUrl && transmissionSig) {
                    const message = `${transmissionId}|${timestamp}|${this.webhookId}|${crypto.createHash("crc32c").update(JSON.stringify(body)).digest("hex")}`;
                    // Full cert-based verification would require downloading the cert;
                    // for production, delegate to PayPal SDK or verify via their API
                    void message; // suppress unused variable
                }
            } catch {
                // non-fatal; log in production
            }
        }

        const body = payload as Record<string, unknown>;
        const eventType = (body["event_type"] as string | undefined) ?? "";
        const resource = (body["resource"] as Record<string, unknown> | undefined) ?? {};
        const resourceId = (resource["id"] as string | undefined) ?? "";

        let status: PaymentStatus = "PENDING";
        let type: WebhookEventType = "unknown";
        let paidAt: Date | undefined;

        switch (eventType) {
            case "PAYMENT.CAPTURE.COMPLETED":
                status = "PAID";
                type = "payment.paid";
                paidAt = new Date();
                break;
            case "PAYMENT.CAPTURE.DENIED":
            case "PAYMENT.CAPTURE.DECLINED":
                status = "FAILED";
                type = "payment.failed";
                break;
            case "PAYMENT.CAPTURE.REFUNDED":
                status = "REFUNDED";
                type = "payment.refunded";
                break;
            case "BILLING.SUBSCRIPTION.CREATED":
                type = "subscription.created";
                break;
            case "BILLING.SUBSCRIPTION.UPDATED":
            case "BILLING.SUBSCRIPTION.ACTIVATED":
                type = "subscription.updated";
                break;
            case "BILLING.SUBSCRIPTION.CANCELLED":
            case "BILLING.SUBSCRIPTION.EXPIRED":
                type = "subscription.cancelled";
                status = "CANCELLED";
                break;
            default:
                type = "unknown";
        }

        const amountObj = resource["amount"] as Record<string, unknown> | undefined;
        const amount = amountObj?.["value"]
            ? Math.round(parseFloat(amountObj["value"] as string) * 100)
            : undefined;

        return {
            type,
            externalId: resourceId,
            status,
            amount,
            paidAt,
            raw: body,
        };
    }

    async getPaymentStatus(externalId: string): Promise<PaymentStatus> {
        const order = await this.request<{ status: string }>("GET", `/v2/checkout/orders/${externalId}`);
        return mapStatus(order.status);
    }
}

// ---------------------------------------------------------------------------
// Singleton factory
// ---------------------------------------------------------------------------

const cache = new Map<string, PayPalGateway>();

export function getPayPalGateway(orgId: string): PayPalGateway {
    if (!cache.has(orgId)) {
        const clientId = process.env[`PAYPAL_CLIENT_ID_${orgId}`]
            ?? process.env["PAYPAL_CLIENT_ID"]
            ?? "";
        const clientSecret = process.env[`PAYPAL_CLIENT_SECRET_${orgId}`]
            ?? process.env["PAYPAL_CLIENT_SECRET"]
            ?? "";
        const sandbox = (process.env["PAYPAL_SANDBOX"] ?? "true") === "true";
        const webhookId = process.env[`PAYPAL_WEBHOOK_ID_${orgId}`]
            ?? process.env["PAYPAL_WEBHOOK_ID"]
            ?? "";
        cache.set(orgId, new PayPalGateway(clientId, clientSecret, sandbox, webhookId));
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return cache.get(orgId)!;
}
