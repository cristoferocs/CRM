import { z } from "zod";

// ---------------------------------------------------------------------------
// Enums (matching Prisma schema)
// ---------------------------------------------------------------------------

export const GatewayEnum = z.enum([
    "MERCADOPAGO",
    "STRIPE",
    "PAYPAL",
    "INFINITYPAY",
    "STONE",
    "PAGSEGURO",
    "ASAAS",
]);

export const PaymentTypeEnum = z.enum(["SINGLE", "RECURRING", "SUBSCRIPTION"]);

export const PaymentStatusEnum = z.enum(["PENDING", "PAID", "FAILED", "REFUNDED", "CANCELLED"]);

export type GatewayEnumValue = z.infer<typeof GatewayEnum>;

// ---------------------------------------------------------------------------
// Create payment
// ---------------------------------------------------------------------------

export const CreatePaymentSchema = z.object({
    gateway: GatewayEnum,
    type: PaymentTypeEnum.default("SINGLE"),
    amount: z.number().int().positive().describe("Amount in cents"),
    currency: z.string().min(3).max(3).default("BRL"),
    description: z.string().min(1).max(255),
    contactId: z.string().optional(),
    dealId: z.string().optional(),
    payerEmail: z.string().email().optional(),
    payerName: z.string().optional(),
    payerDocument: z.string().optional(),
    successUrl: z.string().url().optional(),
    failureUrl: z.string().url().optional(),
    pendingUrl: z.string().url().optional(),
    dueAt: z.coerce.date().optional(),
    expiresAt: z.coerce.date().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    // For subscriptions
    planId: z.string().optional(),
    intervalUnit: z.enum(["day", "week", "month", "year"]).optional(),
    intervalCount: z.number().int().positive().optional(),
    trialDays: z.number().int().min(0).optional(),
});

export type CreatePaymentInput = z.infer<typeof CreatePaymentSchema>;

// ---------------------------------------------------------------------------
// Refund
// ---------------------------------------------------------------------------

export const RefundSchema = z.object({
    amount: z.number().int().positive().optional().describe("Partial refund amount in cents; omit for full refund"),
    reason: z.string().max(255).optional(),
});

export type RefundInput = z.infer<typeof RefundSchema>;

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export const PaymentFiltersSchema = z.object({
    status: PaymentStatusEnum.optional(),
    gateway: GatewayEnum.optional(),
    type: PaymentTypeEnum.optional(),
    contactId: z.string().optional(),
    dealId: z.string().optional(),
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaymentFilters = z.infer<typeof PaymentFiltersSchema>;

// ---------------------------------------------------------------------------
// Stats query
// ---------------------------------------------------------------------------

export const StatsQuerySchema = z.object({
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
});

export type StatsQuery = z.infer<typeof StatsQuerySchema>;
