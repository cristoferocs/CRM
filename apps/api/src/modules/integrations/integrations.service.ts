import { prisma } from "../../lib/prisma.js";

// ---------------------------------------------------------------------------
// Telegram Bot Integration
// ---------------------------------------------------------------------------

export class TelegramIntegration {
    private token: string;
    private apiBase: string;

    constructor(token: string) {
        this.token = token;
        this.apiBase = `https://api.telegram.org/bot${token}`;
    }

    async sendMessage(chatId: string | number, text: string, parseMode?: "HTML" | "Markdown") {
        const res = await fetch(`${this.apiBase}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode }),
        });
        if (!res.ok) throw new Error(`Telegram API error: ${res.status}`);
        return res.json();
    }

    async setWebhook(webhookUrl: string) {
        const res = await fetch(`${this.apiBase}/setWebhook`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: webhookUrl }),
        });
        return res.json();
    }

    async getMe() {
        const res = await fetch(`${this.apiBase}/getMe`);
        return res.json();
    }

    parseUpdate(body: Record<string, unknown>) {
        const message = body.message as Record<string, unknown> | undefined;
        if (!message) return null;
        const from = message.from as Record<string, unknown> | undefined;
        const chat = message.chat as Record<string, unknown> | undefined;
        return {
            messageId: message.message_id as number,
            chatId: chat?.id as number,
            text: message.text as string,
            from: {
                id: from?.id as number,
                firstName: from?.first_name as string,
                lastName: from?.last_name as string,
                username: from?.username as string,
            },
        };
    }
}

// ---------------------------------------------------------------------------
// Slack Notifier
// ---------------------------------------------------------------------------

export class SlackNotifier {
    constructor(private webhookUrl: string) { }

    async send(message: {
        text: string;
        blocks?: unknown[];
        channel?: string;
        username?: string;
        iconEmoji?: string;
    }) {
        const res = await fetch(this.webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                text: message.text,
                blocks: message.blocks,
                channel: message.channel,
                username: message.username ?? "CRM Bot",
                icon_emoji: message.iconEmoji ?? ":robot_face:",
            }),
        });
        if (!res.ok) throw new Error(`Slack API error: ${res.status}`);
        return { success: true };
    }

    static buildDealWonBlock(dealTitle: string, value: number, owner: string) {
        return {
            text: `🎉 Deal fechado: ${dealTitle}`,
            blocks: [
                {
                    type: "section",
                    text: { type: "mrkdwn", text: `🎉 *Novo fechamento!*\n*Deal:* ${dealTitle}\n*Valor:* R$ ${value.toLocaleString("pt-BR")}\n*Responsável:* ${owner}` },
                },
            ],
        };
    }

    static buildNewLeadBlock(name: string, source: string) {
        return {
            text: `👋 Novo lead: ${name}`,
            blocks: [
                {
                    type: "section",
                    text: { type: "mrkdwn", text: `👋 *Novo lead chegou!*\n*Nome:* ${name}\n*Origem:* ${source}` },
                },
            ],
        };
    }
}

// ---------------------------------------------------------------------------
// Zapier Service
// ---------------------------------------------------------------------------

export class ZapierService {
    async subscribe(orgId: string, data: { hookUrl: string; event: string }) {
        return prisma.zapierSubscription.create({
            data: { orgId, targetUrl: data.hookUrl, event: data.event, isActive: true },
        });
    }

    async unsubscribe(hookUrl: string, orgId: string) {
        await prisma.zapierSubscription.updateMany({
            where: { targetUrl: hookUrl, orgId },
            data: { isActive: false },
        });
    }

    async trigger(orgId: string, event: string, payload: Record<string, unknown>) {
        const subs = await prisma.zapierSubscription.findMany({
            where: { orgId, event, isActive: true },
        });

        const results = await Promise.allSettled(
            subs.map(sub =>
                fetch(sub.targetUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ event, ...payload }),
                    signal: AbortSignal.timeout(15_000),
                }),
            ),
        );

        return { fired: subs.length, results: results.map(r => r.status) };
    }
}

// ---------------------------------------------------------------------------
// Make.com Service
// ---------------------------------------------------------------------------

export class MakeService {
    async triggerScenario(webhookUrl: string, payload: Record<string, unknown>) {
        const res = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(30_000),
        });
        return { success: res.ok, status: res.status };
    }
}
