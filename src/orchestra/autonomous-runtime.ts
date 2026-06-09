// ═══ Autonomous Runtime (Sprint 219 — Task 219-014) ═══════════════════
// Skeleton for deckent's authority-bounded continuous mode.
//
// Wires a single autonomous cycle: trigger → analyze → RBAC authority check
// → approval gate (when required) → execute → audit.
//
// The runtime is DI-shaped: callers supply authority/approval/executor/audit
// adapters. Hermetic tests inject in-memory mocks; the real wire (scheduled
// flows F3 + nervous-system Executor + authority-enforcer) lands in Sprint 220.
//
// Refs:
//   ADR-037 (RBAC) — every action passes through an authority check
//   ADR-040 (Nervous System) — needs_approval results route through the
//                              approval gate before execution
//   ADR-008 (Brain centrality) — file lives in orchestra/, depends on no
//                                brain modules
//
// Sprint 220 wire targets:
//   authority.check  → wraps src/orchestra/authority-enforcer.checkAuthority
//   approvalGate     → wraps src/nervous/executor.handle / resolveApproval
//   executor.execute → wraps action-registry handlers
//   audit.record     → wraps src/orchestra/event-stream.writeEvent

// ─── Types ───────────────────────────────────────────────────────────

/** An external event that may produce an autonomous action. */
export interface AutonomousTrigger {
  id: string;
  /** Origin of the trigger (e.g. scheduled-flow, nervous, webhook). */
  source: string;
  /** Symbolic action requested by the trigger (action-registry id). */
  action: string;
  /** Subject the action runs on behalf of (user/tenant/system). */
  requestedBy: string;
  /** Optional opaque payload passed to the action executor. */
  payload?: unknown;
}

/** Authority outcome for a (action, requester) pair. */
export type AuthorityOutcome = 'allowed' | 'needs_approval' | 'denied';

export interface AuthorityDecision {
  outcome: AuthorityOutcome;
  reason: string;
}

/** Approval gate outcome when authority requires it. */
export type ApprovalOutcome = 'approved' | 'rejected' | 'pending';

export interface ApprovalDecision {
  outcome: ApprovalOutcome;
  reason?: string;
}

/** Final action execution result. */
export interface ActionResult {
  ok: boolean;
  result?: unknown;
  error?: string;
}

/** Audit record persisted after every cycle decision point. */
export interface AuditRecord {
  triggerId: string;
  action: string;
  requestedBy: string;
  outcome: CycleOutcome;
  reason: string;
  timestamp: string;
}

/** Terminal cycle outcomes — exactly one is recorded per cycle. */
export type CycleOutcome =
  | 'executed'
  | 'failed'
  | 'denied'
  | 'rejected'
  | 'pending'
  | 'no_trigger';

export interface AutonomousCycleResult {
  outcome: CycleOutcome;
  reason: string;
  trigger: AutonomousTrigger | null;
  authority: AuthorityDecision | null;
  approval: ApprovalDecision | null;
  action: ActionResult | null;
  audit: AuditRecord | null;
}

// ─── Dependencies (DI surface) ───────────────────────────────────────

export interface AuthorityChecker {
  check(action: string, requestedBy: string): AuthorityDecision;
}

export interface ApprovalGate {
  request(trigger: AutonomousTrigger): Promise<ApprovalDecision> | ApprovalDecision;
}

export interface ActionExecutor {
  execute(trigger: AutonomousTrigger): Promise<ActionResult> | ActionResult;
}

export interface AuditSink {
  record(record: AuditRecord): void;
}

/** Trigger source — pulls the next trigger or returns null when idle. */
export interface TriggerSource {
  next(): Promise<AutonomousTrigger | null> | AutonomousTrigger | null;
}

/** Per-task policy gate (G2 + G3). Optional; absent → legacy authority-only flow. */
export type PolicyGateDecision = 'auto' | 'park';
export interface PolicyDecisionResult { decision: PolicyGateDecision; reason: string; }

export interface PolicyGate {
  decide(trigger: AutonomousTrigger): PolicyDecisionResult;
}

/**
 * Minimal nervous observer surface consumed by the autonomous runtime.
 *
 * Each cycle calls `tick()` so detectors actually fire during an autonomous
 * run. The runtime never starts/stops the observer — lifetime management is
 * the caller's responsibility. Errors from `tick()` are swallowed (fail-safe)
 * so an observer failure never breaks the autonomous loop.
 *
 * Adapters (in runtime-loop.ts or the CLI) implement this by forwarding to
 * `NervousObserver` / `DetectorRegistry` or emitting a synthetic observe event.
 */
export interface NervousObserverDep {
  tick(): void | Promise<void>;
}

export interface AutonomousRuntimeDeps {
  triggerSource: TriggerSource;
  authority: AuthorityChecker;
  approvalGate: ApprovalGate;
  executor: ActionExecutor;
  audit: AuditSink;
  /** Optional per-task policy gate (G2/G3 — separate from RBAC authority, spec §3). */
  policyGate?: PolicyGate;
  /**
   * Optional nervous observer adapter. When present, `tick()` is called once
   * per cycle (before trigger pull) so detectors run during autonomous execution.
   * Errors from `tick()` are swallowed — fail-safe invariant.
   */
  nervousObserver?: NervousObserverDep;
  /** Optional clock for deterministic tests. */
  now?: () => string;
}

export interface AutonomousRuntimeConfig {
  /** Symbolic tenant/scope label — recorded with audit entries. */
  tenantId?: string;
}

// ─── Cycle ───────────────────────────────────────────────────────────

const isoNow = (): string => new Date().toISOString();

/**
 * Execute a single autonomous cycle.
 *
 * Pulls one trigger from the source; if present, runs the authority/approval
 * gate and (if cleared) the action. Always writes exactly one audit record
 * per non-idle cycle.
 */
export async function runAutonomousCycle(
  _config: AutonomousRuntimeConfig,
  deps: AutonomousRuntimeDeps,
): Promise<AutonomousCycleResult> {
  const now = deps.now ?? isoNow;

  // Drive nervous observer scan once per cycle so detectors fire during
  // autonomous execution. Wrapped in try/catch — observer errors must never
  // break the autonomous loop (fail-safe).
  if (deps.nervousObserver !== undefined) {
    try {
      await deps.nervousObserver.tick();
    } catch {
      // Fail-safe: observer tick failure is non-fatal to the autonomous loop
    }
  }

  const trigger = await deps.triggerSource.next();

  if (!trigger) {
    return {
      outcome: 'no_trigger',
      reason: 'No trigger pending',
      trigger: null,
      authority: null,
      approval: null,
      action: null,
      audit: null,
    };
  }

  const authority = deps.authority.check(trigger.action, trigger.requestedBy);

  if (authority.outcome === 'denied') {
    return finish(trigger, authority, null, null, 'denied', authority.reason, deps.audit, now);
  }

  let approval: ApprovalDecision | null = null;
  if (authority.outcome === 'needs_approval') {
    approval = await deps.approvalGate.request(trigger);
    if (approval.outcome === 'rejected') {
      return finish(trigger, authority, approval, null, 'rejected', approval.reason ?? 'rejected by approval gate', deps.audit, now);
    }
    if (approval.outcome === 'pending') {
      return finish(trigger, authority, approval, null, 'pending', approval.reason ?? 'awaiting approval', deps.audit, now);
    }
  }

  // G2/G3 — per-task policy gate (separate from RBAC authority, spec §3). When it
  // parks, route through the approval gate exactly like an authority needs_approval.
  // Absent policyGate → legacy authority-only flow (backward compatible).
  // `approval === null` guard: if the authority needs_approval path already
  // obtained a human decision for this trigger, do NOT solicit a second approval.
  if (deps.policyGate && approval === null) {
    const policy = deps.policyGate.decide(trigger);
    if (policy.decision === 'park') {
      approval = await deps.approvalGate.request(trigger);
      if (approval.outcome === 'rejected') {
        return finish(trigger, authority, approval, null, 'rejected', approval.reason ?? policy.reason, deps.audit, now);
      }
      if (approval.outcome === 'pending') {
        return finish(trigger, authority, approval, null, 'pending', approval.reason ?? policy.reason, deps.audit, now);
      }
      // approved → fall through to execute
    }
  }

  const action = await deps.executor.execute(trigger);
  const outcome: CycleOutcome = action.ok ? 'executed' : 'failed';
  const reason = action.ok ? 'action executed' : action.error ?? 'action failed';
  return finish(trigger, authority, approval, action, outcome, reason, deps.audit, now);
}

function finish(
  trigger: AutonomousTrigger,
  authority: AuthorityDecision,
  approval: ApprovalDecision | null,
  action: ActionResult | null,
  outcome: CycleOutcome,
  reason: string,
  audit: AuditSink,
  now: () => string,
): AutonomousCycleResult {
  const record: AuditRecord = {
    triggerId: trigger.id,
    action: trigger.action,
    requestedBy: trigger.requestedBy,
    outcome,
    reason,
    timestamp: now(),
  };
  audit.record(record);
  return { outcome, reason, trigger, authority, approval, action, audit: record };
}

// ─── Nervous observer composer — AUT-1 wire ──────────────────────────────────
// NOTE: named `withNervousObserver` (NOT buildEngineRuntime) to avoid colliding
// with runtime-loop.ts's `buildEngineRuntime`, which assembles the live runtime
// bundle. This is a composable wrapper applied to an already-built deps bundle;
// runtime-loop's buildEngineRuntime calls it when given an `opts.nervousTick`.

export interface WithNervousObserverOpts {
  /**
   * Tick function that drives the nervous observation pipeline once per cycle.
   * Typically wraps a DetectorRegistry.runAll() call or a NervousObserver cron
   * handler. Wrapped fail-safe in runAutonomousCycle — errors never break the loop.
   */
  nervousTick?: () => void | Promise<void>;
}

/**
 * Construct a thin NervousObserverDep adapter from `opts.nervousTick` and wire
 * it into the assembled deps so `tick()` actually fires during autonomous execution.
 *
 * This is the bridge between a pre-assembled AutonomousRuntimeDeps bundle
 * (from buildAutonomousRuntime in runtime-loop.ts) and the nervous observation
 * layer. Call it after composing the base deps bundle to enable per-cycle detection.
 *
 * When `nervousTick` is absent the base deps are returned unchanged (backward-safe).
 * Observer errors are swallowed inside runAutonomousCycle — fail-safe invariant.
 */
export function withNervousObserver(
  deps: AutonomousRuntimeDeps,
  opts: WithNervousObserverOpts = {},
): AutonomousRuntimeDeps {
  const { nervousTick } = opts;
  if (!nervousTick) return deps;
  // Construct the NervousObserverDep adapter and pass it into the composed deps.
  const nervousObserver: NervousObserverDep = { tick: nervousTick };
  return { ...deps, nervousObserver };
}
