// ─── born-698c — detached-run DEATH SWEEP (honest closure) ───────────────────
// The `deckent do/start --flow-id` child is detached + unref'd: when it dies
// without finalizing (crash, OOM, SIGKILL, provider wedge), the flow used to
// sit in STARTING/DETACHED_RUNNING forever and the death was visible only in
// raw event files (the born-698 "silent death" class). This sweep runs on
// READ paths (mirror of the APPROVAL-EXPIRY precedent): any live-state flow
// whose recorded run pid is no longer alive gets an honest, durable RUN_FAILED
// closure (system-authored narrative) — never a silent limbo.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { getRunFlowCoordinator } from './run-flow-coordinator-registry.js';
import {
  loadLatestStartAttempt,
  loadRunHandle,
  readFlowEvents,
  settleStartAttempt,
} from '../core/run-flow-store.js';
import { isPidAlive } from '../core/pid-liveness.js';
import { verifyPidOwnership } from '../core/pid-ownership.js';
import {
  isTerminalStartAttemptState,
  type StartAttemptRecord,
} from '../core/run-flow-contract.js';
import { debugLog } from '../core/utils.js';

/** Flow states that claim a live external process. */
const LIVE_RUN_STATES = new Set(['STARTING', 'DETACHED_RUNNING']);

export interface DeathSweepEntry {
  flowId: string;
  outcome:
    | 'closed-dead'
    | 'alive'
    | 'no-pid-record'
    | 'run-handle-ownership-unknown'
    | 'stale-start-attempt'
    | 'start-attempt-alive'
    | 'start-attempt-ownership-unknown'
    | 'start-attempt-terminal'
    | 'ownership-unknown'
    | 'reconciled-admitted'
    | 'jobs-terminal'
    | 'error';
  detail: string;
}

export interface DeathSweepReport {
  scanned: number;
  closed: DeathSweepEntry[];
  skipped: DeathSweepEntry[];
  /** Additive, bounded projection for JSON/status consumers. */
  skippedSummary: DeathSweepSkippedSummary;
}

export interface DeathSweepSkippedClassSummary {
  outcome: DeathSweepEntry['outcome'];
  count: number;
  /** Deterministic sample; never more than three entries per class. */
  examples: DeathSweepEntry[];
}

export interface DeathSweepSkippedSummary {
  total: number;
  classes: DeathSweepSkippedClassSummary[];
}

const MAX_SKIPPED_EXAMPLES_PER_CLASS = 3;

export function summarizeDeathSweepSkipped(
  skipped: readonly DeathSweepEntry[],
): DeathSweepSkippedSummary {
  const byOutcome = new Map<DeathSweepEntry['outcome'], DeathSweepEntry[]>();
  for (const entry of skipped) {
    const entries = byOutcome.get(entry.outcome) ?? [];
    entries.push(entry);
    byOutcome.set(entry.outcome, entries);
  }
  return {
    total: skipped.length,
    classes: [...byOutcome.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([outcome, entries]) => ({
        outcome,
        count: entries.length,
        examples: entries.slice(0, MAX_SKIPPED_EXAMPLES_PER_CLASS),
      })),
  };
}

function finalizeDeathSweepReport(report: DeathSweepReport): DeathSweepReport {
  report.skippedSummary = summarizeDeathSweepSkipped(report.skipped);
  return report;
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

function attemptOwnership(attempt: StartAttemptRecord): 'owned' | 'dead' | 'reused' | 'unknown' {
  const identity = attempt.state === 'PREPARED' ? attempt.owner.process : attempt.process;
  if (!identity || identity.evidence === 'unavailable' || identity.startToken === null) return 'unknown';
  return verifyPidOwnership({ pid: identity.pid, startToken: identity.startToken });
}

function attemptCas(attempt: StartAttemptRecord) {
  return {
    flowId: attempt.flowId,
    revision: attempt.revision,
    planDigest: attempt.planDigest,
    generation: attempt.generation,
    attemptId: attempt.attemptId,
    ownerNonce: attempt.owner.ownerNonce,
  };
}

/**
 * Sweep every flow with durable state: live-claiming flows whose recorded pid
 * is dead receive a durable RUN_FAILED closure. Fail-soft per flow — one bad
 * record never aborts the sweep (the EISDIR/expire-sweep lesson).
 */
export function sweepDeadDetachedRuns(projectRoot: string): DeathSweepReport {
  const report: DeathSweepReport = {
    scanned: 0,
    closed: [],
    skipped: [],
    skippedSummary: { total: 0, classes: [] },
  };
  const coordinator = getRunFlowCoordinator(projectRoot);

  let flowIds: string[] = [];
  try {
    flowIds = coordinator.listFlows();
  } catch (err) {
    debugLog('run-flow-death-sweep:list', err);
    return finalizeDeathSweepReport(report);
  }

  for (const flowId of flowIds) {
    report.scanned += 1;
    try {
      let context = coordinator.getFlow(flowId);
      if (!LIVE_RUN_STATES.has(context.state)) continue;

      const attempt = loadLatestStartAttempt(projectRoot, flowId);
      if (attempt) {
        if (attempt.state === 'ADMITTED' && attempt.handle && context.state === 'STARTING') {
          coordinator.recordRunStarted({
            handle: attempt.handle,
            commandId: `run-started-attempt-${attempt.attemptId}`,
          });
          context = coordinator.getFlow(flowId);
          report.skipped.push({
            flowId,
            outcome: 'reconciled-admitted',
            detail: `ADMITTED attempt ${attempt.attemptId} repaired RUN_STARTED publication`,
          });
        }

        if (isTerminalStartAttemptState(attempt.state)) {
          if (LIVE_RUN_STATES.has(context.state)) {
            const detail = attempt.settlement?.detail
              ?? `start attempt ${attempt.attemptId} settled ${attempt.state}`;
            coordinator.recordRunFailure({
              flowId,
              error: detail,
              commandId: `attempt-terminal-reconcile-${attempt.attemptId}`,
            });
            report.closed.push({ flowId, outcome: 'closed-dead', detail });
          }
          continue;
        }

        const ownership = attemptOwnership(attempt);
        const identity = attempt.state === 'PREPARED' ? attempt.owner.process : attempt.process;
        if (ownership === 'owned') {
          report.skipped.push({
            flowId,
            outcome: 'alive',
            detail: `attempt ${attempt.attemptId} process ${identity!.pid} owned`,
          });
          continue;
        }
        if (ownership === 'unknown') {
          report.skipped.push({
            flowId,
            outcome: 'ownership-unknown',
            detail: `attempt ${attempt.attemptId} process ownership unavailable — fail-closed`,
          });
          continue;
        }

        const settledAt = new Date().toISOString();
        const settlement = settleStartAttempt(projectRoot, {
          ...attemptCas(attempt),
          settlement: {
            state: 'FAILED',
            code: ownership === 'dead' ? 'START_PROCESS_DEAD' : 'START_PROCESS_REUSED',
            detail: `start attempt process is ${ownership}`,
            settledAt,
          },
          authority: {
            kind: attempt.state === 'PREPARED' ? 'preparer-recovery' : 'process-recovery',
            observedOwnership: ownership,
            observedAt: settledAt,
          },
        }).attempt;
        const detail = settlement.settlement!.detail!;
        coordinator.recordRunFailure({
          flowId,
          error: detail,
          commandId: `attempt-death-sweep-${attempt.attemptId}`,
        });
        report.closed.push({ flowId, outcome: 'closed-dead', detail });
        continue;
      }

      const handleRecord = loadRunHandle(projectRoot, flowId);
      const pid = handleRecord?.pid;
      if (typeof pid !== 'number') {
        // Pre-698 record (no pid) — liveness is UNKNOWN; an honest sweep
        // never guesses a kill. Reported, not closed.
        report.skipped.push({
          flowId,
          outcome: 'run-handle-ownership-unknown',
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

  return finalizeDeathSweepReport(report);
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
  classification:
    | 'dead-run-handle'
    | 'unverifiable-run-handle'
    | 'stale-start-attempt'
    | 'handleless-logless-legacy-flow-artifact';
  /** The durable closure this entry gets (or would get, in a dry-run):
   *  'failed' = RUN_FAILED fold; 'cancelled' = FLOW_ABORTED fold — the only
   *  closure a LEGACY flow (empty event log) can fold, since RUN_FAILED
   *  requires a STARTING/DETACHED_RUNNING event-log state to fold from. */
  closedAs: 'failed' | 'cancelled' | 'archived';
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
  /** Handle-less and event-log-less legacy projections handled at this seam. */
  legacyArtifacts: LegacyFlowArtifactSweepReport;
}

export interface LegacyFlowArtifactInventoryEntry {
  flowId: string;
  classification: 'handleless-logless-legacy-flow-artifact';
  sourceFiles: string[];
  archivedFiles: string[];
  manifestPath?: string;
}

export interface LegacyFlowArtifactSweepReport {
  scanned: number;
  candidates: LegacyFlowArtifactInventoryEntry[];
  applied: boolean;
}

export interface LegacyFlowArtifactSweepOptions {
  /** Owner approval. False is a strictly read-only inventory. */
  apply: boolean;
}

const LEGACY_PROJECTION_SUFFIXES = ['.snapshot.jsonl', '.plan.jsonl'] as const;

/**
 * Inventory legacy JSONL projections which have neither execution handle nor
 * event log. With explicit approval, move (never delete) those projections to
 * the archive and publish a manifest beside them. Canonical/modern records and
 * every flow carrying a handle are hermetic to this operation.
 */
export function sweepLegacyFlowArtifacts(
  projectRoot: string,
  opts: LegacyFlowArtifactSweepOptions,
): LegacyFlowArtifactSweepReport {
  const coordinator = getRunFlowCoordinator(projectRoot);
  const storeDir = join(projectRoot, '.deckent', 'runtime', 'run-flow-store');
  // Gate-uyumu (lint-sprint-archive-writers): src kodu `.deckent/archive`
  // legacy-ad-alanına YENİ içerik yazamaz — taşıma hedefi runtime-owned
  // quarantine'dir; kalıcı arşive terfi ayrı owner-onaylı disposition işidir.
  const archiveRoot = join(projectRoot, '.deckent', 'runtime', 'run-flow-legacy-artifacts');
  const names = existsSync(storeDir) ? readdirSync(storeDir).sort() : [];
  let flowIds: string[] = [];
  try {
    flowIds = coordinator.listFlows();
  } catch (error) {
    debugLog('run-flow-legacy-artifact-sweep:list', error);
    return { scanned: 0, candidates: [], applied: opts.apply };
  }

  const report: LegacyFlowArtifactSweepReport = {
    scanned: flowIds.length,
    candidates: [],
    applied: opts.apply,
  };
  for (const flowId of flowIds.sort()) {
    try {
      if (loadRunHandle(projectRoot, flowId) !== undefined) continue;
      if (readFlowEvents(projectRoot, flowId).length > 0) continue;
      const sourceFiles = LEGACY_PROJECTION_SUFFIXES
        .map((suffix) => `${flowId}${suffix}`)
        .filter((name) => names.includes(name));
      if (sourceFiles.length === 0) continue;

      const entry: LegacyFlowArtifactInventoryEntry = {
        flowId,
        classification: 'handleless-logless-legacy-flow-artifact',
        sourceFiles: sourceFiles.map((name) => join(storeDir, name)),
        archivedFiles: [],
      };
      if (opts.apply) {
        const destination = join(archiveRoot, encodeURIComponent(flowId));
        mkdirSync(destination, { recursive: true });
        for (const name of sourceFiles) {
          const sourcePath = join(storeDir, name);
          const archivedPath = join(destination, name);
          renameSync(sourcePath, archivedPath);
          entry.archivedFiles.push(archivedPath);
        }
        entry.manifestPath = join(destination, 'manifest.json');
        writeFileSync(entry.manifestPath, `${JSON.stringify({
          schemaVersion: 1,
          classification: entry.classification,
          flowId,
          archivedAt: new Date().toISOString(),
          files: entry.archivedFiles,
        }, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
      }
      report.candidates.push(entry);
    } catch (error) {
      debugLog('run-flow-legacy-artifact-sweep:flow', `${flowId}: ${error}`);
    }
  }
  return report;
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
  const legacyArtifacts = sweepLegacyFlowArtifacts(projectRoot, { apply: opts.apply });
  const report: StaleRunSweepReport = {
    scanned: 0,
    dead: [],
    unverifiable: [],
    skipped: [],
    applied: opts.apply,
    legacyArtifacts,
  };
  const legacyArtifactFlowIds = new Set(
    legacyArtifacts.candidates.map((entry) => entry.flowId),
  );
  report.unverifiable.push(...legacyArtifacts.candidates.map((entry) => ({
    flowId: entry.flowId,
    detail: opts.apply
      ? `legacy flow artifact moved to archive with manifest ${entry.manifestPath ?? 'unavailable'}`
      : `handle-less and event-log-less legacy flow artifact; ${entry.sourceFiles.length} file(s) would be archived`,
    classification: entry.classification,
    closedAs: 'archived' as const,
  })));
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
      if (legacyArtifactFlowIds.has(flowId)) continue;
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
        const attempt = loadLatestStartAttempt(projectRoot, flowId);
        if (attempt === undefined) {
          // The state itself is the only claim: neither durable start record
          // exists, so there is no process identity to reconcile.
          report.skipped.push({
            flowId,
            outcome: 'no-pid-record',
            detail: 'no run-handle or start-attempt record — start never recorded, left untouched',
          });
          continue;
        }

        if (isTerminalStartAttemptState(attempt.state)) {
          report.skipped.push({
            flowId,
            outcome: 'start-attempt-terminal',
            detail: `start attempt ${attempt.attemptId} is already ${attempt.state}; left for read-path reconciliation`,
          });
          continue;
        }

        const ownership = attemptOwnership(attempt);
        const identity = attempt.state === 'PREPARED' ? attempt.owner.process : attempt.process;
        if (ownership === 'owned') {
          report.skipped.push({
            flowId,
            outcome: 'start-attempt-alive',
            detail: `start attempt ${attempt.attemptId} process ${identity!.pid} owned`,
          });
          continue;
        }
        if (ownership === 'unknown') {
          report.skipped.push({
            flowId,
            outcome: 'start-attempt-ownership-unknown',
            detail: `start attempt ${attempt.attemptId} process ownership unavailable — fail-closed`,
          });
          continue;
        }

        const detail = `start attempt ${attempt.attemptId} process is ${ownership} (state was ${context.state})`;
        if (opts.apply) {
          const settledAt = new Date().toISOString();
          settleStartAttempt(projectRoot, {
            ...attemptCas(attempt),
            settlement: {
              state: 'FAILED',
              code: ownership === 'dead' ? 'START_PROCESS_DEAD' : 'START_PROCESS_REUSED',
              detail: `start attempt process is ${ownership}`,
              settledAt,
            },
            authority: {
              kind: attempt.state === 'PREPARED' ? 'preparer-recovery' : 'process-recovery',
              observedOwnership: ownership,
              observedAt: settledAt,
            },
          });
          coordinator.abortFlow({
            flowId,
            reason: `${detail}; closed by operator stale-run sweep`,
            commandId: `stale-attempt-sweep-${attempt.attemptId}`,
          });
        }
        report.unverifiable.push({
          flowId,
          detail,
          pid: identity?.pid,
          classification: 'stale-start-attempt',
          closedAs: 'cancelled',
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
        report.unverifiable.push({
          flowId,
          detail,
          classification: 'unverifiable-run-handle',
          closedAs: 'cancelled',
        });
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
        report.dead.push({
          flowId,
          detail: closure.error,
          pid,
          classification: 'dead-run-handle',
          closedAs: 'failed',
        });
      } else {
        if (opts.apply) {
          coordinator.abortFlow({
            flowId,
            reason: `${closure.error}; legacy record (no event fold) — closed as cancelled by operator stale-run sweep`,
            commandId: closure.commandId,
          });
        }
        report.dead.push({
          flowId,
          detail: closure.error,
          pid,
          classification: 'dead-run-handle',
          closedAs: 'cancelled',
        });
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
