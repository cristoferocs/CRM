import { prisma } from "../../lib/prisma.js";
import type { PaymentFilters, StatsQuery } from "./payments.schema.js";

// ---------------------------------------------------------------------------
// Select
// ---------------------------------------------------------------------------

const paymentSelect = {
    id: true,
    externalId: true,
    gateway: true,
    type: true,
    status: true,
    amount: true,
    currency: true,
    description: true,
    contactId: true,
    dealId: true,
    orgId: true,
    paidAt: true,
    dueAt: true,
    expiresAt: true,
    metadata: true,
    createdAt: true,
    updatedAt: true,
    contact: {
        select: { id: true, name: true, email: true, phone: true },
    },
    deal: {
        select: { id: true, title: true },
    },
} as const;

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class PaymentsRepository {
    async list(orgId: string, filters: PaymentFilters) {
        const { status, gateway, type, contactId, dealId, dateFrom, dateTo, page, limit } = filters;
        const skip = (page - 1) * limit;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const where: any = {
            orgId,
            ...(status ? { status } : {}),
            ...(gateway ? { gateway } : {}),
            ...(type ? { type } : {}),
            ...(contactId ? { contactId } : {}),
            ...(dealId ? { dealId } : {}),
            ...(dateFrom || dateTo
                ? {
                    createdAt: {
                        ...(dateFrom ? { gte: dateFrom } : {}),
                        ...(dateTo ? { lte: dateTo } : {}),
                    },
                }
                : {}),
        };

        const [data, total] = await prisma.$transaction([
            prisma.payment.findMany({
                where,
                select: paymentSelect,
                orderBy: { createdAt: "desc" },
                skip,
                take: limit,
            }),
            prisma.payment.count({ where }),
        ]);

        return { data, total };
    }

    findById(id: string, orgId: string) {
        return prisma.payment.findFirst({
            where: { id, orgId },
            select: paymentSelect,
        });
    }

    findByExternalId(externalId: string, orgId: string) {
        return prisma.payment.findFirst({
            where: { externalId, orgId },
            select: paymentSelect,
        });
    }

    create(data: {
        gateway: string;
        type: string;
        amount: number;
        currency: string;
        description: string;
        contactId?: string;
        dealId?: string;
        orgId: string;
        externalId?: string;
        dueAt?: Date;
        expiresAt?: Date;
        metadata?: Record<string, unknown>;
    }) {
        return prisma.payment.create({
            data: {
                gateway: data.gateway as never,
                type: data.type as never,
                status: "PENDING",
                amount: data.amount / 100, // store as decimal BRL
                currency: data.currency,
                description: data.description,
                contactId: data.contactId,
                dealId: data.dealId,
                orgId: data.orgId,
                externalId: data.externalId,
                dueAt: data.dueAt,
                expiresAt: data.expiresAt,
                metadata: (data.metadata ?? {}) as never,
            },
            select: paymentSelect,
        });
    }

    updateStatus(
        id: string,
        orgId: string,
        data: {
            status: string;
            externalId?: string;
            paidAt?: Date;
        },
    ) {
        return prisma.payment.update({
            where: { id },
            data: {
                status: data.status as never,
                ...(data.externalId ? { externalId: data.externalId } : {}),
                ...(data.paidAt ? { paidAt: data.paidAt } : {}),
            },
            select: paymentSelect,
        });
    }

    // -------------------------------------------------------------------------
    // Stats
    // -------------------------------------------------------------------------

    async getStats(orgId: string, query: StatsQuery) {
        const { dateFrom, dateTo } = query;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dateFilter: any = {};
        if (dateFrom || dateTo) {
            dateFilter["createdAt"] = {
                ...(dateFrom ? { gte: dateFrom } : {}),
                ...(dateTo ? { lte: dateTo } : {}),
            };
        }

        const [byStatus, byGateway] = await prisma.$transaction([
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (prisma.payment.groupBy as any)({
                by: ["status"],
                where: { orgId, ...dateFilter },
                orderBy: { status: "asc" },
                _sum: { amount: true },
                _count: { _all: true },
            }),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (prisma.payment.groupBy as any)({
                by: ["gateway"],
                where: { orgId, ...dateFilter },
                orderBy: { gateway: "asc" },
                _sum: { amount: true },
                _count: { _all: true },
            }),
        ]);

        type GroupRow = { status?: string; gateway?: string; _sum?: { amount?: unknown }; _count?: { _all?: number } };
        const findGroup = (arr: GroupRow[], status: string) =>
            arr.find((g) => g.status === status);

        return {
            totalRevenue: Number(findGroup(byStatus, "PAID")?._sum?.amount ?? 0),
            totalPending: Number(findGroup(byStatus, "PENDING")?._sum?.amount ?? 0),
            totalFailed: Number(findGroup(byStatus, "FAILED")?._sum?.amount ?? 0),
            totalRefunded: Number(findGroup(byStatus, "REFUNDED")?._sum?.amount ?? 0),
            countPaid: findGroup(byStatus, "PAID")?._count?._all ?? 0,
            countPending: findGroup(byStatus, "PENDING")?._count?._all ?? 0,
            countFailed: findGroup(byStatus, "FAILED")?._count?._all ?? 0,
            byGateway: byGateway.map((g: { gateway: string; _sum?: { amount?: unknown }; _count?: { _all?: number } }) => ({
                gateway: g.gateway,
                revenue: Number(g._sum?.amount ?? 0),
                count: g._count?._all ?? 0,
            })),
        };
    }

    // -------------------------------------------------------------------------
    // Webhook log
    // -------------------------------------------------------------------------

    logWebhook(data: {
        gateway: string;
        event: string;
        payload: unknown;
        orgId?: string;
        status?: string;
    }) {
        return prisma.webhook.create({
            data: {
                gateway: data.gateway,
                event: data.event,
                payload: data.payload as never,
                orgId: data.orgId,
                status: data.status ?? "PROCESSED",
                processedAt: new Date(),
            },
        });
    }
}
