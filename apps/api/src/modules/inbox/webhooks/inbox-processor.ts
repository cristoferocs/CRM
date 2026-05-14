/**
 * inbox-processor.ts
 *
 * Pure async functions that process incoming webhook payloads.
 * Called by the BullMQ inbox worker — no Fastify dependency required.
 * The webhook routes simply enqueue the raw payload and return 200.
 */
import { prisma } from "../../../lib/prisma.js";
import { getIO } from "../../../websocket/socket.js";
import { queues } from "../../../queue/queues.js";
import { InboxRepository } from "../module.repository.js";
import { ContactsService } from "../../contacts/module.service.js";
import { fireAutomation } from "../../automations/automation-dispatcher.js";

const inboxRepo = new InboxRepository();
const contactsService = new ContactsService();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeJid(jid: string): string {
    return jid.split("@")[0] ?? jid;
}

async function resolveOrgFromInstance(instanceName: string): Promise<string | null> {
    const org = await prisma.organization.findFirst({
        where: { settings: { path: ["evolutionInstance"], equals: instanceName } },
        select: { id: true },
    });
    return org?.id ?? null;
}

async function resolveOrgFromPhoneNumberId(phoneNumberId: string): Promise<string | null> {
    const org = await prisma.organization.findFirst({
        where: { settings: { path: ["metaPhoneNumberId"], equals: phoneNumberId } },
        select: { id: true },
    });
    return org?.id ?? null;
}

async function resolveOrgFromPageId(pageId: string): Promise<string | null> {
    const org = await prisma.organization.findFirst({
        where: { settings: { path: ["metaPageId"], equals: pageId } },
        select: { id: true },
    });
    return org?.id ?? null;
}

// ---------------------------------------------------------------------------
// Evolution
// ---------------------------------------------------------------------------

async function handleEvolutionUpsert(
    orgId: string,
    data: Record<string, unknown>,
): Promise<void> {
    const key = data["key"] as { remoteJid: string; fromMe: boolean; id: string };
    if (key.fromMe) return;

    const phone = normalizeJid(key.remoteJid);
    if (!phone) return;

    // Idempotency guard: bail before running any side-effects if this
    // provider message id was already processed for this org.
    if (key.id) {
        const seen = await prisma.message.findFirst({
            where: { externalId: key.id, conversation: { orgId } },
            select: { id: true },
        });
        if (seen) return;
    }

    const message = data["message"] as Record<string, unknown> | undefined;
    const messageType = data["messageType"] as string;
    const pushName = data["pushName"] as string | undefined;

    const textContent: string =
        (message?.["conversation"] as string | undefined) ??
        ((message?.["extendedTextMessage"] as Record<string, unknown> | undefined)?.["text"] as string | undefined) ??
        ((message?.["imageMessage"] as Record<string, unknown> | undefined)?.["caption"] as string | undefined) ??
        ((message?.["videoMessage"] as Record<string, unknown> | undefined)?.["caption"] as string | undefined) ??
        ((message?.["documentMessage"] as Record<string, unknown> | undefined)?.["title"] as string | undefined) ??
        "";

    const typeMap: Record<string, string> = {
        imageMessage: "IMAGE",
        videoMessage: "VIDEO",
        audioMessage: "AUDIO",
        documentMessage: "DOCUMENT",
        stickerMessage: "STICKER",
    };
    const msgType = typeMap[messageType] ?? "TEXT";

    const { contact, created: contactCreated } =
        await contactsService.findOrCreateByPhone(phone, orgId, {
            name: pushName ?? phone,
            channel: "WHATSAPP",
        });

    const { conversation, created: convCreated } =
        await inboxRepo.findOrCreateConversation("WHATSAPP", key.remoteJid, contact.id, orgId);

    const savedMessage = await inboxRepo.createMessage({
        content: textContent || "(mídia)",
        type: msgType,
        direction: "INBOUND",
        status: "DELIVERED",
        externalId: key.id,
        conversationId: conversation.id,
    });

    await inboxRepo.incrementUnread(conversation.id);

    const io = getIO();
    if (io) {
        if (convCreated) {
            io.to(`org:${orgId}`).emit("conversation:new", {
                conversationId: conversation.id,
                contactId: contact.id,
                channel: "WHATSAPP",
            });
        } else {
            io.to(`org:${orgId}`).emit("conversation:updated", { conversationId: conversation.id });
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

    if (contactCreated) {
        const automations = await inboxRepo.findActiveAutomations(orgId);
        for (const automation of automations) {
            await queues.automations().add("trigger", {
                automationId: automation.id,
                contactId: contact.id,
                orgId,
                trigger: "NEW_LEAD",
            });
        }
    }

    fireAutomation("MESSAGE_RECEIVED", { contactId: contact.id, conversationId: conversation.id, channel: "WHATSAPP", content: textContent ?? "", messageType: msgType }, orgId);
    if (textContent) fireAutomation("MESSAGE_KEYWORD", { contactId: contact.id, conversationId: conversation.id, channel: "WHATSAPP", content: textContent }, orgId);
    if (convCreated) fireAutomation("CONVERSATION_OPENED", { contactId: contact.id, conversationId: conversation.id, channel: "WHATSAPP" }, orgId);
}

async function handleEvolutionUpdate(
    orgId: string,
    data: Record<string, unknown>,
): Promise<void> {
    const key = data["key"] as { id?: string } | undefined;
    const update = data["update"] as { status?: string } | undefined;
    if (!key?.id || !update?.status) return;

    const statusMap: Record<string, string> = {
        DELIVERY_ACK: "DELIVERED",
        READ: "READ",
        PLAYED: "READ",
    };
    const mapped = statusMap[update.status];
    if (!mapped) return;

    await inboxRepo.updateMessageStatus(key.id, mapped, orgId);

    const io = getIO();
    if (io) {
        const msg = await prisma.message.findFirst({
            where: { externalId: key.id },
            select: { conversationId: true },
        });
        if (msg) {
            io.to(`conversation:${msg.conversationId}`).emit("message:status", {
                externalId: key.id,
                status: mapped,
            });
        }
    }
}

export async function processEvolutionPayload(raw: Record<string, unknown>): Promise<void> {
    const event = raw["event"] as string | undefined;
    const instance = raw["instance"] as string | undefined;
    const data = raw["data"] as Record<string, unknown> | undefined;

    if (!event || !instance || !data) return;

    const orgId = await resolveOrgFromInstance(instance);
    if (!orgId) {
        console.warn(`[inbox-processor] Evolution: unknown instance "${instance}"`);
        return;
    }

    switch (event) {
        case "messages.upsert":
        case "MESSAGES_UPSERT":
            await handleEvolutionUpsert(orgId, data);
            break;
        case "messages.update":
        case "MESSAGES_UPDATE":
        case "MESSAGE_UPDATE":
            await handleEvolutionUpdate(orgId, data);
            break;
        default:
        // connection.update and others are informational — no-op
    }
}

// ---------------------------------------------------------------------------
// Meta (WhatsApp Cloud API, Instagram, Messenger)
// ---------------------------------------------------------------------------

async function handleWhatsAppMessages(
    orgId: string,
    value: Record<string, unknown>,
): Promise<void> {
    const messages = (value["messages"] as unknown[]) ?? [];
    const contacts = (value["contacts"] as Array<{ profile: { name: string }; wa_id: string }>) ?? [];

    for (const rawMsg of messages) {
        const msg = rawMsg as {
            id: string;
            from: string;
            type: string;
            text?: { body: string };
            image?: { caption?: string };
            video?: { caption?: string };
            document?: { filename?: string };
        };

        const phone = msg.from;
        const pushName = contacts.find((c) => c.wa_id === phone)?.profile.name ?? phone;

        const { contact, created: contactCreated } =
            await contactsService.findOrCreateByPhone(phone, orgId, {
                name: pushName,
                channel: "WHATSAPP_OFFICIAL",
            });

        const { conversation, created: convCreated } =
            await inboxRepo.findOrCreateConversation("WHATSAPP_OFFICIAL", phone, contact.id, orgId);

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

        if (contactCreated) {
            const automations = await inboxRepo.findActiveAutomations(orgId);
            for (const automation of automations) {
                await queues.automations().add("trigger", {
                    automationId: automation.id,
                    contactId: contact.id,
                    orgId,
                    trigger: "NEW_LEAD",
                });
            }
        }

        fireAutomation("MESSAGE_RECEIVED", { contactId: contact.id, conversationId: conversation.id, channel: "WHATSAPP_OFFICIAL", content: textContent, messageType: typeMap[msg.type] ?? "TEXT" }, orgId);
        if (textContent && textContent !== "(mídia)") fireAutomation("MESSAGE_KEYWORD", { contactId: contact.id, conversationId: conversation.id, channel: "WHATSAPP_OFFICIAL", content: textContent }, orgId);
        if (convCreated) fireAutomation("CONVERSATION_OPENED", { contactId: contact.id, conversationId: conversation.id, channel: "WHATSAPP_OFFICIAL" }, orgId);
    }

    // Status updates
    const statuses = (value["statuses"] as Array<{ id: string; status: string }>) ?? [];
    for (const status of statuses) {
        const statusMap: Record<string, string> = {
            delivered: "DELIVERED",
            read: "READ",
            failed: "FAILED",
        };
        const mapped = statusMap[status.status];
        if (!mapped) continue;

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

async function handleMessengerEntry(
    orgId: string,
    messaging: { sender: { id: string }; message?: { mid: string; text?: string; attachments?: unknown[] } },
    channel: "INSTAGRAM" | "FACEBOOK",
): Promise<void> {
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

    const textContent = msg.text ?? "(mídia)";
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

    if (contactCreated) {
        const automations = await inboxRepo.findActiveAutomations(orgId);
        for (const automation of automations) {
            await queues.automations().add("trigger", {
                automationId: automation.id,
                contactId: contact.id,
                orgId,
                trigger: "NEW_LEAD",
            });
        }
    }

    fireAutomation("MESSAGE_RECEIVED", { contactId: contact.id, conversationId: conversation.id, channel, content: textContent, messageType: type }, orgId);
    if (msg.text) fireAutomation("MESSAGE_KEYWORD", { contactId: contact.id, conversationId: conversation.id, channel, content: msg.text }, orgId);
    if (convCreated) fireAutomation("CONVERSATION_OPENED", { contactId: contact.id, conversationId: conversation.id, channel }, orgId);
}

export async function processMetaPayload(raw: Record<string, unknown>): Promise<void> {
    const object = raw["object"] as string | undefined;
    const entry = (raw["entry"] as Record<string, unknown>[]) ?? [];

    for (const e of entry) {
        const eId = e["id"] as string;

        if (object === "whatsapp_business_account") {
            const changes = (e["changes"] as Array<{ field: string; value: Record<string, unknown> }>) ?? [];
            for (const change of changes) {
                if (change.field !== "messages") continue;
                const orgId = await resolveOrgFromPhoneNumberId(eId);
                if (!orgId) {
                    console.warn(`[inbox-processor] Meta: unknown phone number id "${eId}"`);
                    continue;
                }
                await handleWhatsAppMessages(orgId, change.value);
            }
        } else if (object === "instagram" || object === "page") {
            const channel = object === "instagram" ? "INSTAGRAM" : "FACEBOOK";
            const orgId = await resolveOrgFromPageId(eId);
            if (!orgId) {
                console.warn(`[inbox-processor] Meta: unknown page id "${eId}"`);
                continue;
            }
            const messaging = (e["messaging"] as Array<{
                sender: { id: string };
                message?: { mid: string; text?: string; attachments?: unknown[] };
            }>) ?? [];
            for (const m of messaging) {
                await handleMessengerEntry(orgId, m, channel as "INSTAGRAM" | "FACEBOOK");
            }
        }
    }
}
