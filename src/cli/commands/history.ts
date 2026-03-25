import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { BRAIN_DIR, SPRINTS_DIR, DECKENT_DIR } from '../../core/constants.js';
import { print, formatTable } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';

interface SprintRecord {
  sprint: string;
  tasks: string;
  completed: string;
  techDebt: string;
  noGo: string;
  noGoRate: string;
  coverage: string;
  duration: string;
  agents: string;
  skills: string;
  tokens: string;
  calls: string;
  filesChanged: string;
}

export function formatDurationMs(raw: string): string {
  const msMatch = raw.match(/^(\d+)ms$/);
  if (!msMatch) return raw;
  const totalMs = parseInt(msMatch[1] ?? '0', 10);
  const totalSec = Math.floor(totalMs / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m ${sec}s`;
}

export function parseAgentSkillInfo(content: string): { agents: string[]; skills: string[] } {
  const agents: string[] = [];
  const skills: string[] = [];

  // Parse agent mentions: Agent: <name> or Agents: <list>
  const agentMatch = content.match(/Agents?:\s*(.+)/i);
  if (agentMatch) {
    const raw = (agentMatch[1] ?? '').trim();
    for (const part of raw.split(/[,;]+/)) {
      const trimmed = part.trim().replace(/\|.*/, '').trim();
      if (trimmed && trimmed !== '-') agents.push(trimmed);
    }
  }

  // Parse skill mentions: Skill: <name> or Skills: <list>
  const skillMatch = content.match(/Skills?:\s*(.+)/i);
  if (skillMatch) {
    const raw = (skillMatch[1] ?? '').trim();
    for (const part of raw.split(/[,;]+/)) {
      const trimmed = part.trim().replace(/\|.*/, '').trim();
      if (trimmed && trimmed !== '-') skills.push(trimmed);
    }
  }

  return { agents, skills };
}

export function parseSprintLog(content: string): SprintRecord {
  const titleMatch = content.match(/^#\s+(.+)/m);
  const totalMatch = content.match(/\|\s*Total Tasks\s*\|\s*(\d+)\s*\|/i);
  const completedMatch = content.match(/\|\s*Completed\s*\|\s*(\d+)\s*\|/i);
  const techDebtMatch = content.match(/\|\s*Tech Debt\s*\|\s*(\d+)\s*\|/i);
  const noGoMatch = content.match(/\|\s*No-Go\s*\|\s*(\d+)\s*\|/i);
  const coverageMatch = content.match(/\|\s*Coverage\s*\|\s*(\S+)\s*\|/i);
  const durationMatch = content.match(/\|\s*Duration\s*\|\s*(\S+)\s*\|/i);
  const filesChangedMatch = content.match(/\|\s*Files Changed\s*\|\s*(\S+)\s*\|/i);

  // Fallback to non-table format
  const fallbackTasks = content.match(/Tasks:\s*(\S+)/i);
  const fallbackCoverage = content.match(/Coverage:\s*(\S+)/i);
  const fallbackDuration = content.match(/Duration:\s*(\S+)/i);

  const totalTasks = totalMatch ? parseInt(totalMatch[1] ?? '0', 10) : NaN;
  const completed = completedMatch ? parseInt(completedMatch[1] ?? '0', 10) : NaN;
  const techDebt = techDebtMatch ? parseInt(techDebtMatch[1] ?? '0', 10) : NaN;
  const noGo = noGoMatch ? parseInt(noGoMatch[1] ?? '0', 10) : NaN;

  let noGoRate = '-';
  if (!isNaN(noGo) && !isNaN(totalTasks) && totalTasks > 0) {
    noGoRate = `${Math.round((noGo / totalTasks) * 100)}%`;
  } else if (!isNaN(noGo) && !isNaN(totalTasks) && totalTasks === 0) {
    noGoRate = '0%';
  }

  const rawDuration = durationMatch?.[1] ?? fallbackDuration?.[1] ?? '-';

  const { agents, skills } = parseAgentSkillInfo(content);

  return {
    sprint: titleMatch?.[1] ?? 'Unknown',
    tasks: totalMatch ? String(totalTasks) : (fallbackTasks?.[1] ?? '-'),
    completed: !isNaN(completed) ? String(completed) : '-',
    techDebt: !isNaN(techDebt) ? String(techDebt) : '-',
    noGo: !isNaN(noGo) ? String(noGo) : '-',
    noGoRate,
    coverage: coverageMatch?.[1] ?? fallbackCoverage?.[1] ?? '-',
    duration: formatDurationMs(rawDuration),
    agents: agents.length > 0 ? agents.join(', ') : '-',
    skills: skills.length > 0 ? skills.join(', ') : '-',
    tokens: '-',
    calls: '-',
    filesChanged: filesChangedMatch?.[1] ?? '-',
  };
}

/** Load usage data for a sprint from .deckent/usage/sprint-NNN.json */
function loadUsageData(root: string, sprintId: string): { tokens: number; calls: number } {
  try {
    const usagePath = join(root, DECKENT_DIR, 'usage', `${sprintId}.json`);
    if (!existsSync(usagePath)) return { tokens: 0, calls: 0 };
    const raw = readFileSync(usagePath, 'utf-8');
    const data = JSON.parse(raw) as Array<{ tokenEstimate?: number }>;
    if (!Array.isArray(data)) return { tokens: 0, calls: 0 };
    const tokens = data.reduce((sum, entry) => sum + (entry.tokenEstimate ?? 0), 0);
    return { tokens, calls: data.length };
  } catch {
    return { tokens: 0, calls: 0 };
  }
}

/** Extract sprint number for numeric sort */
function sprintNumber(filename: string): number {
  const m = filename.match(/sprint-(\d+)/);
  return m ? parseInt(m[1] ?? '0', 10) : 0;
}

/** Collect sprint log files from sprints dir and optional archive dir, sorted numerically */
function collectSprintFiles(root: string): Array<{ file: string; dir: string }> {
  const sprintsDir = join(root, BRAIN_DIR, SPRINTS_DIR);
  const archiveDir = join(root, BRAIN_DIR, 'archive');

  const collected: Array<{ file: string; dir: string }> = [];
  const seen = new Set<string>();

  if (existsSync(sprintsDir)) {
    const files = readdirSync(sprintsDir).filter((f) => f.startsWith('sprint-') && f.endsWith('.md'));
    for (const f of files) {
      collected.push({ file: f, dir: sprintsDir });
      seen.add(f);
    }
  }

  if (existsSync(archiveDir)) {
    const files = readdirSync(archiveDir).filter((f) => f.startsWith('sprint-') && f.endsWith('.md'));
    for (const f of files) {
      if (!seen.has(f)) {
        collected.push({ file: f, dir: archiveDir });
      }
    }
  }

  collected.sort((a, b) => sprintNumber(a.file) - sprintNumber(b.file));
  return collected;
}

interface HistoryOpts {
  agent?: string;
  skill?: string;
  json?: boolean;
  last?: string;
}

export function registerHistory(program: Command): void {
  program
    .command('history')
    .description('Show sprint history')
    .option('--agent <name>', 'Filter by agent name')
    .option('--skill <name>', 'Filter by skill name')
    .option('--json', 'Output as JSON')
    .option('--last <n>', 'Show only last N sprints')
    .action((opts: HistoryOpts) => {
      const root = resolveProjectRoot();
      const sprintsDir = join(root, BRAIN_DIR, SPRINTS_DIR);

      if (!existsSync(sprintsDir)) {
        print('No sprint history found.');
        return;
      }

      let entries = collectSprintFiles(root);

      if (entries.length === 0) {
        print('No sprint history found.');
        return;
      }

      // Apply --last N
      if (opts.last !== undefined) {
        const n = parseInt(opts.last, 10);
        if (!isNaN(n) && n > 0) {
          entries = entries.slice(-n);
        }
      }

      let records: SprintRecord[] = entries.map(({ file, dir }) => {
        const content = readFileSync(join(dir, file), 'utf-8');
        const record = parseSprintLog(content);

        // Enrich with usage data
        const sprintId = file.replace('.md', '');
        const usage = loadUsageData(root, sprintId);
        if (usage.calls > 0) {
          record.tokens = String(usage.tokens);
          record.calls = String(usage.calls);
        }

        return record;
      });

      // Apply filters
      if (opts.agent) {
        const agentName = opts.agent.toLowerCase();
        records = records.filter(
          (r) => r.agents.toLowerCase().includes(agentName),
        );
      }

      if (opts.skill) {
        const skillName = opts.skill.toLowerCase();
        records = records.filter(
          (r) => r.skills.toLowerCase().includes(skillName),
        );
      }

      if (records.length === 0) {
        print('No matching sprint history found.');
        return;
      }

      if (opts.json) {
        print(JSON.stringify(records, null, 2));
        return;
      }

      const headers = ['Sprint', 'Tasks', 'Done', 'Debt', 'No-Go', 'No-Go%', 'Coverage', 'Duration', 'Files', 'Tokens', 'Calls', 'Agents', 'Skills'];
      const rows = records.map((r) => [r.sprint, r.tasks, r.completed, r.techDebt, r.noGo, r.noGoRate, r.coverage, r.duration, r.filesChanged, r.tokens, r.calls, r.agents, r.skills]);
      print(formatTable(headers, rows));
    });
}
