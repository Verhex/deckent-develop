import type { DashboardState, DoctorResult, Sprint, AgentInfo, Task, TaskResult } from '../../core/types.js';
import { AgentStatus, SprintPhase } from '../../core/types.js';
import { formatHumanSprintComplete } from '../../orchestra/sprint-reporter.js';
import { countBrainLines } from '../../core/utils.js';

// ─── NO_COLOR Support ───────────────────────────────────────────────

/**
 * Returns true if color output should be suppressed.
 * Respects NO_COLOR env var (https://no-color.org/) and --no-color flag.
 */
export function isNoColor(): boolean {
  return process.env.NO_COLOR !== undefined || process.argv.includes('--no-color');
}

/** Strip ANSI escape codes from text when NO_COLOR is active. */
export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

/** Conditionally apply ANSI color code, respecting NO_COLOR. */
export function color(code: string, text: string): string {
  if (isNoColor()) return text;
  return `${code}${text}\x1b[0m`;
}

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
    return color('\x1b[2m', 'generic');
  }
  return color('\x1b[36m', assignedAgent);
}

export function formatSkillsLabel(assignedSkills?: string[]): string {
  if (!assignedSkills || assignedSkills.length === 0) {
    return color('\x1b[2m', 'none');
  }
  return color('\x1b[33m', assignedSkills.join(', '));
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
  const lines = result.checks.map((c) => {
    if (c.passed) {
      return `  ${color('\x1b[32m', '[PASS]')} ${padRight(c.name, 14)}${c.message}`;
    }
    if (c.required) {
      return `  ${color('\x1b[31m', '[FAIL]')} ${padRight(c.name, 14)}${c.message}`;
    }
    return `  ${color('\x1b[33m', '[WARN]')} ${padRight(c.name, 14)}${c.message}`;
  });

  const passed = result.checks.filter((c) => c.passed).length;
  const total = result.checks.length;
  const failed = total - passed;
  const summary = failed > 0
    ? color('\x1b[31m', `Result: ${passed}/${total} checks passed (${failed} failed)`)
    : color('\x1b[32m', `Result: ${passed}/${total} checks passed`);

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
  projectRoot?: string;
  verbose?: boolean;
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
 * If taskCompletionTimesMs is provided, uses weighted average of last N tasks.
 */
export function estimateRemaining(
  done: number,
  total: number,
  elapsedMs: number,
  taskCompletionTimesMs?: number[],
): string | null {
  if (done <= 0 || total <= done) return null;

  let perTask: number;
  if (taskCompletionTimesMs && taskCompletionTimesMs.length >= 2) {
    // Weighted average: recent tasks weighted more heavily
    const times = taskCompletionTimesMs.slice(-5); // last 5
    let weightedSum = 0;
    let weightTotal = 0;
    for (let i = 0; i < times.length; i++) {
      const weight = i + 1; // more recent = higher weight
      weightedSum += (times[i] ?? 0) * weight;
      weightTotal += weight;
    }
    perTask = weightedSum / weightTotal;
  } else {
    perTask = elapsedMs / done;
  }

  const remaining = (total - done) * perTask;
  return `~${formatElapsed(remaining)}`;
}

/** Map a task status to a human-friendly label */
function taskStatusIcon(status: string): string {
  switch (status) {
    case 'DONE': return '  \u2713';
    case 'EXECUTING':
    case 'CODING':
    case 'VERIFYING':
    case 'TESTING':
    case 'DOCUMENTING':
      return '  \u25B6';
    case 'NO_GO': return '  \u2717';
    case 'PAUSED': return '  \u23F8';
    default: return '  \u00B7';
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
      issues.push(`  \u26A0 ${label} \u2014 error detected`);
    }
  }
  for (const task of tasks) {
    if (task.status === 'NO_GO') {
      issues.push(`  \u26A0 Task ${task.id} (${truncate(task.title, 30)}) \u2014 NO_GO`);
    }
  }
  return issues;
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '\u2026';
}

/**
 * Build standalone status from task files when no dashboard exists.
 */
export function formatStandaloneStatus(tasks: Task[], sprintId?: string): string {
  const lines: string[] = [];
  const label = sprintId ?? 'unknown';
  lines.push(`Sprint ${label} (standalone — no dashboard)`);

  const done = tasks.filter(t => t.status === 'DONE').length;
  const noGo = tasks.filter(t => t.status === 'NO_GO').length;
  const active = tasks.filter(t => ['EXECUTING', 'CODING', 'TESTING', 'DOCUMENTING', 'CLAIMED'].includes(t.status)).length;
  const pending = tasks.filter(t => ['PENDING', 'DRAFT'].includes(t.status)).length;
  const total = tasks.length;

  lines.push(`Progress: ${done}/${total} done, ${active} active, ${noGo} failed, ${pending} pending`);
  lines.push('');

  for (const task of tasks) {
    const icon = task.status === 'DONE' ? '\u2713' : task.status === 'NO_GO' ? '\u2717' : task.status === 'EXECUTING' ? '\u25B6' : '\u00B7';
    lines.push(`  ${icon} Task ${task.id} [${task.status}] ${truncate(task.title, 50)}`);
  }

  return lines.join('\n');
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
    ? `Sprint ${String(dashboard.sprint.number).padStart(3, '0')} \u2014 ${sprintTitle}`
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
    lines.push(`${taskStatusIcon('DONE')} Task ${task.id} (${truncate(task.title, 40)}) \u2014 Done`);
  }

  // Show active tasks with current action
  for (const task of activeTasks) {
    const action = describeTaskAction(task, dashboard.agents);
    lines.push(`${taskStatusIcon('EXECUTING')} Task ${task.id} (${truncate(task.title, 40)}) \u2014 ${action}`);
  }

  // Show NO_GO tasks
  for (const task of noGoTasks) {
    lines.push(`${taskStatusIcon('NO_GO')} Task ${task.id} (${truncate(task.title, 40)}) \u2014 Failed`);
  }

  // Show paused tasks
  for (const task of pausedTasks) {
    lines.push(`${taskStatusIcon('PAUSED')} Task ${task.id} (${truncate(task.title, 40)}) \u2014 Paused`);
  }

  // Show waiting tasks — collapse if many
  if (waitingTasks.length > 0 && waitingTasks.length <= 3) {
    for (const task of waitingTasks) {
      const depLabel = task.dependencies.length > 0
        ? `Waiting for ${task.dependencies.join(', ')}`
        : 'Queued';
      lines.push(`${taskStatusIcon('PENDING')} Task ${task.id} (${truncate(task.title, 40)}) \u2014 ${depLabel}`);
    }
  } else if (waitingTasks.length > 3) {
    // Show first 2, then collapse
    for (const task of waitingTasks.slice(0, 2)) {
      const depLabel = task.dependencies.length > 0
        ? `Waiting for ${task.dependencies.join(', ')}`
        : 'Queued';
      lines.push(`${taskStatusIcon('PENDING')} Task ${task.id} (${truncate(task.title, 40)}) \u2014 ${depLabel}`);
    }
    const remainIds = waitingTasks.slice(2).map(t => t.id);
    lines.push(`  \u00B7 Tasks ${remainIds.join(', ')} \u2014 Queued`);
  }

  // ─── Issues ──────────────────────────────────────
  const issues = findIssues(tasks, dashboard.agents);
  if (issues.length > 0) {
    lines.push('');
    lines.push('Issues:');
    lines.push(...issues);
  }

  // ─── Alerts (H) ─────────────────────────────────
  if (dashboard.alerts.length > 0) {
    lines.push('');
    lines.push(`Alerts (${dashboard.alerts.length}):`);
    for (const alert of dashboard.alerts.slice(0, 10)) {
      const level = alert.level === 'CRITICAL' ? '!!' : alert.level === 'WARNING' ? '!' : 'i';
      lines.push(`  [${level}] ${alert.message}`);
    }
    if (dashboard.alerts.length > 10) {
      lines.push(`  ... and ${dashboard.alerts.length - 10} more`);
    }
  }

  // ─── Budget Check (G) ──────────────────────────
  if (input.projectRoot) {
    try {
      const brainLines = countBrainLines(input.projectRoot);
      const maxBudget = 600;
      if (brainLines > maxBudget) {
        lines.push('');
        lines.push(`Budget: ${color('\x1b[31m', `OVER (${brainLines}/${maxBudget} lines)`)} \u2014 run \`deckent cleanup --decay\``);
      } else if (brainLines > maxBudget * 0.8) {
        lines.push('');
        lines.push(`Budget: ${color('\x1b[33m', `${brainLines}/${maxBudget} lines`)} (${Math.round(brainLines / maxBudget * 100)}%)`);
      } else {
        lines.push('');
        lines.push(`Budget: ${brainLines}/${maxBudget} lines (OK)`);
      }
    } catch {
      // ignore budget check errors
    }
  }

  // ─── Stale Warning (J) ─────────────────────────
  if (dashboard.updatedAt) {
    const dashAge = now - new Date(dashboard.updatedAt).getTime();
    if (dashAge > 60_000) {
      lines.push('');
      lines.push(color('\x1b[33m', `Warning: Dashboard data is ${formatElapsed(dashAge)} old \u2014 may be stale`));
    }
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

  // ─── Verbose: Agent/Skill detail ─────────────────
  if (input.verbose && tasks.length > 0) {
    lines.push('');
    lines.push('Agent/Skill Assignments:');
    for (const task of tasks) {
      const agent = task.assignedAgent ?? 'generic';
      const skills = task.assignedSkills?.join(', ') || 'none';
      lines.push(`  Task ${task.id}: agent=${agent}, skills=${skills}`);
    }
  }

  return lines.join('\n');
}
