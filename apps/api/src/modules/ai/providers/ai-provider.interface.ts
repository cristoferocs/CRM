// =============================================================================
// IAIProvider — interface central que todos os providers implementam
// O restante do sistema NUNCA chama um provider diretamente; tudo passa aqui.
// =============================================================================

export interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

export interface ChatOptions {
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
}

export interface ChatResponse {
    content: string;
    /** Combined input + output token count (kept for backwards compat). */
    tokensUsed: number;
    /**
     * Split counts when the provider returns them. Set together with
     * `tokensUsed`. When only `tokensUsed` is known, leave these undefined
     * and downstream cost computation will estimate a split.
     */
    inputTokens?: number;
    outputTokens?: number;
    model: string;
}

export interface IAIProvider {
    /**
     * Chat completion — conversa multi-turn com o modelo.
     */
    chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;

    /**
     * Gera embedding vetorial de um único texto.
     */
    embed(text: string): Promise<number[]>;

    /**
     * Versão otimizada para batch de embeddings.
     */
    embedBatch(texts: string[]): Promise<number[][]>;

    /**
     * Analisa um documento com uma instrução específica.
     * Retorna a resposta textual do modelo.
     */
    analyzeDocument(content: string, instruction: string): Promise<string>;

    /**
     * Health check do provider.
     */
    isAvailable(): Promise<boolean>;
}
