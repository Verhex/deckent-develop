import type { Command } from 'commander';
import { print, printError, formatTable } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { FlowRegistry } from '../../core/flow-registry.js';
import { parseCronExpr } from '../../core/scheduled-flow.js';
import { FlowRuntime } from '../../core/flow-runtime.js';

export function registerFlow(program: Command): void {
  const flowCmd = program.command('flow').description('Manage scheduled flows (F3 process mode)');

  // ─── flow list ────────────────────────────────────────────────────
  flowCmd
    .command('list')
    .description('List all scheduled flows')
    .option('--tenant <id>', 'Filter by tenant ID')
    .option('--json', 'Output as JSON')
    .action((opts: { tenant?: string; json?: boolean }) => {
      try {
        const root = resolveProjectRoot();
        const registry = new FlowRegistry(`${root}/.deckent/flows`);
        const flows = registry.listFlows(opts.tenant);

        if (opts.json) {
          print(JSON.stringify(flows, null, 2));
          return;
        }

        if (flows.length === 0) {
          print('No scheduled flows found. Add one with: deckent flow add <cron> <action>');
          return;
        }

        const headers = ['ID', 'Cron', 'Action', 'Tenant', 'Enabled'];
        const rows = flows.map(f => [
          f.id,
          f.cronExpr,
          f.action,
          f.tenantId,
          f.enabled ? 'yes' : 'no',
        ]);
        print(formatTable(headers, rows));
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  // ─── flow add ─────────────────────────────────────────────────────
  flowCmd
    .command('add <cron> <action>')
    .description('Add a new scheduled flow (cron: 5-field expression, e.g. "* * * * *")')
    .option('--tenant <id>', 'Tenant ID', 'default')
    .action((cron: string, action: string, opts: { tenant: string }) => {
      try {
        parseCronExpr(cron); // validate — throws on invalid
        const root = resolveProjectRoot();
        const registry = new FlowRegistry(`${root}/.deckent/flows`);
        const id = `flow-${Date.now()}`;
        registry.addFlow({
          id,
          cronExpr: cron,
          action,
          tenantId: opts.tenant,
          enabled: true,
          createdAt: new Date().toISOString(),
        });
        print(`Flow "${id}" added (cron: ${cron}, action: ${action}, tenant: ${opts.tenant})`);
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  // ─── flow run ─────────────────────────────────────────────────────
  flowCmd
    .command('run')
    .description('Run the flow-runtime tick once (--once) or start the daemon')
    .option('--once', 'Run a single FlowRuntime tick and exit')
    .option('--tenant <id>', 'Filter flows by tenant ID')
    .action((opts: { once?: boolean; tenant?: string }) => {
      try {
        const root = resolveProjectRoot();
        const registry = new FlowRegistry(`${root}/.deckent/flows`);
        const runtime = new FlowRuntime(registry);

        if (opts.once) {
          runtime.tick((dispatches) => {
            if (dispatches.length === 0) {
              print('No flows due.');
            } else {
              print(`Tick: ${dispatches.length} flow(s) dispatched.`);
            }
          });
          return;
        }

        print('Flow daemon started. Press Ctrl+C to stop.');
        runtime.start((dispatches) => {
          if (dispatches.length > 0) {
            print(`Tick: ${dispatches.length} flow(s) dispatched.`);
          }
        });
        process.on('SIGINT', () => {
          runtime.stop();
          process.exit(0);
        });
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });
}
