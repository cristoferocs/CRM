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
// Status map
// ---------------------------------------------------------------------------

function mapStatus(status: string | undefined): PaymentStatus {
    switch ((status ?? "").toLowerCase()) {
        case "paid":
        case "approved":
        case "captured":
            return "PAID";
        case "pending":
        case "pre_authorized":
        case "created":
            return "PENDING";
        case "failed":
        case "declined":
        case "error":
            return "FAILED";
        case "refunded":
        case "partially_refunded":
            return "REFUNDED";
        case "cancelled":
        case "voided":
            return "CANCELLED";
        default:
            return "PENDING";
    }
}

// ---------------------------------------------------------------------------
// Gateway
// ---------------------------------------------------------------------------

export class InfinityPayGateway implements IGateway {
    private readonly baseUrl = "https://api.infinitepay.io/v2";
    private readonly clientId: string;
    private readonly clientSecret: string;
    private readonly webhookSecret: string;

    constructor(clientId: string, clientSecret: string, webhookSecret = "") {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.webhookSecret = webhookSecret;
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private get authHeader(): string {
        const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
        return `Basic ${credentials}`;
    }

    private async post<T>(path: string, body: unknown): Promise<T> {
        const response = await axios.post<T>(`${this.baseUrl}${path}`, body, {
            headers: {
                Authorization: this.authHeader,
                "Content-Type": "application/json",
            },
        });
        return response.data;
    }

    private async get<T>(path: string): Promise<T> {
        const response = await axios.get<T>(`${this.baseUrl}${path}`, {
            headers: { Authorization: this.authHeader },
        });
        return response.data;
    }

    // -------------------------------------------------------------------------
    // IGateway implementation
    // -------------------------------------------------------------------------

    async createPaymentLink(data: CreatePaymentData): Promise<PaymentResult> {
        const result = await this.post<{
            id: string;
            payment_link?: string;
            status: string;
        }>("/payment_intents", {
            amount: data.amount,
            currency: data.currency.toLowerCase(),
            description: data.description,
            payment_method_types: ["credit_card", "pix"],
            metadata: {
                external_reference: data.externalReference,
                ...(data.metadata ?? {}),
            },
            customer: {
                email: data.payerEmail,
                name: data.payerName,
                document: data.payerDocument,
            },
        });

        return {
            externalId: result.id,
            paymentUrl: result.payment_link,
            status: mapStatus(result.status),
            raw: result as unknown as Record<string, unknown>,
        };
    }

    async createSubscription(data: CreateSubscriptionData): Promise<SubscriptionResult> {
        // InfinityPay recurring billing
        const result = await this.post<{
            id: string;
            status: string;
        }>("/subscriptions", {
            plan_id: data.planId,
            customer: {
                email: data.payerEmail,
                name: data.payerName,
            },
            metadata: { external_reference: data.externalReference },
        });

        return {
            externalId: result.id,
            status: result.status,
            raw: result as unknown as Record<string, unknown>,
        };
    }

    async cancelSubscription(externalId: string): Promise<void> {
        await axios.delete(`${this.baseUrl}/subscriptions/${externalId}`, {
            headers: { Authorization: this.authHeader },
        });
    }

    async refund(externalId: string, amount?: number): Promise<void> {
        await this.post(`/payment_intents/${externalId}/refund`, {
            ...(amount !== undefined ? { amount } : {}),
        });
    }

    async processWebhook(payload: unknown, signature: string): Promise<WebhookEvent> {
        if (this.webhookSecret) {
            const rawBody = typeof payload === "string" ? payload : JSON.stringify(payload);
            const computed = crypto
                .createHmac("sha256", this.webhookSecret)
                .update(rawBody)
                .digest("hex");
            if (computed !== signature) {
                throw Object.assign(new Error("Invalid InfinityPay signature."), { statusCode: 401 });
            }
        }

        const body = payload as Record<string, unknown>;
        const eventType = (body["type"] as string | undefined) ?? "";
        const data = (body["data"] as Record<string, unknown> | undefined) ?? {};
        const resourceId = (data["id"] as string | undefined) ?? "";
        const rawStatus = (data["status"] as string | undefined);
        const status = mapStatus(rawStatus);

        let type: WebhookEventType = "unknown";
        let paidAt: Date | undefined;

        switch (eventType) {
            case "payment_intent.succeeded":
                type = "payment.paid";
                paidAt = new Date();
                break;
            case "payment_intent.payment_failed":
                type = "payment.failed";
                break;
            case "payment_intent.created":
                type = "payment.created";
                break;
            case "charge.refunded":
                type = "payment.refunded";
                break;
            case "subscription.created":
                type = "subscription.created";
                break;
            case "subscription.updated":
                type = "subscription.updated";
                break;
            case "subscription.deleted":
                type = "subscription.cancelled";
                break;
            default:
                type = "unknown";
        }

        const amountRaw = data["amount"] as number | undefined;

        return {
            type,
            externalId: resourceId,
            status,
            amount: amountRaw,
            paidAt,
            raw: body,
        };
    }

    async getPaymentStatus(externalId: string): Promise<PaymentStatus> {
        const result = await this.get<{ status: string }>(`/payment_intents/${externalId}`);
        return mapStatus(result.status);
    }
}

// ---------------------------------------------------------------------------
// Singleton factory
// ---------------------------------------------------------------------------

const cache = new Map<string, InfinityPayGateway>();

export function getInfinityPayGateway(orgId: string): InfinityPayGateway {
    if (!cache.has(orgId)) {
        const clientId = process.env[`INFINITYPAY_CLIENT_ID_${orgId}`]
            ?? process.env["INFINITYPAY_CLIENT_ID"]
            ?? "";
        const clientSecret = process.env[`INFINITYPAY_CLIENT_SECRET_${orgId}`]
            ?? process.env["INFINITYPAY_CLIENT_SECRET"]
            ?? "";
        const webhookSecret = process.env[`INFINITYPAY_WEBHOOK_SECRET_${orgId}`]
            ?? process.env["INFINITYPAY_WEBHOOK_SECRET"]
            ?? "";
        cache.set(orgId, new InfinityPayGateway(clientId, clientSecret, webhookSecret));
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return cache.get(orgId)!;
}
