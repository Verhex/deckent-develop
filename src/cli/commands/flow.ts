import type { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { print, printError, formatTable } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { FlowRegistry } from '../../core/flow-registry.js';
import { parseCronExpr } from '../../core/scheduled-flow.js';
import { FlowRuntime } from '../../core/flow-runtime.js';
import type { DueDispatch } from '../../core/flow-scheduler.js';
import {
  createSelfDispatchCallback,
  type SelfDispatchPolicy,
  type PendingApprovalItem,
} from '../../core/self-dispatch.js';

// ─── Self-dispatch wire (Sprint 209 — B11) ──────────────────────────────────
// The flow daemon evaluates each FlowRuntime tick against a scheduled self-dispatch
// policy. requiresApproval is TRUE — a due flow is QUEUED for human approval, never
// auto-started (preserves "Alperen onayı olmadan sprint başlatma yasak"). The queued
// items persist to .deckent/flows/pending-dispatch.json so they survive the tick and
// a follow-up approve step can act on them. Before this wire the daemon only printed
// the due-flow count and took no action (createSelfDispatchCallback was zero-caller).
const FLOW_DISPATCH_POLICY: SelfDispatchPolicy = {
  id: 'flow-run',
  trigger: 'scheduled',
  action: 'start',
  guard: { requiresApproval: true },
};

/** Path of the persisted pending self-dispatch approval queue. */
export function pendingDispatchPath(projectRoot: string): string {
  return join(projectRoot, '.deckent', 'flows', 'pending-dispatch.json');
}

/**
 * Handle one FlowRuntime tick: evaluate the due dispatches against the flow-run
 * self-dispatch policy and append any approved-for-dispatch items to the persisted
 * pending-approval queue. Returns the number newly queued. Pure w.r.t. injected
 * print/clock so it is unit-testable without spawning the daemon.
 */
export function handleFlowDispatchTick(
  projectRoot: string,
  dispatches: DueDispatch[],
  deps: { print?: (msg: string) => void; clock?: () => Date } = {},
): number {
  const emit = deps.print ?? ((m: string) => print(m));
  const path = pendingDispatchPath(projectRoot);

  let queue: PendingApprovalItem[] = [];
  try {
    if (existsSync(path)) queue = JSON.parse(readFileSync(path, 'utf-8')) as PendingApprovalItem[];
  } catch {
    queue = []; // corrupt/unreadable queue → start fresh (the daemon must not crash)
  }

  const before = queue.length;
  const callback = createSelfDispatchCallback(FLOW_DISPATCH_POLICY, queue, deps.clock ? { clock: deps.clock } : {});
  callback(dispatches);
  const added = queue.length - before;

  if (added > 0) {
    try {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify(queue, null, 2), 'utf-8');
    } catch (e) {
      emit(`Warning: could not persist pending-dispatch queue: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (dispatches.length === 0) {
    emit('No flows due.');
  } else {
    emit(`Tick: ${dispatches.length} flow(s) due · ${added} queued for self-dispatch (pending approval → ${path}).`);
  }
  return added;
}

export function registerFlow(program: Command): void {
  const flowCmd = program.command('flow').description('Manage scheduled flows (process mode)');

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
          runtime.tick((dispatches) => { handleFlowDispatchTick(root, dispatches); });
          return;
        }

        print('Flow daemon started. Press Ctrl+C to stop.');
        runtime.start((dispatches) => { handleFlowDispatchTick(root, dispatches); });
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
