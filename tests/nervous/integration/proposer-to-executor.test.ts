// tests/nervous/integration/proposer-to-executor.test.ts
//
// Integration: Proposer → Notification → Executor → ExecutionRecord
// Sprint 147 Task 19

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DetectorResult, DecisionOutput, NervousSystemConfig, NervousNotification, ExecutionRecord } from '../../../src/core/nervous-types.js';
import { Proposer } from '../../../src/nervous/proposer.js';
import { DecisionEngine } from '../../../src/nervous/decision-engine.js';
import { Executor, type ActionHandler, type NervousHistory } from '../../../src/nervous/executor.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<NervousSystemConfig> = {}): NervousSystemConfig {
  return {
    mode: 'balanced',
    enabled: true,
    ...overrides,
  };
}

function makeMockHistory(): NervousHistory {
  return {
    append: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMockHandler(outcome: 'success' | 'failure' = 'success'): ActionHandler {
  return vi.fn().mockResolvedValue({ outcome, error: outcome === 'failure' ? 'handler error' : undefined });
}

describe('Proposer → Executor Integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-20T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should produce notification from detector result and execute autonomous action', async () => {
    const config = makeConfig({ mode: 'balanced' });
    const engine = new DecisionEngine(config);
    const proposer = new Proposer(config);
    const history = makeMockHistory();
    const handler = makeMockHandler('success');
    const executor = new Executor(history, handler);

    // Simulate detector result with low-risk action (autonomous in balanced)
    const detectorResult: DetectorResult = {
      risk: 'low',
      shouldNotify: true,
      severity: 'info',
      groupKey: 'orphan-tasks',
      suggestedActions: [{
        id: 'ORPHAN_TASK_ARCHIVE',
        label: 'Archive orphan tasks',
        risk: 'low',
        payload: { count: 3 },
      }],
      metadata: { type: 'orphan-cleanup' },
    };

    // Step 1: Decision Engine
    const decisions = engine.decide(detectorResult);
    expect(decisions[0].policy).toBe('autonomous');

    // Step 2: Proposer
    const notification = proposer.propose(detectorResult, decisions, {
      detectorId: 'orphan-detector',
      title: 'Orphan tasks found',
      message: '3 orphan tasks will be archived',
      now: new Date('2026-04-20T12:00:00Z'),
    });
    expect(notification).not.toBeNull();
    expect(notification!.actions[0].policy).toBe('autonomous');

    // Step 3: Executor
    const records = await executor.handle(notification!);
    expect(records).toHaveLength(1);
    expect(records[0].decision).toBe('autonomous');
    expect(records[0].decidedBy).toBe('system');
    expect(records[0].outcome).toBe('success');
    expect(handler).toHaveBeenCalledWith('ORPHAN_TASK_ARCHIVE', { count: 3 });
    expect(history.append).toHaveBeenCalledTimes(1);
  });

  it('should handle suggest-30m timeout auto-apply when no user decision', async () => {
    const config = makeConfig({ mode: 'balanced' });
    const engine = new DecisionEngine(config);
    const proposer = new Proposer(config);
    const history = makeMockHistory();
    const handler = makeMockHandler('success');
    const executor = new Executor(history, handler);

    const detectorResult: DetectorResult = {
      risk: 'medium',
      shouldNotify: true,
      severity: 'warning',
      suggestedActions: [{
        id: 'WORKER_RESPAWN',
        label: 'Respawn w-001',
        risk: 'medium',
        payload: { workerId: 'w-001' },
      }],
      metadata: { type: 'stale-worker' },
    };

    const decisions = engine.decide(detectorResult);
    expect(decisions[0].policy).toBe('suggest-30m');

    const notification = proposer.propose(detectorResult, decisions, {
      detectorId: 'stale-worker',
      title: 'Worker stale',
      message: 'Worker w-001 not responding',
      now: new Date('2026-04-20T12:00:00Z'),
    });
    expect(notification!.timeoutMs).toBe(1800000); // 30 min

    // Start execution (will await timeout)
    const recordsPromise = executor.handle(notification!);

    // Fast forward 30 minutes
    await vi.advanceTimersByTimeAsync(1800000);

    const records = await recordsPromise;
    expect(records[0].decision).toBe('timeout-auto-applied');
    expect(records[0].decidedBy).toBe('timeout');
    expect(records[0].outcome).toBe('success');
  });

  it('should handle user acceptance before timeout expires', async () => {
    const config = makeConfig({ mode: 'balanced' });
    const engine = new DecisionEngine(config);
    const proposer = new Proposer(config);
    const history = makeMockHistory();
    const handler = makeMockHandler('success');
    const executor = new Executor(history, handler);

    const detectorResult: DetectorResult = {
      risk: 'medium',
      shouldNotify: true,
      severity: 'warning',
      suggestedActions: [{
        id: 'WORKER_RESPAWN',
        label: 'Respawn w-001',
        risk: 'medium',
        payload: { workerId: 'w-001' },
      }],
      metadata: { type: 'stale-worker' },
    };

    const decisions = engine.decide(detectorResult);
    const notification = proposer.propose(detectorResult, decisions, {
      detectorId: 'stale-worker',
      title: 'Worker stale',
      message: 'Worker w-001 not responding',
      now: new Date('2026-04-20T12:00:00Z'),
    });

    const recordsPromise = executor.handle(notification!);

    // User accepts after 5 seconds
    await vi.advanceTimersByTimeAsync(5000);
    executor.resolveApproval(notification!.id, 'accepted');

    const records = await recordsPromise;
    expect(records[0].decision).toBe('accepted');
    expect(records[0].decidedBy).toBe('user');
    expect(records[0].outcome).toBe('success');
  });

  it('should handle user rejection of suggest-timeout action', async () => {
    const config = makeConfig({ mode: 'balanced' });
    const engine = new DecisionEngine(config);
    const proposer = new Proposer(config);
    const history = makeMockHistory();
    const handler = makeMockHandler('success');
    const executor = new Executor(history, handler);

    const detectorResult: DetectorResult = {
      risk: 'medium',
      shouldNotify: true,
      severity: 'warning',
      suggestedActions: [{
        id: 'DEBT_REPRIORITIZE',
        label: 'Reprioritize debt',
        risk: 'medium',
        payload: {},
      }],
      metadata: { type: 'debt-trend' },
    };

    const decisions = engine.decide(detectorResult);
    const notification = proposer.propose(detectorResult, decisions, {
      detectorId: 'debt-trend',
      title: 'Debt trend rising',
      message: 'Debt rate > 15%',
      now: new Date('2026-04-20T12:00:00Z'),
    });

    const recordsPromise = executor.handle(notification!);
    await vi.advanceTimersByTimeAsync(1000);
    executor.resolveApproval(notification!.id, 'rejected');

    const records = await recordsPromise;
    expect(records[0].decision).toBe('rejected');
    expect(records[0].decidedBy).toBe('user');
    expect(records[0].outcome).toBe('pending');
    expect(handler).not.toHaveBeenCalled();
  });

  it('should handle handler failure gracefully', async () => {
    const config = makeConfig({ mode: 'balanced' });
    const engine = new DecisionEngine(config);
    const proposer = new Proposer(config);
    const history = makeMockHistory();
    const handler: ActionHandler = vi.fn().mockRejectedValue(new Error('spawn failed'));
    const executor = new Executor(history, handler);

    const detectorResult: DetectorResult = {
      risk: 'low',
      shouldNotify: true,
      severity: 'info',
      suggestedActions: [{
        id: 'CACHE_INVALIDATE',
        label: 'Invalidate cache',
        risk: 'low',
        payload: {},
      }],
      metadata: { type: 'cache' },
    };

    const decisions = engine.decide(detectorResult);
    const notification = proposer.propose(detectorResult, decisions, {
      detectorId: 'cache-monitor',
      title: 'Cache stale',
      message: 'Invalidate cache',
      now: new Date('2026-04-20T12:00:00Z'),
    });

    const records = await executor.handle(notification!);
    expect(records[0].outcome).toBe('failure');
    expect(records[0].error).toBe('spawn failed');
  });

  it('should throttle duplicate notifications via proposer', () => {
    const config = makeConfig({ mode: 'balanced', throttleWindowMs: 300000 });
    const proposer = new Proposer(config);
    const engine = new DecisionEngine(config);

    const detectorResult: DetectorResult = {
      risk: 'medium',
      shouldNotify: true,
      severity: 'warning',
      groupKey: 'stale-worker:w-001',
      suggestedActions: [{
        id: 'WORKER_RESPAWN',
        label: 'Respawn',
        risk: 'medium',
        payload: {},
      }],
      metadata: { type: 'stale-worker' },
    };

    const decisions = engine.decide(detectorResult);
    const baseTime = new Date('2026-04-20T12:00:00Z');

    // First notification succeeds
    const n1 = proposer.propose(detectorResult, decisions, {
      detectorId: 'stale-worker',
      title: 'Worker stale',
      message: 'w-001 stale',
      now: baseTime,
    });
    expect(n1).not.toBeNull();

    // Second within throttle window → null
    const n2 = proposer.propose(detectorResult, decisions, {
      detectorId: 'stale-worker',
      title: 'Worker stale',
      message: 'w-001 stale',
      now: new Date(baseTime.getTime() + 60000), // 1 min later
    });
    expect(n2).toBeNull();

    // Third after throttle window → success
    const n3 = proposer.propose(detectorResult, decisions, {
      detectorId: 'stale-worker',
      title: 'Worker stale',
      message: 'w-001 stale',
      now: new Date(baseTime.getTime() + 400000), // 6.67 min later
    });
    expect(n3).not.toBeNull();
  });

  it('should not produce notification when shouldNotify is false', () => {
    const config = makeConfig({ mode: 'balanced' });
    const proposer = new Proposer(config);

    const detectorResult: DetectorResult = {
      risk: 'low',
      shouldNotify: false,
      suggestedActions: [],
      metadata: {},
    };

    const n = proposer.propose(detectorResult, [], {
      detectorId: 'test',
      title: 'Test',
      message: 'Test',
    });
    expect(n).toBeNull();
  });

  it('should propagate payload through full pipeline', async () => {
    const config = makeConfig({ mode: 'balanced' });
    const engine = new DecisionEngine(config);
    const proposer = new Proposer(config);
    const history = makeMockHistory();
    const handler = makeMockHandler('success');
    const executor = new Executor(history, handler);

    const customPayload = { workerId: 'w-147-009', taskId: 'T-009', staleMs: 240000 };
    const detectorResult: DetectorResult = {
      risk: 'low',
      shouldNotify: true,
      severity: 'info',
      suggestedActions: [{
        id: 'STALE_LOCK_RELEASE',
        label: 'Release stale lock',
        risk: 'low',
        payload: customPayload,
      }],
      metadata: { type: 'lock-monitor' },
    };

    const decisions = engine.decide(detectorResult);
    const notification = proposer.propose(detectorResult, decisions, {
      detectorId: 'lock-monitor',
      title: 'Stale lock',
      message: 'Lock held too long',
      now: new Date('2026-04-20T12:00:00Z'),
    });

    await executor.handle(notification!);
    expect(handler).toHaveBeenCalledWith('STALE_LOCK_RELEASE', customPayload);
  });

  it('should handle executor shutdown by rejecting pending approvals', async () => {
    const config = makeConfig({ mode: 'strict' }); // strict: medium → approve
    const engine = new DecisionEngine(config);
    const proposer = new Proposer(config);
    const history = makeMockHistory();
    const handler = makeMockHandler('success');
    const executor = new Executor(history, handler);

    const detectorResult: DetectorResult = {
      risk: 'medium',
      shouldNotify: true,
      severity: 'warning',
      suggestedActions: [{
        id: 'WORKER_RESPAWN',
        label: 'Respawn',
        risk: 'medium',
        payload: {},
      }],
      metadata: { type: 'stale-worker' },
    };

    const decisions = engine.decide(detectorResult);
    expect(decisions[0].policy).toBe('approve'); // strict mode

    const notification = proposer.propose(detectorResult, decisions, {
      detectorId: 'stale-worker',
      title: 'Worker stale',
      message: 'Stale',
      now: new Date('2026-04-20T12:00:00Z'),
    });

    const recordsPromise = executor.handle(notification!);

    // Shutdown before user decides
    executor.shutdown();

    const records = await recordsPromise;
    expect(records[0].decision).toBe('rejected');
    expect(records[0].outcome).toBe('pending');
    expect(handler).not.toHaveBeenCalled();
  });

  it('should include timeout in notification for suggest-5m policy', () => {
    const config = makeConfig({ mode: 'autopilot' }); // autopilot: high → suggest-5m
    const engine = new DecisionEngine(config);
    const proposer = new Proposer(config);

    const detectorResult: DetectorResult = {
      risk: 'high',
      shouldNotify: true,
      severity: 'critical',
      suggestedActions: [{
        id: 'SPRINT_START',
        label: 'Start sprint',
        risk: 'high',
        payload: {},
      }],
      metadata: { type: 'sprint-suggestion' },
    };

    const decisions = engine.decide(detectorResult);
    expect(decisions[0].policy).toBe('suggest-5m');

    const notification = proposer.propose(detectorResult, decisions, {
      detectorId: 'sprint-lifecycle',
      title: 'Sprint ready',
      message: 'Sprint can be started',
      now: new Date('2026-04-20T12:00:00Z'),
    });

    expect(notification!.timeoutMs).toBe(300000); // 5 min
  });
});
