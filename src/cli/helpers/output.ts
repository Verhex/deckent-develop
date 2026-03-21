import type { DashboardState, DoctorResult, Sprint } from '../../core/types.js';
import { AgentStatus, SprintPhase } from '../../core/types.js';

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

export function formatDashboard(state: DashboardState): string {
  const W = 72;
  const inner = W - 2;

  const top = `\u2554${'═'.repeat(inner)}\u2557`;
  const mid = `\u2560${'═'.repeat(inner)}\u2563`;
  const bot = `\u255A${'═'.repeat(inner)}\u255D`;
  const row = (content: string): string =>
    `\u2551  ${padRight(content, inner - 2)}\u2551`;

  const time = state.updatedAt
    ? new Date(state.updatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : '--:--';

  const title = `DECKENT ORCHESTRA \u2014 Sprint ${state.sprint.number} \u2014 ${time}`;

  const agentLines = state.agents.map((a) => {
    const bar = `[${formatProgressBar(a.status === AgentStatus.DONE ? 100 : a.status === AgentStatus.IDLE ? 0 : 50)}]`;
    const tag = statusTag(a.status);
    const agentTag = formatAgentLabel(a.assignedAgent);
    const action = a.currentAction ?? `Next: ${phaseLabel(state.sprint.phase)}`;
    return row(`${padRight(a.id.toUpperCase(), 10)}${bar}  ${padRight(tag, 6)}${padRight(agentTag, 22)}${action}`);
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

export function formatSprintSummary(sprint: Sprint): string {
  const m = sprint.metrics;
  const lines = [
    `Sprint ${sprint.number} (${sprint.id}) — ${sprint.status}`,
    `Tasks: ${sprint.tasks.length} total`,
  ];

  if (m) {
    lines.push(
      `Completed: ${m.completedTasks}/${m.totalTasks}`,
      `Tech Debt: ${m.techDebtTasks} | NO-GO: ${m.noGoTasks}`,
      `Coverage: ${m.coveragePercent.toFixed(1)}%`,
      `Duration: ${Math.round(m.durationMs / 1000)}s`,
    );
  }

  return lines.join('\n');
}
