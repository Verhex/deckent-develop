import type { DueDispatch } from './flow-scheduler.js';
import type { DispatchCallback } from './flow-runtime.js';

/**
 * Self-dispatch protocol skeleton (Sprint 208 — ROADMAP F3 otonom mod).
 *
 * Decides whether deckent should self-trigger a sprint/plan/start action.
 * This module is DECISION-ONLY: evaluateDispatch returns a SelfDispatchDecision
 * but never invokes Brain.runSprint or any side-effectful API. The caller is
 * responsible for honouring `decision.requiresApproval` before any real action.
 *
 * Human-approval rule: `requiresApproval` defaults to TRUE — preserves
 * "Alperen onayı olmadan sprint başlatma yasak" memory.
 *
 * Sprint 209 (Task 209-011) — FlowRuntime integration. `createSelfDispatchCallback`
 * returns a DispatchCallback that, on every FlowRuntime tick, evaluates the
 * policy against the due dispatches and pushes a PendingApprovalItem onto the
 * caller-owned `pending-approval` queue when dispatch is approved. **No
 * auto-start ever occurs** — Brain runSprint is never invoked by this module.
 */

export type SelfDispatchTrigger = 'scheduled' | 'event' | 'threshold';
export type SelfDispatchAction = 'plan' | 'start';
export type ThresholdOperator = '>' | '<' | '>=' | '<=' | '==';

export interface SelfDispatchGuard {
  requiresApproval: boolean;
}

export interface ThresholdConfig {
  metric: string;
  operator: ThresholdOperator;
  value: number;
}

export interface SelfDispatchPolicy {
  id: string;
  trigger: SelfDispatchTrigger;
  action: SelfDispatchAction;
  guard?: Partial<SelfDispatchGuard>;
  /** Required when trigger === 'threshold'. */
  threshold?: ThresholdConfig;
  /** Optional eventType filter for trigger === 'event'. Undefined matches any. */
  eventType?: string;
  /** When true, the policy is skipped entirely on FlowRuntime tick. */
  disabled?: boolean;
}

/**
 * Queue item appended when a tick evaluation approves dispatch.
 * Sprint 209 — pending-approval channel: human (Alperen) must accept before
 * Brain.runSprint is invoked. This module never triggers runSprint itself.
 */
export interface PendingApprovalItem {
  policyId: string;
  decision: SelfDispatchDecision;
  dispatches: DueDispatch[];
  enqueuedAt: Date;
}

export type SelfDispatchContext =
  | { kind: 'scheduled'; dispatches: DueDispatch[] }
  | { kind: 'event'; eventType: string; payload?: unknown }
  | { kind: 'threshold'; metric: string; value: number };

export interface SelfDispatchDecision {
  dispatch: boolean;
  requiresApproval: boolean;
  action: SelfDispatchAction;
  trigger: SelfDispatchTrigger;
  reason: string;
}

/**
 * Default guard for self-dispatch policies.
 * requiresApproval defaults to TRUE to preserve the human-in-the-loop rule.
 */
export const DEFAULT_GUARD: SelfDispatchGuard = {
  requiresApproval: true,
};

function resolveGuard(policy: SelfDispatchPolicy): SelfDispatchGuard {
  return {
    requiresApproval: policy.guard?.requiresApproval ?? DEFAULT_GUARD.requiresApproval,
  };
}

function compareThreshold(actual: number, op: ThresholdOperator, target: number): boolean {
  switch (op) {
    case '>': return actual > target;
    case '<': return actual < target;
    case '>=': return actual >= target;
    case '<=': return actual <= target;
    case '==': return actual === target;
  }
}

/**
 * Evaluate a self-dispatch policy against the current context.
 *
 * Pure function — no I/O, no clock, no side-effects. The returned decision
 * propagates `requiresApproval` so the caller (Brain) can enforce the
 * human-approval rule before any real start/plan action is taken.
 *
 * @param policy   the policy describing when self-dispatch should fire
 * @param context  the runtime context (scheduled dispatches, events, metrics)
 * @returns a SelfDispatchDecision describing the outcome
 */
export function evaluateDispatch(
  policy: SelfDispatchPolicy,
  context: SelfDispatchContext,
): SelfDispatchDecision {
  const guard = resolveGuard(policy);

  if (policy.trigger !== context.kind) {
    return {
      dispatch: false,
      requiresApproval: guard.requiresApproval,
      action: policy.action,
      trigger: policy.trigger,
      reason: `trigger mismatch: policy=${policy.trigger}, context=${context.kind}`,
    };
  }

  if (context.kind === 'scheduled') {
    const count = context.dispatches.length;
    return {
      dispatch: count > 0,
      requiresApproval: guard.requiresApproval,
      action: policy.action,
      trigger: 'scheduled',
      reason: count > 0
        ? `scheduled: ${count} due dispatch(es)`
        : 'scheduled: no due dispatches',
    };
  }

  if (context.kind === 'event') {
    const matches = policy.eventType === undefined || policy.eventType === context.eventType;
    return {
      dispatch: matches,
      requiresApproval: guard.requiresApproval,
      action: policy.action,
      trigger: 'event',
      reason: matches
        ? `event match: ${context.eventType}`
        : `event mismatch: policy=${policy.eventType ?? '*'}, event=${context.eventType}`,
    };
  }

  // context.kind === 'threshold'
  const t = policy.threshold;
  if (!t) {
    return {
      dispatch: false,
      requiresApproval: guard.requiresApproval,
      action: policy.action,
      trigger: 'threshold',
      reason: 'threshold: missing policy.threshold config',
    };
  }
  if (t.metric !== context.metric) {
    return {
      dispatch: false,
      requiresApproval: guard.requiresApproval,
      action: policy.action,
      trigger: 'threshold',
      reason: `threshold: metric mismatch (policy=${t.metric}, context=${context.metric})`,
    };
  }
  const crosses = compareThreshold(context.value, t.operator, t.value);
  return {
    dispatch: crosses,
    requiresApproval: guard.requiresApproval,
    action: policy.action,
    trigger: 'threshold',
    reason: crosses
      ? `threshold crossed: ${t.metric} ${t.operator} ${t.value} (actual=${context.value})`
      : `threshold not crossed: ${t.metric} ${t.operator} ${t.value} (actual=${context.value})`,
  };
}

/**
 * Build a {@link DispatchCallback} suitable for {@link FlowRuntime.start} or
 * {@link FlowRuntime.tick}. Per tick:
 *  - `policy.disabled === true` → return immediately (no eval, no queue push).
 *  - otherwise run `evaluateDispatch(policy, { kind: 'scheduled', dispatches })`.
 *  - if `decision.dispatch === true` push a {@link PendingApprovalItem} onto
 *    `queue`. The pending-approval queue is caller-owned; the caller must
 *    drain it after explicit human approval before invoking Brain.runSprint.
 *  - **No auto-start.** This callback never invokes Brain or any side-effectful
 *    sprint API — it only mutates `queue`.
 *
 * Intentionally narrow surface: this binding is for the 'scheduled' trigger
 * path (FlowRuntime emits scheduled dispatches). Event/threshold triggers
 * remain pure `evaluateDispatch` callers.
 *
 * @param policy   the self-dispatch policy to evaluate per tick
 * @param queue    caller-owned pending-approval queue (mutated in place)
 * @param options  optional clock override for deterministic `enqueuedAt`
 */
export function createSelfDispatchCallback(
  policy: SelfDispatchPolicy,
  queue: PendingApprovalItem[],
  options: { clock?: () => Date } = {},
): DispatchCallback {
  const clock = options.clock ?? (() => new Date());
  return (dispatches) => {
    if (policy.disabled === true) return;
    const decision = evaluateDispatch(policy, { kind: 'scheduled', dispatches });
    if (decision.dispatch) {
      queue.push({
        policyId: policy.id,
        decision,
        dispatches,
        enqueuedAt: clock(),
      });
    }
  };
}
