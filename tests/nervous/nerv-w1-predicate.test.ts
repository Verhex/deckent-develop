// tests/nervous/nerv-w1-predicate.test.ts
//
// NERV-W1 — conditional-approve explicit predicate
// Sprint 303 Task 303-011
//
// Tests:
//   Suite 1 — ScopeCollisionMonitor.canAutoApply unit tests (3 tests)
//   Suite 2 — Executor predicate integration (3 tests)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { ScopeCollisionMonitor } from '../../src/nervous/detectors/scope-collision.js';
import { Executor } from '../../src/nervous/executor.js';
import type { CanAutoApplyFn, ActionHandler, NervousHistory } from '../../src/nervous/executor.js';
import type { NervousNotification, NotificationAction, ExecutionRecord } from '../../src/core/nervous-types.js';

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

function makeNotification(id: string, actionOverrides: Partial<NotificationAction> = {}): NervousNotification {
  const action: NotificationAction = {
    id: 'SCOPE_COLLISION_REORDER',
    label: 'Reorder colliding tasks',
    policy: 'approve',
    risk: 'medium',
    isSafetyFloor: false,
    payload: {},
    ...actionOverrides,
  };
  return {
    id,
    type: 'scope-collision',
    title: 'Scope collision detected',
    message: 'Tasks write to the same file',
    severity: 'warning',
    createdAt: '2026-06-19T00:00:00.000Z',
    detectorId: 'scope-collision',
    // 531 süpürme: scheduler fencing (executor.fenceScopeCollisionReorder)
    // re-validates the EXACT sprint/task/file identity against live .tasks/
    // state before any auto-proceed — a fenceless notification never reaches
    // the canAutoApply predicate at all. These fixtures satisfy the fence.
    sprintId: FENCE_SPRINT_ID,
    actions: [action],
    timeoutMs: null,
  };
}

const FENCE_SPRINT_ID = 'sprint-303';
const FENCE_COLLISION_FILE = 'src/foo.ts';
const FENCE_TASK_IDS = ['303-001', '303-002'] as const;

/** Live .tasks/ state the scheduler fence validates against (see above). */
function seedCollisionTasks(root: string): void {
  const tasksDir = join(root, '.tasks');
  mkdirSync(tasksDir, { recursive: true });
  for (const taskId of FENCE_TASK_IDS) {
    writeFileSync(
      join(tasksDir, `task-${taskId}.json`),
      JSON.stringify({
        id: taskId,
        sprintId: FENCE_SPRINT_ID,
        status: 'EXECUTING',
        scope: { filesWrite: [FENCE_COLLISION_FILE] },
      }),
    );
  }
}

// ─── Suite 1: ScopeCollisionMonitor.canAutoApply unit tests ──────────────────

describe('ScopeCollisionMonitor.canAutoApply', () => {
  const monitor = new ScopeCollisionMonitor();

  // T1: No collisions in payload → ok=true, no-op reason
  it('returns ok=true when payload has no collisions', () => {
    const result = monitor.canAutoApply({});
    expect(result.ok).toBe(true);
    expect(result.reason).toBe('no collisions to serialize');
  });

  // T2: Single collision (2 tasks, 1 file) — each task in exactly 1 group → serializable
  it('returns ok=true and auto-serialize-OK reason for a simple 2-task single-file collision', () => {
    const payload = {
      collisions: [
        {file: 'src/core/config.ts', taskIds: ['303-001', '303-002']},
      ],
    };
    const result = monitor.canAutoApply(payload);
    expect(result.ok).toBe(true);
    expect(result.reason).toContain('auto-serialize-OK');
    expect(result.reason).toContain('1 collision(s)');
  });

  // T3: Task A appears in 2 groups (A-B share file1, A-C share file2) → circular heuristic → ok=false
  it('returns ok=false when a task appears in multiple collision groups (circular heuristic)', () => {
    const payload = {
      collisions: [
        {file: 'src/foo.ts', taskIds: ['A', 'B']},     // A is in group 1
        {file: 'src/bar.ts', taskIds: ['A', 'C']},     // A is in group 2
      ],
    };
    const result = monitor.canAutoApply(payload);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('circular');
  });
});

// ─── Suite 2: Executor predicate integration ─────────────────────────────────

describe('Executor canAutoApply predicate integration (approve timeout)', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = join(tmpdir(), `deckent-nerv-w1-${process.pid}-${Date.now()}`);
    mkdirSync(testRoot, { recursive: true });
    seedCollisionTasks(testRoot);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    try { rmSync(testRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
  });

  // Custom short timeout so tests advance quickly
  const SHORT_TIMEOUT_MS = 100;

  // T4: predicate ok=true → timeout fires → auto-proceed + console.log contains 'canAutoApply'
  it('calls canAutoApply predicate and logs result when predicate returns ok=true, then auto-proceeds', async () => {
    const history = makeHistory();
    const handler = makeHandler('success');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const predicate: CanAutoApplyFn = vi.fn().mockReturnValue({
      ok: true,
      reason: 'auto-serialize-OK: 1 collision(s) can be sequenced',
    });
    const canAutoApplyMap = new Map<string, CanAutoApplyFn>([
      ['SCOPE_COLLISION_REORDER', predicate],
    ]);

    const executor = new Executor(history, handler, undefined, testRoot, SHORT_TIMEOUT_MS, canAutoApplyMap);

    const collisionsPayload = {collisions: [{file: 'src/foo.ts', taskIds: ['303-001', '303-002']}]};
    const notification = makeNotification('notif-pred-ok', {payload: collisionsPayload});

    const handlePromise = executor.handle(notification);

    // Advance past the short timeout → TIMEOUT_AUTO_PROCEED → predicate called → auto-proceed
    await vi.advanceTimersByTimeAsync(SHORT_TIMEOUT_MS + 50);

    const records = await handlePromise;

    // Predicate was called with the action payload
    expect(predicate).toHaveBeenCalledWith(collisionsPayload);

    // Log was emitted with canAutoApply and the reason
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('canAutoApply'),
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('auto-serialize-OK'),
    );

    // Auto-proceed happened
    expect(records).toHaveLength(1);
    expect(records[0].decision).toBe('timeout-auto-applied');
    expect(records[0].decidedBy).toBe('timeout');
    expect(handler).toHaveBeenCalledOnce();

    logSpy.mockRestore();
  });

  // T5: predicate ok=false → timeout fires → predicate vetoes auto-apply → handler NOT called
  it('vetoes auto-apply and keeps action pending when predicate returns ok=false', async () => {
    const history = makeHistory();
    const handler = makeHandler('success');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const predicate: CanAutoApplyFn = vi.fn().mockReturnValue({
      ok: false,
      reason: 'collisions form circular dependencies — manual serialization required',
    });
    const canAutoApplyMap = new Map<string, CanAutoApplyFn>([
      ['SCOPE_COLLISION_REORDER', predicate],
    ]);

    const executor = new Executor(history, handler, undefined, testRoot, SHORT_TIMEOUT_MS, canAutoApplyMap);

    const notification = makeNotification('notif-pred-false', {
      payload: {
        collisions: [
          {file: 'src/foo.ts', taskIds: ['A', 'B']},
          {file: 'src/bar.ts', taskIds: ['A', 'C']},
        ],
      },
    });

    let resolved = false;
    executor.handle(notification).then(() => { resolved = true; }).catch(() => { resolved = true; });

    // Advance past timeout — predicate vetoes → NOT auto-applied
    await vi.advanceTimersByTimeAsync(SHORT_TIMEOUT_MS + 50);

    // Log was still emitted (auditable, even for veto)
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('canAutoApply'),
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('ok=false'),
    );

    // Action is still pending — handler was NOT called
    expect(resolved).toBe(false);
    expect(handler).not.toHaveBeenCalled();
    expect(executor.pendingCount).toBe(1);

    // Cleanup: manually resolve so Promise doesn't leak
    executor.resolveApproval('notif-pred-false', 'rejected');
    await vi.runAllTimersAsync();
    logSpy.mockRestore();
  });

  // T6: no canAutoApplyMap (backward compat) → timeout fires → matrix-timeout auto-proceed
  it('falls back to matrix-timeout auto-proceed when no canAutoApplyMap is provided (backward compat)', async () => {
    const history = makeHistory();
    const handler = makeHandler('success');

    // No canAutoApplyMap → 5th param only, 6th param absent (undefined)
    const executor = new Executor(history, handler, undefined, testRoot, SHORT_TIMEOUT_MS);

    const notification = makeNotification('notif-no-pred', {
      payload: {collisions: [{file: FENCE_COLLISION_FILE, taskIds: [...FENCE_TASK_IDS]}]},
    });

    const handlePromise = executor.handle(notification);

    // Advance past timeout — no predicate, so existing matrix-timeout behavior
    await vi.advanceTimersByTimeAsync(SHORT_TIMEOUT_MS + 50);

    const records = await handlePromise;

    // Auto-proceed happened as before
    expect(records).toHaveLength(1);
    expect(records[0].decision).toBe('timeout-auto-applied');
    expect(records[0].decidedBy).toBe('timeout');
    expect(handler).toHaveBeenCalledOnce();
  });
});
