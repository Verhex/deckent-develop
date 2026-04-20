// tests/nervous/detectors/stale-worker.test.ts
//
// StaleWorkerDetector unit tests — 6 test case
// ADR-003: vitest over Jest

import { describe, it, expect, beforeEach } from 'vitest';
import { StaleWorkerDetector } from '../../../src/nervous/detectors/stale-worker.js';
import type { DetectorContext, SprintStateSnapshot, ObserverEvent } from '../../../src/core/nervous-types.js';

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

function makeFreshWorker(id: string, taskId: string): SprintStateSnapshot['activeWorkers'][number] {
  // Son heartbeat: 1 dakika önce (fresh)
  const freshTime = new Date(BASE_NOW.getTime() - 60_000).toISOString();
  return { id, taskId, lastHeartbeat: freshTime };
}

function makeStaleWorker(id: string, taskId: string, staleMs = 200_000): SprintStateSnapshot['activeWorkers'][number] {
  // Son heartbeat: staleMs önce (varsayılan 200s = stale > 180s threshold)
  const staleTime = new Date(BASE_NOW.getTime() - staleMs).toISOString();
  return { id, taskId, lastHeartbeat: staleTime };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('StaleWorkerDetector', () => {
  let detector: StaleWorkerDetector;

  beforeEach(() => {
    detector = new StaleWorkerDetector(); // default 180s threshold
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
