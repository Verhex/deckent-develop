// src/orchestra/autonomous/action-adapter.ts
//
// ActionExecutor adapter — wraps the nervous ActionHandler registry into the
// ActionExecutor DI interface consumed by autonomous-runtime.ts.
// Sprint 226 Task 226-004.

import type { ActionHandler } from '../../nervous/executor.js';
import type {
  ActionExecutor,
  ActionResult,
  AutonomousTrigger,
} from '../autonomous-runtime.js';

/**
 * Build an ActionExecutor that dispatches to registered ActionHandler functions.
 * Looks up trigger.action in the handlers map; returns {ok:false,error:'no handler'}
 * if no match exists (no silent success allowed).
 */
export function makeActionExecutor(
  handlers: Map<string, ActionHandler>,
): ActionExecutor {
  return {
    async execute(trigger: AutonomousTrigger): Promise<ActionResult> {
      const handler = handlers.get(trigger.action);
      if (!handler) {
        return { ok: false, error: 'no handler' };
      }
      const payload = (trigger.payload as Record<string, unknown>) ?? {};
      try {
        const result = await handler(trigger.action, payload);
        return result.outcome === 'success'
          ? { ok: true }
          : { ok: false, error: result.error };
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        return { ok: false, error };
      }
    },
  };
}
