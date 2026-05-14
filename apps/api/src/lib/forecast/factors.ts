/**
 * Forecast factor functions.
 *
 * Each factor takes the same `FactorInput` and returns a deltaProbability
 * in [-1, 1] plus a human-readable explanation. The engine sums the
 * factors, clamps the result to [0, 1], and ranks the explanations by
 * absolute impact for the UI.
 *
 * Why heuristic and not ML: competitors hide their forecast inside an
 * opaque model. Ours is auditable — every percentage point can be
 * traced to a specific signal a salesperson can act on. Once we have
 * 6+ months of labelled deal outcomes we can layer an ML model on top
 * and keep the same `Factor` shape for explanations.
 */

export interface FactorInput {
    /** Stage base probability (0-100). */
    stageProbability: number;
    /** Avg days deals spend in this stage historically; null if unknown. */
    avgDaysInStage: number | null;
    /** Days since the deal entered the current stage. */
    daysInCurrentStage: number;
    /** Days since the deal's lastActivityAt. */
    daysSinceLastActivity: number;
    /** Is the deal flagged isRotting? */
    isRotting: boolean;
    /** Probability previously set by the AI runner (0-1) — null if never scored. */
    aiProbability: number | null;
    /** Days until `expectedCloseAt`. Negative if overdue. Null if not set. */
    daysToExpectedClose: number | null;
    /** Deal value in account currency — used to bias the explanation copy
     *  for large deals but doesn't change the math. */
    valueUsd: number;
    /** Number of inbound messages from the contact in the last 7 days. */
    inboundMessages7d: number;
    /** Whether the deal currently has an active AIAgentSession. */
    hasActiveAgent: boolean;
}

export interface Factor {
    /** Stable id for the UI to use as React key. */
    id: string;
    label: string;
    /** Signed contribution to the final probability (in [-1, 1]). */
    impact: number;
    /** Human-readable, salesperson-actionable. */
    explanation: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// -- Individual factors -----------------------------------------------------

export function stageBaseFactor(input: FactorInput): Factor {
    // The stage's hand-curated probability is the strongest prior. We
    // express it as a delta from a 50% baseline so the explanation reads
    // naturally ("Stage Proposta agrega +20% ao baseline").
    const baseline = 0.5;
    const stageProb = input.stageProbability / 100;
    return {
        id: "stage_base",
        label: "Etapa atual",
        impact: stageProb - baseline,
        explanation:
            stageProb >= baseline
                ? `Etapa atual fecha historicamente ${Math.round(stageProb * 100)}% dos deals (acima do baseline).`
                : `Etapa atual ainda é cedo no funil — ${Math.round(stageProb * 100)}% de conversão histórica.`,
    };
}

export function timeInStageFactor(input: FactorInput): Factor {
    if (input.avgDaysInStage == null || input.avgDaysInStage <= 0) {
        return {
            id: "time_in_stage",
            label: "Tempo na etapa",
            impact: 0,
            explanation: "Sem dados históricos para comparar tempo na etapa.",
        };
    }
    const ratio = input.daysInCurrentStage / input.avgDaysInStage;
    if (ratio <= 0.5) {
        return {
            id: "time_in_stage",
            label: "Tempo na etapa",
            impact: 0.05,
            explanation: `Há ${Math.round(input.daysInCurrentStage)}d nesta etapa — abaixo da média (${Math.round(input.avgDaysInStage)}d). Bom sinal de momentum.`,
        };
    }
    if (ratio <= 1.2) {
        return {
            id: "time_in_stage",
            label: "Tempo na etapa",
            impact: 0,
            explanation: `Tempo na etapa em linha com a média histórica (${Math.round(input.daysInCurrentStage)}d / ${Math.round(input.avgDaysInStage)}d).`,
        };
    }
    if (ratio <= 2) {
        return {
            id: "time_in_stage",
            label: "Tempo na etapa",
            impact: -0.1,
            explanation: `Está ${(ratio).toFixed(1)}x acima da média de dias na etapa — sinal de hesitação.`,
        };
    }
    return {
        id: "time_in_stage",
        label: "Tempo na etapa",
        impact: -0.2,
        explanation: `Travado há ${Math.round(input.daysInCurrentStage)}d (média da etapa é ${Math.round(input.avgDaysInStage)}d). Risco alto.`,
    };
}

export function recencyFactor(input: FactorInput): Factor {
    const d = input.daysSinceLastActivity;
    if (d <= 1) {
        return {
            id: "recency",
            label: "Atividade recente",
            impact: 0.12,
            explanation: "Conversa quente — última atividade nas últimas 24h.",
        };
    }
    if (d <= 3) {
        return {
            id: "recency",
            label: "Atividade recente",
            impact: 0.05,
            explanation: `Última atividade há ${d}d. Cadência saudável.`,
        };
    }
    if (d <= 7) {
        return {
            id: "recency",
            label: "Atividade recente",
            impact: -0.05,
            explanation: `Sem atividade há ${d}d. Vale uma reabordagem.`,
        };
    }
    return {
        id: "recency",
        label: "Atividade recente",
        impact: -0.15,
        explanation: `Sem atividade há ${d}d — deal esfriando.`,
    };
}

export function rottingFactor(input: FactorInput): Factor | null {
    if (!input.isRotting) return null;
    return {
        id: "rotting",
        label: "Marcado como inativo",
        impact: -0.18,
        explanation: "Deal está sinalizado como rotting pelo pipeline. Considere mover para perdido ou re-engajar com urgência.",
    };
}

export function inboundFactor(input: FactorInput): Factor | null {
    if (input.inboundMessages7d <= 0) return null;
    if (input.inboundMessages7d >= 5) {
        return {
            id: "inbound_high",
            label: "Engajamento alto",
            impact: 0.1,
            explanation: `Contato enviou ${input.inboundMessages7d} mensagens em 7d — engajamento alto.`,
        };
    }
    if (input.inboundMessages7d >= 2) {
        return {
            id: "inbound_med",
            label: "Engajamento médio",
            impact: 0.05,
            explanation: `Contato respondeu ${input.inboundMessages7d}x em 7d.`,
        };
    }
    return null;
}

export function aiProbabilityFactor(input: FactorInput): Factor | null {
    if (input.aiProbability == null) return null;
    // The AI's standalone read of the deal — we blend it in with a 0.5
    // baseline so it adds/subtracts proportionally to how confident it
    // was relative to "indifferent".
    const delta = (input.aiProbability - 0.5) * 0.3;
    const pct = Math.round(input.aiProbability * 100);
    return {
        id: "ai_score",
        label: "Análise do agente IA",
        impact: delta,
        explanation: `Super Agente estimou ${pct}% de chance ao analisar o histórico da conversa.`,
    };
}

export function expectedCloseFactor(input: FactorInput): Factor | null {
    if (input.daysToExpectedClose == null) return null;
    if (input.daysToExpectedClose < 0) {
        return {
            id: "overdue_close",
            label: "Previsão estourada",
            impact: -0.12,
            explanation: `Data de fechamento prevista venceu há ${Math.abs(input.daysToExpectedClose)}d.`,
        };
    }
    if (input.daysToExpectedClose <= 7) {
        return {
            id: "imminent_close",
            label: "Fechamento iminente",
            impact: 0.08,
            explanation: `Previsto para fechar em ${input.daysToExpectedClose}d — pressione o gatilho final.`,
        };
    }
    return null;
}

export function activeAgentFactor(input: FactorInput): Factor | null {
    if (!input.hasActiveAgent) return null;
    return {
        id: "active_agent",
        label: "Agente ativo",
        impact: 0.04,
        explanation: "Há um agente IA conduzindo o atendimento — follow-up garantido.",
    };
}

// -- Combine all factors ----------------------------------------------------

export const ALL_FACTORS: Array<(input: FactorInput) => Factor | null> = [
    stageBaseFactor,
    timeInStageFactor,
    recencyFactor,
    rottingFactor,
    inboundFactor,
    aiProbabilityFactor,
    expectedCloseFactor,
    activeAgentFactor,
];

export function evaluateFactors(input: FactorInput): {
    probability: number;
    factors: Factor[];
} {
    const factors = ALL_FACTORS.map((f) => f(input)).filter((f): f is Factor => f !== null);
    const baseline = 0.5;
    const sum = factors.reduce((acc, f) => acc + f.impact, 0);
    const probability = clamp(baseline + sum, 0, 1);
    // Sort explanations by absolute impact so the UI shows the most
    // influential signals first.
    factors.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
    return { probability, factors };
}
