// src/nervous/panic-gate.ts
//
// Non-blocking Panic-Gate primitive — Sprint 223 Task 223-006.
//
// Problem (222-008 OOM-NO_GO carry, Sprint 222→223 dogfood evidence):
//   When `nervous.enabled === true`, spawn-path code that funnels panic events
//   through an `approve`-policy approval channel had no upper bound on the
//   wait. A `.deckent/panic-ipc/pending/<taskId>-<ts>.json` marker would be
//   created, but if no user accepted it the awaiting Promise would never
//   resolve. Combined with the worker container memory cap this produced
//   exit 137 OOM-kills (222-008 / 222-009 / 222-013 sprint records).
//
// Decision (ADR-040 + ADR-037):
//   The worker-spawn critical path must NEVER depend on a blocking nervous
//   approval. This module exposes two non-blocking primitives:
//     - `evaluatePanicGate(opts)`  — synchronous; default `'advisory'` mode
//                                    returns PROCEED immediately + emits a
//                                    visible warning to stderr.
//     - `awaitPanicGateApproval(opts)` — async with HARD timeout (default
//                                    10s). On timeout returns
//                                    `TIMEOUT_AUTO_PROCEED`. Never silent
//                                    infinite wait.
//
//   `safety_floor` (KILL_LIVE_SPRINT, MANUAL_FILE_DELETE, COST_OVER_THRESHOLD,
//   DESTRUCTIVE_GIT, ADR_DEPRECATE_ACCEPTED) actions are EXEMPT from auto-
//   proceed: they continue to require explicit user approval. These are the
//   intentional locked actions and must NOT be bypassed by a timeout.
//
//   Visible warning is mandatory whenever the gate proceeds without an
//   explicit approval — the rule is "no silent infinite wait, no silent
//   bypass".
//
// Caller note: the wire into `src/orchestra/sprint-controller.ts` /
//   `src/orchestra/spawn-backend*` is a follow-up task — this module ships
//   the protocol primitive + tests under `src/nervous/` scope.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PANIC_IPC_DIR } from '../core/constants.js';
import { SAFETY_FLOOR } from './authority-matrix.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export type PanicGateMode = 'advisory' | 'blocking-with-timeout';

export type PanicGateDecision = 'PROCEED' | 'APPROVED' | 'REJECTED' | 'TIMEOUT_AUTO_PROCEED';

export interface PanicGateOptions {
  /** Action id under evaluation (e.g. 'KILL_LIVE_SPRINT'). */
  readonly actionId: string;
  /**
   * Gate mode. Default `'advisory'` — gate never blocks spawn, returns
   * PROCEED with a visible warning. Use `'blocking-with-timeout'` only when
   * the caller can tolerate the timeout window.
   */
  readonly mode?: PanicGateMode;
  /** Optional warning sink override (defaults to console.warn). */
  readonly warn?: (msg: string) => void;
}

export interface AwaitPanicGateOptions {
  /** Action id under evaluation. */
  readonly actionId: string;
  /** Task id whose approval marker we are watching. */
  readonly taskId: string;
  /** Project root containing `.deckent/panic-ipc/`. */
  readonly projectRoot: string;
  /** Hard timeout in ms before auto-proceed fires. Default 10_000. */
  readonly timeoutMs?: number;
  /** Poll interval in ms. Default 250. */
  readonly pollIntervalMs?: number;
  /** Optional warning sink override (defaults to console.warn). */
  readonly warn?: (msg: string) => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_POLL_INTERVAL_MS = 250;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Returns true when the action id is in the nervous SAFETY_FLOOR set. Locked
 * actions are NEVER auto-proceeded — the timeout-auto-proceed escape hatch
 * does not apply to them.
 */
export function isLockedPanicAction(actionId: string): boolean {
  return (SAFETY_FLOOR as readonly string[]).includes(actionId);
}

function emitWarning(sink: ((msg: string) => void) | undefined, msg: string): void {
  if (sink) {
    sink(msg);
    return;
  }
  // Visible warning — never silent.
  console.warn(`[panic-gate] ${msg}`);
}

function resolvedMarkerPath(projectRoot: string, taskId: string): string {
  return join(projectRoot, PANIC_IPC_DIR, 'resolved', `${taskId}.json`);
}

function readDecisionFromMarker(path: string): 'APPROVED' | 'REJECTED' | null {
  try {
    const raw = readFileSync(path, 'utf-8');
    const obj = JSON.parse(raw) as { decision?: string };
    if (obj.decision === 'reject' || obj.decision === 'rejected') return 'REJECTED';
    // Any present marker (even without an explicit decision field) is treated
    // as approval — `acceptPanicGuard` writes the marker on accept.
    return 'APPROVED';
  } catch {
    return null;
  }
}

// ─── Synchronous evaluation ─────────────────────────────────────────────────

/**
 * Synchronous, non-blocking panic-gate evaluation.
 *
 * Default behavior (`mode: 'advisory'`):
 *   - Returns `'PROCEED'` immediately.
 *   - Emits a visible warning so the bypass is auditable.
 *   - Does NOT bypass SAFETY_FLOOR — locked actions return `'REJECTED'`
 *     because the caller must explicitly route them through
 *     `awaitPanicGateApproval` instead of advisory.
 *
 * `mode: 'blocking-with-timeout'`:
 *   - The caller is responsible for chaining `awaitPanicGateApproval` —
 *     this synchronous helper just records intent and returns `'PROCEED'`
 *     advisory by default, signalling the caller to await.
 */
export function evaluatePanicGate(opts: PanicGateOptions): PanicGateDecision {
  const mode: PanicGateMode = opts.mode ?? 'advisory';

  if (isLockedPanicAction(opts.actionId)) {
    emitWarning(
      opts.warn,
      `safety_floor action '${opts.actionId}' cannot use advisory mode — defer to awaitPanicGateApproval`,
    );
    // Locked actions cannot proceed silently — caller must route through the
    // async approval path. We return REJECTED here so the synchronous fast
    // path never silently proceeds on a locked action.
    return 'REJECTED';
  }

  if (mode === 'advisory') {
    emitWarning(
      opts.warn,
      `advisory: proceeding without blocking on '${opts.actionId}' (non-locked action)`,
    );
    return 'PROCEED';
  }

  // blocking-with-timeout — caller must follow up with awaitPanicGateApproval.
  emitWarning(
    opts.warn,
    `blocking-with-timeout requested for '${opts.actionId}' — caller must call awaitPanicGateApproval`,
  );
  return 'PROCEED';
}

// ─── Async approval await (HARD timeout) ───────────────────────────────────

/**
 * Wait for a panic approval marker with a HARD timeout.
 *
 * The Promise ALWAYS resolves:
 *   - `'APPROVED'`  — a resolved marker arrived before the deadline.
 *   - `'REJECTED'`  — the marker carries an explicit reject decision.
 *   - `'TIMEOUT_AUTO_PROCEED'` — the deadline fired first; the caller MUST
 *     proceed (auto-proceed). A visible warning is emitted. Locked safety_floor
 *     actions are NOT auto-proceeded — they keep waiting until the marker is
 *     read OR an explicit interrupt arrives via a future API extension; in
 *     this V1 they resolve to `'REJECTED'` to enforce the safety contract.
 *
 * The poller uses `setTimeout` (no `setInterval`) so test environments using
 * `vi.useFakeTimers()` advance deterministically.
 */
export function awaitPanicGateApproval(opts: AwaitPanicGateOptions): Promise<PanicGateDecision> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const markerPath = resolvedMarkerPath(opts.projectRoot, opts.taskId);
  const locked = isLockedPanicAction(opts.actionId);

  return new Promise<PanicGateDecision>((resolve) => {
    let settled = false;
    let pollTimer: NodeJS.Timeout | null = null;

    const finish = (decision: PanicGateDecision): void => {
      if (settled) return;
      settled = true;
      if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
      clearTimeout(deadlineTimer);
      resolve(decision);
    };

    // Hard timeout — auto-proceed (or REJECTED for locked actions).
    const deadlineTimer = setTimeout(() => {
      if (locked) {
        emitWarning(
          opts.warn,
          `safety_floor action '${opts.actionId}' timed out — keeping REJECTED (no auto-proceed for locked actions)`,
        );
        finish('REJECTED');
        return;
      }
      emitWarning(
        opts.warn,
        `timeout (${timeoutMs}ms) — auto-proceeding panic-gate for '${opts.actionId}' / task=${opts.taskId}`,
      );
      finish('TIMEOUT_AUTO_PROCEED');
    }, timeoutMs);

    const poll = (): void => {
      if (settled) return;
      if (existsSync(markerPath)) {
        const decision = readDecisionFromMarker(markerPath);
        if (decision !== null) {
          finish(decision);
          return;
        }
      }
      pollTimer = setTimeout(poll, pollIntervalMs);
    };

    // Check immediately, then begin polling.
    poll();
  });
}

// ─── Toggle-Independent Lethal Guard ─────────────────────────────────────────

/**
 * Result returned by {@link assertNotLethalWithoutApproval}.
 */
export interface LethalGuardResult {
  /** True when the action is a SAFETY_FLOOR action that requires explicit approval. */
  readonly blocked: boolean;
  /** Human-readable block reason (empty string when not blocked). */
  readonly reason: string;
}

/**
 * Toggle-independent proactive lethal guard (GATE-W2).
 *
 * Checks whether `actionId` is one of the 5 SAFETY_FLOOR actions that must
 * always require explicit user approval:
 *   KILL_LIVE_SPRINT | MANUAL_FILE_DELETE | COST_OVER_THRESHOLD |
 *   DESTRUCTIVE_GIT  | ADR_DEPRECATE_ACCEPTED
 *
 * This guard fires regardless of `config.nervous_system.enabled`. When nervous
 * is disabled the reactive detector is offline, but this proactive TCB layer
 * remains active at every call site.
 *
 * Behavior:
 *   - nervous ON  → both this guard AND the reactive nervous detector fire.
 *   - nervous OFF → only this guard fires (detective layer is offline).
 *   - Non-lethal  → always returns `{ blocked: false }` with no warning.
 *
 * @toggleIndependent — active regardless of nervous.enabled toggle.
 */
export function assertNotLethalWithoutApproval(
  actionId: string,
  opts?: { warn?: (msg: string) => void },
): LethalGuardResult {
  if (!isLockedPanicAction(actionId)) {
    return { blocked: false, reason: '' };
  }
  const reason =
    `[SAFETY_FLOOR] toggleIndependent guard: '${actionId}' requires explicit user approval — blocked`;
  emitWarning(opts?.warn, reason);
  return { blocked: true, reason };
}
