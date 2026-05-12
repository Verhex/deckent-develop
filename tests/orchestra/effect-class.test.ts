import { describe, it, expect } from 'vitest';
import {
  detectTaskType,
  getEffectClass,
  type EffectClass,
  type TaskType,
} from '../../src/orchestra/rubric-registry.js';
import { TaskStatus, type Task } from '../../src/core/types.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '156-011-test',
    title: 'Test task',
    description: 'A test task',
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

const VALID_EFFECT_CLASSES: readonly EffectClass[] = [
  'pure',
  'reversible',
  'idempotent',
  'compensable',
  'critical-irreversible',
] as const;

// ─── detectTaskType + getEffectClass composition ─────────────────────

describe('getEffectClass — detectTaskType+getEffectClass composition', () => {
  it('returns "pure" for an audit task (detectTaskType=audit)', () => {
    const task = makeTask({
      scope: {
        directories: ['docs/audits/sprint-156/'],
        filesRead: [],
        filesWrite: ['docs/audits/sprint-156/T-001.md'],
      },
    });

    expect(detectTaskType(task)).toBe<TaskType>('audit');
    expect(getEffectClass(task)).toBe<EffectClass>('pure');
  });

  it('returns "reversible" for a document-write task (detectTaskType=document-write)', () => {
    const task = makeTask({
      scope: {
        directories: ['docs/security/'],
        filesRead: [],
        filesWrite: ['docs/security/sprint-156-review.md'],
      },
    });

    expect(detectTaskType(task)).toBe<TaskType>('document-write');
    expect(getEffectClass(task)).toBe<EffectClass>('reversible');
  });

  it('returns "reversible" for a code-development task (detectTaskType=code-development)', () => {
    const task = makeTask({
      scope: {
        directories: ['src/orchestra/'],
        filesRead: [],
        filesWrite: ['src/orchestra/rubric-registry.ts'],
      },
    });

    expect(detectTaskType(task)).toBe<TaskType>('code-development');
    expect(getEffectClass(task)).toBe<EffectClass>('reversible');
  });

  it('returns "reversible" for an empty-scope task (default fallback to code-development)', () => {
    const task = makeTask({
      scope: { directories: [], filesRead: [], filesWrite: [] },
    });

    expect(detectTaskType(task)).toBe<TaskType>('code-development');
    expect(getEffectClass(task)).toBe<EffectClass>('reversible');
  });

  it('returns "reversible" for a mixed src+docs scope (code-development by precedence)', () => {
    const task = makeTask({
      scope: {
        directories: ['src/orchestra/', 'docs/'],
        filesRead: [],
        filesWrite: ['src/orchestra/foo.ts', 'docs/foo.md'],
      },
    });

    expect(detectTaskType(task)).toBe<TaskType>('code-development');
    expect(getEffectClass(task)).toBe<EffectClass>('reversible');
  });

  it('returns "pure" for an audit task even when directories include docs/ (audit precedence)', () => {
    // Audit detection takes priority over document-write because audit reports
    // also live under docs/. This asserts that detectTaskType priority chain
    // (audit → document-write → code-development) drives getEffectClass.
    const task = makeTask({
      scope: {
        directories: ['docs/audits/sprint-156/'],
        filesRead: [],
        filesWrite: ['docs/audits/sprint-156/T-015-retro.md'],
      },
    });

    expect(detectTaskType(task)).toBe<TaskType>('audit');
    expect(getEffectClass(task)).not.toBe<EffectClass>('reversible');
    expect(getEffectClass(task)).toBe<EffectClass>('pure');
  });
});

// ─── EffectClass type membership ─────────────────────────────────────

describe('getEffectClass — type membership', () => {
  it('always returns a value in the EffectClass union', () => {
    const tasks: Task[] = [
      makeTask({
        scope: {
          directories: ['docs/audits/'],
          filesRead: [],
          filesWrite: ['docs/audits/X.md'],
        },
      }),
      makeTask({
        scope: {
          directories: ['docs/'],
          filesRead: [],
          filesWrite: ['docs/X.md'],
        },
      }),
      makeTask({
        scope: {
          directories: ['src/'],
          filesRead: [],
          filesWrite: ['src/X.ts'],
        },
      }),
      makeTask({}),
    ];

    for (const task of tasks) {
      const cls = getEffectClass(task);
      expect(VALID_EFFECT_CLASSES).toContain(cls);
    }
  });

  it('is referentially stable across calls (pure function)', () => {
    const task = makeTask({
      scope: {
        directories: ['src/orchestra/'],
        filesRead: [],
        filesWrite: ['src/orchestra/x.ts'],
      },
    });

    const first = getEffectClass(task);
    const second = getEffectClass(task);

    expect(first).toBe(second);
  });
});

// ─── EFFECT_CLASS_REGISTRY default map ───────────────────────────────

describe('default EffectClass per TaskType', () => {
  it('maps audit → pure', () => {
    const task = makeTask({
      scope: {
        directories: ['docs/audits/sprint-156/'],
        filesRead: [],
        filesWrite: ['docs/audits/sprint-156/T.md'],
      },
    });
    expect(getEffectClass(task)).toBe<EffectClass>('pure');
  });

  it('maps document-write → reversible', () => {
    const task = makeTask({
      scope: {
        directories: ['docs/'],
        filesRead: [],
        filesWrite: ['docs/X.md'],
      },
    });
    expect(getEffectClass(task)).toBe<EffectClass>('reversible');
  });

  it('maps code-development → reversible', () => {
    const task = makeTask({
      scope: {
        directories: ['src/'],
        filesRead: [],
        filesWrite: ['src/X.ts'],
      },
    });
    expect(getEffectClass(task)).toBe<EffectClass>('reversible');
  });
});
