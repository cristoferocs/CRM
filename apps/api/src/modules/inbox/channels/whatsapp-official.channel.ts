// WhatsApp Cloud API (Meta Official) channel stub.
// Full implementation requires a Meta Business account and approved phone number.

export class WhatsAppOfficialChannel {
    constructor(
        private readonly accessToken: string,
        private readonly phoneNumberId: string,
    ) { }

    async sendTextMessage(to: string, text: string) {
        const url = `https://graph.facebook.com/v19.0/${this.phoneNumberId}/messages`;
        const payload = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to,
            type: "text",
            text: { body: text },
        };

        const res = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${this.accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw Object.assign(
                new Error(`WhatsApp Official API error: ${res.status}`),
                { statusCode: 502, detail: err },
            );
        }

        return (await res.json()) as { messages: { id: string }[] };
    }

    async sendMediaMessage(
        to: string,
        mediaUrl: string,
        caption: string,
        type: "image" | "video" | "document" | "audio",
    ) {
        const url = `https://graph.facebook.com/v19.0/${this.phoneNumberId}/messages`;
        const payload = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to,
            type,
            [type]: { link: mediaUrl, ...(caption ? { caption } : {}) },
        };

        const res = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${this.accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw Object.assign(
                new Error(`WhatsApp Official API error: ${res.status}`),
                { statusCode: 502, detail: err },
            );
        }

        return (await res.json()) as { messages: { id: string }[] };
    }
}
