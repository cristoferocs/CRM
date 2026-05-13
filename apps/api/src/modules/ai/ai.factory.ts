import type { IAIProvider } from "./providers/ai-provider.interface.js";
import { GoogleProvider } from "./providers/google.provider.js";
import { AnthropicProvider } from "./providers/anthropic.provider.js";
import { OpenAIProvider } from "./providers/openai.provider.js";
import { OllamaProvider } from "./providers/ollama.provider.js";

// Singleton registry — one instance per provider type
const registry = new Map<string, IAIProvider>();

function createProvider(name: string): IAIProvider {
    switch (name.toLowerCase()) {
        case "google":
            return new GoogleProvider();
        case "anthropic":
            return new AnthropicProvider();
        case "openai":
            return new OpenAIProvider();
        case "ollama":
            return new OllamaProvider();
        default:
            throw new Error(
                `AI provider "${name}" não reconhecido. ` +
                `Valores válidos: google, anthropic, openai, ollama. ` +
                `Verifique a variável AI_PROVIDER no .env`,
            );
    }
}

/**
 * Retorna a instância do provider de AI configurado.
 * Trocar AI_PROVIDER no .env é suficiente — nenhum outro arquivo precisa mudar.
 *
 * @param providerOverride  usa este valor em vez de AI_PROVIDER (para testes ou overrides por org)
 */
export function getAIProvider(providerOverride?: string): IAIProvider {
    const name = (providerOverride ?? process.env.AI_PROVIDER ?? "google").toLowerCase();

    const cached = registry.get(name);
    if (cached) return cached;

    const provider = createProvider(name);
    registry.set(name, provider);
    return provider;
}

/**
 * Retorna o provider de embedding.
 * Quando o provider principal (ex: Anthropic) não suporta embeddings,
 * EMBEDDING_PROVIDER pode apontar para outro (ex: openai ou google).
 */
export function getEmbeddingProvider(): IAIProvider {
    const name = (
        process.env.EMBEDDING_PROVIDER ?? process.env.AI_PROVIDER ?? "google"
    ).toLowerCase();
    return getAIProvider(name);
}
