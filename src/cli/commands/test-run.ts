import type { Command } from 'commander';
import { existsSync, copyFileSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import { execSync } from 'node:child_process';
import { loadConfig } from '../../core/config.js';
import { bootstrapProviders } from '../../core/provider.js';
import { DIRECTIVES_FILE } from '../../core/constants.js';
import type { ModelType } from '../../core/types.js';
import { resolveCanonicalModelIdentity } from '../../core/model-registry.js';
import {
  runSprint,
  BrainError,
} from '../../orchestra/brain.js';
import { print, printError, formatSprintSummary } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getLanguage, getMessage } from '../helpers/messages.js';
import { cliContractMessage, renderContractHelp } from '../helpers/message-catalog/cli-run.js';

export type TestReporter = 'default' | 'junit' | 'tap';

interface TestCommandOpts {
  keep?: boolean;
  timeout?: string;
  directives?: string;
  sandbox?: boolean;
  model?: string;
  reporter?: string;
  minCoverage?: string;
}

const DEFAULT_TIMEOUT_MS = 300_000; // 5 minutes

/** Apply git stash to isolate the working tree. Returns the stash ref or null if nothing to stash. */
export function gitStash(projectRoot: string): boolean {
  try {
    const output = execSync('git stash push -u -m "deckent-test-sandbox"', {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return !output.includes('No local changes');
  } catch {
    return false;
  }
}

/** Pop the most recent stash to restore working tree. */
export function gitStashPop(projectRoot: string): void {
  try {
    execSync('git stash pop', {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch { /* ignore */ }
}

/** Format test results in JUnit XML format */
export function formatJUnit(sprintId: string, tasks: Array<{ title: string; status: string; notes?: string }>): string {
  const failures = tasks.filter(t => t.status === 'NO_GO');
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="deckent-sprint-${sprintId}" tests="${tasks.length}" failures="${failures.length}" timestamp="${new Date().toISOString()}">`,
  ];
  for (const task of tasks) {
    const safe = task.title.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] ?? c));
    lines.push(`  <testcase name="${safe}" classname="sprint.${sprintId}">`);
    if (task.status === 'NO_GO') {
      const msg = (task.notes ?? 'Task did not pass GO criteria').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] ?? c));
      lines.push(`    <failure message="${msg}"/>`);
    }
    lines.push('  </testcase>');
  }
  lines.push('</testsuite>');
  return lines.join('\n');
}

/** Format test results in TAP format */
export function formatTAP(tasks: Array<{ title: string; status: string }>): string {
  const lines: string[] = [`TAP version 13`, `1..${tasks.length}`];
  tasks.forEach((task, i) => {
    const ok = task.status !== 'NO_GO' ? 'ok' : 'not ok';
    lines.push(`${ok} ${i + 1} - ${task.title}`);
  });
  return lines.join('\n');
}

export function registerTestRun(program: Command): void {
  const helpLang = getLanguage(undefined);
  program
    .command('test')
    .description(getMessage('cli.test_run.test.desc', helpLang))
    .addHelpText('after', renderContractHelp('test', helpLang))
    .option('--keep', cliContractMessage('cliContract.test.opt.keep', helpLang))
    .option('--timeout <ms>', cliContractMessage('cliContract.test.opt.timeout', helpLang), String(DEFAULT_TIMEOUT_MS))
    .option('--directives <file>', cliContractMessage('cliContract.test.opt.directives', helpLang))
    .option('--sandbox', cliContractMessage('cliContract.test.opt.sandbox', helpLang))
    .option('--model <model>', cliContractMessage('cliContract.test.opt.model', helpLang))
    .option('--reporter <format>', cliContractMessage('cliContract.test.opt.reporter', helpLang), 'default')
    .option('--min-coverage <percent>', cliContractMessage('cliContract.test.opt.min_coverage', helpLang))
    .action(async (opts: TestCommandOpts) => {
      const root = resolveProjectRoot();
      const reporter = (opts.reporter ?? 'default') as TestReporter;

      // Validate reporter
      const validReporters: TestReporter[] = ['default', 'junit', 'tap'];
      if (!validReporters.includes(reporter)) {
        printError(new Error(`Invalid reporter: ${reporter}. Valid options: ${validReporters.join(', ')}`));
        process.exitCode = 1;
        return;
      }

      // Validate model if provided
      if (opts.model) {
        try {
          resolveCanonicalModelIdentity(opts.model, { registerParametric: false });
        } catch {
          printError(new Error(getMessage('test.model_invalid', getLanguage(), { model: opts.model })));
          process.exitCode = 1;
          return;
        }
      }

      // F) Validate --min-coverage flag
      let minCoverageThreshold: number | null = null;
      if (opts.minCoverage !== undefined) {
        const parsed = parseFloat(opts.minCoverage);
        if (isNaN(parsed) || parsed < 0 || parsed > 100) {
          printError(new Error(`Invalid --min-coverage value: ${opts.minCoverage}. Must be a number between 0 and 100.`));
          process.exitCode = 1;
          return;
        }
        minCoverageThreshold = parsed;
      }

      try {
        // Resolve directives file path
        let directivesPath = join(root, DIRECTIVES_FILE);
        let tempDirectivesCreated = false;

        if (opts.directives) {
          const customPath = resolvePath(opts.directives);
          if (!existsSync(customPath)) {
            printError(new Error(`Directives file not found: ${customPath}`));
            process.exitCode = 1;
            return;
          }
          // Copy custom directives to the project directives location temporarily
          // We back up the original first
          const backupPath = join(root, `${DIRECTIVES_FILE}.test-backup`);
          if (existsSync(directivesPath)) {
            copyFileSync(directivesPath, backupPath);
          }
          copyFileSync(customPath, directivesPath);
          tempDirectivesCreated = true;
          print(`Using custom directives: ${customPath}`);
        } else {
          // Verify DIRECTIVES.md exists
          if (!existsSync(directivesPath)) {
            printError(new Error('DIRECTIVES.md not found. Create it before running test.'));
            process.exitCode = 1;
            return;
          }
        }

        const config = await loadConfig(root);
        const timeoutMs = opts.timeout ? parseInt(opts.timeout, 10) : DEFAULT_TIMEOUT_MS;

        if (isNaN(timeoutMs) || timeoutMs <= 0) {
          printError(new Error(`Invalid timeout value: ${opts.timeout}`));
          process.exitCode = 1;
          return;
        }

        // Apply model override to config if --model provided
        if (opts.model) {
          const forcedModel = opts.model as ModelType;
          config.activeModeConfig = {
            ...config.activeModeConfig,
            default_model: forcedModel,
            brain_model: forcedModel,
          };
          print(`Forcing all tasks to model: ${forcedModel}`);
        }

        print(`Starting test sprint (timeout: ${timeoutMs}ms)...`);

        // Sandbox: stash working tree before running
        let sandboxStashed = false;
        if (opts.sandbox) {
          print('Sandbox mode: stashing working tree changes...');
          sandboxStashed = gitStash(root);
          if (sandboxStashed) {
            print('Working tree stashed. Restoring after test sprint...');
          } else {
            print('No changes to stash — working tree is clean.');
          }
        }

        let sprint;
        try {
          const bootstrap = await bootstrapProviders(config, root);
          sprint = await runSprint(root, config, {
            testMode: true,
            skipCleanup: opts.keep ?? false,
            timeoutMs,
            connector: bootstrap.connector,
          });
        } finally {
          // Always restore sandbox
          if (opts.sandbox && sandboxStashed) {
            print('Sandbox mode: restoring working tree...');
            gitStashPop(root);
            print('Working tree restored.');
          }
          // Restore original directives if we replaced them
          if (tempDirectivesCreated) {
            const backupPath = join(root, `${DIRECTIVES_FILE}.test-backup`);
            if (existsSync(backupPath)) {
              copyFileSync(backupPath, directivesPath);
              try {
                const { unlinkSync } = await import('node:fs');
                unlinkSync(backupPath);
              } catch { /* ignore */ }
            } else {
              // Original didn't exist, remove the temp file
              try {
                const { unlinkSync } = await import('node:fs');
                unlinkSync(directivesPath);
              } catch { /* ignore */ }
            }
          }
        }

        // Determine exit code: 0 = all DONE, 1 = any NO_GO
        const hasNoGo = sprint.tasks.some(
          t => t.status === 'NO_GO' || (sprint.metrics?.noGoTasks ?? 0) > 0,
        );

        // Output based on reporter
        if (reporter === 'junit') {
          const taskRows = sprint.tasks.map(t => ({
            title: t.title,
            status: t.status,
            notes: undefined as string | undefined,
          }));
          print(formatJUnit(sprint.id, taskRows));
        } else if (reporter === 'tap') {
          const taskRows = sprint.tasks.map(t => ({ title: t.title, status: t.status }));
          print(formatTAP(taskRows));
        } else {
          print(formatSprintSummary(sprint));
        }

        if (opts.keep) {
          print('--keep flag active: task files preserved.');
        }

        // F) --min-coverage check
        if (minCoverageThreshold !== null) {
          const coverage = sprint.metrics?.coveragePercent ?? 0;
          if (coverage < minCoverageThreshold) {
            print(`Coverage ${coverage.toFixed(1)}% is below minimum threshold of ${minCoverageThreshold}%`);
            process.exitCode = 1;
            return;
          }
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
