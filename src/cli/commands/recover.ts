import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { cleanOrphanIpcDirs } from '../../core/orphan-cleaner.js';
import { clearStaleLocks, clearStaleSpawnLocks } from '../../core/file-lock.js';
import { postFinalizeCleanup } from '../../core/orphan-cleaner.js';
import { runSelfAuditGate } from '../../orchestra/sprint-finalizer.js';
import { TASKS_DIR, LOCKS_DIR } from '../../core/constants.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getMessage } from '../helpers/messages.js';
import { detectLang } from '../helpers/i18n.js';

/** 5 minutes — same as orphan-cleaner STALE_LOCK_AGE_MS */
const STALE_LOCK_AGE_MS = 5 * 60 * 1000;

export interface RecoveryReport {
  audit: { overallGate: 'PASS' | 'GATE_FAILURE' | 'SKIPPED' };
  orphanIpcDirs: string[];
  staleLocksCleaned: number;
  staleSpawnLocksCleaned: number;
  taskFilesArchived: number;
  taskFilesPreserved: number;
}

async function runRecovery(
  root: string,
  sprintId: string,
  opts: { dryRun?: boolean; force?: boolean; skipAudit?: boolean },
  lang: string,
): Promise<RecoveryReport> {
  const report: RecoveryReport = {
    audit: { overallGate: 'SKIPPED' },
    orphanIpcDirs: [],
    staleLocksCleaned: 0,
    staleSpawnLocksCleaned: 0,
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
      const spawnLockFiles = readdirSync(locksDir).filter(f => f.endsWith('.spawnlock'));
      for (const f of spawnLockFiles) {
        try {
          const st = statSync(join(locksDir, f));
          if (now - st.mtimeMs > STALE_LOCK_AGE_MS) report.staleSpawnLocksCleaned++;
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
    print(getMessage('recover.warn_ipc_cleanup_failed', lang, { error: String(e) }));
  }

  // Step 3: Clear stale locks (.lock and .spawnlock)
  try {
    report.staleLocksCleaned = clearStaleLocks(root, STALE_LOCK_AGE_MS);
  } catch (e) {
    print(getMessage('recover.warn_lock_cleanup_failed', lang, { error: String(e) }));
  }
  try {
    report.staleSpawnLocksCleaned = clearStaleSpawnLocks(root, STALE_LOCK_AGE_MS);
  } catch (e) {
    print(getMessage('recover.warn_spawn_lock_cleanup_failed', lang, { error: String(e) }));
  }

  // Step 4: Archive terminal task files
  try {
    const cleanupResult = postFinalizeCleanup(root, sprintId);
    report.taskFilesArchived = cleanupResult.archivedFiles.length;
    report.taskFilesPreserved = cleanupResult.preservedFiles.length;
  } catch (e) {
    print(getMessage('recover.warn_task_archive_failed', lang, { error: String(e) }));
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
    .option('--json', 'Output recovery result as JSON')
    .action(async (sprintId: string, opts: { dryRun?: boolean; force?: boolean; skipAudit?: boolean; json?: boolean }) => {
      const root = resolveProjectRoot();
      const lang = detectLang(root);

      try {
        if (opts.json) {
          const report = await runRecovery(root, sprintId, { ...opts, dryRun: opts.dryRun }, lang);
          print(JSON.stringify({
            sprintId,
            dryRun: Boolean(opts.dryRun),
            auditGate: report.audit.overallGate,
            orphanIpcDirs: report.orphanIpcDirs.length,
            staleLocksCleaned: report.staleLocksCleaned,
            staleSpawnLocksCleaned: report.staleSpawnLocksCleaned,
            taskFilesArchived: report.taskFilesArchived,
            taskFilesPreserved: report.taskFilesPreserved,
          }));
          return;
        }

        if (opts.dryRun) {
          print(getMessage('recover.preview_header', lang, { sprintId }));
          print(`  ─────────────────────────────────────────`);

          const report = await runRecovery(root, sprintId, { ...opts, dryRun: true }, lang);

          if (report.audit.overallGate !== 'SKIPPED') {
            print(getMessage('recover.audit_gate', lang, { gate: report.audit.overallGate }));
          }
          print(getMessage('recover.preview_orphan_ipc', lang, { count: String(report.orphanIpcDirs.length) }));
          print(getMessage('recover.preview_stale_locks', lang, { count: String(report.staleLocksCleaned) }));
          print(getMessage('recover.preview_stale_spawnlocks', lang, { count: String(report.staleSpawnLocksCleaned) }));
          print(getMessage('recover.preview_task_files', lang, { count: String(report.taskFilesArchived) }));
          print(`  ─────────────────────────────────────────`);
          print(getMessage('recover.preview_run_to_execute', lang));
          return;
        }

        // Interactive confirmation (unless --force)
        if (!opts.force) {
          print(getMessage('recover.confirm_header', lang, { sprintId }));
          print(getMessage('recover.confirm_remove_ipc', lang));
          print(getMessage('recover.confirm_clear_locks', lang));
          print(getMessage('recover.confirm_archive_tasks', lang));
          print(getMessage('recover.confirm_preserve_active', lang));
          print(getMessage('recover.confirm_hint', lang));

          const readline = await import('node:readline/promises');
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          const answer = await rl.question(getMessage('recover.confirm_prompt', lang));
          rl.close();

          if (answer.toLowerCase() !== 'y') {
            print(getMessage('recover.aborted', lang));
            return;
          }
        }

        print(getMessage('recover.recovering', lang, { sprintId }));
        const report = await runRecovery(root, sprintId, opts, lang);

        print(`  ─────────────────────────────────────────`);
        if (report.audit.overallGate !== 'SKIPPED') {
          print(getMessage('recover.audit_gate', lang, { gate: report.audit.overallGate }));
        }
        print(getMessage('recover.result_orphan_ipc', lang, { count: String(report.orphanIpcDirs.length) }));
        print(getMessage('recover.result_stale_locks', lang, { count: String(report.staleLocksCleaned) }));
        print(getMessage('recover.result_stale_spawnlocks', lang, { count: String(report.staleSpawnLocksCleaned) }));
        print(getMessage('recover.result_task_files', lang, {
          archived: String(report.taskFilesArchived),
          preserved: String(report.taskFilesPreserved),
        }));
        print(`  ─────────────────────────────────────────`);
        print(getMessage('recover.complete', lang, { sprintId }));
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });
}
