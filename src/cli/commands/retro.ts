import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { BRAIN_DIR, RETRO_FILE, SPRINTS_DIR } from '../../core/constants.js';
import { print } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';

export interface RichSprintSummary {
  sprintId: string;
  totalTasks: number;
  completed: number;
  noGo: number;
  techDebt: number;
  coverage: string;
  duration: string;
  raw: string;
}

export function parseRetroToRichSummary(content: string): RichSprintSummary {
  const sprintMatch = content.match(/(?:sprint|Sprint)\s*[:#-]?\s*(\S+)/i);

  // Primary: match sprint-reporter.ts format "| Tasks completed | X/Y |"
  const tasksCompletedMatch = content.match(/\|\s*Tasks completed\s*\|\s*(\d+)\s*\/\s*(\d+)\s*\|/i);
  // Legacy format fallbacks
  const totalMatch = content.match(/\|\s*Total Tasks?\s*\|\s*(\d+)\s*\|/i);
  const completedMatch = content.match(/\|\s*Completed\s*\|\s*(\d+)\s*\|/i);

  // Primary: "| NO_GO rate | Z% (A/B) |"
  const noGoRateMatch = content.match(/\|\s*NO_GO rate\s*\|[^|]*\((\d+)\/\d+\)\s*\|/i);
  const noGoMatch = content.match(/\|\s*No-Go\s*\|\s*(\d+)\s*\|/i);

  // Tech debt: count GO_WITH_TECH_DEBT occurrences as fallback
  const debtMatch = content.match(/\|\s*Tech Debt\s*\|\s*(\d+)\s*\|/i);
  const techDebtCount = debtMatch
    ? parseInt(debtMatch[1] ?? '0', 10)
    : (content.match(/GO_WITH_TECH_DEBT/g) ?? []).length;

  const coverageMatch = content.match(/\|\s*Coverage\s*\|\s*(\S+)\s*\|/i);

  // Primary: "| Sprint time | ... |"
  const sprintTimeMatch = content.match(/\|\s*Sprint time\s*\|\s*(.+?)\s*\|/i);
  const durationMatch = content.match(/\|\s*Duration\s*\|\s*(\S+)\s*\|/i);

  // Fallback to non-table
  const fbTotal = content.match(/Tasks?:\s*(\d+)/i);
  const fbCoverage = content.match(/Coverage:\s*(\S+)/i);
  const fbDuration = content.match(/Duration:\s*(\S+)/i);

  let totalTasks = 0;
  let completed = 0;
  if (tasksCompletedMatch) {
    completed = parseInt(tasksCompletedMatch[1] ?? '0', 10);
    totalTasks = parseInt(tasksCompletedMatch[2] ?? '0', 10);
  } else if (totalMatch) {
    totalTasks = parseInt(totalMatch[1] ?? '0', 10);
    completed = completedMatch ? parseInt(completedMatch[1] ?? '0', 10) : 0;
  } else if (fbTotal) {
    totalTasks = parseInt(fbTotal[1] ?? '0', 10);
  }

  return {
    sprintId: sprintMatch?.[1] ?? 'unknown',
    totalTasks,
    completed,
    noGo: noGoRateMatch ? parseInt(noGoRateMatch[1] ?? '0', 10) : (noGoMatch ? parseInt(noGoMatch[1] ?? '0', 10) : 0),
    techDebt: techDebtCount,
    coverage: coverageMatch?.[1] ?? fbCoverage?.[1] ?? '-',
    duration: sprintTimeMatch?.[1] ?? durationMatch?.[1] ?? fbDuration?.[1] ?? '-',
    raw: content,
  };
}

export function formatRichSummary(summary: RichSprintSummary): string {
  const successRate = summary.totalTasks > 0
    ? Math.round((summary.completed / summary.totalTasks) * 100)
    : 0;
  const lines: string[] = [
    `=== Sprint Retrospective: ${summary.sprintId} ===`,
    '',
    `  Tasks:       ${summary.completed}/${summary.totalTasks} completed (${successRate}% success)`,
    `  No-Go:       ${summary.noGo}`,
    `  Tech Debt:   ${summary.techDebt}`,
    `  Coverage:    ${summary.coverage}`,
    `  Duration:    ${summary.duration}`,
    '',
  ];
  return lines.join('\n');
}

export function computeRetroDelta(current: RichSprintSummary, previous: RichSprintSummary): string {
  const curRate = current.totalTasks > 0 ? (current.completed / current.totalTasks) * 100 : 0;
  const prevRate = previous.totalTasks > 0 ? (previous.completed / previous.totalTasks) * 100 : 0;
  const rateDelta = curRate - prevRate;
  const noGoDelta = current.noGo - previous.noGo;
  const debtDelta = current.techDebt - previous.techDebt;

  const sign = (n: number): string => n > 0 ? `+${n}` : String(n);
  const lines: string[] = [
    '--- Delta from Previous Sprint ---',
    `  Success Rate: ${sign(Math.round(rateDelta))}%`,
    `  No-Go:        ${sign(noGoDelta)}`,
    `  Tech Debt:    ${sign(debtDelta)}`,
  ];
  return lines.join('\n');
}

function loadPreviousRetro(root: string): string | null {
  const sprintsDir = join(root, BRAIN_DIR, SPRINTS_DIR);
  if (!existsSync(sprintsDir)) return null;
  const files = readdirSync(sprintsDir)
    .filter((f) => f.startsWith('sprint-') && f.endsWith('.md'))
    .sort();
  if (files.length === 0) return null;

  // Read current retro to find current sprint ID
  const retroPath = join(root, BRAIN_DIR, RETRO_FILE);
  let currentSprintId: string | undefined;
  if (existsSync(retroPath)) {
    const retroContent = readFileSync(retroPath, 'utf-8');
    const match = retroContent.match(/(?:sprint|Sprint)\s*[:#-]?\s*(sprint-\S+)/i);
    currentSprintId = match?.[1];
  }

  // If last file matches current sprint, use second-to-last
  const lastFile = files.at(-1)!;
  if (currentSprintId && lastFile === `${currentSprintId}.md`) {
    if (files.length < 2) return null;
    const prevFile = files.at(-2)!;
    return readFileSync(join(sprintsDir, prevFile), 'utf-8');
  }

  // Otherwise last file IS the previous sprint
  return readFileSync(join(sprintsDir, lastFile), 'utf-8');
}

export function registerRetro(program: Command): void {
  program
    .command('retro')
    .description('Show the latest sprint retrospective')
    .option('--raw', 'Show raw RETRO.md content without formatting')
    .option('--compare', 'Show delta comparison with previous sprint')
    .option('--json', 'Output results as JSON')
    .action((opts: { raw?: boolean; compare?: boolean; json?: boolean }) => {
      const root = resolveProjectRoot();
      const retroPath = join(root, BRAIN_DIR, RETRO_FILE);
      if (!existsSync(retroPath)) {
        print('No retrospective found. Run `deckent start` to complete a sprint first.');
        return;
      }
      const content = readFileSync(retroPath, 'utf-8');
      if (!content.trim()) {
        print('Retrospective file is empty.');
        return;
      }

      if (opts.json) {
        const summary = parseRetroToRichSummary(content);
        const output: Record<string, unknown> = { ...summary };
        delete output.raw;
        if (opts.compare) {
          const prevContent = loadPreviousRetro(root);
          if (prevContent) {
            const prevSummary = parseRetroToRichSummary(prevContent);
            const curRate = summary.totalTasks > 0 ? (summary.completed / summary.totalTasks) * 100 : 0;
            const prevRate = prevSummary.totalTasks > 0 ? (prevSummary.completed / prevSummary.totalTasks) * 100 : 0;
            output.delta = {
              successRate: Math.round(curRate - prevRate),
              noGo: summary.noGo - prevSummary.noGo,
              techDebt: summary.techDebt - prevSummary.techDebt,
              previous: (() => { const p: Record<string, unknown> = { ...prevSummary }; delete p.raw; return p; })(),
            };
          }
        }
        print(JSON.stringify(output, null, 2));
        return;
      }

      if (opts.raw) {
        print(content);
        return;
      }

      const summary = parseRetroToRichSummary(content);
      print(formatRichSummary(summary));

      if (opts.compare) {
        const prevContent = loadPreviousRetro(root);
        if (!prevContent) {
          print('No previous sprint found for comparison.');
          return;
        }
        const prevSummary = parseRetroToRichSummary(prevContent);
        print(computeRetroDelta(summary, prevSummary));
      }
    });
}
