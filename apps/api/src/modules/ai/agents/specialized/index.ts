/**
 * index.ts — Specialized agent registry
 *
 * Provides a lookup map from AgentType → specialized config builder.
 * The agent service uses this to inject type-specific prompts, tools,
 * and handoff rules when creating or running agents.
 */

export { buildCustomerSuccessConfig, CUSTOMER_SUCCESS_PERSONALITY } from "./customer-success.agent.js";
export { buildRetentionConfig, RETENTION_PERSONALITY } from "./retention.agent.js";
export { buildUpsellConfig, UPSELL_PERSONALITY } from "./upsell.agent.js";

import { buildCustomerSuccessConfig } from "./customer-success.agent.js";
import { buildRetentionConfig } from "./retention.agent.js";
import { buildUpsellConfig } from "./upsell.agent.js";

type SpecializedConfig = {
    type: string;
    systemPrompt: string;
    enabledTools: string[];
    requiredDataPoints: string[];
    handoffRules: Record<string, unknown>;
    personality: Record<string, unknown>;
};

const SPECIALIZED_CONFIGS: Record<string, () => SpecializedConfig> = {
    CUSTOMER_SUCCESS: buildCustomerSuccessConfig,
    RETENTION: buildRetentionConfig,
    UPSELL: buildUpsellConfig,
};

/**
 * Returns the specialized config for a given agent type, or null if the type
 * doesn't have a specialized configuration.
 */
export function getSpecializedConfig(agentType: string): SpecializedConfig | null {
    const builder = SPECIALIZED_CONFIGS[agentType];
    return builder ? builder() : null;
}

/**
 * Merges specialized config into an agent's stored config.
 * Specialized values only apply if the agent hasn't overridden them manually.
 */
export function applySpecializedDefaults(
    agentType: string,
    agentConfig: {
        systemPrompt?: string | null;
        enabledTools?: string[];
        requiredDataPoints?: string[];
        handoffRules?: Record<string, unknown> | null;
        personality?: Record<string, unknown>;
    },
): typeof agentConfig {
    const specialized = getSpecializedConfig(agentType);
    if (!specialized) return agentConfig;

    return {
        ...agentConfig,
        systemPrompt: agentConfig.systemPrompt ?? specialized.systemPrompt,
        enabledTools: agentConfig.enabledTools?.length
            ? agentConfig.enabledTools
            : specialized.enabledTools,
        requiredDataPoints: agentConfig.requiredDataPoints?.length
            ? agentConfig.requiredDataPoints
            : specialized.requiredDataPoints,
        handoffRules: agentConfig.handoffRules ?? specialized.handoffRules,
        personality: Object.keys(agentConfig.personality ?? {}).length
            ? agentConfig.personality
            : specialized.personality,
    };
}
