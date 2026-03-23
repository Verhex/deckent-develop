import type { DashboardState, DoctorResult, Sprint, AgentInfo, Task, TaskResult } from '../../core/types.js';
import { AgentStatus, SprintPhase } from '../../core/types.js';
import { formatHumanSprintComplete } from '../../orchestra/sprint-reporter.js';

// ─── Credential Redaction ───────────────────────────────────────────

const REDACTED = '[REDACTED]';

/**
 * Redact sensitive credentials from text to prevent leaking secrets in logs.
 * Handles: API keys, Bearer tokens, passwords in URLs, env var assignments.
 */
export function redactSensitive(text: string): string {
  if (!text) return text;

  let result = text;

  // API keys: sk-... patterns (OpenAI, Anthropic style) — at least 20 chars after prefix
  result = result.replace(/\b(sk-[a-zA-Z0-9_-]{20,})\b/g, REDACTED);

  // API keys: key-... patterns — at least 20 chars after prefix
  result = result.replace(/\b(key-[a-zA-Z0-9_-]{20,})\b/g, REDACTED);

  // Bearer tokens: "Bearer <token>" or "bearer <token>"
  result = result.replace(/(Bearer\s+)[^\s"',;]+/gi, `$1${REDACTED}`);

  // Passwords in URLs: ://user:password@host
  result = result.replace(/(:\/\/[^:/?#\s]+:)[^@\s]+(@)/g, `$1${REDACTED}$2`);

  // Environment variable assignments for known sensitive keys
  result = result.replace(
    /((?:OPENAI_API_KEY|ANTHROPIC_API_KEY|CLAUDE_API_KEY|API_KEY|SECRET_KEY|ACCESS_TOKEN|AUTH_TOKEN|PRIVATE_KEY)=)[^\s"';]+/gi,
    `$1${REDACTED}`,
  );

  return result;
}

// ─── Basic Output ───────────────────────────────────────────────────

export function print(message: string): void {
  process.stdout.write(message + '\n');
}

export function printError(error: unknown): void {
  const msg = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Error: ${msg}\n`);
}

// ─── Progress Bar ───────────────────────────────────────────────────

export function formatProgressBar(percent: number, width = 8): string {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clamped / 100) * width);
  return '#'.repeat(filled) + '.'.repeat(width - filled);
}

// ─── Table Formatting ───────────────────────────────────────────────

export function formatTable(headers: string[], rows: string[][]): string {
  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)),
  );

  const sep = colWidths.map((w) => '-'.repeat(w + 2)).join('+');
  const formatRow = (cells: string[]): string =>
    cells.map((c, i) => ` ${(c ?? '').padEnd(colWidths[i] ?? 0)} `).join('|');

  const lines = [formatRow(headers), sep, ...rows.map(formatRow)];
  return lines.join('\n');
}

// ─── Dashboard ──────────────────────────────────────────────────────

function padRight(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);
}

/** Visible length excluding ANSI escape codes. */
function visibleLength(str: string): number {
  return str.replace(/\x1b\[[0-9;]*m/g, '').length;
}

/** Pad string accounting for ANSI escape codes. */
function padRightAnsi(str: string, len: number): string {
  const visible = visibleLength(str);
  if (visible >= len) return str;
  return str + ' '.repeat(len - visible);
}

function statusTag(status: AgentStatus): string {
  const map: Record<string, string> = {
    [AgentStatus.IDLE]: 'IDLE',
    [AgentStatus.CODING]: 'CODE',
    [AgentStatus.TESTING]: 'TEST',
    [AgentStatus.PLANNING]: 'PLAN',
    [AgentStatus.EXECUTING]: 'EXEC',
    [AgentStatus.EVALUATING]: 'EVAL',
    [AgentStatus.SCANNING]: 'SCAN',
    [AgentStatus.DOCUMENTING]: 'DOCS',
    [AgentStatus.DONE]: 'DONE',
    [AgentStatus.ERROR]: 'ERR!',
    [AgentStatus.PAUSED]: 'PAUS',
  };
  return map[status] ?? status.slice(0, 4).toUpperCase();
}

function phaseLabel(phase: SprintPhase): string {
  return phase.toLowerCase();
}

export function formatAgentLabel(assignedAgent?: string): string {
  if (!assignedAgent || assignedAgent === 'generic') {
    return '\x1b[2mgeneric\x1b[0m';
  }
  return `\x1b[36m${assignedAgent}\x1b[0m`;
}

export function formatSkillsLabel(assignedSkills?: string[]): string {
  if (!assignedSkills || assignedSkills.length === 0) {
    return '\x1b[2mnone\x1b[0m';
  }
  return `\x1b[33m${assignedSkills.join(', ')}\x1b[0m`;
}

export function formatDashboard(state: DashboardState): string {
  const W = 72;
  const inner = W - 2;

  const top = `\u2554${'═'.repeat(inner)}\u2557`;
  const mid = `\u2560${'═'.repeat(inner)}\u2563`;
  const bot = `\u255A${'═'.repeat(inner)}\u255D`;
  const row = (content: string): string =>
    `\u2551  ${padRightAnsi(content, inner - 2)}\u2551`;

  const time = state.updatedAt
    ? new Date(state.updatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : '--:--';

  const title = `DECKENT ORCHESTRA \u2014 Sprint ${state.sprint.number} \u2014 ${time}`;

  const agentLines = state.agents.map((a) => {
    const bar = `[${formatProgressBar(a.status === AgentStatus.DONE ? 100 : a.status === AgentStatus.IDLE ? 0 : 50)}]`;
    const tag = statusTag(a.status);
    const agentTag = formatAgentLabel(a.assignedAgent);
    const skillsTag = formatSkillsLabel((a as AgentInfo & { assignedSkills?: string[] }).assignedSkills);
    const action = a.currentAction ?? `Next: ${phaseLabel(state.sprint.phase)}`;
    return row(`${padRight(a.id.toUpperCase(), 10)}${bar}  ${padRight(tag, 6)}${padRightAnsi(agentTag, 14)}${padRightAnsi(skillsTag, 12)}${action}`);
  });

  const p = state.progress;
  const progressLine = `Progress: ${p.done}/${p.total} done | ${p.active} active | ${p.blocked} blocked`;
  const u = state.usage;
  const usageLine = `Usage: 5hr ${Math.round(u.fiveHourPercent)}% | Weekly ${Math.round(u.weeklyPercent)}% | Budget: OK`;
  const alertLine = `Alerts: ${state.alerts.length}`;

  return [
    top,
    row(title),
    mid,
    ...agentLines,
    mid,
    row(progressLine),
    row(usageLine),
    row(alertLine),
    bot,
  ].join('\n');
}

// ─── Doctor ─────────────────────────────────────────────────────────

export function formatDoctorResult(result: DoctorResult): string {
  const green = '\x1b[32m';
  const yellow = '\x1b[33m';
  const red = '\x1b[31m';
  const reset = '\x1b[0m';

  const lines = result.checks.map((c) => {
    if (c.passed) {
      return `  ${green}[PASS]${reset} ${padRight(c.name, 14)}${c.message}`;
    }
    if (c.required) {
      return `  ${red}[FAIL]${reset} ${padRight(c.name, 14)}${c.message}`;
    }
    return `  ${yellow}[WARN]${reset} ${padRight(c.name, 14)}${c.message}`;
  });

  const passed = result.checks.filter((c) => c.passed).length;
  const total = result.checks.length;
  const failed = total - passed;
  const summaryColor = failed > 0 ? red : green;
  const summary = failed > 0
    ? `${summaryColor}Result: ${passed}/${total} checks passed (${failed} failed)${reset}`
    : `${summaryColor}Result: ${passed}/${total} checks passed${reset}`;

  return [...lines, '', `  ${summary}`].join('\n');
}

// ─── Sprint Summary ─────────────────────────────────────────────────

export function formatSprintSummary(sprint: Sprint, results?: TaskResult[]): string {
  return formatHumanSprintComplete({ sprint, results });
}

// ─── Human-Friendly Status ──────────────────────────────────────────

export interface HumanStatusInput {
  dashboard: DashboardState;
  tasks: Task[];
  sprintTitle?: string;
  sprintStartedAt?: string;
  nowMs?: number;
}

/**
 * Format elapsed time in human-readable form.
 * Returns e.g. "12 min", "1 hr 5 min", "45 sec"
 */
export function formatElapsed(ms: number): string {
  if (ms < 0) return '0 sec';
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec} sec`;
  const min = Math.floor(totalSec / 60);
  if (min < 60) return `${min} min`;
  const hr = Math.floor(min / 60);
  const remainMin = min % 60;
  if (remainMin === 0) return `${hr} hr`;
  return `${hr} hr ${remainMin} min`;
}

/**
 * Estimate remaining time based on progress.
 * Returns formatted string like "~8 min" or null if not estimable.
 */
export function estimateRemaining(
  done: number,
  total: number,
  elapsedMs: number,
): string | null {
  if (done <= 0 || total <= done) return null;
  const perTask = elapsedMs / done;
  const remaining = (total - done) * perTask;
  return `~${formatElapsed(remaining)}`;
}

/** Map a task status to a human-friendly label */
function taskStatusIcon(status: string): string {
  switch (status) {
    case 'DONE': return '  ✓';
    case 'EXECUTING':
    case 'CODING':
    case 'VERIFYING':
    case 'TESTING':
    case 'DOCUMENTING':
      return '  ▶';
    case 'NO_GO': return '  ✗';
    case 'PAUSED': return '  ⏸';
    default: return '  ·';
  }
}

/** Get a short human description of what a task is doing based on heartbeat/status */
function describeTaskAction(task: Task, agents: AgentInfo[]): string {
  // Find matching agent for this task
  const agent = agents.find(a => a.taskId === task.id);

  if (task.status === 'DONE') {
    return 'Done';
  }
  if (task.status === 'NO_GO') {
    return 'Failed';
  }
  if (task.status === 'PAUSED') {
    return 'Paused';
  }

  if (agent?.currentAction) {
    return agent.currentAction;
  }

  switch (task.status) {
    case 'EXECUTING': return 'Writing code';
    case 'TESTING': return 'Running tests';
    case 'DOCUMENTING': return 'Documenting';
    case 'CLAIMED': return 'Starting';
    default: return '';
  }
}

/** Identify tasks that had issues (retries, warnings) */
export function findIssues(tasks: Task[], agents: AgentInfo[]): string[] {
  const issues: string[] = [];
  for (const agent of agents) {
    if (agent.status === AgentStatus.ERROR) {
      const task = tasks.find(t => t.id === agent.taskId);
      const label = task ? `Task ${task.id} (${truncate(task.title, 30)})` : `Agent ${agent.id}`;
      issues.push(`  ⚠ ${label} — error detected`);
    }
  }
  for (const task of tasks) {
    if (task.status === 'NO_GO') {
      issues.push(`  ⚠ Task ${task.id} (${truncate(task.title, 30)}) — NO_GO`);
    }
  }
  return issues;
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '…';
}

/**
 * Format a complete human-friendly status display.
 * No raw JSON, no jargon — tells a story about what's happening.
 */
export function formatHumanStatus(input: HumanStatusInput): string {
  const { dashboard, tasks, sprintTitle, sprintStartedAt } = input;
  const now = input.nowMs ?? Date.now();
  const lines: string[] = [];

  // ─── Header ──────────────────────────────────────
  const sprintLabel = sprintTitle
    ? `Sprint ${String(dashboard.sprint.number).padStart(3, '0')} — ${sprintTitle}`
    : `Sprint ${String(dashboard.sprint.number).padStart(3, '0')}`;
  lines.push(sprintLabel);

  // ─── Progress ────────────────────────────────────
  const p = dashboard.progress;
  const total = p.total || tasks.length || 1;
  const done = p.done;
  const pct = Math.round((done / total) * 100);
  lines.push(`Progress: ${done}/${total} tasks done (${pct}%)`);
  lines.push(`Active: ${p.active} worker${p.active !== 1 ? 's' : ''} running`);

  // ─── Time ────────────────────────────────────────
  if (sprintStartedAt) {
    const elapsedMs = now - new Date(sprintStartedAt).getTime();
    const elapsed = formatElapsed(elapsedMs);
    const eta = estimateRemaining(done, total, elapsedMs);
    const timeLine = eta
      ? `Time: ${elapsed} elapsed, ${eta} remaining`
      : `Time: ${elapsed} elapsed`;
    lines.push(timeLine);
  }

  lines.push('');

  // ─── What's happening ───────────────────────────
  lines.push("What's happening:");

  // Group tasks by status category
  const doneTasks = tasks.filter(t => t.status === 'DONE');
  const activeTasks = tasks.filter(t =>
    ['EXECUTING', 'CODING', 'VERIFYING', 'TESTING', 'DOCUMENTING', 'CLAIMED'].includes(t.status),
  );
  const noGoTasks = tasks.filter(t => t.status === 'NO_GO');
  const waitingTasks = tasks.filter(t =>
    ['PENDING', 'DRAFT'].includes(t.status),
  );
  const pausedTasks = tasks.filter(t => t.status === 'PAUSED');

  // Show done tasks
  for (const task of doneTasks) {
    lines.push(`${taskStatusIcon('DONE')} Task ${task.id} (${truncate(task.title, 40)}) — Done`);
  }

  // Show active tasks with current action
  for (const task of activeTasks) {
    const action = describeTaskAction(task, dashboard.agents);
    lines.push(`${taskStatusIcon('EXECUTING')} Task ${task.id} (${truncate(task.title, 40)}) — ${action}`);
  }

  // Show NO_GO tasks
  for (const task of noGoTasks) {
    lines.push(`${taskStatusIcon('NO_GO')} Task ${task.id} (${truncate(task.title, 40)}) — Failed`);
  }

  // Show paused tasks
  for (const task of pausedTasks) {
    lines.push(`${taskStatusIcon('PAUSED')} Task ${task.id} (${truncate(task.title, 40)}) — Paused`);
  }

  // Show waiting tasks — collapse if many
  if (waitingTasks.length > 0 && waitingTasks.length <= 3) {
    for (const task of waitingTasks) {
      const depLabel = task.dependencies.length > 0
        ? `Waiting for ${task.dependencies.join(', ')}`
        : 'Queued';
      lines.push(`${taskStatusIcon('PENDING')} Task ${task.id} (${truncate(task.title, 40)}) — ${depLabel}`);
    }
  } else if (waitingTasks.length > 3) {
    // Show first 2, then collapse
    for (const task of waitingTasks.slice(0, 2)) {
      const depLabel = task.dependencies.length > 0
        ? `Waiting for ${task.dependencies.join(', ')}`
        : 'Queued';
      lines.push(`${taskStatusIcon('PENDING')} Task ${task.id} (${truncate(task.title, 40)}) — ${depLabel}`);
    }
    const remainIds = waitingTasks.slice(2).map(t => t.id);
    lines.push(`  · Tasks ${remainIds.join(', ')} — Queued`);
  }

  // ─── Issues ──────────────────────────────────────
  const issues = findIssues(tasks, dashboard.agents);
  if (issues.length > 0) {
    lines.push('');
    lines.push('Issues:');
    lines.push(...issues);
  }

  // ─── Blocked ─────────────────────────────────────
  if (p.blocked > 0) {
    lines.push('');
    lines.push(`Blocked: ${p.blocked} task${p.blocked !== 1 ? 's' : ''} blocked by dependencies`);
  }

  // ─── Next ────────────────────────────────────────
  if (waitingTasks.length > 0) {
    lines.push('');
    lines.push(`Next: ${waitingTasks.length} task${waitingTasks.length !== 1 ? 's' : ''} will start as workers free up`);
  }

  return lines.join('\n');
}
