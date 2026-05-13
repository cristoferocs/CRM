// Facebook Messenger channel stub.
// Uses the Messenger Platform Send API.

export class FacebookChannel {
    constructor(private readonly pageAccessToken: string) { }

    async sendTextMessage(recipientId: string, text: string) {
        const url = "https://graph.facebook.com/v19.0/me/messages";
        const payload = {
            recipient: { id: recipientId },
            message: { text },
            messaging_type: "RESPONSE",
        };

        const res = await fetch(`${url}?access_token=${this.pageAccessToken}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw Object.assign(
                new Error(`Facebook Messenger API error: ${res.status}`),
                { statusCode: 502, detail: err },
            );
        }

        return (await res.json()) as { message_id: string };
    }
}
