// tests/nervous/detectors/notification-delivery-health.test.ts
//
// NotificationDeliveryHealthDetector — 3 test case
// ADR-003: vitest over Jest

import { describe, it, expect } from 'vitest';
import { NotificationDeliveryHealthDetector } from '../../../src/nervous/detectors/notification-delivery-health.js';
import type {
  DetectorContext,
  SprintStateSnapshot,
  ObserverEvent,
} from '../../../src/core/nervous-types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BASE_NOW = new Date('2026-04-22T10:00:00.000Z');
const PROJECT_ROOT = '/test-project';

function makeSprintState(overrides: Partial<SprintStateSnapshot> = {}): SprintStateSnapshot {
  return {
    sprintId: 'sprint-151',
    currentPhase: 'EXECUTE',
    activeWorkers: [],
    openDebtCount: 0,
    totalTasks: 10,
    completedTasks: 5,
    ...overrides,
  };
}

function makeCtx(event: ObserverEvent, overrides: Partial<DetectorContext> = {}): DetectorContext {
  return {
    event,
    sprintState: makeSprintState(),
    projectRoot: PROJECT_ROOT,
    now: BASE_NOW,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('NotificationDeliveryHealthDetector', () => {
  it('positive: 8/10 notifications failed (80%) → critical alert', () => {
    const detector = new NotificationDeliveryHealthDetector(0.50);

    const event: ObserverEvent = {
      id: 'ev-cron-001',
      source: 'cron',
      type: 'CRON_TICK',
      timestamp: BASE_NOW.toISOString(),
      payload: { notificationsSent: 10, notificationsFailed: 8 },
      sprintId: 'sprint-151',
    };

    const result = detector.detect(makeCtx(event));

    expect(result).not.toBeNull();
    expect(result!.severity).toBe('critical'); // 80% ≥ 80% critical threshold
    expect(result!.risk).toBe('high');
    expect(result!.shouldNotify).toBe(true);
    expect(result!.suggestedActions[0].id).toBe('NOTIFICATION_BRIDGE_REPAIR');
    expect(result!.suggestedActions[0].label).toContain('8/10');
    expect(result!.metadata).toMatchObject({
      type: 'notification-delivery-health',
      sent: 10,
      failed: 8,
    });
  });

  it('negative: 1/10 notifications failed (10%) → null (below threshold)', () => {
    const detector = new NotificationDeliveryHealthDetector(0.50);

    const event: ObserverEvent = {
      id: 'ev-cron-002',
      source: 'cron',
      type: 'CRON_TICK',
      timestamp: BASE_NOW.toISOString(),
      payload: { notificationsSent: 10, notificationsFailed: 1 },
      sprintId: 'sprint-151',
    };

    const result = detector.detect(makeCtx(event));
    expect(result).toBeNull();
  });

  it('edge: NOTIFICATION_DELIVERY event with cumulative stats → detects bridge degradation', () => {
    const detector = new NotificationDeliveryHealthDetector(0.50);

    const event: ObserverEvent = {
      id: 'ev-delivery-001',
      source: 'event-bus',
      type: 'NOTIFICATION_DELIVERY',
      timestamp: BASE_NOW.toISOString(),
      payload: {
        success: false,
        totalSent: 6,
        totalFailed: 4,
      },
      sprintId: 'sprint-151',
    };

    const result = detector.detect(makeCtx(event));

    expect(result).not.toBeNull();
    expect(result!.severity).toBe('warning'); // 66% — warning, not critical
    expect(result!.suggestedActions[0].label).toContain('4/6');
    expect(result!.suggestedActions[0].payload).toMatchObject({
      sent: 6,
      failed: 4,
    });
  });
});
