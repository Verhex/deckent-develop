// ─── Output Command ─────────────────────────────────────────────────────────
// `npx deckent output <taskId>` — per-worker output streaming command.
// Reads from .deckent/sprint-NNN-outputs/task-NNN.out (file-based, no live poll).
// Supports --tail N (last N lines) and --follow (live file poll via setInterval).

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { DECKENT_DIR, TASKS_DIR } from '../../core/constants.js';
import type { OpenTaskSettlementProjectionResult } from '../../core/task-settlement-authority.js';
import { resolveTenant } from '../../core/tenant-context.js';
import { validateTaskId } from '../../core/validators.js';
import { print } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getCurrentSprintId } from '../../monitor/sprint-state.js';
import { getLanguage, getMessage } from '../helpers/messages.js';
import {
  formatTaskSettlementProjection,
  settlementProjectionDto,
} from './task-settlement.js';
import { cliContractMessage, bindArgumentDescriptions, renderContractHelp } from '../helpers/message-catalog/cli-run.js';

interface OutputOpts {
  tail?: string;
  follow?: boolean;
  sprintId?: string;
  json?: boolean;
}

export interface OutputCommandDeps {
  readonly resolveProjectRootFn?: () => string;
  readonly openTaskSettlementProjection?: (
    projectRoot: string,
  ) => OpenTaskSettlementProjectionResult;
}

export interface OutputSettlementDto
  extends ReturnType<typeof settlementProjectionDto> {
  readonly taskId: string;
}

function loadOutputSettlement(
  root: string,
  taskId: string,
  deps: OutputCommandDeps,
): OutputSettlementDto | null {
  if (!deps.openTaskSettlementProjection) return null;
  let rawStatus = 'UNKNOWN';
  let tenantId = resolveTenant(root).tenantId;
  const taskPath = join(root, TASKS_DIR, `task-${taskId}.json`);
  if (existsSync(taskPath)) {
    try {
      const task = JSON.parse(readFileSync(taskPath, 'utf-8')) as {
        id?: unknown;
        status?: unknown;
        actor?: { tenantId?: unknown };
      };
      if (task.id === taskId && typeof task.status === 'string') {
        rawStatus = task.status;
        if (typeof task.actor?.tenantId === 'string') {
          tenantId = resolveTenant(root, { tenantId: task.actor.tenantId }).tenantId;
        }
      }
    } catch {
      // Corrupt task JSON cannot override the honest UNKNOWN raw state.
    }
  }
  const opened = deps.openTaskSettlementProjection(root);
  try {
    return {
      taskId,
      ...settlementProjectionDto(
        opened.projectTaskExecutionState(taskId, rawStatus, tenantId),
      ),
    };
  } finally {
    opened.close();
  }
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
  try {
    validateTaskId(taskId);
  } catch {
    return null;
  }
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

export function registerOutput(
  program: Command,
  deps: OutputCommandDeps = {},
): void {
  const helpLang = getLanguage(undefined);
  bindArgumentDescriptions(program.command('output <taskId>'), helpLang, { taskId: 'cliContract.output.arg.taskId' })
    .description(getMessage('cli.output.desc', helpLang))
    .option('--tail <n>', cliContractMessage('cliContract.output.opt.tail', helpLang), '50')
    .option('--follow', cliContractMessage('cliContract.output.opt.follow', helpLang))
    .option('--sprint-id <sprintId>', cliContractMessage('cliContract.output.opt.sprint_id', helpLang))
    .option('--json', cliContractMessage('cliContract.output.opt.json', helpLang))
    .addHelpText('after', renderContractHelp('output', helpLang))
    .action((taskId: string, opts: OutputOpts) => {
      const root = (deps.resolveProjectRootFn ?? resolveProjectRoot)();
      const lang = getLanguage(undefined);
      try {
        validateTaskId(taskId);
      } catch {
        // Rejected id: no payload exists, so --json leaves stdout empty and the
        // diagnosis goes to stderr (exit code unchanged).
        const invalid = getMessage('output.invalid_task_id', lang, { taskId });
        if (opts.json) process.stderr.write(`${invalid}\n`);
        else print(invalid);
        process.exitCode = 1;
        return;
      }
      const tailN = parseInt(opts.tail ?? '50', 10);
      const sprintId = opts.sprintId;
      const settlement = loadOutputSettlement(root, taskId, deps);
      const filePath = resolveOutputPath(root, taskId, sprintId);

      if (!filePath) {
        // Previously `opts.json && settlement`: with --json and no settlement the
        // run fell through to the three human hint lines. The `settlement` key stays
        // optional exactly as in --follow mode, so the document shape is unchanged.
        if (opts.json) {
          print(JSON.stringify({ lines: [], ...(settlement ? { settlement } : {}) }, null, 2));
          process.exitCode = 1;
          return;
        }
        const sprint = sprintId ?? getCurrentSprintId(root) ?? 'current sprint';
        print(`No output found for task ${taskId} in ${sprint}.`);
        print(`Output files are written to: .deckent/<sprint>-outputs/task-<id>.out`);
        print(`The worker must have completed at least one output flush.`);
        if (settlement) {
          print(formatTaskSettlementProjection({
            rawStatus: settlement.rawStatus,
            effectiveStatus: settlement.effectiveStatus,
            receiptRef: settlement.receiptRef ?? undefined,
            evidenceRefs: settlement.evidenceRefs,
            reasonCode: settlement.reasonCode,
          }, lang));
        }
        process.exitCode = 1;
        return;
      }

      if (!opts.follow) {
        // One-shot read
        const lines = readTailLines(filePath, tailN);
        if (opts.json) {
          print(JSON.stringify({ lines, ...(settlement ? { settlement } : {}) }, null, 2));
        } else {
          print(formatLines(lines, !!opts.json));
          if (settlement) {
            print(formatTaskSettlementProjection({
              rawStatus: settlement.rawStatus,
              effectiveStatus: settlement.effectiveStatus,
              receiptRef: settlement.receiptRef ?? undefined,
              evidenceRefs: settlement.evidenceRefs,
              reasonCode: settlement.reasonCode,
            }, lang));
          }
        }
        return;
      }

      // --follow mode: poll every 2s and print new lines
      let lastSize = 0;
      let lastSettlementFingerprint = '';

      const render = (): void => {
        try {
          const stat = statSync(filePath);
          const currentSettlement = loadOutputSettlement(root, taskId, deps);
          const settlementFingerprint = currentSettlement
            ? JSON.stringify(currentSettlement)
            : '';
          const outputChanged = stat.size !== lastSize;
          const settlementChanged = settlementFingerprint !== lastSettlementFingerprint;
          if (!outputChanged && !settlementChanged) return;

          const content = readFileSync(filePath, 'utf-8');
          const allLines = content.split('\n');

          if (lastSize === 0) {
            // First render — show tail N lines
            const initial = tailN > 0 ? allLines.slice(-tailN) : allLines;
            print(opts.json
              ? JSON.stringify({
                  lines: initial,
                  ...(currentSettlement ? { settlement: currentSettlement } : {}),
                }, null, 2)
              : initial.join('\n'));
          } else if (outputChanged) {
            // Subsequent renders — show newly added lines
            const newContent = content.slice(lastSize);
            const newLines = newContent.split('\n').filter(l => l.length > 0);
            if (newLines.length > 0) {
              print(opts.json
                ? JSON.stringify({
                    lines: newLines,
                    ...(currentSettlement ? { settlement: currentSettlement } : {}),
                  }, null, 2)
                : newLines.join('\n'));
            }
          }
          if (!opts.json && currentSettlement && settlementChanged) {
            print(formatTaskSettlementProjection({
              rawStatus: currentSettlement.rawStatus,
              effectiveStatus: currentSettlement.effectiveStatus,
              receiptRef: currentSettlement.receiptRef ?? undefined,
              evidenceRefs: currentSettlement.evidenceRefs,
              reasonCode: currentSettlement.reasonCode,
            }, lang));
          } else if (
            opts.json
            && currentSettlement
            && settlementChanged
            && !outputChanged
          ) {
            print(JSON.stringify({ lines: [], settlement: currentSettlement }, null, 2));
          }

          lastSize = stat.size;
          lastSettlementFingerprint = settlementFingerprint;
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
