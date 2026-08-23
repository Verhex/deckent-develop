import type { Command } from 'commander';

import {
  discoverSprintArchiveIds,
  reconcileSprintArchive,
  verifySprintArchive,
  type SprintArchiveReconcileReport,
} from '../../core/sprint-archive.js';
import { getLangFromConfig } from '../helpers/config-reader.js';
import { getMessage } from '../helpers/messages.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';

interface ArchiveSelectionOptions {
  readonly sprint?: string;
  readonly all?: boolean;
  readonly json?: boolean;
}

interface ArchiveReconcileOptions extends ArchiveSelectionOptions {
  readonly apply?: boolean;
  readonly retireLegacy?: boolean;
}

function selectedSprintIds(root: string, options: ArchiveSelectionOptions): readonly string[] {
  if (options.sprint && options.all) throw new Error('ARCHIVE_SELECTION_CONFLICT');
  if (options.sprint) return [options.sprint];
  if (options.all) return discoverSprintArchiveIds(root);
  throw new Error('ARCHIVE_SELECTION_REQUIRED');
}

function printReconcileReport(
  report: SprintArchiveReconcileReport,
  lang: string,
): void {
  print(getMessage('archive.report', lang, {
    sprintId: report.sprintId,
    mode: report.applied ? getMessage('archive.mode.apply', lang) : getMessage('archive.mode.dry_run', lang),
    artifacts: String(report.manifest.artifactCount),
    bytes: String(report.manifest.totalBytes),
    published: String(report.published),
    deduplicated: String(report.deduplicated),
    retired: String(report.retired),
    conflicts: String(report.conflicts),
    failures: String(report.failures.length),
  }));
}

function reportSelectionError(error: unknown, lang: string): void {
  const code = error instanceof Error ? error.message : String(error);
  const key = code === 'ARCHIVE_SELECTION_CONFLICT'
    ? 'archive.error.selection_conflict'
    : 'archive.error.selection_required';
  printError(getMessage(key, lang));
  process.exitCode = 2;
}

export function registerArchive(program: Command): void {
  const archive = program
    .command('archive')
    .description(getMessage('archive.description', getLangFromConfig(resolveProjectRoot())));

  archive
    .command('inspect')
    .description(getMessage('archive.inspect.description', getLangFromConfig(resolveProjectRoot())))
    .option('--sprint <id>', getMessage('archive.option.sprint', getLangFromConfig(resolveProjectRoot())))
    .option('--all', getMessage('archive.option.all', getLangFromConfig(resolveProjectRoot())))
    .option('--json', getMessage('archive.option.json', getLangFromConfig(resolveProjectRoot())))
    .action((options: ArchiveSelectionOptions) => {
      const root = resolveProjectRoot();
      const lang = getLangFromConfig(root);
      try {
        const reports = selectedSprintIds(root, options)
          .map(sprintId => reconcileSprintArchive(root, sprintId));
        if (options.json) print(JSON.stringify(reports, null, 2));
        else reports.forEach(report => printReconcileReport(report, lang));
      } catch (error) {
        reportSelectionError(error, lang);
      }
    });

  archive
    .command('reconcile')
    .description(getMessage('archive.reconcile.description', getLangFromConfig(resolveProjectRoot())))
    .option('--sprint <id>', getMessage('archive.option.sprint', getLangFromConfig(resolveProjectRoot())))
    .option('--all', getMessage('archive.option.all', getLangFromConfig(resolveProjectRoot())))
    .option('--apply', getMessage('archive.option.apply', getLangFromConfig(resolveProjectRoot())))
    .option('--retire-legacy', getMessage('archive.option.retire_legacy', getLangFromConfig(resolveProjectRoot())))
    .option('--json', getMessage('archive.option.json', getLangFromConfig(resolveProjectRoot())))
    .action((options: ArchiveReconcileOptions) => {
      const root = resolveProjectRoot();
      const lang = getLangFromConfig(root);
      if (options.retireLegacy && !options.apply) {
        printError(getMessage('archive.error.retire_requires_apply', lang));
        process.exitCode = 2;
        return;
      }
      try {
        const reports = selectedSprintIds(root, options).map(sprintId => reconcileSprintArchive(
          root,
          sprintId,
          {
            apply: options.apply === true,
            retireLegacySources: options.retireLegacy === true,
            indexMemory: options.apply === true,
          },
        ));
        if (options.json) print(JSON.stringify(reports, null, 2));
        else reports.forEach(report => printReconcileReport(report, lang));
        if (reports.some(report => report.failures.length > 0)) process.exitCode = 1;
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('ARCHIVE_SELECTION_')) {
          reportSelectionError(error, lang);
          return;
        }
        printError(getMessage('archive.error.reconcile_failed', lang, {
          error: error instanceof Error ? error.message : String(error),
        }));
        process.exitCode = 1;
      }
    });

  archive
    .command('verify')
    .description(getMessage('archive.verify.description', getLangFromConfig(resolveProjectRoot())))
    .option('--sprint <id>', getMessage('archive.option.sprint', getLangFromConfig(resolveProjectRoot())))
    .option('--all', getMessage('archive.option.all', getLangFromConfig(resolveProjectRoot())))
    .option('--json', getMessage('archive.option.json', getLangFromConfig(resolveProjectRoot())))
    .action((options: ArchiveSelectionOptions) => {
      const root = resolveProjectRoot();
      const lang = getLangFromConfig(root);
      try {
        const reports = selectedSprintIds(root, options)
          .map(sprintId => verifySprintArchive(root, sprintId));
        if (options.json) print(JSON.stringify(reports, null, 2));
        else for (const report of reports) {
          print(getMessage(report.ok ? 'archive.verify.ok' : 'archive.verify.failed', lang, {
            sprintId: report.sprintId,
            checked: String(report.checked),
            missing: String(report.missing.length),
            mismatched: String(report.mismatched.length),
            untracked: String(report.untracked.length),
          }));
        }
        if (reports.some(report => !report.ok)) process.exitCode = 1;
      } catch (error) {
        reportSelectionError(error, lang);
      }
    });
}
