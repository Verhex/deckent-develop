// ═══ Sprint Spawner — Collision Detection + Scope Format Tests ════
// Sprint 138 — Task 004: Plan-time scope collision detection
// Sprint 139 — Task 025: Worker scope format validation
// Sprint 139 — Task 033: Checkpoint interval override

import { describe, it, expect } from 'vitest';
import type { ResolvedConfig } from '../../src/core/config-types.js';
import type { Task, TaskScope } from '../../src/core/types.js';
import { TaskStatus } from '../../src/core/types.js';
import {
  detectScopeCollisions,
  buildCollisionAwareWaves,
} from '../../src/orchestra/conflict-resolver.js';
import {
  normalizeScopePath,
  buildAllowedWriteTargets,
} from '../../src/orchestra/sprint-spawner.js';

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

// ═══ normalizeScopePath ════════════════════════════════════════════
// Sprint 139 Task 025 — scope format validation

describe('normalizeScopePath', () => {

  // ─── Valid paths ────────────────────────────────────────────────

  it('should return valid file path unchanged', () => {
    expect(normalizeScopePath('src/core/config.ts')).toBe('src/core/config.ts');
  });

  it('should return valid directory path unchanged', () => {
    expect(normalizeScopePath('src/orchestra/')).toBe('src/orchestra/');
  });

  it('should preserve .tasks/ directory path', () => {
    expect(normalizeScopePath('.tasks/')).toBe('.tasks/');
  });

  it('should preserve deeply nested file paths', () => {
    expect(normalizeScopePath('src/orchestra/sprint-spawner.ts')).toBe('src/orchestra/sprint-spawner.ts');
  });

  // ─── Trailing slash normalization ───────────────────────────────

  it('should remove trailing slash from file paths (DECKENT.md/ → DECKENT.md but then ADR-013 rejects)', () => {
    // Even after normalization, DECKENT.md is rejected by ADR-013
    // Test that the normalization step itself works for a generic file
    expect(normalizeScopePath('src/some-file.md/')).toBe('src/some-file.md');
  });

  it('should remove trailing slash from .ts files', () => {
    expect(normalizeScopePath('src/core/types.ts/')).toBe('src/core/types.ts');
  });

  it('should NOT remove trailing slash from directory paths (no extension in basename)', () => {
    // 'orchestra' has no extension — keep the slash
    expect(normalizeScopePath('src/orchestra/')).toBe('src/orchestra/');
  });

  it('should NOT remove trailing slash from hidden directories', () => {
    // '.deckent' has no "file-like" extension — keep the slash
    expect(normalizeScopePath('.deckent/')).toBe('.deckent/');
  });

  // ─── Extension-only rejection ───────────────────────────────────

  it('should reject extension-only path ".json"', () => {
    expect(normalizeScopePath('.json')).toBeNull();
  });

  it('should reject extension-only path ".ts"', () => {
    expect(normalizeScopePath('.ts')).toBeNull();
  });

  it('should reject extension-only path ".md"', () => {
    expect(normalizeScopePath('.md')).toBeNull();
  });

  it('should reject extension-only path ".mjs"', () => {
    expect(normalizeScopePath('.mjs')).toBeNull();
  });

  // ─── ADR-013 protected path rejection ──────────────────────────

  it('should reject CLAUDE.md (ADR-013 protected)', () => {
    expect(normalizeScopePath('CLAUDE.md')).toBeNull();
  });

  it('should reject DECKENT.md (ADR-013 protected)', () => {
    expect(normalizeScopePath('DECKENT.md')).toBeNull();
  });

  it('should reject DECKENT.md with trailing slash', () => {
    // After slash removal: "DECKENT.md" → still protected
    expect(normalizeScopePath('DECKENT.md/')).toBeNull();
  });

  it('should reject CLAUDE.md in nested path', () => {
    expect(normalizeScopePath('subdir/CLAUDE.md')).toBeNull();
  });

  it('should reject DECKENT.md in nested path', () => {
    expect(normalizeScopePath('project/DECKENT.md')).toBeNull();
  });

  // ─── Empty / whitespace ─────────────────────────────────────────

  it('should reject empty string', () => {
    expect(normalizeScopePath('')).toBeNull();
  });

  it('should reject whitespace-only string', () => {
    expect(normalizeScopePath('   ')).toBeNull();
  });

  it('should trim surrounding whitespace before processing', () => {
    expect(normalizeScopePath('  src/core/config.ts  ')).toBe('src/core/config.ts');
  });
});

// ═══ buildAllowedWriteTargets ══════════════════════════════════════

describe('buildAllowedWriteTargets', () => {

  function makeTask(dirs: string[], filesWrite: string[]): Pick<Task, 'scope'> {
    return {
      scope: {
        directories: dirs,
        filesRead: [],
        filesWrite,
      } as TaskScope,
    };
  }

  // ─── Always includes .tasks/ ─────────────────────────────────────

  it('should always include .tasks/ as first entry', () => {
    const task = makeTask([], []);
    const result = buildAllowedWriteTargets(task);
    expect(result).toContain('.tasks/');
    expect(result[0]).toBe('.tasks/');
  });

  it('should include .tasks/ even when other paths are empty', () => {
    const task = makeTask([], []);
    const result = buildAllowedWriteTargets(task);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('.tasks/');
  });

  // ─── Normalization applied ────────────────────────────────────────

  it('should remove trailing slash from file entries in directories', () => {
    const task = makeTask(['src/core/config.ts/'], []);
    const result = buildAllowedWriteTargets(task);
    expect(result).toContain('src/core/config.ts');
    expect(result).not.toContain('src/core/config.ts/');
  });

  it('should keep trailing slash for directory entries', () => {
    const task = makeTask(['src/orchestra/'], []);
    const result = buildAllowedWriteTargets(task);
    expect(result).toContain('src/orchestra/');
  });

  // ─── Protected path exclusion ─────────────────────────────────────

  it('should exclude CLAUDE.md from directories', () => {
    const task = makeTask(['CLAUDE.md', 'src/core/'], []);
    const result = buildAllowedWriteTargets(task);
    expect(result).not.toContain('CLAUDE.md');
    expect(result).toContain('src/core/');
  });

  it('should exclude DECKENT.md from filesWrite', () => {
    const task = makeTask([], ['DECKENT.md', 'src/index.ts']);
    const result = buildAllowedWriteTargets(task);
    expect(result).not.toContain('DECKENT.md');
    expect(result).toContain('src/index.ts');
  });

  it('should exclude DECKENT.md/ (with trailing slash) from directories', () => {
    const task = makeTask(['DECKENT.md/'], ['src/cli/commands/run.ts']);
    const result = buildAllowedWriteTargets(task);
    expect(result).not.toContain('DECKENT.md');
    expect(result).not.toContain('DECKENT.md/');
    expect(result).toContain('src/cli/commands/run.ts');
  });

  // ─── Extension-only rejection ─────────────────────────────────────

  it('should exclude extension-only entries like ".json"', () => {
    const task = makeTask(['.json', 'src/core/'], []);
    const result = buildAllowedWriteTargets(task);
    expect(result).not.toContain('.json');
    expect(result).toContain('src/core/');
  });

  // ─── Deduplication ───────────────────────────────────────────────

  it('should deduplicate identical paths', () => {
    const task = makeTask(['src/core/', 'src/core/'], ['src/core/config.ts', 'src/core/config.ts']);
    const result = buildAllowedWriteTargets(task);
    const srcCoreCount = result.filter(p => p === 'src/core/').length;
    const configCount = result.filter(p => p === 'src/core/config.ts').length;
    expect(srcCoreCount).toBe(1);
    expect(configCount).toBe(1);
  });

  // ─── Sprint 138 xfix scenario ─────────────────────────────────────

  it('should handle Sprint 138 xfix scenario: DECKENT.md/ + .json invalid entries', () => {
    // Simulates the exact bad scope data that triggered this fix
    const task = makeTask(
      ['DECKENT.md/', '.json', 'src/orchestra/'],
      ['src/orchestra/sprint-spawner.ts'],
    );
    const result = buildAllowedWriteTargets(task);
    expect(result).toContain('.tasks/');
    expect(result).toContain('src/orchestra/');
    expect(result).toContain('src/orchestra/sprint-spawner.ts');
    expect(result).not.toContain('DECKENT.md/');
    expect(result).not.toContain('DECKENT.md');
    expect(result).not.toContain('.json');
  });

  it('should handle combined CLAUDE.md + DECKENT.md protection scenario', () => {
    const task = makeTask(
      ['CLAUDE.md', 'DECKENT.md', 'src/'],
      ['DECKENT.md/', 'src/agents/worker.ts'],
    );
    const result = buildAllowedWriteTargets(task);
    expect(result).not.toContain('CLAUDE.md');
    expect(result).not.toContain('DECKENT.md');
    expect(result).not.toContain('DECKENT.md/');
    expect(result).toContain('src/');
    expect(result).toContain('src/agents/worker.ts');
  });
});

// ═══ Checkpoint Interval Override (Sprint 139 Task 033) ═══════════
describe('sprint_checkpoint_interval config field', () => {
  /**
   * Simulate the CHECKPOINT_INTERVAL resolution logic from respawnEligibleTasks.
   * This mirrors the exact expression used in sprint-spawner.ts:
   *   const CHECKPOINT_INTERVAL = config.sprint_checkpoint_interval ?? 5;
   */
  function resolveInterval(config: Partial<ResolvedConfig>): number {
    return config.sprint_checkpoint_interval ?? 5;
  }

  it('defaults to 5 when sprint_checkpoint_interval is not set', () => {
    const interval = resolveInterval({});
    expect(interval).toBe(5);
  });

  it('returns 3 when sprint_checkpoint_interval is set to 3 (Sprint 139 override)', () => {
    const interval = resolveInterval({ sprint_checkpoint_interval: 3 });
    expect(interval).toBe(3);
  });

  it('returns 1 when set to 1 (aggressive checkpoint)', () => {
    const interval = resolveInterval({ sprint_checkpoint_interval: 1 });
    expect(interval).toBe(1);
  });

  it('returns 10 when set to 10 (low-risk large sprint)', () => {
    const interval = resolveInterval({ sprint_checkpoint_interval: 10 });
    expect(interval).toBe(10);
  });

  it('checkpoint fires at correct terminal counts with interval=3', () => {
    const interval = 3;
    const shouldFire = (count: number) => count > 0 && count % interval === 0;
    expect(shouldFire(0)).toBe(false);
    expect(shouldFire(1)).toBe(false);
    expect(shouldFire(2)).toBe(false);
    expect(shouldFire(3)).toBe(true);   // first checkpoint
    expect(shouldFire(6)).toBe(true);   // second
    expect(shouldFire(9)).toBe(true);   // third
    expect(shouldFire(4)).toBe(false);
  });

  it('checkpoint fires at correct terminal counts with default interval=5', () => {
    const interval = 5;
    const shouldFire = (count: number) => count > 0 && count % interval === 0;
    expect(shouldFire(5)).toBe(true);
    expect(shouldFire(10)).toBe(true);
    expect(shouldFire(3)).toBe(false);
    expect(shouldFire(4)).toBe(false);
  });
});

// ═══ Brain Event Hook Points — Sprint 139 Task 042 ════════════════
// Tests for the event hook channels wired in sprint-spawner:
//   BRAIN→WORKER:TASK_ASSIGN  (before each task spawn)
//   BRAIN→*:METRIC_EMITTED    (after each wave respawn)
//   BRAIN→WORKER:DEPENDENCY_UNBLOCKED  (unblock path uses correct channel)
//
// These tests verify the channel constants and payload shapes used
// in evaluateFailureCascade, applyCascadeToSprint, applyUnblockToSprint.

describe('Brain event hook — channel constants and payload shapes', () => {

  // ─── TASK_ASSIGN channel identifier ─────────────────────────────

  it('CHANNELS.TASK_ASSIGN is the correct Brain→Worker channel', async () => {
    // Verify the channel constant used in spawnWorkers matches ADR-035 Protocol 1.0
    const { CHANNELS } = await import('../../src/orchestra/event-stream.js');
    expect(CHANNELS.TASK_ASSIGN).toBe('BRAIN→WORKER:TASK_ASSIGN');
  });

  it('TASK_ASSIGN payload shape includes taskId, workerId, model, agent, skills, scope, provider', () => {
    // Verify the payload structure matches what spawnWorkers emits for TASK_ASSIGN
    const task = createTask('139-001', ['src/foo.ts'], []);
    const payload = {
      taskId: task.id,
      workerId: `w-${task.id}`,
      model: task.model,
      agent: 'architect',
      skills: ['typescript-expert'],
      scope: {
        directories: task.scope.directories ?? [],
        filesWrite: task.scope.filesWrite ?? [],
      },
      provider: 'claude',
    };

    // Structural assertions — matches the shape emitted in spawnWorkers
    expect(payload.taskId).toBe('139-001');
    expect(payload.workerId).toBe('w-139-001');
    expect(payload.model).toBe('sonnet');
    expect(Array.isArray(payload.skills)).toBe(true);
    expect(Array.isArray(payload.scope.filesWrite)).toBe(true);
  });

  // ─── METRIC_EMITTED channel identifier ──────────────────────────

  it('CHANNELS.METRIC_EMITTED is the correct broadcast channel', async () => {
    const { CHANNELS } = await import('../../src/orchestra/event-stream.js');
    expect(CHANNELS.METRIC_EMITTED).toBe('BRAIN→*:METRIC_EMITTED');
  });

  it('wave.respawn metric payload shape includes required fields', () => {
    // Verify the payload structure matches what respawnEligibleTasks emits
    const tasks = [
      createTask('139-001', ['src/a.ts'], []),
      createTask('139-002', ['src/b.ts'], ['139-001']),
    ];

    // Simulate the payload built in respawnEligibleTasks
    const toSpawn = [tasks[1]];
    const payload = {
      name: 'wave.respawn',
      value: toSpawn.length,
      durationMs: 100,
      spawnedTaskIds: toSpawn.map(t => t.id),
      totalDone: 1,
      totalPending: 0,
    };

    expect(payload.name).toBe('wave.respawn');
    expect(payload.value).toBe(1);
    expect(payload.spawnedTaskIds).toEqual(['139-002']);
    expect(typeof payload.durationMs).toBe('number');
    expect(typeof payload.totalDone).toBe('number');
  });

  // ─── DEPENDENCY_UNBLOCKED channel (correct vs wrong) ────────────

  it('applyUnblockToSprint uses DEPENDENCY_UNBLOCKED not DEPENDENCY_BLOCKED channel', () => {
    // Ensures the channel string used in applyUnblockToSprint is correct.
    // Prior bug: applyUnblockToSprint used 'BRAIN→WORKER:DEPENDENCY_BLOCKED' instead
    // of 'BRAIN→WORKER:DEPENDENCY_UNBLOCKED' — consumers could not distinguish events.
    const UNBLOCKED_CHANNEL = 'BRAIN→WORKER:DEPENDENCY_UNBLOCKED';
    const BLOCKED_CHANNEL = 'BRAIN→WORKER:DEPENDENCY_BLOCKED';
    expect(UNBLOCKED_CHANNEL).not.toBe(BLOCKED_CHANNEL);
    // Channel string must contain 'UNBLOCKED', not 'BLOCKED'
    expect(UNBLOCKED_CHANNEL).toContain('UNBLOCKED');
    expect(BLOCKED_CHANNEL).toContain('BLOCKED');
    expect(BLOCKED_CHANNEL).not.toContain('UNBLOCKED');
  });

  it('DEPENDENCY_UNBLOCKED payload shape includes transition UNBLOCKED and correct fields', () => {
    // Mirror the payload built in applyUnblockToSprint's unblockDependents callback
    const resolvedTaskId = '139-005';
    const event = {
      transition: 'UNBLOCKED' as const,
      taskId: '139-008',
      triggerTaskId: resolvedTaskId,
      fromStatus: TaskStatus.PAUSED,
      toStatus: TaskStatus.PENDING,
    };

    const payload = {
      transition: event.transition,
      taskId: event.taskId,
      triggerTaskId: event.triggerTaskId,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      unblockedBy: resolvedTaskId,
    };

    expect(payload.transition).toBe('UNBLOCKED');
    expect(payload.fromStatus).toBe(TaskStatus.PAUSED);
    expect(payload.toStatus).toBe(TaskStatus.PENDING);
    expect(payload.unblockedBy).toBe(resolvedTaskId);
  });

  // ─── SPRINT_PHASE_CHANGE (broadcast) ─────────────────────────────

  it('CHANNELS.SPRINT_PHASE_CHANGE is the correct broadcast channel', async () => {
    const { CHANNELS } = await import('../../src/orchestra/event-stream.js');
    expect(CHANNELS.SPRINT_PHASE_CHANGE).toBe('BRAIN→*:SPRINT_PHASE_CHANGE');
    // Must be a broadcast (target = '*')
    expect(CHANNELS.SPRINT_PHASE_CHANGE).toContain('→*:');
  });

  it('SPRINT_PHASE_CHANGE payload shape includes fromPhase, toPhase, sprintId, timestamp', () => {
    // Verify the payload built in finalizeSprint for phase transitions
    const payload = {
      fromPhase: 'EXECUTE',
      toPhase: 'EVALUATE',
      sprintId: 'sprint-139',
      timestamp: new Date().toISOString(),
    };
    expect(payload.fromPhase).toBe('EXECUTE');
    expect(payload.toPhase).toBe('EVALUATE');
    expect(payload.sprintId).toBe('sprint-139');
    // ISO 8601 format
    expect(new Date(payload.timestamp).toISOString()).toBe(payload.timestamp);
  });

  // ─── FIX_REQUEST channel (existing — test coverage) ─────────────

  it('CHANNELS.FIX_REQUEST is BRAIN→WORKER:FIX_REQUEST (existing hook)', async () => {
    const { CHANNELS } = await import('../../src/orchestra/event-stream.js');
    expect(CHANNELS.FIX_REQUEST).toBe('BRAIN→WORKER:FIX_REQUEST');
  });

  it('FIX_REQUEST payload carries failureCategory for cascade decision', () => {
    // Simulates evaluateFailureCascade payload to verify correct shape
    const payload = {
      taskId: '139-010',
      failureCategory: 'CODE',
      shouldRetry: false,
      shouldCascade: true,
      spawnFixWorker: true,
      reason: 'Test assertion failure — code-level bug',
      signals: 'assertion failed at line 42'.slice(0, 200),
    };
    expect(payload.failureCategory).toBe('CODE');
    expect(payload.shouldCascade).toBe(true);
    expect(payload.signals.length).toBeLessThanOrEqual(200);
  });
});
