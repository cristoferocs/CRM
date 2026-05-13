import axios, { type AxiosInstance } from "axios";

export interface EvolutionInstanceInfo {
    instanceName: string;
    status: string;
    number?: string;
}

export interface EvolutionQRCode {
    pairingCode: string | null;
    code: string;
    base64: string;
}

export type EvolutionMediaType = "image" | "video" | "audio" | "document";

export class EvolutionAPIChannel {
    private readonly http: AxiosInstance;

    constructor(
        private readonly baseUrl: string,
        private readonly apiKey: string,
    ) {
        this.http = axios.create({
            baseURL: baseUrl.replace(/\/$/, ""),
            headers: {
                apikey: apiKey,
                "Content-Type": "application/json",
            },
            timeout: 15_000,
        });
    }

    // -------------------------------------------------------------------------
    // Instance management
    // -------------------------------------------------------------------------

    async createInstance(instanceName: string, number: string) {
        const { data } = await this.http.post("/instance/create", {
            instanceName,
            number,
            qrcode: true,
            integration: "WHATSAPP-BAILEYS",
        });
        return data as EvolutionInstanceInfo;
    }

    async getQRCode(instanceName: string): Promise<EvolutionQRCode> {
        const { data } = await this.http.get(`/instance/connect/${instanceName}`);
        return data as EvolutionQRCode;
    }

    async getInstanceStatus(instanceName: string): Promise<{ state: string }> {
        const { data } = await this.http.get(
            `/instance/connectionState/${instanceName}`,
        );
        return data as { state: string };
    }

    async deleteInstance(instanceName: string) {
        const { data } = await this.http.delete(`/instance/delete/${instanceName}`);
        return data;
    }

    // -------------------------------------------------------------------------
    // Webhook
    // -------------------------------------------------------------------------

    async setWebhook(instanceName: string, webhookUrl: string) {
        const { data } = await this.http.post(`/webhook/set/${instanceName}`, {
            url: webhookUrl,
            webhook_by_events: false,
            webhook_base64: false,
            events: [
                "MESSAGES_UPSERT",
                "MESSAGES_UPDATE",
                "CONNECTION_UPDATE",
                "SEND_MESSAGE",
            ],
        });
        return data;
    }

    // -------------------------------------------------------------------------
    // Messaging
    // -------------------------------------------------------------------------

    async sendTextMessage(instanceName: string, to: string, text: string) {
        const { data } = await this.http.post(
            `/message/sendText/${instanceName}`,
            {
                number: to,
                options: { delay: 1200 },
                textMessage: { text },
            },
        );
        return data as { key: { id: string } };
    }

    async sendMediaMessage(
        instanceName: string,
        to: string,
        mediaUrl: string,
        caption: string,
        type: EvolutionMediaType,
    ) {
        const { data } = await this.http.post(
            `/message/sendMedia/${instanceName}`,
            {
                number: to,
                options: { delay: 1200 },
                mediaMessage: { mediatype: type, media: mediaUrl, caption },
            },
        );
        return data as { key: { id: string } };
    }

    async sendTemplateMessage(
        instanceName: string,
        to: string,
        template: string,
        variables: string[],
    ) {
        const { data } = await this.http.post(
            `/message/sendTemplate/${instanceName}`,
            {
                number: to,
                template: {
                    name: template,
                    language: { code: "pt_BR" },
                    components: [
                        {
                            type: "body",
                            parameters: variables.map((v) => ({ type: "text", text: v })),
                        },
                    ],
                },
            },
        );
        return data as { key: { id: string } };
    }
}

// ---------------------------------------------------------------------------
// Singleton factory keyed by orgId
// ---------------------------------------------------------------------------

const instances = new Map<string, EvolutionAPIChannel>();

export function getEvolutionChannel(orgId: string): EvolutionAPIChannel {
    const existing = instances.get(orgId);
    if (existing) return existing;

    const baseUrl = process.env.EVOLUTION_API_URL ?? "http://localhost:8080";
    const apiKey = process.env.EVOLUTION_API_KEY ?? "";
    const channel = new EvolutionAPIChannel(baseUrl, apiKey);
    instances.set(orgId, channel);
    return channel;
}
