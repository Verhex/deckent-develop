// tests/nervous/detectors/scope-collision-rate.test.ts
//
// ScopeCollisionRateDetector — 3 test case
// ADR-003: vitest over Jest

import { describe, it, expect } from 'vitest';
import { ScopeCollisionRateDetector } from '../../../src/nervous/detectors/scope-collision-rate.js';
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
    completedTasks: 3,
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

describe('ScopeCollisionRateDetector', () => {
  it('positive: 15 collisions via SCOPE_COLLISION event → warning', () => {
    const detector = new ScopeCollisionRateDetector(10);

    const event: ObserverEvent = {
      id: 'ev-collision-001',
      source: 'event-bus',
      type: 'SCOPE_COLLISION',
      timestamp: BASE_NOW.toISOString(),
      payload: { collisionCount: 15, files: ['src/core/config.ts'] },
      sprintId: 'sprint-151',
    };

    const result = detector.detect(makeCtx(event));

    expect(result).not.toBeNull();
    expect(result!.severity).toBe('warning');
    expect(result!.shouldNotify).toBe(true);
    expect(result!.suggestedActions[0].id).toBe('SCOPE_COLLISION_REORDER');
    expect(result!.suggestedActions[0].label).toContain('15');
    expect(result!.metadata).toMatchObject({ type: 'scope-collision-rate', collisionCount: 15 });
  });

  it('negative: 5 collisions (below threshold of 10) → null', () => {
    const detector = new ScopeCollisionRateDetector(10);

    const event: ObserverEvent = {
      id: 'ev-collision-002',
      source: 'event-bus',
      type: 'SCOPE_COLLISION',
      timestamp: BASE_NOW.toISOString(),
      payload: { collisionCount: 5 },
      sprintId: 'sprint-151',
    };

    const result = detector.detect(makeCtx(event));
    expect(result).toBeNull();
  });

  it('edge: EVALUATE phase with sprintCollisionCount → detects accumulated collisions', () => {
    const detector = new ScopeCollisionRateDetector(10);

    const event: ObserverEvent = {
      id: 'ev-eval-001',
      source: 'sprint-lifecycle',
      type: 'SPRINT_PHASE_CHANGE',
      timestamp: BASE_NOW.toISOString(),
      payload: { newPhase: 'EVALUATE', sprintCollisionCount: 25 },
      sprintId: 'sprint-151',
    };

    const result = detector.detect(makeCtx(event));

    expect(result).not.toBeNull();
    expect(result!.severity).toBe('critical'); // 25 > 2*10
    expect(result!.suggestedActions[0].payload).toMatchObject({
      collisionCount: 25,
      threshold: 10,
    });
  });
});
