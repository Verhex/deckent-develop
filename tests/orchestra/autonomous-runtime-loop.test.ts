import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildAutonomousRuntime,
  runAutonomousLoop,
  type RunAutonomousLoopOptions,
} from '../../src/orchestra/autonomous/runtime-loop.js';
import type {
  AutonomousRuntimeConfig,
  AutonomousRuntimeDeps,
  AutonomousTrigger,
  AuditRecord,
} from '../../src/orchestra/autonomous-runtime.js';
import type { ActionHandler } from '../../src/nervous/executor.js';
import type { ScheduledFlow } from '../../src/core/scheduled-flow.js';
import type { SelfDispatchPolicy } from '../../src/core/self-dispatch.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeTrigger(overrides: Partial<AutonomousTrigger> = {}): AutonomousTrigger {
  return {
    id: 't-1',
    source: 'test',
    action: 'mrp.refresh',
    requestedBy: 'brain',
    payload: { foo: 'bar' },
    ...overrides,
  };
}

/** Deterministic stub deps for loop-semantics tests. */
function stubDeps(overrides: {
  trigger?: AutonomousTrigger | null | (() => AutonomousTrigger | null);
} = {}): {
  deps: AutonomousRuntimeDeps;
  spies: {
    triggerNext: ReturnType<typeof vi.fn>;
    execute: ReturnType<typeof vi.fn>;
    auditRecord: ReturnType<typeof vi.fn>;
  };
  audit: AuditRecord[];
} {
  const audit: AuditRecord[] = [];
  const triggerSrc = overrides.trigger;
  const triggerNext = vi.fn().mockImplementation(() => {
    if (typeof triggerSrc === 'function') return triggerSrc();
    if (triggerSrc === undefined) return makeTrigger();
    return triggerSrc;
  });
  const execute = vi.fn().mockResolvedValue({ ok: true });
  const auditRecord = vi.fn((r: AuditRecord) => { audit.push(r); });

  const deps: AutonomousRuntimeDeps = {
    triggerSource: { next: triggerNext },
    authority: { check: () => ({ outcome: 'allowed', reason: 'ok' }) },
    approvalGate: { request: async () => ({ outcome: 'approved' }) },
    executor: { execute },
    audit: { record: auditRecord },
    now: () => '2026-06-04T00:00:00.000Z',
  };
  return { deps, spies: { triggerNext, execute, auditRecord }, audit };
}

function readAuditEvents(root: string, sprintId = 'autonomous'): Array<{
  payload: AuditRecord;
}> {
  const filePath = join(root, '.deckent', 'recently-works', `${sprintId}-events.jsonl`);
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, 'utf-8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l));
}

/** A `sleep` that resolves instantly but tracks every call. */
function trackedSleep(): {
  fn: NonNullable<RunAutonomousLoopOptions['sleep']>;
  calls: number[];
} {
  const calls: number[] = [];
  const fn = async (ms: number): Promise<void> => {
    calls.push(ms);
  };
  return { fn, calls };
}

const config: AutonomousRuntimeConfig = { tenantId: 'test' };

// ─── Tests ───────────────────────────────────────────────────────────

describe('runAutonomousLoop — loop semantics', () => {
  it('runs exactly N ticks when maxIterations is set, then returns "maxIterations"', async () => {
    const { deps, spies } = stubDeps();
    const sleep = trackedSleep();

    const summary = await runAutonomousLoop(config, deps, {
      intervalMs: 100,
      maxIterations: 3,
      sleep: sleep.fn,
    });

    expect(summary.iterations).toBe(3);
    expect(summary.reason).toBe('maxIterations');
    expect(spies.triggerNext).toHaveBeenCalledTimes(3);
    expect(spies.execute).toHaveBeenCalledTimes(3);
  });

  it('idle tick (no_trigger) awaits the configured intervalMs', async () => {
    const { deps } = stubDeps({ trigger: null });
    const sleep = trackedSleep();

    await runAutonomousLoop(config, deps, {
      intervalMs: 250,
      maxIterations: 3,
      sleep: sleep.fn,
    });

    // Every iteration was idle → every sleep call should be 250ms.
    expect(sleep.calls).toHaveLength(3);
    expect(sleep.calls.every((ms) => ms === 250)).toBe(true);
  });

  it('active tick yields to the event loop with sleep(0), not intervalMs', async () => {
    const { deps } = stubDeps();
    const sleep = trackedSleep();

    await runAutonomousLoop(config, deps, {
      intervalMs: 999,
      maxIterations: 2,
      sleep: sleep.fn,
    });

    // Two active ticks → both sleep calls are 0, never the idle interval.
    expect(sleep.calls).toEqual([0, 0]);
  });

  it('pre-aborted AbortSignal stops cleanly with zero iterations', async () => {
    const { deps, spies } = stubDeps();
    const sleep = trackedSleep();
    const controller = new AbortController();
    controller.abort();

    const summary = await runAutonomousLoop(config, deps, {
      intervalMs: 100,
      sleep: sleep.fn,
      signal: controller.signal,
    });

    expect(summary.iterations).toBe(0);
    expect(summary.reason).toBe('aborted');
    expect(spies.triggerNext).not.toHaveBeenCalled();
  });

  it('signal aborted mid-loop stops cleanly after the in-flight cycle', async () => {
    const controller = new AbortController();
    let i = 0;
    const { deps } = stubDeps({
      trigger: () => {
        i += 1;
        if (i === 2) controller.abort();
        return makeTrigger({ id: `t-${i}` });
      },
    });
    const sleep = trackedSleep();

    const summary = await runAutonomousLoop(config, deps, {
      intervalMs: 100,
      sleep: sleep.fn,
      signal: controller.signal,
    });

    expect(summary.reason).toBe('aborted');
    // Cycle #2 completes before the next iteration's signal check stops the loop.
    expect(summary.iterations).toBe(2);
  });

  it('invokes onTick observer for every cycle result', async () => {
    const { deps } = stubDeps();
    const sleep = trackedSleep();
    const ticks: string[] = [];

    await runAutonomousLoop(config, deps, {
      intervalMs: 50,
      maxIterations: 2,
      sleep: sleep.fn,
      onTick: (r) => ticks.push(r.outcome),
    });

    expect(ticks).toEqual(['executed', 'executed']);
  });
});

// ─── Real 5-adapter wire tests (tmpdir, full composition) ────────────

describe('buildAutonomousRuntime + runAutonomousLoop — 5-adapter real wire', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'autonomous-runtime-loop-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  const makeFlow = (overrides: Partial<ScheduledFlow> = {}): ScheduledFlow => ({
    id: 'flow-1',
    cronExpr: '* * * * *',
    action: 'mrp.refresh',
    tenantId: 'brain', // role-resolvable
    enabled: true,
    ...overrides,
  });

  const makePolicy = (
    overrides: Partial<SelfDispatchPolicy> = {},
  ): SelfDispatchPolicy => ({
    id: 'p-1',
    trigger: 'scheduled',
    action: 'start',
    ...overrides,
  });

  it('denied-cycle: unknown tenantId → authority denies, audit JSONL records "denied"', async () => {
    const handler: ActionHandler = vi.fn().mockResolvedValue({ outcome: 'success' });
    const handlers = new Map<string, ActionHandler>([['mrp.refresh', handler]]);

    const { deps } = buildAutonomousRuntime({
      projectRoot,
      flows: [makeFlow({ tenantId: 'external-tenant-x' })],
      policy: makePolicy({ guard: { requiresApproval: false } }),
      actionHandlers: handlers,
      clock: () => new Date('2026-06-04T10:00:00.000Z'),
      now: () => '2026-06-04T10:00:00.000Z',
    });

    const sleep = trackedSleep();
    await runAutonomousLoop(config, deps, {
      intervalMs: 100,
      maxIterations: 1,
      sleep: sleep.fn,
    });

    // Handler must NOT have been executed because authority denied.
    expect(handler).not.toHaveBeenCalled();

    const events = readAuditEvents(projectRoot);
    expect(events).toHaveLength(1);
    expect(events[0]!.payload.outcome).toBe('denied');
    expect(events[0]!.payload.reason).toContain('default-deny');
  });

  it('needs_approval → cycle halts at "pending", executor not called, audit records "pending"', async () => {
    const handler: ActionHandler = vi.fn().mockResolvedValue({ outcome: 'success' });
    // 'write_metric' → maps to ActionType 'write'; worker role + write + unknown
    // target → matrix returns warn → adapter maps to needs_approval.
    const handlers = new Map<string, ActionHandler>([['write_metric', handler]]);

    const { deps, approvalGate } = buildAutonomousRuntime({
      projectRoot,
      flows: [
        makeFlow({
          id: 'flow-needs-approval',
          action: 'write_metric',
          tenantId: 'worker',
        }),
      ],
      policy: makePolicy({ guard: { requiresApproval: false } }),
      actionHandlers: handlers,
      clock: () => new Date('2026-06-04T10:00:00.000Z'),
      now: () => '2026-06-04T10:00:00.000Z',
    });

    const sleep = trackedSleep();
    await runAutonomousLoop(config, deps, {
      intervalMs: 100,
      maxIterations: 1,
      sleep: sleep.fn,
    });

    // Approval invariant: trigger sits pending — executor must NOT have run.
    expect(handler).not.toHaveBeenCalled();
    expect(approvalGate.pending()).toHaveLength(1);

    const events = readAuditEvents(projectRoot);
    expect(events).toHaveLength(1);
    expect(events[0]!.payload.outcome).toBe('pending');
  });

  it('idle real wire (no flows) → no audit events, all sleeps are intervalMs', async () => {
    const { deps } = buildAutonomousRuntime({
      projectRoot,
      flows: [],
      policy: makePolicy(),
      actionHandlers: new Map(),
      clock: () => new Date('2026-06-04T10:00:00.000Z'),
    });

    const sleep = trackedSleep();
    await runAutonomousLoop(config, deps, {
      intervalMs: 333,
      maxIterations: 2,
      sleep: sleep.fn,
    });

    expect(readAuditEvents(projectRoot)).toHaveLength(0);
    expect(sleep.calls).toEqual([333, 333]);
  });
});

// ─── Idle-spin regression tests (busy-spin fix) ───────────────────────
// Verifies that non-active outcomes (pending, denied, rejected, no_trigger)
// all sleep intervalMs rather than sleep(0), preventing the ~57456-cycle
// busy-spin observed when entries are stuck awaiting approval or authority.

describe('runAutonomousLoop — idle-spin fix (non-active outcomes sleep intervalMs)', () => {
  it('(a) pending outcome sleeps intervalMs — busy-spin prevented for approval-gate entries', async () => {
    // Simulate a backlog entry stuck in the approval gate:
    // authority says needs_approval, gate returns pending indefinitely.
    // Without the fix: sleep(0) → re-tick → same outcome → 57456-cycle spin.
    // With the fix: sleep(intervalMs) → rate-limited.
    const deps: AutonomousRuntimeDeps = {
      triggerSource: { next: () => makeTrigger({ id: 'approval-entry-1' }) },
      authority: { check: () => ({ outcome: 'needs_approval', reason: 'approval required' }) },
      approvalGate: { request: async () => ({ outcome: 'pending', reason: 'awaiting human approval' }) },
      executor: { execute: vi.fn().mockResolvedValue({ ok: true }) },
      audit: { record: vi.fn() },
      now: () => '2026-06-18T00:00:00.000Z',
    };
    const sleep = trackedSleep();

    await runAutonomousLoop(config, deps, {
      intervalMs: 400,
      maxIterations: 3,
      sleep: sleep.fn,
    });

    // All 3 cycles returned 'pending' → each sleep must be intervalMs, never 0.
    expect(sleep.calls).toHaveLength(3);
    expect(sleep.calls.every((ms) => ms === 400)).toBe(true);
  });

  it('(b) executed outcome sleeps 0 — fast re-tick preserved for real dispatched work', async () => {
    // A real backlog entry is dispatched and completes (authority=allowed, executor ok).
    // The loop must re-tick immediately (sleep 0) so subsequent entries are processed
    // without waiting the idle interval.
    const { deps } = stubDeps(); // authority=allowed, executor returns {ok:true} → 'executed'
    const sleep = trackedSleep();

    await runAutonomousLoop(config, deps, {
      intervalMs: 999,
      maxIterations: 3,
      sleep: sleep.fn,
    });

    // All 3 cycles returned 'executed' → each sleep must be 0, never intervalMs.
    expect(sleep.calls).toHaveLength(3);
    expect(sleep.calls.every((ms) => ms === 0)).toBe(true);
  });
});
