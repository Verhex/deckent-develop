// tests/nervous/nerv-w1b.test.ts
//
// NERV-W1b — canAutoApply predicate into more detectors (Sprint 306 Task 306-004)
//
// Tests:
//   Suite 1 — StaleWorkerDetector.canAutoApply (tek-stale→ok, ≥3-stale→veto)
//   Suite 2 — DirectivesMidSprintProtection.canAutoApply (EXECUTE→veto, FIX→ok)
//   Suite 3 — staleCount propagated in detect() action payload
//   Suite 4 — Executor predicate integration (predicate called + logged)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { StaleWorkerDetector } from '../../src/nervous/detectors/stale-worker.js';
import { DirectivesMidSprintProtection } from '../../src/nervous/detectors/directives-protection.js';
import { Executor } from '../../src/nervous/executor.js';
import type { CanAutoApplyFn, ActionHandler, NervousHistory } from '../../src/nervous/executor.js';
import type { NervousNotification, NotificationAction, ExecutionRecord } from '../../src/core/nervous-types.js';
import type { HostPrimaryLiveness } from '../../src/core/monitoring-types.js';
import type { DetectorContext, SprintStateSnapshot, ObserverEvent } from '../../src/core/nervous-types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeHistory(): NervousHistory & { records: ExecutionRecord[] } {
  const records: ExecutionRecord[] = [];
  return {
    records,
    append: vi.fn(async (r: ExecutionRecord) => { records.push(r); }),
  };
}

function makeHandler(outcome: 'success' | 'failure' = 'success'): ActionHandler {
  return vi.fn(async () => ({ outcome }));
}

function makeNotification(
  id: string,
  actionId: string,
  payload: Record<string, unknown> = {},
): NervousNotification {
  const action: NotificationAction = {
    id: actionId,
    label: 'Test action',
    policy: 'approve',
    risk: 'medium',
    isSafetyFloor: false,
    payload,
  };
  return {
    id,
    type: 'test',
    title: 'Test notification',
    message: 'Test message',
    severity: 'warning',
    createdAt: '2026-06-19T00:00:00.000Z',
    detectorId: 'test',
    actions: [action],
    timeoutMs: null,
  };
}

const BASE_NOW = new Date('2026-06-19T10:00:00.000Z');
const STALE_THRESHOLD_MS = 120_000; // 2 minutes

function makeEvent(): ObserverEvent {
  return {
    id: 'test-event',
    source: 'cron',
    type: 'TICK',
    timestamp: BASE_NOW.toISOString(),
    payload: {},
  };
}

function makeSprintState(overrides: Partial<SprintStateSnapshot> = {}): SprintStateSnapshot {
  return {
    sprintId: 'sprint-306',
    currentPhase: 'EXECUTE',
    activeWorkers: [],
    openDebtCount: 0,
    totalTasks: 5,
    completedTasks: 2,
    ...overrides,
  };
}

function makeCtx(overrides: Partial<DetectorContext> = {}): DetectorContext {
  return {
    event: makeEvent(),
    sprintState: makeSprintState(),
    projectRoot: '/tmp/test-root',
    now: BASE_NOW,
    ...overrides,
  };
}

function makeStaleWorker(
  id: string,
  taskId: string,
  ageMs: number,
): { id: string; taskId: string; lastHeartbeat: string; liveness: HostPrimaryLiveness } {
  return {
    id,
    taskId,
    lastHeartbeat: new Date(BASE_NOW.getTime() - ageMs).toISOString(),
    liveness: {
      state: 'dead',
      attemptId: `attempt-${taskId}`,
      hostSequence: Math.max(1, Math.floor(ageMs / 1000)),
      reason: 'host process exited',
    },
  };
}

// ─── Suite 1: StaleWorkerDetector.canAutoApply ────────────────────────────────

describe('StaleWorkerDetector.canAutoApply', () => {
  const detector = new StaleWorkerDetector();

  // T1: tek-stale (count=1) → ok=true
  it('returns ok=true for single stale worker (tek-stale)', () => {
    const result = detector.canAutoApply({ staleCount: 1 });
    expect(result.ok).toBe(true);
    expect(result.reason).toContain('single stale worker');
  });

  // T2: 2 stale workers → ok=true (below cascade threshold)
  it('returns ok=true for 2 stale workers (below cascade threshold)', () => {
    const result = detector.canAutoApply({ staleCount: 2 });
    expect(result.ok).toBe(true);
  });

  // T3: ≥3-stale → ok=false (veto cascade)
  it('returns ok=false for 3+ stale workers (cascade veto)', () => {
    const result = detector.canAutoApply({ staleCount: 3 });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('cascade respawn');
    expect(result.reason).toContain('3 stale workers');
  });

  // T4: 5 stale workers → ok=false
  it('returns ok=false for 5 stale workers', () => {
    const result = detector.canAutoApply({ staleCount: 5 });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('5 stale workers');
  });

  // T5: missing staleCount defaults to 1 (single) → ok=true
  it('returns ok=true when staleCount is absent (defaults to 1)', () => {
    const result = detector.canAutoApply({});
    expect(result.ok).toBe(true);
  });
});

// ─── Suite 2: DirectivesMidSprintProtection.canAutoApply ──────────────────────

describe('DirectivesMidSprintProtection.canAutoApply', () => {
  const detector = new DirectivesMidSprintProtection();

  // T6: EXECUTE phase → veto
  it('returns ok=false for DIRECTIVES_WRITE during EXECUTE phase', () => {
    const result = detector.canAutoApply({ phase: 'EXECUTE' });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('EXECUTE phase');
    expect(result.reason).toContain('veto');
  });

  // T7: FIX phase → ok
  it('returns ok=true for DIRECTIVES_WRITE during FIX phase', () => {
    const result = detector.canAutoApply({ phase: 'FIX' });
    expect(result.ok).toBe(true);
    expect(result.reason).toContain('FIX phase');
  });

  // T8: other phase → ok (not a protected execution phase)
  it('returns ok=true for other phases (PLAN, RETRO, etc.)', () => {
    expect(detector.canAutoApply({ phase: 'PLAN' }).ok).toBe(true);
    expect(detector.canAutoApply({ phase: 'RETRO' }).ok).toBe(true);
    expect(detector.canAutoApply({}).ok).toBe(true);
  });
});

// ─── Suite 3: staleCount propagated in detect() payload ───────────────────────

describe('StaleWorkerDetector.detect() — staleCount in action payload', () => {
  // Verify staleCount is carried in suggestedActions payload so canAutoApply
  // can read it at executor time.

  it('includes staleCount=1 in single stale worker action payload', () => {
    const detector = new StaleWorkerDetector(STALE_THRESHOLD_MS);
    const ctx = makeCtx({
      sprintState: makeSprintState({
        activeWorkers: [makeStaleWorker('w-1', '001', STALE_THRESHOLD_MS + 1000)],
      }),
    });
    const result = detector.detect(ctx);
    expect(result).not.toBeNull();
    const action = result!.suggestedActions[0];
    expect(action).toBeDefined();
    expect(action!.payload).toHaveProperty('staleCount', 1);
  });

  it('includes staleCount=3 in each action when 3 workers are stale', () => {
    const detector = new StaleWorkerDetector(STALE_THRESHOLD_MS);
    const ctx = makeCtx({
      sprintState: makeSprintState({
        activeWorkers: [
          makeStaleWorker('w-1', '001', STALE_THRESHOLD_MS + 1000),
          makeStaleWorker('w-2', '002', STALE_THRESHOLD_MS + 2000),
          makeStaleWorker('w-3', '003', STALE_THRESHOLD_MS + 3000),
        ],
      }),
    });
    const result = detector.detect(ctx);
    expect(result).not.toBeNull();
    expect(result!.suggestedActions).toHaveLength(3);
    for (const action of result!.suggestedActions) {
      expect(action.payload).toHaveProperty('staleCount', 3);
    }
  });
});

// ─── Suite 4: Executor predicate integration ──────────────────────────────────

describe('Executor canAutoApply integration — WORKER_RESPAWN and DIRECTIVES_WRITE', () => {
  let testRoot: string;
  const SHORT_TIMEOUT_MS = 100;

  beforeEach(() => {
    testRoot = join(tmpdir(), `deckent-nerv-w1b-${process.pid}-${Date.now()}`);
    mkdirSync(testRoot, { recursive: true });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    try { rmSync(testRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
  });

  // T9: WORKER_RESPAWN tek-stale → predicate called → ok=true → auto-proceeds + logged
  it('auto-proceeds WORKER_RESPAWN for single stale worker and logs canAutoApply', async () => {
    const staleDetector = new StaleWorkerDetector();
    const history = makeHistory();
    const handler = makeHandler('success');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const canAutoApplyMap = new Map<string, CanAutoApplyFn>([
      ['WORKER_RESPAWN', (p) => staleDetector.canAutoApply(p)],
    ]);
    const executor = new Executor(history, handler, undefined, testRoot, SHORT_TIMEOUT_MS, canAutoApplyMap);

    const notification = makeNotification(
      'notif-respawn-ok',
      'WORKER_RESPAWN',
      { workerId: 'w-1', taskId: '001', staleCount: 1 },
    );

    const handlePromise = executor.handle(notification);
    await vi.advanceTimersByTimeAsync(SHORT_TIMEOUT_MS + 50);
    const records = await handlePromise;

    expect(records).toHaveLength(1);
    expect(records[0]!.decision).toBe('timeout-auto-applied');
    expect(handler).toHaveBeenCalledOnce();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('canAutoApply'));

    logSpy.mockRestore();
  });

  // T10: WORKER_RESPAWN cascade (staleCount=3) → predicate vetoes → pending, handler NOT called
  it('vetoes WORKER_RESPAWN auto-apply for cascade (staleCount>=3) and keeps pending', async () => {
    const staleDetector = new StaleWorkerDetector();
    const history = makeHistory();
    const handler = makeHandler('success');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const canAutoApplyMap = new Map<string, CanAutoApplyFn>([
      ['WORKER_RESPAWN', (p) => staleDetector.canAutoApply(p)],
    ]);
    const executor = new Executor(history, handler, undefined, testRoot, SHORT_TIMEOUT_MS, canAutoApplyMap);

    const notification = makeNotification(
      'notif-respawn-veto',
      'WORKER_RESPAWN',
      { workerId: 'w-2', taskId: '002', staleCount: 3 },
    );

    let resolved = false;
    executor.handle(notification).then(() => { resolved = true; }).catch(() => { resolved = true; });

    await vi.advanceTimersByTimeAsync(SHORT_TIMEOUT_MS + 50);

    expect(resolved).toBe(false);
    expect(handler).not.toHaveBeenCalled();
    expect(executor.pendingCount).toBe(1);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('ok=false'));

    executor.resolveApproval('notif-respawn-veto', 'rejected');
    await vi.runAllTimersAsync();
    logSpy.mockRestore();
  });

  // T11: DIRECTIVES_WRITE EXECUTE → predicate vetoes → pending, handler NOT called
  it('vetoes DIRECTIVES_WRITE auto-apply during EXECUTE phase', async () => {
    const directivesDetector = new DirectivesMidSprintProtection();
    const history = makeHistory();
    const handler = makeHandler('success');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const canAutoApplyMap = new Map<string, CanAutoApplyFn>([
      ['DIRECTIVES_WRITE', (p) => directivesDetector.canAutoApply(p)],
    ]);
    const executor = new Executor(history, handler, undefined, testRoot, SHORT_TIMEOUT_MS, canAutoApplyMap);

    const notification = makeNotification(
      'notif-dw-execute',
      'DIRECTIVES_WRITE',
      { phase: 'EXECUTE', sprintId: 'sprint-306' },
    );

    let resolved = false;
    executor.handle(notification).then(() => { resolved = true; }).catch(() => { resolved = true; });

    await vi.advanceTimersByTimeAsync(SHORT_TIMEOUT_MS + 50);

    expect(resolved).toBe(false);
    expect(handler).not.toHaveBeenCalled();
    expect(executor.pendingCount).toBe(1);

    executor.resolveApproval('notif-dw-execute', 'rejected');
    await vi.runAllTimersAsync();
    logSpy.mockRestore();
  });

  // T12: DIRECTIVES_WRITE FIX → predicate ok=true → auto-proceeds + logged
  it('auto-proceeds DIRECTIVES_WRITE during FIX phase and logs canAutoApply', async () => {
    const directivesDetector = new DirectivesMidSprintProtection();
    const history = makeHistory();
    const handler = makeHandler('success');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const canAutoApplyMap = new Map<string, CanAutoApplyFn>([
      ['DIRECTIVES_WRITE', (p) => directivesDetector.canAutoApply(p)],
    ]);
    const executor = new Executor(history, handler, undefined, testRoot, SHORT_TIMEOUT_MS, canAutoApplyMap);

    const notification = makeNotification(
      'notif-dw-fix',
      'DIRECTIVES_WRITE',
      { phase: 'FIX', sprintId: 'sprint-306' },
    );

    const handlePromise = executor.handle(notification);
    await vi.advanceTimersByTimeAsync(SHORT_TIMEOUT_MS + 50);
    const records = await handlePromise;

    expect(records).toHaveLength(1);
    expect(records[0]!.decision).toBe('timeout-auto-applied');
    expect(handler).toHaveBeenCalledOnce();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('canAutoApply'));

    logSpy.mockRestore();
  });
});
