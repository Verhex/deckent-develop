import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import type { DashboardState } from '../../core/types.js';
import { DASHBOARD_FILE } from '../../core/constants.js';
import { resolveProjectRoot } from '../helpers/process.js';

interface DashboardOpts {
  interval?: string;
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

export function renderDashboard(state: DashboardState): string {
  const W = 62;
  const inner = W - 2;

  const top = `\u2554${'═'.repeat(inner)}\u2557`;
  const mid = `\u2560${'═'.repeat(inner)}\u2563`;
  const bot = `\u255A${'═'.repeat(inner)}\u255D`;
  const row = (content: string): string =>
    `\u2551 ${padRight(content, inner - 1)}\u2551`;

  // Sprint info
  const sprintHeader = `Sprint: ${state.sprint.id} (#${state.sprint.number})`;
  const sprintPhase = `Phase: ${state.sprint.phase}  Status: ${state.sprint.status}`;

  // Workers table
  const workerHeader = padRight('ID', 12) + padRight('Task', 20) + padRight('Status', 10) + 'Elapsed';
  const workerSep = '-'.repeat(inner - 1);
  const workerRows = state.agents.map((a) => {
    const id = padRight(a.id, 12);
    const task = padRight(a.taskId ?? '-', 20);
    const status = padRight(a.status, 10);
    const elapsed = formatElapsed(a.spawnedAt);
    return row(`${id}${task}${status}${elapsed}`);
  });

  // Progress bar
  const p = state.progress;
  const total = p.total || 1;
  const barWidth = 20;
  const filledWidth = Math.round((p.done / total) * barWidth);
  const activeWidth = Math.round((p.active / total) * barWidth);
  const pendingWidth = barWidth - filledWidth - activeWidth;
  const bar = '#'.repeat(filledWidth) + '+'.repeat(activeWidth) + '.'.repeat(Math.max(0, pendingWidth));
  const progressLine = `[${bar}] ${p.done}/${p.total} done ${p.active} active ${p.blocked} pending`;

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

  return [
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
    row('Alerts:'),
    ...alertLines,
    bot,
  ].join('\n');
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
    .description('Show terminal dashboard with auto-refresh')
    .option('--interval <ms>', 'Refresh interval in milliseconds', '2000')
    .action((opts: DashboardOpts) => {
      const root = resolveProjectRoot();
      const dashPath = join(root, DASHBOARD_FILE);
      const interval = parseInt(opts.interval ?? '2000', 10);

      const render = (): void => {
        const state = readDashboardFile(dashPath);
        if (!state) {
          process.stdout.write('\x1Bc');
          process.stdout.write('No active sprint. Run deckent start first.\n');
          return;
        }
        process.stdout.write('\x1Bc');
        process.stdout.write(renderDashboard(state) + '\n');
      };

      render();
      const timer = setInterval(render, interval);
      const cleanup = (): void => {
        clearInterval(timer);
        process.exit(0);
      };
      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);
    });
}
