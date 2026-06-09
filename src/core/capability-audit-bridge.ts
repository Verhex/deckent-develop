// ═══ Capability Audit Bridge — Sprint 262 T11 ═════════════════════════════
// Observability seam: wraps a CapabilityHandler so each invocation emits a
// structured audit record via an INJECTED emit callback. Pure wrapper — no
// direct I/O, default no-op (default-off). Consumed by the wiring iteration.
//
// ADR-010: no new deps. ADR-008: imports only from core/.

import type { CapabilityHandler, InvocationContext } from './capability-broker.js';
import type { ActorContext } from './work-model.js';

// ─── Audit record ─────────────────────────────────────────────────────────────

/** Whether the handler completed without throwing. */
export type InvocationOutcome = 'success' | 'error';

/** Structured record emitted for each capability invocation. */
export interface CapabilityAuditRecord {
  /** Verb / capability name from `handler.requiredCapability`. */
  capability: string;
  /** Same as `capability` — explicit field for SIEM consumers. */
  requiredCapability: string;
  /** WHO invoked — absent when the invocation context carries no actor. */
  actor?: ActorContext;
  /** Whether the handler completed without throwing. */
  outcome: InvocationOutcome;
  /** ISO 8601 UTC timestamp of the invocation. */
  timestamp: string;
  /** Error message — present only when `outcome === 'error'`. */
  error?: string;
}

// ─── Bridge ───────────────────────────────────────────────────────────────────

const NOOP: (record: CapabilityAuditRecord) => void = () => undefined;

/**
 * Wraps `handler` so each `invoke` emits a {@link CapabilityAuditRecord} via `emit`.
 *
 * - **Success path**: invoke → emit `outcome:'success'` → return value.
 * - **Error path**: invoke throws → emit `outcome:'error'` → re-throw.
 * - `emit` defaults to a no-op (safe default-off; backward-safe).
 * - All other handler properties (`requiredCapability`, `description`) pass through.
 */
export function withAuditedInvocation(
  handler: CapabilityHandler,
  emit: (record: CapabilityAuditRecord) => void = NOOP,
): CapabilityHandler {
  return {
    requiredCapability: handler.requiredCapability,
    description: handler.description,
    async invoke(args: Record<string, unknown>, ctx: InvocationContext): Promise<unknown> {
      const base = {
        capability: handler.requiredCapability,
        requiredCapability: handler.requiredCapability,
        actor: ctx.actor,
        timestamp: new Date().toISOString(),
      };
      try {
        const value = await handler.invoke(args, ctx);
        emit({ ...base, outcome: 'success' });
        return value;
      } catch (err) {
        emit({
          ...base,
          outcome: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },
  };
}
