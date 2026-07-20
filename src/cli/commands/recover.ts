import { existsSync } from 'node:fs';
import type { Command } from 'commander';
import { postFinalizeCleanup, previewFinalizeCleanup } from '../../core/orphan-cleaner.js';
import { runSelfAuditGate } from '../../orchestra/sprint-finalizer.js';
import { createPreArchiveSnapshot, restoreFromSnapshot, verifySnapshot } from '../../orchestra/task-restoration.js';
import { cleanupCheckpointFiles } from '../../orchestra/sprint-checkpoint.js';
import { clearPid } from '../../orchestra/sprint-pid-manager.js';
import { readSprintState, clearSprintState } from '../../orchestra/sprint-utils.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getMessage } from '../helpers/messages.js';
import { detectLang } from '../helpers/i18n.js';

function assertCanonicalSprintId(sprintId: string): void {
  if (!/^sprint-\d+$/.test(sprintId)) {
    throw new Error(`Invalid sprint id: ${sprintId}`);
  }
}

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
  assertCanonicalSprintId(sprintId);
  const report: RecoveryReport = {
    audit: { overallGate: 'SKIPPED' },
    orphanIpcDirs: [],
    staleLocksCleaned: 0,
    staleSpawnLocksCleaned: 0,
    taskFilesArchived: 0,
    taskFilesPreserved: 0,
  };

  // ─── Dry-run: READ-ONLY preview — zero audit/subprocess, zero bytes ──────
  // No runSelfAuditGate (spawns tsc/vitest), no createPreArchiveSnapshot
  // (spawns tar), no fs mutation. Reports the requested sprint's EXACT
  // archive/preserve set (previewFinalizeCleanup shares postFinalizeCleanup's
  // sprint-scoped classifier). Targeted recovery deliberately does NOT inspect
  // or clean repo-global IPC/lock state.
  if (opts.dryRun) {
    // Sprint-scoped, not a blanket count of every sprint's files.
    const preview = previewFinalizeCleanup(root, sprintId);
    report.taskFilesArchived = preview.archivedFiles.length;
    report.taskFilesPreserved = preview.preservedFiles.length;

    return report;
  }

  // ─── Real recovery (mutating) ────────────────────────────────────────────
  // Step 1: establish and verify the rollback anchor BEFORE any audit/cleanup
  // side effect. A target with task artefacts may never proceed without it.
  const preview = previewFinalizeCleanup(root, sprintId);
  const targetFileCount = preview.archivedFiles.length + preview.preservedFiles.length;
  let snapshotOk = targetFileCount === 0;
  if (targetFileCount > 0) {
    const snapshot = createPreArchiveSnapshot(root, sprintId);
    snapshotOk = snapshot !== null &&
      existsSync(snapshot.hashPath) &&
      verifySnapshot(snapshot.snapshotPath, snapshot.hash);
    if (!snapshotOk) {
      throw new Error(getMessage('recover.snapshot_required', lang, { sprintId }));
    }
  }

  // Step 2: Run audit (unless skipped)
  if (!opts.skipAudit) {
    try {
      const auditResult = await runSelfAuditGate(sprintId, root);
      report.audit = { overallGate: auditResult.overallGate };
    } catch {
      report.audit = { overallGate: 'SKIPPED' };
    }
  }

  // Step 3: Archive terminal task files. PENDING (incl. pending fix) and other
  // active tasks are preserved as independent ids by the shared classifier.
  const cleanupResult = postFinalizeCleanup(root, sprintId, { cleanStaleLocks: false });
  report.taskFilesArchived = cleanupResult.archivedFiles.length;
  report.taskFilesPreserved = cleanupResult.preservedFiles.length;
  if (report.taskFilesArchived !== preview.archivedFiles.length) {
    throw new Error(getMessage('recover.archive_incomplete', lang, {
      expected: String(preview.archivedFiles.length),
      actual: String(report.taskFilesArchived),
    }));
  }

  // Step 4: Clear ONLY the target sprint's stale checkpoint/PID/state metadata,
  // now that the archive evidence is durable. Each helper is sprint-scoped by
  // construction (filename / sprintId match) — no broad `.tasks` delete, and no
  // other sprint's metadata is touched. sprint-state is cleared only when it
  // still names THIS sprint (never clobbers a different active sprint).
  //
  // Guard: only clear once the evidence is genuinely durable — a snapshot was
  // written, OR nothing was archived (no rollback anchor is needed). If files
  // WERE archived but the snapshot failed, the checkpoint/PID/state are retained
  // so the operator keeps a recovery handle instead of losing the anchor.
  if (snapshotOk || report.taskFilesArchived === 0) {
    try { cleanupCheckpointFiles(root, sprintId); } catch { /* best-effort */ }
    try { clearPid(root, sprintId); } catch { /* best-effort */ }
    try {
      const st = readSprintState(root);
      if (st && st.sprintId === sprintId) clearSprintState(root);
    } catch { /* best-effort */ }
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
    .option('--restore-tasks', 'Roll back: restore task files from the pre-archive snapshot instead of cleaning forward (born-562)')
    .option('--json', 'Output recovery result as JSON')
    .action(async (sprintId: string, opts: { dryRun?: boolean; force?: boolean; skipAudit?: boolean; restoreTasks?: boolean; json?: boolean }) => {
      const root = resolveProjectRoot();
      const lang = detectLang(root);

      try {
        assertCanonicalSprintId(sprintId);
        if (opts.dryRun && opts.restoreTasks) {
          throw new Error(getMessage('recover.dry_run_restore_conflict', lang));
        }
        if (!opts.dryRun && opts.json && !opts.force) {
          throw new Error(getMessage('recover.json_requires_force', lang));
        }
        if (opts.restoreTasks && !opts.force) {
          throw new Error(getMessage('recover.restore_requires_force', lang));
        }

        // born-562: rollback path — restore the pre-archive snapshot (createPreArchiveSnapshot
        // writes it in CLEANUP, but nothing consumed it until now). Mutually exclusive with the
        // forward-cleanup flow; returns before any archive/cleanup runs.
        if (opts.restoreTasks) {
          const result = restoreFromSnapshot(root, sprintId);
          if (opts.json) {
            print(JSON.stringify({
              sprintId,
              restoreTasks: true,
              success: result.success,
              restoredFiles: result.restoredFiles.length,
              error: result.error ?? null,
            }));
          } else if (result.success) {
            print(getMessage('recover.restore_success', lang, { count: String(result.restoredFiles.length), sprintId }));
          } else {
            printError(new Error(getMessage('recover.restore_failed', lang, { error: result.error ?? 'unknown', sprintId })));
            process.exitCode = 1;
          }
          return;
        }

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
