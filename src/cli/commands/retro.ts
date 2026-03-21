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
  const totalMatch = content.match(/\|\s*Total Tasks?\s*\|\s*(\d+)\s*\|/i);
  const completedMatch = content.match(/\|\s*Completed\s*\|\s*(\d+)\s*\|/i);
  const noGoMatch = content.match(/\|\s*No-Go\s*\|\s*(\d+)\s*\|/i);
  const debtMatch = content.match(/\|\s*Tech Debt\s*\|\s*(\d+)\s*\|/i);
  const coverageMatch = content.match(/\|\s*Coverage\s*\|\s*(\S+)\s*\|/i);
  const durationMatch = content.match(/\|\s*Duration\s*\|\s*(\S+)\s*\|/i);

  // Fallback to non-table
  const fbTotal = content.match(/Tasks?:\s*(\d+)/i);
  const fbCoverage = content.match(/Coverage:\s*(\S+)/i);
  const fbDuration = content.match(/Duration:\s*(\S+)/i);

  return {
    sprintId: sprintMatch?.[1] ?? 'unknown',
    totalTasks: totalMatch ? parseInt(totalMatch[1]!, 10) : (fbTotal ? parseInt(fbTotal[1]!, 10) : 0),
    completed: completedMatch ? parseInt(completedMatch[1]!, 10) : 0,
    noGo: noGoMatch ? parseInt(noGoMatch[1]!, 10) : 0,
    techDebt: debtMatch ? parseInt(debtMatch[1]!, 10) : 0,
    coverage: coverageMatch?.[1] ?? fbCoverage?.[1] ?? '-',
    duration: durationMatch?.[1] ?? fbDuration?.[1] ?? '-',
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
  if (files.length < 1) return null;
  // Return the last sprint log as previous
  return readFileSync(join(sprintsDir, files[files.length - 1]!), 'utf-8');
}

export function registerRetro(program: Command): void {
  program
    .command('retro')
    .description('Show the latest sprint retrospective')
    .option('--raw', 'Show raw RETRO.md content without formatting')
    .option('--compare', 'Show delta comparison with previous sprint')
    .action((opts: { raw?: boolean; compare?: boolean }) => {
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
