import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import type { DashboardState } from '../../core/types.js';
import { DASHBOARD_FILE } from '../../core/constants.js';
import { print, printError, formatDashboard } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getMessage } from '../helpers/messages.js';

interface StatusOpts {
  watch?: boolean;
  json?: boolean;
}

function readDashboard(dashPath: string): DashboardState | null {
  if (!existsSync(dashPath)) return null;
  try {
    return JSON.parse(readFileSync(dashPath, 'utf-8')) as DashboardState;
  } catch {
    return null;
  }
}

/**
 * Reads the language setting from the project config synchronously.
 * Falls back to 'en' if the config is missing or unreadable.
 */
export function getLangFromRoot(root: string): string {
  try {
    const configPath = join(root, '.deckent', 'config.json');
    if (!existsSync(configPath)) return 'en';
    const raw = readFileSync(configPath, 'utf-8');
    const cfg = JSON.parse(raw) as { language?: string };
    return cfg.language === 'tr' ? 'tr' : 'en';
  } catch {
    return 'en';
  }
}

export function registerStatus(program: Command): void {
  program
    .command('status')
    .description('Show the current sprint dashboard')
    .option('--watch', 'Auto-refresh every 2 seconds')
    .option('--json', 'Output raw JSON instead of formatted dashboard')
    .action((opts: StatusOpts) => {
      const root = resolveProjectRoot();
      const dashPath = join(root, DASHBOARD_FILE);
      const lang = getLangFromRoot(root);

      if (!existsSync(dashPath)) {
        print(getMessage('status.no_active_sprint', lang));
        return;
      }

      if (opts.watch) {
        const render = (): void => {
          const state = readDashboard(dashPath);
          if (state) {
            process.stdout.write('\x1Bc'); // clear screen
            if (opts.json) {
              print(JSON.stringify(state, null, 2));
            } else {
              print(formatDashboard(state));
            }
          }
        };
        render();
        const timer = setInterval(render, 2000);
        const cleanup = (): void => { clearInterval(timer); process.exit(0); };
        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
        return;
      }

      try {
        const raw = readFileSync(dashPath, 'utf-8');
        const state = JSON.parse(raw) as DashboardState;
        if (opts.json) {
          print(JSON.stringify(state, null, 2));
        } else {
          print(formatDashboard(state));
        }
      } catch (error) {
        printError(new Error(getMessage('status.dashboard_read_failed', lang)));
        process.exitCode = 1;
      }
    });
}
