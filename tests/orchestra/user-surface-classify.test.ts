import { describe, it, expect } from 'vitest';
import {
  isUserSurfaceTask,
  getRubric,
  PROOF_OF_FUNCTION_CRITERION,
  AUDIT_RUBRIC,
  CODE_RUBRIC,
  DOC_WRITE_RUBRIC,
} from '../../src/orchestra/rubric-registry.js';
import { TaskStatus, type Task } from '../../src/core/types.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '216-001-test',
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

// ─── isUserSurfaceTask ──────────────────────────────────────────────

describe('isUserSurfaceTask', () => {
  it('returns true when filesWrite is under src/cli/commands/', () => {
    const task = makeTask({
      scope: {
        directories: ['src/cli/commands/'],
        filesRead: [],
        filesWrite: ['src/cli/commands/serve.ts'],
      },
    });
    expect(isUserSurfaceTask(task)).toBe(true);
  });

  it('returns true when filesWrite is under src/dashboard/', () => {
    const task = makeTask({
      scope: {
        directories: ['src/dashboard/'],
        filesRead: [],
        filesWrite: ['src/dashboard/src/pages/EvolutionPage.tsx'],
      },
    });
    expect(isUserSurfaceTask(task)).toBe(true);
  });

  it('returns true when filesWrite is under src/api/', () => {
    const task = makeTask({
      scope: {
        directories: ['src/api/'],
        filesRead: [],
        filesWrite: ['src/api/server.ts'],
      },
    });
    expect(isUserSurfaceTask(task)).toBe(true);
  });

  it('returns false for a pure src/core/ task (internal/structural — Tier-0)', () => {
    const task = makeTask({
      scope: {
        directories: ['src/core/'],
        filesRead: [],
        filesWrite: ['src/core/config.ts'],
      },
    });
    expect(isUserSurfaceTask(task)).toBe(false);
  });

  it('returns false for a docs-only task', () => {
    const task = makeTask({
      scope: {
        directories: ['docs/'],
        filesRead: [],
        filesWrite: ['docs/MASTER-PLAN.md'],
      },
    });
    expect(isUserSurfaceTask(task)).toBe(false);
  });

  it('returns true when scope.directories alone signals user-surface (no filesWrite under that root)', () => {
    const task = makeTask({
      scope: {
        directories: ['src/api/', 'tests/api/'],
        filesRead: [],
        filesWrite: ['tests/api/foo.test.ts'],
      },
    });
    expect(isUserSurfaceTask(task)).toBe(true);
  });

  it('returns false for empty scope (default fallback)', () => {
    const task = makeTask({
      scope: { directories: [], filesRead: [], filesWrite: [] },
    });
    expect(isUserSurfaceTask(task)).toBe(false);
  });

  it('returns true when scope mixes orchestra/ and a user-surface dashboard write (parallel boolean — not exclusive)', () => {
    const task = makeTask({
      scope: {
        directories: ['src/orchestra/', 'src/dashboard/'],
        filesRead: [],
        filesWrite: ['src/orchestra/foo.ts', 'src/dashboard/src/App.tsx'],
      },
    });
    expect(isUserSurfaceTask(task)).toBe(true);
  });
});

// ─── getRubric wire — proof-of-function criterion injection ─────────

describe('getRubric (user-surface wire)', () => {
  it('appends proof-of-function criterion for a user-surface code task', () => {
    const task = makeTask({
      scope: {
        directories: ['src/api/'],
        filesRead: [],
        filesWrite: ['src/api/server.ts'],
      },
    });
    const rubric = getRubric(task);
    const names = rubric.criteria.map(c => c.name);
    expect(names).toContain('proof-of-function');
    // Base CODE_RUBRIC criteria are preserved.
    expect(names).toContain('correctness');
    expect(names).toContain('scope_compliance');
    // Placeholder has weight=0 so it does not alter score math.
    const pf = rubric.criteria.find(c => c.name === 'proof-of-function');
    expect(pf?.weight).toBe(0);
    expect(pf?.threshold).toBe(0);
  });

  it('does NOT append proof-of-function criterion for an internal src/core/ task', () => {
    const task = makeTask({
      scope: {
        directories: ['src/core/'],
        filesRead: [],
        filesWrite: ['src/core/config.ts'],
      },
    });
    const rubric = getRubric(task);
    expect(rubric).toBe(CODE_RUBRIC);
    expect(rubric.criteria.map(c => c.name)).not.toContain('proof-of-function');
  });

  it('does NOT append proof-of-function criterion for an audit task (docs/audits/)', () => {
    const task = makeTask({
      scope: {
        directories: ['docs/audits/sprint-216/'],
        filesRead: [],
        filesWrite: ['docs/audits/sprint-216/T-001.md'],
      },
    });
    const rubric = getRubric(task);
    expect(rubric).toBe(AUDIT_RUBRIC);
    expect(rubric.criteria.map(c => c.name)).not.toContain('proof-of-function');
  });

  it('does NOT append proof-of-function criterion for a pure doc-write task', () => {
    const task = makeTask({
      scope: {
        directories: ['docs/'],
        filesRead: [],
        filesWrite: ['docs/MASTER-PLAN.md'],
      },
    });
    const rubric = getRubric(task);
    expect(rubric).toBe(DOC_WRITE_RUBRIC);
    expect(rubric.criteria.map(c => c.name)).not.toContain('proof-of-function');
  });

  it('returns a fresh object (not a mutation of the frozen base rubric) for user-surface tasks', () => {
    const task = makeTask({
      scope: {
        directories: ['src/dashboard/'],
        filesRead: [],
        filesWrite: ['src/dashboard/src/App.tsx'],
      },
    });
    const rubric = getRubric(task);
    expect(rubric).not.toBe(CODE_RUBRIC);
    // Mutating the returned rubric must not affect CODE_RUBRIC.
    const baseLen = CODE_RUBRIC.criteria.length;
    expect(rubric.criteria.length).toBe(baseLen + 1);
    expect(CODE_RUBRIC.criteria.length).toBe(baseLen);
  });

  it('exposes PROOF_OF_FUNCTION_CRITERION as a stable placeholder constant', () => {
    expect(PROOF_OF_FUNCTION_CRITERION.name).toBe('proof-of-function');
    expect(PROOF_OF_FUNCTION_CRITERION.weight).toBe(0);
    expect(PROOF_OF_FUNCTION_CRITERION.threshold).toBe(0);
    expect(PROOF_OF_FUNCTION_CRITERION.evaluator).toBe('pattern');
  });
});
