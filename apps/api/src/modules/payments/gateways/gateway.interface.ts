// =============================================================================
// Gateway Interface — base contract for all payment gateways
// =============================================================================

export interface CreatePaymentData {
    amount: number; // in cents (or smallest currency unit)
    currency: string; // e.g. "BRL", "USD"
    description: string;
    externalReference?: string; // our Payment.id
    payerEmail?: string;
    payerName?: string;
    payerDocument?: string;
    successUrl?: string;
    failureUrl?: string;
    pendingUrl?: string;
    expiresAt?: Date;
    metadata?: Record<string, unknown>;
}

export interface CreateSubscriptionData {
    planId: string; // gateway-specific plan/price id
    amount: number; // in cents
    currency: string;
    intervalUnit: "day" | "week" | "month" | "year";
    intervalCount: number;
    payerEmail: string;
    payerName?: string;
    externalReference?: string;
    trialDays?: number;
    metadata?: Record<string, unknown>;
}

export interface PaymentResult {
    externalId: string;
    paymentUrl?: string;
    qrCode?: string; // for PIX
    qrCodeBase64?: string;
    status: PaymentStatus;
    raw?: Record<string, unknown>;
}

export interface SubscriptionResult {
    externalId: string;
    customerId?: string;
    status: string;
    currentPeriodEnd?: Date;
    raw?: Record<string, unknown>;
}

export type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "REFUNDED" | "CANCELLED";

export type WebhookEventType =
    | "payment.created"
    | "payment.updated"
    | "payment.paid"
    | "payment.failed"
    | "payment.refunded"
    | "payment.cancelled"
    | "subscription.created"
    | "subscription.updated"
    | "subscription.cancelled"
    | "unknown";

export interface WebhookEvent {
    type: WebhookEventType;
    externalId: string;
    status: PaymentStatus;
    amount?: number;
    currency?: string;
    paidAt?: Date;
    raw: Record<string, unknown>;
}

export interface IGateway {
    createPaymentLink(data: CreatePaymentData): Promise<PaymentResult>;
    createSubscription(data: CreateSubscriptionData): Promise<SubscriptionResult>;
    cancelSubscription(externalId: string): Promise<void>;
    refund(externalId: string, amount?: number): Promise<void>;
    processWebhook(payload: unknown, signature: string): Promise<WebhookEvent>;
    getPaymentStatus(externalId: string): Promise<PaymentStatus>;
}
