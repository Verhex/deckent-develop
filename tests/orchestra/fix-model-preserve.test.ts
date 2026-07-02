// ═══ FIX-MODEL-PRESERVE (Sprint 361 Task 361-005, born-476) ═══════════════
// born-476: a NO_GO fix-task's producer (debt-manager.ts / sprint-planner.ts)
// preserves `model`/`forceModel` but never copies `provider`/`backend`/
// `modelEffort` onto the new fix-task object. At spawn time
// resolveTaskProvider() then INFERS the provider from the model via the
// registry, silently drifting off a pinned provider/backend — observed as a
// codex/gpt-5/subprocess task's fix respawning on claude/opus.
//
// preserveFixTaskRoutingFields() closes the gap at the spawn boundary: any
// field the fix-task producer left unset is inherited from the original
// task's on-disk record; any field the fix-task ALREADY set to something
// different is left alone (a conscious override) but always reported —
// never silently changed either way.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'node:path';
import type { Task } from '../../src/core/types.js';
import { TaskStatus } from '../../src/core/types.js';
import { TASKS_DIR } from '../../src/core/constants.js';

// ─── Mocks ──────────────────────────────────────────────────────────

const fsFiles = new Map<string, string>();

vi.mock('node:fs', () => ({
  readFileSync: vi.fn((path: string) => {
    if (fsFiles.has(path)) return fsFiles.get(path)!;
    throw new Error(`ENOENT: no such file, open '${path}'`);
  }),
  writeFileSync: vi.fn((path: string, data: string) => {
    fsFiles.set(path, String(data));
  }),
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  appendFileSync: vi.fn(),
}));

vi.mock('../../src/core/event-stream.js', () => ({
  writeEvent: vi.fn().mockReturnValue(null),
  getCurrentSprintId: vi.fn().mockReturnValue(null),
  CHANNELS: {
    METRIC_EMITTED: 'BRAIN→*:METRIC_EMITTED',
  },
}));

import { writeFileSync } from 'node:fs';
import { writeEvent } from '../../src/core/event-stream.js';
import { preserveFixTaskRoutingFields } from '../../src/orchestra/sprint-spawner.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-001',
    title: 'Test task',
    description: 'desc',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'tests pass', noGoCriteria: 'tests fail', techDebtAcceptable: 'minor' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-361',
    ...overrides,
  };
}

function taskPath(projectRoot: string, id: string): string {
  return join(projectRoot, TASKS_DIR, `task-${id}.json`);
}

function seedOriginal(projectRoot: string, id: string, task: Task): void {
  fsFiles.set(taskPath(projectRoot, id), JSON.stringify(task));
}

const PROJECT_ROOT = '/root';

beforeEach(() => {
  vi.clearAllMocks();
  fsFiles.clear();
});

// ─── Positive: silent-drop protection (the born-476 fixture) ────────

describe('preserveFixTaskRoutingFields — inheritance', () => {
  it('inherits forceModel/provider/backend/modelEffort the producer dropped (born-476 fixture: gpt-5/codex/subprocess)', () => {
    const original = makeTask({
      id: '360-014',
      model: 'gpt-5',
      forceModel: 'gpt-5',
      provider: 'codex',
      backend: 'subprocess',
      modelEffort: 'high',
    });
    seedOriginal(PROJECT_ROOT, '360-014', original);

    const fixTask = makeTask({
      id: '360-014-fix',
      model: 'gpt-5',
      isPriorityFix: true,
      fixForTaskId: '360-014',
      // forceModel/provider/backend/modelEffort intentionally absent —
      // this is exactly the gap debt-manager.ts leaves today.
    });

    preserveFixTaskRoutingFields(PROJECT_ROOT, 'sprint-360', fixTask);

    expect(fixTask.forceModel).toBe('gpt-5');
    expect(fixTask.provider).toBe('codex');
    expect(fixTask.backend).toBe('subprocess');
    expect(fixTask.modelEffort).toBe('high');
  });

  it('old no-inheritance behavior no longer occurs (negative test): fields are never left undefined when the original pinned them', () => {
    const original = makeTask({
      id: '360-014',
      provider: 'codex',
      backend: 'subprocess',
    });
    seedOriginal(PROJECT_ROOT, '360-014', original);

    const fixTask = makeTask({
      id: '360-014-fix',
      isPriorityFix: true,
      fixForTaskId: '360-014',
    });

    preserveFixTaskRoutingFields(PROJECT_ROOT, 'sprint-360', fixTask);

    expect(fixTask.provider).not.toBeUndefined();
    expect(fixTask.backend).not.toBeUndefined();
  });

  it('only inherits fields the original actually pinned — leaves the rest untouched', () => {
    const original = makeTask({
      id: '360-014',
      provider: 'codex',
      // backend/modelEffort/forceModel never set on the original either
    });
    seedOriginal(PROJECT_ROOT, '360-014', original);

    const fixTask = makeTask({
      id: '360-014-fix',
      isPriorityFix: true,
      fixForTaskId: '360-014',
    });

    preserveFixTaskRoutingFields(PROJECT_ROOT, 'sprint-360', fixTask);

    expect(fixTask.provider).toBe('codex');
    expect(fixTask.backend).toBeUndefined();
    expect(fixTask.modelEffort).toBeUndefined();
  });

  it('persists the reconciled fix-task back to disk when a field is inherited', () => {
    const original = makeTask({ id: '360-014', provider: 'codex', backend: 'subprocess' });
    seedOriginal(PROJECT_ROOT, '360-014', original);

    const fixTask = makeTask({ id: '360-014-fix', isPriorityFix: true, fixForTaskId: '360-014' });

    preserveFixTaskRoutingFields(PROJECT_ROOT, 'sprint-360', fixTask);

    expect(writeFileSync).toHaveBeenCalledWith(
      taskPath(PROJECT_ROOT, '360-014-fix'),
      expect.any(String),
      'utf-8',
    );
    const persisted = JSON.parse(fsFiles.get(taskPath(PROJECT_ROOT, '360-014-fix'))!) as Task;
    expect(persisted.provider).toBe('codex');
    expect(persisted.backend).toBe('subprocess');
  });

  it('emits a METRIC_EMITTED event when a field is inherited — no silent change', () => {
    const original = makeTask({ id: '360-014', provider: 'codex' });
    seedOriginal(PROJECT_ROOT, '360-014', original);

    const fixTask = makeTask({ id: '360-014-fix', isPriorityFix: true, fixForTaskId: '360-014' });

    preserveFixTaskRoutingFields(PROJECT_ROOT, 'sprint-360', fixTask);

    expect(writeEvent).toHaveBeenCalledWith(
      PROJECT_ROOT,
      'sprint-360',
      'brain',
      '*',
      'BRAIN→*:METRIC_EMITTED',
      expect.objectContaining({
        name: 'fix.routing.preserved',
        taskId: '360-014-fix',
        fixForTaskId: '360-014',
        inherited: expect.objectContaining({ provider: 'codex' }),
      }),
    );
  });
});

// ─── Deliberate change: never silently overwritten ───────────────────

describe('preserveFixTaskRoutingFields — conscious overrides are preserved, not overwritten', () => {
  it('keeps an already-set fix-task provider that differs from the original (e.g. provider-fallback policy)', () => {
    const original = makeTask({ id: '360-014', provider: 'codex', backend: 'subprocess' });
    seedOriginal(PROJECT_ROOT, '360-014', original);

    const fixTask = makeTask({
      id: '360-014-fix',
      isPriorityFix: true,
      fixForTaskId: '360-014',
      provider: 'gemini', // a conscious fallback decision already applied upstream
    });

    preserveFixTaskRoutingFields(PROJECT_ROOT, 'sprint-360', fixTask);

    expect(fixTask.provider).toBe('gemini'); // NOT silently reset to 'codex'
    expect(fixTask.backend).toBe('subprocess'); // still inherited (was unset)
  });

  it('reports a conscious override via the emitted event instead of staying silent', () => {
    const original = makeTask({ id: '360-014', provider: 'codex' });
    seedOriginal(PROJECT_ROOT, '360-014', original);

    const fixTask = makeTask({
      id: '360-014-fix',
      isPriorityFix: true,
      fixForTaskId: '360-014',
      provider: 'gemini',
    });

    preserveFixTaskRoutingFields(PROJECT_ROOT, 'sprint-360', fixTask);

    expect(writeEvent).toHaveBeenCalledWith(
      PROJECT_ROOT,
      'sprint-360',
      'brain',
      '*',
      'BRAIN→*:METRIC_EMITTED',
      expect.objectContaining({
        overridden: expect.objectContaining({
          provider: { from: 'codex', to: 'gemini' },
        }),
      }),
    );
  });
});

// ─── No-op guards ─────────────────────────────────────────────────────

describe('preserveFixTaskRoutingFields — no-op guards', () => {
  it('is a no-op for a non-fix task (isPriorityFix falsy)', () => {
    const task = makeTask({ id: '360-014', provider: undefined });
    expect(() => preserveFixTaskRoutingFields(PROJECT_ROOT, 'sprint-360', task)).not.toThrow();
    expect(task.provider).toBeUndefined();
    expect(writeFileSync).not.toHaveBeenCalled();
    expect(writeEvent).not.toHaveBeenCalled();
  });

  it('is a no-op when isPriorityFix is true but fixForTaskId is missing', () => {
    const task = makeTask({ id: '360-014-fix', isPriorityFix: true });
    expect(() => preserveFixTaskRoutingFields(PROJECT_ROOT, 'sprint-360', task)).not.toThrow();
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('is a no-op (never throws) when the original task file cannot be read', () => {
    const fixTask = makeTask({ id: '360-014-fix', isPriorityFix: true, fixForTaskId: 'missing-999' });
    expect(() => preserveFixTaskRoutingFields(PROJECT_ROOT, 'sprint-360', fixTask)).not.toThrow();
    expect(fixTask.provider).toBeUndefined();
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('does not write or emit when the fix-task already carries every field the original has', () => {
    const original = makeTask({ id: '360-014', provider: 'codex', backend: 'subprocess' });
    seedOriginal(PROJECT_ROOT, '360-014', original);

    const fixTask = makeTask({
      id: '360-014-fix',
      isPriorityFix: true,
      fixForTaskId: '360-014',
      provider: 'codex',
      backend: 'subprocess',
    });

    preserveFixTaskRoutingFields(PROJECT_ROOT, 'sprint-360', fixTask);

    expect(writeFileSync).not.toHaveBeenCalled();
    expect(writeEvent).not.toHaveBeenCalled();
  });
});
