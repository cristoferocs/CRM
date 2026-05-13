// Instagram Messaging channel stub.
// Uses the Instagram Messaging API via Graph API.

export class InstagramChannel {
    constructor(
        private readonly accessToken: string,
        private readonly igUserId: string,
    ) { }

    async sendTextMessage(recipientId: string, text: string) {
        const url = `https://graph.facebook.com/v19.0/${this.igUserId}/messages`;
        const payload = {
            recipient: { id: recipientId },
            message: { text },
            messaging_type: "RESPONSE",
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
                new Error(`Instagram API error: ${res.status}`),
                { statusCode: 502, detail: err },
            );
        }

        return (await res.json()) as { message_id: string };
    }
}
