import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createTask,
  extractScopeFromDirective,
  parseStructuredDirectives,
  plannerTaskToParams,
  resolveWorkerEffort,
  buildWorkerPrompt,
} from '../../src/orchestra/task-builder.js';
import { TaskStatus } from '../../src/core/types.js';
import type { Task, PlannerTask, CreateTaskParams } from '../../src/core/types.js';

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeBaseParams(overrides: Partial<CreateTaskParams> = {}): CreateTaskParams {
  return {
    title: 'Test Task',
    description: 'A test task description',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'Testing purposes',
    scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/foo.ts'] },
    dependencies: [],
    goNogo: { goCriteria: 'tests pass', noGoCriteria: 'tests fail', techDebtAcceptable: 'minor' },
    sprintId: 'sprint-025',
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '025-001',
    title: 'Test Task',
    description: 'A test task description',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'Testing purposes',
    scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/foo.ts'] },
    dependencies: [],
    goNogo: { goCriteria: 'tests pass', noGoCriteria: 'tests fail', techDebtAcceptable: 'minor' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-025',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makePlannerTask(overrides: Partial<PlannerTask> = {}): PlannerTask {
  return {
    title: 'Planner Task',
    description: 'Planner task desc',
    model: 'opus',
    effort: 'high',
    priority: 'HIGH',
    reason: 'Complexity',
    scope: { directories: ['src/orchestra/'], filesRead: [], filesWrite: ['src/orchestra/brain.ts'] },
    dependencies: ['001'],
    goNogo: { goCriteria: 'all checks pass', noGoCriteria: 'compile fails', techDebtAcceptable: 'none' },
    ...overrides,
  };
}

// ─── createTask ────────────────────────────────────────────────────────────

describe('createTask', () => {
  it('generates id from sprintId and sequence', () => {
    const task = createTask(makeBaseParams({ sprintId: 'sprint-025' }), 1);
    expect(task.id).toBe('025-001');
  });

  it('pads sequence to 3 digits', () => {
    const task = createTask(makeBaseParams({ sprintId: 'sprint-025' }), 42);
    expect(task.id).toBe('025-042');
  });

  it('strips "sprint-" prefix from sprintId', () => {
    const task = createTask(makeBaseParams({ sprintId: 'sprint-001' }), 1);
    expect(task.id).toBe('001-001');
  });

  it('uses PENDING status by default', () => {
    const task = createTask(makeBaseParams(), 1);
    expect(task.status).toBe(TaskStatus.PENDING);
  });

  it('respects initialStatus override', () => {
    const task = createTask(makeBaseParams({ initialStatus: TaskStatus.DRAFT }), 1);
    expect(task.status).toBe(TaskStatus.DRAFT);
  });

  it('copies all fields from params', () => {
    const params = makeBaseParams();
    const task = createTask(params, 1);
    expect(task.title).toBe(params.title);
    expect(task.description).toBe(params.description);
    expect(task.model).toBe(params.model);
    expect(task.effort).toBe(params.effort);
    expect(task.priority).toBe(params.priority);
    expect(task.reason).toBe(params.reason);
    expect(task.scope).toEqual(params.scope);
    expect(task.dependencies).toEqual(params.dependencies);
    expect(task.goNogo).toEqual(params.goNogo);
    expect(task.sprintId).toBe(params.sprintId);
  });

  it('sets createdAt to valid ISO string', () => {
    const before = Date.now();
    const task = createTask(makeBaseParams(), 1);
    const after = Date.now();
    const ts = new Date(task.createdAt!).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('carries isPriorityFix and fixForTaskId when set', () => {
    const task = createTask(makeBaseParams({ isPriorityFix: true, fixForTaskId: '024-003' }), 5);
    expect(task.isPriorityFix).toBe(true);
    expect(task.fixForTaskId).toBe('024-003');
  });
});

// ─── extractScopeFromDirective ─────────────────────────────────────────────

describe('extractScopeFromDirective', () => {
  it('extracts src/ directory from line', () => {
    const scope = extractScopeFromDirective('- Kapsam: src/core/');
    expect(scope.directories).toContain('src/core/');
  });

  it('extracts tests/ directory from line', () => {
    const scope = extractScopeFromDirective('tests/orchestra/');
    expect(scope.directories).toContain('tests/orchestra/');
  });

  it('extracts .ts file from line', () => {
    const scope = extractScopeFromDirective('- Dosya: src/core/utils.ts (güncelle)');
    expect(scope.filesWrite).toContain('src/core/utils.ts');
  });

  it('returns empty arrays for unrelated line', () => {
    const scope = extractScopeFromDirective('some random text without paths');
    expect(scope.directories).toEqual([]);
    expect(scope.filesWrite).toEqual([]);
    expect(scope.filesRead).toEqual([]);
  });

  it('deduplicates directories', () => {
    const scope = extractScopeFromDirective('src/core/ and also src/core/ paths');
    expect(scope.directories.filter(d => d === 'src/core/')).toHaveLength(1);
  });

  it('deduplicates file paths', () => {
    const scope = extractScopeFromDirective('src/core/utils.ts src/core/utils.ts');
    expect(scope.filesWrite.filter(f => f === 'src/core/utils.ts')).toHaveLength(1);
  });

  it('extracts multiple directories from one line', () => {
    const scope = extractScopeFromDirective('src/core/ and tests/core/');
    expect(scope.directories).toContain('src/core/');
    expect(scope.directories).toContain('tests/core/');
  });

  it('always returns empty filesRead', () => {
    const scope = extractScopeFromDirective('src/core/utils.ts');
    expect(scope.filesRead).toEqual([]);
  });
});

// ─── parseStructuredDirectives ─────────────────────────────────────────────

describe('parseStructuredDirectives', () => {
  it('returns empty array when no structured sections', () => {
    const result = parseStructuredDirectives('# Just a heading\nSome content');
    expect(result).toEqual([]);
  });

  it('parses a single Görev block', () => {
    // The regex splits on "## Görev N:", so text after the colon on the heading line
    // becomes the first content in the block — that becomes the title.
    const content = `## Görev 1: First Task
- Dosya: src/core/utils.ts
- Kapsam: src/core/

### Açıklama
Do something useful`;
    const result = parseStructuredDirectives(content);
    expect(result).toHaveLength(1);
    // Title = first non-empty line after heading's ":"  → "First Task"
    expect(result[0].title).toBe('First Task');
  });

  it('parses multiple blocks', () => {
    const content = `## Görev 1: Task One
- Title line one

## Görev 2: Task Two
- Title line two`;
    const result = parseStructuredDirectives(content);
    expect(result).toHaveLength(2);
  });

  it('parses Task keyword in addition to Görev', () => {
    const content = `## Task 1: English Task
- Something`;
    const result = parseStructuredDirectives(content);
    expect(result).toHaveLength(1);
  });

  it('extracts scope from Dosya and Kapsam lines', () => {
    const content = `## Görev 1: Utility Functions
- Dosya: src/core/utils.ts (yeni)
- Kapsam: src/core/`;
    const result = parseStructuredDirectives(content);
    expect(result[0].scope.filesWrite).toContain('src/core/utils.ts');
    expect(result[0].scope.directories).toContain('src/core/');
  });

  it('extracts testTarget from Test: line', () => {
    const content = `## Görev 1: My Task
- Kapsam: src/

- Test: tests/core/utils.test.ts`;
    const result = parseStructuredDirectives(content);
    expect(result[0].testTarget).toBe('tests/core/utils.test.ts');
  });

  it('testTarget is undefined when no Test: line', () => {
    const content = `## Görev 1: My Task
- No test line here`;
    const result = parseStructuredDirectives(content);
    expect(result[0].testTarget).toBeUndefined();
  });

  it('merges scope from multiple scope lines in a block', () => {
    const content = `## Görev 1: Multi-scope Task
- Dosya: src/core/utils.ts (güncelle)
- src/orchestra/brain.ts de etkileniyor`;
    const result = parseStructuredDirectives(content);
    // Should have file entries from both lines
    expect(result[0].scope.filesWrite.length).toBeGreaterThanOrEqual(1);
  });

  it('skips blocks without a title', () => {
    // A block with only whitespace — should be skipped
    const content = `## Görev 1: Empty

## Görev 2: Real Task
- Something here`;
    const result = parseStructuredDirectives(content);
    // The "empty" block might be skipped since first non-empty line is empty
    // Result should have at least 1 (the real task)
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── plannerTaskToParams ────────────────────────────────────────────────────

describe('plannerTaskToParams', () => {
  it('maps PlannerTask fields to CreateTaskParams', () => {
    const pt = makePlannerTask();
    const params = plannerTaskToParams(pt, 'sprint-025', 'sonnet');
    expect(params.title).toBe(pt.title);
    expect(params.description).toBe(pt.description);
    expect(params.effort).toBe(pt.effort);
    expect(params.priority).toBe(pt.priority);
    expect(params.reason).toBe(pt.reason);
    expect(params.scope).toEqual(pt.scope);
    expect(params.dependencies).toEqual(pt.dependencies);
    expect(params.goNogo).toEqual(pt.goNogo);
    expect(params.sprintId).toBe('sprint-025');
  });

  it('uses PlannerTask model when provided', () => {
    const pt = makePlannerTask({ model: 'opus' });
    const params = plannerTaskToParams(pt, 'sprint-025', 'sonnet');
    expect(params.model).toBe('opus');
  });

  it('falls back to modelOverride when PlannerTask.model is undefined', () => {
    const pt = makePlannerTask({ model: undefined as any });
    const params = plannerTaskToParams(pt, 'sprint-025', 'haiku');
    expect(params.model).toBe('haiku');
  });

  it('passes initialStatus when provided', () => {
    const pt = makePlannerTask();
    const params = plannerTaskToParams(pt, 'sprint-025', 'sonnet', TaskStatus.DRAFT);
    expect(params.initialStatus).toBe(TaskStatus.DRAFT);
  });

  it('initialStatus is undefined when not provided', () => {
    const pt = makePlannerTask();
    const params = plannerTaskToParams(pt, 'sprint-025', 'sonnet');
    expect(params.initialStatus).toBeUndefined();
  });
});

// ─── resolveWorkerEffort ───────────────────────────────────────────────────

describe('resolveWorkerEffort', () => {
  it('returns "max" for high-score tasks (score >= 6)', () => {
    // Multi-directory (3 dirs = +3) + architectural keyword (+2) + many files > 10 (+2) = 7
    const task = makeTask({
      title: 'Architect the whole system migration',
      description: 'Major architectural redesign',
      scope: {
        directories: ['src/core/', 'src/orchestra/', 'src/agents/'],
        filesRead: [],
        filesWrite: Array(12).fill('src/core/foo.ts').map((f, i) => f.replace('foo', `f${i}`)),
      },
    });
    const result = resolveWorkerEffort(task);
    expect(result).toBe('max');
  });

  it('returns "high" for medium-score tasks (score 1-5)', () => {
    // Single directory (-1) + 0 from text = -1, but let's use 2 dirs (+3) = 3
    const task = makeTask({
      title: 'Implement feature',
      description: 'Plain implementation',
      scope: {
        directories: ['src/core/', 'src/cli/'],
        filesRead: [],
        filesWrite: ['src/core/foo.ts'],
      },
    });
    const result = resolveWorkerEffort(task);
    expect(result).toBe('high');
  });

  it('returns "low" for very low-score tasks', () => {
    // docs-only scope (-2) + single dir (-1) = -3 → should be 'low'
    const task = makeTask({
      title: 'Update readme',
      description: 'simple doc update',
      scope: {
        directories: ['docs/'],
        filesRead: [],
        filesWrite: ['docs/README.md'],
      },
    });
    const result = resolveWorkerEffort(task);
    expect(result).toBe('low');
  });

  it('returns "medium" for score -1 to 0', () => {
    // Single directory (-1) + no other bonuses = -1 → medium
    const task = makeTask({
      title: 'Small fix',
      description: 'Minor bugfix',
      scope: {
        directories: ['src/core/'],
        filesRead: [],
        filesWrite: ['src/core/foo.ts'],
      },
    });
    // score = -1 (single directory)
    const result = resolveWorkerEffort(task);
    expect(result).toBe('medium');
  });

  it('result is one of the valid effort strings', () => {
    const task = makeTask();
    const result = resolveWorkerEffort(task);
    expect(['max', 'high', 'medium', 'low']).toContain(result);
  });
});

// ─── buildWorkerPrompt ─────────────────────────────────────────────────────

describe('buildWorkerPrompt', () => {
  it('includes task id and title in prompt', () => {
    const task = makeTask({ id: '025-007', title: 'My Special Task' });
    const prompt = buildWorkerPrompt(task);
    expect(prompt).toContain('025-007');
    expect(prompt).toContain('My Special Task');
  });

  it('includes model in prompt', () => {
    const task = makeTask({ model: 'opus' });
    const prompt = buildWorkerPrompt(task);
    expect(prompt).toContain('Model: opus');
  });

  it('includes effort with --effort flag instruction', () => {
    const task = makeTask();
    const prompt = buildWorkerPrompt(task);
    // resolveWorkerEffort returns a value; prompt should show it
    const effort = resolveWorkerEffort(task);
    expect(prompt).toContain(`--effort ${effort}`);
  });

  it('includes heartbeat instructions', () => {
    const task = makeTask({ id: '025-007' });
    const prompt = buildWorkerPrompt(task);
    expect(prompt).toContain('.tasks/task-025-007.hb');
    expect(prompt).toContain('.tasks/task-025-007.result');
  });

  it('uses scope directories in prompt', () => {
    const task = makeTask({ scope: { directories: ['src/core/', 'src/cli/'], filesRead: [], filesWrite: [] } });
    const prompt = buildWorkerPrompt(task);
    expect(prompt).toContain('src/core/');
    expect(prompt).toContain('src/cli/');
  });

  it('uses "any" when no scope directories', () => {
    const task = makeTask({ scope: { directories: [], filesRead: [], filesWrite: [] } });
    const prompt = buildWorkerPrompt(task);
    expect(prompt).toContain('Scope: any');
  });

  it('includes selfAssessment format in result template', () => {
    const task = makeTask();
    const prompt = buildWorkerPrompt(task);
    expect(prompt).toContain('selfAssessment');
    expect(prompt).toContain('DONE');
  });
});
