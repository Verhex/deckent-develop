// ═══ Trigger Source Adapter (Sprint 226 — Task 226-005) ═══════════════
// Wraps F3 scheduled-flow + self-dispatch into a TriggerSource consumed by
// runAutonomousCycle. The guard semantics of SelfDispatchPolicy
// (`requiresApproval`) propagate through the trigger payload so the cycle
// + approval-gate honour ADR-040.
//
// Refs:
//   ADR-040 (Nervous System / approval routing) — requiresApproval preserved
//   ADR-008 (Brain centrality) — adapter lives in orchestra/, imports core/
//   F3-009 (MASTER-PLAN) — autonomous runtime wire

import { FlowScheduler } from '../../core/flow-scheduler.js';
import type { ScheduledFlow } from '../../core/scheduled-flow.js';
import {
  evaluateDispatch,
  type SelfDispatchPolicy,
} from '../../core/self-dispatch.js';
import type {
  AutonomousTrigger,
  TriggerSource,
} from '../autonomous-runtime.js';

export interface TriggerSourceDeps {
  /** Registered scheduled flows (read-only). */
  flows: ScheduledFlow[];
  /** Self-dispatch policy whose guard semantics propagate to triggers. */
  policy: SelfDispatchPolicy;
  /** Optional scheduler override; defaults to a fresh FlowScheduler. */
  scheduler?: FlowScheduler;
  /** Optional clock for deterministic tests. */
  clock?: () => Date;
  /**
   * Optional re-drive source (APPROVE-006 run-on-approve). Yields a parked
   * trigger whose human decision is recorded, so the loop applies the approval
   * promptly instead of waiting for the flow's next fire. Checked FIRST — ahead
   * of scheduled flows and even when `policy.disabled` — because a recorded
   * human approval is an explicit instruction the loop should honour.
   */
  resolvedProvider?: () => AutonomousTrigger | null;
}

/** Payload carried by triggers produced from scheduled-flow dispatches. */
export interface ScheduledTriggerPayload {
  policyId: string;
  /** Policy guard outcome — caller MUST honour (ADR-040 approval routing). */
  requiresApproval: boolean;
  nextRun: string;
  flowId: string;
}

/**
 * Build a TriggerSource that wraps F3 scheduled-flow + self-dispatch.
 *
 * On each `next()`:
 *  - If a previously yielded due-flow tick remains queued, drain one trigger.
 *  - Else if `policy.disabled === true`, return null (idle).
 *  - Else tick the scheduler. With no due flow → null. With due flows, run
 *    `evaluateDispatch({ kind: 'scheduled', dispatches })`; when the decision
 *    approves dispatch, convert each due flow into an `AutonomousTrigger`,
 *    queue them in scheduler order, and yield the first.
 *
 * The policy's `requiresApproval` (default `true`, see DEFAULT_GUARD) is
 * propagated into each trigger payload — downstream callers route through the
 * approval gate when set; the guard NEVER drops here.
 */
export function makeTriggerSource(deps: TriggerSourceDeps): TriggerSource {
  const scheduler = deps.scheduler ?? new FlowScheduler();
  const clock = deps.clock ?? ((): Date => new Date());
  const queue: AutonomousTrigger[] = [];

  return {
    async next(): Promise<AutonomousTrigger | null> {
      // APPROVE-006: a recorded human approval is re-emitted first — ahead of
      // queued/scheduled triggers and even when the policy is disabled.
      const resolved = deps.resolvedProvider?.();
      if (resolved) return resolved;

      const queued = queue.shift();
      if (queued) return queued;

      if (deps.policy.disabled === true) return null;

      const now = clock();
      const dueFlows = scheduler.tick(deps.flows, now);
      if (dueFlows.length === 0) return null;

      const decision = evaluateDispatch(deps.policy, {
        kind: 'scheduled',
        dispatches: dueFlows.map((df) => ({
          kind: 'scheduled' as const,
          flow: df.flow,
          nextRun: df.nextRun,
        })),
      });

      if (!decision.dispatch) return null;

      for (const df of dueFlows) {
        const payload: ScheduledTriggerPayload = {
          policyId: deps.policy.id,
          requiresApproval: decision.requiresApproval,
          nextRun: df.nextRun.toISOString(),
          flowId: df.flow.id,
        };
        queue.push({
          id: `auto-${df.flow.id}-${df.nextRun.toISOString()}`,
          source: 'scheduled-flow',
          action: df.flow.action,
          requestedBy: df.flow.tenantId,
          payload,
        });
      }

      return queue.shift() ?? null;
    },
  };
}
