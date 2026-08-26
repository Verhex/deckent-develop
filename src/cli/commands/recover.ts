import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { Command } from 'commander';
import { restoreFromSnapshot } from '../../orchestra/task-restoration.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getMessage, getLanguage } from '../helpers/messages.js';
import { detectLang } from '../helpers/i18n.js';
import { readCanonicalRunStatus } from '../../core/run-status-authority.js';
import {
  readRecoveryResumeOutcome,
  recoveryResumeOutcomePath,
  removeRecoveryResumeOutcome,
  type RecoveryResumeOutcome,
} from '../../core/recovery-resume-outcome.js';
import {
  readSprintRecoverySettlementIdentity,
  runSprintRecoveryOperation,
  SprintRecoveryOperationError,
  type SprintRecoveryReport,
} from '../../orchestra/sprint-recovery-operation.js';
import { DeckentError } from '../../core/errors.js';
import { bindArgumentDescriptions } from '../helpers/message-catalog/cli-run.js';

export interface ResumeRecoveryProcessOptions {
  autoApprove?: boolean;
  dryRun?: boolean;
  acknowledgeScopePaths?: boolean;
  machineReadable?: boolean;
}

export interface ResumeRecoveryProcessResult {
  readonly dryRun: boolean;
  readonly exitCode: number;
  readonly outcome: RecoveryResumeOutcome | null;
}

/**
 * Re-enter the canonical resume command in a fresh process. Recovery owns
 * diagnosis/selection; resume remains the single mutation authority for
 * checkpoint restoration and worker re-dispatch.
 */
export async function runResumeRecoveryProcess(
  root: string,
  sprintId: string,
  opts: ResumeRecoveryProcessOptions,
  runtime: {
    execPath?: string;
    entryPath?: string;
    spawnProcess?: typeof spawn;
  } = {},
  lang = 'en',
): Promise<ResumeRecoveryProcessResult> {
  const authority = readCanonicalRunStatus(root);
  if (
    authority.sprintId !== sprintId
    || !authority.resumable
    || (authority.lifecycle !== 'PAUSED' && authority.lifecycle !== 'ORPHANED')
  ) {
    throw new DeckentError('E_RECOVER_RESUME_AUTHORITY_MISSING', getMessage('recover.resume_authority_missing', lang, { sprintId }));
  }
  const execPath = runtime.execPath ?? process.execPath;
  const entryPath = runtime.entryPath ?? process.argv[1];
  if (!entryPath) throw new DeckentError('E_RECOVER_RESUME_ENTRY_MISSING', getMessage('recover.resume_entry_missing', lang));
  const args = [entryPath, 'resume', sprintId, '--root', root];
  if (opts.autoApprove) args.push('--auto-approve');
  if (opts.dryRun) args.push('--dry-run');
  if (opts.acknowledgeScopePaths) args.push('--force-scope');
  const outcomePath = opts.dryRun
    ? null
    : recoveryResumeOutcomePath(root, randomUUID());
  if (outcomePath) args.push('--outcome-file', outcomePath);
  const spawnProcess = runtime.spawnProcess ?? spawn;
  let childExitCode = 1;
  try {
    childExitCode = await new Promise<number>((resolve, reject) => {
      const child = spawnProcess(execPath, args, {
        cwd: root,
        stdio: opts.machineReadable ? ['inherit', 'ignore', 'ignore'] : 'inherit',
        env: process.env,
        shell: false,
      });
      child.once('error', reject);
      child.once('close', code => resolve(code ?? 1));
    });
    if (!outcomePath) {
      return { dryRun: true, exitCode: childExitCode, outcome: null };
    }
    const outcome = readRecoveryResumeOutcome(root, outcomePath, sprintId);
    if (!outcome || outcome.exitCode !== childExitCode) {
      const authorityAfter = readCanonicalRunStatus(root, { sprintIdHint: sprintId });
      return {
        dryRun: false,
        exitCode: 1,
        outcome: {
          schemaVersion: 1,
          sprintId,
          outcome: 'failed',
          exitCode: 1,
          observedStatus: authorityAfter.status,
          observedAt: new Date().toISOString(),
          reason: !outcome
            ? 'resume-outcome-evidence-missing-or-invalid'
            : `resume-outcome-exit-mismatch:${childExitCode}:${outcome.exitCode}`,
          nextAuthority: {
            lifecycle: authorityAfter.lifecycle,
            resumable: authorityAfter.sprintId === sprintId && authorityAfter.resumable,
            recoveryCommand: authorityAfter.sprintId === sprintId
              ? authorityAfter.recoveryCommand
              : null,
            finalizeCommand: authorityAfter.sprintId === sprintId
              ? authorityAfter.finalizeCommand
              : null,
          },
        },
      };
    }
    return { dryRun: false, exitCode: outcome.exitCode, outcome };
  } finally {
    if (outcomePath) removeRecoveryResumeOutcome(root, outcomePath);
  }
}

function assertCanonicalSprintId(sprintId: string, lang: string): void {
  if (!/^sprint-\d+$/.test(sprintId)) {
    throw new DeckentError('E_RECOVER_INVALID_SPRINT_ID', getMessage('recover.invalid_sprint_id', lang, { sprintId }));
  }
}

export type RecoveryReport = SprintRecoveryReport;

export async function runRecovery(
  root: string,
  sprintId: string,
  opts: { dryRun?: boolean; force?: boolean; skipAudit?: boolean },
  lang: string,
): Promise<RecoveryReport> {
  try {
    const identity = readSprintRecoverySettlementIdentity(root, sprintId);
    return await runSprintRecoveryOperation(root, sprintId, {
      dryRun: opts.dryRun,
      skipAudit: opts.skipAudit,
      ...(!opts.dryRun
        ? {
            approval: {
              approvalRef: opts.force ? 'cli:force' : 'cli:interactive',
              idempotencyKey: `cli:${sprintId}:${identity.generation}:${identity.fenceToken}`,
              identity,
            },
          }
        : {}),
    });
  } catch (error) {
    if (!(error instanceof SprintRecoveryOperationError)) throw error;
    const key = {
      INVALID_SPRINT_ID: 'recover.invalid_sprint_id',
      ACTIVE_AUTHORITY: 'recover.active_authority_refused',
      APPROVAL_REQUIRED: 'recover.approval_required',
      APPROVAL_MISMATCH: 'recover.approval_mismatch',
      SNAPSHOT_REQUIRED: 'recover.snapshot_required',
      ARCHIVE_INCOMPLETE: 'recover.archive_incomplete',
      SETTLEMENT_AUTHORITY_MISSING: 'recover.settlement_authority_missing',
      SETTLEMENT_FAILED: 'recover.settlement_failed',
    }[error.code] ?? 'recover.internal_error';
    throw new DeckentError(`E_RECOVER_${error.code}`, getMessage(key, lang, {
      ...error.details,
      code: error.details.code ?? error.details.reason ?? error.code,
    }));
  }
}

export function registerRecover(program: Command): void {
  const registerLang = getLanguage(undefined);
  bindArgumentDescriptions(program.command('recover <sprint-id>'), registerLang, { 'sprint-id': 'cliContract.recover.arg.sprint_id' })
    .description(getMessage('recover.description', registerLang))
    .option('--dry-run', getMessage('recover.dry_run_option', registerLang))
    .option('--force', getMessage('recover.force_option', registerLang))
    .option('--skip-audit', getMessage('recover.skip_audit_option', registerLang))
    .option('--restore-tasks', getMessage('recover.restore_tasks_option', registerLang))
    .option('--resume', getMessage('recover.resume_option', registerLang))
    .option('--auto-approve', getMessage('recover.auto_approve_option', registerLang), false)
    .option('--force-scope', getMessage('recover.force_scope_option', registerLang), false)
    .option('--json', getMessage('recover.json_option', registerLang))
    .action(async (sprintId: string, opts: { dryRun?: boolean; force?: boolean; skipAudit?: boolean; restoreTasks?: boolean; resume?: boolean; autoApprove?: boolean; forceScope?: boolean; json?: boolean }) => {
      const root = resolveProjectRoot();
      const lang = detectLang(root);

      try {
        assertCanonicalSprintId(sprintId, lang);
        if (opts.dryRun && opts.restoreTasks) {
          throw new DeckentError('E_RECOVER_DRY_RUN_RESTORE_CONFLICT', getMessage('recover.dry_run_restore_conflict', lang));
        }
        if (opts.resume && opts.restoreTasks) {
          throw new DeckentError('E_RECOVER_RESUME_RESTORE_CONFLICT', getMessage('recover.resume_restore_conflict', lang));
        }
        if (opts.resume) {
          const result = await runResumeRecoveryProcess(root, sprintId, {
            autoApprove: opts.autoApprove,
            dryRun: opts.dryRun,
            acknowledgeScopePaths: opts.forceScope,
            machineReadable: opts.json,
          }, {}, lang);
          if (opts.json) {
            print(JSON.stringify(result.outcome ?? {
              schemaVersion: 1,
              sprintId,
              outcome: result.exitCode === 0 ? 'resumed-running' : 'failed',
              exitCode: result.exitCode,
              dryRun: true,
            }));
          }
          if (result.exitCode !== 0) process.exitCode = result.exitCode;
          return;
        }
        if (!opts.dryRun && opts.json && !opts.force) {
          throw new DeckentError('E_RECOVER_JSON_REQUIRES_FORCE', getMessage('recover.json_requires_force', lang));
        }
        if (opts.restoreTasks && !opts.force) {
          throw new DeckentError('E_RECOVER_RESTORE_REQUIRES_FORCE', getMessage('recover.restore_requires_force', lang));
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
            printError(new Error(getMessage('recover.restore_failed', lang, {
              error: result.error ?? getMessage('recover.unknown_error', lang),
              sprintId,
            })));
            process.exitCode = 1;
          }
          return;
        }

        if (opts.json) {
          const report = await runRecovery(root, sprintId, { ...opts, dryRun: opts.dryRun }, lang);
          print(JSON.stringify({
            sprintId,
            dryRun: Boolean(opts.dryRun),
            identity: report.identity,
            auditGate: report.audit.overallGate,
            orphanIpcDirs: report.orphanIpcDirs.length,
            staleLocksCleaned: report.staleLocksCleaned,
            staleSpawnLocksCleaned: report.staleSpawnLocksCleaned,
            taskFilesArchived: report.taskFilesArchived,
            taskFilesPreserved: report.taskFilesPreserved,
            artifactPolicy: report.artifactPolicy,
            remediation: report.remediation,
          }));
          return;
        }

        if (opts.dryRun) {
          print(getMessage('recover.preview_header', lang, { sprintId }));
          print(getMessage('recover.separator', lang));

          const report = await runRecovery(root, sprintId, { ...opts, dryRun: true }, lang);

          if (report.audit.overallGate !== 'SKIPPED') {
            print(getMessage('recover.audit_gate', lang, { gate: report.audit.overallGate }));
          }
          print(getMessage('recover.preview_orphan_ipc', lang, { count: String(report.orphanIpcDirs.length) }));
          print(getMessage('recover.preview_stale_locks', lang, { count: String(report.staleLocksCleaned) }));
          print(getMessage('recover.preview_stale_spawnlocks', lang, { count: String(report.staleSpawnLocksCleaned) }));
          print(getMessage('recover.preview_task_files', lang, { count: String(report.taskFilesArchived) }));
          print(getMessage('recover.checkpoint_disposition', lang, {
            disposition: report.artifactPolicy.checkpoint.disposition,
            digest: report.artifactPolicy.checkpoint.digest ?? '-',
          }));
          if (report.remediation) print(getMessage('recover.paused_remediation', lang, report.remediation));
          print(getMessage('recover.separator', lang));
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

        print(getMessage('recover.separator', lang));
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
        print(getMessage('recover.checkpoint_disposition', lang, {
          disposition: report.artifactPolicy.checkpoint.disposition,
          digest: report.artifactPolicy.checkpoint.digest ?? '-',
        }));
        if (report.remediation) print(getMessage('recover.paused_remediation', lang, report.remediation));
        print(getMessage('recover.separator', lang));
        print(getMessage('recover.complete', lang, { sprintId }));
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });
}
