import type { FastifyInstance } from "fastify";
import { prisma } from "../../../lib/prisma.js";
import { getIO } from "../../../websocket/socket.js";
import { InboxRepository } from "../module.repository.js";
import { ContactsService } from "../../contacts/module.service.js";

const inboxRepo = new InboxRepository();
const contactsService = new ContactsService();

// ---------------------------------------------------------------------------
// Meta Webhook verification
// ---------------------------------------------------------------------------

export function verifyMetaChallenge(
    mode: string,
    token: string,
    challenge: string,
): string | null {
    const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
    if (mode === "subscribe" && token === verifyToken) {
        return challenge;
    }
    return null;
}

// ---------------------------------------------------------------------------
// Payload types (Meta Webhooks — covers WhatsApp Cloud API, Instagram, Messenger)
// ---------------------------------------------------------------------------

interface MetaMessageValue {
    messaging_product?: string;
    contacts?: { profile: { name: string }; wa_id: string }[];
    messages?: {
        id: string;
        from: string;
        timestamp: string;
        type: string;
        text?: { body: string };
        image?: { id: string; mime_type: string; caption?: string };
        video?: { id: string; mime_type: string; caption?: string };
        audio?: { id: string; mime_type: string };
        document?: { id: string; mime_type: string; filename?: string };
        statuses?: { id: string; recipient_id: string; status: string; timestamp: string }[];
    }[];
    statuses?: { id: string; recipient_id: string; status: string; timestamp: string }[];
}

interface MetaEntry {
    id: string;
    changes: {
        value: MetaMessageValue;
        field: string;
    }[];
    messaging?: {
        sender: { id: string };
        recipient: { id: string };
        timestamp: number;
        message?: { mid: string; text?: string; attachments?: { type: string; payload: { url: string } }[] };
    }[];
}

interface MetaWebhookPayload {
    object: string;
    entry: MetaEntry[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveOrgFromPhoneNumberId(phoneNumberId: string): Promise<string | null> {
    const org = await prisma.organization.findFirst({
        where: {
            settings: {
                path: ["metaPhoneNumberId"],
                equals: phoneNumberId,
            },
        },
        select: { id: true },
    });
    return org?.id ?? null;
}

async function resolveOrgFromPageId(pageId: string): Promise<string | null> {
    const org = await prisma.organization.findFirst({
        where: {
            settings: {
                path: ["metaPageId"],
                equals: pageId,
            },
        },
        select: { id: true },
    });
    return org?.id ?? null;
}

// ---------------------------------------------------------------------------
// WhatsApp Cloud API messages
// ---------------------------------------------------------------------------

async function handleWhatsAppMessages(
    orgId: string,
    value: MetaMessageValue,
    fastify: FastifyInstance,
) {
    const messages = value.messages ?? [];
    const contacts = value.contacts ?? [];

    for (const msg of messages) {
        const phone = msg.from;
        const pushName = contacts.find((c) => c.wa_id === phone)?.profile.name ?? phone;

        const { contact, created: contactCreated } =
            await contactsService.findOrCreateByPhone(phone, orgId, {
                name: pushName,
                channel: "WHATSAPP_OFFICIAL",
            });

        const { conversation, created: convCreated } =
            await inboxRepo.findOrCreateConversation(
                "WHATSAPP_OFFICIAL",
                phone,
                contact.id,
                orgId,
            );

        const textContent =
            msg.text?.body ??
            msg.image?.caption ??
            msg.video?.caption ??
            msg.document?.filename ??
            "(mídia)";

        const typeMap: Record<string, string> = {
            text: "TEXT",
            image: "IMAGE",
            video: "VIDEO",
            audio: "AUDIO",
            document: "DOCUMENT",
        };

        const savedMessage = await inboxRepo.createMessage({
            content: textContent,
            type: typeMap[msg.type] ?? "TEXT",
            direction: "INBOUND",
            status: "DELIVERED",
            externalId: msg.id,
            conversationId: conversation.id,
        });

        await inboxRepo.incrementUnread(conversation.id);

        const io = getIO();
        if (io) {
            if (convCreated) {
                io.to(`org:${orgId}`).emit("conversation:new", {
                    conversationId: conversation.id,
                    contactId: contact.id,
                    channel: "WHATSAPP_OFFICIAL",
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
    }

    // Handle read receipts / delivery status
    const statuses = value.statuses ?? [];
    for (const status of statuses) {
        const statusMap: Record<string, string> = {
            delivered: "DELIVERED",
            read: "READ",
            failed: "FAILED",
        };
        const mapped = statusMap[status.status];
        if (mapped) {
            await inboxRepo.updateMessageStatus(status.id, mapped, orgId);
            const io = getIO();
            if (io) {
                const msg = await prisma.message.findFirst({
                    where: { externalId: status.id },
                    select: { conversationId: true },
                });
                if (msg) {
                    io.to(`conversation:${msg.conversationId}`).emit("message:status", {
                        externalId: status.id,
                        status: mapped,
                    });
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Instagram / Messenger messages
// ---------------------------------------------------------------------------

async function handleMessengerEntry(
    orgId: string,
    messaging: NonNullable<MetaEntry["messaging"]>[number],
    channel: "INSTAGRAM" | "FACEBOOK",
    fastify: FastifyInstance,
) {
    const senderId = messaging.sender.id;
    const msg = messaging.message;
    if (!msg) return;

    const { contact, created: contactCreated } =
        await contactsService.findOrCreateByPhone(senderId, orgId, {
            name: senderId,
            channel,
        });

    const { conversation, created: convCreated } =
        await inboxRepo.findOrCreateConversation(channel, senderId, contact.id, orgId);

    const textContent =
        msg.text ??
        msg.attachments?.[0]?.payload?.url ??
        "(mídia)";

    const type = msg.attachments?.length ? "IMAGE" : "TEXT";

    const savedMessage = await inboxRepo.createMessage({
        content: textContent,
        type,
        direction: "INBOUND",
        status: "DELIVERED",
        externalId: msg.mid,
        conversationId: conversation.id,
    });

    await inboxRepo.incrementUnread(conversation.id);

    const io = getIO();
    if (io) {
        if (convCreated) {
            io.to(`org:${orgId}`).emit("conversation:new", {
                conversationId: conversation.id,
                contactId: contact.id,
                channel,
            });
        }
        io.to(`conversation:${conversation.id}`).emit("message:new", {
            conversationId: conversation.id,
            message: savedMessage,
        });
    }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function handleMetaWebhook(
    payload: MetaWebhookPayload,
    fastify: FastifyInstance,
) {
    const { object, entry } = payload;

    for (const e of entry) {
        if (object === "whatsapp_business_account") {
            for (const change of e.changes ?? []) {
                if (change.field !== "messages") continue;
                const orgId = await resolveOrgFromPhoneNumberId(e.id);
                if (!orgId) {
                    fastify.log.warn({ pageId: e.id }, "Meta webhook: unknown phone number id");
                    continue;
                }
                await handleWhatsAppMessages(orgId, change.value, fastify);
            }
        } else if (object === "instagram" || object === "page") {
            const channel = object === "instagram" ? "INSTAGRAM" : "FACEBOOK";
            const orgId = await resolveOrgFromPageId(e.id);
            if (!orgId) {
                fastify.log.warn({ pageId: e.id }, "Meta webhook: unknown page id");
                continue;
            }
            for (const messaging of e.messaging ?? []) {
                await handleMessengerEntry(orgId, messaging, channel as "INSTAGRAM" | "FACEBOOK", fastify);
            }
        }
    }
}
