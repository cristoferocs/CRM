import { prisma } from "../../lib/prisma.js";

export class CollaborationService {

    // -------------------------------------------------------------------------
    // Comments
    // -------------------------------------------------------------------------

    async listComments(entityType: string, entityId: string, orgId: string) {
        const where = this.entityWhere(entityType, entityId);
        return prisma.comment.findMany({
            where: { ...where, orgId },
            include: { author: { select: { id: true, name: true, avatar: true } } },
            orderBy: { createdAt: "asc" },
        });
    }

    async createComment(data: {
        entityType: "deal" | "contact" | "conversation";
        entityId: string;
        content: string;
        mentions?: string[];
        authorId: string;
        orgId: string;
    }) {
        const comment = await prisma.comment.create({
            data: {
                content: data.content,
                mentions: data.mentions ?? [],
                authorId: data.authorId,
                orgId: data.orgId,
                ...(data.entityType === "deal" ? { dealId: data.entityId } : {}),
                ...(data.entityType === "contact" ? { contactId: data.entityId } : {}),
                ...(data.entityType === "conversation" ? { conversationId: data.entityId } : {}),
            },
            include: { author: { select: { id: true, name: true, avatar: true } } },
        });

        // Create mention notifications
        if (data.mentions && data.mentions.length > 0) {
            await this.createMentionNotifications(comment.id, data.mentions, data.authorId, data.orgId, data.content);
        }

        return comment;
    }

    async updateComment(id: string, content: string, authorId: string, orgId: string) {
        const comment = await prisma.comment.findFirst({ where: { id, authorId, orgId } });
        if (!comment) throw Object.assign(new Error("Comment not found or not authorized"), { statusCode: 404 });
        return prisma.comment.update({ where: { id }, data: { content } });
    }

    async deleteComment(id: string, authorId: string, orgId: string) {
        const comment = await prisma.comment.findFirst({ where: { id, authorId, orgId } });
        if (!comment) throw Object.assign(new Error("Comment not found or not authorized"), { statusCode: 404 });
        await prisma.comment.delete({ where: { id } });
    }

    // -------------------------------------------------------------------------
    // Notifications
    // -------------------------------------------------------------------------

    async listNotifications(userId: string, orgId: string, unreadOnly = false) {
        return prisma.notification.findMany({
            where: { userId, orgId, ...(unreadOnly ? { readAt: null } : {}) },
            orderBy: { createdAt: "desc" },
            take: 50,
        });
    }

    async markRead(id: string, userId: string) {
        return prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
    }

    async markAllRead(userId: string, orgId: string) {
        return prisma.notification.updateMany({ where: { userId, orgId, readAt: null }, data: { readAt: new Date() } });
    }

    async createNotification(data: {
        userId: string;
        orgId: string;
        type: string;
        title: string;
        body: string;
        metadata?: Record<string, unknown>;
    }) {
        return prisma.notification.create({
            data: {
                userId: data.userId,
                orgId: data.orgId,
                type: data.type as never,
                title: data.title,
                body: data.body,
                metadata: (data.metadata ?? {}) as never,
            },
        });
    }

    async getUnreadCount(userId: string, orgId: string) {
        const count = await prisma.notification.count({ where: { userId, orgId, readAt: null } });
        return { count };
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private entityWhere(entityType: string, entityId: string) {
        switch (entityType) {
            case "deal": return { dealId: entityId };
            case "contact": return { contactId: entityId };
            case "conversation": return { conversationId: entityId };
            default: return { dealId: entityId };
        }
    }

    private async createMentionNotifications(commentId: string, userIds: string[], authorId: string, orgId: string, content: string) {
        const author = await prisma.user.findUnique({ where: { id: authorId }, select: { name: true } });
        const notifications = userIds
            .filter(uid => uid !== authorId)
            .map(userId => ({
                userId,
                orgId,
                type: "MENTION" as const,
                title: `${author?.name ?? "Alguém"} te mencionou`,
                body: content.slice(0, 120),
                metadata: { commentId } as never,
            }));

        if (notifications.length > 0) {
            await prisma.notification.createMany({ data: notifications });
        }
    }
}
