import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { BRAIN_DIR, SPRINTS_DIR, MEMORY_DB_FILE } from '../../core/constants.js';
import { MemoryStore } from '../../core/memory-store.js';
import { print } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getMessage } from '../helpers/messages.js';
import { getLangFromConfig } from '../helpers/config-reader.js';

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

// ─── i18n labels ──────────────────────────────────────────────────────────

const RETRO_LABELS: Record<string, Record<string, string>> = {
  sprintRetro: { en: 'Sprint Retrospective', tr: 'Sprint Retrospektifi' },
  tasks: { en: 'Tasks', tr: 'Görevler' },
  completed: { en: 'completed', tr: 'tamamlandı' },
  success: { en: 'success', tr: 'başarı' },
  noGo: { en: 'No-Go', tr: 'No-Go' },
  techDebt: { en: 'Tech Debt', tr: 'Teknik Borç' },
  coverage: { en: 'Coverage', tr: 'Kapsam' },
  duration: { en: 'Duration', tr: 'Süre' },
  deltaPrev: { en: 'Delta from Previous Sprint', tr: 'Önceki Sprint\'ten Fark' },
  successRate: { en: 'Success Rate', tr: 'Başarı Oranı' },
  agentPerf: { en: 'Agent Performance', tr: 'Ajan Performansı' },
  skillPerf: { en: 'Skill Performance', tr: 'Beceri Performansı' },
  agent: { en: 'Agent', tr: 'Ajan' },
  skill: { en: 'Skill', tr: 'Beceri' },
  done: { en: 'Done', tr: 'Tamam' },
  debt: { en: 'Debt', tr: 'Borç' },
  avgCov: { en: 'Avg Cov', tr: 'Ort Kap' },
  trend: { en: 'Sprint Trend', tr: 'Sprint Trendi' },
  sprint: { en: 'Sprint', tr: 'Sprint' },
  noPerf: { en: 'No performance data found in retro.', tr: 'Retroda performans verisi bulunamadı.' },
  noTrend: { en: 'Not enough sprint history for trend.', tr: 'Trend için yeterli sprint geçmişi yok.' },
};

function lbl(key: string, lang: string): string {
  const entry = RETRO_LABELS[key];
  if (!entry) return key;
  return entry[lang === 'tr' ? 'tr' : 'en'] ?? entry['en'] ?? key;
}

// ─── Parsers ───────────────────────────────────────────────────────────────

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

export function formatRichSummary(summary: RichSprintSummary, lang = 'en'): string {
  const successRate = summary.totalTasks > 0
    ? Math.round((summary.completed / summary.totalTasks) * 100)
    : 0;
  const lines: string[] = [
    `=== ${lbl('sprintRetro', lang)}: ${summary.sprintId} ===`,
    '',
    `  ${lbl('tasks', lang)}:       ${summary.completed}/${summary.totalTasks} ${lbl('completed', lang)} (${successRate}% ${lbl('success', lang)})`,
    `  ${lbl('noGo', lang)}:        ${summary.noGo}`,
    `  ${lbl('techDebt', lang)}:    ${summary.techDebt}`,
    `  ${lbl('coverage', lang)}:    ${summary.coverage}`,
    `  ${lbl('duration', lang)}:    ${summary.duration}`,
    '',
  ];
  return lines.join('\n');
}

export function computeRetroDelta(current: RichSprintSummary, previous: RichSprintSummary, lang = 'en'): string {
  const curRate = current.totalTasks > 0 ? (current.completed / current.totalTasks) * 100 : 0;
  const prevRate = previous.totalTasks > 0 ? (previous.completed / previous.totalTasks) * 100 : 0;
  const rateDelta = curRate - prevRate;
  const noGoDelta = current.noGo - previous.noGo;
  const debtDelta = current.techDebt - previous.techDebt;

  const sign = (n: number): string => n > 0 ? `+${n}` : String(n);
  const lines: string[] = [
    `--- ${lbl('deltaPrev', lang)} ---`,
    `  ${lbl('successRate', lang)}: ${sign(Math.round(rateDelta))}%`,
    `  ${lbl('noGo', lang)}:        ${sign(noGoDelta)}`,
    `  ${lbl('techDebt', lang)}:    ${sign(debtDelta)}`,
  ];
  return lines.join('\n');
}

// ─── Agent/Skill Performance Parse ────────────────────────────────────────

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

/**
 * Parse the "## Agent Performance" table from RETRO.md content.
 * (C) Agent/Skill Performance CLI Parse
 */
export function parseAgentPerformanceFromRetro(content: string): AgentPerfRow[] {
  // Find the Agent Performance section
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

export function formatAgentPerfTable(rows: AgentPerfRow[], lang = 'en'): string {
  if (rows.length === 0) return '';
  const lines: string[] = [
    `=== ${lbl('agentPerf', lang)} ===`,
    '',
    `  ${lbl('agent', lang).padEnd(20)} ${lbl('tasks', lang).padEnd(6)} ${lbl('done', lang).padEnd(6)} ${lbl('debt', lang).padEnd(6)} ${lbl('noGo', lang).padEnd(6)} ${lbl('avgCov', lang)}`,
    `  ${'─'.repeat(58)}`,
  ];
  for (const row of rows) {
    lines.push(`  ${row.agent.padEnd(20)} ${row.tasks.padEnd(6)} ${row.done.padEnd(6)} ${row.debt.padEnd(6)} ${row.noGo.padEnd(6)} ${row.avgCoverage}`);
  }
  return lines.join('\n');
}

export function formatSkillPerfTable(rows: SkillPerfRow[], lang = 'en'): string {
  if (rows.length === 0) return '';
  const lines: string[] = [
    `=== ${lbl('skillPerf', lang)} ===`,
    '',
    `  ${lbl('skill', lang).padEnd(20)} ${lbl('tasks', lang).padEnd(6)} ${lbl('done', lang).padEnd(6)} ${lbl('debt', lang).padEnd(6)} ${lbl('noGo', lang)}`,
    `  ${'─'.repeat(48)}`,
  ];
  for (const row of rows) {
    lines.push(`  ${row.skill.padEnd(20)} ${row.tasks.padEnd(6)} ${row.done.padEnd(6)} ${row.debt.padEnd(6)} ${row.noGo}`);
  }
  return lines.join('\n');
}

// ─── Trend ────────────────────────────────────────────────────────────────

export interface SprintTrendEntry {
  sprintId: string;
  successRate: number;
  noGo: number;
  techDebt: number;
  coverage: string;
}

/**
 * (B) Load last N sprint files and compute trend data.
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

export function formatTrend(entries: SprintTrendEntry[], lang = 'en'): string {
  if (entries.length === 0) return lbl('noTrend', lang);
  const lines: string[] = [
    `=== ${lbl('trend', lang)} ===`,
    '',
    `  ${lbl('sprint', lang).padEnd(16)} ${'Success%'.padEnd(10)} ${'NoGo'.padEnd(6)} ${'Debt'.padEnd(6)} ${lbl('coverage', lang)}`,
    `  ${'─'.repeat(52)}`,
  ];
  for (const e of entries) {
    lines.push(`  ${e.sprintId.padEnd(16)} ${String(e.successRate + '%').padEnd(10)} ${String(e.noGo).padEnd(6)} ${String(e.techDebt).padEnd(6)} ${e.coverage}`);
  }
  return lines.join('\n');
}

// ─── Retro entry loaders (Memory V2 DB-first) ──────────────────────────────
//
// B8: the retrospective lives in memory.db as `type='retro'` entries (one per
// sprint, id `retro-<sprintId>`). The legacy `.brain/RETRO.md` file — and its
// `.brain/archive/` copy — are no longer produced; each sprint's retro is its
// own queryable DB row, so a separate archive step is unnecessary.

/** Load all `retro` entries from memory.db, newest sprint first. */
function loadRetroEntriesDesc(root: string): Array<{ content: string; sprintId: string }> {
  const dbPath = join(root, BRAIN_DIR, MEMORY_DB_FILE);
  if (!existsSync(dbPath)) return [];
  try {
    const store = new MemoryStore(dbPath);
    try {
      return store.getByType('retro')
        .sort((a, b) => (b.sprint_num ?? 0) - (a.sprint_num ?? 0))
        .map(e => ({ content: e.content, sprintId: e.sprint_id ?? '' }));
    } finally {
      store.close();
    }
  } catch {
    return [];
  }
}

/** Latest sprint retrospective content, or null when none has been recorded. */
export function loadLatestRetro(root: string): string | null {
  return loadRetroEntriesDesc(root)[0]?.content ?? null;
}

// ─── Previous sprint loader ────────────────────────────────────────────────

/** Second-most-recent sprint retrospective content (for `--compare`). */
function loadPreviousRetro(root: string): string | null {
  return loadRetroEntriesDesc(root)[1]?.content ?? null;
}

// ─── Command Registration ─────────────────────────────────────────────────

export function registerRetro(program: Command): void {
  program
    .command('retro')
    .description('Show the latest sprint retrospective')
    .option('--raw', 'Show raw RETRO.md content without formatting')
    .option('--compare', 'Show delta comparison with previous sprint')
    .option('--json', 'Output results as JSON')
    .option('--perf', 'Show agent/skill performance tables')
    .option('--trend [n]', 'Show success rate trend across last N sprints (default: 5)')
    .action((opts: { raw?: boolean; compare?: boolean; json?: boolean; perf?: boolean; trend?: string | boolean }) => {
      const root = resolveProjectRoot();
      const lang = getLangFromConfig(root);

      // (B) --trend flag: show trend across last N sprints
      if (opts.trend !== undefined) {
        const n = typeof opts.trend === 'string' ? parseInt(opts.trend, 10) : 5;
        const entries = loadSprintTrend(root, isNaN(n) ? 5 : n);
        print(formatTrend(entries, lang));
        return;
      }

      const content = loadLatestRetro(root);
      if (!content || !content.trim()) {
        print(getMessage('retro.none_found', lang));
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
        if (opts.perf) {
          output.agentPerformance = parseAgentPerformanceFromRetro(content);
          output.skillPerformance = parseSkillPerformanceFromRetro(content);
        }
        print(JSON.stringify(output, null, 2));
        return;
      }

      if (opts.raw) {
        print(content);
        return;
      }

      const summary = parseRetroToRichSummary(content);
      print(formatRichSummary(summary, lang));

      if (opts.compare) {
        const prevContent = loadPreviousRetro(root);
        if (!prevContent) {
          print(getMessage('retro.no_previous_sprint', lang));
          return;
        }
        const prevSummary = parseRetroToRichSummary(prevContent);
        print(computeRetroDelta(summary, prevSummary, lang));
      }

      // (C) Show agent/skill performance if --perf flag or if content has it
      if (opts.perf) {
        const agentRows = parseAgentPerformanceFromRetro(content);
        const skillRows = parseSkillPerformanceFromRetro(content);
        if (agentRows.length > 0) {
          print('');
          print(formatAgentPerfTable(agentRows, lang));
        }
        if (skillRows.length > 0) {
          print('');
          print(formatSkillPerfTable(skillRows, lang));
        }
        if (agentRows.length === 0 && skillRows.length === 0) {
          print(lbl('noPerf', lang));
        }
      }
    });
}
