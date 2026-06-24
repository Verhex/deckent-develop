// tests/nervous/executor.test.ts
//
// Executor — 3 Mod Handler tests (12 tests).
// Sprint 147 Task 7.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Executor } from '../../src/nervous/executor.js';
import type { ActionHandler, NervousHistory } from '../../src/nervous/executor.js';
import type { NervousNotification, NotificationAction, ExecutionRecord } from '../../src/core/nervous-types.js';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function createMockHistory(): NervousHistory & { records: ExecutionRecord[] } {
  const records: ExecutionRecord[] = [];
  return {
    records,
    append: vi.fn(async (record: ExecutionRecord) => { records.push(record); }),
  };
}

function createMockHandler(outcome: 'success' | 'failure' = 'success', error?: string): ActionHandler {
  return vi.fn(async () => ({ outcome, error }));
}

function createNotification(overrides: Partial<NervousNotification> = {}): NervousNotification {
  return {
    id: 'notif-001',
    type: 'test',
    title: 'Test Notification',
    message: 'Test message',
    severity: 'info',
    createdAt: '2026-04-20T10:00:00.000Z',
    detectorId: 'test-detector',
    actions: [],
    timeoutMs: null,
    ...overrides,
  };
}

function createAction(overrides: Partial<NotificationAction> = {}): NotificationAction {
  return {
    id: 'ORPHAN_TASK_ARCHIVE',
    label: 'Archive orphan tasks',
    policy: 'autonomous',
    risk: 'low',
    isSafetyFloor: false,
    payload: { key: 'value' },
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Executor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // Test 1: Autonomous policy → immediate handler call + outcome='success' record
  it('should execute autonomous action immediately with success', async () => {
    const history = createMockHistory();
    const handler = createMockHandler('success');
    const executor = new Executor(history, handler);

    const action = createAction({ policy: 'autonomous', payload: { file: 'test.json' } });
    const notification = createNotification({ actions: [action] });

    const records = await executor.handle(notification);

    expect(records).toHaveLength(1);
    expect(records[0].decision).toBe('autonomous');
    expect(records[0].decidedBy).toBe('system');
    expect(records[0].outcome).toBe('success');
    expect(handler).toHaveBeenCalledWith('ORPHAN_TASK_ARCHIVE', { file: 'test.json' });
  });

  // Test 2: Autonomous handler throw → outcome='failure', error captured
  it('should capture error when autonomous handler throws', async () => {
    const history = createMockHistory();
    const handler = vi.fn(async () => { throw new Error('Handler exploded'); });
    const executor = new Executor(history, handler);

    const action = createAction({ policy: 'autonomous' });
    const notification = createNotification({ actions: [action] });

    const records = await executor.handle(notification);

    expect(records).toHaveLength(1);
    expect(records[0].outcome).toBe('failure');
    expect(records[0].error).toBe('Handler exploded');
    expect(records[0].decision).toBe('autonomous');
  });

  // Test 3: suggest-5m → timer 300s, user accept mid-way → 'accepted' decision
  it('should resolve suggest-5m with accepted when user accepts before timeout', async () => {
    const history = createMockHistory();
    const handler = createMockHandler('success');
    const executor = new Executor(history, handler);

    const action = createAction({ policy: 'suggest-5m', id: 'WORKER_RESPAWN' });
    const notification = createNotification({ id: 'notif-suggest', actions: [action] });

    const handlePromise = executor.handle(notification);

    // User accepts after 1 minute (before 5m timeout)
    await vi.advanceTimersByTimeAsync(60000);
    executor.resolveApproval('notif-suggest', 'accepted');

    const records = await handlePromise;

    expect(records).toHaveLength(1);
    expect(records[0].decision).toBe('accepted');
    expect(records[0].decidedBy).toBe('user');
    expect(records[0].outcome).toBe('success');
    expect(handler).toHaveBeenCalledOnce();
  });

  // Test 4: suggest-30m + no action → timeout → 'timeout-auto-applied'
  it('should auto-apply suggest-30m action when timeout expires', async () => {
    const history = createMockHistory();
    const handler = createMockHandler('success');
    const executor = new Executor(history, handler);

    const action = createAction({ policy: 'suggest-30m', id: 'DEBT_REPRIORITIZE' });
    const notification = createNotification({ id: 'notif-timeout', actions: [action] });

    const handlePromise = executor.handle(notification);

    // Advance past 30 minutes
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);

    const records = await handlePromise;

    expect(records).toHaveLength(1);
    expect(records[0].decision).toBe('timeout-auto-applied');
    expect(records[0].decidedBy).toBe('timeout');
    expect(records[0].outcome).toBe('success');
    expect(records[0].durationMs).toBe(30 * 60 * 1000);
    expect(handler).toHaveBeenCalledOnce();
  });

  // Test 5: suggest-5m + reject mid-way → 'rejected' decision
  it('should resolve suggest-5m with rejected when user rejects', async () => {
    const history = createMockHistory();
    const handler = createMockHandler('success');
    const executor = new Executor(history, handler);

    const action = createAction({ policy: 'suggest-5m', id: 'WORKER_RESPAWN' });
    const notification = createNotification({ id: 'notif-reject', actions: [action] });

    const handlePromise = executor.handle(notification);

    await vi.advanceTimersByTimeAsync(30000);
    executor.resolveApproval('notif-reject', 'rejected');

    const records = await handlePromise;

    expect(records).toHaveLength(1);
    expect(records[0].decision).toBe('rejected');
    expect(records[0].decidedBy).toBe('user');
    expect(records[0].outcome).toBe('pending');
    expect(handler).not.toHaveBeenCalled();
  });

  // Test 6: SAFETY_FLOOR approve → awaits indefinitely until resolveApproval.
  // Non-SAFETY_FLOOR approve actions now auto-proceed after a hard timeout
  // (Sprint 279 WK-nervous, see panic-gate-wire.test.ts); SAFETY_FLOOR (locked)
  // actions remain exempt and require explicit human resolution.
  it('should await indefinitely for SAFETY_FLOOR approve policy until user resolves', async () => {
    const history = createMockHistory();
    const handler = createMockHandler('success');
    const executor = new Executor(history, handler);

    const action = createAction({ policy: 'approve', id: 'KILL_LIVE_SPRINT', isSafetyFloor: true });
    const notification = createNotification({ id: 'notif-approve', actions: [action] });

    const handlePromise = executor.handle(notification);

    // Advance significant time — SAFETY_FLOOR action must not auto-resolve
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000); // 1 hour
    expect(executor.pendingCount).toBe(1);

    // Now resolve
    executor.resolveApproval('notif-approve', 'accepted');

    const records = await handlePromise;

    expect(records).toHaveLength(1);
    expect(records[0].decision).toBe('accepted');
    expect(records[0].decidedBy).toBe('user');
    expect(records[0].outcome).toBe('success');
  });

  // Test 7: approve + rejected → record decidedBy='user', no handler call
  it('should not call handler when approve policy is rejected', async () => {
    const history = createMockHistory();
    const handler = createMockHandler('success');
    const executor = new Executor(history, handler);

    const action = createAction({ policy: 'approve', id: 'SPRINT_START' });
    const notification = createNotification({ id: 'notif-reject-approve', actions: [action] });

    const handlePromise = executor.handle(notification);

    executor.resolveApproval('notif-reject-approve', 'rejected');

    const records = await handlePromise;

    expect(records).toHaveLength(1);
    expect(records[0].decision).toBe('rejected');
    expect(records[0].decidedBy).toBe('user');
    expect(records[0].outcome).toBe('pending');
    expect(handler).not.toHaveBeenCalled();
  });

  // FIX-2 (B-COLLISION-HANG cross-source approval): resolveApproval must accept
  // the 5-char shortCode that surfaces (Telegram/CLI/MCP) display, not only the
  // full notification id. Pre-fix the pendingApprovals map was keyed by full id
  // only, so an "approve <shortCode>" forwarded verbatim by a surface silently
  // no-opped (pendingCount stayed 1). Faithful: resolve by shortCode → resolved.
  it('resolveApproval resolves by shortCode, not only the full id (FIX-2)', async () => {
    const history = createMockHistory();
    const handler = createMockHandler('success');
    const executor = new Executor(history, handler);

    const action = createAction({ policy: 'approve', id: 'KILL_LIVE_SPRINT', isSafetyFloor: true });
    const notification = createNotification({
      id: 'notif-uuid-3f9c2a17-long',
      shortCode: 'a1b2c',
      actions: [action],
    });

    const handlePromise = executor.handle(notification);
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000); // SAFETY_FLOOR never auto-resolves
    expect(executor.pendingCount).toBe(1);

    // Resolve using the SHORT code (what the operator copy-pastes), NOT the full id.
    executor.resolveApproval('a1b2c', 'accepted');
    // Asserted BEFORE awaiting so pre-fix fails cleanly here (no hang): the
    // shortCode missed the full-id-keyed map and pendingCount stayed 1.
    expect(executor.pendingCount).toBe(0);

    const records = await handlePromise;
    expect(records).toHaveLength(1);
    expect(records[0].decision).toBe('accepted');
    expect(records[0].decidedBy).toBe('user');
  });

  // Test 8: Multiple actions in single notification → multiple records
  it('should handle multiple actions in a single notification sequentially', async () => {
    const history = createMockHistory();
    const handler = createMockHandler('success');
    const executor = new Executor(history, handler);

    const actions: NotificationAction[] = [
      createAction({ id: 'ORPHAN_TASK_ARCHIVE', policy: 'autonomous' }),
      createAction({ id: 'LOG_ROTATION', policy: 'autonomous' }),
      createAction({ id: 'CACHE_INVALIDATE', policy: 'autonomous' }),
    ];
    const notification = createNotification({ actions });

    const records = await executor.handle(notification);

    expect(records).toHaveLength(3);
    expect(records[0].actionId).toBe('ORPHAN_TASK_ARCHIVE');
    expect(records[1].actionId).toBe('LOG_ROTATION');
    expect(records[2].actionId).toBe('CACHE_INVALIDATE');
    expect(handler).toHaveBeenCalledTimes(3);
  });

  // Test 9: shutdown() clears all timers, pending approvals resolve 'rejected'
  it('should clear timers and reject pending approvals on shutdown', async () => {
    const history = createMockHistory();
    const handler = createMockHandler('success');
    const executor = new Executor(history, handler);

    const action = createAction({ policy: 'approve', id: 'COMMIT_PUSH' });
    const notification = createNotification({ id: 'notif-shutdown', actions: [action] });

    const handlePromise = executor.handle(notification);

    expect(executor.pendingCount).toBe(1);

    executor.shutdown();

    const records = await handlePromise;

    expect(records).toHaveLength(1);
    expect(records[0].decision).toBe('rejected');
    expect(records[0].decidedBy).toBe('user');
    expect(records[0].outcome).toBe('pending');
    expect(executor.pendingCount).toBe(0);
  });

  // Test 10: History.append called for every record
  it('should call history.append for every execution record', async () => {
    const history = createMockHistory();
    const handler = createMockHandler('success');
    const executor = new Executor(history, handler);

    const actions: NotificationAction[] = [
      createAction({ id: 'ORPHAN_TASK_ARCHIVE', policy: 'autonomous' }),
      createAction({ id: 'LOG_ROTATION', policy: 'autonomous' }),
    ];
    const notification = createNotification({ actions });

    await executor.handle(notification);

    expect(history.append).toHaveBeenCalledTimes(2);
    expect(history.records).toHaveLength(2);
  });

  // Test 11: Reversibility flag propagated from ActionDefinition
  it('should set reversible flag from ActionDefinition lookup', async () => {
    const history = createMockHistory();
    const handler = createMockHandler('success');
    const executor = new Executor(history, handler);

    // ORPHAN_TASK_ARCHIVE is reversible=true in action-registry
    const reversibleAction = createAction({ id: 'ORPHAN_TASK_ARCHIVE', policy: 'autonomous' });
    // DEAD_EVENT_STREAM_CLEANUP is reversible=false in action-registry
    const irreversibleAction = createAction({ id: 'DEAD_EVENT_STREAM_CLEANUP', policy: 'autonomous' });

    const notification = createNotification({ actions: [reversibleAction, irreversibleAction] });
    const records = await executor.handle(notification);

    expect(records[0].reversible).toBe(true);
    expect(records[1].reversible).toBe(false);
  });

  // Test 12: Payload propagation handler → payload doğru
  it('should propagate action payload to handler correctly', async () => {
    const history = createMockHistory();
    const handler = createMockHandler('success');
    const executor = new Executor(history, handler);

    const payload = { workerId: 'w-147-009', taskId: '147-009', reason: 'stale' };
    const action = createAction({ id: 'WORKER_RESPAWN', policy: 'autonomous', payload });
    const notification = createNotification({ actions: [action] });

    const records = await executor.handle(notification);

    expect(handler).toHaveBeenCalledWith('WORKER_RESPAWN', payload);
    expect(records[0].payload).toEqual(payload);
  });
});
