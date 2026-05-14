"use client";

import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface SimulatorSample {
    entityType: "deal" | "contact" | "conversation" | "message" | "payment";
    entityId: string;
    label: string;
    occurredAt: string;
    matchedConditions: boolean;
}

export interface SimulatorResult {
    triggerType: string;
    rangeDays: number;
    rangeFrom: string;
    rangeTo: string;
    eventCount: number;
    wouldFire: number;
    samples: SimulatorSample[];
    daily: Array<{ date: string; total: number; wouldFire: number }>;
    truncated: boolean;
    note?: string;
}

export interface SimulateInput {
    triggerType: string;
    triggerConfig?: Record<string, unknown>;
    conditions?: Array<{
        field: string;
        operator: string;
        value?: unknown;
        logic?: string;
    }>;
    days?: number;
}

export function useSimulate() {
    return useMutation<SimulatorResult, Error, SimulateInput>({
        mutationFn: async (input) => {
            const { data } = await api.post<SimulatorResult>("/automations/simulate", input);
            return data;
        },
    });
}
