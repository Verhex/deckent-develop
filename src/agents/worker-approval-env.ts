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

import { createOrchestraWorkerApprovalGate } from './worker.js';
import type { ApprovalGateLike } from './agentic-worker-tools.js';

export const APPROVAL_GATE_ENV = 'DECKENT_APPROVAL_GATE';
export const APPROVAL_SCOPE_ENV = 'DECKENT_APPROVAL_SCOPE_ID';

const EXTERNAL_DECISION_POLL_MS = 1000;

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
  const scopeEnv = env[APPROVAL_SCOPE_ENV];
  const scopeId = scopeEnv && scopeEnv.length > 0 ? scopeEnv : taskId;
  return {
    approvalGate: { enabled: true, gate: handle.gate, scopeId },
    dispose: () => clearInterval(timer),
  };
}
