// ═══ Resume Command ═══════════════════════════════════════════════════
// Resume a sprint from a saved checkpoint.
// MVP: reads checkpoint, respawns pending tasks, skips completed ones.
// Sprint 140+ will add mid-worker resume and heartbeat daemon integration.

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';

import { loadConfig } from '../../core/config.js';
import { runSprint } from '../../orchestra/brain.js';
import {
  readCheckpoint, hasCheckpoint,
  detectStaleWorkers,
} from '../../orchestra/sprint-checkpoint.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { DECKENT_DIR, TASKS_DIR } from '../../core/constants.js';

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

      // Validate checkpoint exists
      if (!hasCheckpoint(projectRoot, sprintId)) {
        printError(`No checkpoint found for sprint "${sprintId}".`);
        printError(`Run "deckent status" to see available sprints.`);
        process.exit(1);
      }

      const checkpoint = readCheckpoint(projectRoot, sprintId);
      if (!checkpoint) {
        printError(`Checkpoint for sprint "${sprintId}" is malformed or unreadable.`);
        process.exit(1);
      }

      print(`\nResuming sprint ${checkpoint.sprintId} from checkpoint #${checkpoint.checkpointNumber}`);
      print(`  Written: ${checkpoint.timestamp}`);
      print(`  Phase:   ${checkpoint.brainPhase}`);
      print(`  Completed tasks: ${checkpoint.completedTasks.length}`);
      print(`  Pending tasks:   ${checkpoint.pendingTasks.length}`);
      print(`  Active workers:  ${checkpoint.activeWorkers.length}`);

      // Detect stale heartbeats (>5min) among active workers
      const staleWorkers = detectStaleWorkers(projectRoot, checkpoint);
      if (staleWorkers.length > 0) {
        print(`\n  ⚠ Stale workers detected: ${staleWorkers.length}`);
        for (const sw of staleWorkers) {
          const ageMin = Math.round(sw.ageMs / 60_000);
          print(`    - ${sw.workerId} (task ${sw.taskId}): ${sw.reason}, age ${ageMin}min`);
        }
        print('  Stale workers will be killed and their tasks respawned.');
      }

      // Check which "active" workers actually completed (wrote .result before crash)
      const completedDuringCrash: string[] = [];
      for (const worker of checkpoint.activeWorkers) {
        const resultPath = join(projectRoot, TASKS_DIR, `task-${worker.taskId}.result`);
        if (existsSync(resultPath)) {
          completedDuringCrash.push(worker.taskId);
        }
      }
      if (completedDuringCrash.length > 0) {
        print(`\n  ✓ Tasks completed before crash: ${completedDuringCrash.join(', ')}`);
      }

      // Calculate actual resumable count
      const allCompletedIds = new Set([
        ...checkpoint.completedTasks,
        ...completedDuringCrash,
      ]);
      const resumableCount = checkpoint.pendingTasks.length +
        staleWorkers.filter(w => !allCompletedIds.has(w.taskId)).length;

      if (opts.dryRun) {
        print(`\n[dry-run] Would resume ${resumableCount} tasks. No workers spawned.`);
        return;
      }

      if (resumableCount === 0 && checkpoint.pendingTasks.length === 0) {
        print('\nAll tasks already completed — nothing to resume.');
        print(`Run "deckent retro" to see the sprint retrospective.`);
        return;
      }

      // Load config and run sprint with resume context
      let config;
      try {
        config = await loadConfig(projectRoot);
      } catch (e) {
        printError(`Failed to load config: ${e instanceof Error ? e.message : String(e)}`);
        process.exit(1);
      }

      // Kill stale workers before respawn
      if (staleWorkers.length > 0) {
        print('\nKilling stale workers...');
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

      print(`\nSpawning ${resumableCount} pending tasks...\n`);

      try {
        await runSprint(projectRoot, config, {
          autoApprove: opts.autoApprove,
        });
        print('\nSprint resumed and completed.');
        print('Run "deckent retro" to see the retrospective.');
      } catch (e) {
        printError(`Sprint resume failed: ${e instanceof Error ? e.message : String(e)}`);
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
