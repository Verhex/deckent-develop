// ═══ worker-approval-env — born-611 env-injection contract ═══════════════════
//
// The in-process agentic workers (agentic-worker-entry / http-agentic-worker)
// are DELIBERATELY argv-only-minimal and never load config themselves — the
// orchestrator resolves config once and passes what a subprocess needs via env
// (the exact `apiKeyEnv` precedent). This module owns both sides of that
// contract for the worker approval gate (APR-P0):
//
//   spawn side  → buildWorkerApprovalGateEnv(gateEnabled, sprintId, taskId)
//   worker side → setupWorkerApprovalGateFromEnv(projectRoot, taskId)
//
// The worker-side setup builds the REAL disk-backed gate
// (createOrchestraWorkerApprovalGate → ApprovalBroker on `.deckent/approvals/`,
// the same store the terminal/API decide against) AND drives the broker's
// injectable cross-process poll seam (`checkForExternalDecisions` — without a
// driver an external decision would never settle the worker's await and every
// guard would ride to timeout-DENY). Plain 1s setInterval, `.unref()`ed so a
// finished worker process never hangs on it; `dispose()` clears it anyway.
//
// scopeId = `${sprintId}/${taskId}` (not bare taskId): allowscope grants match
// scopeId EXACTLY and task ids repeat across sprints — a bare-taskId grant
// would leak into the next sprint's same-numbered task (advisor, born-611).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createOrchestraWorkerApprovalGate, writeHeartbeat } from './worker.js';
import type { ApprovalGateLike } from './agentic-worker-tools.js';
import type { WorkerActionDescriptor, GateVerdict } from '../core/approval-worker-gate.js';
import { TASKS_DIR, HEARTBEAT_WRITE_INTERVAL_MS } from '../core/constants.js';
import type { Heartbeat } from '../core/types.js';

export const APPROVAL_GATE_ENV = 'DECKENT_APPROVAL_GATE';
export const APPROVAL_SCOPE_ENV = 'DECKENT_APPROVAL_SCOPE_ID';

const EXTERNAL_DECISION_POLL_MS = 1000;

// ─── born-630 (APPROVAL-QOL) item 3: bekleme-heartbeat ──────────────────────
// A `guard()` call can await a decision for up to the gate's timeout (default
// 5 min, approval-worker-gate.ts DEFAULT_TIMEOUT_MS) — while it awaits, the
// worker's own execution loop is blocked on that one Promise, so nothing else
// refreshes `.tasks/task-<id>.hb`. The Auditor's stale-heartbeat alarm fires
// past 2 minutes (HEARTBEAT_STALE_THRESHOLD_MS) — well inside a single
// approval wait. This refreshes the SAME hb file on the SAME cadence normal
// execution already uses (HEARTBEAT_WRITE_INTERVAL_MS) for the duration of
// each guard() call only, via the existing `writeHeartbeat` helper.

function heartbeatFilePath(projectRoot: string, taskId: string): string {
  return join(projectRoot, TASKS_DIR, `task-${taskId}.hb`);
}

/** Fail-soft: a missing/unparsable heartbeat file is skipped, never thrown —
 *  a hb-refresh hiccup must not abort (or fail) an in-flight approval wait. */
function refreshWaitingHeartbeat(projectRoot: string, taskId: string): void {
  const path = heartbeatFilePath(projectRoot, taskId);
  if (!existsSync(path)) return;
  try {
    const hb = JSON.parse(readFileSync(path, 'utf-8')) as Heartbeat;
    writeHeartbeat(projectRoot, {
      ...hb,
      timestamp: new Date().toISOString(),
      sequence: (hb.sequence ?? 0) + 1,
      currentAction: 'awaiting approval decision',
    });
  } catch {
    // fail-soft — see doc comment above
  }
}

/** Shadow `gate.guard` so every call refreshes the task heartbeat on
 *  `HEARTBEAT_WRITE_INTERVAL_MS` cadence for the call's duration only — the
 *  timer starts right before the (possibly long) await and is always cleared
 *  in `finally`, unref'd so it never keeps the process alive. */
function wrapGuardWithHeartbeatRefresh(gate: ApprovalGateLike, projectRoot: string, taskId: string): void {
  const originalGuard = gate.guard.bind(gate);
  gate.guard = async (action: WorkerActionDescriptor): Promise<GateVerdict> => {
    const timer = setInterval(() => refreshWaitingHeartbeat(projectRoot, taskId), HEARTBEAT_WRITE_INTERVAL_MS);
    timer.unref();
    try {
      return await originalGuard(action);
    } finally {
      clearInterval(timer);
    }
  };
}

/**
 * Spawn-side half: env vars for a worker subprocess. `undefined` when the gate
 * is disabled — adapters merge `...opts?.env`, so absence is zero-footprint.
 */
export function buildWorkerApprovalGateEnv(
  gateEnabled: boolean,
  sprintId: string | undefined,
  taskId: string,
): Record<string, string> | undefined {
  if (!gateEnabled) return undefined;
  return {
    [APPROVAL_GATE_ENV]: '1',
    [APPROVAL_SCOPE_ENV]: `${sprintId ?? 'sprint-unknown'}/${taskId}`,
  };
}

export interface WorkerApprovalGateSetup {
  /** Present only when the gate env flag is on — pass straight to the runner opts. */
  approvalGate?: { enabled: boolean; gate: ApprovalGateLike; scopeId: string };
  /** Stops the external-decision poll driver. Safe to call when disabled/twice. */
  dispose: () => void;
}

/**
 * Worker-side half: read the env contract and, when enabled, build the real
 * gate + start the external-decision poll driver. Callers MUST `dispose()` in
 * a finally around the runner (hermetic tests; prompt process exit).
 */
export function setupWorkerApprovalGateFromEnv(
  projectRoot: string,
  taskId: string,
  env: NodeJS.ProcessEnv = process.env,
): WorkerApprovalGateSetup {
  if (env[APPROVAL_GATE_ENV] !== '1') {
    return { dispose: () => undefined };
  }
  const handle = createOrchestraWorkerApprovalGate(projectRoot, taskId);
  const timer = setInterval(() => {
    try { handle.broker.checkForExternalDecisions(); } catch { /* fail-soft: next tick retries */ }
  }, EXTERNAL_DECISION_POLL_MS);
  timer.unref();
  wrapGuardWithHeartbeatRefresh(handle.gate, projectRoot, taskId);
  const scopeEnv = env[APPROVAL_SCOPE_ENV];
  const scopeId = scopeEnv && scopeEnv.length > 0 ? scopeEnv : taskId;
  return {
    approvalGate: { enabled: true, gate: handle.gate, scopeId },
    dispose: () => { clearInterval(timer); handle.dispose(); },
  };
}
