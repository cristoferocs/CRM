import { MercadoPagoConfig, Preference, Payment, PreApproval } from "mercadopago";
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

const MP_STATUS_MAP: Record<string, PaymentStatus> = {
    approved: "PAID",
    pending: "PENDING",
    in_process: "PENDING",
    rejected: "FAILED",
    refunded: "REFUNDED",
    cancelled: "CANCELLED",
    charged_back: "REFUNDED",
};

function mapStatus(mpStatus?: string): PaymentStatus {
    return MP_STATUS_MAP[mpStatus ?? ""] ?? "PENDING";
}

// ---------------------------------------------------------------------------
// Gateway
// ---------------------------------------------------------------------------

export class MercadoPagoGateway implements IGateway {
    private readonly config: MercadoPagoConfig;
    private readonly preference: Preference;
    private readonly payment: Payment;
    private readonly preApproval: PreApproval;
    private readonly webhookSecret: string;

    constructor(accessToken: string, webhookSecret = "") {
        this.config = new MercadoPagoConfig({ accessToken });
        this.preference = new Preference(this.config);
        this.payment = new Payment(this.config);
        this.preApproval = new PreApproval(this.config);
        this.webhookSecret = webhookSecret;
    }

    async createPaymentLink(data: CreatePaymentData): Promise<PaymentResult> {
        const response = await this.preference.create({
            body: {
                items: [
                    {
                        id: data.externalReference ?? "item",
                        title: data.description,
                        quantity: 1,
                        unit_price: data.amount / 100,
                        currency_id: data.currency,
                    },
                ],
                payer: {
                    email: data.payerEmail,
                    name: data.payerName,
                },
                back_urls: {
                    success: data.successUrl,
                    failure: data.failureUrl,
                    pending: data.pendingUrl,
                },
                external_reference: data.externalReference,
                expires: !!data.expiresAt,
                expiration_date_to: data.expiresAt?.toISOString(),
                auto_return: "approved",
                payment_methods: {
                    // Allow PIX and credit card by default; exclusions can be configured
                    installments: 12,
                },
                metadata: data.metadata ?? {},
            },
        });

        return {
            externalId: response.id ?? "",
            paymentUrl: response.init_point ?? response.sandbox_init_point ?? undefined,
            status: "PENDING",
            raw: response as unknown as Record<string, unknown>,
        };
    }

    async createSubscription(data: CreateSubscriptionData): Promise<SubscriptionResult> {
        const response = await this.preApproval.create({
            body: {
                reason: data.externalReference ?? data.payerEmail,
                payer_email: data.payerEmail,
                external_reference: data.externalReference,
                preapproval_plan_id: data.planId !== "custom" ? data.planId : undefined,
                auto_recurring: {
                    frequency: data.intervalCount,
                    frequency_type: data.intervalUnit,
                    transaction_amount: data.amount / 100,
                    currency_id: data.currency,
                },
                status: "pending",
            },
        });

        return {
            externalId: response.id ?? "",
            status: response.status ?? "pending",
            raw: response as unknown as Record<string, unknown>,
        };
    }

    async cancelSubscription(externalId: string): Promise<void> {
        await this.preApproval.update({
            id: externalId,
            body: { status: "cancelled" },
        });
    }

    async refund(externalId: string, amount?: number): Promise<void> {
        const PaymentRefund = (await import("mercadopago")).PaymentRefund;
        const refund = new PaymentRefund(this.config);
        await refund.create({
            payment_id: Number(externalId),
            body: amount !== undefined ? { amount: amount / 100 } : {},
        });
    }

    async processWebhook(payload: unknown, signature: string): Promise<WebhookEvent> {
        // Validate x-signature header: "ts=...,v1=..."
        if (this.webhookSecret) {
            const body = payload as Record<string, unknown>;
            const ts = signature.match(/ts=([^,]+)/)?.[1] ?? "";
            const receivedHash = signature.match(/v1=([^,]+)/)?.[1] ?? "";
            const manifest = `id:${body["data.id"] ?? ""};request-id:${body["x-request-id"] ?? ""};ts:${ts};`;
            const hmac = crypto
                .createHmac("sha256", this.webhookSecret)
                .update(manifest)
                .digest("hex");
            if (hmac !== receivedHash) {
                throw Object.assign(new Error("Invalid MercadoPago signature."), { statusCode: 401 });
            }
        }

        const body = payload as Record<string, unknown>;
        const action = (body["action"] as string | undefined) ?? "";
        const dataId = ((body["data"] as Record<string, unknown> | undefined)?.["id"] as string | undefined) ?? "";

        let status: PaymentStatus = "PENDING";
        let paidAt: Date | undefined;
        let amount: number | undefined;

        // Fetch payment details from API for payment events
        if (action.startsWith("payment.") && dataId) {
            try {
                const details = await this.payment.get({ id: dataId });
                status = mapStatus(details.status ?? "");
                amount = details.transaction_amount !== undefined
                    ? Math.round(details.transaction_amount * 100)
                    : undefined;
                paidAt = details.date_approved ? new Date(details.date_approved) : undefined;
            } catch {
                // non-fatal; use defaults
            }
        }

        const type: WebhookEventType = (() => {
            if (action === "payment.created") return "payment.created";
            if (action === "payment.updated") {
                if (status === "PAID") return "payment.paid";
                if (status === "FAILED") return "payment.failed";
                if (status === "REFUNDED") return "payment.refunded";
                if (status === "CANCELLED") return "payment.cancelled";
                return "payment.updated";
            }
            if (action === "subscription.updated") return "subscription.updated";
            if (action === "subscription.preapproval") return "subscription.updated";
            return "unknown";
        })();

        return {
            type,
            externalId: dataId,
            status,
            amount,
            paidAt,
            raw: body,
        };
    }

    async getPaymentStatus(externalId: string): Promise<PaymentStatus> {
        const details = await this.payment.get({ id: externalId });
        return mapStatus(details.status ?? "");
    }
}

// ---------------------------------------------------------------------------
// Singleton factory
// ---------------------------------------------------------------------------

const cache = new Map<string, MercadoPagoGateway>();

export function getMercadoPagoGateway(orgId: string): MercadoPagoGateway {
    if (!cache.has(orgId)) {
        const accessToken = process.env[`MP_ACCESS_TOKEN_${orgId}`]
            ?? process.env["MP_ACCESS_TOKEN"]
            ?? "";
        const webhookSecret = process.env[`MP_WEBHOOK_SECRET_${orgId}`]
            ?? process.env["MP_WEBHOOK_SECRET"]
            ?? "";
        cache.set(orgId, new MercadoPagoGateway(accessToken, webhookSecret));
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return cache.get(orgId)!;
}
