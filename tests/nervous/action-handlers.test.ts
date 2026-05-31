// tests/nervous/action-handlers.test.ts
//
// Nervous Action Handlers — Step C — Sprint 180 Task W2-1
//
// 4 MVP unit tests (WORKER_RESPAWN, ORPHAN_TASK_ARCHIVE, STALE_LOCK_RELEASE,
// DEAD_EVENT_STREAM_CLEANUP) + 1 stub default test + 1 integration test
// (createActionHandler chains with Executor).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  dispatchAction,
  createActionHandler,
  type ActionHandlerDeps,
  type ActionHandlerResult,
} from '../../src/nervous/action-handlers.js';
import { Executor, type NervousHistory } from '../../src/nervous/executor.js';
import type {
  NervousNotification,
  NotificationAction,
  ExecutionRecord,
} from '../../src/core/nervous-types.js';

// ─── Test Helpers ───────────────────────────────────────────────────────────

function createMockDeps(): Required<Pick<
  ActionHandlerDeps,
  'killWorker' | 'spawnWorker' | 'archiveOrphanTasks' | 'releaseLock' | 'cleanDeadEventStream' | 'projectRoot'
>> {
  return {
    killWorker: vi.fn(),
    spawnWorker: vi.fn(),
    archiveOrphanTasks: vi.fn(() => 3),
    releaseLock: vi.fn(),
    cleanDeadEventStream: vi.fn(() => 1),
    projectRoot: '/tmp/test-project',
  };
}

function createMockHistory(): NervousHistory & { records: ExecutionRecord[] } {
  const records: ExecutionRecord[] = [];
  return {
    records,
    append: vi.fn(async (record: ExecutionRecord) => {
      records.push(record);
    }),
  };
}

function createNotification(
  overrides: Partial<NervousNotification> = {},
): NervousNotification {
  return {
    id: 'notif-test-001',
    type: 'test',
    title: 'Test Notification',
    message: 'Test message',
    severity: 'info',
    createdAt: '2026-05-20T10:00:00.000Z',
    detectorId: 'test-detector',
    actions: [],
    timeoutMs: null,
    ...overrides,
  };
}

function createAction(
  overrides: Partial<NotificationAction> = {},
): NotificationAction {
  return {
    id: 'ORPHAN_TASK_ARCHIVE',
    label: 'Archive orphans',
    policy: 'autonomous',
    risk: 'low',
    isSafetyFloor: false,
    payload: {},
    ...overrides,
  };
}

// ─── Unit Tests — 4 MVP handlers ────────────────────────────────────────────

describe('action-handlers — MVP handlers', () => {
  let deps: ReturnType<typeof createMockDeps>;

  beforeEach(() => {
    deps = createMockDeps();
  });

  // Test 1: WORKER_RESPAWN → spawn-backend kill + spawn invoked
  it('handles WORKER_RESPAWN by killing and re-spawning the worker', async () => {
    const result = await dispatchAction(
      'WORKER_RESPAWN',
      { taskId: '180-001' },
      deps,
    );

    expect(result.outcome).toBe('success');
    expect(deps.killWorker).toHaveBeenCalledWith('180-001');
    expect(deps.spawnWorker).toHaveBeenCalledWith('180-001');
  });

  // Test 2: ORPHAN_TASK_ARCHIVE → archive helper invoked with sprintId
  it('handles ORPHAN_TASK_ARCHIVE by invoking archiveOrphanTasks', async () => {
    const result = await dispatchAction(
      'ORPHAN_TASK_ARCHIVE',
      { sprintId: 'sprint-180' },
      deps,
    );

    expect(result.outcome).toBe('success');
    expect(deps.archiveOrphanTasks).toHaveBeenCalledWith(
      '/tmp/test-project',
      'sprint-180',
    );
  });

  // Test 3: STALE_LOCK_RELEASE → file-lock release invoked
  it('handles STALE_LOCK_RELEASE by invoking releaseLock', async () => {
    const result = await dispatchAction(
      'STALE_LOCK_RELEASE',
      { filePath: 'src/example.ts', workerId: 'w-180-001' },
      deps,
    );

    expect(result.outcome).toBe('success');
    expect(deps.releaseLock).toHaveBeenCalledWith(
      '/tmp/test-project',
      'src/example.ts',
      'w-180-001',
    );
  });

  // Test 4: DEAD_EVENT_STREAM_CLEANUP → cleanDeadEventStream invoked
  it('handles DEAD_EVENT_STREAM_CLEANUP by invoking cleanDeadEventStream', async () => {
    const result = await dispatchAction(
      'DEAD_EVENT_STREAM_CLEANUP',
      { sprintId: 'sprint-180' },
      deps,
    );

    expect(result.outcome).toBe('success');
    expect(deps.cleanDeadEventStream).toHaveBeenCalledWith(
      '/tmp/test-project',
      'sprint-180',
    );
  });

  // Test 5: Stub default — any other action ID returns `unimplemented`
  it('returns `unimplemented` for non-MVP action IDs', async () => {
    const otherIds = [
      'LOG_ROTATION',
      'DIRECTIVES_WRITE',
      'PROMPT_BUILDER_TWEAK',
      'SPRINT_START',
      'COMMIT_PUSH',
      'KILL_LIVE_SPRINT',
    ];

    for (const actionId of otherIds) {
      const result = await dispatchAction(actionId, {}, deps);
      expect(result.outcome).toBe('unimplemented');
      expect(result.actionId).toBe(actionId);
    }
  });

  // Test 6: Unknown action ID still returns unimplemented (no throw)
  it('returns `unimplemented` for unknown action IDs', async () => {
    const result = await dispatchAction('UNKNOWN_ACTION_XYZ', {}, deps);
    expect(result.outcome).toBe('unimplemented');
    expect(result.actionId).toBe('UNKNOWN_ACTION_XYZ');
  });

  // Test 7: Handler failure surfaces as outcome='failure' with error
  it('returns failure outcome when underlying helper throws', async () => {
    deps.archiveOrphanTasks = vi.fn(() => {
      throw new Error('Disk full');
    });

    const result = await dispatchAction(
      'ORPHAN_TASK_ARCHIVE',
      { sprintId: 'sprint-180' },
      deps,
    );

    expect(result.outcome).toBe('failure');
    expect(result.error).toContain('Disk full');
  });

  // Test 8: Missing required payload field → failure (e.g. ORPHAN_TASK_ARCHIVE without sprintId)
  it('returns failure when required payload is missing', async () => {
    const result = await dispatchAction('ORPHAN_TASK_ARCHIVE', {}, deps);
    expect(result.outcome).toBe('failure');
    expect(result.error).toMatch(/sprintId/i);
  });
});

// ─── Integration Test — createActionHandler + Executor chain ────────────────

describe('action-handlers — Executor integration', () => {
  it('createActionHandler bridges to Executor (autonomous policy chain)', async () => {
    const deps = createMockDeps();
    const handler = createActionHandler(deps);

    const history = createMockHistory();
    const executor = new Executor(history, handler);

    const action = createAction({
      id: 'ORPHAN_TASK_ARCHIVE',
      policy: 'autonomous',
      payload: { sprintId: 'sprint-180' },
    });
    const notification = createNotification({ actions: [action] });

    const records = await executor.handle(notification);

    // Executor recorded the autonomous execution
    expect(records).toHaveLength(1);
    expect(records[0].decision).toBe('autonomous');
    expect(records[0].decidedBy).toBe('system');
    expect(records[0].outcome).toBe('success');

    // Underlying helper was actually called
    expect(deps.archiveOrphanTasks).toHaveBeenCalledWith(
      '/tmp/test-project',
      'sprint-180',
    );

    // History was appended
    expect(history.records).toHaveLength(1);
  });

  it('createActionHandler maps `unimplemented` → executor failure', async () => {
    const deps = createMockDeps();
    const handler = createActionHandler(deps);

    // Call directly via executor-shaped signature
    const result = await handler('LOG_ROTATION', {});

    // Bridged to ActionHandler interface (success | failure)
    expect(result.outcome).toBe('failure');
    expect(result.error).toMatch(/unimplemented/i);
    expect(result.error).toContain('LOG_ROTATION');
  });
});

// ─── Type safety check ──────────────────────────────────────────────────────

describe('action-handlers — type contracts', () => {
  it('ActionHandlerResult outcome field has correct union shape', () => {
    const ok: ActionHandlerResult = { outcome: 'success' };
    const fail: ActionHandlerResult = { outcome: 'failure', error: 'x' };
    const stub: ActionHandlerResult = { outcome: 'unimplemented', actionId: 'X' };
    expect([ok.outcome, fail.outcome, stub.outcome]).toEqual([
      'success',
      'failure',
      'unimplemented',
    ]);
  });
});
