import type { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { print, printError, formatTable } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getLangFromConfig } from '../helpers/config-reader.js';
import { registerShutdownHook } from '../helpers/shutdown-hooks.js';
import { bindGovernanceArgumentDescriptions } from '../helpers/message-catalog/cli-governance.js';
import { FlowRegistry } from '../../core/flow-registry.js';
import { parseCronExpr } from '../../core/scheduled-flow.js';
import { FlowRuntime } from '../../core/flow-runtime.js';
import {
  enqueuePendingEventDispatches,
  approveDispatch as approveEventDispatch,
  pendingEventDispatchPath,
} from '../../core/event-trigger.js';
import type { DueDispatch } from '../../core/flow-scheduler.js';
import {
  createSelfDispatchCallback,
  type SelfDispatchPolicy,
  type PendingApprovalItem,
} from '../../core/self-dispatch.js';
import { getLanguage, getMessage } from '../helpers/messages.js';

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

// ─── Event-dispatch approval wire (FLOW-EVENT-DISPATCH) ─────────────────────
// New strings below use a small local bilingual table rather than the shared
// src/cli/helpers/messages.ts registry: messages.ts sits outside this task's
// write scope (src/cli/commands/flow.ts, src/core/flow-runtime.ts,
// src/core/event-trigger.ts only). Follow-up should migrate these keys into
// the central registry.
type FlowLocalKey = 'eventDispatchQueued' | 'approveNotFound' | 'approveSucceeded';

const FLOW_LOCAL_MESSAGES: Record<FlowLocalKey, { en: string; tr: string }> = {
  eventDispatchQueued: {
    en: '{count} event-triggered dispatch(es) queued for approval → {path}',
    tr: '{count} event-tetiklemeli dispatch onay için kuyruğa alındı → {path}',
  },
  approveNotFound: {
    en: 'No pending event dispatch found with id "{id}" (unknown id, or already approved).',
    tr: '"{id}" kimlikli bekleyen bir event-dispatch bulunamadı (bilinmeyen id ya da zaten onaylanmış).',
  },
  approveSucceeded: {
    en: 'Event dispatch "{id}" approved (trigger: {trigger}) — flow may now proceed.',
    tr: '"{id}" event-dispatch onaylandı (tetikleyici: {trigger}) — flow artık ilerleyebilir.',
  },
};

function flowLocalMessage(lang: string, key: FlowLocalKey, vars: Record<string, string>): string {
  const entry = FLOW_LOCAL_MESSAGES[key];
  const template = lang === 'tr' ? entry.tr : entry.en;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => vars[name] ?? `{${name}}`);
}

/**
 * Handle one FlowRuntime tick's event-triggered dispatches: enqueue any
 * matched EventTrigger/IncomingEvent pairs onto the persisted pending
 * event-dispatch queue (event-trigger.ts) so a later `flow approve <id>` can
 * act on them. Silent no-op when the tick produced no event-kind dispatches —
 * existing scheduled-only ticks are unaffected.
 */
export function handleEventDispatchTick(
  projectRoot: string,
  dispatches: DueDispatch[],
  lang: string,
  deps: { print?: (msg: string) => void; clock?: () => Date } = {},
): number {
  const added = enqueuePendingEventDispatches(projectRoot, dispatches, { clock: deps.clock });
  if (added.length === 0) return 0;

  const emit = deps.print ?? ((m: string) => print(m));
  emit(flowLocalMessage(lang, 'eventDispatchQueued', {
    count: String(added.length),
    path: pendingEventDispatchPath(projectRoot),
  }));
  return added.length;
}

export function registerFlow(program: Command): void {
  const flowCmd = program.command('flow').description(getMessage('cli.flow.desc', getLanguage(undefined)));

  // ─── flow list ────────────────────────────────────────────────────
  flowCmd
    .command('list')
    .description(getMessage('cli.flow.list.desc', getLanguage(undefined)))
    .option('--tenant <id>', getMessage('cli.governance.opt.tenant_filter', getLanguage(undefined)))
    .option('--json', getMessage('cli.governance.opt.json', getLanguage(undefined)))
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
  bindGovernanceArgumentDescriptions(
    flowCmd.command('add <cron> <action>'),
    getLanguage(undefined),
    {
      cron: 'cli.governance.flow.arg.cron',
      action: 'cli.governance.flow.arg.action',
    },
  )
    .description(getMessage('cli.flow.add.desc', getLanguage(undefined)))
    .option('--tenant <id>', getMessage('cli.governance.flow.opt.add_tenant', getLanguage(undefined)), 'default')
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
    .description(getMessage('cli.flow.run.desc', getLanguage(undefined)))
    .option('--once', getMessage('cli.governance.flow.opt.once', getLanguage(undefined)))
    .option('--tenant <id>', getMessage('cli.governance.opt.tenant_filter', getLanguage(undefined)))
    .action((opts: { once?: boolean; tenant?: string }) => {
      try {
        const root = resolveProjectRoot();
        const lang = getLangFromConfig(root);
        const registry = new FlowRegistry(`${root}/.deckent/flows`);
        const runtime = new FlowRuntime(registry);

        const onTick = (dispatches: DueDispatch[]): void => {
          handleFlowDispatchTick(root, dispatches);
          handleEventDispatchTick(root, dispatches, lang);
        };

        if (opts.once) {
          runtime.tick(onTick);
          return;
        }

        print('Flow daemon started. Press Ctrl+C to stop.');
        runtime.start(onTick);
        // born-587 (DEAD-LISTENER-MIGRATION): a command-level process.on
        // (SIGINT) here is dead code — entry.ts's bootstrap-time onSignal
        // wins registration order and exits synchronously before this
        // listener ever runs (see src/cli/helpers/shutdown-hooks.ts's module
        // doc). Route the same cleanup through the shared registry instead.
        registerShutdownHook(async () => {
          runtime.stop();
        });
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  // ─── flow approve ─────────────────────────────────────────────────
  bindGovernanceArgumentDescriptions(
    flowCmd.command('approve <id>'),
    getLanguage(undefined),
    { id: 'cli.governance.flow.arg.id' },
  )
    .description(getMessage('cli.flow.approve.desc', getLanguage(undefined)))
    .action((id: string) => {
      try {
        const root = resolveProjectRoot();
        const lang = getLangFromConfig(root);
        const entry = approveEventDispatch(root, id);

        if (!entry) {
          print(flowLocalMessage(lang, 'approveNotFound', { id }));
          process.exitCode = 1;
          return;
        }

        print(flowLocalMessage(lang, 'approveSucceeded', { id: entry.id, trigger: entry.trigger.id }));
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });
}
