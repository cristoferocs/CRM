import OpenAI from "openai";
import type {
    IAIProvider,
    ChatMessage,
    ChatOptions,
    ChatResponse,
} from "./ai-provider.interface.js";

const CHAT_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o";
const EMBED_MODEL = "text-embedding-3-small"; // 1536 dimensions

export class OpenAIProvider implements IAIProvider {
    private readonly client: OpenAI;

    constructor() {
        this.client = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY ?? "",
        });
    }

    async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResponse> {
        const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

        if (options.systemPrompt) {
            openaiMessages.push({ role: "system", content: options.systemPrompt });
        }

        for (const m of messages) {
            openaiMessages.push({ role: m.role, content: m.content });
        }

        const response = await this.client.chat.completions.create({
            model: CHAT_MODEL,
            messages: openaiMessages,
            temperature: options.temperature ?? 0.3,
            max_tokens: options.maxTokens ?? 2048,
        });

        const content = response.choices[0]?.message?.content ?? "";
        const tokensUsed = response.usage?.total_tokens ?? 0;

        return { content, tokensUsed, model: CHAT_MODEL };
    }

    async embed(text: string): Promise<number[]> {
        const response = await this.client.embeddings.create({
            model: EMBED_MODEL,
            input: text,
        });
        return response.data[0]!.embedding;
    }

    async embedBatch(texts: string[]): Promise<number[][]> {
        const response = await this.client.embeddings.create({
            model: EMBED_MODEL,
            input: texts,
        });
        // Sort by index to preserve order
        return response.data
            .sort((a, b) => a.index - b.index)
            .map((d) => d.embedding);
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
