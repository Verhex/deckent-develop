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
import type { PolicyGate } from '../autonomous-runtime.js';
import {
  makeBacklogTriggerSource,
  makeHybridTriggerSource,
} from './backlog-trigger.js';
import {
  makeExecuteDispatcher,
  AUTONOMOUS_EXECUTE_ACTION,
  type ExecuteDispatcherDeps,
} from './execute-dispatcher.js';
import { decidePolicy } from './policy-gate.js';
import { loadBacklog } from './backlog.js';
import type { BacklogEntry } from './backlog-types.js';

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
    now: opts.now,
    executor: opts.executor,
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
  runSprint: ExecuteDispatcherDeps['runSprint'];
  /** Optional extra trigger source (e.g. a reactive/webhook source) added last. */
  reactiveSource?: TriggerSource;
  clock?: () => Date;
  now?: () => string;
}

/**
 * Compose the full autonomous engine from all Task 1-6 adapters.
 * - Wires the execute-dispatcher into the action-handler registry.
 * - Wraps the base bundle's trigger source with a backlog + optional reactive source.
 * - Installs a policy gate that routes backlog triggers through decidePolicy(G2/G3).
 * Pure construction — no I/O, no ticking.
 */
export function buildEngineRuntime(
  opts: BuildEngineRuntimeOptions,
): AutonomousRuntimeBundle {
  const handlers = new Map<string, ActionHandler>();
  handlers.set(
    AUTONOMOUS_EXECUTE_ACTION,
    makeExecuteDispatcher({
      projectRoot: opts.projectRoot,
      config: opts.config,
      runTask: opts.runTask,
      runSprint: opts.runSprint,
    }),
  );

  const base = buildAutonomousRuntime({
    projectRoot: opts.projectRoot,
    flows: opts.flows,
    policy: opts.policy,
    actionHandlers: handlers,
    clock: opts.clock,
    now: opts.now,
  });

  // Compose: backlog-due → existing scheduled-flow source → optional reactive.
  const backlogSrc = makeBacklogTriggerSource(
    () => loadBacklog(opts.backlogPath),
    opts.clock ?? (() => new Date()),
  );
  const sources: TriggerSource[] = [backlogSrc, base.deps.triggerSource];
  if (opts.reactiveSource) sources.push(opts.reactiveSource);
  base.deps.triggerSource = makeHybridTriggerSource(sources);

  // G2/G3 policy gate: backlog entries route through decidePolicy; non-backlog
  // triggers (scheduled-flow, reactive) return 'auto' (authority-only flow).
  const policyGate: PolicyGate = {
    decide(trigger) {
      const entry = (trigger.payload as { entry?: BacklogEntry } | undefined)?.entry;
      if (!entry) {
        return { decision: 'auto', reason: 'no entry (non-backlog trigger) → authority-only' };
      }
      return decidePolicy(entry);
    },
  };
  base.deps.policyGate = policyGate;

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

    const waitMs = result.outcome === 'no_trigger' ? options.intervalMs : 0;
    await sleep(waitMs);
  }
}
