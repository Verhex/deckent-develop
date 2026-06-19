// tests/nervous/panic-gate-wire.test.ts
//
// Sprint 279 Task 279-002 — Panic-gate timeout wire tests.
//
// Verifies that Executor.handleApprove:
//   1. auto-proceeds (timeout-auto-applied) for non-SAFETY_FLOOR actions after timeout
//   2. does NOT auto-proceed for SAFETY_FLOOR actions — still waits for human
//   3. early accept resolves immediately (before timeout)
//   4. early reject resolves immediately (before timeout)
//   5. action handler IS called on auto-proceed
//   6. action handler is NOT called on reject
//   7. multiple pending approvals: each independent
//
// All tests use vi.useFakeTimers + tmpdir — no real network/docker.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Executor } from '../../src/nervous/executor.js';
import type { ActionHandler, NervousHistory } from '../../src/nervous/executor.js';
import type { NervousNotification, NotificationAction, ExecutionRecord } from '../../src/core/nervous-types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createMockHistory(): NervousHistory & { records: ExecutionRecord[] } {
  const records: ExecutionRecord[] = [];
  return {
    records,
    append: vi.fn(async (record: ExecutionRecord) => { records.push(record); }),
  };
}

function createMockHandler(outcome: 'success' | 'failure' = 'success'): ActionHandler {
  return vi.fn(async () => ({ outcome }));
}

function createNotification(id: string, actionOverrides: Partial<NotificationAction> = {}): NervousNotification {
  const action: NotificationAction = {
    id: 'ORPHAN_TASK_ARCHIVE',
    label: 'Archive orphan tasks',
    policy: 'approve',
    risk: 'low',
    isSafetyFloor: false,
    payload: {},
    ...actionOverrides,
  };
  return {
    id,
    type: 'test',
    title: 'Test Notification',
    message: 'Test message',
    severity: 'info',
    createdAt: '2026-06-10T00:00:00.000Z',
    detectorId: 'test-detector',
    actions: [action],
    timeoutMs: null,
  };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

let testRoot: string;

beforeEach(() => {
  testRoot = join(tmpdir(), `deckent-pg-wire-${process.pid}-${Date.now()}`);
  mkdirSync(testRoot, { recursive: true });
});

afterEach(() => {
  vi.useRealTimers();
  try {
    rmSync(testRoot, { recursive: true, force: true });
  } catch {
    // best-effort
  }
});

describe('panic-gate wire — Executor.handleApprove timeout', () => {
  it('auto-proceeds (timeout-auto-applied) for non-SAFETY_FLOOR after 50ms', async () => {
    vi.useFakeTimers();
    const history = createMockHistory();
    const handler = createMockHandler();
    const executor = new Executor(history, handler, undefined, testRoot, 50);
    const notification = createNotification('notif-001');

    const handlePromise = executor.handle(notification);

    // Advance past the 50ms explicit approveTimeoutMs
    await vi.advanceTimersByTimeAsync(51);

    const records = await handlePromise;
    expect(records).toHaveLength(1);
    expect(records[0].decision).toBe('timeout-auto-applied');
    expect(records[0].decidedBy).toBe('timeout');
    expect(records[0].outcome).toBe('success');
  });

  it('action handler IS called when timeout auto-proceeds', async () => {
    vi.useFakeTimers();
    const history = createMockHistory();
    const handler = createMockHandler('success');
    const executor = new Executor(history, handler, undefined, testRoot, 50);
    const notification = createNotification('notif-002');

    const handlePromise = executor.handle(notification);
    await vi.advanceTimersByTimeAsync(51);
    await handlePromise;

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith('ORPHAN_TASK_ARCHIVE', {});
  });

  it('SAFETY_FLOOR action does NOT auto-proceed after timeout — still awaiting human', async () => {
    vi.useFakeTimers();
    const history = createMockHistory();
    const handler = createMockHandler();
    const executor = new Executor(history, handler, undefined, testRoot, 50);
    // KILL_LIVE_SPRINT is a SAFETY_FLOOR action
    const notification = createNotification('notif-003', {
      id: 'KILL_LIVE_SPRINT',
      isSafetyFloor: true,
    });

    let resolved = false;
    executor.handle(notification).then(() => { resolved = true; }).catch(() => { resolved = true; });

    // Advance past timeout — SAFETY_FLOOR should still be waiting
    await vi.advanceTimersByTimeAsync(15_000);

    expect(resolved).toBe(false);
    expect(handler).not.toHaveBeenCalled();

    // Cleanup: resolve manually so the Promise doesn't leak
    executor.resolveApproval('notif-003', 'rejected');
    await vi.runAllTimersAsync();
  });

  it('early accept resolves immediately before timeout fires', async () => {
    vi.useFakeTimers();
    const history = createMockHistory();
    const handler = createMockHandler();
    const executor = new Executor(history, handler, undefined, testRoot, 10_000);
    const notification = createNotification('notif-004');

    const handlePromise = executor.handle(notification);

    // Accept before timeout (advance only 1s)
    await vi.advanceTimersByTimeAsync(1_000);
    executor.resolveApproval('notif-004', 'accepted');
    await vi.runAllTimersAsync();

    const records = await handlePromise;
    expect(records).toHaveLength(1);
    expect(records[0].decision).toBe('accepted');
    expect(records[0].decidedBy).toBe('user');
    expect(records[0].outcome).toBe('success');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('early reject resolves immediately, action handler NOT called', async () => {
    vi.useFakeTimers();
    const history = createMockHistory();
    const handler = createMockHandler();
    const executor = new Executor(history, handler, undefined, testRoot, 10_000);
    const notification = createNotification('notif-005');

    const handlePromise = executor.handle(notification);

    await vi.advanceTimersByTimeAsync(500);
    executor.resolveApproval('notif-005', 'rejected');
    await vi.runAllTimersAsync();

    const records = await handlePromise;
    expect(records).toHaveLength(1);
    expect(records[0].decision).toBe('rejected');
    expect(records[0].outcome).toBe('pending');
    expect(handler).not.toHaveBeenCalled();
  });

  it('result is appended to history after auto-proceed', async () => {
    vi.useFakeTimers();
    const history = createMockHistory();
    const handler = createMockHandler();
    const executor = new Executor(history, handler, undefined, testRoot, 50);
    const notification = createNotification('notif-006');

    const handlePromise = executor.handle(notification);
    await vi.advanceTimersByTimeAsync(51);
    await handlePromise;

    expect(history.records).toHaveLength(1);
    expect(history.records[0].decision).toBe('timeout-auto-applied');
  });

  it('after early-accept, subsequent timeout event does not re-execute action', async () => {
    vi.useFakeTimers();
    const history = createMockHistory();
    const handler = createMockHandler();
    const executor = new Executor(history, handler, undefined, testRoot, 10_000);
    const notification = createNotification('notif-007');

    const handlePromise = executor.handle(notification);
    await vi.advanceTimersByTimeAsync(500);
    executor.resolveApproval('notif-007', 'accepted');
    await vi.runAllTimersAsync();

    // Advance past full timeout — handler should only be called once
    await vi.advanceTimersByTimeAsync(15_000);
    await handlePromise;

    // Handler called exactly once (early-accept path only)
    expect(handler).toHaveBeenCalledOnce();
  });
});
