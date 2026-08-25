// tests/nervous/detectors/notification-delivery-health.test.ts
//
// NotificationDeliveryHealthDetector — 3 test case
// ADR-003: vitest over Jest

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NotificationDeliveryHealthDetector } from '../../../src/nervous/detectors/notification-delivery-health.js';
import {
  enqueueOwnerNotification,
  deliverPendingOwnerNotifications,
} from '../../../src/connectors/notification-delivery.js';
import type { OwnerNotificationTransport } from '../../../src/connectors/notification-delivery.js';
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

  // ─── 671-007: durable owner-notification outbox age signal ─────────────────

  describe('durable outbox pending-age signal', () => {
    const tmpDirs: string[] = [];

    afterEach(() => {
      while (tmpDirs.length > 0) {
        const dir = tmpDirs.pop();
        if (dir) rmSync(dir, { recursive: true, force: true });
      }
    });

    function makeTmpProjectRoot(): string {
      const dir = mkdtempSync(join(tmpdir(), 'ndh-outbox-'));
      tmpDirs.push(dir);
      return dir;
    }

    const PENDING_AGE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes — injected, never a literal in the detector

    function makeCronEvent(): ObserverEvent {
      return {
        id: 'ev-cron-outbox',
        source: 'cron',
        type: 'CRON_TICK',
        timestamp: BASE_NOW.toISOString(),
        payload: {},
        sprintId: 'sprint-151',
      };
    }

    it('positive: aged pending durable-outbox record → warning alert', () => {
      const projectRoot = makeTmpProjectRoot();
      const agedCreatedAt = new Date(BASE_NOW.getTime() - 20 * 60 * 1000).toISOString(); // 20 min old
      enqueueOwnerNotification(projectRoot, {
        kind: 'sprint-started',
        sprintId: 'sprint-151',
        title: 'Sprint started',
        message: 'Sprint 151 started',
        lang: 'en',
        createdAt: agedCreatedAt,
      });

      const detector = new NotificationDeliveryHealthDetector(
        0.50,
        () => PENDING_AGE_THRESHOLD_MS,
      );
      const result = detector.detect(makeCtx(makeCronEvent(), { projectRoot, now: BASE_NOW }));

      expect(result).not.toBeNull();
      expect(result!.severity).toBe('warning');
      expect(result!.shouldNotify).toBe(true);
      expect(result!.metadata).toMatchObject({
        type: 'notification-delivery-health',
        signal: 'durable-outbox',
        pendingCount: 1,
      });
    });

    it('negative: same record acknowledged → no alert', async () => {
      const projectRoot = makeTmpProjectRoot();
      const agedCreatedAt = new Date(BASE_NOW.getTime() - 20 * 60 * 1000).toISOString(); // 20 min old
      enqueueOwnerNotification(projectRoot, {
        kind: 'sprint-started',
        sprintId: 'sprint-151',
        title: 'Sprint started',
        message: 'Sprint 151 started',
        lang: 'en',
        createdAt: agedCreatedAt,
      });

      // Acknowledge via the real async delivery path — never hand-write the
      // receipts file — so the record is reconciled exactly as production does.
      const transport: OwnerNotificationTransport = {
        sendMessage: async () => {},
      };
      await deliverPendingOwnerNotifications(projectRoot, transport);

      const detector = new NotificationDeliveryHealthDetector(
        0.50,
        () => PENDING_AGE_THRESHOLD_MS,
      );
      const result = detector.detect(makeCtx(makeCronEvent(), { projectRoot, now: BASE_NOW }));

      expect(result).toBeNull();
    });
  });
});
