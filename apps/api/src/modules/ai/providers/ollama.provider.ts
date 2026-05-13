import type {
    IAIProvider,
    ChatMessage,
    ChatOptions,
    ChatResponse,
} from "./ai-provider.interface.js";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const OLLAMA_CHAT_MODEL = process.env.OLLAMA_MODEL ?? "llama3";
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text";

interface OllamaChatResponse {
    model: string;
    message: { role: string; content: string };
    eval_count?: number;
    prompt_eval_count?: number;
    done: boolean;
}

interface OllamaEmbedResponse {
    embedding: number[];
}

interface OllamaTagsResponse {
    models: Array<{ name: string }>;
}

export class OllamaProvider implements IAIProvider {
    private async post<T>(path: string, body: unknown): Promise<T> {
        const response = await fetch(`${OLLAMA_BASE_URL}${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Ollama error ${response.status}: ${text}`);
        }

        return response.json() as Promise<T>;
    }

    async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResponse> {
        const ollamaMessages = messages.map((m) => ({
            role: m.role,
            content: m.content,
        }));

        if (options.systemPrompt) {
            ollamaMessages.unshift({ role: "system", content: options.systemPrompt });
        }

        const result = await this.post<OllamaChatResponse>("/api/chat", {
            model: OLLAMA_CHAT_MODEL,
            messages: ollamaMessages,
            stream: false,
            options: {
                temperature: options.temperature ?? 0.3,
                num_predict: options.maxTokens ?? 2048,
            },
        });

        const tokensUsed = (result.eval_count ?? 0) + (result.prompt_eval_count ?? 0);

        return {
            content: result.message.content,
            tokensUsed,
            model: result.model,
        };
    }

    async embed(text: string): Promise<number[]> {
        const result = await this.post<OllamaEmbedResponse>("/api/embeddings", {
            model: OLLAMA_EMBED_MODEL,
            prompt: text,
        });
        return result.embedding;
    }

    async embedBatch(texts: string[]): Promise<number[][]> {
        // Ollama doesn't have native batch; run sequentially
        return Promise.all(texts.map((t) => this.embed(t)));
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
            const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
            if (!response.ok) return false;
            const data = (await response.json()) as OllamaTagsResponse;
            const models = data.models?.map((m) => m.name) ?? [];
            return models.some(
                (m) => m.startsWith(OLLAMA_CHAT_MODEL) || m.startsWith(OLLAMA_EMBED_MODEL),
            );
        } catch {
            return false;
        }
    }
}
