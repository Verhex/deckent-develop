import { describe, it, expect } from 'vitest';
import {
  getRubric,
  detectTaskType,
  AUDIT_RUBRIC,
  DOC_WRITE_RUBRIC,
  CODE_RUBRIC,
} from '../../src/orchestra/rubric-registry.js';
import { createTask } from '../../src/orchestra/task-builder.js';
import type { CreateTaskParams } from '../../src/orchestra/task-builder.js';
import { TaskStatus, type Task } from '../../src/core/types.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '239-test',
    title: 'Work-model consumer test task',
    description: 'Test task for canonical TaskKind consumption',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'minor' },
    status: TaskStatus.PENDING,
    ...overrides,
  };
}

function makeCreateParams(scopeOverride: Partial<Task['scope']> = {}): CreateTaskParams {
  return {
    title: 'Test task',
    description: 'A test description',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: {
      directories: ['src/orchestra/'],
      filesRead: [],
      filesWrite: ['src/orchestra/rubric-registry.ts'],
      ...scopeOverride,
    },
    dependencies: [],
    goNogo: { goCriteria: 'done', noGoCriteria: 'fail', techDebtAcceptable: 'none' },
    sprintId: 'sprint-239',
  };
}

// ─── (a) Canonical path: task.type set → rubric via taskKindToRubric ────────

describe('getRubric — canonical TaskKind path (task.type set)', () => {
  it('(a1) task.type=code-development → CODE_RUBRIC', () => {
    const task = makeTask({ type: 'code-development' });
    expect(getRubric(task)).toBe(CODE_RUBRIC);
  });

  it('(a2) task.type=documentation → DOC_WRITE_RUBRIC', () => {
    const task = makeTask({ type: 'documentation' });
    expect(getRubric(task)).toBe(DOC_WRITE_RUBRIC);
  });

  it('(a3) task.type=audit → AUDIT_RUBRIC', () => {
    const task = makeTask({ type: 'audit' });
    expect(getRubric(task)).toBe(AUDIT_RUBRIC);
  });
});

// ─── (b) Fallback path: task.type absent → detectTaskType scope-shape ────────

describe('getRubric — fallback path (task.type absent)', () => {
  it('(b1) no type, code scope → detectTaskType fallback → CODE_RUBRIC', () => {
    const task = makeTask({
      scope: {
        directories: ['src/orchestra/'],
        filesRead: [],
        filesWrite: ['src/orchestra/rubric-registry.ts'],
      },
    });
    // Explicit: no `type` field set
    expect(task.type).toBeUndefined();
    expect(getRubric(task)).toBe(CODE_RUBRIC);
  });

  it('(b2) no type, doc scope → fallback → DOC_WRITE_RUBRIC', () => {
    const task = makeTask({
      scope: {
        directories: ['docs/smoke/'],
        filesRead: [],
        filesWrite: ['docs/smoke/guide.md'],
      },
    });
    expect(task.type).toBeUndefined();
    expect(getRubric(task)).toBe(DOC_WRITE_RUBRIC);
  });

  it('(b3) no type, audit scope → fallback → AUDIT_RUBRIC', () => {
    const task = makeTask({
      scope: {
        directories: ['docs/audits/sprint-239/'],
        filesRead: [],
        filesWrite: ['docs/audits/sprint-239/T-001.md'],
      },
    });
    expect(task.type).toBeUndefined();
    expect(getRubric(task)).toBe(AUDIT_RUBRIC);
  });
});

// ─── (c) Regression-equality: new-way (type set) == old-way (fallback) ───────

describe('getRubric — regression-equality: new-way == old-way', () => {
  it('(c1) code task: canonical type set == scope-shape fallback', () => {
    const scope = {
      directories: ['src/orchestra/'],
      filesRead: [] as string[],
      filesWrite: ['src/orchestra/rubric-registry.ts'],
    };
    const oldWayTask = makeTask({ scope });
    const newWayTask = makeTask({ scope, type: 'code-development' });

    const oldRubric = getRubric(oldWayTask);
    const newRubric = getRubric(newWayTask);

    expect(newRubric).toBe(oldRubric);
  });

  it('(c2) doc task: canonical type set == scope-shape fallback', () => {
    const scope = {
      directories: ['docs/smoke/'],
      filesRead: [] as string[],
      filesWrite: ['docs/smoke/guide.md'],
    };
    const oldWayTask = makeTask({ scope });
    const newWayTask = makeTask({ scope, type: 'documentation' });

    const oldRubric = getRubric(oldWayTask);
    const newRubric = getRubric(newWayTask);

    expect(newRubric).toBe(oldRubric);
  });

  it('(c3) audit task: canonical type set == scope-shape fallback', () => {
    const scope = {
      directories: ['docs/audits/sprint-239/'],
      filesRead: [] as string[],
      filesWrite: ['docs/audits/sprint-239/T-001.md'],
    };
    const oldWayTask = makeTask({ scope });
    const newWayTask = makeTask({ scope, type: 'audit' });

    const oldRubric = getRubric(oldWayTask);
    const newRubric = getRubric(newWayTask);

    expect(newRubric).toBe(oldRubric);
  });
});

// ─── (d) task-builder: createTask produces task with type set ─────────────────

describe('createTask — sets task.type (canonical TaskKind)', () => {
  it('(d1) code task (src/ scope) → type=code-development', () => {
    const params = makeCreateParams({
      directories: ['src/orchestra/'],
      filesWrite: ['src/orchestra/rubric-registry.ts'],
    });
    const task = createTask(params, 1);
    expect(task.type).toBe('code-development');
  });

  it('(d2) doc task (docs/ scope) → type=documentation', () => {
    const params = makeCreateParams({
      directories: ['docs/smoke/'],
      filesWrite: ['docs/smoke/guide.md'],
    });
    const task = createTask(params, 1);
    expect(task.type).toBe('documentation');
  });

  it('(d3) audit task (docs/audits/ scope) → type=audit', () => {
    const params = makeCreateParams({
      directories: ['docs/audits/sprint-239/'],
      filesWrite: ['docs/audits/sprint-239/T-001.md'],
    });
    const task = createTask(params, 1);
    expect(task.type).toBe('audit');
  });

  it('(d4) detectTaskType fallback aligns with getRubric new-way for code task', () => {
    const scope = {
      directories: ['src/core/'],
      filesRead: [] as string[],
      filesWrite: ['src/core/work-model.ts'],
    };
    const params = makeCreateParams(scope);
    const task = createTask(params, 1);

    // The type set by task-builder should make getRubric pick the same rubric
    // as the scope-shape fallback would pick (regression-equality via round-trip).
    const rubricFromCanonical = getRubric(task);
    const rubricFromFallback = getRubric(makeTask({ scope }));
    expect(rubricFromCanonical).toBe(rubricFromFallback);
  });
});
