// ═══ Dependency Scheduler Tests ═══════════════════════════════════════
// Sprint 139 Task 028 — Chain Dependency Execution Scheduler
// Sprint 139 Task 030 — Dependency Graph Persistence + Resume Integration
// Tests: topological sort (Kahn's), enforcement, cascade, unblock, edge cases
//        + JSON persist, Mermaid persist, serialize/deserialize roundtrip

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Task } from '../../src/core/types.js';
import { TaskStatus } from '../../src/core/types.js';

// 323-031: spy debugLog so we can assert that buildDependencyGraph reports an
// unresolvable dependency instead of dropping it silently. `...actual` keeps
// every other util intact (only debugLog is replaced with a spy).
vi.mock('../../src/core/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/utils.js')>();
  return { ...actual, debugLog: vi.fn() };
});
import { debugLog } from '../../src/core/utils.js';
import {
  buildDependencyGraph,
  enforceWaveDependency,
  cascadeBlockDependents,
  unblockDependents,
  applyFailureCascade,
  serializeDependencyGraph,
  deserializeDependencyGraph,
  generateMermaidDiagram,
  persistDependencyGraph,
  loadDependencyGraph,
} from '../../src/orchestra/dependency-scheduler.js';
import type {
  CascadeTransitionEvent,
  DependencyGraph,
} from '../../src/orchestra/dependency-scheduler.js';

// ─── Test Helpers ─────────────────────────────────────────────────

function createTask(
  id: string,
  deps: string[] = [],
  filesWrite: string[] = [],
  status: TaskStatus = TaskStatus.PENDING,
): Task {
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
    dependencies: deps,
    goNogo: {
      goCriteria: 'test passes',
      noGoCriteria: 'test fails',
      techDebtAcceptable: 'minor issues',
    },
    status,
    sprintId: 'sprint-139',
  };
}

// ═══ buildDependencyGraph ═══════════════════════════════════════════

describe('buildDependencyGraph', () => {

  it('should build graph with no dependencies — single wave', () => {
    const tasks = [
      createTask('001'),
      createTask('002'),
      createTask('003'),
    ];

    const graph = buildDependencyGraph(tasks, false);

    expect(graph.hasCycle).toBe(false);
    expect(graph.waves).toHaveLength(1);
    expect(graph.waves[0]!.taskIds).toEqual(['001', '002', '003']);
    expect(graph.waveAssignment.get('001')).toBe(0);
    expect(graph.waveAssignment.get('002')).toBe(0);
    expect(graph.waveAssignment.get('003')).toBe(0);
  });

  it('should build linear chain — 3 waves', () => {
    const tasks = [
      createTask('001'),
      createTask('002', ['001']),
      createTask('003', ['002']),
    ];

    const graph = buildDependencyGraph(tasks, false);

    expect(graph.hasCycle).toBe(false);
    expect(graph.waves).toHaveLength(3);
    expect(graph.waves[0]!.taskIds).toEqual(['001']);
    expect(graph.waves[1]!.taskIds).toEqual(['002']);
    expect(graph.waves[2]!.taskIds).toEqual(['003']);
  });

  it('should handle diamond dependency pattern', () => {
    // A → B, A → C, B → D, C → D
    const tasks = [
      createTask('A'),
      createTask('B', ['A']),
      createTask('C', ['A']),
      createTask('D', ['B', 'C']),
    ];

    const graph = buildDependencyGraph(tasks, false);

    expect(graph.hasCycle).toBe(false);
    expect(graph.waves).toHaveLength(3);
    expect(graph.waves[0]!.taskIds).toEqual(['A']);
    expect(graph.waves[1]!.taskIds).toEqual(['B', 'C']); // sorted
    expect(graph.waves[2]!.taskIds).toEqual(['D']);
  });

  it('should detect cycle — A→B→C→A', () => {
    const tasks = [
      createTask('A', ['C']),
      createTask('B', ['A']),
      createTask('C', ['B']),
    ];

    const graph = buildDependencyGraph(tasks, false);

    expect(graph.hasCycle).toBe(true);
    expect(graph.cycleTaskIds).toHaveLength(3);
    expect(graph.cycleTaskIds).toContain('A');
    expect(graph.cycleTaskIds).toContain('B');
    expect(graph.cycleTaskIds).toContain('C');
  });

  it('should detect partial cycle — only some tasks in cycle', () => {
    // D is free, A→B→C→A is cycle
    const tasks = [
      createTask('D'),
      createTask('A', ['C']),
      createTask('B', ['A']),
      createTask('C', ['B']),
    ];

    const graph = buildDependencyGraph(tasks, false);

    expect(graph.hasCycle).toBe(true);
    // D should be resolved in wave 0, cycle detected after
    expect(graph.waves).toHaveLength(1);
    expect(graph.waves[0]!.taskIds).toEqual(['D']);
    expect(graph.cycleTaskIds).toEqual(['A', 'B', 'C']);
  });

  it('should retain unresolved dependency refs so runtime enforcement blocks instead of silently spawning', () => {
    const tasks = [
      createTask('001', ['nonexistent']),
      createTask('002'),
    ];

    const graph = buildDependencyGraph(tasks, false);

    expect(graph.hasCycle).toBe(false);
    // Diagnostic waves remain visible, but the runtime dependency set keeps
    // the unknown ref and therefore cannot claim task 001.
    expect(graph.waves).toHaveLength(1);
    expect(graph.waves[0]!.taskIds).toEqual(['001', '002']);
    expect(graph.dependencies.get('001')).toEqual(new Set(['nonexistent']));
    expect(enforceWaveDependency(graph, ['001', '002'], new Set())).toMatchObject({
      eligible: ['002'],
      blocked: ['001'],
    });
  });

  it('should add collision edges when includeCollisions=true', () => {
    const tasks = [
      createTask('001', [], ['src/shared.ts']),
      createTask('002', [], ['src/shared.ts']),
    ];

    const graph = buildDependencyGraph(tasks, true);

    expect(graph.hasCycle).toBe(false);
    // Collision edge: 001 < 002 (sorted), so 002 depends on 001
    expect(graph.waves).toHaveLength(2);
    expect(graph.waves[0]!.taskIds).toEqual(['001']);
    expect(graph.waves[1]!.taskIds).toEqual(['002']);
  });

  it('should NOT add collision edges when includeCollisions=false', () => {
    const tasks = [
      createTask('001', [], ['src/shared.ts']),
      createTask('002', [], ['src/shared.ts']),
    ];

    const graph = buildDependencyGraph(tasks, false);

    // No collision edges → both in wave 0
    expect(graph.waves).toHaveLength(1);
    expect(graph.waves[0]!.taskIds).toEqual(['001', '002']);
  });

  it('should handle empty tasks list', () => {
    const graph = buildDependencyGraph([], false);

    expect(graph.hasCycle).toBe(false);
    expect(graph.waves).toHaveLength(0);
    expect(graph.waveAssignment.size).toBe(0);
  });

  it('should handle complex multi-wave with mixed deps and collisions', () => {
    const tasks = [
      createTask('001', [], ['src/a.ts']),
      createTask('002', ['001'], ['src/b.ts']),
      createTask('003', [], ['src/a.ts']),       // collides with 001
      createTask('004', ['002', '003']),
    ];

    const graph = buildDependencyGraph(tasks, true);

    expect(graph.hasCycle).toBe(false);
    // 001 → wave 0
    // 003 collides with 001 → synthetic dep → wave 1
    // 002 depends on 001 → wave 1
    // 004 depends on 002 AND 003 → wave 2
    expect(graph.waveAssignment.get('001')).toBe(0);
    // 002 and 003 should be in wave 1 (sorted: 002, 003)
    expect(graph.waveAssignment.get('002')).toBe(1);
    expect(graph.waveAssignment.get('003')).toBe(1);
    expect(graph.waveAssignment.get('004')).toBe(2);
  });

  it('should build correct dependents (reverse edges)', () => {
    const tasks = [
      createTask('A'),
      createTask('B', ['A']),
      createTask('C', ['A']),
    ];

    const graph = buildDependencyGraph(tasks, false);

    const aDependents = graph.dependents.get('A');
    expect(aDependents).toBeDefined();
    expect(aDependents!.has('B')).toBe(true);
    expect(aDependents!.has('C')).toBe(true);

    const bDependents = graph.dependents.get('B');
    expect(bDependents).toBeDefined();
    expect(bDependents!.size).toBe(0);
  });

  // An unresolvable dependency is retained as a runtime blocker and logged,
  // so neither operator evidence nor enforcement silently loses it.
  it('warns (debugLog) and retains an unresolvable dependency as a blocker', () => {
    vi.mocked(debugLog).mockClear();
    const tasks = [
      createTask('001'),
      createTask('002', ['Build REST API']), // a TITLE string, not a slot id
    ];

    const graph = buildDependencyGraph(tasks, false);

    expect(graph.dependencies.get('002')).toEqual(new Set(['Build REST API']));
    expect(graph.hasCycle).toBe(false);

    // But it is surfaced, not silent.
    const calls = vi.mocked(debugLog).mock.calls;
    const warned = calls.some(
      ([ctx, msg]) =>
        ctx === 'dependency-scheduler:buildGraph' &&
        String(msg).includes('Build REST API') &&
        String(msg).includes('002'),
    );
    expect(warned).toBe(true);
  });

  it('does not warn when every dependency resolves to a real task id', () => {
    vi.mocked(debugLog).mockClear();
    const tasks = [createTask('001'), createTask('002', ['001'])];

    buildDependencyGraph(tasks, false);

    const buildGraphWarnings = vi.mocked(debugLog).mock.calls.filter(
      ([ctx]) => ctx === 'dependency-scheduler:buildGraph',
    );
    expect(buildGraphWarnings).toHaveLength(0);
  });
});

// ═══ enforceWaveDependency ═══════════════════════════════════════════

describe('enforceWaveDependency', () => {

  it('should mark tasks with no deps as eligible', () => {
    const tasks = [createTask('001'), createTask('002')];
    const graph = buildDependencyGraph(tasks, false);
    const doneTasks = new Set<string>();

    const result = enforceWaveDependency(graph, ['001', '002'], doneTasks);

    expect(result.eligible).toEqual(['001', '002']);
    expect(result.blocked).toHaveLength(0);
  });

  it('should block tasks with unresolved deps', () => {
    const tasks = [
      createTask('001'),
      createTask('002', ['001']),
    ];
    const graph = buildDependencyGraph(tasks, false);
    const doneTasks = new Set<string>(); // 001 not done yet

    const result = enforceWaveDependency(graph, ['001', '002'], doneTasks);

    expect(result.eligible).toEqual(['001']);
    expect(result.blocked).toEqual(['002']);
    expect(result.reasons.get('002')).toEqual(['001']);
  });

  it('should unblock task when all deps are done', () => {
    const tasks = [
      createTask('001'),
      createTask('002', ['001']),
    ];
    const graph = buildDependencyGraph(tasks, false);
    const doneTasks = new Set(['001']);

    const result = enforceWaveDependency(graph, ['002'], doneTasks);

    expect(result.eligible).toEqual(['002']);
    expect(result.blocked).toHaveLength(0);
  });

  it('should handle partial deps satisfied', () => {
    const tasks = [
      createTask('001'),
      createTask('002'),
      createTask('003', ['001', '002']),
    ];
    const graph = buildDependencyGraph(tasks, false);
    const doneTasks = new Set(['001']); // 002 not done

    const result = enforceWaveDependency(graph, ['003'], doneTasks);

    expect(result.eligible).toHaveLength(0);
    expect(result.blocked).toEqual(['003']);
    expect(result.reasons.get('003')).toEqual(['002']);
  });

  it('should handle empty candidate list', () => {
    const tasks = [createTask('001')];
    const graph = buildDependencyGraph(tasks, false);

    const result = enforceWaveDependency(graph, [], new Set());

    expect(result.eligible).toHaveLength(0);
    expect(result.blocked).toHaveLength(0);
  });
});

// ═══ cascadeBlockDependents ══════════════════════════════════════════

describe('cascadeBlockDependents', () => {

  it('should block direct dependents of failed task', () => {
    const tasks = [
      createTask('001'),
      createTask('002', ['001']),
      createTask('003', ['001']),
    ];
    const graph = buildDependencyGraph(tasks, false);

    const result = cascadeBlockDependents(graph, '001', tasks);

    expect(result.blockedTaskIds).toContain('002');
    expect(result.blockedTaskIds).toContain('003');
    expect(result.totalBlocked).toBe(2);
    expect(tasks.find(t => t.id === '002')!.status).toBe(TaskStatus.PAUSED);
    expect(tasks.find(t => t.id === '003')!.status).toBe(TaskStatus.PAUSED);
  });

  it('should cascade-block transitive dependents', () => {
    const tasks = [
      createTask('001'),
      createTask('002', ['001']),
      createTask('003', ['002']),
      createTask('004', ['003']),
    ];
    const graph = buildDependencyGraph(tasks, false);

    const result = cascadeBlockDependents(graph, '001', tasks);

    expect(result.blockedTaskIds).toEqual(['002', '003', '004']);
    expect(result.totalBlocked).toBe(3);
  });

  it('should NOT block tasks that do not depend on failed task', () => {
    const tasks = [
      createTask('001'),
      createTask('002', ['001']),
      createTask('003'), // independent
    ];
    const graph = buildDependencyGraph(tasks, false);

    const result = cascadeBlockDependents(graph, '001', tasks);

    expect(result.blockedTaskIds).toEqual(['002']);
    expect(tasks.find(t => t.id === '003')!.status).toBe(TaskStatus.PENDING);
  });

  it('should only block PENDING tasks — not EXECUTING ones', () => {
    const tasks = [
      createTask('001'),
      createTask('002', ['001'], [], TaskStatus.EXECUTING),
      createTask('003', ['001']),
    ];
    const graph = buildDependencyGraph(tasks, false);

    cascadeBlockDependents(graph, '001', tasks);

    // 002 was EXECUTING → stays EXECUTING (not paused)
    expect(tasks.find(t => t.id === '002')!.status).toBe(TaskStatus.EXECUTING);
    // 003 was PENDING → gets PAUSED
    expect(tasks.find(t => t.id === '003')!.status).toBe(TaskStatus.PAUSED);
  });

  it('should handle task with no dependents', () => {
    const tasks = [createTask('001'), createTask('002')];
    const graph = buildDependencyGraph(tasks, false);

    const result = cascadeBlockDependents(graph, '001', tasks);

    expect(result.blockedTaskIds).toHaveLength(0);
    expect(result.totalBlocked).toBe(0);
  });
});

// ═══ unblockDependents ═══════════════════════════════════════════════

describe('unblockDependents', () => {

  it('should unblock direct dependents when all deps are done', () => {
    const tasks = [
      createTask('001', [], [], TaskStatus.DONE),
      createTask('002', ['001'], [], TaskStatus.PAUSED),
    ];
    const graph = buildDependencyGraph(tasks, false);
    const doneTasks = new Set(['001']);

    const result = unblockDependents(graph, '001', tasks, doneTasks);

    expect(result.unblockedTaskIds).toEqual(['002']);
    expect(tasks.find(t => t.id === '002')!.status).toBe(TaskStatus.PENDING);
  });

  it('should NOT unblock if other deps are still missing', () => {
    const tasks = [
      createTask('001', [], [], TaskStatus.DONE),
      createTask('002'),
      createTask('003', ['001', '002'], [], TaskStatus.PAUSED),
    ];
    const graph = buildDependencyGraph(tasks, false);
    const doneTasks = new Set(['001']); // 002 not done

    const result = unblockDependents(graph, '001', tasks, doneTasks);

    expect(result.unblockedTaskIds).toHaveLength(0);
    expect(tasks.find(t => t.id === '003')!.status).toBe(TaskStatus.PAUSED);
  });

  it('should only unblock PAUSED tasks — not PENDING or EXECUTING', () => {
    const tasks = [
      createTask('001', [], [], TaskStatus.DONE),
      createTask('002', ['001'], [], TaskStatus.PENDING), // already pending
    ];
    const graph = buildDependencyGraph(tasks, false);
    const doneTasks = new Set(['001']);

    const result = unblockDependents(graph, '001', tasks, doneTasks);

    // 002 was already PENDING, not PAUSED → not "unblocked"
    expect(result.unblockedTaskIds).toHaveLength(0);
  });

  it('should handle task with no dependents', () => {
    const tasks = [
      createTask('001', [], [], TaskStatus.DONE),
    ];
    const graph = buildDependencyGraph(tasks, false);

    const result = unblockDependents(graph, '001', tasks, new Set(['001']));

    expect(result.unblockedTaskIds).toHaveLength(0);
  });

  it('should unblock multiple direct dependents at once', () => {
    const tasks = [
      createTask('001', [], [], TaskStatus.DONE),
      createTask('002', ['001'], [], TaskStatus.PAUSED),
      createTask('003', ['001'], [], TaskStatus.PAUSED),
    ];
    const graph = buildDependencyGraph(tasks, false);
    const doneTasks = new Set(['001']);

    const result = unblockDependents(graph, '001', tasks, doneTasks);

    expect(result.unblockedTaskIds).toContain('002');
    expect(result.unblockedTaskIds).toContain('003');
    expect(result.totalUnblocked).toBe(2);
  });
});

// ═══ Task 029: applyFailureCascade ════════════════════════════════════

describe('applyFailureCascade (Task 029)', () => {

  it('should cascade block dependents on CODE failure', () => {
    const tasks = [
      createTask('001'),
      createTask('002', ['001']),
      createTask('003', ['001']),
    ];
    const graph = buildDependencyGraph(tasks, false);

    const result = applyFailureCascade(graph, '001', tasks, {
      shouldCascade: true,
      failureCategory: 'CODE',
    });

    expect(result.cascadeApplied).toBe(true);
    expect(result.failureCategory).toBe('CODE');
    expect(result.blockedTaskIds).toContain('002');
    expect(result.blockedTaskIds).toContain('003');
    expect(result.totalBlocked).toBe(2);
    // Tasks should be PAUSED
    expect(tasks.find(t => t.id === '002')!.status).toBe(TaskStatus.PAUSED);
    expect(tasks.find(t => t.id === '003')!.status).toBe(TaskStatus.PAUSED);
  });

  it('should NOT cascade on RUNTIME failure — risk-taking retry policy', () => {
    const tasks = [
      createTask('001'),
      createTask('002', ['001']),
    ];
    const graph = buildDependencyGraph(tasks, false);

    const result = applyFailureCascade(graph, '001', tasks, {
      shouldCascade: false,
      failureCategory: 'RUNTIME',
    });

    expect(result.cascadeApplied).toBe(false);
    expect(result.failureCategory).toBe('RUNTIME');
    expect(result.blockedTaskIds).toHaveLength(0);
    expect(result.totalBlocked).toBe(0);
    // 002 stays PENDING — not blocked
    expect(tasks.find(t => t.id === '002')!.status).toBe(TaskStatus.PENDING);
  });

  it('should NOT cascade on AMBIGUOUS failure — risk-taking retry policy', () => {
    const tasks = [
      createTask('001'),
      createTask('002', ['001']),
      createTask('003', ['002']),
    ];
    const graph = buildDependencyGraph(tasks, false);

    const result = applyFailureCascade(graph, '001', tasks, {
      shouldCascade: false,
      failureCategory: 'AMBIGUOUS',
    });

    expect(result.cascadeApplied).toBe(false);
    expect(result.failureCategory).toBe('AMBIGUOUS');
    expect(result.blockedTaskIds).toHaveLength(0);
    // Neither 002 nor 003 should be blocked
    expect(tasks.find(t => t.id === '002')!.status).toBe(TaskStatus.PENDING);
    expect(tasks.find(t => t.id === '003')!.status).toBe(TaskStatus.PENDING);
  });

  it('should emit event log for each BLOCKED transition', () => {
    const tasks = [
      createTask('001'),
      createTask('002', ['001']),
      createTask('003', ['001']),
    ];
    const graph = buildDependencyGraph(tasks, false);
    const events: CascadeTransitionEvent[] = [];
    const onTransition = vi.fn((e: CascadeTransitionEvent) => events.push(e));

    applyFailureCascade(graph, '001', tasks, {
      shouldCascade: true,
      failureCategory: 'CODE',
      onTransition,
    });

    expect(onTransition).toHaveBeenCalledTimes(2);
    expect(events.every(e => e.transition === 'BLOCKED')).toBe(true);
    expect(events.every(e => e.triggerTaskId === '001')).toBe(true);
    expect(events.every(e => e.failureCategory === 'CODE')).toBe(true);
    expect(events.every(e => e.fromStatus === TaskStatus.PENDING)).toBe(true);
    expect(events.every(e => e.toStatus === TaskStatus.PAUSED)).toBe(true);

    const blockedIds = events.map(e => e.taskId);
    expect(blockedIds).toContain('002');
    expect(blockedIds).toContain('003');
  });

  it('should NOT emit events for RUNTIME failure (no cascade = no events)', () => {
    const tasks = [
      createTask('001'),
      createTask('002', ['001']),
    ];
    const graph = buildDependencyGraph(tasks, false);
    const onTransition = vi.fn();

    applyFailureCascade(graph, '001', tasks, {
      shouldCascade: false,
      failureCategory: 'RUNTIME',
      onTransition,
    });

    expect(onTransition).not.toHaveBeenCalled();
  });

  it('should be idempotent — calling cascade twice does not double-block', () => {
    const tasks = [
      createTask('001'),
      createTask('002', ['001']),
    ];
    const graph = buildDependencyGraph(tasks, false);

    // First cascade: 002 goes PENDING → PAUSED
    const first = applyFailureCascade(graph, '001', tasks, {
      shouldCascade: true,
      failureCategory: 'CODE',
    });
    expect(first.totalBlocked).toBe(1);
    expect(tasks.find(t => t.id === '002')!.status).toBe(TaskStatus.PAUSED);

    // Second cascade: 002 is already PAUSED → not re-blocked (already blocked)
    const events: CascadeTransitionEvent[] = [];
    const second = applyFailureCascade(graph, '001', tasks, {
      shouldCascade: true,
      failureCategory: 'CODE',
      onTransition: (e) => events.push(e),
    });

    // BFS still finds 002 in blockedTaskIds but status mutation check prevents re-emission
    // The blockedTaskIds list may still contain 002 (it's in the transitive set),
    // but the onTransition callback should NOT fire (task not PENDING anymore)
    expect(events).toHaveLength(0);
    expect(tasks.find(t => t.id === '002')!.status).toBe(TaskStatus.PAUSED);
  });

  it('should emit UNBLOCKED events via unblockDependents onTransition callback', () => {
    const tasks = [
      createTask('001', [], [], TaskStatus.DONE),
      createTask('002', ['001'], [], TaskStatus.PAUSED),
      createTask('003', ['001'], [], TaskStatus.PAUSED),
    ];
    const graph = buildDependencyGraph(tasks, false);
    const events: CascadeTransitionEvent[] = [];
    const onTransition = vi.fn((e: CascadeTransitionEvent) => events.push(e));

    const result = unblockDependents(graph, '001', tasks, new Set(['001']), onTransition);

    expect(result.totalUnblocked).toBe(2);
    expect(onTransition).toHaveBeenCalledTimes(2);
    expect(events.every(e => e.transition === 'UNBLOCKED')).toBe(true);
    expect(events.every(e => e.triggerTaskId === '001')).toBe(true);
    expect(events.every(e => e.fromStatus === TaskStatus.PAUSED)).toBe(true);
    expect(events.every(e => e.toStatus === TaskStatus.PENDING)).toBe(true);
    expect(events.map(e => e.taskId)).toContain('002');
    expect(events.map(e => e.taskId)).toContain('003');
  });

  it('should handle task with no dependents — cascade returns empty', () => {
    const tasks = [
      createTask('001'),
      createTask('002'),
    ];
    const graph = buildDependencyGraph(tasks, false);

    const result = applyFailureCascade(graph, '001', tasks, {
      shouldCascade: true,
      failureCategory: 'CODE',
    });

    expect(result.cascadeApplied).toBe(true);
    expect(result.blockedTaskIds).toHaveLength(0);
    expect(result.totalBlocked).toBe(0);
  });

  it('should cascade transitively — grandchild tasks get blocked too', () => {
    // 001 → 002 → 003 → 004 (linear chain)
    const tasks = [
      createTask('001'),
      createTask('002', ['001']),
      createTask('003', ['002']),
      createTask('004', ['003']),
    ];
    const graph = buildDependencyGraph(tasks, false);

    const result = applyFailureCascade(graph, '001', tasks, {
      shouldCascade: true,
      failureCategory: 'CODE',
    });

    expect(result.cascadeApplied).toBe(true);
    expect(result.totalBlocked).toBe(3);
    expect(tasks.find(t => t.id === '002')!.status).toBe(TaskStatus.PAUSED);
    expect(tasks.find(t => t.id === '003')!.status).toBe(TaskStatus.PAUSED);
    expect(tasks.find(t => t.id === '004')!.status).toBe(TaskStatus.PAUSED);
    // 001 itself is not in blockedTaskIds (it's the trigger)
    expect(result.blockedTaskIds).not.toContain('001');
  });
});

// ═══ Integration Scenario — Sprint 139 ══════════════════════════════

describe('Integration: full sprint lifecycle', () => {

  it('should enforce correct wave ordering with deps + collisions', () => {
    // Sprint 139 scenario: Wave 2 Task 14 must not run before Wave 1 Task 13
    const tasks = [
      createTask('139-013', [], ['src/a.ts']),
      createTask('139-014', ['139-013'], ['src/b.ts']),
      createTask('139-015', [], ['src/c.ts']),
    ];

    const graph = buildDependencyGraph(tasks, true);

    // 139-013 and 139-015 in wave 0 (no deps)
    // 139-014 in wave 1 (depends on 139-013)
    expect(graph.waveAssignment.get('139-013')).toBe(0);
    expect(graph.waveAssignment.get('139-015')).toBe(0);
    expect(graph.waveAssignment.get('139-014')).toBe(1);

    // Before 139-013 is done, 139-014 should be blocked
    const enforcement1 = enforceWaveDependency(
      graph,
      ['139-013', '139-014', '139-015'],
      new Set<string>(),
    );
    expect(enforcement1.eligible).toContain('139-013');
    expect(enforcement1.eligible).toContain('139-015');
    expect(enforcement1.blocked).toContain('139-014');

    // After 139-013 completes, 139-014 becomes eligible
    const enforcement2 = enforceWaveDependency(
      graph,
      ['139-014'],
      new Set(['139-013']),
    );
    expect(enforcement2.eligible).toEqual(['139-014']);
    expect(enforcement2.blocked).toHaveLength(0);
  });

  it('should cascade block and then unblock on resolution', () => {
    const tasks = [
      createTask('001'),
      createTask('002', ['001']),
      createTask('003', ['002']),
    ];
    const graph = buildDependencyGraph(tasks, false);

    // 001 fails → cascade
    const cascade = cascadeBlockDependents(graph, '001', tasks);
    expect(cascade.blockedTaskIds).toEqual(['002', '003']);
    expect(tasks[1]!.status).toBe(TaskStatus.PAUSED);
    expect(tasks[2]!.status).toBe(TaskStatus.PAUSED);

    // Fix worker resolves 001
    tasks[0]!.status = TaskStatus.DONE;
    const doneTasks = new Set(['001']);

    const unblock = unblockDependents(graph, '001', tasks, doneTasks);

    // Only 002 gets directly unblocked (its deps are all DONE)
    expect(unblock.unblockedTaskIds).toEqual(['002']);
    expect(tasks[1]!.status).toBe(TaskStatus.PENDING);
    // 003 stays PAUSED — its dep (002) is not DONE yet
    expect(tasks[2]!.status).toBe(TaskStatus.PAUSED);

    // After 002 completes → unblock 003
    tasks[1]!.status = TaskStatus.DONE;
    doneTasks.add('002');
    const unblock2 = unblockDependents(graph, '002', tasks, doneTasks);
    expect(unblock2.unblockedTaskIds).toEqual(['003']);
    expect(tasks[2]!.status).toBe(TaskStatus.PENDING);
  });
});

// ═══ Task 030: Graph Persistence — serializeDependencyGraph ══════════

describe('serializeDependencyGraph + deserializeDependencyGraph', () => {
  it('round-trip: serialize then deserialize preserves graph structure', () => {
    const tasks = [
      createTask('001'),
      createTask('002', ['001']),
      createTask('003', ['001']),
      createTask('004', ['002', '003']),
    ];
    const graph = buildDependencyGraph(tasks, false);

    const serialized = serializeDependencyGraph(graph, 'sprint-139');
    const restored = deserializeDependencyGraph(serialized);

    // Wave structure preserved
    expect(restored.waves).toHaveLength(graph.waves.length);
    expect(restored.hasCycle).toBe(graph.hasCycle);
    expect(restored.cycleTaskIds).toEqual(graph.cycleTaskIds);

    // Dependencies preserved (Map<string, Set<string>>)
    for (const [id, deps] of graph.dependencies) {
      const restoredDeps = restored.dependencies.get(id);
      expect(restoredDeps).toBeDefined();
      expect([...restoredDeps!].sort()).toEqual([...deps].sort());
    }

    // Dependents preserved (reverse edges)
    for (const [id, deps] of graph.dependents) {
      const restoredDeps = restored.dependents.get(id);
      expect(restoredDeps).toBeDefined();
      expect([...restoredDeps!].sort()).toEqual([...deps].sort());
    }

    // Wave assignment preserved
    for (const [id, wave] of graph.waveAssignment) {
      expect(restored.waveAssignment.get(id)).toBe(wave);
    }
  });

  it('serialized format contains sprintId and persistedAt', () => {
    const tasks = [createTask('001'), createTask('002', ['001'])];
    const graph = buildDependencyGraph(tasks, false);
    const serialized = serializeDependencyGraph(graph, 'sprint-139');

    expect(serialized.sprintId).toBe('sprint-139');
    expect(typeof serialized.persistedAt).toBe('string');
    expect(() => new Date(serialized.persistedAt)).not.toThrow();
  });

  it('round-trip: cycle graph preserves hasCycle and cycleTaskIds', () => {
    const tasks = [
      createTask('A', ['C']),
      createTask('B', ['A']),
      createTask('C', ['B']),
    ];
    const graph = buildDependencyGraph(tasks, false);
    expect(graph.hasCycle).toBe(true);

    const serialized = serializeDependencyGraph(graph, 'sprint-cycle');
    const restored = deserializeDependencyGraph(serialized);

    expect(restored.hasCycle).toBe(true);
    expect(restored.cycleTaskIds.sort()).toEqual(['A', 'B', 'C']);
  });

  it('empty graph round-trips correctly', () => {
    const graph = buildDependencyGraph([], false);
    const serialized = serializeDependencyGraph(graph, 'sprint-empty');
    const restored = deserializeDependencyGraph(serialized);

    expect(restored.waves).toHaveLength(0);
    expect(restored.hasCycle).toBe(false);
    expect(restored.dependencies.size).toBe(0);
  });
});

// ═══ Task 030: generateMermaidDiagram ════════════════════════════════

describe('generateMermaidDiagram', () => {
  it('starts with "graph TD"', () => {
    const tasks = [createTask('001'), createTask('002', ['001'])];
    const graph = buildDependencyGraph(tasks, false);
    const mmd = generateMermaidDiagram(graph);
    expect(mmd.startsWith('graph TD')).toBe(true);
  });

  it('includes node definitions with wave labels', () => {
    const tasks = [createTask('001'), createTask('002', ['001'])];
    const graph = buildDependencyGraph(tasks, false);
    const mmd = generateMermaidDiagram(graph);

    expect(mmd).toContain('001');
    expect(mmd).toContain('002');
    expect(mmd).toContain('(W0)');
    expect(mmd).toContain('(W1)');
  });

  it('includes dependency edges (parent --> child)', () => {
    const tasks = [createTask('001'), createTask('002', ['001'])];
    const graph = buildDependencyGraph(tasks, false);
    const mmd = generateMermaidDiagram(graph);

    // Edge: 001 --> 002
    expect(mmd).toContain('001 --> 002');
  });

  it('includes classDef highlights for DONE and NO_GO status', () => {
    const tasks = [
      createTask('001', [], [], TaskStatus.DONE),
      createTask('002', ['001'], [], TaskStatus.NO_GO),
      createTask('003', ['001']),
    ];
    const graph = buildDependencyGraph(tasks, false);
    const statusMap = new Map<string, TaskStatus>([
      ['001', TaskStatus.DONE],
      ['002', TaskStatus.NO_GO],
    ]);

    const mmd = generateMermaidDiagram(graph, statusMap);

    expect(mmd).toContain('classDef done');
    expect(mmd).toContain('classDef nogo');
    expect(mmd).toContain('class 001 done');
    expect(mmd).toContain('class 002 nogo');
  });

  it('does not emit empty classDef when all tasks are PENDING', () => {
    const tasks = [createTask('001'), createTask('002', ['001'])];
    const graph = buildDependencyGraph(tasks, false);
    const statusMap = new Map<string, TaskStatus>([
      ['001', TaskStatus.PENDING],
      ['002', TaskStatus.PENDING],
    ]);

    const mmd = generateMermaidDiagram(graph, statusMap);

    expect(mmd).not.toContain('classDef done');
    expect(mmd).not.toContain('classDef nogo');
  });

  it('handles hyphens in task IDs safely (replace with underscores)', () => {
    const tasks = [
      createTask('139-001'),
      createTask('139-002', ['139-001']),
    ];
    const graph = buildDependencyGraph(tasks, false);
    const mmd = generateMermaidDiagram(graph);

    // Hyphens replaced with underscores in node IDs
    expect(mmd).toContain('139_001');
    expect(mmd).toContain('139_002');
    // But label still shows original ID
    expect(mmd).toContain('"139-001');
    expect(mmd).toContain('"139-002');
  });
});

// ═══ Task 030: persistDependencyGraph + loadDependencyGraph ══════════

describe('persistDependencyGraph + loadDependencyGraph', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = join(tmpdir(), `deckent-depgraph-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(tmpRoot, '.deckent'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('JSON persist: writes .deckent/sprint-NNN-depgraph.json', () => {
    const tasks = [createTask('001'), createTask('002', ['001'])];
    const graph = buildDependencyGraph(tasks, false);

    const ok = persistDependencyGraph(tmpRoot, 'sprint-139', graph);
    expect(ok).toBe(true);

    const jsonPath = join(tmpRoot, '.deckent', 'sprint-139-depgraph.json');
    expect(existsSync(jsonPath)).toBe(true);
  });

  it('Mermaid persist: writes .deckent/sprint-NNN-depgraph.mmd', () => {
    const tasks = [createTask('001'), createTask('002', ['001'])];
    const graph = buildDependencyGraph(tasks, false);

    persistDependencyGraph(tmpRoot, 'sprint-139', graph);

    const mmdPath = join(tmpRoot, '.deckent', 'sprint-139-depgraph.mmd');
    expect(existsSync(mmdPath)).toBe(true);
    const content = readFileSync(mmdPath, 'utf-8');
    expect(content.startsWith('graph TD')).toBe(true);
  });

  it('JSON content is valid JSON with correct structure', () => {
    const tasks = [
      createTask('A'),
      createTask('B', ['A']),
      createTask('C', ['A']),
    ];
    const graph = buildDependencyGraph(tasks, false);

    persistDependencyGraph(tmpRoot, 'sprint-139', graph);

    const jsonPath = join(tmpRoot, '.deckent', 'sprint-139-depgraph.json');
    const raw = readFileSync(jsonPath, 'utf-8');
    const parsed = JSON.parse(raw);

    expect(parsed.sprintId).toBe('sprint-139');
    expect(parsed.hasCycle).toBe(false);
    expect(parsed.waves).toHaveLength(2);
    expect(typeof parsed.persistedAt).toBe('string');
  });

  it('loadDependencyGraph returns null when file does not exist', () => {
    const result = loadDependencyGraph(tmpRoot, 'sprint-nonexistent');
    expect(result).toBeNull();
  });

  it('loadDependencyGraph restores graph matching original', () => {
    const tasks = [
      createTask('001'),
      createTask('002', ['001']),
      createTask('003', ['001']),
      createTask('004', ['002', '003']),
    ];
    const graph = buildDependencyGraph(tasks, false);

    persistDependencyGraph(tmpRoot, 'sprint-139', graph);
    const loaded = loadDependencyGraph(tmpRoot, 'sprint-139');

    expect(loaded).not.toBeNull();
    expect(loaded!.hasCycle).toBe(false);
    expect(loaded!.waves).toHaveLength(graph.waves.length);
    expect(loaded!.waveAssignment.get('001')).toBe(0);
    expect(loaded!.waveAssignment.get('002')).toBe(1);
    expect(loaded!.waveAssignment.get('003')).toBe(1);
    expect(loaded!.waveAssignment.get('004')).toBe(2);

    // Dependencies restored correctly
    const deps004 = loaded!.dependencies.get('004');
    expect(deps004?.has('002')).toBe(true);
    expect(deps004?.has('003')).toBe(true);
  });

  it('persist is fail-safe — does not throw even on I/O error', () => {
    // Use a file-as-directory scenario to trigger I/O error:
    // Create a regular FILE at the path where .deckent dir should be
    const { writeFileSync: wfs } = require('node:fs') as typeof import('node:fs');
    wfs(join(tmpRoot, '.deckent-block'), 'not a dir', 'utf-8');

    // Root pointing at the file (so mkdirSync inside .deckent will fail
    // because the file already exists where the .deckent dir should be)
    const fakeRoot = join(tmpRoot, '.deckent-block');
    const tasks = [createTask('001')];
    const graph = buildDependencyGraph(tasks, false);

    // Should not throw regardless
    expect(() => {
      persistDependencyGraph(fakeRoot, 'sprint-139', graph);
    }).not.toThrow();
    // Returns false because .deckent dir creation fails (file in the way)
    const result = persistDependencyGraph(fakeRoot, 'sprint-139', graph);
    expect(result).toBe(false);
  });

  it('state consistency: loaded graph enforces same wave ordering as original', () => {
    const tasks = [
      createTask('001'),
      createTask('002', ['001']),
      createTask('003', ['002']),
    ];
    const original = buildDependencyGraph(tasks, false);
    persistDependencyGraph(tmpRoot, 'sprint-139', original);

    const loaded = loadDependencyGraph(tmpRoot, 'sprint-139')!;

    // Enforce wave dep using loaded graph — should behave identically to original
    const withNoDone = enforceWaveDependency(loaded, ['001', '002', '003'], new Set());
    expect(withNoDone.eligible).toEqual(['001']);
    expect(withNoDone.blocked).toContain('002');
    expect(withNoDone.blocked).toContain('003');

    const withOneDone = enforceWaveDependency(loaded, ['002', '003'], new Set(['001']));
    expect(withOneDone.eligible).toEqual(['002']);
    expect(withOneDone.blocked).toEqual(['003']);
  });
});
