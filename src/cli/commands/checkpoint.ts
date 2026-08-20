import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { print, printError, formatTable } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getLanguage, getMessage } from '../helpers/messages.js';

// ─── Types ──────────────────────────────────────────────────────────

interface CheckpointFile {
  phase: string;
  summary: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

// ─── Helpers ────────────────────────────────────────────────────────

function getCheckpointsDir(root: string): string {
  return join(root, '.deckent', 'checkpoints');
}

function listCheckpoints(root: string): Array<{ sprintId: string; phase: string; checkpoint: CheckpointFile; filePath: string }> {
  const dir = getCheckpointsDir(root);
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir).filter(f => f.startsWith('checkpoint-') && f.endsWith('.json'));
  const results: Array<{ sprintId: string; phase: string; checkpoint: CheckpointFile; filePath: string }> = [];

  for (const file of files) {
    const filePath = join(dir, file);
    try {
      const checkpoint = JSON.parse(readFileSync(filePath, 'utf-8')) as CheckpointFile;
      // Parse sprintId and phase from filename: checkpoint-{sprintId}-{phase}.json
      const match = file.match(/^checkpoint-(.+)-(\w+)\.json$/);
      if (match && match[1] && match[2]) {
        results.push({ sprintId: match[1], phase: match[2], checkpoint, filePath });
      }
    } catch {
      // Skip malformed files
    }
  }

  return results;
}

function updateCheckpointStatus(root: string, sprintId: string, phase: string, status: 'approved' | 'rejected'): boolean {
  const dir = getCheckpointsDir(root);
  const filePath = join(dir, `checkpoint-${sprintId}-${phase}.json`);

  if (!existsSync(filePath)) return false;

  try {
    const checkpoint = JSON.parse(readFileSync(filePath, 'utf-8')) as CheckpointFile;
    checkpoint.status = status;
    writeFileSync(filePath, JSON.stringify(checkpoint, null, 2), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

// ─── Registration ───────────────────────────────────────────────────

export function registerCheckpoint(program: Command): void {
  const cmd = program
    .command('checkpoint')
    .description(getMessage('cli.checkpoint.desc', getLanguage(undefined)));

  cmd
    .command('list')
    .description(getMessage('cli.checkpoint.list.desc', getLanguage(undefined)))
    .option('--pending', getMessage('checkpoint.pending_option', getLanguage(undefined)))
    .option('--json', getMessage('checkpoint.json_option', getLanguage(undefined)))
    .option('--lang <code>', getMessage('checkpoint.lang_option', getLanguage(undefined)))
    .action((opts: { pending?: boolean; json?: boolean; lang?: string }) => {
      try {
        const lang = getLanguage(opts.lang);
        const root = resolveProjectRoot();
        let checkpoints = listCheckpoints(root);

        if (opts.pending) {
          checkpoints = checkpoints.filter(c => c.checkpoint.status === 'pending');
        }

        // JSON first: an empty checkpoint list is `[]` on stdout, not the human
        // "no checkpoints" line — the machine surface owes exactly one document.
        if (opts.json) {
          print(JSON.stringify(checkpoints.map(c => ({
            sprintId: c.sprintId,
            phase: c.phase,
            status: c.checkpoint.status,
            summary: c.checkpoint.summary,
            createdAt: c.checkpoint.createdAt,
          })), null, 2));
          return;
        }

        if (checkpoints.length === 0) {
          print(getMessage('checkpoint.list_empty', lang));
          return;
        }

        const headers = [
          getMessage('checkpoint.col_sprint', lang),
          getMessage('checkpoint.col_phase', lang),
          getMessage('checkpoint.col_status', lang),
          getMessage('checkpoint.col_summary', lang),
          getMessage('checkpoint.col_created', lang),
        ];
        const rows = checkpoints.map(c => [
          c.sprintId,
          c.phase,
          c.checkpoint.status,
          c.checkpoint.summary.length > 60
            ? c.checkpoint.summary.slice(0, 57) + '...'
            : c.checkpoint.summary,
          c.checkpoint.createdAt,
        ]);
        print(formatTable(headers, rows));
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  cmd
    .command('approve <sprintId> <phase>')
    .description(getMessage('cli.checkpoint.approve.desc', getLanguage(undefined)))
    .option('--lang <code>', getMessage('checkpoint.lang_option', getLanguage(undefined)))
    .action((sprintId: string, phase: string, opts: { lang?: string }) => {
      try {
        const lang = getLanguage(opts.lang);
        const root = resolveProjectRoot();
        const updated = updateCheckpointStatus(root, sprintId, phase, 'approved');
        if (updated) {
          print(getMessage('checkpoint.approved', lang, { sprintId, phase }));
        } else {
          printError(getMessage('checkpoint.not_found', lang, { sprintId, phase }));
          process.exitCode = 1;
        }
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  cmd
    .command('reject <sprintId> <phase>')
    .description(getMessage('cli.checkpoint.reject.desc', getLanguage(undefined)))
    .option('--lang <code>', getMessage('checkpoint.lang_option', getLanguage(undefined)))
    .action((sprintId: string, phase: string, opts: { lang?: string }) => {
      try {
        const lang = getLanguage(opts.lang);
        const root = resolveProjectRoot();
        const updated = updateCheckpointStatus(root, sprintId, phase, 'rejected');
        if (updated) {
          print(getMessage('checkpoint.rejected', lang, { sprintId, phase }));
        } else {
          printError(getMessage('checkpoint.not_found', lang, { sprintId, phase }));
          process.exitCode = 1;
        }
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });
}
