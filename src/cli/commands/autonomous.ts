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
import { join } from 'node:path';
import { resolveProjectRoot } from '../helpers/process.js';
import { print, printError } from '../helpers/output.js';
import { getLanguage } from '../helpers/messages.js';
import {
  buildAutonomousRuntime,
  runAutonomousLoop,
} from '../../orchestra/autonomous/runtime-loop.js';
import { FlowRegistry } from '../../core/flow-registry.js';
import type { ActionHandler } from '../../nervous/executor.js';
import type { ScheduledFlow } from '../../core/scheduled-flow.js';
import type { SelfDispatchPolicy } from '../../core/self-dispatch.js';
import type { AutonomousRuntimeConfig } from '../../orchestra/autonomous-runtime.js';

// ─── Local i18n (en/tr) — scoped to this command (i18n-FIRST) ─────────

const LOCAL_MESSAGES: Record<string, { en: string; tr: string }> = {
  'autonomous.start_banner': {
    en: 'Autonomous runtime started — {flows} flow(s), default-deny + approval-gate active',
    tr: 'Otonom runtime başladı — {flows} flow, default-deny + onay-kapısı aktif',
  },
  'autonomous.start_done': {
    en: 'Autonomous loop finished ({iterations} cycles, reason: {reason})',
    tr: 'Otonom döngü tamamlandı ({iterations} cycle, sebep: {reason})',
  },
  'autonomous.status_header': {
    en: 'Autonomous runtime status',
    tr: 'Otonom runtime durumu',
  },
  'autonomous.status_pending': {
    en: 'Pending approvals: {count}',
    tr: 'Bekleyen onay: {count}',
  },
  'autonomous.status_no_audit': {
    en: 'No audit events yet.',
    tr: 'Henüz audit kaydı yok.',
  },
  'autonomous.status_recent_audit': {
    en: 'Recent audit ({count}):',
    tr: 'Son audit ({count}):',
  },
  'autonomous.stop_marker_written': {
    en: 'Stop signal written — active loop will halt after the in-flight cycle.',
    tr: 'Durdurma sinyali yazıldı — aktif döngü mevcut cycle sonrası duracak.',
  },
};

function tr(key: string, lang: string, vars?: Record<string, string>): string {
  const entry = LOCAL_MESSAGES[key];
  if (!entry) return key;
  const template = lang === 'tr' ? entry.tr : entry.en;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => vars[name] ?? `{${name}}`);
}

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

  // Clear any stale stop marker before starting.
  const stopFile = stopMarkerPath(root);
  if (existsSync(stopFile)) rmSync(stopFile);

  const flows = loadFlows(root);
  const policy = defaultPolicy();
  // Empty action-handlers: no auto-sprint-start. Cleared actions still go
  // through the authority adapter → default-deny / approval-gate first.
  const actionHandlers = new Map<string, ActionHandler>();

  const { deps } = buildAutonomousRuntime({
    projectRoot: root,
    flows,
    policy,
    actionHandlers,
    pendingPath: pendingPath(root),
  });

  const controller = new AbortController();
  const sigintHandler = (): void => controller.abort();
  process.on('SIGINT', sigintHandler);

  const intervalMs = Math.max(0, parseInt(opts.intervalMs ?? '1000', 10) || 0);
  const maxIterations = opts.maxIterations !== undefined
    ? Math.max(0, parseInt(opts.maxIterations, 10) || 0)
    : undefined;

  print(tr('autonomous.start_banner', lang, { flows: String(flows.length) }));

  // Wrap sleep so the stop marker triggers abort.
  const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(() => {
      if (existsSync(stopFile)) controller.abort();
      resolve();
    }, ms));

  const config: AutonomousRuntimeConfig = {};
  try {
    const summary = await runAutonomousLoop(config, deps, {
      intervalMs,
      maxIterations,
      signal: controller.signal,
      sleep,
    });
    print(tr('autonomous.start_done', lang, {
      iterations: String(summary.iterations),
      reason: summary.reason,
    }));
  } finally {
    process.off('SIGINT', sigintHandler);
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

  print(tr('autonomous.status_header', lang));
  print(tr('autonomous.status_pending', lang, { count: String(pendingCount) }));
  if (recent.length === 0) {
    print(tr('autonomous.status_no_audit', lang));
    return;
  }
  print(tr('autonomous.status_recent_audit', lang, { count: String(recent.length) }));
  for (const line of recent) {
    try {
      const ev = JSON.parse(line) as { payload?: Record<string, unknown>; timestamp?: string };
      const payload = (ev.payload ?? {}) as Record<string, unknown>;
      const ts = (payload['timestamp'] as string | undefined) ?? ev.timestamp ?? '';
      const action = (payload['action'] as string | undefined) ?? '?';
      const outcome = (payload['outcome'] as string | undefined) ?? '?';
      const reason = (payload['reason'] as string | undefined) ?? '';
      print(`  - ${ts} ${action} -> ${outcome}: ${reason}`);
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
  print(tr('autonomous.stop_marker_written', lang));
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
}
