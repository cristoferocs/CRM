import { ImapFlow } from "imapflow";
import type { FastifyInstance } from "fastify";
import { prisma } from "../../../lib/prisma.js";
import { getIO } from "../../../websocket/socket.js";
import { InboxRepository } from "../module.repository.js";
import { ContactsService } from "../../contacts/module.service.js";

const inboxRepo = new InboxRepository();
const contactsService = new ContactsService();

export interface EmailPollerConfig {
    orgId: string;
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    mailbox?: string;
    pollIntervalMs?: number;
}

// ---------------------------------------------------------------------------
// IMAP Poller
// ---------------------------------------------------------------------------

export class EmailPoller {
    private timer: ReturnType<typeof setInterval> | null = null;
    private readonly mailbox: string;
    private readonly pollIntervalMs: number;

    constructor(
        private readonly config: EmailPollerConfig,
        private readonly fastify: FastifyInstance,
    ) {
        this.mailbox = config.mailbox ?? "INBOX";
        this.pollIntervalMs = config.pollIntervalMs ?? 60_000;
    }

    start() {
        if (this.timer) return;
        this.timer = setInterval(() => {
            this.poll().catch((err) =>
                this.fastify.log.error({ err, orgId: this.config.orgId }, "Email poll error"),
            );
        }, this.pollIntervalMs);

        // Run immediately
        this.poll().catch((err) =>
            this.fastify.log.error({ err }, "Initial email poll error"),
        );
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    private async poll() {
        const client = new ImapFlow({
            host: this.config.host,
            port: this.config.port,
            secure: this.config.secure,
            auth: { user: this.config.user, pass: this.config.pass },
            logger: false,
        });

        try {
            await client.connect();
            const lock = await client.getMailboxLock(this.mailbox);

            try {
                // Fetch unseen messages
                const messages = client.fetch("1:*", {
                    envelope: true,
                    bodyStructure: true,
                    source: true,
                    flags: true,
                });

                for await (const msg of messages) {
                    // Skip already-seen
                    if (msg.flags?.has("\\Seen")) continue;

                    const from = msg.envelope?.from?.[0];
                    if (!from) continue;

                    const fromEmail = from.address ?? "";
                    const fromName = from.name ?? fromEmail;

                    const { contact, created: contactCreated } =
                        await contactsService.findOrCreateByPhone(fromEmail, this.config.orgId, {
                            name: fromName || fromEmail,
                            email: fromEmail,
                            channel: "EMAIL",
                        });

                    const subject = msg.envelope?.subject ?? "(sem assunto)";
                    const { conversation, created: convCreated } =
                        await inboxRepo.findOrCreateConversation(
                            "EMAIL",
                            fromEmail,
                            contact.id,
                            this.config.orgId,
                        );

                    const savedMessage = await inboxRepo.createMessage({
                        content: subject,
                        type: "TEXT",
                        direction: "INBOUND",
                        status: "DELIVERED",
                        externalId: msg.envelope?.messageId ?? undefined,
                        conversationId: conversation.id,
                    });

                    await inboxRepo.incrementUnread(conversation.id);

                    // Mark as seen
                    await client.messageFlagsAdd(msg.seq.toString(), ["\\Seen"]);

                    const io = getIO();
                    if (io) {
                        if (convCreated) {
                            io.to(`org:${this.config.orgId}`).emit("conversation:new", {
                                conversationId: conversation.id,
                                contactId: contact.id,
                                channel: "EMAIL",
                            });
                        }
                        io.to(`conversation:${conversation.id}`).emit("message:new", {
                            conversationId: conversation.id,
                            message: savedMessage,
                        });
                    }
                }
            } finally {
                lock.release();
            }
        } finally {
            await client.logout();
        }
    }
}

// ---------------------------------------------------------------------------
// Registry — one poller per org email config
// ---------------------------------------------------------------------------

const pollers = new Map<string, EmailPoller>();

export function startEmailPoller(
    config: EmailPollerConfig,
    fastify: FastifyInstance,
): EmailPoller {
    const key = `${config.orgId}:${config.user}`;
    const existing = pollers.get(key);
    if (existing) return existing;

    const poller = new EmailPoller(config, fastify);
    poller.start();
    pollers.set(key, poller);
    return poller;
}

export function stopEmailPoller(orgId: string, user: string) {
    const key = `${orgId}:${user}`;
    const poller = pollers.get(key);
    if (poller) {
        poller.stop();
        pollers.delete(key);
    }
}
