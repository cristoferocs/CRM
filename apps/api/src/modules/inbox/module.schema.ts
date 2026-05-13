import { z } from "zod";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const ConversationChannelEnum = z.enum([
    "WHATSAPP",
    "WHATSAPP_OFFICIAL",
    "INSTAGRAM",
    "FACEBOOK",
    "EMAIL",
    "INTERNAL",
]);

export const ConversationStatusEnum = z.enum([
    "OPEN",
    "PENDING",
    "BOT",
    "RESOLVED",
    "SPAM",
]);

export const MessageTypeEnum = z.enum([
    "TEXT",
    "IMAGE",
    "AUDIO",
    "VIDEO",
    "DOCUMENT",
    "STICKER",
    "LOCATION",
    "TEMPLATE",
]);

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export const ConversationFiltersSchema = z.object({
    channel: ConversationChannelEnum.optional(),
    status: ConversationStatusEnum.optional(),
    agentId: z.string().optional(),
    contactId: z.string().optional(),
    unread: z.coerce.boolean().optional(),
    search: z.string().max(200).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const CreateConversationSchema = z.object({
    channel: ConversationChannelEnum,
    contactId: z.string(),
    agentId: z.string().optional(),
    externalId: z.string().optional(),
    branchId: z.string().optional(),
});

export const AssignAgentSchema = z.object({
    agentId: z.string().nullable(),
});

export const ChangeStatusSchema = z.object({
    status: ConversationStatusEnum,
});

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export const SendMessageSchema = z.object({
    type: MessageTypeEnum.default("TEXT"),
    content: z.string().min(1).max(4096),
    mediaUrl: z.string().url().optional(),
    mediaType: z.string().optional(),
});

export const MessageCursorSchema = z.object({
    before: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConversationFilters = z.infer<typeof ConversationFiltersSchema>;
export type CreateConversationInput = z.infer<typeof CreateConversationSchema>;
export type AssignAgentInput = z.infer<typeof AssignAgentSchema>;
export type ChangeStatusInput = z.infer<typeof ChangeStatusSchema>;
export type SendMessageInput = z.infer<typeof SendMessageSchema>;
export type MessageCursorInput = z.infer<typeof MessageCursorSchema>;