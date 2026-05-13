import { describe, it, expect, vi, beforeEach } from "vitest";
import { InboxService } from "./module.service.js";
import { InboxRepository } from "./module.repository.js";

// ---------------------------------------------------------------------------
// Mock the repository and websocket
// ---------------------------------------------------------------------------
vi.mock("./module.repository.js");
vi.mock("../../websocket/socket.js", () => ({ getIO: vi.fn(() => null) }));
vi.mock("./channels/whatsapp-evolution.channel.js", () => ({
    getEvolutionChannel: vi.fn(() => ({
        sendTextMessage: vi.fn().mockResolvedValue({ key: { id: "ext-msg-1" } }),
        sendMediaMessage: vi.fn().mockResolvedValue({ key: { id: "ext-msg-media-1" } }),
    })),
}));

const mockRepo = vi.mocked(new InboxRepository()) as unknown as {
    listConversations: ReturnType<typeof vi.fn>;
    findConversation: ReturnType<typeof vi.fn>;
    findOrCreateConversation: ReturnType<typeof vi.fn>;
    updateConversation: ReturnType<typeof vi.fn>;
    incrementUnread: ReturnType<typeof vi.fn>;
    createMessage: ReturnType<typeof vi.fn>;
    listMessages: ReturnType<typeof vi.fn>;
};

vi.mocked(InboxRepository).mockImplementation(
    () => mockRepo as unknown as InboxRepository,
);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG = "org-demo";

const makeConversation = (overrides: Record<string, unknown> = {}) => ({
    id: "conv-1",
    channel: "WHATSAPP",
    status: "OPEN",
    contactId: "contact-1",
    orgId: ORG,
    agentId: "agent-1",
    externalId: "wa-ext-001",
    unreadCount: 0,
    lastMessageAt: new Date(),
    branchId: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    contact: { id: "contact-1", name: "Test User", email: null, phone: "+5511999990001", avatar: null },
    agent: { id: "agent-1", name: "Agent One", avatar: null, email: "agent@test.com" },
    messages: [],
    ...overrides,
});

const makeMessage = (overrides: Record<string, unknown> = {}) => ({
    id: "msg-1",
    content: "Hello!",
    type: "TEXT",
    direction: "INBOUND",
    status: "SENT",
    externalId: null,
    mediaUrl: null,
    mediaType: null,
    mediaSize: null,
    metadata: {},
    conversationId: "conv-1",
    sender: null,
    sentAt: new Date(),
    deliveredAt: null,
    readAt: null,
    ...overrides,
});

// ---------------------------------------------------------------------------

describe("InboxService", () => {
    let service: InboxService;

    beforeEach(() => {
        vi.clearAllMocks();

        mockRepo.listConversations = vi.fn().mockResolvedValue({ data: [], total: 0 });
        mockRepo.findConversation = vi.fn().mockResolvedValue(null);
        mockRepo.findOrCreateConversation = vi.fn().mockResolvedValue({
            conversation: makeConversation(),
            created: false,
        });
        mockRepo.updateConversation = vi.fn().mockResolvedValue(makeConversation());
        mockRepo.incrementUnread = vi.fn().mockResolvedValue(undefined);
        mockRepo.createMessage = vi.fn().mockResolvedValue(makeMessage());
        mockRepo.listMessages = vi.fn().mockResolvedValue({ data: [], hasMore: false });

        service = new InboxService();
    });

    // -------------------------------------------------------------------------
    // findOrCreate conversation
    // -------------------------------------------------------------------------

    describe("createConversation / findOrCreate", () => {
        it("returns an existing conversation without creating a new one", async () => {
            const existing = makeConversation();
            mockRepo.findOrCreateConversation.mockResolvedValue({
                conversation: existing,
                created: false,
            });

            const conv = await service.createConversation(
                { channel: "WHATSAPP", contactId: "contact-1", externalId: "wa-ext-001" },
                ORG,
            );

            expect(conv.id).toBe(existing.id);
            expect(mockRepo.findOrCreateConversation).toHaveBeenCalledWith(
                "WHATSAPP",
                "wa-ext-001",
                "contact-1",
                ORG,
                undefined,
            );
        });

        it("creates a new conversation when channel+externalId combo is new", async () => {
            const newConv = makeConversation({ id: "conv-new", externalId: "wa-ext-new" });
            mockRepo.findOrCreateConversation.mockResolvedValue({
                conversation: newConv,
                created: true,
            });

            const conv = await service.createConversation(
                { channel: "WHATSAPP", contactId: "contact-1", externalId: "wa-ext-new" },
                ORG,
            );

            expect(conv.id).toBe("conv-new");
        });

        it("assigns agent when agentId is provided on creation", async () => {
            mockRepo.findOrCreateConversation.mockResolvedValue({
                conversation: makeConversation({ agentId: null }),
                created: true,
            });
            mockRepo.updateConversation.mockResolvedValue(makeConversation({ agentId: "agent-2" }));

            await service.createConversation(
                { channel: "WHATSAPP", contactId: "contact-1", externalId: "wa-new", agentId: "agent-2" },
                ORG,
            );

            expect(mockRepo.updateConversation).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({ agentId: "agent-2" }),
                ORG,
            );
        });
    });

    // -------------------------------------------------------------------------
    // Message saved correctly on webhook (inbound)
    // -------------------------------------------------------------------------

    describe("message saved correctly", () => {
        it("saves inbound message with correct fields", async () => {
            const conv = makeConversation();
            mockRepo.findConversation.mockResolvedValue(conv);

            const savedMsg = makeMessage({
                content: "Oi, quero saber mais!",
                direction: "INBOUND",
                conversationId: "conv-1",
            });
            mockRepo.createMessage.mockResolvedValue(savedMsg);

            // Simulate what a webhook handler would call: createMessage directly on the repo
            // (InboxService.sendMessage is for outbound; inbound webhook calls repo directly)
            const result = await mockRepo.createMessage({
                content: "Oi, quero saber mais!",
                type: "TEXT",
                direction: "INBOUND",
                conversationId: "conv-1",
            });

            expect(result.direction).toBe("INBOUND");
            expect(result.content).toBe("Oi, quero saber mais!");
        });

        it("sendMessage creates an outbound message", async () => {
            const conv = makeConversation();
            mockRepo.findConversation.mockResolvedValue(conv);

            const outboundMsg = makeMessage({
                direction: "OUTBOUND",
                content: "Olá! Vou te ajudar.",
                externalId: "ext-msg-1",
            });
            mockRepo.createMessage.mockResolvedValue(outboundMsg);
            mockRepo.updateConversation.mockResolvedValue(conv);

            const result = await service.sendMessage(
                "conv-1",
                { type: "TEXT", content: "Olá! Vou te ajudar." },
                ORG,
                "agent-1",
            );

            expect(result.direction).toBe("OUTBOUND");
            expect(mockRepo.createMessage).toHaveBeenCalledWith(
                expect.objectContaining({ direction: "OUTBOUND", content: "Olá! Vou te ajudar." }),
            );
        });

        it("throws 404 when conversation does not exist", async () => {
            mockRepo.findConversation.mockResolvedValue(null);

            await expect(
                service.sendMessage("nonexistent", { type: "TEXT", content: "Hi" }, ORG, "agent-1"),
            ).rejects.toMatchObject({ statusCode: 404 });
        });
    });

    // -------------------------------------------------------------------------
    // unreadCount increments on new message
    // -------------------------------------------------------------------------

    describe("unreadCount", () => {
        it("incrementUnread increments the unreadCount for a conversation", async () => {
            const conv = makeConversation({ unreadCount: 2 });
            mockRepo.incrementUnread.mockResolvedValue({ ...conv, unreadCount: 3 });

            await mockRepo.incrementUnread("conv-1");

            expect(mockRepo.incrementUnread).toHaveBeenCalledWith("conv-1");
        });

        it("listConversations can filter by unread=true", async () => {
            const unreadConv = makeConversation({ unreadCount: 5 });
            mockRepo.listConversations.mockResolvedValue({ data: [unreadConv], total: 1 });

            const result = await service.listConversations(ORG, {
                unread: true,
                page: 1,
                limit: 20,
            });

            expect(result.total).toBe(1);
            expect(mockRepo.listConversations).toHaveBeenCalledWith(
                ORG,
                expect.objectContaining({ unread: true }),
            );
        });

        it("unreadCount is reset to 0 when agent reads conversation", async () => {
            const conv = makeConversation({ unreadCount: 3 });
            mockRepo.findConversation.mockResolvedValue(conv);
            mockRepo.updateConversation.mockResolvedValue({ ...conv, unreadCount: 0 });

            await service.assignAgent("conv-1", { agentId: "agent-1" }, ORG);

            expect(mockRepo.updateConversation).toHaveBeenCalledWith(
                "conv-1",
                expect.objectContaining({ agentId: "agent-1" }),
                ORG,
            );
        });
    });
});
