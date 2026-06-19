import { describe, it, expect } from 'vitest';
import {
  detectTaskType as detectRubricType,
  getRubric,
  getEffectClass,
  type TaskType as RubricRegistryTaskType,
} from '../../src/orchestra/rubric-registry.js';
import {
  detectTaskType as detectRouterType,
  type TaskType as RouterAliasTaskType,
} from '../../src/orchestra/task-router.js';
import {
  TASK_TYPE_ADR_PRESETS,
  type TaskType as AdrSelectorTaskType,
} from '../../src/orchestra/adr-selector.js';
import type {
  RubricTaskType,
  RouterTaskType,
  AdrTaskType,
} from '../../src/core/work-model.js';
import { TaskStatus, type Task } from '../../src/core/types.js';

// ─── WM-2 (306-015): orchestra TaskType dup-delete regression-guard ──────────
// The three orchestra `TaskType` literal-union enums (rubric-registry / task-router
// / adr-selector) used to be hand-maintained duplicates of the canonical mirror
// types in core/work-model.ts. They are now backward-compat re-export aliases of
// those mirrors (RubricTaskType / RouterTaskType / AdrTaskType). These tests lock
// the single-source linkage (compile-time) + net-zero behavior (runtime) so the
// orchestra aliases can never silently drift from the canonical work-model SSOT.

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '306-015-test',
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

describe('WM-2 306-015 — orchestra TaskType aliases are the canonical mirrors', () => {
  it('rubric-registry TaskType is bidirectionally assignable to/from RubricTaskType', () => {
    // Compile-time single-source proof: if the alias drifted from the mirror,
    // one of these assignments would fail tsc (the test would not compile).
    const fromMirror: RubricRegistryTaskType = 'audit' satisfies RubricTaskType;
    const toMirror: RubricTaskType = 'code-development' satisfies RubricRegistryTaskType;
    const round: RubricTaskType = fromMirror;
    const back: RubricRegistryTaskType = toMirror;
    expect([fromMirror, toMirror, round, back]).toEqual([
      'audit',
      'code-development',
      'audit',
      'code-development',
    ]);
  });

  it('task-router TaskType is bidirectionally assignable to/from RouterTaskType', () => {
    const fromMirror: RouterAliasTaskType = 'design' satisfies RouterTaskType;
    const toMirror: RouterTaskType = 'unknown' satisfies RouterAliasTaskType;
    const round: RouterTaskType = fromMirror;
    const back: RouterAliasTaskType = toMirror;
    expect([fromMirror, toMirror, round, back]).toEqual([
      'design',
      'unknown',
      'design',
      'unknown',
    ]);
  });

  it('adr-selector TaskType is bidirectionally assignable to/from AdrTaskType', () => {
    const fromMirror: AdrSelectorTaskType = 'security' satisfies AdrTaskType;
    const toMirror: AdrTaskType = 'core-dev' satisfies AdrSelectorTaskType;
    const round: AdrTaskType = fromMirror;
    const back: AdrSelectorTaskType = toMirror;
    expect([fromMirror, toMirror, round, back]).toEqual([
      'security',
      'core-dev',
      'security',
      'core-dev',
    ]);
  });
});

describe('WM-2 306-015 — detectTaskType returns values within the canonical mirror union', () => {
  const RUBRIC_UNION: readonly RubricTaskType[] = ['audit', 'document-write', 'code-development'];
  const ROUTER_UNION: readonly RouterTaskType[] = ['code', 'test', 'doc', 'design', 'unknown'];

  it('rubric-registry detectTaskType output is a RubricTaskType member', () => {
    const audit = detectRubricType(
      makeTask({ scope: { directories: [], filesRead: [], filesWrite: ['docs/audits/s/r.md'] } }),
    );
    const doc = detectRubricType(
      makeTask({ scope: { directories: [], filesRead: [], filesWrite: ['docs/guide.md'] } }),
    );
    const code = detectRubricType(
      makeTask({ scope: { directories: ['src/orchestra/'], filesRead: [], filesWrite: ['src/orchestra/x.ts'] } }),
    );
    expect(audit).toBe<RubricTaskType>('audit');
    expect(doc).toBe<RubricTaskType>('document-write');
    expect(code).toBe<RubricTaskType>('code-development');
    for (const t of [audit, doc, code]) expect(RUBRIC_UNION).toContain(t);
  });

  it('task-router detectTaskType output is a RouterTaskType member', () => {
    const code = detectRouterType(
      makeTask({ scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/x.ts'] } }),
    );
    const design = detectRouterType(
      makeTask({ scope: { directories: ['ui/'], filesRead: [], filesWrite: ['ui/button.css'] } }),
    );
    const doc = detectRouterType(
      makeTask({ scope: { directories: ['docs/'], filesRead: [], filesWrite: ['docs/x.md'] } }),
    );
    const unknown = detectRouterType(
      makeTask({ scope: { directories: [], filesRead: [], filesWrite: [] } }),
    );
    expect(code).toBe<RouterTaskType>('code');
    expect(design).toBe<RouterTaskType>('design');
    expect(doc).toBe<RouterTaskType>('doc');
    expect(unknown).toBe<RouterTaskType>('unknown');
    for (const t of [code, design, doc, unknown]) expect(ROUTER_UNION).toContain(t);
  });
});

describe('WM-2 306-015 — TASK_TYPE_ADR_PRESETS keys are exactly the AdrTaskType union', () => {
  it('every preset key is an AdrTaskType and the full union is covered', () => {
    const ADR_UNION: readonly AdrTaskType[] = [
      'core-dev', 'docs', 'test', 'cli', 'mcp',
      'security', 'observability', 'orchestra', 'provider', 'dashboard',
    ];
    const keys = Object.keys(TASK_TYPE_ADR_PRESETS) as AdrTaskType[];
    expect(new Set(keys)).toEqual(new Set(ADR_UNION));
    for (const k of keys) expect(ADR_UNION).toContain(k);
  });
});

describe('WM-2 306-015 — net-zero behavior preserved after dedup', () => {
  it('getRubric still selects the audit rubric for an audit task', () => {
    const rubric = getRubric(
      makeTask({ scope: { directories: [], filesRead: [], filesWrite: ['docs/audits/s/r.md'] } }),
    );
    expect(rubric.criteria.map((c) => c.name)).toContain('audit_completeness');
  });

  it('getRubric still selects the code rubric for a source task', () => {
    const rubric = getRubric(
      makeTask({ scope: { directories: ['src/orchestra/'], filesRead: [], filesWrite: ['src/orchestra/x.ts'] } }),
    );
    expect(rubric.criteria.map((c) => c.name)).toContain('test_coverage');
  });

  it('getEffectClass maps audit→pure and code→reversible (unchanged)', () => {
    const auditTask = makeTask({ scope: { directories: [], filesRead: [], filesWrite: ['docs/audits/s/r.md'] } });
    const codeTask = makeTask({ scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/x.ts'] } });
    expect(getEffectClass(auditTask)).toBe('pure');
    expect(getEffectClass(codeTask)).toBe('reversible');
  });
});
