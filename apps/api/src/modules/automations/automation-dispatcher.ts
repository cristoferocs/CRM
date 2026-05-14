import type { AutomationTriggerEnum } from "@prisma/client";
import { AutomationsService } from "./automations.service.js";

let singleton: AutomationsService | null = null;
function svc(): AutomationsService {
    if (!singleton) singleton = new AutomationsService();
    return singleton;
}

/**
 * Centralized helper to fire automations from any module after a system event.
 *
 * Failures are swallowed (logged) — never block the caller's main flow.
 *
 * @example
 *   await dispatchAutomation("CONTACT_CREATED", { contactId, ...payload }, orgId);
 */
export async function dispatchAutomation(
    event: AutomationTriggerEnum,
    payload: Record<string, unknown>,
    orgId: string,
): Promise<void> {
    try {
        await svc().trigger(event, payload, orgId);
    } catch (err) {
        console.error(`[automation-dispatcher] ${event} failed:`, err instanceof Error ? err.message : err);
    }
}

/** Fire-and-forget variant — never awaits and never throws. */
export function fireAutomation(
    event: AutomationTriggerEnum,
    payload: Record<string, unknown>,
    orgId: string,
): void {
    void dispatchAutomation(event, payload, orgId);
}
