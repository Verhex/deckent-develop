import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { BRAIN_DIR, SPRINTS_DIR } from '../../core/constants.js';
import { print, formatTable } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';

interface SprintRecord {
  sprint: string;
  tasks: string;
  completed: string;
  noGoRate: string;
  coverage: string;
  duration: string;
}

export function formatDurationMs(raw: string): string {
  const msMatch = raw.match(/^(\d+)ms$/);
  if (!msMatch) return raw;
  const totalMs = parseInt(msMatch[1]!, 10);
  const totalSec = Math.floor(totalMs / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m ${sec}s`;
}

export function parseSprintLog(content: string): SprintRecord {
  const titleMatch = content.match(/^#\s+(.+)/m);
  const totalMatch = content.match(/\|\s*Total Tasks\s*\|\s*(\d+)\s*\|/i);
  const completedMatch = content.match(/\|\s*Completed\s*\|\s*(\d+)\s*\|/i);
  const noGoMatch = content.match(/\|\s*No-Go\s*\|\s*(\d+)\s*\|/i);
  const coverageMatch = content.match(/\|\s*Coverage\s*\|\s*(\S+)\s*\|/i);
  const durationMatch = content.match(/\|\s*Duration\s*\|\s*(\S+)\s*\|/i);

  // Fallback to non-table format
  const fallbackTasks = content.match(/Tasks:\s*(\S+)/i);
  const fallbackCoverage = content.match(/Coverage:\s*(\S+)/i);
  const fallbackDuration = content.match(/Duration:\s*(\S+)/i);

  const totalTasks = totalMatch ? parseInt(totalMatch[1]!, 10) : NaN;
  const completed = completedMatch ? parseInt(completedMatch[1]!, 10) : NaN;
  const noGo = noGoMatch ? parseInt(noGoMatch[1]!, 10) : NaN;

  let noGoRate = '-';
  if (!isNaN(noGo) && !isNaN(totalTasks) && totalTasks > 0) {
    noGoRate = `${Math.round((noGo / totalTasks) * 100)}%`;
  } else if (!isNaN(noGo) && !isNaN(totalTasks) && totalTasks === 0) {
    noGoRate = '0%';
  }

  const rawDuration = durationMatch?.[1] ?? fallbackDuration?.[1] ?? '-';

  return {
    sprint: titleMatch?.[1] ?? 'Unknown',
    tasks: totalMatch ? String(totalTasks) : (fallbackTasks?.[1] ?? '-'),
    completed: !isNaN(completed) ? String(completed) : '-',
    noGoRate,
    coverage: coverageMatch?.[1] ?? fallbackCoverage?.[1] ?? '-',
    duration: formatDurationMs(rawDuration),
  };
}

export function registerHistory(program: Command): void {
  program
    .command('history')
    .description('Show sprint history')
    .action(() => {
      const root = resolveProjectRoot();
      const sprintsDir = join(root, BRAIN_DIR, SPRINTS_DIR);

      if (!existsSync(sprintsDir)) {
        print('No sprint history found.');
        return;
      }

      const files = readdirSync(sprintsDir)
        .filter((f) => f.startsWith('sprint-') && f.endsWith('.md'))
        .sort();

      if (files.length === 0) {
        print('No sprint history found.');
        return;
      }

      const records: SprintRecord[] = files.map((f) => {
        const content = readFileSync(join(sprintsDir, f), 'utf-8');
        return parseSprintLog(content);
      });

      const headers = ['Sprint', 'Tasks', 'Completed', 'No-Go Rate', 'Coverage', 'Duration'];
      const rows = records.map((r) => [r.sprint, r.tasks, r.completed, r.noGoRate, r.coverage, r.duration]);
      print(formatTable(headers, rows));
    });
}
