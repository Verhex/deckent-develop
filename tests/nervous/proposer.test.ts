// tests/nervous/proposer.test.ts
//
// Proposer unit tests — Sprint 147 Task 6
// 8 tests covering: shouldNotify gate, severity filter, throttle,
// critical bypass, multiple actions, timeout computation, payload propagation

import { describe, it, expect, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { Proposer, computeTimeoutMs } from '../../src/nervous/proposer.js';
import type {
  DetectorResult,
  DecisionOutput,
  NervousSystemConfig,
  ActionDefinition,
  Severity,
} from '../../src/core/nervous-types.js';
import type { ProposerContext } from '../../src/nervous/proposer.js';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<NervousSystemConfig> & Record<string, unknown> = {}): NervousSystemConfig {
  return {
    mode: 'balanced',
    enabled: true,
    throttleWindowMs: 300_000, // 5 min
    ...overrides,
  };
}

function makeAction(id: string, displayName = 'Test Action'): ActionDefinition {
  return {
    id,
    displayName,
    description: 'Test action description',
    category: 'medium-risk',
    defaultRisk: 'medium',
    requiredSafetyFloor: [],
    reversible: true,
  };
}

function makeDecision(actionId: string, policy: DecisionOutput['policy'] = 'autonomous'): DecisionOutput {
  return {
    action: makeAction(actionId, `Action ${actionId}`),
    policy,
    risk: 'medium',
    isSafetyFloor: false,
    reason: `Test reason for ${actionId}`,
  };
}

function makeDetectorResult(overrides: Partial<DetectorResult> = {}): DetectorResult {
  return {
    risk: 'medium',
    shouldNotify: true,
    severity: 'warning',
    groupKey: undefined,
    suggestedActions: [
      { id: 'WORKER_RESPAWN', label: 'Re-spawn worker', risk: 'medium', payload: { workerId: 'w-001' } },
    ],
    metadata: { type: 'stale-worker' },
    ...overrides,
  };
}

function makeContext(overrides: Partial<ProposerContext> = {}): ProposerContext {
  return {
    detectorId: 'stale-worker',
    sprintId: 'sprint-147',
    taskId: 'task-001',
    title: 'Stale Worker Detected',
    message: 'Worker w-001 has not sent heartbeat for 3 minutes',
    now: new Date('2026-04-20T10:00:00.000Z'),
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Proposer', () => {
  let proposer: Proposer;

  beforeEach(() => {
    proposer = new Proposer(makeConfig());
  });

  it('should return null when shouldNotify is false', () => {
    const result = makeDetectorResult({ shouldNotify: false });
    const decisions = [makeDecision('WORKER_RESPAWN')];
    const context = makeContext();

    const notification = proposer.propose(result, decisions, context);

    expect(notification).toBeNull();
  });

  it('should return null when severity is below severityMin filter', () => {
    // Config requires minimum 'warning', detector produces 'info'
    proposer = new Proposer(makeConfig({ severityMin: 'warning' } as Record<string, unknown>));
    const result = makeDetectorResult({ severity: 'info' });
    const decisions = [makeDecision('METRIC_EMIT')];
    const context = makeContext();

    const notification = proposer.propose(result, decisions, context);

    expect(notification).toBeNull();
  });

  it('should throttle same groupKey within 5 minutes, allow after', () => {
    const result = makeDetectorResult({ groupKey: 'stale-worker:w-001' });
    const decisions = [makeDecision('WORKER_RESPAWN')];

    // First call succeeds
    const t1 = new Date('2026-04-20T10:00:00.000Z');
    const first = proposer.propose(result, decisions, makeContext({ now: t1 }));
    expect(first).not.toBeNull();

    // Second call within 5 minutes → throttled
    const t2 = new Date('2026-04-20T10:03:00.000Z'); // +3 min
    const second = proposer.propose(result, decisions, makeContext({ now: t2 }));
    expect(second).toBeNull();

    // Third call after 5 minutes → passes
    const t3 = new Date('2026-04-20T10:06:00.000Z'); // +6 min from t1
    const third = proposer.propose(result, decisions, makeContext({ now: t3 }));
    expect(third).not.toBeNull();
  });

  it('should bypass severity filter and throttle for critical/emergency', () => {
    // Set high severity filter
    proposer = new Proposer(makeConfig({ severityMin: 'emergency' } as Record<string, unknown>));
    const result = makeDetectorResult({ severity: 'critical', groupKey: 'test-key' });
    const decisions = [makeDecision('WORKER_RESPAWN')];

    // First call at t0
    const t0 = new Date('2026-04-20T10:00:00.000Z');
    const first = proposer.propose(result, decisions, makeContext({ now: t0 }));
    expect(first).not.toBeNull();
    expect(first!.severity).toBe('critical');

    // Second call within throttle window — critical bypasses
    const t1 = new Date('2026-04-20T10:01:00.000Z');
    const second = proposer.propose(result, decisions, makeContext({ now: t1 }));
    expect(second).not.toBeNull();
  });

  it('should include multiple actions from multiple decisions', () => {
    const result = makeDetectorResult({
      suggestedActions: [
        { id: 'WORKER_RESPAWN', label: 'Re-spawn A', risk: 'medium', payload: { workerId: 'w-001' } },
        { id: 'SCOPE_COLLISION_REORDER', label: 'Reorder', risk: 'medium', payload: { file: 'x.ts' } },
      ],
    });
    const decisions = [
      makeDecision('WORKER_RESPAWN', 'suggest-5m'),
      makeDecision('SCOPE_COLLISION_REORDER', 'suggest-30m'),
    ];
    const context = makeContext();

    const notification = proposer.propose(result, decisions, context);

    expect(notification).not.toBeNull();
    expect(notification!.actions).toHaveLength(2);
    expect(notification!.actions[0].id).toBe('WORKER_RESPAWN');
    expect(notification!.actions[1].id).toBe('SCOPE_COLLISION_REORDER');
  });

  it('mints a short, deterministic approval code (phone-typeable, derived from id)', () => {
    const result = makeDetectorResult({ groupKey: 'stale-worker:w-9' });
    const decisions = [makeDecision('WORKER_RESPAWN')];
    const n = proposer.propose(result, decisions, makeContext());
    expect(n).not.toBeNull();
    // 5-char base36 — short enough to type on a phone, not a UUID.
    expect(n!.shortCode).toMatch(/^[0-9a-z]{5}$/);
    // Deterministic: the code is a pure function of the notification id (pins the
    // documented derivation so the resolver/CLI/Telegram all agree on the code).
    const h = createHash('sha256').update(n!.id).digest('hex');
    const expected = parseInt(h.slice(0, 12), 16).toString(36).slice(0, 5).padStart(5, '0');
    expect(n!.shortCode).toBe(expected);
  });

  it('should compute timeoutMs as smallest suggest-* timeout', () => {
    const result = makeDetectorResult();
    const decisions = [
      makeDecision('WORKER_RESPAWN', 'suggest-5m'),
      makeDecision('SCOPE_COLLISION_REORDER', 'suggest-30m'),
    ];
    const context = makeContext();

    const notification = proposer.propose(result, decisions, context);

    expect(notification).not.toBeNull();
    expect(notification!.timeoutMs).toBe(300_000); // 5 min is smaller
  });

  it('should return null timeoutMs when only approve policies exist', () => {
    const result = makeDetectorResult();
    const decisions = [
      makeDecision('WORKER_RESPAWN', 'approve'),
      makeDecision('SCOPE_COLLISION_REORDER', 'approve'),
    ];
    const context = makeContext();

    const notification = proposer.propose(result, decisions, context);

    expect(notification).not.toBeNull();
    expect(notification!.timeoutMs).toBeNull();
  });

  it('should propagate payload from detectorResult.suggestedActions to notification.actions', () => {
    const expectedPayload = { workerId: 'w-147-009', taskId: 'task-003', lastHeartbeat: '2026-04-20T09:55:00Z' };
    const result = makeDetectorResult({
      suggestedActions: [
        { id: 'WORKER_RESPAWN', label: 'Re-spawn w-009', risk: 'medium', payload: expectedPayload },
      ],
    });
    const decisions = [makeDecision('WORKER_RESPAWN', 'suggest-5m')];
    const context = makeContext();

    const notification = proposer.propose(result, decisions, context);

    expect(notification).not.toBeNull();
    expect(notification!.actions[0].payload).toEqual(expectedPayload);
  });
});

describe('computeTimeoutMs', () => {
  it('should return null for empty decisions', () => {
    expect(computeTimeoutMs([])).toBeNull();
  });

  it('should return null for autonomous-only decisions', () => {
    const decisions = [makeDecision('X', 'autonomous')];
    expect(computeTimeoutMs(decisions)).toBeNull();
  });

  it('should return 300000 for suggest-5m', () => {
    const decisions = [makeDecision('X', 'suggest-5m')];
    expect(computeTimeoutMs(decisions)).toBe(300_000);
  });

  it('should return 1800000 for suggest-30m', () => {
    const decisions = [makeDecision('X', 'suggest-30m')];
    expect(computeTimeoutMs(decisions)).toBe(1_800_000);
  });

  it('should return smallest when both suggest present', () => {
    const decisions = [makeDecision('A', 'suggest-30m'), makeDecision('B', 'suggest-5m')];
    expect(computeTimeoutMs(decisions)).toBe(300_000);
  });
});
