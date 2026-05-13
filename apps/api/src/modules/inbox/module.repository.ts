import { prisma } from "../../lib/prisma.js";
import type {
    ConversationFilters,
    CreateConversationInput,
    SendMessageInput,
} from "./module.schema.js";

// ---------------------------------------------------------------------------
// Selects
// ---------------------------------------------------------------------------

const contactSelect = {
    id: true,
    name: true,
    email: true,
    phone: true,
    avatar: true,
} as const;

const agentSelect = {
    id: true,
    name: true,
    avatar: true,
    email: true,
} as const;

const conversationSelect = {
    id: true,
    channel: true,
    status: true,
    externalId: true,
    unreadCount: true,
    lastMessageAt: true,
    orgId: true,
    branchId: true,
    createdAt: true,
    updatedAt: true,
    contact: { select: contactSelect },
    agent: { select: agentSelect },
    messages: {
        select: {
            id: true,
            content: true,
            type: true,
            direction: true,
            status: true,
            mediaUrl: true,
            mediaType: true,
            sentAt: true,
        },
        orderBy: { sentAt: "desc" as const },
        take: 1,
    },
} as const;

const messageSelect = {
    id: true,
    content: true,
    type: true,
    direction: true,
    status: true,
    externalId: true,
    mediaUrl: true,
    mediaType: true,
    mediaSize: true,
    metadata: true,
    sentAt: true,
    deliveredAt: true,
    readAt: true,
    conversationId: true,
    sender: { select: agentSelect },
} as const;

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class InboxRepository {
    // -------------------------------------------------------------------------
    // Conversations
    // -------------------------------------------------------------------------

    async listConversations(orgId: string, filters: ConversationFilters) {
        const { channel, status, agentId, contactId, unread, search, page, limit } = filters;
        const skip = (page - 1) * limit;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const where: any = {
            orgId,
            ...(channel ? { channel } : {}),
            ...(status ? { status } : {}),
            ...(agentId !== undefined ? { agentId } : {}),
            ...(contactId ? { contactId } : {}),
            ...(unread ? { unreadCount: { gt: 0 } } : {}),
            ...(search
                ? {
                    contact: {
                        OR: [
                            { name: { contains: search, mode: "insensitive" } },
                            { phone: { contains: search, mode: "insensitive" } },
                            { email: { contains: search, mode: "insensitive" } },
                        ],
                    },
                }
                : {}),
        };

        const [data, total] = await Promise.all([
            prisma.conversation.findMany({
                where,
                select: conversationSelect,
                skip,
                take: limit,
                orderBy: { lastMessageAt: "desc" },
            }),
            prisma.conversation.count({ where }),
        ]);

        return { data, total };
    }

    findConversation(id: string, orgId: string) {
        return prisma.conversation.findFirst({
            where: { id, orgId },
            select: conversationSelect,
        });
    }

    async findOrCreateConversation(
        channel: string,
        externalId: string,
        contactId: string,
        orgId: string,
        branchId?: string,
    ) {
        const existing = await prisma.conversation.findFirst({
            where: { externalId, channel: channel as never, orgId },
        });
        if (existing) return { conversation: existing, created: false };

        const created = await prisma.conversation.create({
            data: {
                channel: channel as never,
                externalId,
                contactId,
                orgId,
                branchId: branchId ?? null,
                status: "OPEN",
            },
        });
        return { conversation: created, created: true };
    }

    async updateConversation(
        id: string,
        data: {
            status?: string;
            agentId?: string | null;
            unreadCount?: number;
            lastMessageAt?: Date;
        },
        orgId: string,
    ) {
        return prisma.conversation.update({
            where: { id },
            data: {
                ...(data.status !== undefined ? { status: data.status as never } : {}),
                ...(data.agentId !== undefined ? { agentId: data.agentId } : {}),
                ...(data.unreadCount !== undefined ? { unreadCount: data.unreadCount } : {}),
                ...(data.lastMessageAt !== undefined
                    ? { lastMessageAt: data.lastMessageAt }
                    : {}),
            },
        });
    }

    incrementUnread(conversationId: string) {
        return prisma.conversation.update({
            where: { id: conversationId },
            data: { unreadCount: { increment: 1 }, lastMessageAt: new Date() },
        });
    }

    // -------------------------------------------------------------------------
    // Messages
    // -------------------------------------------------------------------------

    createMessage(data: {
        content: string;
        type: string;
        direction: "INBOUND" | "OUTBOUND";
        status?: string;
        externalId?: string;
        mediaUrl?: string;
        mediaType?: string;
        mediaSize?: number;
        metadata?: Record<string, unknown>;
        conversationId: string;
        senderId?: string;
    }) {
        return prisma.message.create({
            data: {
                content: data.content,
                type: data.type as never,
                direction: data.direction as never,
                status: (data.status ?? "SENT") as never,
                externalId: data.externalId ?? null,
                mediaUrl: data.mediaUrl ?? null,
                mediaType: data.mediaType ?? null,
                mediaSize: data.mediaSize ?? null,
                metadata: (data.metadata ?? {}) as never,
                conversationId: data.conversationId,
                senderId: data.senderId ?? null,
            },
            select: messageSelect,
        });
    }

    async listMessages(
        conversationId: string,
        orgId: string,
        { before, limit }: { before?: string; limit: number },
    ) {
        const conversation = await prisma.conversation.findFirst({
            where: { id: conversationId, orgId },
            select: { id: true },
        });
        if (!conversation) return { data: [], hasMore: false };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const where: any = {
            conversationId,
            ...(before ? { sentAt: { lt: new Date(before) } } : {}),
        };

        const data = await prisma.message.findMany({
            where,
            select: messageSelect,
            orderBy: { sentAt: "desc" },
            take: limit + 1,
        });

        const hasMore = data.length > limit;
        return { data: hasMore ? data.slice(0, limit) : data, hasMore };
    }

    markAsRead(conversationId: string, orgId: string) {
        return prisma.conversation.updateMany({
            where: { id: conversationId, orgId },
            data: { unreadCount: 0 },
        });
    }

    updateMessageStatus(externalId: string, status: string) {
        return prisma.message.updateMany({
            where: { externalId },
            data: {
                status: status as never,
                ...(status === "DELIVERED" ? { deliveredAt: new Date() } : {}),
                ...(status === "READ" ? { readAt: new Date() } : {}),
            },
        });
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    findActiveAutomations(orgId: string) {
        return prisma.automation.findMany({
            where: { orgId, isActive: true },
            select: { id: true, name: true, trigger: true },
        }).then((rows) =>
            rows.filter((r) => {
                try {
                    const t = r.trigger as unknown as { type?: string };
                    return t?.type === "NEW_LEAD";
                } catch {
                    return false;
                }
            }),
        );
    }
}
