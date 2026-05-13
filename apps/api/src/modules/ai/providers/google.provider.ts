import { VertexAI } from "@google-cloud/vertexai";
import { GoogleAuth } from "google-auth-library";
import type {
    IAIProvider,
    ChatMessage,
    ChatOptions,
    ChatResponse,
} from "./ai-provider.interface.js";

const VERTEX_PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? "";
const VERTEX_LOCATION = process.env.GOOGLE_CLOUD_LOCATION ?? "us-central1";
const CHAT_MODEL = process.env.GOOGLE_VERTEX_MODEL ?? "gemini-1.5-pro";
const EMBED_MODEL = process.env.GOOGLE_VERTEX_EMBED_MODEL ?? "text-embedding-004";

const auth = new GoogleAuth({
    scopes: "https://www.googleapis.com/auth/cloud-platform",
});

// ---------------------------------------------------------------------------
// Exponential back-off helper
// ---------------------------------------------------------------------------

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
    let attempt = 0;
    while (true) {
        try {
            return await fn();
        } catch (err: unknown) {
            attempt++;
            const isRateLimit =
                err instanceof Error &&
                (err.message.includes("429") || err.message.includes("RESOURCE_EXHAUSTED"));

            if (!isRateLimit || attempt >= maxAttempts) throw err;

            const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
            await new Promise((r) => setTimeout(r, delay));
        }
    }
}

// ---------------------------------------------------------------------------
// Vertex AI REST embedding helper
// ---------------------------------------------------------------------------

interface EmbedResponse {
    predictions: Array<{ embeddings: { values: number[] } }>;
}

async function embedViaRest(texts: string[]): Promise<number[][]> {
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const token = tokenResponse.token ?? "";

    const url =
        `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/` +
        `${VERTEX_PROJECT}/locations/${VERTEX_LOCATION}/publishers/google/models/${EMBED_MODEL}:predict`;

    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            instances: texts.map((t) => ({ content: t })),
        }),
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Vertex AI embeddings error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as EmbedResponse;
    return data.predictions.map((p) => p.embeddings.values);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class GoogleProvider implements IAIProvider {
    private readonly vertex: VertexAI;

    constructor() {
        this.vertex = new VertexAI({
            project: VERTEX_PROJECT,
            location: VERTEX_LOCATION,
        });
    }

    async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResponse> {
        const model = this.vertex.getGenerativeModel({
            model: CHAT_MODEL,
            generationConfig: {
                temperature: options.temperature ?? 0.3,
                maxOutputTokens: options.maxTokens ?? 2048,
            },
        });

        const systemInstruction = options.systemPrompt
            ? { role: "system" as const, parts: [{ text: options.systemPrompt }] }
            : undefined;

        const history = messages
            .filter((m) => m.role !== "system")
            .map((m) => ({
                role: m.role === "assistant" ? "model" : "user",
                parts: [{ text: m.content }],
            }));

        const lastMessage = history.pop() ?? { role: "user", parts: [{ text: "" }] };

        const chat = model.startChat({
            history: history as never,
            systemInstruction: systemInstruction as never,
        });

        const result = await withRetry(() =>
            chat.sendMessage(lastMessage.parts.map((p) => p.text).join("\n")),
        );

        const candidate = result.response.candidates?.[0];
        const content =
            candidate?.content?.parts?.map((p) => ("text" in p ? p.text : "")).join("") ?? "";
        const tokensUsed = result.response.usageMetadata?.totalTokenCount ?? 0;

        return { content, tokensUsed, model: CHAT_MODEL };
    }

    async embed(text: string): Promise<number[]> {
        const results = await withRetry(() => embedViaRest([text]));
        return results[0]!;
    }

    async embedBatch(texts: string[]): Promise<number[][]> {
        const BATCH_SIZE = 250;
        const results: number[][] = [];
        for (let i = 0; i < texts.length; i += BATCH_SIZE) {
            const batch = texts.slice(i, i + BATCH_SIZE);
            const batchResults = await withRetry(() => embedViaRest(batch));
            results.push(...batchResults);
        }
        return results;
    }

    async analyzeDocument(content: string, instruction: string): Promise<string> {
        const response = await this.chat([
            { role: "system", content: instruction },
            { role: "user", content: content },
        ]);
        return response.content;
    }

    async isAvailable(): Promise<boolean> {
        try {
            await this.embed("ping");
            return true;
        } catch {
            return false;
        }
    }
}
