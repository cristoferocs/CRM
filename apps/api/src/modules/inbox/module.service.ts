import { InboxRepository } from "./module.repository.js";
import { getIO } from "../../websocket/socket.js";
import { getEvolutionChannel } from "./channels/whatsapp-evolution.channel.js";
import type {
    ConversationFilters,
    CreateConversationInput,
    SendMessageInput,
    MessageCursorInput,
    AssignAgentInput,
    ChangeStatusInput,
} from "./module.schema.js";

export class InboxService {
    constructor(private readonly repo = new InboxRepository()) { }

    // -------------------------------------------------------------------------
    // Conversations
    // -------------------------------------------------------------------------

    async listConversations(orgId: string, filters: ConversationFilters) {
        const { data, total } = await this.repo.listConversations(orgId, filters);
        return {
            data,
            total,
            page: filters.page,
            limit: filters.limit,
            totalPages: Math.ceil(total / filters.limit),
        };
    }

    async getConversation(id: string, orgId: string) {
        const conv = await this.repo.findConversation(id, orgId);
        if (!conv) {
            throw Object.assign(new Error("Conversation not found."), { statusCode: 404 });
        }
        return conv;
    }

    async createConversation(data: CreateConversationInput, orgId: string) {
        const { conversation, created } = await this.repo.findOrCreateConversation(
            data.channel,
            data.externalId ?? data.contactId,
            data.contactId,
            orgId,
            data.branchId,
        );

        if (data.agentId) {
            await this.repo.updateConversation(conversation.id, { agentId: data.agentId }, orgId);
        }

        const io = getIO();
        if (io && created) {
            io.to(`org:${orgId}`).emit("conversation:new", {
                conversationId: conversation.id,
                contactId: data.contactId,
                channel: data.channel,
            });
        }

        return conversation;
    }

    // -------------------------------------------------------------------------
    // Messages
    // -------------------------------------------------------------------------

    async getMessages(conversationId: string, orgId: string, cursor: MessageCursorInput) {
        // Verify ownership
        const conv = await this.repo.findConversation(conversationId, orgId);
        if (!conv) {
            throw Object.assign(new Error("Conversation not found."), { statusCode: 404 });
        }
        return this.repo.listMessages(conversationId, orgId, {
            before: cursor.before,
            limit: cursor.limit,
        });
    }

    async sendMessage(
        conversationId: string,
        input: SendMessageInput,
        orgId: string,
        agentId: string,
    ) {
        const conv = await this.repo.findConversation(conversationId, orgId);
        if (!conv) {
            throw Object.assign(new Error("Conversation not found."), { statusCode: 404 });
        }

        // Dispatch to correct channel
        let externalId: string | undefined;

        switch (conv.channel) {
            case "WHATSAPP": {
                const instance = process.env.EVOLUTION_INSTANCE_NAME ?? "default";
                const channel = getEvolutionChannel(orgId);
                const phone = conv.contact.phone ?? conv.externalId ?? "";

                if (input.type !== "TEXT" && input.mediaUrl) {
                    const typeMap: Record<string, "image" | "video" | "audio" | "document"> = {
                        IMAGE: "image",
                        VIDEO: "video",
                        AUDIO: "audio",
                        DOCUMENT: "document",
                    };
                    const mediaType = typeMap[input.type] ?? "image";
                    const res = await channel.sendMediaMessage(
                        instance,
                        phone,
                        input.mediaUrl,
                        input.content,
                        mediaType,
                    );
                    externalId = res.key.id;
                } else {
                    const res = await channel.sendTextMessage(instance, phone, input.content);
                    externalId = res.key.id;
                }
                break;
            }

            case "WHATSAPP_OFFICIAL":
            case "INSTAGRAM":
            case "FACEBOOK":
            case "EMAIL":
            case "INTERNAL":
                // Channel implementations are injected at org config time;
                // fall through — message saved but not dispatched externally in stub.
                break;
        }

        const savedMessage = await this.repo.createMessage({
            content: input.content,
            type: input.type,
            direction: "OUTBOUND",
            status: "SENT",
            externalId,
            mediaUrl: input.mediaUrl,
            mediaType: input.mediaType,
            conversationId,
            senderId: agentId,
        });

        await this.repo.updateConversation(
            conversationId,
            { lastMessageAt: new Date() },
            orgId,
        );

        const io = getIO();
        if (io) {
            io.to(`conversation:${conversationId}`).emit("message:new", {
                conversationId,
                message: savedMessage,
            });
            io.to(`org:${orgId}`).emit("message:new", {
                conversationId,
                message: savedMessage,
            });
        }

        return savedMessage;
    }

    // -------------------------------------------------------------------------
    // Agent & status management
    // -------------------------------------------------------------------------

    async assignAgent(conversationId: string, input: AssignAgentInput, orgId: string) {
        const conv = await this.repo.findConversation(conversationId, orgId);
        if (!conv) {
            throw Object.assign(new Error("Conversation not found."), { statusCode: 404 });
        }

        await this.repo.updateConversation(
            conversationId,
            { agentId: input.agentId },
            orgId,
        );

        const io = getIO();
        if (io) {
            io.to(`org:${orgId}`).emit("conversation:updated", {
                conversationId,
                agentId: input.agentId,
            });
        }

        return this.repo.findConversation(conversationId, orgId);
    }

    async changeStatus(conversationId: string, input: ChangeStatusInput, orgId: string) {
        const conv = await this.repo.findConversation(conversationId, orgId);
        if (!conv) {
            throw Object.assign(new Error("Conversation not found."), { statusCode: 404 });
        }

        await this.repo.updateConversation(
            conversationId,
            { status: input.status },
            orgId,
        );

        const io = getIO();
        if (io) {
            io.to(`org:${orgId}`).emit("conversation:updated", {
                conversationId,
                status: input.status,
            });
        }

        return this.repo.findConversation(conversationId, orgId);
    }

    async markAsRead(conversationId: string, orgId: string) {
        const conv = await this.repo.findConversation(conversationId, orgId);
        if (!conv) {
            throw Object.assign(new Error("Conversation not found."), { statusCode: 404 });
        }
        await this.repo.markAsRead(conversationId, orgId);
        return { ok: true };
    }
}
