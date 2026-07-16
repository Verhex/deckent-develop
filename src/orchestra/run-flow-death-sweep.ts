// ─── born-698c — detached-run DEATH SWEEP (honest closure) ───────────────────
// The `deckent do/start --flow-id` child is detached + unref'd: when it dies
// without finalizing (crash, OOM, SIGKILL, provider wedge), the flow used to
// sit in STARTING/DETACHED_RUNNING forever and the death was visible only in
// raw event files (the born-698 "silent death" class). This sweep runs on
// READ paths (mirror of the APPROVAL-EXPIRY precedent): any live-state flow
// whose recorded run pid is no longer alive gets an honest, durable RUN_FAILED
// closure (system-authored narrative) — never a silent limbo.

import { getRunFlowCoordinator } from './run-flow-coordinator-registry.js';
import { loadRunHandle, readFlowEvents } from '../core/run-flow-store.js';
import { isPidAlive } from '../core/pid-liveness.js';
import { debugLog } from '../core/utils.js';

/** Flow states that claim a live external process. */
const LIVE_RUN_STATES = new Set(['STARTING', 'DETACHED_RUNNING']);

export interface DeathSweepEntry {
  flowId: string;
  outcome: 'closed-dead' | 'alive' | 'no-pid-record' | 'jobs-terminal' | 'error';
  detail: string;
}

export interface DeathSweepReport {
  scanned: number;
  closed: DeathSweepEntry[];
  skipped: DeathSweepEntry[];
}

/** The dead-run closure payload — ONE source for both the read-path sweep and
 *  the operator sweep (`sweepStaleRuns`), so the shared `commandId` keeps the
 *  two paths idempotent against each other: whichever runs first wins, the
 *  other folds to a duplicate-command no-op. */
function deadRunClosure(flowId: string, pid: number, state: string): { commandId: string; error: string } {
  return {
    commandId: `death-sweep-${flowId}-pid${pid}`,
    error: `run process died without completion (pid ${pid} not alive; state was ${state}) — closed by death-sweep`,
  };
}

/**
 * Sweep every flow with durable state: live-claiming flows whose recorded pid
 * is dead receive a durable RUN_FAILED closure. Fail-soft per flow — one bad
 * record never aborts the sweep (the EISDIR/expire-sweep lesson).
 */
export function sweepDeadDetachedRuns(projectRoot: string): DeathSweepReport {
  const report: DeathSweepReport = { scanned: 0, closed: [], skipped: [] };
  const coordinator = getRunFlowCoordinator(projectRoot);

  let flowIds: string[] = [];
  try {
    flowIds = coordinator.listFlows();
  } catch (err) {
    debugLog('run-flow-death-sweep:list', err);
    return report;
  }

  for (const flowId of flowIds) {
    report.scanned += 1;
    try {
      const context = coordinator.getFlow(flowId);
      if (!LIVE_RUN_STATES.has(context.state)) continue;

      const handleRecord = loadRunHandle(projectRoot, flowId);
      const pid = handleRecord?.pid;
      if (typeof pid !== 'number') {
        // Pre-698 record (no pid) — liveness is UNKNOWN; an honest sweep
        // never guesses a kill. Reported, not closed.
        report.skipped.push({
          flowId,
          outcome: 'no-pid-record',
          detail: 'run handle carries no pid (pre-698 record) — liveness unknown, left untouched',
        });
        continue;
      }

      if (isPidAlive(pid)) {
        report.skipped.push({ flowId, outcome: 'alive', detail: `pid ${pid} alive` });
        continue;
      }

      const closure = deadRunClosure(flowId, pid, context.state);
      coordinator.recordRunFailure({
        flowId,
        error: closure.error,
        commandId: closure.commandId,
      });
      report.closed.push({ flowId, outcome: 'closed-dead', detail: closure.error });
    } catch (err) {
      report.skipped.push({
        flowId,
        outcome: 'error',
        detail: err instanceof Error ? err.message : String(err),
      });
      debugLog('run-flow-death-sweep:flow', `${flowId}: ${err}`);
    }
  }

  return report;
}

// ─── F-3 — operator stale-run sweep (`deckent runs --close-stale`) ───────────
// The read-path sweep above can only close what it can PROVE dead (a recorded
// pid that is gone). A pre-698 record carries no pid, so its DETACHED_RUNNING
// claim is unverifiable forever — the honest read-path leaves it in limbo. This
// operator sweep is the explicit-consent counterpart: the human's command
// substitutes for the missing pid proof, closing unverifiable flows as
// CANCELLED (never a guessed FAILED). Dry-run by default at the CLI; `apply`
// is only ever set from an explicit `--yes`.

export interface StaleRunSweepEntry {
  flowId: string;
  detail: string;
  pid?: number;
  /** The durable closure this entry gets (or would get, in a dry-run):
   *  'failed' = RUN_FAILED fold; 'cancelled' = FLOW_ABORTED fold — the only
   *  closure a LEGACY flow (empty event log) can fold, since RUN_FAILED
   *  requires a STARTING/DETACHED_RUNNING event-log state to fold from. */
  closedAs: 'failed' | 'cancelled';
}

export interface StaleRunSweepOptions {
  apply: boolean;
  /** flowIds whose EXECUTION truth is already terminal in the jobs-dir (the
   *  inbox's join — `scanJobRecords`). These are NOT stale: every user-facing
   *  reader overrides their state with the jobs record, and a legacy event
   *  log cannot fold a completion anyway. Skipped as 'jobs-terminal' — closing
   *  a provably-COMPLETED run as cancelled would be a lie. */
  jobsTerminalFlowIds?: ReadonlySet<string>;
}

export interface StaleRunSweepReport {
  scanned: number;
  /** Recorded pid no longer alive → closure (applied) or candidate (dry-run). */
  dead: StaleRunSweepEntry[];
  /** Run handle predates pid tracking → liveness unverifiable → CANCELLED
   *  closure (applied) or candidate (dry-run). */
  unverifiable: StaleRunSweepEntry[];
  skipped: DeathSweepEntry[];
  /** True when closures were durably written; false for a dry-run. */
  applied: boolean;
}

/**
 * Classify every live-claiming flow (jobs-terminal / dead / unverifiable /
 * alive / no-handle) and — only when `opts.apply` — write the honest durable
 * closure per class: dead pid → RUN_FAILED when the flow's event log can fold
 * it (identical narrative + commandId as the read-path sweep, so the two never
 * double-close) or FLOW_ABORTED for a legacy log; unverifiable → FLOW_ABORTED
 * with an operator narrative. Fail-soft per flow, mirror of
 * `sweepDeadDetachedRuns`. Deterministic: a dry-run reports exactly the
 * closures an apply would write.
 */
export function sweepStaleRuns(projectRoot: string, opts: StaleRunSweepOptions): StaleRunSweepReport {
  const report: StaleRunSweepReport = { scanned: 0, dead: [], unverifiable: [], skipped: [], applied: opts.apply };
  const coordinator = getRunFlowCoordinator(projectRoot);

  let flowIds: string[] = [];
  try {
    flowIds = coordinator.listFlows();
  } catch (err) {
    debugLog('run-flow-stale-sweep:list', err);
    return report;
  }

  for (const flowId of flowIds) {
    report.scanned += 1;
    try {
      const context = coordinator.getFlow(flowId);
      if (!LIVE_RUN_STATES.has(context.state)) continue;

      if (opts.jobsTerminalFlowIds?.has(flowId)) {
        report.skipped.push({
          flowId,
          outcome: 'jobs-terminal',
          detail: 'execution truth is terminal in the jobs-dir — not stale to any joined reader, left untouched',
        });
        continue;
      }

      const handleRecord = loadRunHandle(projectRoot, flowId);
      if (handleRecord === undefined) {
        // No start attempt was ever recorded — the state itself is the only
        // claim, and there is no record to judge stale. Left untouched.
        report.skipped.push({
          flowId,
          outcome: 'no-pid-record',
          detail: 'no run-handle record — start never recorded, left untouched',
        });
        continue;
      }

      const pid = handleRecord.pid;
      if (typeof pid !== 'number') {
        const detail = `run handle carries no pid (predates pid tracking; state was ${context.state}) — liveness unverifiable`;
        if (opts.apply) {
          coordinator.abortFlow({
            flowId,
            reason: `${detail}; closed by operator stale-run sweep`,
            commandId: `stale-sweep-${flowId}`,
          });
        }
        report.unverifiable.push({ flowId, detail, closedAs: 'cancelled' });
        continue;
      }

      if (isPidAlive(pid)) {
        report.skipped.push({ flowId, outcome: 'alive', detail: `pid ${pid} alive` });
        continue;
      }

      // Dead pid. RUN_FAILED only folds from an event-log STARTING/
      // DETACHED_RUNNING — a legacy/do-origin flow (empty event log) folds
      // from INITIAL, so its only valid closure is FLOW_ABORTED (CANCELLED),
      // with the death narrative carried in the reason.
      const closure = deadRunClosure(flowId, pid, context.state);
      const foldable = readFlowEvents(projectRoot, flowId).length > 0;
      if (foldable) {
        if (opts.apply) {
          coordinator.recordRunFailure({ flowId, error: closure.error, commandId: closure.commandId });
        }
        report.dead.push({ flowId, detail: closure.error, pid, closedAs: 'failed' });
      } else {
        if (opts.apply) {
          coordinator.abortFlow({
            flowId,
            reason: `${closure.error}; legacy record (no event fold) — closed as cancelled by operator stale-run sweep`,
            commandId: closure.commandId,
          });
        }
        report.dead.push({ flowId, detail: closure.error, pid, closedAs: 'cancelled' });
      }
    } catch (err) {
      report.skipped.push({
        flowId,
        outcome: 'error',
        detail: err instanceof Error ? err.message : String(err),
      });
      debugLog('run-flow-stale-sweep:flow', `${flowId}: ${err}`);
    }
  }

  return report;
}
