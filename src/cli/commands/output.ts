// ─── Output Command ─────────────────────────────────────────────────────────
// `npx deckent output <taskId>` — per-worker output streaming command.
// Reads from .deckent/sprint-NNN-outputs/task-NNN.out (file-based, no live poll).
// Supports --tail N (last N lines) and --follow (live file poll via setInterval).

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { DECKENT_DIR } from '../../core/constants.js';
import { print } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getCurrentSprintId } from '../../monitor/sprint-state.js';

interface OutputOpts {
  tail?: string;
  follow?: boolean;
  sprintId?: string;
  json?: boolean;
}

/**
 * Resolve the output file path for a given taskId and sprintId.
 * Returns null if not found.
 */
export function resolveOutputPath(
  root: string,
  taskId: string,
  sprintId?: string,
): string | null {
  const sprint = sprintId ?? getCurrentSprintId(root) ?? 'sprint-unknown';
  const outputDir = join(root, DECKENT_DIR, `${sprint}-outputs`);
  const filePath = join(outputDir, `task-${taskId}.out`);
  return existsSync(filePath) ? filePath : null;
}

/**
 * Read last N lines from a file.
 * If n <= 0 returns all lines.
 */
function readTailLines(filePath: string, n: number): string[] {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    if (n > 0 && lines.length > n) {
      return lines.slice(-n);
    }
    return lines;
  } catch {
    return [];
  }
}

/**
 * Format output lines for display.
 */
function formatLines(lines: string[], json: boolean): string {
  if (json) {
    return JSON.stringify({ lines }, null, 2);
  }
  return lines.join('\n');
}

export function registerOutput(program: Command): void {
  program
    .command('output <taskId>')
    .description('Show captured output for a specific worker task')
    .option('--tail <n>', 'Show last N lines (default: 50)', '50')
    .option('--follow', 'Follow output file (poll every 2 seconds)')
    .option('--sprint-id <sprintId>', 'Sprint ID to read from (defaults to current sprint)')
    .option('--json', 'Output raw JSON')
    .action((taskId: string, opts: OutputOpts) => {
      const root = resolveProjectRoot();
      const tailN = parseInt(opts.tail ?? '50', 10);
      const sprintId = opts.sprintId;

      const filePath = resolveOutputPath(root, taskId, sprintId);

      if (!filePath) {
        const sprint = sprintId ?? getCurrentSprintId(root) ?? 'current sprint';
        print(`No output found for task ${taskId} in ${sprint}.`);
        print(`Output files are written to: .deckent/<sprint>-outputs/task-<id>.out`);
        print(`The worker must have completed at least one output flush.`);
        process.exitCode = 1;
        return;
      }

      if (!opts.follow) {
        // One-shot read
        const lines = readTailLines(filePath, tailN);
        print(formatLines(lines, !!opts.json));
        return;
      }

      // --follow mode: poll every 2s and print new lines
      let lastSize = 0;

      const render = (): void => {
        try {
          const stat = statSync(filePath);
          if (stat.size === lastSize) return; // no new data

          const content = readFileSync(filePath, 'utf-8');
          const allLines = content.split('\n');

          if (lastSize === 0) {
            // First render — show tail N lines
            const initial = tailN > 0 ? allLines.slice(-tailN) : allLines;
            print(opts.json ? JSON.stringify({ lines: initial }, null, 2) : initial.join('\n'));
          } else {
            // Subsequent renders — show newly added lines
            const newContent = content.slice(lastSize);
            const newLines = newContent.split('\n').filter(l => l.length > 0);
            if (newLines.length > 0) {
              print(opts.json ? JSON.stringify({ lines: newLines }, null, 2) : newLines.join('\n'));
            }
          }

          lastSize = stat.size;
        } catch {
          // File may have been rotated; ignore
        }
      };

      render(); // initial output

      const timer = setInterval(render, 2_000);

      const cleanup = (): void => {
        clearInterval(timer);
        process.exit(0);
      };

      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);
    });
}

// Export for use without registering (e.g., in tests)
export { readTailLines, formatLines };
