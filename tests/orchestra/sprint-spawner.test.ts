// ═══ Sprint Spawner — Collision Detection Tests ═══════════════════
// Sprint 138 — Task 004: Plan-time scope collision detection

import { describe, it, expect } from 'vitest';
import type { Task, TaskScope } from '../../src/core/types.js';
import { TaskStatus } from '../../src/core/types.js';
import {
  detectScopeCollisions,
  buildCollisionAwareWaves,
} from '../../src/orchestra/conflict-resolver.js';

// ─── Test Helpers ─────────────────────────────────────────────────

function createTask(id: string, filesWrite: string[], dependencies: string[] = []): Task {
  return {
    id,
    title: `Task ${id}`,
    description: `Test task ${id}`,
    model: 'sonnet' as Task['model'],
    effort: 'normal' as Task['effort'],
    priority: 'NORMAL',
    reason: 'test',
    scope: {
      directories: [],
      filesRead: [],
      filesWrite,
    },
    dependencies,
    goNogo: {
      goCriteria: 'test passes',
      noGoCriteria: 'test fails',
      techDebtAcceptable: 'minor issues',
    },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-138',
  };
}

describe('detectScopeCollisions', () => {

  it('should detect no collisions when tasks write to different files', () => {
    const tasks = [
      createTask('001', ['src/a.ts']),
      createTask('002', ['src/b.ts']),
      createTask('003', ['src/c.ts']),
    ];

    const result = detectScopeCollisions(tasks);
    expect(result.collisionCount).toBe(0);
    expect(result.collidingPairs).toHaveLength(0);
  });

  it('should detect collision when two tasks write to the same file', () => {
    const tasks = [
      createTask('001', ['src/shared.ts', 'src/a.ts']),
      createTask('002', ['src/shared.ts', 'src/b.ts']),
    ];

    const result = detectScopeCollisions(tasks);
    expect(result.collisionCount).toBe(1);
    expect(result.collisions.get('src/shared.ts')).toEqual(['001', '002']);
    expect(result.collidingPairs).toEqual([['001', '002']]);
  });

  it('should detect multiple collisions', () => {
    const tasks = [
      createTask('001', ['src/shared.ts', 'src/common.ts']),
      createTask('002', ['src/shared.ts']),
      createTask('003', ['src/common.ts', 'src/other.ts']),
    ];

    const result = detectScopeCollisions(tasks);
    expect(result.collisionCount).toBe(2); // shared.ts and common.ts
    expect(result.collidingPairs).toHaveLength(2);
  });

  it('should handle three-way collision', () => {
    const tasks = [
      createTask('001', ['src/shared.ts']),
      createTask('002', ['src/shared.ts']),
      createTask('003', ['src/shared.ts']),
    ];

    const result = detectScopeCollisions(tasks);
    expect(result.collisionCount).toBe(1);
    expect(result.collisions.get('src/shared.ts')).toEqual(['001', '002', '003']);
    // 3 pairs: (001,002), (001,003), (002,003)
    expect(result.collidingPairs).toHaveLength(3);
  });

  it('should handle tasks with no filesWrite', () => {
    const task = createTask('001', []);
    // Manually clear filesWrite to simulate edge case
    (task.scope as TaskScope).filesWrite = [];

    const result = detectScopeCollisions([task]);
    expect(result.collisionCount).toBe(0);
  });

  it('should handle empty task list', () => {
    const result = detectScopeCollisions([]);
    expect(result.collisionCount).toBe(0);
    expect(result.collidingPairs).toHaveLength(0);
  });
});

describe('buildCollisionAwareWaves', () => {

  it('should return empty waves for empty tasks', () => {
    const waves = buildCollisionAwareWaves([], 3);
    expect(waves).toEqual([]);
  });

  it('should put non-colliding tasks in same wave', () => {
    const tasks = [
      createTask('001', ['src/a.ts']),
      createTask('002', ['src/b.ts']),
      createTask('003', ['src/c.ts']),
    ];

    const waves = buildCollisionAwareWaves(tasks, 3);
    expect(waves).toHaveLength(1);
    expect(waves[0].taskIds).toHaveLength(3);
  });

  it('should separate colliding tasks into different waves', () => {
    const tasks = [
      createTask('001', ['src/shared.ts']),
      createTask('002', ['src/shared.ts']),
    ];

    const waves = buildCollisionAwareWaves(tasks, 3);
    // Lower ID goes first, higher ID depends on it → 2 waves
    expect(waves.length).toBeGreaterThanOrEqual(2);
    expect(waves[0].taskIds).toContain('001');
    expect(waves[1].taskIds).toContain('002');
  });

  it('should respect existing dependencies alongside collisions', () => {
    const tasks = [
      createTask('001', ['src/a.ts'], []),
      createTask('002', ['src/shared.ts'], ['001']), // depends on 001
      createTask('003', ['src/shared.ts'], []),       // collides with 002
    ];

    const waves = buildCollisionAwareWaves(tasks, 3);
    // 001 → wave 0
    // 003 → wave 0 (no deps, but collides with 002)
    // 002 → wave 1 (depends on 001)
    // OR 003 → wave 1 if collision edge makes it depend on 002
    // Collision edge: 002 < 003 (sorted), so 003 depends on 002
    // So: 001 wave 0, 002 wave 1 (dep on 001), 003 wave 2 (dep on 002 via collision)
    expect(waves.length).toBeGreaterThanOrEqual(2);

    // Ensure 002 and 003 are NOT in the same wave
    for (const wave of waves) {
      const has002 = wave.taskIds.includes('002');
      const has003 = wave.taskIds.includes('003');
      expect(has002 && has003).toBe(false);
    }
  });

  it('should respect maxWorkers limit per wave', () => {
    const tasks = [
      createTask('001', ['src/a.ts']),
      createTask('002', ['src/b.ts']),
      createTask('003', ['src/c.ts']),
      createTask('004', ['src/d.ts']),
      createTask('005', ['src/e.ts']),
    ];

    const waves = buildCollisionAwareWaves(tasks, 2);
    // 5 tasks, maxWorkers=2 → at least 3 waves
    expect(waves.length).toBeGreaterThanOrEqual(3);
    for (const wave of waves) {
      expect(wave.taskIds.length).toBeLessThanOrEqual(2);
    }
  });

  it('should handle sprint 138 meta-dogfood scenario (Task 5+6 shared file)', () => {
    // This mirrors the actual Sprint 138 scenario:
    // Task 5 and Task 6 both write to sprint-finalizer.ts
    const tasks = [
      createTask('138-001', ['scripts/adr-validator.mjs', '.brain/DECISIONS.md']),
      createTask('138-005', ['src/orchestra/sprint-finalizer.ts', 'tests/orchestra/sprint-finalizer.test.ts']),
      createTask('138-006', ['src/orchestra/sprint-finalizer.ts', 'src/core/observability.ts']),
      createTask('138-007', ['src/orchestra/sprint-finalizer.ts'], ['138-006']),
    ];

    const waves = buildCollisionAwareWaves(tasks, 3);

    // 138-005 and 138-006 collide on sprint-finalizer.ts
    // They MUST be in different waves
    for (const wave of waves) {
      const has005 = wave.taskIds.includes('138-005');
      const has006 = wave.taskIds.includes('138-006');
      expect(has005 && has006).toBe(false);
    }

    // 138-007 depends on 138-006, so must come after
    const wave006 = waves.findIndex(w => w.taskIds.includes('138-006'));
    const wave007 = waves.findIndex(w => w.taskIds.includes('138-007'));
    expect(wave007).toBeGreaterThan(wave006);
  });
});
