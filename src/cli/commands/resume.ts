// ═══ Resume Command ═══════════════════════════════════════════════════
// Resume a sprint from a saved checkpoint.
// Reads durable checkpoint authority, reconciles interrupted work, and resumes
// only the task set proven safe for re-dispatch.

import {
  existsSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { Option, type Command } from 'commander';

import { loadConfig } from '../../core/config.js';
import type { ResolvedConfig } from '../../core/config-types.js';
import { bootstrapProviders } from '../../core/provider.js';
import { applyWorkerExecutionBudgetPolicy } from '../../core/execution-plan-digest.js';
import { runSprint } from '../../orchestra/brain.js';
import { terminalizeCompletedCheckpointRun } from '../../orchestra/completed-checkpoint-terminalizer.js';
import {
  readCheckpoint, hasCheckpoint,
  detectStaleWorkers,
  deriveResumeDisposition,
  resetInterruptedWorkersToPending,
  hasValidResult,
  buildPreplannedResumeSprint,
  type IsCheckpointExactTask,
  type RevalidateCheckpointExactTerminalAuthority,
} from '../../orchestra/sprint-checkpoint.js';
import { clearSprintState, readSprintState } from '../../orchestra/sprint-utils.js';
import { SprintStatus, TaskStatus, type Sprint } from '../../core/types.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import {
  DASHBOARD_FILE,
  DECKENT_DIR,
  SPRINT_PAUSE_STATE_FILE,
  SPRINT_STATE_FILE,
  TASKS_DIR,
} from '../../core/constants.js';
import { getMessage, getLanguage } from '../helpers/messages.js';
import { detectLang } from '../helpers/i18n.js';
import {
  clearProviderExecutionHolds,
  readProviderExecutionHolds,
  restoreProviderExecutionHolds,
  type ProviderExecutionHold,
} from '../../core/provider-execution-hold.js';
import { readCanonicalRunStatus } from '../../core/run-status-authority.js';
import {
  createRecoveryResumeFailedOutcome,
  createRecoveryResumeOutcome,
  writeRecoveryResumeOutcome,
  type RecoveryResumeOutcome,
} from '../../core/recovery-resume-outcome.js';
import { DeckentError } from '../../core/errors.js';
import { cliContractMessage, bindArgumentDescriptions } from '../helpers/message-catalog/cli-run.js';

// ─── Register ───────────────────────────────────────────────────────

export function clearMatchingPauseAuthority(projectRoot: string, sprintId: string): boolean {
  return beginPauseAuthorityResume(projectRoot, sprintId).ok;
}

export interface PauseAuthorityLease {
  readonly path: string;
  readonly content: string;
  readonly dashboardPath: string;
  readonly dashboardContent: string | null;
  readonly sprintStatePath: string;
  readonly sprintStateContent: string | null;
  readonly projectRoot: string;
  readonly sprintId: string;
  readonly providerHolds: readonly ProviderExecutionHold[];
}

export function beginPauseAuthorityResume(
  projectRoot: string,
  sprintId: string,
): { ok: true; lease: PauseAuthorityLease | null } | { ok: false; lease: null } {
  const path = join(projectRoot, SPRINT_PAUSE_STATE_FILE);
  if (!existsSync(path)) return { ok: true, lease: null };
  const dashboardPath = join(projectRoot, DASHBOARD_FILE);
  const sprintStatePath = join(projectRoot, SPRINT_STATE_FILE);
  let content: string | null = null;
  let dashboardContent: string | null = null;
  let sprintStateContent: string | null = null;
  let providerHolds: readonly ProviderExecutionHold[] = [];
  try {
    content = readFileSync(path, 'utf-8');
    const state = JSON.parse(content) as { sprintId?: unknown };
    if (state.sprintId !== sprintId) return { ok: false, lease: null };
    dashboardContent = existsSync(dashboardPath) ? readFileSync(dashboardPath, 'utf-8') : null;
    sprintStateContent = existsSync(sprintStatePath) ? readFileSync(sprintStatePath, 'utf-8') : null;
    providerHolds = readProviderExecutionHolds(projectRoot, sprintId);
    unlinkSync(path);
    if (existsSync(path)) return { ok: false, lease: null };
    clearProviderExecutionHolds(projectRoot, sprintId);
    if (readProviderExecutionHolds(projectRoot, sprintId).length > 0) {
      writeFileSync(path, content, 'utf-8');
      return { ok: false, lease: null };
    }
    return {
      ok: true,
      lease: {
        path,
        content,
        dashboardPath,
        dashboardContent,
        sprintStatePath,
        sprintStateContent,
        projectRoot,
        sprintId,
        providerHolds,
      },
    };
  } catch {
    try {
      if (content !== null && !existsSync(path)) writeFileSync(path, content, 'utf-8');
      restoreProviderExecutionHolds(projectRoot, sprintId, providerHolds);
    } catch {
      // Caller receives ok=false and reports the authority transition failure.
    }
    return { ok: false, lease: null };
  }
}

export function restorePauseAuthority(lease: PauseAuthorityLease | null): boolean {
  if (!lease) return true;
  try {
    restoreProviderExecutionHolds(lease.projectRoot, lease.sprintId, lease.providerHolds);
    // Never overwrite a newer pause authority produced by the resumed run.
    if (existsSync(lease.path)) return true;
    writeFileSync(lease.path, lease.content, 'utf-8');
    if (lease.sprintStateContent !== null) {
      writeFileSync(lease.sprintStatePath, lease.sprintStateContent, 'utf-8');
    }
    if (lease.dashboardContent !== null) {
      writeFileSync(lease.dashboardPath, lease.dashboardContent, 'utf-8');
    }
    return existsSync(lease.path)
      && (lease.sprintStateContent === null || existsSync(lease.sprintStatePath))
      && (lease.dashboardContent === null || existsSync(lease.dashboardPath));
  } catch {
    return false;
  }
}

/**
 * Re-authorize every task that recovery is about to dispatch against the
 * current owner-authored execution-budget policy, then durably persist the
 * exact snapshot consumed by SPAWN. Dynamic FIX tasks are created after PLAN,
 * so their first-run budget is normally attached by runFixPhase; a checkpoint
 * resume enters the ordinary SPAWN path instead and must perform the same
 * authorization explicitly.
 *
 * Validation is completed for the whole set before any task file is replaced.
 * A HOLD leaves the canonical PAUSED authority intact and performs no writes.
 */
export function authorizePreplannedResumeTasks(
  projectRoot: string,
  sprint: Sprint,
  config: ResolvedConfig,
): void {
  const pendingTasks = sprint.tasks.filter(task => task.status === TaskStatus.PENDING);
  const policies = applyWorkerExecutionBudgetPolicy(
    pendingTasks,
    config.execution_budget,
    config.worker_provider,
  );
  const heldIndex = policies.findIndex(policy => policy.state === 'hold');
  if (heldIndex >= 0) {
    const task = pendingTasks[heldIndex]!;
    const policy = policies[heldIndex]!;
    throw new DeckentError('E_RESUME_EXECUTION_BUDGET_HOLD', 
      `RESUME_EXECUTION_BUDGET_HOLD:${task.id}:${policy.reasonCode ?? 'unknown'}:${policy.profileRef}`,
    );
  }

  for (const task of pendingTasks) {
    const taskPath = join(projectRoot, TASKS_DIR, `task-${task.id}.json`);
    const tmpPath = `${taskPath}.resume-budget.${process.pid}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(task, null, 2), 'utf-8');
    renameSync(tmpPath, taskPath);
  }
}

/** Remove only the stale PLANNING projection left by a failed resume spawn. */
export function clearFailedResumePlanningState(projectRoot: string, sprintId: string): void {
  const state = readSprintState(projectRoot);
  if (state?.sprintId === sprintId && state.status === SprintStatus.PLANNING) {
    clearSprintState(projectRoot);
  }
}

function publishResumeOutcome(
  projectRoot: string,
  sprintId: string,
  observedStatus: string | null,
  outcomeFile: string | undefined,
  reason?: string,
): RecoveryResumeOutcome {
  const authority = readCanonicalRunStatus(projectRoot, { sprintIdHint: sprintId });
  const outcome = createRecoveryResumeOutcome({
    sprintId,
    observedStatus,
    authority,
    reason,
  });
  if (outcomeFile) writeRecoveryResumeOutcome(projectRoot, outcomeFile, outcome);
  return outcome;
}

function publishResumeFailure(
  projectRoot: string,
  sprintId: string,
  observedStatus: string | null,
  outcomeFile: string | undefined,
  reason: string,
): RecoveryResumeOutcome {
  const outcome = createRecoveryResumeFailedOutcome({
    sprintId,
    observedStatus,
    authority: readCanonicalRunStatus(projectRoot, { sprintIdHint: sprintId }),
    reason,
  });
  if (outcomeFile) writeRecoveryResumeOutcome(projectRoot, outcomeFile, outcome);
  return outcome;
}

function printResumeOutcome(outcome: RecoveryResumeOutcome, lang: string): void {
  if (outcome.outcome === 'completed') {
    print(getMessage('resume.completed', lang));
    print(getMessage('resume.retro_hint', lang));
  } else if (outcome.outcome === 'resumed-paused') {
    print(getMessage('resume.outcome_paused', lang, {
      recoveryCommand: outcome.nextAuthority.recoveryCommand ?? '-',
      finalizeCommand: outcome.nextAuthority.finalizeCommand ?? '-',
    }));
  } else if (outcome.outcome === 'resumed-running') {
    print(getMessage('resume.outcome_running', lang));
  } else if (outcome.outcome === 'aborted') {
    print(getMessage('resume.outcome_aborted', lang));
  } else {
    printError(getMessage('resume.outcome_failed', lang, {
      reason: outcome.reason ?? 'unknown',
    }));
  }
  process.exitCode = outcome.exitCode;
}

export interface ResumeExactTerminalAuthorityDependencies {
  readonly revalidateExactTerminalAuthority?: RevalidateCheckpointExactTerminalAuthority;
  readonly isExactTask?: IsCheckpointExactTask;
  readonly resolveExactTerminalAuthorityRevalidator?: (
    projectRoot: string,
  ) => RevalidateCheckpointExactTerminalAuthority;
  readonly resolveIsExactTask?: (projectRoot: string) => IsCheckpointExactTask;
}

export function registerResume(
  program: Command,
  exactDependencies: ResumeExactTerminalAuthorityDependencies = {},
): void {
  const helpLang = getLanguage(undefined);
  const command = bindArgumentDescriptions(program.command('resume <sprintId>'), helpLang, { sprintId: 'cliContract.resume.arg.sprintId' })
    .description(getMessage('cli.resume.desc', helpLang))
    .option('--auto-approve', cliContractMessage('cliContract.resume.opt.auto_approve', helpLang), false)
    .option('--dry-run', cliContractMessage('cliContract.resume.opt.dry_run', helpLang), false)
    .option('--force-scope', getMessage('recover.force_scope_option', helpLang), false)
    .option('--root <path>', cliContractMessage('cliContract.resume.opt.root', helpLang))
    .addOption(new Option('--test-mode', cliContractMessage('cliContract.resume.opt.test_mode', helpLang)).hideHelp())
    .addOption(new Option('--outcome-file <path>', cliContractMessage('cliContract.resume.opt.outcome_file', helpLang)).hideHelp());
  command.action(async (sprintId: string, opts: { autoApprove: boolean; dryRun: boolean; forceScope: boolean; testMode?: boolean; root?: string; outcomeFile?: string }) => {
      const projectRoot = opts.root ?? resolveProjectRoot();
      const lang = detectLang(projectRoot);
      const revalidateExactTerminalAuthority =
        exactDependencies.revalidateExactTerminalAuthority
        ?? exactDependencies.resolveExactTerminalAuthorityRevalidator?.(projectRoot);
      const isExactTask = exactDependencies.isExactTask
        ?? exactDependencies.resolveIsExactTask?.(projectRoot);

      if (!/^sprint-\d+$/.test(sprintId)) {
        printError(getMessage('resume.invalid_sprint_id', lang, { sprintId }));
        process.exit(1);
      }

      // Validate checkpoint exists
      if (!hasCheckpoint(projectRoot, sprintId)) {
        printError(getMessage('resume.checkpoint_missing', lang, { sprintId }));
        printError(getMessage('resume.status_hint', lang));
        process.exit(1);
      }

      const checkpoint = readCheckpoint(projectRoot, sprintId);
      if (!checkpoint) {
        printError(getMessage('resume.checkpoint_unreadable', lang, { sprintId }));
        process.exit(1);
      }

      print(getMessage('resume.header', lang, {
        sprintId: checkpoint.sprintId,
        checkpoint: String(checkpoint.checkpointNumber),
      }));
      print(getMessage('resume.summary', lang, {
        timestamp: checkpoint.timestamp,
        phase: String(checkpoint.brainPhase),
        completed: String(checkpoint.completedTasks.length),
        pending: String(checkpoint.pendingTasks.length),
        active: String(checkpoint.activeWorkers.length),
      }));

      // Detect stale heartbeats (>5min) among active workers
      const staleWorkers = detectStaleWorkers(projectRoot, checkpoint);
      if (staleWorkers.length > 0) {
        print(getMessage('resume.stale_header', lang, { count: String(staleWorkers.length) }));
        for (const sw of staleWorkers) {
          const ageMin = Math.round(sw.ageMs / 60_000);
          print(getMessage('resume.stale_item', lang, {
            workerId: sw.workerId,
            taskId: sw.taskId,
            reason: sw.reason,
            age: String(ageMin),
          }));
        }
        print(getMessage('resume.stale_action', lang));
      }

      // Which "active" workers actually completed (wrote a VALID .result before
      // the crash)? Those are terminal — reported, never respawned.
      const completedDuringCrash = checkpoint.activeWorkers
        .map(w => w.taskId)
        .filter(taskId => hasValidResult(projectRoot, taskId));
      if (completedDuringCrash.length > 0) {
        print(getMessage('resume.crash_completed', lang, { taskIds: completedDuringCrash.join(', ') }));
      }

      // Single source of truth for both dry-run and real resume. Pending or
      // invalid Docker settlement is neither success nor permission to redrive.
      const resumeDisposition = deriveResumeDisposition(projectRoot, checkpoint);
      if (resumeDisposition.parkedSettlements.length > 0) {
        const parkedTasks = resumeDisposition.parkedSettlements
          .map(item => `${item.taskId} (${item.state})`)
          .join(', ');
        const hasInvalidSettlement = resumeDisposition.parkedSettlements
          .some(item => item.state === 'invalid-settlement');
        if (!opts.dryRun && !hasInvalidSettlement) {
          let config;
          try {
            config = await loadConfig(projectRoot);
          } catch (e) {
            printError(getMessage('resume.config_failed', lang, { error: e instanceof Error ? e.message : String(e) }));
            process.exit(1);
          }
          const existingState = readSprintState(projectRoot);
          if (existingState?.sprintId !== checkpoint.sprintId) {
            printError(getMessage('resume.settlement_state_required', lang, {
              sprintId: checkpoint.sprintId,
            }));
            process.exitCode = 1;
            return;
          }
          print(getMessage('resume.settlement_reconciling', lang, { tasks: parkedTasks }));
          const pauseLease = beginPauseAuthorityResume(projectRoot, checkpoint.sprintId);
          if (!pauseLease.ok) {
            printError(getMessage('resume.pause_clear_failed', lang, { sprintId: checkpoint.sprintId }));
            process.exitCode = 1;
            return;
          }
          try {
            const bootstrap = await bootstrapProviders(config, projectRoot);
            // Preserve checkpoint, sprint-state and task artifacts. runSprint
            // acquires project leadership, reconciles host-owned backend attempts
            // before restore, and must never preplan/reset parked task IDs.
            const resumed = await runSprint(projectRoot, config, {
              connector: bootstrap.connector,
              autoApprove: opts.autoApprove,
              acknowledgeScopePaths: opts.forceScope,
            });
            if (resumed.status === SprintStatus.PAUSED && !restorePauseAuthority(pauseLease.lease)) {
              printError(getMessage('resume.pause_restore_failed', lang, { sprintId: checkpoint.sprintId }));
            }
            const outcome = publishResumeOutcome(
              projectRoot,
              checkpoint.sprintId,
              String(resumed.status),
              opts.outcomeFile,
            );
            printResumeOutcome(outcome, lang);
            return;
          } catch (e) {
            if (!restorePauseAuthority(pauseLease.lease)) {
              printError(getMessage('resume.pause_restore_failed', lang, { sprintId: checkpoint.sprintId }));
            }
            const reason = e instanceof Error ? e.message : String(e);
            publishResumeFailure(projectRoot, checkpoint.sprintId, null, opts.outcomeFile, reason);
            printError(getMessage('resume.failed', lang, { error: reason }));
            process.exitCode = 1;
            return;
          }
        }
        printError(getMessage('resume.settlement_hold', lang, {
          tasks: parkedTasks,
        }));
        process.exitCode = 1;
        return;
      }
      const resumableIds = resumeDisposition.resumableIds;
      const resumableCount = resumableIds.length;

      if (opts.dryRun) {
        print(getMessage('resume.dry_run', lang, {
          count: String(resumableCount),
          taskIds: resumableIds.join(', ') || getMessage('resume.none', lang),
        }));
        return;
      }

      if (resumableCount === 0) {
        const executionMode = checkpoint.executionMode ?? (opts.testMode ? 'test' : undefined);
        if (!executionMode) {
          print(getMessage('resume.nothing', lang));
          print(getMessage('resume.retro_hint', lang));
          return;
        }
        try {
          const config = await loadConfig(projectRoot);
          print(getMessage('resume.terminalizing', lang, {
            sprintId: checkpoint.sprintId,
            mode: executionMode,
          }));
          const terminalized = isExactTask
            ? await terminalizeCompletedCheckpointRun(
                projectRoot,
                checkpoint,
                config,
                executionMode,
                revalidateExactTerminalAuthority,
                isExactTask,
              )
            : revalidateExactTerminalAuthority
              ? await terminalizeCompletedCheckpointRun(
                  projectRoot,
                  checkpoint,
                  config,
                  executionMode,
                  revalidateExactTerminalAuthority,
                )
              : await terminalizeCompletedCheckpointRun(
                projectRoot,
                checkpoint,
                config,
                executionMode,
              );
          const outcome = publishResumeOutcome(
            projectRoot,
            checkpoint.sprintId,
            String(terminalized.status),
            opts.outcomeFile,
          );
          printResumeOutcome(outcome, lang);
          return;
        } catch (e) {
          const reason = e instanceof Error ? e.message : String(e);
          publishResumeFailure(projectRoot, checkpoint.sprintId, null, opts.outcomeFile, reason);
          printError(getMessage('resume.failed', lang, { error: reason }));
          process.exitCode = 1;
          return;
        }
      }

      // Load config and run sprint with resume context
      let config;
      try {
        config = await loadConfig(projectRoot);
      } catch (e) {
        printError(getMessage('resume.config_failed', lang, { error: e instanceof Error ? e.message : String(e) }));
        process.exit(1);
      }

      // Kill stale workers before respawn
      if (staleWorkers.length > 0) {
        print(getMessage('resume.stale_killing', lang));
        for (const sw of staleWorkers) {
          try {
            // Try tmux kill first, then spawn backend kill
            const { killWorker } = await import('../../orchestra/tmux.js');
            killWorker(sw.taskId);
          } catch {
            // Worker may already be dead (SIGKILL scenario) — expected
          }
        }
      }

      // Commit the exact dry-run set before deleting any forensic artefact.
      // A task write or checkpoint rename failure is a hard HOLD: spawning from
      // partially committed durable state would make duplicate execution possible.
      const reset = resetInterruptedWorkersToPending(projectRoot, checkpoint, resumableIds);
      if (!reset.committed) {
        printError(getMessage('resume.commit_failed', lang, { error: reset.error ?? 'unknown' }));
        process.exit(1);
      }
      const resumeCheckpoint = reset.checkpoint;
      if (reset.resetIds.length > 0) {
        print(getMessage('resume.reset_tasks', lang, {
          count: String(reset.resetIds.length),
          taskIds: reset.resetIds.join(', '),
        }));
      }

      // ─── RESUME-RACE fix (Sprint 268 — live bug from sprint-267 recovery) ──
      // Before re-entering runSprint, reset stale worker artifacts for every
      // task that will be respawned (every non-completed candidate). Without
      // this, the previous run's leftovers poison the new run:
      //   • a stale `.hb` makes isTaskDispatched (sprint-phases.ts) treat the
      //     task as already dispatched, and checkWorkerLiveness (worker-
      //     liveness.ts L3, 90s mtime window) sees no fresh signal → the
      //     collector classifies the respawn as crashed (honest-gate
      //     `worker-crashed-no-result`) before the new worker even starts;
      //   • a stale `.partial-result` crash marker can be promoted to `.result`
      //     by the docker backend (spawn-backend-docker.ts) and read as the
      //     NEW run's outcome → sprint races to RETRO/CLEANUP with synthetic
      //     NO_GOs instead of giving the respawn a chance.
      //
      // Strategy: DELETE the stale `.hb` rather than resetting its timestamp
      // to now. A missing heartbeat is the honest "not yet spawned" state —
      // the respawned worker writes its own fresh heartbeat at startup, while
      // a timestamp-reset file would fake liveness for a worker that does not
      // exist yet (worker-liveness L3 freshness + isTaskDispatched hb signal),
      // masking real spawn failures. Tasks with a `.result` on disk are
      // completed — their artifacts are left untouched. The --dry-run path
      // returns earlier, so dry-run never deletes anything.
      const respawnCandidateIds = new Set<string>(resumableIds);
      let resetArtifacts = 0;
      for (const taskId of respawnCandidateIds) {
        const resultPath = join(projectRoot, TASKS_DIR, `task-${taskId}.result`);
        if (existsSync(resultPath)) continue; // completed — do not touch
        const stalePaths = [
          join(projectRoot, TASKS_DIR, `task-${taskId}.hb`),
          join(projectRoot, TASKS_DIR, `task-${taskId}.partial-result`),
        ];
        for (const stalePath of stalePaths) {
          if (!existsSync(stalePath)) continue;
          try {
            unlinkSync(stalePath);
            resetArtifacts++;
          } catch {
            printError(getMessage('resume.artifact_cleanup_failed', lang, { path: stalePath }));
            process.exit(1);
          }
        }
      }
      if (resetArtifacts > 0) {
        print(getMessage('resume.reset_artifacts', lang, { count: String(resetArtifacts) }));
      }

      print(getMessage('resume.spawning', lang, { count: String(resumableCount) }));

      let preplannedSprint;
      try {
        preplannedSprint = isExactTask
          ? buildPreplannedResumeSprint(
              projectRoot,
              resumeCheckpoint,
              resumableIds,
              revalidateExactTerminalAuthority,
              isExactTask,
            )
          : revalidateExactTerminalAuthority
            ? buildPreplannedResumeSprint(
                projectRoot,
                resumeCheckpoint,
                resumableIds,
                revalidateExactTerminalAuthority,
              )
            : buildPreplannedResumeSprint(projectRoot, resumeCheckpoint, resumableIds);
        authorizePreplannedResumeTasks(projectRoot, preplannedSprint, config);
      } catch (e) {
        printError(getMessage('resume.preplanned_failed', lang, { error: e instanceof Error ? e.message : String(e) }));
        process.exit(1);
      }

      // An old state file for this sprint triggers controller's legacy
      // resume-evaluate branch, which intentionally skips SPAWN/EXECUTE. Remove
      // only the target sprint's stale state and verify the removal. A different
      // sprint is an active ownership conflict and must HOLD.
      const existingState = readSprintState(projectRoot);
      if (existingState && existingState.sprintId !== checkpoint.sprintId) {
        printError(getMessage('resume.other_sprint_active', lang, { sprintId: existingState.sprintId }));
        process.exit(1);
      }
      const pauseLease = beginPauseAuthorityResume(projectRoot, checkpoint.sprintId);
      if (!pauseLease.ok) {
        printError(getMessage('resume.pause_clear_failed', lang, { sprintId: checkpoint.sprintId }));
        process.exit(1);
      }
      if (existingState?.sprintId === checkpoint.sprintId) {
        clearSprintState(projectRoot);
        if (readSprintState(projectRoot)?.sprintId === checkpoint.sprintId) {
          restorePauseAuthority(pauseLease.lease);
          printError(getMessage('resume.state_clear_failed', lang, { sprintId: checkpoint.sprintId }));
          process.exit(1);
        }
      }

      try {
        const bootstrap = await bootstrapProviders(config, projectRoot);
        const resumed = await runSprint(projectRoot, config, {
          connector: bootstrap.connector,
          autoApprove: opts.autoApprove,
          acknowledgeScopePaths: opts.forceScope,
          preplannedSprint,
        });
        if (resumed.status === SprintStatus.PAUSED) {
          if (!restorePauseAuthority(pauseLease.lease)) {
            printError(getMessage('resume.pause_restore_failed', lang, { sprintId: checkpoint.sprintId }));
          }
          clearFailedResumePlanningState(projectRoot, checkpoint.sprintId);
        }
        const outcome = publishResumeOutcome(
          projectRoot,
          checkpoint.sprintId,
          String(resumed.status),
          opts.outcomeFile,
        );
        printResumeOutcome(outcome, lang);
        return;
      } catch (e) {
        if (!restorePauseAuthority(pauseLease.lease)) {
          printError(getMessage('resume.pause_restore_failed', lang, { sprintId: checkpoint.sprintId }));
        }
        clearFailedResumePlanningState(projectRoot, checkpoint.sprintId);
        const reason = e instanceof Error ? e.message : String(e);
        publishResumeFailure(projectRoot, checkpoint.sprintId, null, opts.outcomeFile, reason);
        printError(getMessage('resume.failed', lang, { error: reason }));
        process.exitCode = 1;
        return;
      }
    });
}

// ─── Helper: List available checkpoints ─────────────────────────────

/**
 * List sprint IDs that have saved checkpoints in the given project root.
 */
export function listCheckpointedSprints(projectRoot: string): string[] {
  const deckentDir = join(projectRoot, DECKENT_DIR);
  if (!existsSync(deckentDir)) return [];
  try {
    return readdirSync(deckentDir)
      .filter(f => f.endsWith('-checkpoint.json'))
      .map(f => f.replace('-checkpoint.json', ''));
  } catch {
    return [];
  }
}
