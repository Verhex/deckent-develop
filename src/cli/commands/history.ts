import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { BRAIN_DIR, SPRINTS_DIR, DECKENT_DIR } from '../../core/constants.js';
import { print, formatTable } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { collectSprintFiles } from '../../orchestra/sprint-reporter.js';

interface SprintRecord {
  sprint: string;
  tasks: string;
  completed: string;
  techDebt: string;
  noGo: string;
  noGoRate: string;
  successRate: string;
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

  // Parse agent column from task table formats:
  //   3-col: | Task | Agent | Status |
  //   4-col: | Task | Agent | Skills | Status |
  const STATUS_VALUES = /^(GO|NO_GO|GO_WITH_TECH_DEBT|DONE|PENDING|CLAIMED|EXECUTING|TESTING|DOCUMENTING|PAUSED)$/;
  const HEADER_OR_SEPARATOR = /^(Task|Agent|Skills?|Status|-+)$/i;
  for (const line of content.split('\n')) {
    const cols = line.split('|').map((c) => c.trim()).filter(Boolean);
    // Determine which column holds the status (3rd or 4th)
    const statusCol = cols.length >= 4 && STATUS_VALUES.test(cols[3] ?? '')
      ? 3
      : cols.length >= 3 && STATUS_VALUES.test(cols[2] ?? '')
        ? 2
        : -1;
    if (statusCol < 0) continue;

    // Agent is always column index 1
    const agentName = cols[1] ?? '';
    if (agentName && !HEADER_OR_SEPARATOR.test(agentName) && agentName !== 'generic' && !agents.includes(agentName)) {
      agents.push(agentName);
    }

    // For 4-col format, extract skills from column index 2
    if (statusCol === 3) {
      const rawSkills = cols[2] ?? '';
      if (rawSkills && !HEADER_OR_SEPARATOR.test(rawSkills)) {
        for (const part of rawSkills.split(/[,;]+/)) {
          const trimmed = part.trim();
          if (trimmed && trimmed !== '-' && !skills.includes(trimmed)) {
            skills.push(trimmed);
          }
        }
      }
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

  let successRate = '-';
  if (!isNaN(completed) && !isNaN(totalTasks)) {
    successRate = totalTasks === 0 ? '0%' : `${Math.round((completed / totalTasks) * 100)}%`;
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
    successRate,
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

/** Parse a percentage string like "90%" or "90.5%" to its numeric value, or null if not parseable */
function parsePercentValue(str: string): number | null {
  const m = str.match(/^(\d+(?:\.\d+)?)%/);
  return m ? parseFloat(m[1]!) : null;
}

/**
 * Build a trend analysis string from the last up-to-5 sprint records.
 * Returns empty string if fewer than 2 records are provided.
 * Shows success rate and coverage deltas with directional arrows (↑/↓/→).
 */
export function buildTrendAnalysis(records: SprintRecord[]): string {
  if (records.length < 2) return '';

  const window = records.slice(-5); // use last 5 records (window = 5)
  const count = window.length;
  const first = window[0]!;
  const last = window[count - 1]!;

  const firstSuccess = parsePercentValue(first.successRate ?? '-');
  const lastSuccess = parsePercentValue(last.successRate ?? '-');
  const firstCov = parsePercentValue(first.coverage);
  const lastCov = parsePercentValue(last.coverage);

  const successDelta = firstSuccess !== null && lastSuccess !== null ? lastSuccess - firstSuccess : null;
  const covDelta = firstCov !== null && lastCov !== null ? lastCov - firstCov : null;

  const lines: string[] = [`--- Trend (last ${count} sprints) ---`];

  if (successDelta !== null) {
    const arrow = successDelta > 0 ? '↑' : successDelta < 0 ? '↓' : '→';
    const change = successDelta !== 0 ? ` ${Math.abs(successDelta)}%` : '';
    lines.push(`  Success Rate: ${arrow}${change} (${firstSuccess}% → ${lastSuccess}%)`);
  }

  if (covDelta !== null) {
    const arrow = covDelta > 0 ? '↑' : covDelta < 0 ? '↓' : '→';
    const change = covDelta !== 0 ? ` ${Math.abs(covDelta).toFixed(1)}%` : '';
    lines.push(`  Coverage: ${arrow}${change} (${firstCov}% → ${lastCov}%)`);
  }

  return lines.join('\n');
}

interface HistoryOpts {
  agent?: string;
  skill?: string;
  json?: boolean;
  last?: string;
  trend?: boolean;
}

export function registerHistory(program: Command): void {
  program
    .command('history')
    .description('Show sprint history')
    .option('--agent <name>', 'Filter by agent name')
    .option('--skill <name>', 'Filter by skill name')
    .option('--json', 'Output as JSON')
    .option('--last <n>', 'Show only last N sprints')
    .option('--trend', 'Show success rate/coverage trend analysis for last 5 sprints')
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
        // Serialize tasks/completed/noGo as numbers (not strings) for JSON output
        const jsonRecords = records.map((r) => ({
          ...r,
          tasks: typeof r.tasks === 'string' && r.tasks !== '-' ? parseInt(r.tasks, 10) : r.tasks,
          completed: typeof r.completed === 'string' && r.completed !== '-' ? parseInt(r.completed, 10) : r.completed,
          noGo: typeof r.noGo === 'string' && r.noGo !== '-' ? parseInt(r.noGo, 10) : r.noGo,
        }));
        print(JSON.stringify(jsonRecords, null, 2));
        return;
      }

      const headers = ['Sprint', 'Tasks', 'Done', 'Debt', 'No-Go', 'No-Go%', 'Success%', 'Coverage', 'Duration', 'Files', 'Tokens', 'Calls', 'Agents', 'Skills'];
      const rows = records.map((r) => [r.sprint, r.tasks, r.completed, r.techDebt, r.noGo, r.noGoRate, r.successRate, r.coverage, r.duration, r.filesChanged, r.tokens, r.calls, r.agents, r.skills]);
      print(formatTable(headers, rows));

      if (opts.trend) {
        const trend = buildTrendAnalysis(records);
        if (trend) print(trend);
      }
    });
}
