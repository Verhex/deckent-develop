import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import type { DashboardState } from '../../core/types.js';
import { DASHBOARD_FILE } from '../../core/constants.js';
import { print, printError, formatDashboard } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';

export function registerStatus(program: Command): void {
  program
    .command('status')
    .description('Show the current sprint dashboard')
    .action(() => {
      const root = resolveProjectRoot();
      const dashPath = join(root, DASHBOARD_FILE);

      if (!existsSync(dashPath)) {
        print('No active sprint. Run `deckent start` first.');
        return;
      }

      try {
        const raw = readFileSync(dashPath, 'utf-8');
        const state = JSON.parse(raw) as DashboardState;
        print(formatDashboard(state));
      } catch (error) {
        printError(new Error('Failed to read dashboard file.'));
        process.exitCode = 1;
      }
    });
}
