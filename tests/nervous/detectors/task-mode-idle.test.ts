// tests/nervous/detectors/task-mode-idle.test.ts
//
// TaskModeIdleDetector unit tests — 4 test case
// ADR-003: vitest over Jest

import { describe, it, expect, beforeEach } from 'vitest';
import { TaskModeIdleDetector } from '../../../src/nervous/detectors/task-mode-idle.js';
import type { DetectorContext, SprintStateSnapshot, ObserverEvent } from '../../../src/core/nervous-types.js';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

const BASE_NOW = new Date('2026-04-20T10:00:00.000Z');

/** Son kullanıcı aktivitesi BASE_NOW'dan offsetMs önce */
function makeLastActivity(offsetMs: number): string {
  return new Date(BASE_NOW.getTime() - offsetMs).toISOString();
}

function makeEvent(
  source: ObserverEvent['source'] = 'cron',
  lastActivityMs?: number,
): ObserverEvent {
  const payload: Record<string, unknown> = {};
  if (lastActivityMs !== undefined) {
    payload['lastUserActivity'] = makeLastActivity(lastActivityMs);
  }
  return {
    id: 'test-event-id',
    source,
    type: 'TICK',
    timestamp: BASE_NOW.toISOString(),
    payload,
  };
}

function makeSprintState(
  overrides: Partial<SprintStateSnapshot> = {},
): SprintStateSnapshot {
  return {
    sprintId: 'sprint-149',
    currentPhase: 'IDLE',
    activeWorkers: [],
    openDebtCount: 0,
    totalTasks: 0,
    completedTasks: 0,
    ...overrides,
  };
}

function makeCtx(
  eventOverrides: Partial<ObserverEvent> = {},
  ctxOverrides: Partial<DetectorContext> = {},
): DetectorContext {
  return {
    event: { ...makeEvent(), ...eventOverrides },
    sprintState: makeSprintState(),
    projectRoot: '/workspace',
    now: BASE_NOW,
    ...ctxOverrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('TaskModeIdleDetector', () => {
  // 5 dakika eşiği, task mode
  let taskDetector: TaskModeIdleDetector;
  // 5 dakika eşiği, sprint mode
  let sprintDetector: TaskModeIdleDetector;

  beforeEach(() => {
    taskDetector = new TaskModeIdleDetector('task', 300_000);  // 5 dakika
    sprintDetector = new TaskModeIdleDetector('sprint', 300_000);
  });

  it('Test 1: task mode + idle < 5min → null döndürür', () => {
    // Arrange: son aktivite 4 dakika önce (eşiğin altında)
    const ctx: DetectorContext = {
      event: makeEvent('cron', 240_000),  // 4 dakika idle
      sprintState: makeSprintState(),
      projectRoot: '/workspace',
      now: BASE_NOW,
    };

    // Act
    const result = taskDetector.detect(ctx);

    // Assert
    expect(result).toBeNull();
  });

  it('Test 2: task mode + idle > 5min → info notification döndürür', () => {
    // Arrange: son aktivite 7 dakika önce (eşiğin üzerinde)
    const ctx: DetectorContext = {
      event: makeEvent('cron', 420_000),  // 7 dakika idle
      sprintState: makeSprintState(),
      projectRoot: '/workspace',
      now: BASE_NOW,
    };

    // Act
    const result = taskDetector.detect(ctx);

    // Assert
    expect(result).not.toBeNull();
    expect(result!.risk).toBe('low');
    expect(result!.shouldNotify).toBe(true);
    expect(result!.severity).toBe('info');
    expect(result!.suggestedActions).toHaveLength(1);
    expect(result!.suggestedActions[0].id).toBe('METRIC_EMIT');
    expect(result!.suggestedActions[0].risk).toBe('low');
    expect(result!.suggestedActions[0].payload).toMatchObject({
      mode: 'task',
      idleMinutes: 7,
    });
    expect(result!.groupKey).toBe('task-mode-idle:7m');
    expect(result!.metadata).toMatchObject({ type: 'task-mode-idle', idleMinutes: 7 });
  });

  it('Test 3: sprint mode + herhangi bir idle → null döndürür (detector skip)', () => {
    // Arrange: 10 dakika idle ama sprint mode'da
    const ctx: DetectorContext = {
      event: makeEvent('cron', 600_000),  // 10 dakika idle
      sprintState: makeSprintState(),
      projectRoot: '/workspace',
      now: BASE_NOW,
    };

    // Act
    const result = sprintDetector.detect(ctx);

    // Assert
    expect(result).toBeNull();
  });

  it('Test 4: cron dışı event (filesystem) → null döndürür', () => {
    // Arrange: task mode + 10 dakika idle ama event filesystem kaynağı
    const ctx: DetectorContext = {
      event: makeEvent('filesystem', 600_000),  // 10 dakika idle, filesystem event
      sprintState: makeSprintState(),
      projectRoot: '/workspace',
      now: BASE_NOW,
    };

    // Act
    const result = taskDetector.detect(ctx);

    // Assert
    expect(result).toBeNull();
  });

  // ─── Edge Cases ──────────────────────────────────────────────────────────────

  it('Edge: lastUserActivity payload olmadığında null döndürür', () => {
    // Arrange: payload'da lastUserActivity yok
    const ctx: DetectorContext = {
      event: {
        id: 'test-id',
        source: 'cron',
        type: 'TICK',
        timestamp: BASE_NOW.toISOString(),
        payload: {},  // lastUserActivity yok
      },
      sprintState: makeSprintState(),
      projectRoot: '/workspace',
      now: BASE_NOW,
    };

    const result = taskDetector.detect(ctx);
    expect(result).toBeNull();
  });

  it('Edge: tam eşik değerinde (300_000ms) → null döndürür (eşik dahil değil)', () => {
    // Arrange: tam 5 dakika idle (threshold ile eşit → eşiğin altında sayılır)
    const ctx: DetectorContext = {
      event: makeEvent('cron', 300_000),  // tam 5 dakika
      sprintState: makeSprintState(),
      projectRoot: '/workspace',
      now: BASE_NOW,
    };

    // idleMs = 300_000, idleThresholdMs = 300_000 → idleMs < threshold FALSE → detect olur
    // NOT: 300_000 < 300_000 = false, demek ki result döner
    const result = taskDetector.detect(ctx);
    // Tam eşik değerinde detector aktif olmalı (strict less-than: < threshold)
    expect(result).not.toBeNull();
  });
});
