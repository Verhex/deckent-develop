// src/orchestra/autonomous/backlog-trigger.ts
// Backlog-due TriggerSource + hybrid composer (backlog ∪ scheduled-flow ∪ reactive)
// + the scheduled-flow → backlog bridge (AUT-3). Spec §4 trigger layer.
import type { AutonomousTrigger, TriggerSource } from '../autonomous-runtime.js';
import { AUTONOMOUS_EXECUTE_ACTION } from './execute-dispatcher.js';
import { enqueueCandidates, queryDue } from './backlog.js';
import type { BacklogEntry, BacklogFile } from './backlog-types.js';

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

/**
 * AUT-3 — scheduled-flow → backlog dispatch bridge.
 *
 * Before this bridge a user-configured flow could never run: its trigger
 * carried `action = flow.action` (no registered handler → 'no handler') and
 * `requestedBy = flow.tenantId` (unknown subject → authority default-deny) —
 * the "double-block". The bridge normalizes each RAW scheduled-flow trigger
 * into the one dispatch path everything else uses:
 *
 *  - the flow becomes a real backlog entry (PERSISTED first — the dispatcher's
 *    status writeback requires it; id `flow-<flowId>-<nextRun>` dedupes
 *    same-cadence re-fires), kind 'sprint' when the action names a sprint,
 *    else kind 'task' with the action text as the inline description;
 *  - the trigger is rewritten to AUTONOMOUS_EXECUTE_ACTION under
 *    `system[:tenant]` (trusted-internal at the authority layer — the policy
 *    gate is the real governance: the flow guard's `requiresApproval` maps to
 *    policy 'approval-required' (park, ADR-040 no-auto-approve) vs 'auto',
 *    and `autonomous.rbac_policy` enforcement now applies to flows too).
 *
 * Pass-through: non-flow triggers, idle, and approval-redrive replays (whose
 * payload already carries an `entry`) are returned untouched.
 */
export function makeFlowBacklogBridge(
  inner: TriggerSource,
  load: () => BacklogFile,
  backlogPath: string,
): TriggerSource {
  return {
    async next(): Promise<AutonomousTrigger | null> {
      const trigger = await inner.next();
      if (!trigger || trigger.source !== 'scheduled-flow') return trigger;
      const payload = trigger.payload as
        | { entry?: BacklogEntry; flowId?: string; requiresApproval?: boolean; nextRun?: string }
        | undefined;
      // Approval-redrive replay — already normalized on its first pass.
      if (payload?.entry) return trigger;

      const flowId = payload?.flowId ?? trigger.id;
      const isSprint = /\bsprint\b/i.test(trigger.action);
      const tenant = trigger.requestedBy && trigger.requestedBy !== 'system'
        ? trigger.requestedBy
        : undefined;
      const entry: BacklogEntry = {
        id: `flow-${flowId}-${payload?.nextRun ?? 'now'}`,
        title: `scheduled flow ${flowId}: ${trigger.action}`,
        kind: isSprint ? 'sprint' : 'task',
        spec: isSprint ? { directivesRef: trigger.action } : { description: trigger.action },
        // The flow guard NEVER drops here (ADR-040): explicit false → auto,
        // true or absent → park for a human decision.
        policy: payload?.requiresApproval === false ? 'auto' : 'approval-required',
        trigger: { type: 'one-off' },
        status: 'pending',
        ...(tenant !== undefined ? { tenant } : {}),
        lastRun: null,
        lastResult: null,
      };
      // Persist BEFORE dispatch (the work-generator lesson): updateStatus must
      // find the entry. enqueueCandidates dedupes by id, so a re-fired tick of
      // the same cadence does not double-enqueue.
      enqueueCandidates(backlogPath, load(), [entry]);

      return {
        ...trigger,
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
