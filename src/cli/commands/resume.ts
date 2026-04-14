// ═══ Resume Command ═══════════════════════════════════════════════════
// Resume a sprint from a saved checkpoint.
// MVP: reads checkpoint, respawns pending tasks, skips completed ones.
// Sprint 140+ will add mid-worker resume and heartbeat daemon integration.

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';

import { loadConfig } from '../../core/config.js';
import { runSprint } from '../../orchestra/brain.js';
import { readCheckpoint, hasCheckpoint } from '../../orchestra/sprint-checkpoint.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { DECKENT_DIR } from '../../core/constants.js';

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
      print(`  Active workers:  ${checkpoint.activeWorkers.length} (will be killed before respawn)`);

      if (opts.dryRun) {
        print('\n[dry-run] Would resume with the above state. No workers spawned.');
        return;
      }

      if (checkpoint.pendingTasks.length === 0) {
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

      print('\nSpawning pending tasks...\n');

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
