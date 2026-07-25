// ═══ Resume Command ═══════════════════════════════════════════════════
// Resume a sprint from a saved checkpoint.
// MVP: reads checkpoint, respawns pending tasks, skips completed ones.
// Sprint 140+ will add mid-worker resume and heartbeat daemon integration.

import { existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';

import { loadConfig } from '../../core/config.js';
import { runSprint } from '../../orchestra/brain.js';
import {
  readCheckpoint, hasCheckpoint,
  detectStaleWorkers,
  deriveResumeDisposition,
  resetInterruptedWorkersToPending,
  hasValidResult,
  buildPreplannedResumeSprint,
} from '../../orchestra/sprint-checkpoint.js';
import { clearSprintState, readSprintState } from '../../orchestra/sprint-utils.js';
import { SprintStatus } from '../../core/types.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { DECKENT_DIR, TASKS_DIR } from '../../core/constants.js';
import { getMessage } from '../helpers/messages.js';
import { detectLang } from '../helpers/i18n.js';

// ─── Register ───────────────────────────────────────────────────────

export function registerResume(program: Command): void {
  program
    .command('resume <sprintId>')
    .description('Resume a sprint from its latest checkpoint')
    .option('--auto-approve', 'Auto-approve all worker actions (skip permission prompts)', false)
    .option('--dry-run', 'Show what would be resumed without actually running', false)
    .option('--root <path>', 'Project root directory (defaults to cwd)')
    .action(async (sprintId: string, opts: { autoApprove: boolean; dryRun: boolean; root?: string }) => {
      const projectRoot = opts.root ?? resolveProjectRoot();
      const lang = detectLang(projectRoot);

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
        printError(getMessage('resume.settlement_hold', lang, {
          tasks: resumeDisposition.parkedSettlements
            .map(item => `${item.taskId} (${item.state})`)
            .join(', '),
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
        print(getMessage('resume.nothing', lang));
        print(getMessage('resume.retro_hint', lang));
        return;
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
        preplannedSprint = buildPreplannedResumeSprint(projectRoot, resumeCheckpoint, resumableIds);
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
      if (existingState?.sprintId === checkpoint.sprintId) {
        clearSprintState(projectRoot);
        if (readSprintState(projectRoot)?.sprintId === checkpoint.sprintId) {
          printError(getMessage('resume.state_clear_failed', lang, { sprintId: checkpoint.sprintId }));
          process.exit(1);
        }
      }

      try {
        const resumed = await runSprint(projectRoot, config, {
          autoApprove: opts.autoApprove,
          preplannedSprint,
        });
        if (resumed.status !== SprintStatus.COMPLETE) {
          printError(getMessage('resume.not_complete', lang, { status: String(resumed.status) }));
          process.exitCode = 1;
          return;
        }
        print(getMessage('resume.completed', lang));
        print(getMessage('resume.retro_hint', lang));
      } catch (e) {
        printError(getMessage('resume.failed', lang, { error: e instanceof Error ? e.message : String(e) }));
        process.exit(1);
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
