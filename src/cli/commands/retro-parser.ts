import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BRAIN_DIR, SPRINTS_DIR } from '../../core/constants.js';

// ─── Types ───────────────────────────────────────────────────────────────

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

export interface AgentPerfRow {
  agent: string;
  tasks: string;
  done: string;
  debt: string;
  noGo: string;
  avgCoverage: string;
}

export interface SkillPerfRow {
  skill: string;
  tasks: string;
  done: string;
  debt: string;
  noGo: string;
}

export interface SprintTrendEntry {
  sprintId: string;
  successRate: number;
  noGo: number;
  techDebt: number;
  coverage: string;
}

// ─── Parsers ─────────────────────────────────────────────────────────────

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

/**
 * Parse the "## Agent Performance" table from RETRO.md content.
 */
export function parseAgentPerformanceFromRetro(content: string): AgentPerfRow[] {
  const sectionMatch = content.match(/##\s+Agent Performance\s*\n([\s\S]*?)(?=\n##|\n*$)/i);
  if (!sectionMatch?.[1]) return [];

  const rows: AgentPerfRow[] = [];
  const lines = sectionMatch[1].split('\n');
  for (const line of lines) {
    if (!line.startsWith('|') || line.includes('---') || /Agent\s*\|/.test(line)) continue;
    const cols = line.split('|').map(c => c.trim()).filter(c => c.length > 0);
    if (cols.length >= 5) {
      rows.push({
        agent: cols[0] ?? '-',
        tasks: cols[1] ?? '-',
        done: cols[2] ?? '-',
        debt: cols[3] ?? '-',
        noGo: cols[4] ?? '-',
        avgCoverage: cols[5] ?? '-',
      });
    }
  }
  return rows;
}

/**
 * Parse the "## Skill Performance" table from RETRO.md content.
 */
export function parseSkillPerformanceFromRetro(content: string): SkillPerfRow[] {
  const sectionMatch = content.match(/##\s+Skill Performance\s*\n([\s\S]*?)(?=\n##|\n*$)/i);
  if (!sectionMatch?.[1]) return [];

  const rows: SkillPerfRow[] = [];
  const lines = sectionMatch[1].split('\n');
  for (const line of lines) {
    if (!line.startsWith('|') || line.includes('---') || /Skill\s*\|/.test(line)) continue;
    const cols = line.split('|').map(c => c.trim()).filter(c => c.length > 0);
    if (cols.length >= 4) {
      rows.push({
        skill: cols[0] ?? '-',
        tasks: cols[1] ?? '-',
        done: cols[2] ?? '-',
        debt: cols[3] ?? '-',
        noGo: cols[4] ?? '-',
      });
    }
  }
  return rows;
}

// ─── Trend ───────────────────────────────────────────────────────────────

/**
 * Load last N sprint files and compute trend data.
 */
export function loadSprintTrend(root: string, n = 5): SprintTrendEntry[] {
  const sprintsDir = join(root, BRAIN_DIR, SPRINTS_DIR);
  if (!existsSync(sprintsDir)) return [];

  const files = readdirSync(sprintsDir)
    .filter(f => f.startsWith('sprint-') && f.endsWith('.md'))
    .sort()
    .slice(-n);

  const entries: SprintTrendEntry[] = [];
  for (const file of files) {
    try {
      const content = readFileSync(join(sprintsDir, file), 'utf-8');
      const summary = parseRetroToRichSummary(content);
      const successRate = summary.totalTasks > 0
        ? Math.round((summary.completed / summary.totalTasks) * 100)
        : 0;
      entries.push({
        sprintId: file.replace('.md', ''),
        successRate,
        noGo: summary.noGo,
        techDebt: summary.techDebt,
        coverage: summary.coverage,
      });
    } catch { /* skip unreadable */ }
  }
  return entries;
}

// B8 (Memory V2): the legacy `loadPreviousRetro` (which scanned `.brain/`
// sprint logs and read `.brain/RETRO.md`) was removed — it had no caller.
// `deckent retro --compare` loads previous-sprint retros from the memory.db
// `retro` entries via retro.ts `loadPreviousRetro`.
