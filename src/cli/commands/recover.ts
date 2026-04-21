import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { cleanOrphanIpcDirs } from '../../core/orphan-cleaner.js';
import { clearStaleLocks } from '../../core/file-lock.js';
import { postFinalizeCleanup } from '../../core/orphan-cleaner.js';
import { runSelfAuditGate } from '../../orchestra/sprint-finalizer.js';
import { TASKS_DIR, LOCKS_DIR } from '../../core/constants.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';

/** 5 minutes — same as orphan-cleaner STALE_LOCK_AGE_MS */
const STALE_LOCK_AGE_MS = 5 * 60 * 1000;

export interface RecoveryReport {
  audit: { overallGate: 'PASS' | 'GATE_FAILURE' | 'SKIPPED' };
  orphanIpcDirs: string[];
  staleLocksCleaned: number;
  taskFilesArchived: number;
  taskFilesPreserved: number;
}

async function runRecovery(
  root: string,
  sprintId: string,
  opts: { dryRun?: boolean; force?: boolean; skipAudit?: boolean },
): Promise<RecoveryReport> {
  const report: RecoveryReport = {
    audit: { overallGate: 'SKIPPED' },
    orphanIpcDirs: [],
    staleLocksCleaned: 0,
    taskFilesArchived: 0,
    taskFilesPreserved: 0,
  };

  // Step 1: Run audit (unless skipped)
  if (!opts.skipAudit) {
    try {
      const auditResult = await runSelfAuditGate(sprintId, root);
      report.audit = { overallGate: auditResult.overallGate };
    } catch {
      report.audit = { overallGate: 'SKIPPED' };
    }
  }

  if (opts.dryRun) {
    // Preview: count IPC dirs that would be cleaned (list without deleting)
    const deckentDir = join(root, '.deckent');
    if (existsSync(deckentDir)) {
      const ipcPattern = /^sprint-\d+-ipc$/;
      report.orphanIpcDirs = readdirSync(deckentDir).filter(e => ipcPattern.test(e));
    }

    const locksDir = join(root, LOCKS_DIR);
    if (existsSync(locksDir)) {
      const now = Date.now();
      const lockFiles = readdirSync(locksDir).filter(f => f.endsWith('.lock'));
      for (const f of lockFiles) {
        try {
          const st = statSync(join(locksDir, f));
          if (now - st.mtimeMs > STALE_LOCK_AGE_MS) report.staleLocksCleaned++;
        } catch { /* skip */ }
      }
    }

    const tasksDir = join(root, TASKS_DIR);
    if (existsSync(tasksDir)) {
      report.taskFilesArchived = readdirSync(tasksDir).filter(
        f => f.endsWith('.json') || f.endsWith('.result') || f.endsWith('.hb'),
      ).length;
    }

    return report;
  }

  // Step 2: Clean orphan IPC directories (dead PID check)
  try {
    report.orphanIpcDirs = cleanOrphanIpcDirs(root, { checkLivePid: true });
  } catch (e) {
    print(`  Warning: IPC cleanup failed: ${e}`);
  }

  // Step 3: Clear stale locks
  try {
    report.staleLocksCleaned = clearStaleLocks(root, STALE_LOCK_AGE_MS);
  } catch (e) {
    print(`  Warning: Lock cleanup failed: ${e}`);
  }

  // Step 4: Archive terminal task files
  try {
    const cleanupResult = postFinalizeCleanup(root, sprintId);
    report.taskFilesArchived = cleanupResult.archivedFiles.length;
    report.taskFilesPreserved = cleanupResult.preservedFiles.length;
  } catch (e) {
    print(`  Warning: Task archive failed: ${e}`);
  }

  return report;
}

export function registerRecover(program: Command): void {
  program
    .command('recover <sprint-id>')
    .description('Recover from a crashed or stuck sprint (audit + cleanup + archive)')
    .option('--dry-run', 'Preview what would be cleaned without making changes')
    .option('--force', 'Skip interactive confirmation')
    .option('--skip-audit', 'Skip the audit step')
    .action(async (sprintId: string, opts: { dryRun?: boolean; force?: boolean; skipAudit?: boolean }) => {
      const root = resolveProjectRoot();

      try {
        if (opts.dryRun) {
          print(`\n  Recovery preview for ${sprintId} (dry-run):`);
          print(`  ─────────────────────────────────────────`);

          const report = await runRecovery(root, sprintId, { ...opts, dryRun: true });

          if (report.audit.overallGate !== 'SKIPPED') {
            print(`  Audit gate:      ${report.audit.overallGate}`);
          }
          print(`  Orphan IPC dirs: ${report.orphanIpcDirs.length} would be removed`);
          print(`  Stale locks:     ${report.staleLocksCleaned} would be cleared`);
          print(`  Task files:      ${report.taskFilesArchived} would be archived`);
          print(`  ─────────────────────────────────────────`);
          print(`\n  Run without --dry-run to execute.\n`);
          return;
        }

        // Interactive confirmation (unless --force)
        if (!opts.force) {
          print(`\n  ⚠ Recovery will clean up sprint ${sprintId}:`);
          print(`    - Remove orphan IPC directories (dead PIDs only)`);
          print(`    - Clear stale lock files (>5min)`);
          print(`    - Archive terminal task files (DONE/NO_GO)`);
          print(`    - Preserve active tasks (PENDING/EXECUTING)\n`);
          print(`  Use --force to skip this confirmation, or --dry-run to preview.\n`);

          const readline = await import('node:readline/promises');
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          const answer = await rl.question('  Proceed? (y/N) ');
          rl.close();

          if (answer.toLowerCase() !== 'y') {
            print('  Aborted.');
            return;
          }
        }

        print(`\n  Recovering sprint ${sprintId}...`);
        const report = await runRecovery(root, sprintId, opts);

        print(`  ─────────────────────────────────────────`);
        if (report.audit.overallGate !== 'SKIPPED') {
          print(`  Audit gate:      ${report.audit.overallGate}`);
        }
        print(`  Orphan IPC dirs: ${report.orphanIpcDirs.length} removed`);
        print(`  Stale locks:     ${report.staleLocksCleaned} cleared`);
        print(`  Task files:      ${report.taskFilesArchived} archived, ${report.taskFilesPreserved} preserved`);
        print(`  ─────────────────────────────────────────`);
        print(`\n  ✓ Recovery complete. Sprint ${sprintId} is ready for restart.\n`);
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });
}
