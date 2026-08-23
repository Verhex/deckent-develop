import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  parseStructuredDirectives,
  createTask,
  normalizeStructuredTaskDependencies,
} from '../../src/orchestra/task-builder.js';
import type { Task } from '../../src/core/types.js';

// ─── Sprint 359 born-465 — DEP-NORMALIZE ──────────────────────────────────
//
// Bug: the structured-plan path (sprint-planner.ts `planSprint`) writes
// title-prefix/"Task N"/integer dependency refs from DIRECTIVES.md straight
// through to `createTask({ dependencies })` with NO resolution step — unlike
// the AI-planner path (`normalizePlannerDependencies`, planner.ts:904), which
// already resolves refs to slot-ids before the task list is finalized. Three
// runtime layers then disagree on how to read a raw ref: wave-dispatch
// resolves it inline, the FIFO scheduler drops it, planContinuous stalls
// forever.
//
// Fix: `normalizeStructuredTaskDependencies` (task-builder.ts) — called once
// the full structured-plan task list is built — resolves every task's
// `dependencies` to slot-ids in place, reusing `resolveTaskDependenciesLoud`
// (born-458/358-010) so unresolved refs keep the exact same WARN+drop /
// strict-throw contract already proven for that helper.

const SLOT_ID_RE = /^\d{1,4}-\d{1,4}$/;

/**
 * Mirrors sprint-planner.ts's own structured-plan loop (planSprint, the
 * `directiveSources` → `createTask` block): parses DIRECTIVES via the real
 * `parseStructuredDirectives`, then builds each task via the real
 * `createTask`. The resulting Task objects are exactly what gets
 * `JSON.stringify`'d to `.tasks/task-*.json` in production.
 */
function buildStructuredTasks(directives: string, sprintId = 'sprint-465'): Task[] {
  const parsed = parseStructuredDirectives(directives);
  let seq = 1;
  return parsed.map(p => createTask({
    title: p.title,
    description: p.description,
    model: 'claude-sonnet-5',
    effort: 'normal',
    priority: p.priority ?? 'NORMAL',
    reason: 'test fixture',
    scope: p.scope,
    dependencies: p.dependencies ?? [],
    goNogo: { goCriteria: 'n/a', noGoCriteria: 'n/a', techDebtAcceptable: '' },
    sprintId,
  }, seq++));
}

const TITLE_PREFIX_FIXTURE = `# DIRECTIVES — born-465 fixture

## Goal: normalize test

---

## Task 1: W1-1 — Build the base module
- Files: src/orchestra/foo.ts
- Scope: src/orchestra/

### Description
Base module, no dependencies.

## Task 2: W1-2 — Depends on the base module
- Dependencies: W1-1
- Files: src/orchestra/bar.ts
- Scope: src/orchestra/

### Description
Depends on Task 1 via title-prefix ref.
`;

describe('normalizeStructuredTaskDependencies — title-prefix refs (born-465)', () => {
  it('normalizes a title-prefix ref into the written task-JSON as a slot-id (goCriteria)', () => {
    const tasks = buildStructuredTasks(TITLE_PREFIX_FIXTURE);
    expect(tasks).toHaveLength(2);
    // Raw, unresolved before normalize — proves the bug premise.
    expect(tasks[1]!.dependencies).toEqual(['W1-1']);

    normalizeStructuredTaskDependencies(tasks);

    expect(tasks[1]!.dependencies).toEqual([tasks[0]!.id]);
    expect(tasks[1]!.dependencies[0]).toMatch(SLOT_ID_RE);
  });

  it('mutates the task objects in place (same array references)', () => {
    const tasks = buildStructuredTasks(TITLE_PREFIX_FIXTURE);
    const secondTaskRef = tasks[1]!;
    normalizeStructuredTaskDependencies(tasks);
    expect(tasks[1]).toBe(secondTaskRef);
    expect(secondTaskRef.dependencies).toEqual([tasks[0]!.id]);
  });
});

describe('normalizeStructuredTaskDependencies — "Task N" / integer / slot-id ref styles', () => {
  it('normalizes a "Task N" human-natural ref', () => {
    const content = `# DIRECTIVES — born-465 Task N fixture

## Goal: normalize test

---

## Task 1: First task
- Files: src/orchestra/a.ts
- Scope: src/orchestra/

### Description
First.

## Task 2: Second task
- Dependencies: Task 1
- Files: src/orchestra/b.ts
- Scope: src/orchestra/

### Description
Depends via "Task 1".
`;
    const tasks = buildStructuredTasks(content);
    normalizeStructuredTaskDependencies(tasks);
    expect(tasks[1]!.dependencies).toEqual([tasks[0]!.id]);
  });

  it('normalizes a pure-integer (0-based index) ref', () => {
    const content = `# DIRECTIVES — born-465 integer fixture

## Goal: normalize test

---

## Task 1: First task
- Files: src/orchestra/a.ts
- Scope: src/orchestra/

### Description
First.

## Task 2: Second task
- Dependencies: 0
- Files: src/orchestra/b.ts
- Scope: src/orchestra/

### Description
Depends via 0-based index "0".
`;
    const tasks = buildStructuredTasks(content);
    normalizeStructuredTaskDependencies(tasks);
    expect(tasks[1]!.dependencies).toEqual([tasks[0]!.id]);
  });

  it('leaves an already-correct plan-slot id ref resolved to itself', () => {
    const tasks = buildStructuredTasks(TITLE_PREFIX_FIXTURE);
    const firstId = tasks[0]!.id;
    tasks[1]!.dependencies = [firstId];

    normalizeStructuredTaskDependencies(tasks);

    expect(tasks[1]!.dependencies).toEqual([firstId]);
  });

  it('keeps timestamp-backed canonical ids across a second normalization pass', () => {
    const tasks = buildStructuredTasks(TITLE_PREFIX_FIXTURE, 'sprint-1780659451555');

    normalizeStructuredTaskDependencies(tasks);
    const firstPass = [...tasks[1]!.dependencies];
    normalizeStructuredTaskDependencies(tasks);

    expect(firstPass).toEqual(['1780659451555-001']);
    expect(tasks[1]!.dependencies).toEqual(firstPass);
  });

  it('preserves a timestamp-id high-fan-in barrier during idempotent normalization', () => {
    const tasks = buildStructuredTasks(TITLE_PREFIX_FIXTURE, 'sprint-1780659451555');
    const barrier = createTask({
      title: 'T17-BRIEF-INTEGRATION',
      description: 'Integrate every predecessor.',
      model: 'claude-sonnet-5',
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'test fixture',
      scope: { directories: [], filesRead: [], filesWrite: ['brief.md'] },
      dependencies: tasks.map(task => task.id),
      goNogo: { goCriteria: 'n/a', noGoCriteria: 'n/a', techDebtAcceptable: '' },
      sprintId: 'sprint-1780659451555',
    }, 3);
    tasks.push(barrier);

    normalizeStructuredTaskDependencies(tasks);

    expect(barrier.dependencies).toEqual(['1780659451555-001', '1780659451555-002']);
  });

  it('leaves tasks with no dependencies untouched', () => {
    const tasks = buildStructuredTasks(TITLE_PREFIX_FIXTURE);
    expect(tasks[0]!.dependencies).toEqual([]);
    normalizeStructuredTaskDependencies(tasks);
    expect(tasks[0]!.dependencies).toEqual([]);
  });
});

describe('normalizeStructuredTaskDependencies — unresolved refs (WARN+drop / strict-throw, 358-010 contract)', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    stderrSpy?.mockRestore();
  });

  it('WARNs to stderr and drops an unresolvable ref (non-strict default)', () => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const tasks = buildStructuredTasks(TITLE_PREFIX_FIXTURE);
    tasks[1]!.dependencies = ['GHOST-REF'];

    const result = normalizeStructuredTaskDependencies(tasks);

    expect(tasks[1]!.dependencies).toEqual([]);
    expect(result.warnings).toEqual([
      {
        taskId: tasks[1]!.id,
        ref: 'GHOST-REF',
        message: `[deckent] WARN: dependency ref 'GHOST-REF' çözülemedi (task ${tasks[1]!.id})`,
      },
    ]);
    expect(stderrSpy).toHaveBeenCalledTimes(1);
  });

  it('aggregates warnings across multiple tasks', () => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const tasks = buildStructuredTasks(TITLE_PREFIX_FIXTURE);
    tasks[0]!.dependencies = ['BOGUS-1'];
    tasks[1]!.dependencies = ['W1-1', 'BOGUS-2'];

    const result = normalizeStructuredTaskDependencies(tasks);

    expect(tasks[0]!.dependencies).toEqual([]);
    expect(tasks[1]!.dependencies).toEqual([tasks[0]!.id]);
    expect(result.warnings.map(w => w.ref)).toEqual(['BOGUS-1', 'BOGUS-2']);
    expect(stderrSpy).toHaveBeenCalledTimes(2);
  });

  it('throws on the first unresolved ref under { strict: true }', () => {
    const tasks = buildStructuredTasks(TITLE_PREFIX_FIXTURE);
    tasks[1]!.dependencies = ['GHOST-REF'];

    expect(() => normalizeStructuredTaskDependencies(tasks, { strict: true })).toThrow(
      `[deckent] WARN: dependency ref 'GHOST-REF' çözülemedi (task ${tasks[1]!.id})`,
    );
  });

  it('does not throw under strict mode when every ref resolves', () => {
    const tasks = buildStructuredTasks(TITLE_PREFIX_FIXTURE);
    expect(() => normalizeStructuredTaskDependencies(tasks, { strict: true })).not.toThrow();
    expect(tasks[1]!.dependencies).toEqual([tasks[0]!.id]);
  });
});
