/**
 * Sprint 168 C0c RC2 — Decision engine scope collision blocker tests.
 *
 * Sprint 167 cascade root layer: Auditor emits SCOPE_COLLISION_DETECTED on
 * plan-time when two tasks claim the same file in scope.filesWrite, BUT
 * Brain has no subscriber/consumer — the alert is observed in events.jsonl
 * but TASK_ASSIGN proceeds anyway, leading to runtime collisions and
 * worker corruption (Sprint 167 events.jsonl evidence seq #1, #2, #8).
 *
 * handleScopeCollision() is the missing decision-engine subscriber:
 * Brain spawn pipeline consults it before TASK_ASSIGN; on collision the
 * decision is 'block' and SPAWN emits BRAIN→SPAWN:BLOCKED.
 */
import { describe, it, expect } from 'vitest';
import {
  handleScopeCollision,
  type ScopeCollisionPayload,
  type SpawnDecision,
} from '../../src/orchestra/decision-engine.js';

describe('handleScopeCollision (Sprint 168 C0c RC2)', () => {
  it('returns block decision on overlap', () => {
    const decision = handleScopeCollision({
      taskIds: ['168-001', '168-002'],
      files: ['.audit/shared.md'],
      detectedAt: 'plan-time',
    });
    expect(decision.action).toBe('block');
    expect(decision.taskIds).toEqual(['168-001', '168-002']);
  });

  it('reason mentions colliding file(s)', () => {
    const decision = handleScopeCollision({
      taskIds: ['168-003', '168-004'],
      files: ['src/orchestra/sprint-controller.ts'],
      detectedAt: 'plan-time',
    });
    expect(decision.reason).toContain('src/orchestra/sprint-controller.ts');
  });

  it('joins multiple colliding files in reason', () => {
    const decision = handleScopeCollision({
      taskIds: ['a', 'b', 'c'],
      files: ['x.md', 'y.md'],
      detectedAt: 'plan-time',
    });
    expect(decision.action).toBe('block');
    expect(decision.reason).toContain('x.md');
    expect(decision.reason).toContain('y.md');
    expect(decision.taskIds).toEqual(['a', 'b', 'c']);
  });

  it('returns SpawnDecision with action union type', () => {
    const decision: SpawnDecision = handleScopeCollision({
      taskIds: ['t1', 't2'],
      files: ['shared.json'],
      detectedAt: 'spawn-time',
    });
    // Static assertion that action is restricted to the union
    const validActions: Array<SpawnDecision['action']> = ['block', 'replan', 'continue'];
    expect(validActions).toContain(decision.action);
  });

  it('ScopeCollisionPayload type accepts plan-time and spawn-time', () => {
    // Compile-time + runtime assertion that the detectedAt field is unrestricted string
    const planTime: ScopeCollisionPayload = {
      taskIds: ['1', '2'],
      files: ['a.md'],
      detectedAt: 'plan-time',
    };
    const spawnTime: ScopeCollisionPayload = {
      taskIds: ['1', '2'],
      files: ['a.md'],
      detectedAt: 'spawn-time',
    };
    expect(handleScopeCollision(planTime).action).toBe('block');
    expect(handleScopeCollision(spawnTime).action).toBe('block');
  });
});
