// src/orchestra/autonomous/backlog-trigger.ts
// Backlog-due TriggerSource + hybrid composer (backlog ∪ scheduled-flow ∪ reactive).
// Spec §4 trigger layer.
import type { AutonomousTrigger, TriggerSource } from '../autonomous-runtime.js';
import { AUTONOMOUS_EXECUTE_ACTION } from './execute-dispatcher.js';
import { queryDue } from './backlog.js';
import type { BacklogFile } from './backlog-types.js';

/**
 * TriggerSource over the backlog. `load` is called each tick (fresh state so
 * cross-process status changes are seen); `clock` supplies now for due-eval.
 * Yields one trigger per tick; the entry travels in `payload.entry`.
 */
export function makeBacklogTriggerSource(
  load: () => BacklogFile,
  clock: () => Date,
): TriggerSource {
  return {
    next(): AutonomousTrigger | null {
      const due = queryDue(load(), clock());
      const entry = due[0];
      if (!entry) return null;
      return {
        id: `backlog-${entry.id}`,
        source: 'backlog',
        action: AUTONOMOUS_EXECUTE_ACTION,
        requestedBy: entry.tenant ? `system:${entry.tenant}` : 'system',
        payload: { entry },
      };
    },
  };
}

/** Try each source in order; return the first non-null trigger (idle → null). */
export function makeHybridTriggerSource(sources: TriggerSource[]): TriggerSource {
  return {
    async next(): Promise<AutonomousTrigger | null> {
      for (const s of sources) {
        const t = await s.next();
        if (t) return t;
      }
      return null;
    },
  };
}
