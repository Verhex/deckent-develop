// tests/nervous/detector-reach.test.ts
//
// born-569 / 382-005 — NERVOUS-DETECTOR-REACH regression test.
//
// Audit finding: build-failure-recurrence, dead-event-stream and
// notification-delivery-health suggested action IDs had no ACTION_REGISTRY
// entry, so DecisionEngine.decide() silently dropped every one of them and
// bootstrap.ts's runPipeline (`if (decisions.length === 0) return;`) never
// reached proposer/dispatcher — the detection never reached a real channel.
//
// This test triggers each real detector, feeds its genuine DetectorResult
// through the real DecisionEngine + Proposer, and asserts the pipeline now
// produces a non-empty DecisionOutput[] and a NervousNotification with >=1
// action — the artifact bootstrap.ts unconditionally hands to dispatcher
// (whose file channel is always-on), proving reach without needing to invoke
// NervousDispatcher's real channel I/O.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { BuildFailureRecurrenceDetector } from '../../src/nervous/detectors/build-failure-recurrence.js';
import { DeadEventStreamDetector } from '../../src/nervous/detectors/dead-event-stream.js';
import { NotificationDeliveryHealthDetector } from '../../src/nervous/detectors/notification-delivery-health.js';
import { DecisionEngine } from '../../src/nervous/decision-engine.js';
import { Proposer } from '../../src/nervous/proposer.js';
import type {
  DetectorContext,
  DetectorResult,
  NervousSystemConfigV1,
  SprintStateSnapshot,
  ObserverEvent,
} from '../../src/core/nervous-types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BASE_NOW = new Date('2026-07-08T10:00:00.000Z');

function makeConfig(overrides: Partial<NervousSystemConfigV1> = {}): NervousSystemConfigV1 {
  return { mode: 'balanced', enabled: true, ...overrides };
}

function makeSprintState(overrides: Partial<SprintStateSnapshot> = {}): SprintStateSnapshot {
  return {
    sprintId: 'sprint-382',
    currentPhase: 'EXECUTE',
    activeWorkers: [],
    openDebtCount: 0,
    totalTasks: 5,
    completedTasks: 2,
    ...overrides,
  };
}

/** Runs a genuine DetectorResult through the real decide()+propose() pipeline and
 * asserts it reaches the artifact bootstrap.ts hands unconditionally to the dispatcher. */
function assertReachesChannel(result: DetectorResult | null, detectorId: string): void {
  expect(result, `${detectorId} should have detected`).not.toBeNull();
  const detected = result!;

  const engine = new DecisionEngine(makeConfig());
  const decisions = engine.decide(detected);

  // Regression: previously [] for these 3 detectors -> bootstrap.ts runPipeline
  // bailed before proposer/dispatcher ever ran.
  expect(decisions.length).toBeGreaterThanOrEqual(1);
  expect(decisions.length).toBe(detected.suggestedActions.length);
  for (const d of decisions) {
    expect(d.policy).toBeTruthy();
  }

  const proposer = new Proposer(makeConfig());
  const notification = proposer.propose(detected, decisions, {
    detectorId,
    sprintId: 'sprint-382',
    title: detected.title,
    message: detected.message,
    now: BASE_NOW,
  });

  expect(notification, `${detectorId} notification should not be null`).not.toBeNull();
  expect(notification!.actions.length).toBeGreaterThanOrEqual(1);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Nervous detector reach (born-569 / 382-005)', () => {
  describe('build-failure-recurrence', () => {
    let tmpRoot: string;

    beforeEach(() => {
      tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-test-'));
    });

    afterEach(() => {
      rmSync(tmpRoot, { recursive: true, force: true });
    });

    it('BUILD_FAILURE_INVESTIGATE reaches a real notification channel', () => {
      const tasksDir = join(tmpRoot, '.tasks');
      mkdirSync(tasksDir, { recursive: true });
      writeFileSync(
        join(tasksDir, 'task-001.result'),
        JSON.stringify({
          taskId: '001',
          testsPassed: false,
          filesChanged: ['src/core/config.ts'],
        }),
        'utf-8',
      );

      // threshold=1 -> the current sprint's failure alone meets recurrence
      const detector = new BuildFailureRecurrenceDetector(1);
      const event: ObserverEvent = {
        id: 'ev-retro',
        source: 'sprint-lifecycle',
        type: 'SPRINT_PHASE_CHANGE',
        timestamp: BASE_NOW.toISOString(),
        payload: { oldPhase: 'EVALUATE', newPhase: 'RETRO' },
        sprintId: 'sprint-382',
      };
      const ctx: DetectorContext = {
        event,
        sprintState: makeSprintState({ currentPhase: 'RETRO' }),
        projectRoot: tmpRoot,
        now: BASE_NOW,
      };

      const result = detector.detect(ctx);
      expect(result!.suggestedActions[0]!.id).toBe('BUILD_FAILURE_INVESTIGATE');
      assertReachesChannel(result, 'build-failure-recurrence');
    });
  });

  describe('dead-event-stream', () => {
    let tmpRoot: string;

    beforeEach(() => {
      tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-test-'));
    });

    afterEach(() => {
      rmSync(tmpRoot, { recursive: true, force: true });
    });

    it('INVESTIGATE_STALL / FORCE_EVALUATE / KILL_WORKERS reach a real notification channel', () => {
      const streamDir = join(tmpRoot, '.deckent', 'recently-works');
      mkdirSync(streamDir, { recursive: true });
      const silenceMs = 27 * 60 * 1000;
      const lastEventMs = BASE_NOW.getTime() - silenceMs;
      writeFileSync(
        join(streamDir, 'sprint-382-events.jsonl'),
        JSON.stringify({ timestamp: new Date(lastEventMs).toISOString() }) + '\n',
        'utf-8',
      );

      const detector = new DeadEventStreamDetector(600_000);
      const event: ObserverEvent = {
        id: 'ev-cron',
        source: 'cron',
        type: 'TICK',
        timestamp: BASE_NOW.toISOString(),
        payload: {},
      };
      const ctx: DetectorContext = {
        event,
        sprintState: makeSprintState({
          activeWorkers: [{ id: 'w-382-001', taskId: 'task-382-001', lastHeartbeat: BASE_NOW.toISOString() }],
        }),
        projectRoot: tmpRoot,
        now: BASE_NOW,
      };

      const result = detector.detect(ctx);
      expect(result!.suggestedActions.map(a => a.id)).toEqual([
        'INVESTIGATE_STALL',
        'FORCE_EVALUATE',
        'KILL_WORKERS',
      ]);
      assertReachesChannel(result, 'dead-event-stream');
    });
  });

  describe('notification-delivery-health', () => {
    it('NOTIFICATION_BRIDGE_REPAIR reaches a real notification channel', () => {
      const detector = new NotificationDeliveryHealthDetector(0.50);
      const event: ObserverEvent = {
        id: 'ev-cron',
        source: 'cron',
        type: 'CRON_TICK',
        timestamp: BASE_NOW.toISOString(),
        payload: { notificationsSent: 10, notificationsFailed: 8 },
        sprintId: 'sprint-382',
      };
      const ctx: DetectorContext = {
        event,
        sprintState: makeSprintState(),
        projectRoot: '/test-project',
        now: BASE_NOW,
      };

      const result = detector.detect(ctx);
      expect(result!.suggestedActions[0]!.id).toBe('NOTIFICATION_BRIDGE_REPAIR');
      assertReachesChannel(result, 'notification-delivery-health');
    });
  });

  describe('regression guard — genuinely unknown action ids still skip silently', () => {
    it('an id with no registry entry and no fallback entry is dropped, not synthesized', () => {
      const engine = new DecisionEngine(makeConfig());
      const result: DetectorResult = {
        risk: 'low',
        shouldNotify: true,
        title: 'Test',
        message: 'Test',
        suggestedActions: [{ id: 'TOTALLY_MADE_UP_ACTION', label: 'Ghost', risk: 'low' }],
      };

      const decisions = engine.decide(result);
      expect(decisions).toHaveLength(0);
    });
  });
});
