import { describe, it, expect } from 'vitest';
import { detectDeadlocks } from '../../src/monitor/auditor.js';
import type { Task } from '../../src/core/types.js';
import { TaskStatus } from '../../src/core/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeTask(id: string, deps: string[] = [], overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    description: `Description for ${id}`,
    model: 'opus',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'Test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: deps,
    goNogo: { goCriteria: 'Tests pass', noGoCriteria: 'Tests fail', techDebtAcceptable: 'OK' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-025',
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('detectDeadlocks — Kahn algorithm', () => {
  it('detects A → B → C → A cycle', () => {
    const tasks = [
      makeTask('A', ['C']),
      makeTask('B', ['A']),
      makeTask('C', ['B']),
    ];
    const violations = detectDeadlocks(tasks);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].type).toBe('circular_dependency');
    expect(violations[0].detail).toContain('A');
    expect(violations[0].detail).toContain('B');
    expect(violations[0].detail).toContain('C');
  });

  it('detects self-dependency (A → A)', () => {
    const tasks = [makeTask('A', ['A'])];
    const violations = detectDeadlocks(tasks);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].type).toBe('circular_dependency');
    expect(violations[0].detail).toContain('A');
  });

  it('returns no violations for independent tasks', () => {
    const tasks = [
      makeTask('A', []),
      makeTask('B', []),
      makeTask('C', []),
    ];
    const violations = detectDeadlocks(tasks);
    expect(violations).toEqual([]);
  });

  it('linear chain A → B → C is NOT a deadlock', () => {
    const tasks = [
      makeTask('A', []),
      makeTask('B', ['A']),
      makeTask('C', ['B']),
    ];
    const violations = detectDeadlocks(tasks);
    expect(violations).toEqual([]);
  });

  it('diamond dependency A→B, A→C, B→D, C→D is NOT a deadlock', () => {
    const tasks = [
      makeTask('A', []),
      makeTask('B', ['A']),
      makeTask('C', ['A']),
      makeTask('D', ['B', 'C']),
    ];
    const violations = detectDeadlocks(tasks);
    expect(violations).toEqual([]);
  });

  it('detects two-node cycle A → B → A', () => {
    const tasks = [
      makeTask('A', ['B']),
      makeTask('B', ['A']),
    ];
    const violations = detectDeadlocks(tasks);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].type).toBe('circular_dependency');
  });

  it('empty task list returns no deadlocks', () => {
    const violations = detectDeadlocks([]);
    expect(violations).toEqual([]);
  });

  it('single task with no dependencies returns no deadlocks', () => {
    const tasks = [makeTask('solo', [])];
    const violations = detectDeadlocks(tasks);
    expect(violations).toEqual([]);
  });

  it('handles 10+ tasks without cycle correctly', () => {
    const tasks = Array.from({ length: 12 }, (_, i) =>
      makeTask(`task-${i}`, i > 0 ? [`task-${i - 1}`] : []),
    );
    const violations = detectDeadlocks(tasks);
    expect(violations).toEqual([]);
  });

  it('handles 10+ tasks with a cycle among a subset', () => {
    // Linear: task-0 → task-1 → ... → task-7
    // Cycle: task-8 → task-9 → task-10 → task-8
    const tasks = [
      ...Array.from({ length: 8 }, (_, i) =>
        makeTask(`task-${i}`, i > 0 ? [`task-${i - 1}`] : []),
      ),
      makeTask('task-8', ['task-10']),
      makeTask('task-9', ['task-8']),
      makeTask('task-10', ['task-9']),
    ];
    const violations = detectDeadlocks(tasks);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].detail).toContain('task-8');
    expect(violations[0].detail).toContain('task-9');
    expect(violations[0].detail).toContain('task-10');
  });

  it('complex graph: mixed cycles and non-cycles', () => {
    // Non-cycle part: X → Y → Z
    // Cycle part: A → B → C → A
    const tasks = [
      makeTask('X', []),
      makeTask('Y', ['X']),
      makeTask('Z', ['Y']),
      makeTask('A', ['C']),
      makeTask('B', ['A']),
      makeTask('C', ['B']),
    ];
    const violations = detectDeadlocks(tasks);
    expect(violations.length).toBeGreaterThan(0);
    // Cyclic nodes should include A, B, C but NOT X, Y, Z
    const cyclicIds = violations[0].agentId.split(',');
    expect(cyclicIds).toContain('A');
    expect(cyclicIds).toContain('B');
    expect(cyclicIds).toContain('C');
    expect(cyclicIds).not.toContain('X');
    expect(cyclicIds).not.toContain('Y');
    expect(cyclicIds).not.toContain('Z');
  });

  it('violation type is always circular_dependency', () => {
    const tasks = [
      makeTask('A', ['B']),
      makeTask('B', ['A']),
    ];
    const violations = detectDeadlocks(tasks);
    for (const v of violations) {
      expect(v.type).toBe('circular_dependency');
    }
  });

  it('violation has a timestamp', () => {
    const tasks = [
      makeTask('A', ['B']),
      makeTask('B', ['A']),
    ];
    const violations = detectDeadlocks(tasks);
    expect(violations[0].timestamp).toBeDefined();
    expect(typeof violations[0].timestamp).toBe('string');
  });
});
