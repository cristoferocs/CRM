import type { FastifyInstance } from "fastify";
import { prisma } from "../../../lib/prisma.js";
import { getIO } from "../../../websocket/socket.js";
import { queues } from "../../../queue/queues.js";
import { InboxRepository } from "../module.repository.js";
import { ContactsService } from "../../contacts/module.service.js";

const inboxRepo = new InboxRepository();
const contactsService = new ContactsService();

// ---------------------------------------------------------------------------
// Payload types (Evolution API webhook)
// ---------------------------------------------------------------------------

interface EvolutionKey {
    remoteJid: string;
    fromMe: boolean;
    id: string;
}

interface EvolutionMessageContent {
    conversation?: string;
    extendedTextMessage?: { text: string };
    imageMessage?: { url?: string; caption?: string; mimetype?: string; fileLength?: number };
    videoMessage?: { url?: string; caption?: string; mimetype?: string; fileLength?: number };
    audioMessage?: { url?: string; mimetype?: string; fileLength?: number };
    documentMessage?: { url?: string; title?: string; mimetype?: string; fileLength?: number };
}

interface EvolutionUpsertData {
    key: EvolutionKey;
    message?: EvolutionMessageContent;
    messageType: string;
    messageTimestamp: number;
    pushName?: string;
    status?: string;
}

interface EvolutionUpdateData {
    key: EvolutionKey;
    update: { status: string };
}

interface EvolutionConnectionData {
    instance: string;
    state: string;
}

interface EvolutionWebhookPayload {
    event: string;
    instance: string;
    data: EvolutionUpsertData | EvolutionUpdateData | EvolutionConnectionData;
    destination?: string;
    date_time?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractTextContent(msg: EvolutionMessageContent): string {
    return (
        msg.conversation ??
        msg.extendedTextMessage?.text ??
        msg.imageMessage?.caption ??
        msg.videoMessage?.caption ??
        msg.documentMessage?.title ??
        ""
    );
}

function extractMediaInfo(
    msg: EvolutionMessageContent,
    msgType: string,
): { mediaUrl?: string; mediaType?: string; mediaSize?: number; type: string } {
    if (msgType === "imageMessage" && msg.imageMessage) {
        return {
            mediaUrl: msg.imageMessage.url,
            mediaType: msg.imageMessage.mimetype,
            mediaSize: undefined,
            type: "IMAGE",
        };
    }
    if (msgType === "videoMessage" && msg.videoMessage) {
        return {
            mediaUrl: msg.videoMessage.url,
            mediaType: msg.videoMessage.mimetype,
            type: "VIDEO",
        };
    }
    if (msgType === "audioMessage" && msg.audioMessage) {
        return {
            mediaUrl: msg.audioMessage.url,
            mediaType: msg.audioMessage.mimetype,
            type: "AUDIO",
        };
    }
    if (msgType === "documentMessage" && msg.documentMessage) {
        return {
            mediaUrl: msg.documentMessage.url,
            mediaType: msg.documentMessage.mimetype,
            type: "DOCUMENT",
        };
    }
    return { type: "TEXT" };
}

function normalizeJid(jid: string): string {
    // "5511999999999@s.whatsapp.net" → "5511999999999"
    return jid.split("@")[0] ?? jid;
}

// ---------------------------------------------------------------------------
// Resolve orgId from Evolution instance name
// ---------------------------------------------------------------------------
async function resolveOrgFromInstance(instanceName: string): Promise<string | null> {
    // Convention: instanceName = "crm_{orgId}_{suffix}"
    // Alternatively look up in settings JSON
    const org = await prisma.organization.findFirst({
        where: {
            settings: {
                path: ["evolutionInstance"],
                equals: instanceName,
            },
        },
        select: { id: true },
    });
    return org?.id ?? null;
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

async function handleMessagesUpsert(
    orgId: string,
    data: EvolutionUpsertData,
    fastify: FastifyInstance,
) {
    const { key, message, messageType, pushName } = data;

    // Skip messages sent by us
    if (key.fromMe) return;

    const phone = normalizeJid(key.remoteJid);
    if (!phone) return;

    // 1. Find or create contact
    const { contact, created: contactCreated } =
        await contactsService.findOrCreateByPhone(phone, orgId, {
            name: pushName ?? phone,
            channel: "WHATSAPP",
        });

    // 2. Find or create conversation
    const { conversation, created: convCreated } =
        await inboxRepo.findOrCreateConversation(
            "WHATSAPP",
            key.remoteJid,
            contact.id,
            orgId,
        );

    // 3. Build message content
    const textContent = message ? extractTextContent(message) : "";
    const mediaInfo = message ? extractMediaInfo(message, messageType) : { type: "TEXT" };

    // 4. Persist message
    const savedMessage = await inboxRepo.createMessage({
        content: textContent || "(mídia)",
        type: mediaInfo.type,
        direction: "INBOUND",
        status: "DELIVERED",
        externalId: key.id,
        mediaUrl: mediaInfo.mediaUrl,
        mediaType: mediaInfo.mediaType,
        conversationId: conversation.id,
    });

    // 5. Increment unread count
    await inboxRepo.incrementUnread(conversation.id);

    // 6. Emit Socket.io events
    const io = getIO();
    if (io) {
        if (convCreated) {
            io.to(`org:${orgId}`).emit("conversation:new", {
                conversationId: conversation.id,
                contactId: contact.id,
                channel: "WHATSAPP",
            });
        } else {
            io.to(`org:${orgId}`).emit("conversation:updated", {
                conversationId: conversation.id,
            });
        }

        io.to(`conversation:${conversation.id}`).emit("message:new", {
            conversationId: conversation.id,
            message: savedMessage,
        });
        io.to(`org:${orgId}`).emit("message:new", {
            conversationId: conversation.id,
            message: savedMessage,
        });
    }

    // 7. Trigger automations for new leads
    if (contactCreated) {
        try {
            const automations = await inboxRepo.findActiveAutomations(orgId);
            for (const automation of automations) {
                await queues.automations().add("trigger", {
                    automationId: automation.id,
                    contactId: contact.id,
                    orgId,
                    trigger: "NEW_LEAD",
                });
            }
        } catch (err) {
            fastify.log.warn({ err }, "Failed to enqueue automations for new lead");
        }
    }
}

async function handleMessageUpdate(orgId: string, data: EvolutionUpdateData) {
    const { key, update } = data;
    const statusMap: Record<string, string> = {
        DELIVERY_ACK: "DELIVERED",
        READ: "READ",
        PLAYED: "READ",
    };

    const mappedStatus = statusMap[update.status];
    if (!mappedStatus || !key.id) return;

    await inboxRepo.updateMessageStatus(key.id, mappedStatus);

    const io = getIO();
    if (io) {
        // Find conversationId from the message
        const msg = await prisma.message.findFirst({
            where: { externalId: key.id },
            select: { conversationId: true },
        });
        if (msg) {
            io.to(`conversation:${msg.conversationId}`).emit("message:status", {
                externalId: key.id,
                status: mappedStatus,
            });
        }
    }
}

function handleConnectionUpdate(
    instanceName: string,
    data: EvolutionConnectionData,
    fastify: FastifyInstance,
) {
    fastify.log.info(
        { instance: instanceName, state: data.state },
        "Evolution API connection update",
    );
    // Could emit to admin channel if desired
}

// ---------------------------------------------------------------------------
// Main handler (called from routes)
// ---------------------------------------------------------------------------

export async function handleEvolutionWebhook(
    payload: EvolutionWebhookPayload,
    fastify: FastifyInstance,
) {
    const { event, instance, data } = payload;

    const orgId = await resolveOrgFromInstance(instance);
    if (!orgId) {
        fastify.log.warn({ instance }, "Evolution webhook: unknown instance");
        return;
    }

    switch (event) {
        case "messages.upsert":
        case "MESSAGES_UPSERT":
            await handleMessagesUpsert(orgId, data as EvolutionUpsertData, fastify);
            break;

        case "messages.update":
        case "MESSAGES_UPDATE":
        case "MESSAGE_UPDATE":
            await handleMessageUpdate(orgId, data as EvolutionUpdateData);
            break;

        case "connection.update":
        case "CONNECTION_UPDATE":
            handleConnectionUpdate(instance, data as EvolutionConnectionData, fastify);
            break;

        default:
            fastify.log.debug({ event, instance }, "Evolution webhook: unhandled event");
    }
}
