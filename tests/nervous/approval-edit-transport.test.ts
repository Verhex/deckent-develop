// tests/nervous/approval-edit-transport.test.ts
//
// APPROVE-007b (Sprint 280 Task 280-003) — modifiedPayload IPC transport +
// executor consume. Two concerns:
//   1. Transport — NervousIpcQueue.writeApproval/readPending round-trip the
//      optional `modifiedPayload` field (backward-compat when absent).
//   2. Consume  — Executor.resolveApproval(id, decision, { modifiedPayload })
//      shallow-merges the edit over the action payload on `accepted`; absent
//      → byte-identical pre-edit behavior; ignored on `rejected`; SAFETY_FLOOR
//      (locked) actions keep explicit-approval gating.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { NervousIpcQueue } from '../../src/nervous/ipc-queue.js';
import { Executor } from '../../src/nervous/executor.js';
import type { ActionHandler, NervousHistory } from '../../src/nervous/executor.js';
import type {
  NervousNotification,
  NotificationAction,
  ExecutionRecord,
} from '../../src/core/nervous-types.js';

// ─── Transport helpers ────────────────────────────────────────────────────────

function makeTempRoot(): string {
  return mkdtempSync(join(tmpdir(), 'nervous-edit-transport-'));
}

// ─── Executor helpers (mirror tests/nervous/executor.test.ts) ─────────────────

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
    id: 'notif-edit-001',
    type: 'test',
    title: 'Edit Test',
    message: 'Test message',
    severity: 'info',
    createdAt: '2026-06-11T10:00:00.000Z',
    detectorId: 'test-detector',
    actions: [],
    timeoutMs: null,
    ...overrides,
  };
}

function createAction(overrides: Partial<NotificationAction> = {}): NotificationAction {
  return {
    id: 'WORKER_RESPAWN',
    label: 'Respawn worker',
    policy: 'suggest-5m',
    risk: 'medium',
    isSafetyFloor: false,
    payload: { workerId: 'w-1', reason: 'stale' },
    ...overrides,
  };
}

// ─── Transport tests (real fs, real timers) ───────────────────────────────────

describe('APPROVE-007b transport — NervousIpcQueue modifiedPayload', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = makeTempRoot();
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  // Test 1: round-trip — writeApproval persists modifiedPayload, readPending returns it.
  it('round-trips modifiedPayload through writeApproval → readPending', async () => {
    const queue = new NervousIpcQueue(tempRoot);
    await queue.writeApproval({
      notificationId: 'ns-edit-a',
      decision: 'accepted',
      modifiedPayload: { reason: 'edited', extra: 42 },
    });

    const pending = await queue.readPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].request.notificationId).toBe('ns-edit-a');
    expect(pending[0].request.decision).toBe('accepted');
    expect(pending[0].request.modifiedPayload).toEqual({ reason: 'edited', extra: 42 });
  });

  // Test 2: nested/complex payload survives JSON round-trip intact.
  it('preserves a nested/complex modifiedPayload verbatim', async () => {
    const queue = new NervousIpcQueue(tempRoot);
    const complex = {
      target: { path: 'src/x.ts', lines: [1, 2, 3] },
      flags: { force: true, dryRun: false },
      note: 'çök-güvenli düzen',
    };
    await queue.writeApproval({
      notificationId: 'ns-edit-nested',
      decision: 'accepted',
      modifiedPayload: complex,
    });

    const pending = await queue.readPending();
    expect(pending[0].request.modifiedPayload).toEqual(complex);
  });

  // Test 3: backward-compat — absent modifiedPayload → key omitted, field undefined.
  it('omits the modifiedPayload key when absent (byte-compat with legacy writes)', async () => {
    const queue = new NervousIpcQueue(tempRoot);
    const file = await queue.writeApproval({
      notificationId: 'ns-edit-none',
      decision: 'rejected',
      reason: 'no-op',
    });

    const rawParsed = JSON.parse(readFileSync(file, 'utf-8')) as Record<string, unknown>;
    expect('modifiedPayload' in rawParsed).toBe(false);

    const pending = await queue.readPending();
    expect(pending[0].request.modifiedPayload).toBeUndefined();
    // Legacy fields untouched.
    expect(pending[0].request.decision).toBe('rejected');
    expect(pending[0].request.reason).toBe('no-op');
  });

  // Test 4: only one file written; modifiedPayload does not change the file layout.
  it('writes exactly one pending file carrying the edit', async () => {
    const queue = new NervousIpcQueue(tempRoot);
    await queue.writeApproval({
      notificationId: 'ns-edit-single',
      decision: 'accepted',
      modifiedPayload: { k: 'v' },
    });
    expect(readdirSync(queue.getPendingDir())).toHaveLength(1);
  });
});

// ─── Consume tests (executor merge, fake timers) ──────────────────────────────

describe('APPROVE-007b consume — Executor.resolveApproval modifiedPayload merge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // Test 5: accepted + modifiedPayload → handler receives shallow-merged payload.
  it('merges modifiedPayload over the original on accepted (suggest policy)', async () => {
    const history = createMockHistory();
    const handler = createMockHandler('success');
    const executor = new Executor(history, handler);

    const action = createAction({
      policy: 'suggest-5m',
      payload: { workerId: 'w-1', reason: 'stale', keep: 'me' },
    });
    const notification = createNotification({ id: 'notif-merge', actions: [action] });

    const handlePromise = executor.handle(notification);
    executor.resolveApproval('notif-merge', 'accepted', {
      modifiedPayload: { reason: 'edited-by-human', added: true },
    });
    const records = await handlePromise;

    // override of `reason`, addition of `added`, preservation of untouched keys.
    expect(handler).toHaveBeenCalledWith('WORKER_RESPAWN', {
      workerId: 'w-1',
      reason: 'edited-by-human',
      keep: 'me',
      added: true,
    });
    expect(records[0].decision).toBe('accepted');
    expect(records[0].outcome).toBe('success');
  });

  // Test 6: accepted WITHOUT modifiedPayload → handler gets original payload (byte-exact).
  it('runs with the original payload when no edit is supplied (byte-identical path)', async () => {
    const history = createMockHistory();
    const handler = createMockHandler('success');
    const executor = new Executor(history, handler);

    const original = { workerId: 'w-2', reason: 'stale' };
    const action = createAction({ policy: 'suggest-5m', payload: original });
    const notification = createNotification({ id: 'notif-noedit', actions: [action] });

    const handlePromise = executor.handle(notification);
    executor.resolveApproval('notif-noedit', 'accepted'); // no opts
    await handlePromise;

    expect(handler).toHaveBeenCalledWith('WORKER_RESPAWN', original);
  });

  // Test 7: passing opts with undefined modifiedPayload behaves like no edit.
  it('treats an undefined modifiedPayload as no edit', async () => {
    const history = createMockHistory();
    const handler = createMockHandler('success');
    const executor = new Executor(history, handler);

    const original = { workerId: 'w-3', reason: 'stale' };
    const action = createAction({ policy: 'suggest-5m', payload: original });
    const notification = createNotification({ id: 'notif-undef', actions: [action] });

    const handlePromise = executor.handle(notification);
    executor.resolveApproval('notif-undef', 'accepted', { modifiedPayload: undefined });
    await handlePromise;

    expect(handler).toHaveBeenCalledWith('WORKER_RESPAWN', original);
  });

  // Test 8: reject + modifiedPayload → edit is ignored, handler never invoked.
  it('ignores modifiedPayload on a rejected decision (handler not called)', async () => {
    const history = createMockHistory();
    const handler = createMockHandler('success');
    const executor = new Executor(history, handler);

    const action = createAction({ policy: 'suggest-5m' });
    const notification = createNotification({ id: 'notif-reject-edit', actions: [action] });

    const handlePromise = executor.handle(notification);
    executor.resolveApproval('notif-reject-edit', 'rejected', {
      modifiedPayload: { reason: 'should-be-ignored' },
    });
    const records = await handlePromise;

    expect(handler).not.toHaveBeenCalled();
    expect(records[0].decision).toBe('rejected');
    expect(records[0].outcome).toBe('pending');
  });

  // Test 9: SAFETY_FLOOR (locked) approve still requires explicit accept — and
  //         the edit is applied to the payload it executes with.
  it('preserves SAFETY_FLOOR gating and still merges the edit on accept', async () => {
    const history = createMockHistory();
    const handler = createMockHandler('success');
    const executor = new Executor(history, handler);

    const action = createAction({
      policy: 'approve',
      id: 'KILL_LIVE_SPRINT',
      isSafetyFloor: true,
      payload: { sprintId: 'sprint-280', force: false },
    });
    const notification = createNotification({ id: 'notif-locked', actions: [action] });

    const handlePromise = executor.handle(notification);

    // Locked action must NOT auto-resolve even after a long wait.
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000); // 1 hour
    expect(executor.pendingCount).toBe(1);
    expect(handler).not.toHaveBeenCalled();

    // Explicit human accept WITH an edit.
    executor.resolveApproval('notif-locked', 'accepted', {
      modifiedPayload: { force: true, confirmedBy: 'alperen' },
    });
    const records = await handlePromise;

    expect(handler).toHaveBeenCalledWith('KILL_LIVE_SPRINT', {
      sprintId: 'sprint-280',
      force: true,
      confirmedBy: 'alperen',
    });
    expect(records[0].decision).toBe('accepted');
    expect(records[0].decidedBy).toBe('user');
    expect(records[0].outcome).toBe('success');
  });

  // Test 10: end-to-end glue simulation — the IPC poller forwards request.modifiedPayload
  //          into resolveApproval (what bootstrap.ts wires onto the live queue).
  it('applies an edit forwarded the way the poller hands a request to the executor', async () => {
    const history = createMockHistory();
    const handler = createMockHandler('success');
    const executor = new Executor(history, handler);

    const action = createAction({ policy: 'suggest-5m', payload: { a: 1, b: 2 } });
    const notification = createNotification({ id: 'notif-poller', actions: [action] });

    const handlePromise = executor.handle(notification);

    // Shape of a request that NervousIpcQueue.readPending would yield.
    const request = {
      notificationId: 'notif-poller',
      decision: 'accepted' as const,
      requestedAt: '2026-06-11T10:00:00.000Z',
      modifiedPayload: { b: 99, c: 3 },
    };
    executor.resolveApproval(request.notificationId, request.decision, {
      modifiedPayload: request.modifiedPayload,
    });
    await handlePromise;

    expect(handler).toHaveBeenCalledWith('WORKER_RESPAWN', { a: 1, b: 99, c: 3 });
  });
});
