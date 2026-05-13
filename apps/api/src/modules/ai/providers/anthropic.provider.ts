import Anthropic from "@anthropic-ai/sdk";
import type {
    IAIProvider,
    ChatMessage,
    ChatOptions,
    ChatResponse,
} from "./ai-provider.interface.js";

const ANTHROPIC_MODEL =
    process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";

export class AnthropicProvider implements IAIProvider {
    private readonly client: Anthropic;

    constructor() {
        this.client = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY ?? "",
        });
    }

    async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResponse> {
        // Separate system messages from the conversation
        const systemParts = messages
            .filter((m) => m.role === "system")
            .map((m) => m.content)
            .join("\n\n");
        const system = options.systemPrompt
            ? [options.systemPrompt, systemParts].filter(Boolean).join("\n\n")
            : systemParts || undefined;

        const anthropicMessages = messages
            .filter((m) => m.role !== "system")
            .map((m) => ({
                role: m.role as "user" | "assistant",
                content: m.content,
            }));

        const response = await this.client.messages.create({
            model: ANTHROPIC_MODEL,
            max_tokens: options.maxTokens ?? 2048,
            temperature: options.temperature ?? 0.3,
            system: system,
            messages: anthropicMessages,
        });

        const content =
            response.content
                .filter((b) => b.type === "text")
                .map((b) => (b as { type: "text"; text: string }).text)
                .join("") ?? "";

        const tokensUsed =
            (response.usage.input_tokens ?? 0) + (response.usage.output_tokens ?? 0);

        return { content, tokensUsed, model: ANTHROPIC_MODEL };
    }

    async embed(_text: string): Promise<number[]> {
        throw new Error(
            "Anthropic não suporta embeddings nativos. " +
            "Configure EMBEDDING_PROVIDER=google ou EMBEDDING_PROVIDER=openai " +
            "para usar um provider de embedding dedicado em paralelo.",
        );
    }

    async embedBatch(_texts: string[]): Promise<number[][]> {
        throw new Error(
            "Anthropic não suporta embeddings nativos. " +
            "Configure EMBEDDING_PROVIDER=google ou EMBEDDING_PROVIDER=openai.",
        );
    }

    async analyzeDocument(content: string, instruction: string): Promise<string> {
        const response = await this.chat([
            { role: "user", content: `${instruction}\n\n${content}` },
        ]);
        return response.content;
    }

    async isAvailable(): Promise<boolean> {
        try {
            await this.client.messages.create({
                model: ANTHROPIC_MODEL,
                max_tokens: 8,
                messages: [{ role: "user", content: "ping" }],
            });
            return true;
        } catch {
            return false;
        }
    }
}
