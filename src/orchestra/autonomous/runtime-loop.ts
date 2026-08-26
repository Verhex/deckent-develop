// src/orchestra/autonomous/runtime-loop.ts
//
// ═══ Autonomous Runtime Loop + Composition Root (Sprint 226 — Task 226-006) ═══
// Wires the 5 real adapters (226-001..005) into the autonomous-runtime DI surface
// and runs a deterministic tick loop on top of `runAutonomousCycle`.
//
// 🔴 This module is the wire's lifeline — it is the only call-site that
// imports + composes all 5 adapters, ending the 0-caller dormancy that has
// haunted autonomous-runtime since Sprint 219-014.
//
// Refs:
//   ADR-037 (RBAC)          — authority gate is enforced via authority-adapter
//   ADR-040 (Nervous)       — approval-gate retains the no-auto-approve invariant
//   ADR-008 (Brain central) — module lives in orchestra/, no brain imports
//   ADR-079 (Tier-0)        — unit-testable; injectable clock/sleep/signal

import type { ActionHandler } from '../../nervous/executor.js';
import type { Executor } from '../../nervous/executor.js';
import type { ScheduledFlow } from '../../core/scheduled-flow.js';
import type { SelfDispatchPolicy } from '../../core/self-dispatch.js';
import {
  runAutonomousCycle,
  type AutonomousCycleResult,
  type AutonomousRuntimeConfig,
  type AutonomousRuntimeDeps,
  type TriggerSource,
} from '../autonomous-runtime.js';
import { makeAuthorityChecker } from './authority-adapter.js';
import { makeAuditSink } from './audit-adapter.js';
import {
  makeApprovalGate,
  type ApprovalGateAdapter,
} from './approval-adapter.js';
import { makeActionExecutor } from './action-adapter.js';
import { makeTriggerSource } from './trigger-adapter.js';
// ─── Engine composition root (Task 7) imports ────────────────────────
import type { ResolvedConfig } from '../../core/config-types.js';
import type { ResolvedApprovalLifecycleConfig } from '../../core/config-types.js';
import type { VerifiedPrincipal } from '../../core/principal.js';
import type { CapabilityRegistry } from '../../core/capability-broker.js';
import { createAuditedCapabilityRegistry } from '../../core/capability-runtime.js';
import { buildErpConnectorFromConfig } from '../../core/erp/index.js';
import { writeAuditEvent } from '../../core/audit-writer.js';
import type { PolicyGate } from '../autonomous-runtime.js';
import type { ActorContext, Capability } from '../../core/work-model.js';
import { withNervousObserver } from '../autonomous-runtime.js';
// ENT-1: 0-caller RBAC gates wired into the autonomous policy gate (flag-gated by
// config.enforce_rbac, default off → ADR-037 V1.0 warn-only). backlog-trigger.js here
// is src/orchestra/backlog-trigger.ts (the sprint-path gate), distinct from the
// autonomous ./backlog-trigger.js trigger-source imports above.
import { checkBacklogEntryRbac } from '../backlog-trigger.js';
import { checkSprintSpawnRbac } from '../sprint-runtime.js';
import {
  makeBacklogTriggerSource,
  makeFlowBacklogBridge,
  makeHybridTriggerSource,
} from './backlog-trigger.js';
import {
  makeExecuteDispatcher,
  AUTONOMOUS_EXECUTE_ACTION,
  type ExecuteDispatcherDeps,
} from './execute-dispatcher.js';
import type { FlowReporter } from './flow-reporter.js';
import { evaluatePolicy } from '../../core/policy-engine.js';
import { Permission } from '../../core/rbac.js';
import { decidePolicy, computeEntryEffectClass } from './policy-gate.js';
import { applyRecurringReenqueue, enqueueCandidates, loadBacklog } from './backlog.js';
import { makeWorkGeneratorSource } from './work-generator-source.js';
import type { BacklogEntry } from './backlog-types.js';
import { randomUUID } from 'node:crypto';

// Re-export TriggerSource so callers can type reactiveSource without importing autonomous-runtime.
export type { TriggerSource } from '../autonomous-runtime.js';

// ─── Composition root ─────────────────────────────────────────────────

export interface BuildAutonomousRuntimeOptions {
  /** Project root (used by audit-adapter event-stream path). */
  projectRoot: string;
  /** Sprint id label for audit events. Defaults to 'autonomous'. */
  sprintId?: string;
  /** Scheduled flows handed to the trigger-adapter. */
  flows: ScheduledFlow[];
  /** Self-dispatch policy whose guard semantics propagate to triggers. */
  policy: SelfDispatchPolicy;
  /** Action handler registry consumed by the action-adapter. */
  actionHandlers: Map<string, ActionHandler>;
  /** Optional persistence path for the approval-adapter pending queue. */
  pendingPath?: string;
  /** Optional clock for the trigger-adapter (deterministic tests). */
  clock?: () => Date;
  /** Optional ISO clock for cycle audit timestamps + approval enqueuedAt. */
  now?: () => string;
  /** Optional nervous Executor delegate for approval accept/reject. */
  executor?: Pick<Executor, 'resolveApproval'>;
  /** Canonical resolved lifecycle policy for newly parked autonomous work. */
  approvalLifecycle?: ResolvedApprovalLifecycleConfig;
  /** Tenant authority for the approval queue; never inferred from request data. */
  principal?: VerifiedPrincipal;
  /** Refuse a tenant-less approval caller when enterprise isolation is active. */
  strictTenantIsolation?: boolean;
}

export interface AutonomousRuntimeBundle {
  /** Assembled DI surface ready to drive `runAutonomousCycle`. */
  deps: AutonomousRuntimeDeps;
  /**
   * Exposed approval gate adapter so callers can resolve pending triggers
   * via accept()/reject() — the no-auto-approve invariant means external
   * code MUST drive these.
   */
  approvalGate: ApprovalGateAdapter;
}

/**
 * Assemble the 5 real adapters (226-001..005) into a runtime bundle.
 * Pure construction — no I/O, no ticking.
 */
export function buildAutonomousRuntime(
  opts: BuildAutonomousRuntimeOptions,
): AutonomousRuntimeBundle {
  const authority = makeAuthorityChecker();
  const audit = makeAuditSink(opts.projectRoot, opts.sprintId ?? 'autonomous');
  const approvalGate = makeApprovalGate({
    pendingPath: opts.pendingPath,
    projectRoot: opts.projectRoot,
    now: opts.now,
    executor: opts.executor,
    ...(opts.approvalLifecycle ? { lifecycle: opts.approvalLifecycle } : {}),
    ...(opts.principal ? { principal: opts.principal } : {}),
    strictTenantIsolation: opts.strictTenantIsolation ?? false,
  });
  const executor = makeActionExecutor(opts.actionHandlers);
  const triggerSource = makeTriggerSource({
    flows: opts.flows,
    policy: opts.policy,
    clock: opts.clock,
    // APPROVE-006: re-drive parked approvals once a human decision is recorded
    // so the loop applies it within the next cycle (run-on-approve).
    resolvedProvider: () => approvalGate.takeResolved(),
  });

  const deps: AutonomousRuntimeDeps = {
    triggerSource,
    authority,
    approvalGate,
    executor,
    audit,
    now: opts.now,
  };

  return { deps, approvalGate };
}

// ─── Engine composition root (Task 7) ────────────────────────────────

export interface BuildEngineRuntimeOptions {
  projectRoot: string;
  config: ResolvedConfig;
  backlogPath: string;
  flows: ScheduledFlow[];
  policy: SelfDispatchPolicy;
  runTask: ExecuteDispatcherDeps['runTask'];
  executeSprint: ExecuteDispatcherDeps['executeSprint'];
  /**
   * Gap F: wait for a task result file (injected for hermetic tests;
   * live wire passes waitForRunResult from run.ts).
   */
  waitForResult: ExecuteDispatcherDeps['waitForResult'];
  /** Gap F: max ms to wait for a task result. Defaults to 600_000 in dispatcher. */
  resultTimeoutMs?: number;
  /**
   * Optional process-root provider authority admission forwarded to the
   * execute-dispatcher. Absent preserves the autonomous-v1 rollout default.
   */
  admitProviderExecution?: ExecuteDispatcherDeps['admitProviderExecution'];
  /**
   * Goal-planner Phase 2: when provided, a planned task/sprint entry with no
   * detail is detailed JIT (and persisted) before it runs (forwarded to the
   * execute-dispatcher). Absent → planned entries run title-only (backward-safe).
   */
  jitComplete?: ExecuteDispatcherDeps['jitComplete'];
  /**
   * CORE-UNIFORMITY (slice 1): rich dual-channel flow emitter forwarded to the
   * execute-dispatcher so the autonomous terminal shows the live Brain+Auditor+
   * CrossVerify flow (and an AI operator collects it as JSONL). Absent → no flow.
   */
  flow?: FlowReporter;
  /** Optional extra trigger source (e.g. a reactive/webhook source) added last. */
  reactiveSource?: TriggerSource;
  /**
   * Optional self-generated-work producer (e.g. makeDebtWorkGenerator). When
   * provided, candidates are deduped against the backlog (by id, any status),
   * enqueued, and dispatched through a work-generator trigger source composed
   * at the LOWEST priority (after backlog/scheduled/reactive). Absent → no
   * work-generator source (backward-safe).
   */
  generateWork?: () => BacklogEntry[];
  /**
   * F8 broker dispatch: registry that fulfils `kind=capability` backlog
   * entries. Absent → a default audited registry is composed (reference +
   * extended + data handlers; allowlist-gated handlers DENY by default), with
   * each invocation written to the ENT-3 audit hash-chain. Override for tests
   * or to install custom connector handlers.
   */
  capabilityRegistry?: CapabilityRegistry;
  /**
   * ENT-3 causal lineage: session-level correlation identifier propagated into
   * capability-audit events written by `createAuditedCapabilityRegistry`. When
   * absent (the common case) the audit events carry no session correlationId;
   * per-entry correlationId is handled in execute-dispatcher for task entries.
   */
  correlationId?: string;
  clock?: () => Date;
  now?: () => string;
  /** Optional persistence path for the approval-adapter pending queue (forwarded to inner buildAutonomousRuntime). */
  pendingPath?: string;
  /**
   * AUT-1: optional nervous-observation tick. When provided, a NervousObserverDep
   * is composed onto the runtime deps (via withNervousObserver) so detectors fire
   * once per autonomous cycle. Absent → no observer (backward-safe). The tick is
   * called fail-safe inside runAutonomousCycle (errors never break the loop).
   */
  nervousTick?: () => void | Promise<void>;
  /**
   * ENT-2: session-level actor (the authenticated API principal) whose tenantId is
   * used as a fallback in audit write-sites when an individual backlog entry's actor
   * carries no tenantId. Absent → falls back to entry-level actor → 'local'.
   * Additive + backward-safe: existing callers (CLI) pass nothing; the per-entry
   * actor.tenantId is still the primary source and is never overridden by this field.
   */
  actor?: ActorContext;
}

// ─── ENT-1: entry RBAC enforcement (flag-gated wire) ─────────────────
//
// Wires the two 0-caller RBAC gates (checkBacklogEntryRbac / checkSprintSpawnRbac)
// into the autonomous dispatch path. Default-off (config.enforce_rbac) keeps the
// ADR-037 V1.0 warn-only contract; a role-less entry is always permitted (the
// permissive default in checkWorkerAuthority), so pre-ENT-1 backlogs are unaffected.

/**
 * Derive the worker {@link Capability} set a backlog entry will exercise — the RBAC
 * input for {@link checkBacklogEntryRbac}. Pure; no I/O.
 *  - `capability` kind → derived from the dotted verb (db/erp/fs/shell/network).
 *  - `task` | `sprint` | `process` → working-tree code work → `['fs-write']`.
 */
export function deriveEntryCapabilities(entry: BacklogEntry): Capability[] {
  if (entry.kind === 'capability') {
    const verb = (entry.spec.capabilityTarget?.capability ?? '').toLowerCase();
    const isWriteVerb = /\.(write|create|update|delete|drop|exec|send|capture)\b/.test(verb);
    if (verb.startsWith('db.')) return isWriteVerb ? ['db-write'] : ['db-query'];
    if (verb.startsWith('erp.')) return isWriteVerb ? ['erp-write'] : ['erp-read'];
    if (verb.startsWith('fs.')) return isWriteVerb ? ['fs-write'] : ['fs-read'];
    if (verb.startsWith('shell')) return ['shell'];
    if (verb.startsWith('mail.') || verb.startsWith('http.') || verb.startsWith('network')) {
      return ['network'];
    }
    return ['fs-read']; // unknown verb → least-privilege read-only assumption
  }
  // task / sprint / process all drive working-tree code changes.
  return ['fs-write'];
}

/** Verdict of {@link enforceEntryRbac}. */
export interface EntryRbacVerdict {
  allowed: boolean;
  reason: string;
}

/**
 * ENT-1 — gate a backlog entry through the role-based authority matrix.
 *
 * Runs {@link checkBacklogEntryRbac} for every entry, plus
 * {@link checkSprintSpawnRbac} for `kind=sprint` entries (sprint worker-spawn path).
 * Both are flag-aware: when `config.enforce_rbac` is off they soft-warn + audit but
 * return `allowed:true` (backward-safe); when on, a role-denied capability HARD-denies.
 * Entries without an `actor.role` always permit (permissive default).
 *
 * @param entry  The backlog entry being dispatched.
 * @param config Resolved config carrying the `enforce_rbac` flag.
 * @param audit  Optional audit bridge — a violation writes `authority.denied`.
 */
export function enforceEntryRbac(
  entry: BacklogEntry,
  config: ResolvedConfig,
  audit?: { projectRoot: string; sprintId?: string; tenantId?: string },
): EntryRbacVerdict {
  const req = {
    actor: entry.actor,
    requirements: { capabilities: deriveEntryCapabilities(entry), resources: [] },
  };

  const backlog = checkBacklogEntryRbac(req, config, audit);
  if (!backlog.allowed) return { allowed: false, reason: backlog.reason };

  if (entry.kind === 'sprint') {
    const spawn = checkSprintSpawnRbac(req, config, audit);
    if (!spawn.allowed) return { allowed: false, reason: spawn.reason };
  }

  return { allowed: true, reason: backlog.reason };
}

/**
 * Compose the full autonomous engine from all Task 1-6 adapters.
 * - Wires the execute-dispatcher into the action-handler registry.
 * - Wraps the base bundle's trigger source with a backlog + optional reactive source.
 * - Installs a policy gate that routes backlog triggers through decidePolicy(G2/G3).
 * - Gap C: wraps deps.authority so internal engine triggers (requestedBy starts with
 *   'system' + action === AUTONOMOUS_EXECUTE_ACTION) are trusted (allowed), letting
 *   the per-task policy gate become the real governance layer. Default-deny is
 *   preserved for all other actions.
 * Pure construction — no I/O, no ticking.
 */
export function buildEngineRuntime(
  opts: BuildEngineRuntimeOptions,
): AutonomousRuntimeBundle {
  // F8 broker dispatch (capability-maturity gap #3): kind=capability entries
  // resolve through this registry; every invocation lands on the ENT-3 audit
  // hash-chain (writeAuditEvent is itself fail-safe on validation/IO).
  // Opt-in ERP connector (config.erp.enabled) installs the live `erp.read`
  // handler so autonomous capability entries round-trip to a real ERP; absent ⇒
  // no erp.read handler (backward-safe).
  const erpConnector = buildErpConnectorFromConfig(opts.config.erp, process.env);
  // ENT-2: session actor tenantId is the secondary source; entry-level actor
  // (record.actor?.tenantId) remains the primary. Callers from the API can inject
  // the authenticated principal so audit events carry the real tenant even for
  // entries that pre-date per-entry actor threading.
  const sessionTenantId = opts.actor?.tenantId;
  const capabilityRegistry = opts.capabilityRegistry ?? createAuditedCapabilityRegistry(
    (record) => {
      writeAuditEvent(opts.projectRoot, 'autonomous', {
        tenantId: record.actor?.tenantId ?? sessionTenantId ?? 'local',
        actor: record.actor?.id ?? opts.actor?.id ?? 'system',
        action: `capability.${record.outcome}`,
        target: record.capability,
        metadata: { timestamp: record.timestamp, error: record.error },
        // ENT-3: thread the session-level correlationId into capability-audit events so all
        // invocations in a session share a traceable correlation scope (opts.correlationId ?? entry-level).
        correlationId: opts.correlationId,
      });
    },
    erpConnector ? { erp: { connector: erpConnector } } : {},
  );

  const handlers = new Map<string, ActionHandler>();
  handlers.set(
    AUTONOMOUS_EXECUTE_ACTION,
    makeExecuteDispatcher({
      projectRoot: opts.projectRoot,
      config: opts.config,
      runTask: opts.runTask,
      // Preserve the canonical exact-executor outcome verbatim. In particular,
      // its outer-wiring BLOCKED settlement must reach the dispatcher as HOLD;
      // this composition root must never evaluate or replace that authority.
      executeSprint: opts.executeSprint,
      backlogPath: opts.backlogPath,
      waitForResult: opts.waitForResult,
      resultTimeoutMs: opts.resultTimeoutMs,
      admitProviderExecution: opts.admitProviderExecution,
      jitComplete: opts.jitComplete,
      flow: opts.flow,
      capabilityRegistry,
    }),
  );

  const approvalPrincipal: VerifiedPrincipal = {
    id: opts.actor?.id ?? 'autonomous-runtime',
    identityClass: opts.actor?.identityClass ?? 'service',
    assurance: opts.actor?.assurance ?? 'unverified',
    provenance: opts.actor?.provenance ?? 'autonomous',
    verifiedBy: opts.actor ? 'actor-context' : 'autonomous-runtime',
    ...(opts.actor?.tenantId ? { tenantId: opts.actor.tenantId } : {}),
    ...(opts.actor?.role ? { role: opts.actor.role } : {}),
  };

  const base = buildAutonomousRuntime({
    projectRoot: opts.projectRoot,
    flows: opts.flows,
    policy: opts.policy,
    actionHandlers: handlers,
    clock: opts.clock,
    now: opts.now,
    pendingPath: opts.pendingPath,
    ...(opts.config.approval?.lifecycle
      ? { approvalLifecycle: opts.config.approval.lifecycle }
      : {}),
    principal: approvalPrincipal,
    strictTenantIsolation: opts.config.strict_tenant_isolation ?? false,
  });

  // Gap C — trusted-internal authority wrap.
  // Internal engine triggers (requestedBy starts with 'system' AND action matches
  // AUTONOMOUS_EXECUTE_ACTION) are allowed at the authority layer so policy:auto
  // entries reach the policy gate (which is the real governance). All other actions
  // still delegate to the base authority — default-deny (ADR-037) is preserved.
  const baseAuthority = base.deps.authority;
  base.deps.authority = {
    check(action, requestedBy) {
      if (action === AUTONOMOUS_EXECUTE_ACTION && requestedBy.startsWith('system')) {
        return { outcome: 'allowed', reason: 'trusted internal engine trigger (policy gate governs)' };
      }
      return baseAuthority.check(action, requestedBy);
    },
  };

  // Compose: backlog-due → existing scheduled-flow source → optional reactive
  // → optional work-generator (self-generated work has the lowest priority).
  const clock = opts.clock ?? ((): Date => new Date());
  // Recurring cadence wire (capability-maturity gap #1): every backlog load
  // first flips due recurring done-entries back to pending (persisted), so a
  // `recurring` entry fires again at each cron cadence instead of dying after
  // its first run.
  const backlogSrc = makeBacklogTriggerSource(
    () => applyRecurringReenqueue(opts.backlogPath, loadBacklog(opts.backlogPath), clock()),
    clock,
  );
  // AUT-3: scheduled-flow triggers are normalized into the backlog dispatch
  // path (handler + authority + policy + rbac_policy + audit in ONE lane) —
  // without this bridge user-configured flows hit 'no handler' + default-deny.
  const flowSrc = makeFlowBacklogBridge(
    base.deps.triggerSource,
    () => loadBacklog(opts.backlogPath),
    opts.backlogPath,
  );
  const sources: TriggerSource[] = [backlogSrc, flowSrc];
  if (opts.reactiveSource) sources.push(opts.reactiveSource);
  // Work-generator wire (capability-maturity gap #2): candidates are enqueued
  // into the backlog FIRST (execute-dispatcher's status writeback requires the
  // entry to exist there), then the first fresh one is yielded as a trigger.
  if (opts.generateWork) {
    const generateWork = opts.generateWork;
    sources.push(makeWorkGeneratorSource({
      generate: () => {
        const candidates = generateWork();
        if (candidates.length === 0) return [];
        // ENT-3: stamp each work-generator batch with a fresh correlationId so all entries
        // from the SAME generation trigger share a traceable correlation scope.
        const batchCorrelationId = randomUUID();
        return enqueueCandidates(opts.backlogPath, loadBacklog(opts.backlogPath), candidates, batchCorrelationId);
      },
    }));
  }
  base.deps.triggerSource = makeHybridTriggerSource(sources);

  // G2/G3 policy gate: backlog entries route through decidePolicy; non-backlog
  // triggers (scheduled-flow, reactive) return 'auto' (authority-only flow).
  // RBAC enforcement (capability-maturity gap #4): when autonomous.rbac_policy
  // is enabled, every entry-carrying trigger is FIRST gated through
  // evaluatePolicy's RBAC layer — machine-initiated dispatch under a role
  // without 'execute' (default 'viewer') is hard-DENIED. This converts RBAC
  // from advisory (ADR-037 V1.0) to enforced on the autonomous path, where the
  // trusted-internal authority wrap above would otherwise be the only gate.
  const rbacPolicy = opts.config.autonomous?.rbac_policy;
  const policyGate: PolicyGate = {
    decide(trigger) {
      const entry = (trigger.payload as { entry?: BacklogEntry } | undefined)?.entry;
      if (!entry) {
        return { decision: 'auto', reason: 'no entry (non-backlog trigger) → authority-only' };
      }
      // ENT-1 — role-based authority gate (flag-gated by config.enforce_rbac). A
      // role-denied capability HARD-denies when the flag is on, writes an
      // `authority.denied` audit event either way, and is a no-op for role-less
      // entries (permissive default → backward-safe with pre-ENT-1 backlogs).
      const rbacVerdict = enforceEntryRbac(entry, opts.config, {
        projectRoot: opts.projectRoot,
        sprintId: 'autonomous',
        tenantId: entry.tenant,
      });
      if (!rbacVerdict.allowed) {
        return { decision: 'deny', reason: rbacVerdict.reason };
      }
      if (rbacPolicy?.enabled) {
        const verdict = evaluatePolicy({
          rbac: {
            role: rbacPolicy.role ?? 'viewer',
            action: Permission.EXECUTE,
            tenantId: entry.tenant ?? 'local',
          },
        });
        if (verdict.decision === 'deny') {
          return { decision: 'deny', reason: verdict.reasons.join('; ') };
        }
      }
      return decidePolicy(entry, computeEntryEffectClass(entry));
    },
  };
  base.deps.policyGate = policyGate;

  // AUT-1: compose the nervous observer onto the deps so detectors actually fire
  // per cycle. No-op when nervousTick is absent (backward-safe). The CLI passes a
  // real DetectorRegistry-backed tick to fully close the live-observation wire.
  if (opts.nervousTick) {
    base.deps = withNervousObserver(base.deps, { nervousTick: opts.nervousTick });
  }

  return base;
}

// ─── Continuous tick loop ─────────────────────────────────────────────

export interface RunAutonomousLoopOptions {
  /** Idle-tick sleep duration in ms. */
  intervalMs: number;
  /** Stop after this many cycles. Omit to run until aborted. */
  maxIterations?: number;
  /** External cancellation signal — checked at the top of every iteration. */
  signal?: AbortSignal;
  /** Sleep override for deterministic tests. Defaults to setTimeout. */
  sleep?: (ms: number) => Promise<void>;
  /** Per-cycle observation hook (audit pipeline already runs separately). */
  onTick?: (result: AutonomousCycleResult) => void;
}

export type AutonomousLoopStopReason = 'maxIterations' | 'aborted';

export interface AutonomousLoopSummary {
  iterations: number;
  reason: AutonomousLoopStopReason;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Drive `runAutonomousCycle` in a continuous tick loop until either
 * `maxIterations` is reached or the supplied `AbortSignal` fires.
 *
 * Tick semantics:
 *   - idle (`no_trigger`) → sleep `intervalMs` before the next iteration
 *   - active → yield to the event loop (sleep 0) and immediately tick again
 *
 * The loop never throws on cycle outcome; every cycle records its own
 * audit entry via the audit sink already wired into `deps`.
 */
export async function runAutonomousLoop(
  config: AutonomousRuntimeConfig,
  deps: AutonomousRuntimeDeps,
  options: RunAutonomousLoopOptions,
): Promise<AutonomousLoopSummary> {
  const sleep = options.sleep ?? defaultSleep;
  let iterations = 0;

  for (;;) {
    if (options.signal?.aborted) {
      return { iterations, reason: 'aborted' };
    }
    if (
      options.maxIterations !== undefined &&
      iterations >= options.maxIterations
    ) {
      return { iterations, reason: 'maxIterations' };
    }

    const result = await runAutonomousCycle(config, deps);
    iterations += 1;
    options.onTick?.(result);

    // Active outcome (executed) → re-tick immediately (sleep 0).
    // All other outcomes (no_trigger/pending/denied/rejected/failed) → sleep
    // intervalMs to prevent busy-spin when the backlog is empty or entries are
    // stuck awaiting approval or authority.
    const waitMs = result.outcome === 'executed' ? 0 : options.intervalMs;
    if (process.env.DECKENT_DEBUG_AUTONOMOUS) {
      process.stderr.write(
        `[autonomous-loop] iter=${iterations} outcome=${result.outcome} waitMs=${waitMs}\n`,
      );
    }
    await sleep(waitMs);
  }
}
