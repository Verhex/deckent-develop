// tests/nervous/action-handlers.test.ts
//
// Nervous Action Handlers — Step C — Sprint 180 Task W2-1, Sprint 220 expansion.
//
// 4 original MVP handlers + 5 new low-risk handlers + integration + type + idempotency.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  dispatchAction,
  createActionHandler,
  type ActionHandlerDeps,
  type ActionHandlerResult,
} from '../../src/nervous/action-handlers.js';
import { readRecommendations } from '../../src/nervous/recommendation-log.js';
import { Executor, type NervousHistory } from '../../src/nervous/executor.js';
import type {
  NervousNotification,
  NotificationAction,
  ExecutionRecord,
} from '../../src/core/nervous-types.js';

// ─── Test Helpers ───────────────────────────────────────────────────────────

function createMockDeps(): Required<Pick<
  ActionHandlerDeps,
  | 'killWorker' | 'spawnWorker' | 'archiveOrphanTasks' | 'releaseLock' | 'cleanDeadEventStream'
  | 'rotateLogs' | 'invalidateCache' | 'cleanIpcDir' | 'generateDebtReport' | 'emitMetric'
  | 'recommend' | 'projectRoot'
>> {
  return {
    killWorker: vi.fn(),
    spawnWorker: vi.fn(),
    archiveOrphanTasks: vi.fn(() => 3),
    releaseLock: vi.fn(),
    cleanDeadEventStream: vi.fn(() => 1),
    rotateLogs: vi.fn(),
    invalidateCache: vi.fn(),
    cleanIpcDir: vi.fn(() => 2),
    generateDebtReport: vi.fn(),
    emitMetric: vi.fn(),
    recommend: vi.fn(),
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

// ─── Unit Tests — 4 original MVP handlers ───────────────────────────────────

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

  // Test 5: Stub default — still-unimplemented (destructive/orchestration) IDs
  it('returns `unimplemented` for still-unimplemented action IDs', async () => {
    const otherIds = [
      'PROMPT_BUILDER_TWEAK',
      'SPRINT_START',
      'SPRINT_STOP',
      'SRC_MODIFICATION',
      'COMMIT_PUSH',
      'AGENT_DISABLE',
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

// ─── Unit Tests — 5 new low-risk handlers ───────────────────────────────────

describe('action-handlers — new low-risk handlers', () => {
  let deps: ReturnType<typeof createMockDeps>;

  beforeEach(() => {
    deps = createMockDeps();
  });

  // Test 9: LOG_ROTATION → rotateLogs invoked
  it('handles LOG_ROTATION by invoking rotateLogs', async () => {
    const result = await dispatchAction('LOG_ROTATION', {}, deps);

    expect(result.outcome).toBe('success');
    expect(deps.rotateLogs).toHaveBeenCalledWith('/tmp/test-project');
  });

  // Test 10: CACHE_INVALIDATE → invalidateCache invoked (default cacheType='all')
  it('handles CACHE_INVALIDATE with default cacheType=all', async () => {
    const result = await dispatchAction('CACHE_INVALIDATE', {}, deps);

    expect(result.outcome).toBe('success');
    expect(deps.invalidateCache).toHaveBeenCalledWith('/tmp/test-project', 'all');
  });

  // Test 11: CACHE_INVALIDATE → custom cacheType forwarded
  it('handles CACHE_INVALIDATE with custom cacheType', async () => {
    const result = await dispatchAction('CACHE_INVALIDATE', { cacheType: 'routing' }, deps);

    expect(result.outcome).toBe('success');
    expect(deps.invalidateCache).toHaveBeenCalledWith('/tmp/test-project', 'routing');
  });

  // Test 12: IPC_DIR_CLEANUP → cleanIpcDir invoked
  it('handles IPC_DIR_CLEANUP by invoking cleanIpcDir', async () => {
    const result = await dispatchAction('IPC_DIR_CLEANUP', {}, deps);

    expect(result.outcome).toBe('success');
    expect(deps.cleanIpcDir).toHaveBeenCalledWith('/tmp/test-project');
  });

  // Test 13: DEBT_TRENDING_REPORT → generateDebtReport invoked
  it('handles DEBT_TRENDING_REPORT by invoking generateDebtReport', async () => {
    const result = await dispatchAction('DEBT_TRENDING_REPORT', {}, deps);

    expect(result.outcome).toBe('success');
    expect(deps.generateDebtReport).toHaveBeenCalledWith('/tmp/test-project');
  });

  // Test 14: METRIC_EMIT → emitMetric invoked with name + value
  it('handles METRIC_EMIT by invoking emitMetric', async () => {
    const result = await dispatchAction(
      'METRIC_EMIT',
      { metricName: 'sprint.duration', value: 42 },
      deps,
    );

    expect(result.outcome).toBe('success');
    expect(deps.emitMetric).toHaveBeenCalledWith('/tmp/test-project', 'sprint.duration', 42);
  });

  // Test 15: METRIC_EMIT → default value=1 when not provided
  it('handles METRIC_EMIT with default value=1 when value omitted', async () => {
    const result = await dispatchAction(
      'METRIC_EMIT',
      { metricName: 'heartbeat.ping' },
      deps,
    );

    expect(result.outcome).toBe('success');
    expect(deps.emitMetric).toHaveBeenCalledWith('/tmp/test-project', 'heartbeat.ping', 1);
  });

  // Test 16: METRIC_EMIT missing metricName → failure
  it('returns failure for METRIC_EMIT with missing metricName', async () => {
    const result = await dispatchAction('METRIC_EMIT', {}, deps);

    expect(result.outcome).toBe('failure');
    expect(result.error).toMatch(/metricName/i);
  });

  // Test 17: Idempotency — calling LOG_ROTATION twice produces same result
  it('LOG_ROTATION is idempotent (calling twice yields success both times)', async () => {
    const r1 = await dispatchAction('LOG_ROTATION', {}, deps);
    const r2 = await dispatchAction('LOG_ROTATION', {}, deps);

    expect(r1.outcome).toBe('success');
    expect(r2.outcome).toBe('success');
    expect(deps.rotateLogs).toHaveBeenCalledTimes(2);
  });
});

// ─── Unit Tests — resource-recommendation handlers (ADR-037) ────────────────

describe('action-handlers — recommendation handlers (nervous proposes)', () => {
  let deps: ReturnType<typeof createMockDeps>;

  beforeEach(() => {
    deps = createMockDeps();
  });

  const recommendationIds = [
    'DIRECTIVES_WRITE',
    'DEBT_REPRIORITIZE',
    'AGENT_PERFORMANCE_FLAG',
    'SKILL_ROUTING_ADJUST',
    'SCOPE_COLLISION_REORDER',
    'COST_OVER_THRESHOLD',
  ];

  it.each(recommendationIds)(
    '%s lands a Brain proposal via recommend() (no repo mutation)',
    async (actionId) => {
      const payload = { context: 'x', n: 1 };
      const result = await dispatchAction(actionId, payload, deps);

      expect(result.outcome).toBe('success');
      expect(deps.recommend).toHaveBeenCalledWith('/tmp/test-project', actionId, payload);
    },
  );

  it('recommendation handlers never touch destructive deps', async () => {
    await dispatchAction('DIRECTIVES_WRITE', { content: 'x' }, deps);
    expect(deps.killWorker).not.toHaveBeenCalled();
    expect(deps.spawnWorker).not.toHaveBeenCalled();
  });

  it('surfaces failure when recommend() throws', async () => {
    deps.recommend = vi.fn(() => {
      throw new Error('feed unwritable');
    });
    const result = await dispatchAction('DEBT_REPRIORITIZE', {}, deps);
    expect(result.outcome).toBe('failure');
    expect(result.error).toContain('feed unwritable');
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

    // Call directly via executor-shaped signature (a still-unimplemented action)
    const result = await handler('PROMPT_BUILDER_TWEAK', {});

    // Bridged to ActionHandler interface (success | failure)
    expect(result.outcome).toBe('failure');
    expect(result.error).toMatch(/unimplemented/i);
    expect(result.error).toContain('PROMPT_BUILDER_TWEAK');
  });

  it('createActionHandler executes new low-risk LOG_ROTATION via Executor', async () => {
    const deps = createMockDeps();
    const handler = createActionHandler(deps);

    const history = createMockHistory();
    const executor = new Executor(history, handler);

    const action = createAction({ id: 'LOG_ROTATION', policy: 'autonomous', payload: {} });
    const notification = createNotification({ actions: [action] });

    const records = await executor.handle(notification);

    expect(records[0].outcome).toBe('success');
    expect(deps.rotateLogs).toHaveBeenCalledWith('/tmp/test-project');
  });
});

// ─── Proof-of-function — real default deps write to disk ────────────────────

describe('action-handlers — real default deps (no mock)', () => {
  let root: string;

  afterEach(() => {
    if (root && existsSync(root)) rmSync(root, { recursive: true, force: true });
    root = undefined as unknown as string;
  });

  it('METRIC_EMIT default dep appends a real .deckent/metrics.jsonl line', async () => {
    root = mkdtempSync(join(tmpdir(), 'deckent-ah-'));
    const result = await dispatchAction(
      'METRIC_EMIT',
      { metricName: 'nervous.test', value: 7 },
      { projectRoot: root },
    );
    expect(result.outcome).toBe('success');
    const path = join(root, '.deckent', 'metrics.jsonl');
    expect(existsSync(path)).toBe(true);
    const rec = JSON.parse(readFileSync(path, 'utf-8').trim());
    expect(rec.metricName).toBe('nervous.test');
    expect(rec.value).toBe(7);
    expect(typeof rec.ts).toBe('string');
  });

  it('a recommendation action default dep appends a real proposal', async () => {
    root = mkdtempSync(join(tmpdir(), 'deckent-ah-'));
    const result = await dispatchAction(
      'AGENT_PERFORMANCE_FLAG',
      { agent: 'doc-writer', successRate: 0.4 },
      { projectRoot: root },
    );
    expect(result.outcome).toBe('success');
    const recs = readRecommendations(root);
    expect(recs).toHaveLength(1);
    expect(recs[0].actionId).toBe('AGENT_PERFORMANCE_FLAG');
    expect(recs[0].payload).toEqual({ agent: 'doc-writer', successRate: 0.4 });
    expect(recs[0].status).toBe('open');
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
