// ─── born-698c — detached-run DEATH SWEEP (honest closure) ───────────────────
// The `deckent do/start --flow-id` child is detached + unref'd: when it dies
// without finalizing (crash, OOM, SIGKILL, provider wedge), the flow used to
// sit in STARTING/DETACHED_RUNNING forever and the death was visible only in
// raw event files (the born-698 "silent death" class). This sweep runs on
// READ paths (mirror of the APPROVAL-EXPIRY precedent): any live-state flow
// whose recorded run pid is no longer alive gets an honest, durable RUN_FAILED
// closure (system-authored narrative) — never a silent limbo.

import { getRunFlowCoordinator } from './run-flow-coordinator-registry.js';
import { loadRunHandle } from '../core/run-flow-store.js';
import { debugLog } from '../core/utils.js';

/** Flow states that claim a live external process. */
const LIVE_RUN_STATES = new Set(['STARTING', 'DETACHED_RUNNING']);

export interface DeathSweepEntry {
  flowId: string;
  outcome: 'closed-dead' | 'alive' | 'no-pid-record' | 'error';
  detail: string;
}

export interface DeathSweepReport {
  scanned: number;
  closed: DeathSweepEntry[];
  skipped: DeathSweepEntry[];
}

/** True when `pid` belongs to a currently-running process we may probe. */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM = alive but not ours (still alive); ESRCH = genuinely gone.
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
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

      if (isProcessAlive(pid)) {
        report.skipped.push({ flowId, outcome: 'alive', detail: `pid ${pid} alive` });
        continue;
      }

      const narrative = `run process died without completion (pid ${pid} not alive; state was ${context.state}) — closed by death-sweep`;
      coordinator.recordRunFailure({
        flowId,
        error: narrative,
        commandId: `death-sweep-${flowId}-pid${pid}`,
      });
      report.closed.push({ flowId, outcome: 'closed-dead', detail: narrative });
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
