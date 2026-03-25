import { readFileSync, existsSync, watch as fsWatch } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import type { DashboardState } from '../../core/types.js';
import { DASHBOARD_FILE } from '../../core/constants.js';
import { resolveProjectRoot } from '../helpers/process.js';

interface DashboardOpts {
  interval?: string;
  noColor?: boolean;
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

/** Check if colors should be suppressed (NO_COLOR env or --no-color flag). */
export function isNoColor(flagValue?: boolean): boolean {
  return flagValue === true || process.env['NO_COLOR'] !== undefined;
}

export function renderDashboard(state: DashboardState, noColor?: boolean): string {
  const W = getTerminalWidth();
  const inner = W - 2;

  const top = `\u2554${'═'.repeat(inner)}\u2557`;
  const mid = `\u2560${'═'.repeat(inner)}\u2563`;
  const bot = `\u255A${'═'.repeat(inner)}\u255D`;
  const row = (content: string): string =>
    `\u2551 ${padRight(content, inner - 1)}\u2551`;

  // Sprint info
  const sprintHeader = `Sprint: ${state.sprint.id} (#${state.sprint.number})`;
  const sprintPhase = `Phase: ${state.sprint.phase}  Status: ${state.sprint.status}`;

  // Workers table — D) show agent/skill columns
  const agentColW = Math.max(10, Math.floor((inner - 1) * 0.15));
  const idColW = Math.max(10, Math.floor((inner - 1) * 0.18));
  const taskColW = Math.max(12, Math.floor((inner - 1) * 0.25));
  const statusColW = 10;
  const elapsedColW = 8;
  const agentNameColW = inner - 1 - idColW - taskColW - statusColW - elapsedColW - agentColW;
  const workerHeader =
    padRight('ID', idColW) +
    padRight('Task', taskColW) +
    padRight('Status', statusColW) +
    padRight('Elapsed', elapsedColW) +
    padRight('Agent', agentColW) +
    padRight('Skill', Math.max(0, agentNameColW));
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
  const progressLine = `[${bar}] ${p.done}/${p.total} done ${p.active} active ${p.blocked} pending`;

  // E) Usage metrics
  const usage = state.usage;
  const usageLine = usage
    ? `Usage: 5hr=${usage.fiveHourPercent}%  weekly=${usage.weeklyPercent}%  (as of ${new Date(usage.measuredAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })})`
    : 'Usage: --';

  // Alerts
  const alertLines = state.alerts.length > 0
    ? state.alerts.map((a) => {
        const ts = new Date(a.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        return row(`[${a.level}] ${a.message} (${ts})`);
      })
    : [row('No alerts.')];

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
    row(usageLine),
    mid,
    row('Alerts:'),
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
    .description('Show terminal dashboard with auto-refresh (see also: deckent status)')
    .option('--interval <ms>', 'Refresh interval in milliseconds (used as fallback when fs.watch unavailable)', '2000')
    .option('--no-color', 'Disable ANSI colors (also respects NO_COLOR env var)')
    .action((opts: DashboardOpts) => {
      const root = resolveProjectRoot();
      const dashPath = join(root, DASHBOARD_FILE);
      const noColor = isNoColor(opts.noColor);

      const render = (): void => {
        const state = readDashboardFile(dashPath);
        process.stdout.write('\x1Bc');
        if (!state) {
          process.stdout.write('No active sprint. Run deckent start first.\n');
          return;
        }
        process.stdout.write(renderDashboard(state, noColor) + '\n');
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

      const cleanup = (): void => {
        watcher?.close();
        if (fallbackTimer !== null) clearInterval(fallbackTimer);
        process.exit(0);
      };
      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);
    });
}
