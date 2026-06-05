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
} from '../autonomous-runtime.js';
import { makeAuthorityChecker } from './authority-adapter.js';
import { makeAuditSink } from './audit-adapter.js';
import {
  makeApprovalGate,
  type ApprovalGateAdapter,
} from './approval-adapter.js';
import { makeActionExecutor } from './action-adapter.js';
import { makeTriggerSource } from './trigger-adapter.js';

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
