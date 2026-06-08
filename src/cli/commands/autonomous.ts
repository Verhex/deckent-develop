// src/cli/commands/autonomous.ts
//
// `deckent autonomous` — Tier-1 user-surface CLI for the autonomous runtime
// loop (Sprint 226 — Task 226-007). Wraps `buildAutonomousRuntime` +
// `runAutonomousLoop` (226-006) with start / status / stop subcommands.
//
// Security invariants preserved (ADR-037, ADR-040):
//   - default-deny: unknown requestedBy denied by authority-adapter
//   - no-auto-approve: needs_approval triggers park in approval-adapter pending
//   - no auto-sprint-start: actionHandlers registry is empty by default
//
// ADR-012: registerAutonomous(program) pattern.

import { Command } from 'commander';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { resolveProjectRoot } from '../helpers/process.js';
import { print, printError } from '../helpers/output.js';
import { getLanguage, getMessage } from '../helpers/messages.js';
import {
  buildEngineRuntime,
  runAutonomousLoop,
} from '../../orchestra/autonomous/runtime-loop.js';
import {
  makeApprovalGate,
  type ApprovalGateAdapter,
} from '../../orchestra/autonomous/approval-adapter.js';
import { FlowRegistry } from '../../core/flow-registry.js';
import { notifyAsync } from '../../core/notify.js';
import { bootstrapNotifyDispatcher } from '../../core/notify-bootstrap.js';
import type { ScheduledFlow } from '../../core/scheduled-flow.js';
import type { SelfDispatchPolicy } from '../../core/self-dispatch.js';
import type {
  AutonomousCycleResult,
  AutonomousRuntimeConfig,
} from '../../orchestra/autonomous-runtime.js';
import { loadBacklog, validateBacklogEntry } from '../../orchestra/autonomous/backlog.js';
import { recoverBacklog } from '../../orchestra/autonomous/execution-pool.js';
import { atomicWriteFileSync } from '../../agents/worker-lifecycle.js';
import type { BacklogEntry } from '../../orchestra/autonomous/backlog-types.js';
import { runTaskMode } from '../../orchestra/task-mode-runner.js';
import { runSprint as runSprintLifecycle } from '../../orchestra/sprint-controller.js';
import { waitForRunResult } from './run.js';
import { loadConfig } from '../../core/config.js';
import { bootstrapProviders } from '../../core/provider.js';
import type { ModelType } from '../../core/types.js';
import { loadReactiveMap } from '../../orchestra/autonomous/reactive/reactive-map.js';
import { makeReactiveIngester } from '../../orchestra/autonomous/reactive/reactive-ingester.js';
import { makeNervousReactiveSource } from '../../orchestra/autonomous/reactive/nervous-reactive-source.js';
import { NervousObserver } from '../../nervous/observer.js';

// ─── Filesystem layout helpers ────────────────────────────────────────

function autonomousDir(root: string): string {
  return join(root, '.deckent', 'autonomous');
}

function pendingPath(root: string): string {
  return join(autonomousDir(root), 'pending.json');
}

function stopMarkerPath(root: string): string {
  return join(autonomousDir(root), 'stop');
}

function eventsPath(root: string, sprintId = 'autonomous'): string {
  return join(root, '.deckent', `${sprintId}-events.jsonl`);
}

function ensureAutonomousDir(root: string): void {
  const dir = autonomousDir(root);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function loadFlows(root: string): ScheduledFlow[] {
  try {
    const registry = new FlowRegistry(join(root, '.deckent', 'flows'));
    return registry.listFlows();
  } catch {
    return [];
  }
}

function defaultPolicy(): SelfDispatchPolicy {
  // requiresApproval defaults to TRUE — preserves the human-in-the-loop rule.
  return {
    id: 'autonomous-default',
    trigger: 'scheduled',
    action: 'start',
    guard: { requiresApproval: true },
  };
}

// ─── Backlog helpers (Task 7) ─────────────────────────────────────────

function defaultBacklogPath(root: string): string {
  return join(autonomousDir(root), 'backlog.json');
}

export interface BacklogAddOptions {
  root: string;
  id: string;
  title: string;
  kind: 'task' | 'sprint';
  description: string;
  policy: BacklogEntry['policy'];
  lang: string;
}

export function backlogAdd(o: BacklogAddOptions): void {
  const path = defaultBacklogPath(o.root);
  const bl = loadBacklog(path);
  if (bl.entries.some((e) => e.id === o.id)) {
    throw new Error(getMessage('autonomous.backlog.duplicate', o.lang, { id: o.id }));
  }
  const entry: BacklogEntry = {
    id: o.id,
    title: o.title,
    kind: o.kind,
    spec: { description: o.description },
    policy: o.policy,
    trigger: { type: 'one-off' },
    status: 'pending',
    lastRun: null,
    lastResult: null,
  };
  const err = validateBacklogEntry(entry);
  if (err) throw new Error(err);
  bl.entries.push(entry);
  mkdirSync(dirname(path), { recursive: true });
  atomicWriteFileSync(path, JSON.stringify(bl, null, 2));
}

export function backlogList(o: { root: string }): BacklogEntry[] {
  return loadBacklog(defaultBacklogPath(o.root)).entries;
}

export function backlogRemove(o: { root: string; id: string; lang: string }): void {
  const path = defaultBacklogPath(o.root);
  const bl = loadBacklog(path);
  const before = bl.entries.length;
  bl.entries = bl.entries.filter((e) => e.id !== o.id);
  if (bl.entries.length === before) {
    throw new Error(getMessage('autonomous.backlog.not_found', o.lang, { id: o.id }));
  }
  mkdirSync(dirname(path), { recursive: true });
  atomicWriteFileSync(path, JSON.stringify(bl, null, 2));
}

// ─── start ────────────────────────────────────────────────────────────

export interface AutonomousStartOptions {
  intervalMs?: string;
  maxIterations?: string;
  root?: string;
  lang?: string;
}

export async function handleStart(opts: AutonomousStartOptions): Promise<void> {
  const lang = getLanguage(opts.lang);
  const root = opts.root ?? resolveProjectRoot();
  ensureAutonomousDir(root);

  // Flag-gate (safety invariant): the engine never runs unless explicitly enabled.
  const resolvedConfig = await loadConfig(root);
  if (!resolvedConfig.autonomous?.enabled) {
    print(getMessage('autonomous.disabled', lang));
    return;
  }

  // Gap A fix: register provider adapters (including OllamaAdapter) so that
  // getProviderAdapterForTask('ollama') resolves correctly for autonomous tasks.
  // bootstrapProviders is idempotent and safe-no-op when a provider is unreachable.
  await bootstrapProviders(resolvedConfig);

  // Clear any stale stop marker before starting.
  const stopFile = stopMarkerPath(root);
  if (existsSync(stopFile)) rmSync(stopFile);

  const backlogPath = join(root, resolvedConfig.autonomous.backlog_path ?? '.deckent/autonomous/backlog.json');
  // Crash recovery: any entry left 'running' by a prior crash → back to 'pending'.
  recoverBacklog(backlogPath);

  const flows = loadFlows(root);
  const policy = defaultPolicy();

  // runTaskMode requires task-style config; runSprint requires sprint-style.
  // Clone the resolved config per execution kind (shallow override is enough —
  // nested config is read-only here).
  const taskConfig = { ...resolvedConfig, deckent_style: 'task' as const };
  const sprintConfig = { ...resolvedConfig, deckent_style: 'sprint' as const };

  const { deps } = buildEngineRuntime({
    projectRoot: root,
    config: resolvedConfig,
    backlogPath,
    flows,
    policy,
    pendingPath: pendingPath(root),
    runTask: (ctx) => runTaskMode({
      description: ctx.description,
      model: ctx.model as ModelType | undefined,
      provider: ctx.provider,
      scope: ctx.scope,
      projectRoot: ctx.projectRoot ?? root,
      autoApprove: true,
    }, taskConfig),
    runSprint: (projectRoot) => runSprintLifecycle(projectRoot, sprintConfig),
    // Gap F: real completion tracking — wire in the CLI's waitForRunResult primitive.
    // Gap B: resultTimeoutMs from config; fallback to 600s (enough for cold ollama load).
    waitForResult: waitForRunResult,
    resultTimeoutMs: (resolvedConfig.autonomous as Record<string, unknown> | undefined)?.result_timeout_ms as number | undefined,
  });

  // Reactive ingestion (sub-project 2) — flag-gated, additional to autonomous.enabled.
  let reactiveSource: { start(): void; stop(): void } | null = null;
  let reactiveObserver: NervousObserver | null = null;
  if (resolvedConfig.autonomous.reactive?.enabled) {
    const mapPath = join(root, resolvedConfig.autonomous.reactive.map_path ?? '.deckent/autonomous/reactive-map.json');
    const reactiveMap = loadReactiveMap(mapPath);
    let rxCounter = 0;
    const ingester = makeReactiveIngester({
      backlogPath,
      map: reactiveMap,
      idGen: () => `rx-${new Date().toISOString()}-${++rxCounter}`,
    });
    reactiveObserver = new NervousObserver(root);
    reactiveSource = makeNervousReactiveSource({ observer: reactiveObserver, ingester });
    reactiveSource.start();
  }

  const controller = new AbortController();
  const sigintHandler = (): void => controller.abort();
  process.on('SIGINT', sigintHandler);

  const intervalMs = opts.intervalMs !== undefined
    ? Math.max(0, parseInt(opts.intervalMs, 10) || 0)
    : (resolvedConfig.autonomous.interval_ms ?? 5000);
  const maxIterations = opts.maxIterations !== undefined
    ? Math.max(0, parseInt(opts.maxIterations, 10) || 0)
    : undefined;

  // Wire DECKENT→USER:NOTIFY so parked approvals + cycle outcomes reach this
  // terminal — without it notify() is a silent no-op in pure-CLI runs (§4G).
  bootstrapNotifyDispatcher({ projectRoot: root });
  const onTick = makeTickReporter(lang);

  print(getMessage('autonomous.start_banner', lang, { flows: String(flows.length) }));

  // Wrap sleep so the stop marker triggers abort.
  const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(() => {
      if (existsSync(stopFile)) controller.abort();
      resolve();
    }, ms));

  const loopConfig: AutonomousRuntimeConfig = {};
  try {
    const summary = await runAutonomousLoop(loopConfig, deps, {
      intervalMs,
      maxIterations,
      signal: controller.signal,
      sleep,
      onTick,
    });
    print(getMessage('autonomous.start_done', lang, {
      iterations: String(summary.iterations),
      reason: summary.reason,
    }));
  } finally {
    process.off('SIGINT', sigintHandler);
    reactiveSource?.stop();
    // Ensure the observer releases any timers/watchers it started so the
    // process (and tests) can exit cleanly.
    reactiveObserver?.stop?.();
  }
}

// ─── status ───────────────────────────────────────────────────────────

export interface AutonomousStatusOptions {
  root?: string;
  lang?: string;
}

export function handleStatus(opts: AutonomousStatusOptions): void {
  const lang = getLanguage(opts.lang);
  const root = opts.root ?? resolveProjectRoot();

  let pendingCount = 0;
  const pf = pendingPath(root);
  if (existsSync(pf)) {
    try {
      const data = JSON.parse(readFileSync(pf, 'utf-8'));
      if (Array.isArray(data)) pendingCount = data.length;
    } catch {
      pendingCount = 0;
    }
  }

  const auditLines: string[] = [];
  const ef = eventsPath(root);
  if (existsSync(ef)) {
    try {
      auditLines.push(
        ...readFileSync(ef, 'utf-8').split('\n').filter((l) => l.trim().length > 0),
      );
    } catch {
      // tolerated — file disappeared between exists check and read
    }
  }
  const recent = auditLines.slice(-5);

  // Backlog summary
  try {
    const entries = backlogList({ root });
    const counts = { pending: 0, running: 0, parked: 0, done: 0, failed: 0 };
    for (const e of entries) {
      if (e.status in counts) counts[e.status as keyof typeof counts]++;
    }
    print(getMessage('autonomous.backlog.summary', lang, {
      total: String(entries.length),
      pending: String(counts.pending),
      running: String(counts.running),
      parked: String(counts.parked),
      done: String(counts.done),
      failed: String(counts.failed),
    }));
  } catch {
    // tolerated — no backlog file yet
  }

  print(getMessage('autonomous.status_header', lang));
  print(getMessage('autonomous.status_pending', lang, { count: String(pendingCount) }));
  if (recent.length === 0) {
    print(getMessage('autonomous.status_no_audit', lang));
    return;
  }
  print(getMessage('autonomous.status_recent_audit', lang, { count: String(recent.length) }));
  for (const line of recent) {
    try {
      const ev = JSON.parse(line) as { payload?: Record<string, unknown>; timestamp?: string };
      const payload = (ev.payload ?? {}) as Record<string, unknown>;
      const ts = (payload['timestamp'] as string | undefined) ?? ev.timestamp ?? '';
      const action = (payload['action'] as string | undefined) ?? '?';
      const outcome = (payload['outcome'] as string | undefined) ?? '?';
      const reason = (payload['reason'] as string | undefined) ?? '';
      print(getMessage('autonomous.audit_row', lang, { ts, action, outcome, reason }));
    } catch {
      // skip malformed audit line
    }
  }
}

// ─── stop ─────────────────────────────────────────────────────────────

export interface AutonomousStopOptions {
  root?: string;
  lang?: string;
}

export function handleStop(opts: AutonomousStopOptions): void {
  const lang = getLanguage(opts.lang);
  const root = opts.root ?? resolveProjectRoot();
  ensureAutonomousDir(root);
  writeFileSync(stopMarkerPath(root), new Date().toISOString(), 'utf-8');
  print(getMessage('autonomous.stop_marker_written', lang));
}

// ─── live feedback (onTick reporter) (APPROVE-002, §4G) ────────────────

export interface TickReporterDeps {
  /** Output sink — defaults to the CLI print helper. */
  print?: (line: string) => void;
  /** Notification sink — defaults to notifyAsync (DECKENT→USER:NOTIFY). */
  notify?: typeof notifyAsync;
}

/**
 * Per-cycle observer wired into runAutonomousLoop.onTick. Prints a feedback
 * line on outcome change (idle no_trigger suppressed) and fires ONE
 * notification the first time a trigger parks pending — re-arming if that
 * trigger later resolves, so a re-park notifies again but a still-pending
 * trigger does not spam every cycle.
 */
export function makeTickReporter(
  lang: string,
  deps: TickReporterDeps = {},
): (result: AutonomousCycleResult) => void {
  const out = deps.print ?? print;
  const notifyFn = deps.notify ?? notifyAsync;
  const notified = new Set<string>();
  let lastKey = '';
  return (result: AutonomousCycleResult): void => {
    if (result.outcome === 'no_trigger') return;
    const t = result.trigger;
    const id = t?.id ?? '?';
    const key = `${id}:${result.outcome}`;
    if (key !== lastKey) {
      out(
        getMessage('autonomous.tick', lang, {
          outcome: result.outcome,
          action: t?.action ?? '?',
          triggerId: id,
          reason: result.reason,
        }),
      );
      lastKey = key;
    }
    if (result.outcome === 'pending' && t && !notified.has(id)) {
      notified.add(id);
      notifyFn(
        'human-checkpoint-required',
        'autonomous',
        getMessage('autonomous.notify_pending_title', lang),
        getMessage('autonomous.notify_pending_summary', lang, {
          action: t.action,
          triggerId: id,
        }),
      );
    }
    if (t && result.outcome !== 'pending') notified.delete(id);
  };
}

// ─── approve / reject / pending (APPROVE-002, §4G) ─────────────────────

/** Build a gate bound to this project's pending queue (decisions.json sibling). */
function approvalGateFor(root: string): ApprovalGateAdapter {
  return makeApprovalGate({ pendingPath: pendingPath(root) });
}

export interface AutonomousResolveOptions {
  triggerId: string;
  reason?: string;
  root?: string;
  lang?: string;
}

/**
 * Resolve a parked trigger. Runs in a process SEPARATE from `autonomous start`,
 * so it records the decision via the file-mediated channel (APPROVE-001); the
 * running loop applies it on its next cycle. ADR-040: only an explicit
 * approve/reject resolves — never auto-approve.
 */
export function handleApprove(opts: AutonomousResolveOptions): void {
  resolveTrigger(opts, 'approve');
}

export function handleReject(opts: AutonomousResolveOptions): void {
  resolveTrigger(opts, 'reject');
}

function resolveTrigger(opts: AutonomousResolveOptions, kind: 'approve' | 'reject'): void {
  const lang = getLanguage(opts.lang);
  const root = opts.root ?? resolveProjectRoot();
  if (!opts.triggerId) {
    printError(new Error(getMessage('autonomous.id_required', lang)));
    process.exitCode = 1;
    return;
  }
  const gate = approvalGateFor(root);
  const isPending = gate.pending().some((p) => p.triggerId === opts.triggerId);
  if (!isPending) {
    printError(new Error(getMessage('autonomous.resolve_not_found', lang, { triggerId: opts.triggerId })));
    process.exitCode = 1;
    return;
  }
  if (kind === 'approve') {
    gate.accept(opts.triggerId, opts.reason);
    print(getMessage('autonomous.approve_done', lang, { triggerId: opts.triggerId }));
  } else {
    gate.reject(opts.triggerId, opts.reason);
    print(getMessage('autonomous.reject_done', lang, { triggerId: opts.triggerId }));
  }
}

export interface AutonomousPendingOptions {
  root?: string;
  lang?: string;
}

/** List parked approvals awaiting a human accept/reject. */
export function handlePending(opts: AutonomousPendingOptions): void {
  const lang = getLanguage(opts.lang);
  const root = opts.root ?? resolveProjectRoot();
  const items = approvalGateFor(root).pending();
  if (items.length === 0) {
    print(getMessage('autonomous.pending_none', lang));
    return;
  }
  print(getMessage('autonomous.pending_header', lang, { count: String(items.length) }));
  for (const p of items) {
    print(getMessage('autonomous.pending_row', lang, {
      triggerId: p.triggerId,
      action: p.action,
      requestedBy: p.requestedBy,
      enqueuedAt: p.enqueuedAt,
    }));
  }
}

// ─── register ─────────────────────────────────────────────────────────

export function registerAutonomous(program: Command): void {
  const cmd = program
    .command('autonomous')
    .description('Autonomous runtime — authority-bounded continuous loop (F3-009)');

  cmd
    .command('start')
    .description('Start the autonomous loop (default-deny + human-approval gate)')
    .option('--interval-ms <ms>', 'Idle-tick sleep in ms', '1000')
    .option('--max-iterations <n>', 'Stop after N cycles (default: run until aborted)')
    .option('--root <path>', 'Project root override')
    .option('--lang <code>', 'Language override (en|tr)')
    .action(async (opts: AutonomousStartOptions) => {
      try {
        await handleStart(opts);
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });

  cmd
    .command('status')
    .description('Show autonomous runtime summary (pending + last audit events)')
    .option('--root <path>', 'Project root override')
    .option('--lang <code>', 'Language override (en|tr)')
    .action((opts: AutonomousStatusOptions) => {
      try {
        handleStatus(opts);
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });

  cmd
    .command('stop')
    .description('Signal the autonomous loop to stop cleanly')
    .option('--root <path>', 'Project root override')
    .option('--lang <code>', 'Language override (en|tr)')
    .action((opts: AutonomousStopOptions) => {
      try {
        handleStop(opts);
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });

  cmd
    .command('pending')
    .description('List parked approvals awaiting human accept/reject')
    .option('--root <path>', 'Project root override')
    .option('--lang <code>', 'Language override (en|tr)')
    .action((opts: AutonomousPendingOptions) => {
      try {
        handlePending(opts);
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });

  cmd
    .command('approve <triggerId>')
    .description('Approve a parked trigger — resolves the running loop\'s gate')
    .option('--reason <text>', 'Optional reason recorded with the decision')
    .option('--root <path>', 'Project root override')
    .option('--lang <code>', 'Language override (en|tr)')
    .action((triggerId: string, opts: Omit<AutonomousResolveOptions, 'triggerId'>) => {
      try {
        handleApprove({ triggerId, ...opts });
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });

  cmd
    .command('reject <triggerId>')
    .description('Reject a parked trigger — resolves the running loop\'s gate')
    .option('--reason <text>', 'Optional reason recorded with the decision')
    .option('--root <path>', 'Project root override')
    .option('--lang <code>', 'Language override (en|tr)')
    .action((triggerId: string, opts: Omit<AutonomousResolveOptions, 'triggerId'>) => {
      try {
        handleReject({ triggerId, ...opts });
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });

  // ─── backlog ──────────────────────────────────────────────────────────
  const backlog = cmd
    .command('backlog')
    .description('Manage the autonomous backlog (add / list / remove entries)');

  backlog
    .command('add')
    .description('Add a new entry to the autonomous backlog')
    .requiredOption('--id <id>', 'Unique entry id')
    .requiredOption('--title <title>', 'Human-readable title')
    .option('--kind <kind>', 'Entry kind: task (default) or sprint', 'task')
    .option('--description <text>', 'Task description or directives ref', '')
    .option('--policy <policy>', 'Policy: auto (default), approval-required, or risk-tagged', 'auto')
    .option('--root <path>', 'Project root override')
    .option('--lang <code>', 'Language override (en|tr)')
    .action((opts: {
      id: string; title: string; kind: string; description: string;
      policy: string; root?: string; lang?: string;
    }) => {
      try {
        const lang = getLanguage(opts.lang);
        const root = opts.root ?? resolveProjectRoot();
        backlogAdd({
          root, id: opts.id, title: opts.title,
          kind: (opts.kind === 'sprint' ? 'sprint' : 'task'),
          description: opts.description,
          policy: (opts.policy as BacklogEntry['policy']),
          lang,
        });
        print(getMessage('autonomous.backlog.added', lang, { id: opts.id }));
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });

  backlog
    .command('list')
    .description('List autonomous backlog entries')
    .option('--root <path>', 'Project root override')
    .option('--lang <code>', 'Language override (en|tr)')
    .action((opts: { root?: string; lang?: string }) => {
      try {
        const lang = getLanguage(opts.lang);
        const root = opts.root ?? resolveProjectRoot();
        const entries = backlogList({ root });
        if (entries.length === 0) {
          print(getMessage('autonomous.backlog.empty', lang));
          return;
        }
        print(getMessage('autonomous.backlog.list_header', lang, { count: String(entries.length) }));
        for (const e of entries) {
          print(getMessage('autonomous.backlog.list_row', lang, {
            status: e.status, id: e.id, title: e.title, kind: e.kind, policy: e.policy,
          }));
        }
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });

  backlog
    .command('remove [id]')
    .description('Remove an entry from the autonomous backlog (positional id or --id)')
    .option('--id <id>', 'Entry id to remove (consistent with `backlog add --id`; alternative to the positional argument)')
    .option('--root <path>', 'Project root override')
    .option('--lang <code>', 'Language override (en|tr)')
    .action((positionalId: string | undefined, opts: { id?: string; root?: string; lang?: string }) => {
      try {
        const lang = getLanguage(opts.lang);
        const id = opts.id ?? positionalId;
        if (!id) {
          throw new Error(getMessage('autonomous.backlog.id_required', lang));
        }
        const root = opts.root ?? resolveProjectRoot();
        backlogRemove({ root, id, lang });
        print(getMessage('autonomous.backlog.removed', lang, { id }));
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });
}
