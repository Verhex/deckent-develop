// src/orchestra/autonomous/work-generator-source.ts
// Composable TriggerSource that yields work-generator candidates as triggers.
// NOT auto-wired into the live loop — a follow-up adds it to the hybrid source.
import type { AutonomousTrigger, TriggerSource } from '../autonomous-runtime.js';
import type { BacklogEntry } from './backlog-types.js';
import { AUTONOMOUS_EXECUTE_ACTION } from './execute-dispatcher.js';

export interface WorkGeneratorSourceOpts {
  /** Called each tick to produce candidates. Injected for testability. */
  generate: () => BacklogEntry[];
}

/**
 * Returns a TriggerSource that, when polled, calls `opts.generate()` and
 * yields the first candidate as a trigger. Fail-safe: generator errors → null.
 *
 * One trigger per tick (matches backlog-trigger semantics). The entry travels
 * in `payload.entry` so the policy gate can inspect it.
 */
export function makeWorkGeneratorSource(opts: WorkGeneratorSourceOpts): TriggerSource {
  return {
    next(): AutonomousTrigger | null {
      let candidates: BacklogEntry[];
      try {
        candidates = opts.generate();
      } catch {
        return null;
      }
      const entry = candidates[0];
      if (!entry) return null;
      return {
        id: `work-gen-${entry.id}`,
        source: 'work-generator',
        action: AUTONOMOUS_EXECUTE_ACTION,
        requestedBy: entry.tenant ? `system:${entry.tenant}` : 'system',
        payload: { entry },
      };
    },
  };
}
