// ═══ deckent runs — CLI run-flow inbox + operator stale-run sweep (F-3) ══════
//
// CLI-side parity for the REPL's `/runs` inbox (same collect + render, one
// source of truth: run-flow-inbox.ts). Plus the operator sweep the pure-reader
// inbox deliberately does not do: `--close-stale` classifies live-claiming
// flows (dead pid / unverifiable pre-pid record) and — only with an explicit
// `--yes` — writes the honest durable closure per class (FAILED for a proven
// death, CANCELLED for an operator-consented unverifiable record). Without
// `--yes` it is a dry-run: report only, zero writes.

import { join } from 'node:path';
import type { Command } from 'commander';
import {
  collectInboxRows, buildInboxLines, buildInboxLabels,
  resolveInboxSelection, collectRunDetail, buildRunDetailLines,
} from '../repl/run-flow-inbox.js';
import { scanJobRecords } from '../repl/run-completion-watch.js';
import { sweepStaleRuns } from '../../orchestra/run-flow-death-sweep.js';
import type { StaleRunSweepReport } from '../../orchestra/run-flow-death-sweep.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getMessage } from '../helpers/messages.js';
import { getLangFromConfig } from '../helpers/config-reader.js';

const SHORT_ID_LEN = 8;

/** flowIds whose execution truth is already terminal in the jobs-dir — the
 *  SAME join collectInboxRows displays, handed to the sweep so a provably
 *  finished run is never "closed" as cancelled. */
function jobsTerminalFlowIds(root: string): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const job of scanJobRecords(join(root, '.deckent', 'runtime', 'jobs'))) {
    if (job.flowId) ids.add(job.flowId);
  }
  return ids;
}

/** Render the `--close-stale` report (dry-run or applied) as printable lines. */
export function buildCloseStaleLines(report: StaleRunSweepReport, lang: string): string[] {
  const staleCount = report.dead.length + report.unverifiable.length;
  if (staleCount === 0) return [getMessage('runs.close_stale.none', lang)];

  const header = report.applied
    ? getMessage('runs.close_stale.apply_header', lang, { count: String(staleCount) })
    : getMessage('runs.close_stale.dry_header', lang, { count: String(staleCount) });
  const lines = [header];
  for (const e of report.dead) {
    const key = e.closedAs === 'failed' ? 'runs.close_stale.entry_dead' : 'runs.close_stale.entry_dead_cancelled';
    lines.push(`  ${e.flowId.slice(0, SHORT_ID_LEN)} · ${getMessage(key, lang, { pid: String(e.pid ?? '?') })}`);
  }
  for (const e of report.unverifiable) {
    lines.push(`  ${e.flowId.slice(0, SHORT_ID_LEN)} · ${getMessage('runs.close_stale.entry_unverifiable', lang)}`);
  }
  if (!report.applied) lines.push(getMessage('runs.close_stale.dry_hint', lang));
  return lines;
}

export function registerRuns(program: Command): void {
  program
    .command('runs')
    .description('List run-flows (the multi-flow inbox) — cross-process, read-only')
    .argument('[n]', 'Show run #n in rich detail (the number from the list)')
    .option('--close-stale', 'Classify stale runs (dead process / unverifiable record); dry-run unless --yes')
    .option('--yes', 'With --close-stale: durably close the stale runs (failed/cancelled)')
    .action((n: string | undefined, opts: { closeStale?: boolean; yes?: boolean }) => {
      const root = resolveProjectRoot();
      const lang = getLangFromConfig(root);
      try {
        const labels = buildInboxLabels((key) => getMessage(key, lang));

        if (opts.closeStale) {
          const report = sweepStaleRuns(root, {
            apply: opts.yes === true,
            jobsTerminalFlowIds: jobsTerminalFlowIds(root),
          });
          for (const line of buildCloseStaleLines(report, lang)) print(line);
          print('');
        }

        const rows = collectInboxRows(root);

        // `deckent runs <n>` — rich single-run detail, same numbering as the
        // list (parity with the REPL's `/runs <n>`).
        if (n !== undefined && !opts.closeStale) {
          const selection = resolveInboxSelection(n, rows);
          if (selection.kind === 'detail') {
            for (const line of buildRunDetailLines(collectRunDetail(root, selection.row), labels)) print(line);
            return;
          }
          if (selection.kind === 'not-found') {
            print(labels.notFound.replace('{arg}', selection.arg));
            return;
          }
          // non-numeric arg falls through to the list, mirroring the REPL
        }

        // Always end with the (post-sweep) inbox, so the user sees the honest
        // current list — the same rows the REPL's `/runs` renders.
        for (const line of buildInboxLines(rows, labels)) print(line);
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });
}
