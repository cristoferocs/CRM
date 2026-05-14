/**
 * Per-1M-token USD pricing for every model we ship in the AI provider
 * factory. Numbers are list prices (no committed-use discounts); update
 * when providers change their cards.
 *
 * If a provider returns token counts via SDK, we estimate cost as:
 *   cost = inputTokens/1e6 * inputUsdPer1M + outputTokens/1e6 * outputUsdPer1M
 *
 * If a provider only returns a combined `tokensUsed` count (some chat
 * APIs do), we treat 30% as input and 70% as output by default — most
 * agent turns are heavy on output. Caller can override via `inputRatio`.
 *
 * Local providers (Ollama) cost $0.
 */
export interface ModelPricing {
    inputUsdPer1M: number;
    outputUsdPer1M: number;
    /** Optional override of the default 0.3 input / 0.7 output split when
     *  only a combined count is available. */
    defaultInputRatio?: number;
}

const PRICING: Record<string, ModelPricing> = {
    // OpenAI — https://openai.com/api/pricing/
    "openai:gpt-4o": { inputUsdPer1M: 2.50, outputUsdPer1M: 10.00 },
    "openai:gpt-4o-mini": { inputUsdPer1M: 0.15, outputUsdPer1M: 0.60 },
    "openai:gpt-4-turbo": { inputUsdPer1M: 10.00, outputUsdPer1M: 30.00 },
    "openai:gpt-3.5-turbo": { inputUsdPer1M: 0.50, outputUsdPer1M: 1.50 },

    // Anthropic — https://www.anthropic.com/pricing
    "anthropic:claude-opus-4-7": { inputUsdPer1M: 15.00, outputUsdPer1M: 75.00 },
    "anthropic:claude-opus-4": { inputUsdPer1M: 15.00, outputUsdPer1M: 75.00 },
    "anthropic:claude-sonnet-4-6": { inputUsdPer1M: 3.00, outputUsdPer1M: 15.00 },
    "anthropic:claude-sonnet-4-5": { inputUsdPer1M: 3.00, outputUsdPer1M: 15.00 },
    "anthropic:claude-sonnet-4-20250514": { inputUsdPer1M: 3.00, outputUsdPer1M: 15.00 },
    "anthropic:claude-haiku-4-5": { inputUsdPer1M: 1.00, outputUsdPer1M: 5.00 },

    // Google — Vertex AI list prices
    "google:gemini-1.5-pro": { inputUsdPer1M: 1.25, outputUsdPer1M: 5.00 },
    "google:gemini-1.5-flash": { inputUsdPer1M: 0.075, outputUsdPer1M: 0.30 },
    "google:gemini-2.0-flash": { inputUsdPer1M: 0.10, outputUsdPer1M: 0.40 },

    // Local / self-hosted
    "ollama:default": { inputUsdPer1M: 0, outputUsdPer1M: 0 },
};

const FALLBACK_PRICING: ModelPricing = {
    // Conservative default — Sonnet-class pricing for unknown models so
    // budgets aren't accidentally undercounted.
    inputUsdPer1M: 3.0,
    outputUsdPer1M: 15.0,
};

export function getModelPricing(provider: string, model: string): ModelPricing {
    const key = `${provider.toLowerCase()}:${model.toLowerCase()}`;
    if (PRICING[key]) return PRICING[key];
    // Some providers have model variants (e.g. claude-sonnet-4-6@20250514) — try a loose prefix match.
    const looseKey = Object.keys(PRICING).find((k) => key.startsWith(k));
    if (looseKey) return PRICING[looseKey]!;
    // Ollama always free regardless of model name.
    if (provider.toLowerCase() === "ollama") return PRICING["ollama:default"]!;
    return FALLBACK_PRICING;
}

export interface CostInput {
    provider: string;
    model: string;
    inputTokens?: number;
    outputTokens?: number;
    /** When only a combined count is available, pass it here. */
    tokensUsed?: number;
    /** Override the default 0.3 / 0.7 split for combined counts. */
    inputRatio?: number;
}

export interface CostResult {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    modelKey: string;
}

export function computeCost(input: CostInput): CostResult {
    const pricing = getModelPricing(input.provider, input.model);

    let inputTokens = input.inputTokens ?? 0;
    let outputTokens = input.outputTokens ?? 0;

    if ((inputTokens === 0 && outputTokens === 0) && input.tokensUsed && input.tokensUsed > 0) {
        const ratio = input.inputRatio ?? pricing.defaultInputRatio ?? 0.3;
        inputTokens = Math.round(input.tokensUsed * ratio);
        outputTokens = input.tokensUsed - inputTokens;
    }

    const costUsd =
        (inputTokens / 1_000_000) * pricing.inputUsdPer1M +
        (outputTokens / 1_000_000) * pricing.outputUsdPer1M;

    return {
        inputTokens,
        outputTokens,
        // Round to 6 decimal places to fit DECIMAL(12,6).
        costUsd: Math.round(costUsd * 1_000_000) / 1_000_000,
        modelKey: `${input.provider.toLowerCase()}:${input.model.toLowerCase()}`,
    };
}
