// tests/nervous/scope-collision-reorder-executor.test.ts
//
// Task 487-021 — SCOPE_COLLISION_REORDER fenced-scheduler-effect coverage.
// An accepted (or autonomous) SCOPE_COLLISION_REORDER decision must be turned
// into an identity-fenced effect (exact sprintId/taskId/file, re-validated
// against CURRENT .tasks/ state at execution time) before it reaches the
// action handler. Reject, an unmatched ("ignored") resolveApproval call, and a
// stale identity must all stay non-mutating (handler never invoked) while
// still landing an auditable ExecutionRecord in history.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

function createMockHandler(outcome: 'success' | 'failure' = 'success'): ActionHandler {
  return vi.fn(async () => ({ outcome }));
}

function createNotification(overrides: Partial<NervousNotification> = {}): NervousNotification {
  return {
    id: 'notif-scr-001',
    type: 'scope-collision',
    title: 'Scope collision',
    message: 'Colliding tasks',
    severity: 'warning',
    createdAt: '2026-07-31T00:00:00.000Z',
    detectorId: 'scope-collision',
    actions: [],
    timeoutMs: null,
    sprintId: 'sprint-500',
    ...overrides,
  };
}

function createReorderAction(overrides: Partial<NotificationAction> = {}): NotificationAction {
  return {
    id: 'SCOPE_COLLISION_REORDER',
    label: 'Reorder colliding task(s)',
    policy: 'approve',
    risk: 'medium',
    isSafetyFloor: false,
    payload: {
      collisions: [
        { file: 'src/foo.ts', taskIds: ['500-001', '500-002'] },
      ],
    },
    ...overrides,
  };
}

interface TaskFixture {
  id: string;
  sprintId?: string;
  status?: string;
  filesWrite?: string[];
}

function makeProjectRoot(): string {
  return mkdtempSync(join(tmpdir(), 'deckent-scr-executor-'));
}

function writeTask(projectRoot: string, fixture: TaskFixture): void {
  const tasksDir = join(projectRoot, '.tasks');
  mkdirSync(tasksDir, { recursive: true });
  writeFileSync(
    join(tasksDir, `task-${fixture.id}.json`),
    JSON.stringify({
      id: fixture.id,
      sprintId: fixture.sprintId,
      status: fixture.status ?? 'PENDING',
      scope: { filesWrite: fixture.filesWrite ?? [] },
    }),
    'utf-8',
  );
}

/** Fresh, mutually-consistent pair of colliding tasks under sprint-500. */
function writeFreshTaskPair(projectRoot: string): void {
  writeTask(projectRoot, { id: '500-001', sprintId: 'sprint-500', status: 'PENDING', filesWrite: ['src/foo.ts'] });
  writeTask(projectRoot, { id: '500-002', sprintId: 'sprint-500', status: 'CLAIMED', filesWrite: ['src/foo.ts', 'src/bar.ts'] });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Executor — SCOPE_COLLISION_REORDER fenced scheduler effect', () => {
  let projectRoot: string;

  beforeEach(() => {
    vi.useFakeTimers();
    projectRoot = makeProjectRoot();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('accepted + fresh identity → handler called once with the fenced effect, not the raw payload', async () => {
    writeFreshTaskPair(projectRoot);

    const history = createMockHistory();
    const handler = createMockHandler('success');
    // approveTimeoutMs=0 disables the panic-gate auto-proceed timer so
    // resolveApproval is the only path to acceptance in this test.
    const executor = new Executor(history, handler, undefined, projectRoot, 0);

    const action = createReorderAction();
    const notification = createNotification({ id: 'notif-fresh', actions: [action] });

    const handlePromise = executor.handle(notification);
    const resolved = executor.resolveApproval('notif-fresh', 'accepted');
    const records = await handlePromise;

    expect(resolved).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('SCOPE_COLLISION_REORDER', {
      kind: 'SCOPE_COLLISION_REORDER',
      sprintId: 'sprint-500',
      notificationId: 'notif-fresh',
      fencedAt: expect.any(String),
      collisions: [{ file: 'src/foo.ts', taskIds: ['500-001', '500-002'] }],
    });
    // Never the raw detector payload verbatim (no exact sprint/task identity in it).
    expect(handler).not.toHaveBeenCalledWith('SCOPE_COLLISION_REORDER', action.payload);

    expect(records).toHaveLength(1);
    expect(records[0].decision).toBe('accepted');
    expect(records[0].outcome).toBe('success');
  });

  it('accepted + autonomous policy also fences (funnel applies uniformly)', async () => {
    writeFreshTaskPair(projectRoot);

    const history = createMockHistory();
    const handler = createMockHandler('success');
    const executor = new Executor(history, handler, undefined, projectRoot, 0);

    const action = createReorderAction({ policy: 'autonomous' });
    const notification = createNotification({ id: 'notif-auto', actions: [action] });

    const records = await executor.handle(notification);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('SCOPE_COLLISION_REORDER', expect.objectContaining({
      kind: 'SCOPE_COLLISION_REORDER',
      sprintId: 'sprint-500',
    }));
    expect(records[0].decision).toBe('autonomous');
    expect(records[0].outcome).toBe('success');
  });

  it('rejected → handler never called, non-mutating, still an auditable record', async () => {
    writeFreshTaskPair(projectRoot);

    const history = createMockHistory();
    const handler = createMockHandler('success');
    const executor = new Executor(history, handler, undefined, projectRoot, 0);

    const action = createReorderAction();
    const notification = createNotification({ id: 'notif-reject', actions: [action] });

    const handlePromise = executor.handle(notification);
    const resolved = executor.resolveApproval('notif-reject', 'rejected');
    const records = await handlePromise;

    expect(resolved).toBe(true);
    expect(handler).not.toHaveBeenCalled();
    expect(records).toHaveLength(1);
    expect(records[0].decision).toBe('rejected');
    expect(records[0].outcome).toBe('pending');
    expect(history.append).toHaveBeenCalledTimes(1);
  });

  it('resolveApproval on an unmatched id ("ignore") is non-mutating and does not disturb the real pending approval', async () => {
    writeFreshTaskPair(projectRoot);

    const history = createMockHistory();
    const handler = createMockHandler('success');
    const executor = new Executor(history, handler, undefined, projectRoot, 0);

    const action = createReorderAction();
    const notification = createNotification({ id: 'notif-ignore-real', actions: [action] });

    const handlePromise = executor.handle(notification);

    // "Ignore" — an id with no matching pending approval resolves nothing.
    const ignoredResult = executor.resolveApproval('notif-does-not-exist', 'accepted');
    expect(ignoredResult).toBe(false);
    expect(handler).not.toHaveBeenCalled();

    // The real approval still resolves normally afterward.
    executor.resolveApproval('notif-ignore-real', 'accepted');
    const records = await handlePromise;

    expect(handler).toHaveBeenCalledTimes(1);
    expect(records[0].decision).toBe('accepted');
  });

  it.each<{ name: string; notificationSprintId: string | undefined; setup: () => void }>([
    {
      name: 'missing notification.sprintId',
      notificationSprintId: undefined,
      setup: () => writeFreshTaskPair(projectRoot),
    },
    {
      name: 'a colliding task belongs to a different sprint (cross-sprint mutation blocked)',
      notificationSprintId: 'sprint-500',
      setup: () => {
        writeTask(projectRoot, { id: '500-001', sprintId: 'sprint-999', status: 'PENDING', filesWrite: ['src/foo.ts'] });
        writeTask(projectRoot, { id: '500-002', sprintId: 'sprint-500', status: 'CLAIMED', filesWrite: ['src/foo.ts'] });
      },
    },
    {
      name: 'a colliding task is no longer active',
      notificationSprintId: 'sprint-500',
      setup: () => {
        writeTask(projectRoot, { id: '500-001', sprintId: 'sprint-500', status: 'DONE', filesWrite: ['src/foo.ts'] });
        writeTask(projectRoot, { id: '500-002', sprintId: 'sprint-500', status: 'CLAIMED', filesWrite: ['src/foo.ts'] });
      },
    },
    {
      name: 'the collision file is no longer in the task\'s scope.filesWrite',
      notificationSprintId: 'sprint-500',
      setup: () => {
        writeTask(projectRoot, { id: '500-001', sprintId: 'sprint-500', status: 'PENDING', filesWrite: ['src/other.ts'] });
        writeTask(projectRoot, { id: '500-002', sprintId: 'sprint-500', status: 'CLAIMED', filesWrite: ['src/foo.ts'] });
      },
    },
    {
      name: 'a referenced task file no longer exists',
      notificationSprintId: 'sprint-500',
      setup: () => {
        writeTask(projectRoot, { id: '500-001', sprintId: 'sprint-500', status: 'PENDING', filesWrite: ['src/foo.ts'] });
        // 500-002 intentionally never written — task settled/cleaned up.
      },
    },
  ])('accepted + stale ($name) → handler never called, non-mutating, auditable failure record', async ({ notificationSprintId, setup }) => {
    setup();

    const history = createMockHistory();
    const handler = createMockHandler('success');
    const executor = new Executor(history, handler, undefined, projectRoot, 0);

    const action = createReorderAction();
    const notification = createNotification({
      id: 'notif-stale',
      actions: [action],
      sprintId: notificationSprintId,
    });

    const handlePromise = executor.handle(notification);
    const resolved = executor.resolveApproval('notif-stale', 'accepted');
    const records = await handlePromise;

    expect(resolved).toBe(true);
    expect(handler).not.toHaveBeenCalled();
    expect(records).toHaveLength(1);
    expect(records[0].decision).toBe('accepted');
    expect(records[0].outcome).toBe('failure');
    expect(records[0].error).toMatch(/^stale-scope-collision-reorder:/);
    expect(history.append).toHaveBeenCalledTimes(1);
  });

  it('accepted + malformed payload (no collisions) → handler never called, non-mutating, auditable failure record', async () => {
    writeFreshTaskPair(projectRoot);

    const history = createMockHistory();
    const handler = createMockHandler('success');
    const executor = new Executor(history, handler, undefined, projectRoot, 0);

    const action = createReorderAction({ payload: { collisionCount: 3, threshold: 1, sprintId: 'sprint-500' } });
    const notification = createNotification({ id: 'notif-malformed', actions: [action] });

    const handlePromise = executor.handle(notification);
    executor.resolveApproval('notif-malformed', 'accepted');
    const records = await handlePromise;

    expect(handler).not.toHaveBeenCalled();
    expect(records[0].outcome).toBe('failure');
    expect(records[0].error).toBe('stale-scope-collision-reorder: no valid collisions in payload');
  });

  it('accepted + single-task collision (no longer an actual collision) → handler never called', async () => {
    writeTask(projectRoot, { id: '500-001', sprintId: 'sprint-500', status: 'PENDING', filesWrite: ['src/foo.ts'] });

    const history = createMockHistory();
    const handler = createMockHandler('success');
    const executor = new Executor(history, handler, undefined, projectRoot, 0);

    const action = createReorderAction({
      payload: { collisions: [{ file: 'src/foo.ts', taskIds: ['500-001'] }] },
    });
    const notification = createNotification({ id: 'notif-single', actions: [action] });

    const handlePromise = executor.handle(notification);
    executor.resolveApproval('notif-single', 'accepted');
    const records = await handlePromise;

    expect(handler).not.toHaveBeenCalled();
    expect(records[0].outcome).toBe('failure');
    expect(records[0].error).toContain('no longer has 2+ colliding tasks');
  });

  it('non-fenced action ids are unaffected — payload passes through unchanged', async () => {
    const history = createMockHistory();
    const handler = createMockHandler('success');
    const executor = new Executor(history, handler, undefined, projectRoot, 0);

    const action = createReorderAction({ id: 'DEBT_REPRIORITIZE', payload: { free: 'form' } });
    const notification = createNotification({ id: 'notif-passthrough', actions: [action] });

    const handlePromise = executor.handle(notification);
    executor.resolveApproval('notif-passthrough', 'accepted');
    await handlePromise;

    expect(handler).toHaveBeenCalledWith('DEBT_REPRIORITIZE', { free: 'form' });
  });
});
