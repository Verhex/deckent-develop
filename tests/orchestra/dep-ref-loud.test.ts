import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  resolveDependencyRef,
  resolveTaskDependencies,
  resolveTaskDependenciesLoud,
} from '../../src/orchestra/task-builder.js';

// ─── Sprint 358 born-458 (357 canlı-vakası) — DEP-REF-LOUD ────────────────
//
// Bug: `- Dependencies: Task 1` — the human-natural form DIRECTIVES.md
// authors actually write, matching the doc's own "## Task N:" heading
// numbering — was not recognized by resolveDependencyRef. It fell through
// every existing ref style (pure-integer, plan-slot id, title-prefix) to an
// unresolved `undefined`, and was dropped with zero operator-visible signal
// (only a DEBUG-gated debugLog call several layers downstream).
//
// Fix:
//   1. resolveDependencyRef gains a 1-based "Task N" / "task N" resolution
//      rule, additive to the existing three styles (which stay unchanged).
//   2. New resolveTaskDependenciesLoud sibling reports every still-
//      unresolved ref via a `[deckent] WARN: ...` stderr line + a structured
//      `warnings` return value, for the caller to stamp onto plan output.
//   3. `options.strict` (mirrors the `dependency_ref_strict` config field,
//      default off) throws instead of warning, blocking planning outright.

type TaskRef = { id: string; title: string };

const SAMPLE_TASKS: TaskRef[] = [
  { id: '358-001', title: 'API-1 — Build the REST API endpoint' },
  { id: '358-002', title: 'API-2 — Write integration tests for the endpoint' },
  { id: '358-003', title: 'API-3 — Document the new endpoint in the API reference' },
];

describe('resolveDependencyRef — "Task N" / "task N" human-natural form (born-458)', () => {
  it('resolves "Task 1" to the first task\'s real id (1-based)', () => {
    expect(resolveDependencyRef('Task 1', SAMPLE_TASKS)).toBe('358-001');
  });

  it('resolves "Task 2" to the second task\'s real id', () => {
    expect(resolveDependencyRef('Task 2', SAMPLE_TASKS)).toBe('358-002');
  });

  it('is case-insensitive ("task 3")', () => {
    expect(resolveDependencyRef('task 3', SAMPLE_TASKS)).toBe('358-003');
  });

  it('tolerates extra internal whitespace ("Task   2")', () => {
    expect(resolveDependencyRef('Task   2', SAMPLE_TASKS)).toBe('358-002');
  });

  it('trims surrounding whitespace (" Task 1 ")', () => {
    expect(resolveDependencyRef(' Task 1 ', SAMPLE_TASKS)).toBe('358-001');
  });

  it('returns undefined for an out-of-range "Task N" (never throws)', () => {
    expect(resolveDependencyRef('Task 99', SAMPLE_TASKS)).toBeUndefined();
  });

  it('returns undefined for "Task 0" (1-based — there is no task 0)', () => {
    expect(resolveDependencyRef('Task 0', SAMPLE_TASKS)).toBeUndefined();
  });

  it('does not collide with the existing 0-based pure-integer form', () => {
    // "0" (bare integer, 0-based) and "Task 1" (human-natural, 1-based) both
    // point at the first task — by two independent resolution rules.
    expect(resolveDependencyRef('0', SAMPLE_TASKS)).toBe('358-001');
    expect(resolveDependencyRef('Task 1', SAMPLE_TASKS)).toBe('358-001');
    // "1" (bare integer, 0-based) is the SECOND task, proving the two forms
    // do not alias each other.
    expect(resolveDependencyRef('1', SAMPLE_TASKS)).toBe('358-002');
  });

  it('does not match "Task" without a trailing number', () => {
    expect(resolveDependencyRef('Task', SAMPLE_TASKS)).toBeUndefined();
  });

  it('does not match a ref that merely starts with the letters "task"', () => {
    expect(resolveDependencyRef('Tasky-1', SAMPLE_TASKS)).toBeUndefined();
  });
});

describe('resolveDependencyRef — existing ref styles unaffected (regression guard)', () => {
  it('plan-slot id still resolves by exact id match', () => {
    expect(resolveDependencyRef('358-002', SAMPLE_TASKS)).toBe('358-002');
  });

  it('title-prefix / token match still resolves', () => {
    expect(resolveDependencyRef('API-2', SAMPLE_TASKS)).toBe('358-002');
  });

  it('reserved keywords still resolve to undefined', () => {
    expect(resolveDependencyRef('none', SAMPLE_TASKS)).toBeUndefined();
    expect(resolveDependencyRef('AUTO', SAMPLE_TASKS)).toBeUndefined();
  });
});

describe('resolveTaskDependenciesLoud — unresolved refs are never silent (born-458 §2)', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    stderrSpy?.mockRestore();
  });

  it('resolves every ref with no warnings and no stderr output when all refs are valid', () => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = resolveTaskDependenciesLoud('358-003', ['Task 1', '358-002'], SAMPLE_TASKS);
    expect(result.resolved).toEqual(['358-001', '358-002']);
    expect(result.warnings).toEqual([]);
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('de-duplicates resolved ids the same way resolveTaskDependencies does', () => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = resolveTaskDependenciesLoud('358-003', ['Task 1', '358-001'], SAMPLE_TASKS);
    expect(result.resolved).toEqual(['358-001']);
  });

  it('emits a "[deckent] WARN: ..." stderr line for an unresolvable ref', () => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    resolveTaskDependenciesLoud('358-003', ['Task 99'], SAMPLE_TASKS);
    expect(stderrSpy).toHaveBeenCalledTimes(1);
    expect(stderrSpy.mock.calls[0]![0]).toBe(
      `[deckent] WARN: dependency ref 'Task 99' çözülemedi (task 358-003)\n`,
    );
  });

  it('drops the unresolved ref from `resolved` and records it in `warnings`', () => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = resolveTaskDependenciesLoud('358-003', ['Task 1', 'BOGUS-REF'], SAMPLE_TASKS);
    expect(result.resolved).toEqual(['358-001']);
    expect(result.warnings).toEqual([
      {
        taskId: '358-003',
        ref: 'BOGUS-REF',
        message: `[deckent] WARN: dependency ref 'BOGUS-REF' çözülemedi (task 358-003)`,
      },
    ]);
  });

  it('reports one warning per unresolved ref while resolved refs still succeed', () => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = resolveTaskDependenciesLoud(
      '358-003',
      ['Task 1', 'GHOST-1', '358-002', 'GHOST-2'],
      SAMPLE_TASKS,
    );
    expect(result.resolved).toEqual(['358-001', '358-002']);
    expect(result.warnings.map(w => w.ref)).toEqual(['GHOST-1', 'GHOST-2']);
    expect(stderrSpy).toHaveBeenCalledTimes(2);
  });
});

describe('resolveTaskDependenciesLoud — strict mode blocks planning (born-458 §3)', () => {
  it('throws on the first unresolved ref when options.strict is true', () => {
    expect(() =>
      resolveTaskDependenciesLoud('358-003', ['GHOST-1'], SAMPLE_TASKS, { strict: true }),
    ).toThrow(`[deckent] WARN: dependency ref 'GHOST-1' çözülemedi (task 358-003)`);
  });

  it('does not throw when every ref resolves, even under strict mode', () => {
    expect(() =>
      resolveTaskDependenciesLoud('358-003', ['Task 1', '358-002'], SAMPLE_TASKS, { strict: true }),
    ).not.toThrow();
  });

  it('defaults to non-strict (warn, not throw) when options is omitted', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    expect(() => resolveTaskDependenciesLoud('358-003', ['GHOST-1'], SAMPLE_TASKS)).not.toThrow();
    stderrSpy.mockRestore();
  });

  it('defaults to non-strict when options.strict is explicitly false', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    expect(() =>
      resolveTaskDependenciesLoud('358-003', ['GHOST-1'], SAMPLE_TASKS, { strict: false }),
    ).not.toThrow();
    stderrSpy.mockRestore();
  });
});

describe('resolveTaskDependencies — existing silent-drop function untouched by the born-458 fix', () => {
  it('"Task N" now resolves via the shared resolveDependencyRef', () => {
    expect(resolveTaskDependencies(['Task 1', '358-002'], SAMPLE_TASKS)).toEqual([
      '358-001',
      '358-002',
    ]);
  });

  it('still silently drops an unresolvable ref (back-compat: no throw, no stderr contract)', () => {
    expect(resolveTaskDependencies(['Task 1', 'GHOST'], SAMPLE_TASKS)).toEqual(['358-001']);
  });
});
