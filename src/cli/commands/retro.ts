import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { BRAIN_DIR, SPRINTS_DIR, MEMORY_DB_FILE, DECISIONS_LOG_DIR } from '../../core/constants.js';
import { MemoryStore } from '../../core/memory-store.js';
import { print } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getMessage, getLanguage } from '../helpers/messages.js';
import { memoryCatalogMessage } from '../helpers/message-catalog/cli-memory-catalog.js';
import { getLangFromConfig } from '../helpers/config-reader.js';

// R4-SSOT: canonical RichSprintSummary lives in retro-parser.ts (consumed by
// retro-formatter.ts). Imported for internal use + re-exported so retro.ts's
// own API surface is unchanged — single source of truth, no shape that can drift.
import type { RichSprintSummary } from './retro-parser.js';
export type { RichSprintSummary };

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

/** Parsed sprint log data */
export interface SprintSummary {
  sprintNumber: number;
  totalTasks: number;
  completed: number;
  techDebt: number;
  noGo: number;
  durationMs: number;
  goal: string;
  tasks: string[];
}

/** Parsed retro learnings */
export interface RetroLearnings {
  items: string[];
}

/**
 * Find the latest sprint log filename from `.brain/sprints/`.
 * Sorts by filename descending and returns the first match.
 */
export function findLatestSprintLog(root: string): string | null {
  const sprintsDir = join(root, '.brain', 'sprints');
  if (!existsSync(sprintsDir)) return null;

  const files = readdirSync(sprintsDir)
    .filter((f) => f.startsWith('sprint-') && f.endsWith('.md'))
    .sort()
    .reverse();

  return files[0] ?? null;
}

/**
 * Parse sprint number from filename like "sprint-042.md" → 42
 */
export function parseSprintNumber(filename: string): number {
  const match = filename.match(/sprint-(\d+)\.md$/);
  if (!match?.[1]) return 0;
  return parseInt(match[1], 10);
}

/**
 * Parse a sprint log markdown file into structured data.
 * (F/G) Uses tolerant regex for header and table formats.
 */
export function parseSprintLog(content: string): SprintSummary {
  const summary: SprintSummary = {
    sprintNumber: 0,
    totalTasks: 0,
    completed: 0,
    techDebt: 0,
    noGo: 0,
    durationMs: 0,
    goal: 'No goal recorded',
    tasks: [],
  };

  // (G) Tolerant heading: "# sprint-042", "# Sprint 042", "# Sprint-042", "## sprint-042" etc.
  const headingMatch = content.match(/^#{1,3}\s+(?:Sprint[-\s]?)?(\d+)/im);
  if (headingMatch?.[1]) {
    summary.sprintNumber = parseInt(headingMatch[1], 10);
  }

  // (F) Tolerant metrics table — allow extra whitespace, case-insensitive
  const totalMatch = content.match(/\|\s*Total\s+Tasks?\s*\|\s*(\d+)\s*\|/i);
  if (totalMatch?.[1]) summary.totalTasks = parseInt(totalMatch[1], 10);

  // Also handle "Tasks completed: X/Y" format from sprint-reporter
  const tasksCompletedMatch = content.match(/\|\s*Tasks\s+completed\s*\|\s*(\d+)\s*\/\s*(\d+)\s*\|/i);
  if (tasksCompletedMatch) {
    summary.completed = parseInt(tasksCompletedMatch[1] ?? '0', 10);
    if (summary.totalTasks === 0) {
      summary.totalTasks = parseInt(tasksCompletedMatch[2] ?? '0', 10);
    }
  } else {
    const completedMatch = content.match(/\|\s*Completed\s*\|\s*(\d+)\s*\|/i);
    if (completedMatch?.[1]) summary.completed = parseInt(completedMatch[1], 10);
  }

  const debtMatch = content.match(/\|\s*Tech\s+Debt\s*\|\s*(\d+)\s*\|/i);
  if (debtMatch?.[1]) summary.techDebt = parseInt(debtMatch[1], 10);

  const nogoMatch = content.match(/\|\s*No[-\s]?Go\s*\|\s*(\d+)\s*\|/i);
  if (nogoMatch?.[1]) summary.noGo = parseInt(nogoMatch[1], 10);

  // Also parse NO_GO rate format: "| NO_GO rate | 0% (0/5) |"
  const noGoRateMatch = content.match(/\|\s*NO_GO\s+rate\s*\|[^|]*\((\d+)\/\d+\)\s*\|/i);
  if (noGoRateMatch?.[1] && summary.noGo === 0) {
    summary.noGo = parseInt(noGoRateMatch[1], 10);
  }

  // (F) Duration: allow "ms" suffix or "5m 3s" format
  const durationMsMatch = content.match(/\|\s*Duration\s*\|\s*(\d+)\s*ms\s*\|/i);
  if (durationMsMatch?.[1]) {
    summary.durationMs = parseInt(durationMsMatch[1], 10);
  } else {
    // Try "Sprint time | 5m 3s |" format → convert to ms
    const sprintTimeMatch = content.match(/\|\s*Sprint\s+time\s*\|\s*(\d+)m\s+(\d+)s\s*\|/i);
    if (sprintTimeMatch) {
      const mins = parseInt(sprintTimeMatch[1] ?? '0', 10);
      const secs = parseInt(sprintTimeMatch[2] ?? '0', 10);
      summary.durationMs = (mins * 60 + secs) * 1000;
    }
  }

  // Parse tasks section — bullet list items
  const taskLines = content.match(/^[-*]\s+.+$/gm);
  if (taskLines) {
    summary.tasks = taskLines.map((line) => line.replace(/^[-*]\s+/, ''));
  }

  return summary;
}

/**
 * Load a sprint's retrospective content from the Memory V2 DB `retro` entry.
 * B8: retros live in memory.db (no `.brain/RETRO.md` file). Falls back to the
 * most recent retro when the requested sprint has no entry.
 */
function loadRetroContentForSprint(root: string, sprintNumber: number): string | null {
  const dbPath = join(root, BRAIN_DIR, MEMORY_DB_FILE);
  if (!existsSync(dbPath)) return null;
  try {
    const store = new MemoryStore(dbPath);
    try {
      if (sprintNumber > 0) {
        const entry = store.getById(`retro-sprint-${sprintNumber}`);
        if (entry) return entry.content;
      }
      const retros = store.getByType('retro')
        .sort((a, b) => (b.sprint_num ?? 0) - (a.sprint_num ?? 0));
      return retros[0]?.content ?? null;
    } finally {
      store.close();
    }
  } catch {
    return null;
  }
}

/**
 * Parse the learnings section from a retrospective.
 * Extracts items under the "## Learnings" heading.
 * @param maxItems - Maximum items to return (default 3, pass Infinity for all)
 */
export function parseRetroLearnings(content: string, maxItems = 3): RetroLearnings {
  const result: RetroLearnings = { items: [] };

  // (F) Tolerant: allow extra whitespace around "Learnings" heading
  const learningsMatch = content.match(/##\s+Learnings\s*\r?\n([\s\S]*?)(?=\r?\n##|\r?\n*$)/i);
  if (!learningsMatch?.[1]) return result;

  const lines = learningsMatch[1]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.replace(/^- /, ''));

  result.items = maxItems === Infinity ? lines : lines.slice(0, maxItems);
  return result;
}

/**
 * Format duration from milliseconds to human-readable string.
 */
export function formatDuration(ms: number): string {
  if (ms <= 0) return 'unknown';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

/**
 * Extract goal from DIRECTIVES.md (first `## Goal:` line).
 */
export function extractGoalFromDirectives(root: string): string | null {
  const directivesPath = join(root, 'DIRECTIVES.md');
  if (!existsSync(directivesPath)) return null;
  try {
    const content = readFileSync(directivesPath, 'utf-8');
    const match = content.match(/^##\s*Goal[:\s]*(.+)$/m);
    return match?.[1]?.trim() ?? null;
  } catch {
    return null;
  }
}

/**
 * Extract goal from sprint log content (first non-empty line after heading).
 */
export function extractGoalFromSprintLog(content: string): string | null {
  // (F) Tolerant: handle "# sprint-042", "# Sprint 042", "## Sprint-042" etc.
  const match = content.match(/^#{1,3}\s+(?:Sprint[-\s]?)?\d+[^\n]*\r?\n+([^\n#|]+)/im);
  const line = match?.[1]?.trim();
  if (!line || line.length === 0) return null;
  // Skip table lines (starting with |) — not a goal
  if (line.startsWith('|')) return null;
  return line;
}

// ─── Decision Log Display ──────────────────────────────────────────────────

/**
 * Build human-readable output for a task's routing decision log.
 * Reads from `<DECISIONS_LOG_DIR>/decision-<taskId>.json`.
 */
export function buildTaskDecisionOutput(taskId: string, root: string, lang = 'en'): string | null {
  const decisionPath = join(root, DECISIONS_LOG_DIR, `decision-${taskId}.json`);
  if (!existsSync(decisionPath)) return null;

  try {
    const raw = readFileSync(decisionPath, 'utf-8');
    const parsed = JSON.parse(raw) as {
      taskId: string;
      sprintId: string;
      steps: Array<{
        step: number;
        name: string;
        input: Record<string, unknown>;
        output: Record<string, unknown>;
        reasoning: string;
      }>;
      decidedAt: string;
    };

    const lines: string[] = [];
    const header = lang === 'tr'
      ? `Task ${parsed.taskId} Routing Kararları (${parsed.sprintId})`
      : `Task ${parsed.taskId} Routing Decisions (${parsed.sprintId})`;
    lines.push(header);
    lines.push('\u2501'.repeat(header.length));
    lines.push('');

    // Show input from first step (task context)
    const firstStep = parsed.steps[0];
    if (firstStep?.input && Object.keys(firstStep.input).length > 0) {
      const inputLabel = lang === 'tr' ? 'Giriş:' : 'Input:';
      lines.push(inputLabel);
      if (firstStep.input.title) lines.push(`  Title: ${firstStep.input.title}`);
      if (firstStep.input.intent) lines.push(`  Intent: ${firstStep.input.intent}`);
      if (Array.isArray(firstStep.input.scope)) lines.push(`  Scope: ${(firstStep.input.scope as string[]).join(', ')}`);
      lines.push('');
    }

    // Show output from first step (routing result)
    if (firstStep?.output && Object.keys(firstStep.output).length > 0) {
      const outputLabel = lang === 'tr' ? 'Sonuç:' : 'Result:';
      lines.push(outputLabel);
      if (firstStep.output.agent) lines.push(`  Agent: ${firstStep.output.agent}`);
      if (Array.isArray(firstStep.output.skills)) lines.push(`  Skills: ${(firstStep.output.skills as string[]).join(', ')}`);
      if (firstStep.output.confidence) lines.push(`  Confidence: ${firstStep.output.confidence}`);
      lines.push('');
    }

    // Show reasoning steps
    const stepsLabel = lang === 'tr' ? 'Routing Adımları:' : 'Routing Steps:';
    lines.push(stepsLabel);
    for (const step of parsed.steps) {
      const excluded = step.reasoning.toLowerCase().includes('excluded');
      const marker = excluded ? '\u2718' : '\u2714';
      lines.push(`  ${marker} ${step.reasoning}`);
    }

    lines.push('');
    const decidedLabel = lang === 'tr' ? 'Karar zamanı' : 'Decided at';
    lines.push(`${decidedLabel}: ${parsed.decidedAt}`);

    return lines.join('\n');
  } catch {
    return null;
  }
}

/** i18n labels for explain output */
const EXPLAIN_LABELS: Record<string, Record<string, string>> = {
  summary: { en: 'Summary', tr: 'Özet' },
  goal: { en: 'Goal', tr: 'Hedef' },
  whatHappened: { en: 'What happened:', tr: 'Ne oldu:' },
  tasksCompleted: { en: 'tasks completed successfully', tr: 'görev başarıyla tamamlandı' },
  tasksFailed: { en: 'tasks failed (NO_GO)', tr: 'görev başarısız (NO_GO)' },
  tasksDebt: { en: 'tasks completed with tech debt', tr: 'görev teknik borçla tamamlandı' },
  duration: { en: 'Duration', tr: 'Süre' },
  keyLearnings: { en: 'Key learnings:', tr: 'Temel öğrenmeler:' },
  allLearnings: { en: 'All learnings:', tr: 'Tüm öğrenmeler:' },
  taskDetails: { en: 'Task details:', tr: 'Görev detayları:' },
  next: {
    en: 'Next: Run `deckent start` to continue, or `deckent plan` to see next sprint',
    tr: 'Sonraki: Devam etmek için `deckent start`, planlamak için `deckent plan` çalıştırın',
  },
  noGoal: { en: 'No goal recorded', tr: 'Hedef kaydedilmemiş' },
};

function label(key: string, lang: string): string {
  const entry = EXPLAIN_LABELS[key];
  if (!entry) return key;
  return entry[lang === 'tr' ? 'tr' : 'en'] ?? entry['en'] ?? key;
}

/**
 * Build the human-readable explain output string.
 * J) When verbose=true, shows ALL learnings and task details.
 */
export function buildExplainOutput(summary: SprintSummary, learnings: RetroLearnings, lang = 'en', verbose = false): string {
  const lines: string[] = [];

  lines.push(`Sprint #${summary.sprintNumber} ${label('summary', lang)}`);
  lines.push('\u2501'.repeat(17));
  lines.push('');
  lines.push(`${label('goal', lang)}: ${summary.goal === 'No goal recorded' ? label('noGoal', lang) : summary.goal}`);
  lines.push('');
  lines.push(label('whatHappened', lang));

  const doneCount = summary.completed + summary.techDebt;
  lines.push(`  \u2022 ${doneCount} ${label('tasksCompleted', lang)}`);
  lines.push(`  \u2022 ${summary.noGo} ${label('tasksFailed', lang)}`);
  lines.push(`  \u2022 ${summary.techDebt} ${label('tasksDebt', lang)}`);

  if (summary.durationMs > 0) {
    lines.push(`  \u2022 ${label('duration', lang)}: ${formatDuration(summary.durationMs)}`);
  }

  if (learnings.items.length > 0) {
    lines.push('');
    // J) verbose: show "All learnings:" with all items; default: "Key learnings:" with max 3
    lines.push(verbose ? label('allLearnings', lang) : label('keyLearnings', lang));
    for (const item of learnings.items) {
      lines.push(`  \u2022 ${item}`);
    }
  }

  // J) verbose: show task details
  if (verbose && summary.tasks.length > 0) {
    lines.push('');
    lines.push(label('taskDetails', lang));
    for (const task of summary.tasks) {
      lines.push(`  \u2022 ${task}`);
    }
  }

  lines.push('');
  lines.push(label('next', lang));

  return lines.join('\n');
}


export function runRetroExplain(opts: { sprint?: string; task?: string; json?: boolean; verbose?: boolean }): void {
      const root = resolveProjectRoot();
      const lang = getLangFromConfig(root);
      /** `--json` keeps stdout to one document; every notice goes to stderr instead. */
      const notice = (line: string): void => {
        if (opts.json) process.stderr.write(`${line}\n`);
        else print(line);
      };

      // --task mode: show routing decision log for a specific task
      if (opts.task) {
        const output = buildTaskDecisionOutput(opts.task, root, lang);
        if (opts.json) {
          // --task had no machine surface at all (it printed the rendered human log
          // even under --json); the document below is additive and leaves the
          // sprint-mode schema untouched.
          print(JSON.stringify({ taskId: opts.task, decisionLog: output ?? null }, null, 2));
          return;
        }
        if (!output) {
          print(`No decision log found for task ${opts.task}`);
          return;
        }
        print(output);
        return;
      }

      let sprintFile: string | null;
      if (opts.sprint) {
        const paddedId = opts.sprint.padStart(3, '0');
        const filename = `sprint-${paddedId}.md`;
        const filePath = join(root, '.brain', 'sprints', filename);
        if (!existsSync(filePath)) {
          notice(`Sprint ${opts.sprint} not found`);
          return;
        }
        sprintFile = filename;
      } else {
        sprintFile = findLatestSprintLog(root);
      }

      if (!sprintFile) {
        notice('No sprints found. Run `deckent start` to begin.');
        return;
      }

      const sprintPath = join(root, '.brain', 'sprints', sprintFile);
      const sprintContent = readFileSync(sprintPath, 'utf-8');
      const summary = parseSprintLog(sprintContent);

      // Use filename-based sprint number if heading parse failed
      if (summary.sprintNumber === 0) {
        summary.sprintNumber = parseSprintNumber(sprintFile);
      }

      // Goal extraction: DIRECTIVES.md → sprint log → fallback
      if (summary.goal === 'No goal recorded') {
        const directivesGoal = extractGoalFromDirectives(root);
        if (directivesGoal) {
          summary.goal = directivesGoal;
        } else {
          const logGoal = extractGoalFromSprintLog(sprintContent);
          if (logGoal) {
            summary.goal = logGoal;
          }
        }
      }

      const verbose = opts.verbose ?? false;

      // Load sprint learnings from the Memory V2 DB `retro` entry — B8.
      // J) verbose: load ALL learnings (no limit); default: max 3
      let learnings: RetroLearnings = { items: [] };
      const retroContent = loadRetroContentForSprint(root, summary.sprintNumber);
      if (retroContent) {
        try {
          learnings = parseRetroLearnings(retroContent, verbose ? Infinity : 3);
        } catch {
          // skip learnings if unparseable
        }
      }

      if (opts.json) {
        const output: Record<string, unknown> = {
          sprintId: summary.sprintNumber,
          goal: summary.goal,
          metrics: {
            totalTasks: summary.totalTasks,
            completed: summary.completed,
            techDebt: summary.techDebt,
            noGo: summary.noGo,
            durationMs: summary.durationMs,
          },
          learnings: learnings.items,
          // J) include tasks when verbose mode used in JSON output
          ...(verbose ? { tasks: summary.tasks } : {}),
        };
        print(JSON.stringify(output, null, 2));
        return;
      }

      print(buildExplainOutput(summary, learnings, lang, verbose));
}

// ─── Command Registration ─────────────────────────────────────────────────

export function registerRetro(program: Command): void {
  program
    .command('retro')
    .description(getMessage('cli.retro.desc', getLanguage(undefined)))
    .option('--raw', memoryCatalogMessage('cli.memcat.retro.opt.raw', getLanguage(undefined)))
    .option('--compare', memoryCatalogMessage('cli.memcat.retro.opt.compare', getLanguage(undefined)))
    .option('--json', memoryCatalogMessage('cli.memcat.shared.opt.json', getLanguage(undefined)))
    .option('--perf', memoryCatalogMessage('cli.memcat.retro.opt.perf', getLanguage(undefined)))
    .option('--trend [n]', memoryCatalogMessage('cli.memcat.retro.opt.trend', getLanguage(undefined)))
    .option('--explain', getMessage('cli.retro.opt.explain', getLanguage(undefined)))
    .option('--task <id>', getMessage('cli.retro.opt.task', getLanguage(undefined)))
    .action((opts: { raw?: boolean; compare?: boolean; json?: boolean; perf?: boolean; trend?: string | boolean; explain?: boolean; task?: string; sprint?: string; verbose?: boolean }) => {
      if (opts.explain) { runRetroExplain(opts); return; }
      const root = resolveProjectRoot();
      const lang = getLangFromConfig(root);

      // (B) --trend flag: show trend across last N sprints
      if (opts.trend !== undefined) {
        const n = typeof opts.trend === 'string' ? parseInt(opts.trend, 10) : 5;
        const entries = loadSprintTrend(root, isNaN(n) ? 5 : n);
        // --trend had no machine surface and rendered the human chart even under
        // --json; the raw trend entries are additive and leave the retro-summary
        // schema untouched.
        if (opts.json) print(JSON.stringify(entries, null, 2));
        else print(formatTrend(entries, lang));
        return;
      }

      const content = loadLatestRetro(root);
      if (!content || !content.trim()) {
        // No retro to serialize: stdout stays empty under --json, notice on stderr.
        const noneFound = getMessage('retro.none_found', lang);
        if (opts.json) process.stderr.write(`${noneFound}\n`);
        else print(noneFound);
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
