import type { Command } from 'commander';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../../core/config.js';
import { DIRECTIVES_FILE } from '../../core/constants.js';
import {
  runSprint,
  BrainError,
} from '../../orchestra/brain.js';
import { print, printError, formatSprintSummary } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';

interface TestCommandOpts {
  keep?: boolean;
  timeout?: string;
}

const DEFAULT_TIMEOUT_MS = 300_000; // 5 minutes

export function registerTestRun(program: Command): void {
  program
    .command('test')
    .description('Run a test sprint (no retro, no memory update, no decay)')
    .option('--keep', 'Skip cleanup — leave task files in place')
    .option('--timeout <ms>', 'Maximum sprint duration in milliseconds', String(DEFAULT_TIMEOUT_MS))
    .action(async (opts: TestCommandOpts) => {
      const root = resolveProjectRoot();

      try {
        // Verify DIRECTIVES.md exists
        const directivesPath = join(root, DIRECTIVES_FILE);
        if (!existsSync(directivesPath)) {
          printError(new Error('DIRECTIVES.md not found. Create it before running test.'));
          process.exitCode = 1;
          return;
        }

        const config = await loadConfig(root);
        const timeoutMs = opts.timeout ? parseInt(opts.timeout, 10) : DEFAULT_TIMEOUT_MS;

        if (isNaN(timeoutMs) || timeoutMs <= 0) {
          printError(new Error(`Invalid timeout value: ${opts.timeout}`));
          process.exitCode = 1;
          return;
        }

        print(`Starting test sprint (timeout: ${timeoutMs}ms)...`);

        const sprint = await runSprint(root, config, {
          testMode: true,
          skipCleanup: opts.keep ?? false,
          timeoutMs,
        });

        // Determine exit code: 0 = all DONE, 1 = any NO_GO
        const hasNoGo = sprint.tasks.some(
          t => t.status === 'NO_GO' || (sprint.metrics?.noGoTasks ?? 0) > 0,
        );

        print(formatSprintSummary(sprint));

        if (opts.keep) {
          print('--keep flag active: task files preserved.');
        }

        if (hasNoGo) {
          process.exitCode = 1;
        }
      } catch (error) {
        if (error instanceof BrainError) {
          printError(new Error(`Test sprint failed at phase ${error.phase ?? 'unknown'}: ${error.message}`));
        } else {
          printError(error);
        }
        process.exitCode = 1;
      }
    });
}
