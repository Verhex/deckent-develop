// tests/nervous/detectors/stale-worker.test.ts
//
// StaleWorkerDetector unit tests — 6 test case
// ADR-003: vitest over Jest

import { describe, it, expect, beforeEach } from 'vitest';
import { StaleWorkerDetector } from '../../../src/nervous/detectors/stale-worker.js';
import type { DetectorContext, SprintStateSnapshot, ObserverEvent } from '../../../src/core/nervous-types.js';
import type { HostPrimaryLiveness } from '../../../src/core/monitoring-types.js';
import type { DetectorContext as DetectorContext__tsm_018 } from "../../../src/core/nervous-types.js";
import { StaleWorkerDetector as StaleWorkerDetector__tsm_018 } from "../../../src/nervous/detectors/stale-worker.js";
import type { HostPrimaryLiveness as HostPrimaryLiveness__tsm_018 } from "../../../src/orchestra/sprint-state-tracker.js";

// ─── Test Helpers ─────────────────────────────────────────────────────────────

const BASE_NOW = new Date('2026-04-20T10:00:00.000Z');

function makeEvent(source: ObserverEvent['source'] = 'cron'): ObserverEvent {
  return {
    id: 'test-event-id',
    source,
    type: 'TICK',
    timestamp: BASE_NOW.toISOString(),
    payload: {},
  };
}

function makeSprintState(
  overrides: Partial<SprintStateSnapshot> = {},
): SprintStateSnapshot {
  return {
    sprintId: 'sprint-147',
    currentPhase: 'EXECUTE',
    activeWorkers: [],
    openDebtCount: 0,
    totalTasks: 10,
    completedTasks: 5,
    ...overrides,
  };
}

function makeCtx(
  overrides: Partial<DetectorContext> = {},
): DetectorContext {
  return {
    event: makeEvent(),
    sprintState: makeSprintState(),
    projectRoot: '/workspace',
    now: BASE_NOW,
    ...overrides,
  };
}

function makeWorker(
  id: string,
  taskId: string,
  state: 'alive' | 'dead',
): SprintStateSnapshot['activeWorkers'][number] {
  const liveness: HostPrimaryLiveness = {
    state,
    attemptId: `attempt-${taskId}`,
    hostSequence: 1,
    reason: `host reports ${state}`,
  };
  return { id, taskId, lastHeartbeat: BASE_NOW.toISOString(), liveness } as
    SprintStateSnapshot['activeWorkers'][number];
}

function makeFreshWorker(id: string, taskId: string): SprintStateSnapshot['activeWorkers'][number] {
  return makeWorker(id, taskId, 'alive');
}

function makeStaleWorker(id: string, taskId: string): SprintStateSnapshot['activeWorkers'][number] {
  return makeWorker(id, taskId, 'dead');
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('StaleWorkerDetector', () => {
  let detector: StaleWorkerDetector;

  beforeEach(() => {
    detector = new StaleWorkerDetector(); // default 600s/10dk threshold
  });

  it('Test 1: aktif worker yoksa null döndürür', () => {
    // Arrange
    const ctx = makeCtx({
      sprintState: makeSprintState({ activeWorkers: [] }),
    });

    // Act
    const result = detector.detect(ctx);

    // Assert
    expect(result).toBeNull();
  });

  it('Test 2: tüm worker\'lar taze heartbeat gönderiyorsa null döndürür', () => {
    // Arrange
    const ctx = makeCtx({
      sprintState: makeSprintState({
        activeWorkers: [
          makeFreshWorker('w-147-001', 'task-147-001'),
          makeFreshWorker('w-147-002', 'task-147-002'),
        ],
      }),
    });

    // Act
    const result = detector.detect(ctx);

    // Assert
    expect(result).toBeNull();
  });

  it('Test 3: 1 stale worker → 1 action içeren DetectorResult döndürür', () => {
    // Arrange
    const ctx = makeCtx({
      sprintState: makeSprintState({
        activeWorkers: [
          makeStaleWorker('w-147-009', 'task-147-009'),
        ],
      }),
    });

    // Act
    const result = detector.detect(ctx);

    // Assert
    expect(result).not.toBeNull();
    expect(result!.risk).toBe('medium');
    expect(result!.shouldNotify).toBe(true);
    expect(result!.severity).toBe('warning');
    expect(result!.suggestedActions).toHaveLength(1);
    expect(result!.suggestedActions[0].id).toBe('WORKER_RESPAWN');
    expect(result!.suggestedActions[0].payload).toMatchObject({
      workerId: 'w-147-009',
      taskId: 'task-147-009',
    });
    expect(result!.metadata).toMatchObject({ type: 'stale-worker', count: 1 });
  });

  it('Test 4: 2 stale worker → 2 action, groupKey her iki ID\'yi içerir', () => {
    // Arrange
    const ctx = makeCtx({
      sprintState: makeSprintState({
        activeWorkers: [
          makeStaleWorker('w-147-009', 'task-147-009'),
          makeStaleWorker('w-147-010', 'task-147-010'),
        ],
      }),
    });

    // Act
    const result = detector.detect(ctx);

    // Assert
    expect(result).not.toBeNull();
    expect(result!.suggestedActions).toHaveLength(2);
    expect(result!.groupKey).toContain('w-147-009');
    expect(result!.groupKey).toContain('w-147-010');
    expect(result!.metadata).toMatchObject({ type: 'stale-worker', count: 2 });
  });

  it('Test 5: event-bus kaynağından gelen event → null döndürür (sadece cron/fs tetikler)', () => {
    // Arrange
    const ctx = makeCtx({
      event: makeEvent('event-bus'),
      sprintState: makeSprintState({
        activeWorkers: [
          makeStaleWorker('w-147-009', 'task-147-009'),
        ],
      }),
    });

    // Act
    const result = detector.detect(ctx);

    // Assert
    expect(result).toBeNull();
  });

  it('Test 6: IDLE ve CLEANUP fazlarında null döndürür', () => {
    // Arrange — stale worker var ama faz korunuyor
    const staleWorkers = [makeStaleWorker('w-147-009', 'task-147-009')];

    const idleCtx = makeCtx({
      sprintState: makeSprintState({ currentPhase: 'IDLE', activeWorkers: staleWorkers }),
    });
    const cleanupCtx = makeCtx({
      sprintState: makeSprintState({ currentPhase: 'CLEANUP', activeWorkers: staleWorkers }),
    });

    // Act
    const idleResult = detector.detect(idleCtx);
    const cleanupResult = detector.detect(cleanupCtx);

    // Assert
    expect(idleResult).toBeNull();
    expect(cleanupResult).toBeNull();
  });
});

// TSM-018: physically merged from tests/nervous/stale-worker.test.ts.
{
const OLD_ACTIVITY = '2024-01-01T00:00:00.000Z';

function context(liveness?: HostPrimaryLiveness__tsm_018): DetectorContext__tsm_018 {
    return {
        event: { source: 'cron' },
        now: new Date('2026-08-24T12:00:00.000Z'),
        projectRoot: '/unused',
        sprintState: {
            sprintId: 'sprint-661',
            currentPhase: 'EXECUTE',
            activeWorkers: [{
                    id: 'w-661-006',
                    taskId: '661-006',
                    lastHeartbeat: OLD_ACTIVITY,
                    ...(liveness ? { liveness } : {}),
                }],
            openDebtCount: 0,
            totalTasks: 1,
            completedTasks: 0,
        },
    } as DetectorContext__tsm_018;
}

describe('StaleWorkerDetector host-primary truth', () => {
    it.each(['alive', 'unknown', 'HOLD'] as const)('does not respawn frozen activity when host verdict is %s', (state) => {
        const liveness: HostPrimaryLiveness__tsm_018 = state === 'alive'
            ? { state, attemptId: 'attempt-1', hostSequence: 7, reason: 'host running' }
            : { state, attemptId: 'attempt-1', hostSequence: null, reason: 'host unavailable' };
        expect(new StaleWorkerDetector__tsm_018().detect(context(liveness))).toBeNull();
    });
    it('emits exactly once for one exact dead attempt', () => {
        const detector = new StaleWorkerDetector__tsm_018();
        const input = context({
            state: 'dead',
            attemptId: 'attempt-1',
            hostSequence: 8,
            reason: 'host exited',
        });
        expect(detector.detect(input)?.suggestedActions).toHaveLength(1);
        expect(detector.detect(input)).toBeNull();
    });
    it('does not treat a worker without host attempt authority as stale admission', () => {
        expect(new StaleWorkerDetector__tsm_018().detect(context())).toBeNull();
    });
});
}
