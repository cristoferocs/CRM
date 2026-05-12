export type InfraTier = "starter" | "growth" | "enterprise";

export type AiProvider = "google" | "anthropic" | "openai" | "ollama";

export type VectorSearchProvider = "pgvector" | "vertex";

export interface TenantBranding {
    clientName: string;
    clientSlug: string;
    primaryColor?: string;
    logoUrl?: string;
}

export interface HealthResponse {
    status: "ok";
    service: string;
    timestamp: string;
}