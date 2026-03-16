import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { BRAIN_DIR, SPRINTS_DIR } from '../../core/constants.js';
import { print, formatTable } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';

interface SprintRecord {
  sprint: string;
  tasks: string;
  coverage: string;
  duration: string;
}

function parseSprintLog(content: string): SprintRecord {
  const titleMatch = content.match(/^#\s+(.+)/m);
  const tasksMatch = content.match(/Tasks:\s*(\S+)/i);
  const coverageMatch = content.match(/Coverage:\s*(\S+)/i);
  const durationMatch = content.match(/Duration:\s*(\S+)/i);

  return {
    sprint: titleMatch?.[1] ?? 'Unknown',
    tasks: tasksMatch?.[1] ?? '-',
    coverage: coverageMatch?.[1] ?? '-',
    duration: durationMatch?.[1] ?? '-',
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

      const headers = ['Sprint', 'Tasks', 'Coverage', 'Duration'];
      const rows = records.map((r) => [r.sprint, r.tasks, r.coverage, r.duration]);
      print(formatTable(headers, rows));
    });
}
