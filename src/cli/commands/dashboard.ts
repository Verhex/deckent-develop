import { readFileSync, existsSync, watch as fsWatch } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import type { DashboardState } from '../../core/types.js';
import { DASHBOARD_FILE } from '../../core/constants.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getMessage } from '../helpers/messages.js';
import { detectLang } from '../helpers/i18n.js';
import { registerShutdownHook } from '../helpers/shutdown-hooks.js';
// Canonical NO_COLOR check (R4-ISNOCOLOR SSOT) lives in ../helpers/output.ts.
// Re-exported here so the former `dashboard.js` import path keeps working
// against the single source of truth — no duplicate body.
import { isNoColor } from '../helpers/output.js';
export { isNoColor } from '../helpers/output.js';

interface DashboardOpts {
  interval?: string;
  noColor?: boolean;
  json?: boolean;
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);
}

function formatElapsed(spawnedAt?: string): string {
  if (!spawnedAt) return '--:--';
  const ms = Date.now() - new Date(spawnedAt).getTime();
  const secs = Math.floor(ms / 1000);
  const mins = Math.floor(secs / 60);
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) return `${hrs}h${String(mins % 60).padStart(2, '0')}m`;
  return `${mins}m${String(secs % 60).padStart(2, '0')}s`;
}

/** Returns the effective terminal width, capped to sensible range. */
function getTerminalWidth(): number {
  const cols = process.stdout.columns ?? 80;
  return Math.max(40, Math.min(cols, 200));
}

export function renderDashboard(state: DashboardState, noColor?: boolean, lang: string = 'en'): string {
  const W = getTerminalWidth();
  const inner = W - 2;

  const top = `\u2554${'═'.repeat(inner)}\u2557`;
  const mid = `\u2560${'═'.repeat(inner)}\u2563`;
  const bot = `\u255A${'═'.repeat(inner)}\u255D`;
  const row = (content: string): string =>
    `\u2551 ${padRight(content, inner - 1)}\u2551`;

  // Sprint info
  const sprintHeader = getMessage('dashboard.sprint_line', lang, { id: state.sprint.id, number: String(state.sprint.number) });
  const sprintPhase = getMessage('dashboard.phase_status', lang, { phase: state.sprint.phase, status: state.sprint.status });

  // Workers table — D) show agent/skill columns
  const agentColW = Math.max(10, Math.floor((inner - 1) * 0.15));
  const idColW = Math.max(10, Math.floor((inner - 1) * 0.18));
  const taskColW = Math.max(12, Math.floor((inner - 1) * 0.25));
  const statusColW = 10;
  const elapsedColW = 8;
  const agentNameColW = inner - 1 - idColW - taskColW - statusColW - elapsedColW - agentColW;
  const workerHeader =
    padRight(getMessage('dashboard.col_id', lang), idColW) +
    padRight(getMessage('dashboard.col_task', lang), taskColW) +
    padRight(getMessage('dashboard.col_status', lang), statusColW) +
    padRight(getMessage('dashboard.col_elapsed', lang), elapsedColW) +
    padRight(getMessage('dashboard.col_agent', lang), agentColW) +
    padRight(getMessage('dashboard.col_skill', lang), Math.max(0, agentNameColW));
  const workerSep = '-'.repeat(inner - 1);
  const workerRows = state.agents.map((a) => {
    const id = padRight(a.id, idColW);
    const task = padRight(a.taskId ?? '-', taskColW);
    const status = padRight(a.status, statusColW);
    const elapsed = padRight(formatElapsed(a.spawnedAt), elapsedColW);
    const agentName = padRight(a.assignedAgent ?? '-', agentColW);
    const skillCol = padRight('-', Math.max(0, agentNameColW));
    return row(`${id}${task}${status}${elapsed}${agentName}${skillCol}`);
  });

  // Progress bar
  const p = state.progress;
  const total = p.total || 1;
  const barWidth = Math.max(10, Math.floor((inner - 30) * 0.3));
  const filledWidth = Math.round((p.done / total) * barWidth);
  const activeWidth = Math.round((p.active / total) * barWidth);
  const pendingWidth = barWidth - filledWidth - activeWidth;
  const bar = '#'.repeat(filledWidth) + '+'.repeat(activeWidth) + '.'.repeat(Math.max(0, pendingWidth));
  const progressLine = `[${bar}] ${getMessage('dashboard.progress', lang, { done: String(p.done), total: String(p.total), active: String(p.active), blocked: String(p.blocked) })}`;

  // Alerts
  const alertLines = state.alerts.length > 0
    ? state.alerts.map((a) => {
        const ts = new Date(a.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        return row(`[${a.level}] ${a.message} (${ts})`);
      })
    : [row(getMessage('dashboard.no_alerts', lang))];

  const time = state.updatedAt
    ? new Date(state.updatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '--:--:--';

  const lines = [
    top,
    row(`DECKENT DASHBOARD  ${time}`),
    mid,
    row(sprintHeader),
    row(sprintPhase),
    mid,
    row(workerHeader),
    row(workerSep),
    ...workerRows,
    mid,
    row(progressLine),
    mid,
    row(getMessage('dashboard.alerts_label', lang)),
    ...alertLines,
    bot,
  ].join('\n');

  // C/B already handled: width is dynamic, colors can be stripped
  if (noColor) {
    // Strip ANSI box-drawing characters — replace with ASCII equivalents
    return lines
      .replace(/\u2554/g, '+')
      .replace(/\u2557/g, '+')
      .replace(/\u2560/g, '+')
      .replace(/\u2563/g, '+')
      .replace(/\u255A/g, '+')
      .replace(/\u255D/g, '+')
      .replace(/\u2551/g, '|')
      .replace(/═/g, '-');
  }

  return lines;
}

export function readDashboardFile(dashPath: string): DashboardState | null {
  if (!existsSync(dashPath)) return null;
  try {
    return JSON.parse(readFileSync(dashPath, 'utf-8')) as DashboardState;
  } catch {
    return null;
  }
}

export function registerDashboard(program: Command): void {
  program
    .command('dashboard')
    .description('Show terminal dashboard with auto-refresh (see also: deckent status --watch)')
    .option('--interval <ms>', 'Refresh interval in milliseconds (used as fallback when fs.watch unavailable)', '2000')
    .option('--no-color', 'Disable ANSI colors (also respects NO_COLOR env var)')
    .option('--json', 'Output dashboard state as raw JSON and exit (shared format with deckent status --raw)')
    .action((opts: DashboardOpts) => {
      const root = resolveProjectRoot();
      const dashPath = join(root, DASHBOARD_FILE);
      const noColor = isNoColor(opts.noColor);
      const lang = detectLang(root);

      // A) --json: output raw dashboard JSON (same as status --raw) and exit
      if (opts.json) {
        const state = readDashboardFile(dashPath);
        if (!state) {
          process.stdout.write(JSON.stringify({ error: 'No active sprint. Run deckent start first.' }) + '\n');
          process.exitCode = 1;
          return;
        }
        process.stdout.write(JSON.stringify(state, null, 2) + '\n');
        return;
      }

      const render = (): void => {
        const state = readDashboardFile(dashPath);
        process.stdout.write('\x1Bc');
        if (!state) {
          process.stdout.write(getMessage('dashboard.no_active_sprint', lang) + '\n');
          return;
        }
        process.stdout.write(renderDashboard(state, noColor, lang) + '\n');
      };

      render();

      // B) Use fs.watch for instant updates, fall back to setInterval
      let watcher: ReturnType<typeof fsWatch> | null = null;
      let fallbackTimer: ReturnType<typeof setInterval> | null = null;

      try {
        // Watch the directory containing the dashboard file for changes
        const dashDir = join(root, '.');
        watcher = fsWatch(dashDir, { persistent: true }, (_eventType, filename) => {
          if (filename === DASHBOARD_FILE || filename === '.dashboard') {
            render();
          }
        });
        watcher.on('error', () => {
          // fs.watch failed — fall back to polling
          watcher?.close();
          watcher = null;
          const interval = parseInt(opts.interval ?? '2000', 10);
          fallbackTimer = setInterval(render, interval);
        });
      } catch {
        // fs.watch not available — use polling
        const interval = parseInt(opts.interval ?? '2000', 10);
        fallbackTimer = setInterval(render, interval);
      }

      // born-587 (DEAD-LISTENER-MIGRATION): a command-level process.on
      // (SIGINT/SIGTERM) here is dead code — entry.ts's bootstrap-time
      // onSignal wins registration order and exits synchronously before this
      // listener ever runs (see src/cli/helpers/shutdown-hooks.ts's module
      // doc). Route the same cleanup through the shared registry instead.
      registerShutdownHook(async () => {
        watcher?.close();
        if (fallbackTimer !== null) clearInterval(fallbackTimer);
      });
    });
}
