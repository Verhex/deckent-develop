// ─── Rich Sprint Summary (ANSI) ─────────────────────────────────────

// ─── ANSI Codes ─────────────────────────────────────────────────────

const ANSI = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
} as const;

/** Check whether ANSI color output is disabled via NO_COLOR env var. */
function isNoColor(): boolean {
  return process.env['NO_COLOR'] !== undefined;
}

/** Wrap text with an ANSI code pair. Returns plain text when NO_COLOR is set. */
function c(code: string, text: string): string {
  if (isNoColor()) return text;
  return `${code}${text}${ANSI.reset}`;
}

// ─── Duration Helper ────────────────────────────────────────────────

/**
 * Format a duration in milliseconds to a human-readable string.
 * Examples: "2m 30s", "1h 5m", "45s".
 */
export function formatDuration(ms: number): string {
  if (ms <= 0 || !Number.isFinite(ms)) return '0s';
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

// ─── Types ──────────────────────────────────────────────────────────

/** Minimal sprint data for the rich summary formatter. */
export interface RichSprintInput {
  id: string;
  number?: number;
  tasks: Array<{ id?: string; title?: string; [key: string]: unknown }>;
  metrics?: {
    totalTasks?: number;
    completedTasks?: number;
    techDebtTasks?: number;
    noGoTasks?: number;
    durationMs?: number;
    coveragePercent?: number;
    [key: string]: unknown;
  };
  completedAt?: string;
  startedAt?: string;
}

/** Per-agent performance entry. */
export interface AgentPerfEntry {
  agentId: string;
  totalTasks: number;
  doneTasks: number;
  successRate: number;
}

/** Per-task row for the task table. */
export interface TaskTableRow {
  id: string;
  title: string;
  status: string;
  agent?: string;
  durationMs?: number;
}

/** Options for formatting the rich sprint summary. */
export interface RichSummaryOpts {
  gitDiff?: string;
  agentPerf?: AgentPerfEntry[];
  learnings?: string[];
  outputMode?: 'quiet' | 'normal' | 'verbose';
  taskRows?: TaskTableRow[];
  configMigrated?: boolean;
  brainInsights?: string;
}

// ─── Section Renderers ──────────────────────────────────────────────

/**
 * Render the header section.
 * Shows sprint number and duration, right-aligned.
 */
function renderHeader(sprint: RichSprintInput): string {
  const num = sprint.number ?? sprint.id;
  const title = c(ANSI.bold, `\u25cf Sprint #${num} Complete`);

  let duration = '';
  if (sprint.startedAt && sprint.completedAt) {
    const ms = new Date(sprint.completedAt).getTime() - new Date(sprint.startedAt).getTime();
    duration = c(ANSI.dim, `  ${formatDuration(ms)}`);
  } else if (sprint.metrics?.durationMs) {
    duration = c(ANSI.dim, `  ${formatDuration(sprint.metrics.durationMs)}`);
  }

  const sep = c(ANSI.dim, '\u2500'.repeat(48));
  return `${title}${duration}\n${sep}`;
}

/**
 * Count evaluations by category.
 */
function countEvals(evaluations: Map<string, string>): { done: number; debt: number; nogo: number } {
  let done = 0;
  let debt = 0;
  let nogo = 0;
  for (const val of evaluations.values()) {
    if (val === 'DONE') done++;
    else if (val === 'GO_WITH_TECH_DEBT') debt++;
    else if (val === 'NO_GO') nogo++;
  }
  return { done, debt, nogo };
}

/**
 * Render the results section.
 * Shows done/debt/nogo counts with ANSI colors.
 */
function renderResults(evaluations: Map<string, string>): string {
  const { done, debt, nogo } = countEvals(evaluations);
  const parts: string[] = [];
  parts.push(c(ANSI.green, `\u2713 ${done} done`));
  parts.push(c(ANSI.yellow, `\u26a1 ${debt} debt`));
  parts.push(c(ANSI.red, `\u2717 ${nogo} no-go`));
  return `${c(ANSI.bold, 'Results')}\n  ${parts.join('  ')}`;
}

/**
 * Render the changes section from a git diff stat string.
 * Truncates at 5 files, showing a "... N more files" line.
 */
function renderChanges(gitDiff?: string): string {
  const header = c(ANSI.bold, 'Changes');
  if (!gitDiff || gitDiff.trim().length === 0) {
    return `${header}\n  ${c(ANSI.dim, 'No file changes recorded')}`;
  }

  const lines = gitDiff.trim().split('\n').filter((l) => l.trim().length > 0);
  // Filter out the summary line (e.g. "3 files changed, 10 insertions...")
  const fileLines = lines.filter((l) => !l.match(/^\s*\d+\s+files?\s+changed/));

  const MAX_FILES = 5;
  const shown = fileLines.slice(0, MAX_FILES);
  const parts: string[] = [header];

  for (const line of shown) {
    parts.push(`  ${c(ANSI.dim, line.trim())}`);
  }

  const remaining = fileLines.length - MAX_FILES;
  if (remaining > 0) {
    parts.push(`  ${c(ANSI.dim, `... ${remaining} more files`)}`);
  }

  return parts.join('\n');
}

/**
 * Render the tests section.
 * Shows new tests, total, and coverage percentage.
 */
function renderTests(sprint: RichSprintInput, verbose: boolean): string {
  const header = c(ANSI.bold, 'Tests');
  const metrics = sprint.metrics;

  const completed = metrics?.completedTasks ?? 0;
  const total = metrics?.totalTasks ?? sprint.tasks.length;
  const coverage = metrics?.coveragePercent ?? 0;

  const parts: string[] = [header];
  parts.push(`  +${completed} new \u2502 ${total} total \u2502 ${coverage.toFixed(1)}% coverage`);

  if (verbose && coverage < 80) {
    parts.push(`  ${c(ANSI.yellow, '\u26a0 Coverage below 80% threshold')}`);
  }

  return parts.join('\n');
}

/**
 * Render the agent performance section as a table.
 * Columns: agent, tasks, done ratio.
 */
function renderAgentPerformance(agentPerf?: AgentPerfEntry[]): string {
  const header = c(ANSI.bold, 'Agent Performance');
  if (!agentPerf || agentPerf.length === 0) {
    return `${header}\n  ${c(ANSI.dim, 'No agent data available')}`;
  }

  const parts: string[] = [header];
  parts.push(`  ${c(ANSI.dim, 'Agent          Tasks  Done%')}`);

  for (const a of agentPerf) {
    const name = a.agentId.padEnd(14);
    const tasks = String(a.totalTasks).padStart(5);
    const rate = `${a.successRate.toFixed(0)}%`.padStart(5);
    const color = a.successRate >= 80 ? ANSI.green : a.successRate >= 50 ? ANSI.yellow : ANSI.red;
    parts.push(`  ${name} ${tasks}  ${c(color, rate)}`);
  }

  return parts.join('\n');
}

/**
 * Render the learnings section.
 * Shows up to 3 items with success/warning icons.
 */
function renderLearnings(learnings?: string[]): string {
  const header = c(ANSI.bold, 'Learnings');
  if (!learnings || learnings.length === 0) {
    return `${header}\n  ${c(ANSI.dim, 'No learnings recorded')}`;
  }

  const parts: string[] = [header];
  const shown = learnings.slice(0, 3);

  for (const item of shown) {
    const isWarning = /no.go|fail|issue|problem|bug/i.test(item);
    const icon = isWarning ? c(ANSI.yellow, '\u26a0') : c(ANSI.green, '\u2713');
    parts.push(`  ${icon} ${item}`);
  }

  return parts.join('\n');
}

/**
 * Render the next steps section.
 * Auto-generates actionable items based on evaluation results.
 */
function renderNextSteps(evaluations: Map<string, string>, sprint: RichSprintInput): string {
  const header = c(ANSI.bold, 'Next Steps');
  const { debt, nogo } = countEvals(evaluations);
  const items: string[] = [];

  if (nogo > 0) {
    const nogoIds: string[] = [];
    for (const [id, val] of evaluations) {
      if (val === 'NO_GO') nogoIds.push(id);
    }
    items.push(`Fix ${nogo} NO_GO task(s): ${nogoIds.join(', ')}`);
  }

  if (debt > 0) {
    items.push(`Resolve ${debt} tech debt item(s) in next sprint`);
  }

  const coverage = sprint.metrics?.coveragePercent ?? 0;
  if (coverage > 0 && coverage < 80) {
    items.push(`Improve test coverage from ${coverage.toFixed(1)}% to 80%+`);
  }

  if (items.length === 0) {
    items.push('All tasks complete \u2014 ready for next sprint');
  }

  const parts = [header];
  for (const item of items) {
    parts.push(`  \u2192 ${item}`);
  }

  return parts.join('\n');
}

/**
 * Render task-by-task table.
 * Columns: ID | Title | Status | Agent | Duration
 */
function renderTaskTable(taskRows?: TaskTableRow[], evaluations?: Map<string, string>): string {
  const header = c(ANSI.bold, 'Task Breakdown');

  const rows: TaskTableRow[] = taskRows ?? [];
  if (rows.length === 0 && (!evaluations || evaluations.size === 0)) {
    return `${header}\n  ${c(ANSI.dim, 'No task data available')}`;
  }

  // Build rows from evaluations if taskRows not provided
  const effectiveRows: TaskTableRow[] =
    rows.length > 0
      ? rows
      : evaluations
        ? Array.from(evaluations.entries()).map(([id, status]) => ({ id, title: id, status }))
        : [];

  const COL_ID = 10;
  const COL_TITLE = 24;
  const COL_STATUS = 20;
  const COL_AGENT = 14;
  const COL_DUR = 8;

  const pad = (s: string, n: number) => s.slice(0, n).padEnd(n);
  const divider = c(
    ANSI.dim,
    `  ${'─'.repeat(COL_ID)}┬${'─'.repeat(COL_TITLE)}┬${'─'.repeat(COL_STATUS)}┬${'─'.repeat(COL_AGENT)}┬${'─'.repeat(COL_DUR)}`,
  );
  const headRow = c(
    ANSI.dim,
    `  ${pad('ID', COL_ID)}│${pad('Title', COL_TITLE)}│${pad('Status', COL_STATUS)}│${pad('Agent', COL_AGENT)}│${'Duration'.padEnd(COL_DUR)}`,
  );

  const parts: string[] = [header, headRow, divider];

  for (const row of effectiveRows) {
    const status = (evaluations?.get(row.id) ?? row.status ?? '').replace('GO_WITH_TECH_DEBT', 'TECH_DEBT');
    const color =
      status === 'DONE' ? ANSI.green : status === 'NO_GO' ? ANSI.red : status === 'TECH_DEBT' ? ANSI.yellow : ANSI.dim;
    const dur = row.durationMs ? formatDuration(row.durationMs) : '-';
    parts.push(
      `  ${pad(row.id, COL_ID)}│${pad(row.title, COL_TITLE)}│${c(color, pad(status, COL_STATUS))}│${pad(row.agent ?? '-', COL_AGENT)}│${dur.padEnd(COL_DUR)}`,
    );
  }

  return parts.join('\n');
}

/**
 * Render GO/NO_GO/TECH_DEBT summary counts on separate lines.
 */
function renderEvalCounts(evaluations: Map<string, string>): string {
  const { done, debt, nogo } = countEvals(evaluations);
  const header = c(ANSI.bold, 'Evaluation Summary');
  const lines = [
    header,
    `  ${c(ANSI.green, `GO (DONE):`)}        ${done}`,
    `  ${c(ANSI.yellow, `GO_WITH_TECH_DEBT:`)} ${debt}`,
    `  ${c(ANSI.red, `NO_GO:`)}             ${nogo}`,
  ];
  return lines.join('\n');
}

/**
 * Render config migration notice if a migration was applied.
 */
function renderConfigMigration(migrated?: boolean): string | null {
  if (!migrated) return null;
  return `${c(ANSI.bold, 'Config Migration')}\n  ${c(ANSI.green, '\u2713')} Config schema migrated to current version`;
}

/**
 * Render brain insights block.
 */
function renderBrainInsights(insights?: string): string | null {
  if (!insights || insights.trim().length === 0) return null;
  const header = c(ANSI.bold, 'Brain Insights');
  const lines = insights
    .trim()
    .split('\n')
    .map((l) => `  ${l}`)
    .join('\n');
  return `${header}\n${lines}`;
}

// ─── Main Export ────────────────────────────────────────────────────

/**
 * Format a rich, multi-section sprint summary with ANSI colors.
 * Sections: Header, Results, Changes, Tests, Agent Performance, Learnings, Next Steps.
 * Respects NO_COLOR env var and output_mode config.
 *
 * @param sprint - Sprint data including id, tasks, metrics, and timestamps.
 * @param evaluations - Map of task ID to evaluation string (DONE, GO_WITH_TECH_DEBT, NO_GO).
 * @param opts - Optional formatting options: gitDiff, agentPerf, learnings, outputMode.
 * @returns Formatted multi-line string with ANSI color codes (or plain text if NO_COLOR).
 */
export function formatRichSprintSummary(
  sprint: RichSprintInput,
  evaluations: Map<string, string>,
  opts?: RichSummaryOpts,
): string {
  const mode = opts?.outputMode ?? 'normal';
  const verbose = mode === 'verbose';

  // Quiet mode: results line only
  if (mode === 'quiet') {
    return renderResults(evaluations);
  }

  const sections: string[] = [];

  sections.push(renderHeader(sprint));
  sections.push(renderResults(evaluations));
  sections.push(renderEvalCounts(evaluations));
  sections.push(renderTaskTable(opts?.taskRows, evaluations));
  sections.push(renderChanges(opts?.gitDiff));
  sections.push(renderTests(sprint, verbose));
  sections.push(renderAgentPerformance(opts?.agentPerf));
  sections.push(renderLearnings(opts?.learnings));
  sections.push(renderNextSteps(evaluations, sprint));

  const migration = renderConfigMigration(opts?.configMigrated);
  if (migration) sections.push(migration);

  const insights = renderBrainInsights(opts?.brainInsights);
  if (insights) sections.push(insights);

  if (verbose) {
    // Extra detail: per-task breakdown
    const detail = c(ANSI.bold, 'Task Detail');
    const taskLines = [detail];
    for (const [id, val] of evaluations) {
      const color = val === 'DONE' ? ANSI.green : val === 'NO_GO' ? ANSI.red : ANSI.yellow;
      taskLines.push(`  ${id}: ${c(color, val)}`);
    }
    sections.push(taskLines.join('\n'));
  }

  return sections.join('\n\n');
}
