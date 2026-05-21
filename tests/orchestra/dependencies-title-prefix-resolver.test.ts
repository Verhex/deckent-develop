import { describe, it, expect } from 'vitest';
import {
  resolveDependencyRef,
  resolveTaskDependencies,
  parseDependenciesDirective,
} from '../../src/orchestra/task-builder.js';

// ─── Sprint 182 W2-2 — Auto-debt prepend offset drift fix ────────────────
//
// Bug context (Sprint 176/178):
//   DIRECTIVES.md used Dependencies: ["178-002"] (plan-slot ID). When Brain
//   prepends critical-debt fix tasks at the head of the sprint, every plan
//   slot shifts forward by N. The hard-coded "178-002" then silently points
//   at the WRONG disk task (typically a freshly-prepended debt task), which
//   broke wave-ordering. Sprint 179 removed Dependencies entirely as a
//   stop-gap, but that also broke wave-order guarantees.
//
// Sprint 182 fix:
//   Dependencies field is back, with a new title-prefix convention. Refs
//   like "W1-1" or "GATE-2" are resolved against task.title via a token
//   match — surviving the auto-debt prepend shift. Plan-slot IDs still
//   work for back-compat, but only when the slot actually exists in the
//   final task list.

type TaskRef = { id: string; title: string };

const DIRECTIVE_TASKS: TaskRef[] = [
  { id: '182-001', title: 'W1-1 — Mock hygiene: orphan-cleaner-ipc + archive-debt renameSync' },
  { id: '182-002', title: 'W1-2 — cli/run.test.ts SpawnBackendFactory mock chain' },
  { id: '182-003', title: 'W1-3 — Full vitest sweep CI=true parity verify' },
  { id: '182-004', title: 'W2-1 — dependency_pipeline_enabled: true ADR-045 wire verify' },
  { id: '182-005', title: 'W2-2 — Auto-debt prepend offset drift fix (Dependencies title-prefix resolver)' },
];

// "After auto-debt prepend" — Brain inserted 2 critical-debt fix tasks at
// the head of the sprint. Every directive task's plan-slot ID shifted by 2,
// but the title prefix (W1-1, W1-2, …) is unchanged.
const TASKS_AFTER_AUTO_DEBT_PREPEND: TaskRef[] = [
  { id: '182-001', title: 'Fix debt: ADR-019 reconciliation: language-agnostic verify' },
  { id: '182-002', title: 'Fix debt: stale heartbeat watchdog cascade' },
  { id: '182-003', title: 'W1-1 — Mock hygiene: orphan-cleaner-ipc + archive-debt renameSync' },
  { id: '182-004', title: 'W1-2 — cli/run.test.ts SpawnBackendFactory mock chain' },
  { id: '182-005', title: 'W1-3 — Full vitest sweep CI=true parity verify' },
  { id: '182-006', title: 'W2-1 — dependency_pipeline_enabled: true ADR-045 wire verify' },
  { id: '182-007', title: 'W2-2 — Auto-debt prepend offset drift fix' },
];

describe('resolveDependencyRef — title-prefix + plan-slot resolution', () => {
  // Case 1 — title-prefix happy path
  it('resolves a title-prefix label to the task whose title contains it', () => {
    expect(resolveDependencyRef('W1-1', DIRECTIVE_TASKS)).toBe('182-001');
    expect(resolveDependencyRef('W2-1', DIRECTIVE_TASKS)).toBe('182-004');
    expect(resolveDependencyRef('W2-2', DIRECTIVE_TASKS)).toBe('182-005');
  });

  // Case 2 — plan-slot ID backward compatibility
  it('resolves a plan-slot ID by exact task.id lookup (back-compat)', () => {
    expect(resolveDependencyRef('182-001', DIRECTIVE_TASKS)).toBe('182-001');
    expect(resolveDependencyRef('182-004', DIRECTIVE_TASKS)).toBe('182-004');
  });

  // Case 3 — mixed array of title-prefix + plan-slot refs
  it('resolveTaskDependencies handles a mixed array (title-prefix + plan-slot)', () => {
    const refs = ['W1-1', '182-004', 'W2-2'];
    expect(resolveTaskDependencies(refs, DIRECTIVE_TASKS)).toEqual([
      '182-001',
      '182-004',
      '182-005',
    ]);
  });

  // Case 4 — missing reference resolves to undefined / dropped
  it('returns undefined for an unresolvable reference (and drops it in batch mode)', () => {
    expect(resolveDependencyRef('W9-9', DIRECTIVE_TASKS)).toBeUndefined();
    // Plan-slot that doesn't exist in the final task list:
    expect(resolveDependencyRef('999-999', DIRECTIVE_TASKS)).toBeUndefined();
    // Empty / whitespace / reserved keyword:
    expect(resolveDependencyRef('', DIRECTIVE_TASKS)).toBeUndefined();
    expect(resolveDependencyRef('   ', DIRECTIVE_TASKS)).toBeUndefined();
    expect(resolveDependencyRef('none', DIRECTIVE_TASKS)).toBeUndefined();
    // Batch resolution skips missing refs without throwing:
    expect(resolveTaskDependencies(['W1-1', 'BOGUS', '182-005'], DIRECTIVE_TASKS)).toEqual([
      '182-001',
      '182-005',
    ]);
  });

  // Case 5 — auto-debt prepend drift regression guard (THE bug this exists for)
  it('title-prefix ref survives auto-debt prepend offset drift (Sprint 176/178 regression)', () => {
    // The directive author wrote: Dependencies: ["W1-1"]
    // The W1-1 task moved from 182-001 → 182-003 because Brain prepended 2
    // critical-debt fix tasks. With title-prefix the resolver still finds
    // the real W1-1 task:
    expect(resolveDependencyRef('W1-1', TASKS_AFTER_AUTO_DEBT_PREPEND)).toBe('182-003');
    expect(resolveDependencyRef('W2-1', TASKS_AFTER_AUTO_DEBT_PREPEND)).toBe('182-006');
    expect(resolveDependencyRef('W2-2', TASKS_AFTER_AUTO_DEBT_PREPEND)).toBe('182-007');

    // Demonstrates the OLD bug: a stale plan-slot ID ("182-001") now points
    // at the debt task, NOT the W1-1 task. The resolver returns that wrong
    // id because the user explicitly asked for that slot — but this is
    // exactly why title-prefix is preferred. Caller can detect the mismatch
    // by comparing the resolved task's title to the directive intent.
    expect(resolveDependencyRef('182-001', TASKS_AFTER_AUTO_DEBT_PREPEND)).toBe('182-001');
    const drifted = TASKS_AFTER_AUTO_DEBT_PREPEND.find(t => t.id === '182-001');
    expect(drifted?.title.startsWith('Fix debt:')).toBe(true);
  });
});

describe('resolveDependencyRef — token boundary safety', () => {
  it('does not match a longer prefix that merely contains the ref as a substring', () => {
    // "W1-1" must NOT match "W1-10 …" — the trailing "0" must be a separator
    const tasks: TaskRef[] = [
      { id: '200-001', title: 'W1-10 — refactor wave gate' },
      { id: '200-002', title: 'W1-1 — mock hygiene fix' },
    ];
    expect(resolveDependencyRef('W1-1', tasks)).toBe('200-002');
    expect(resolveDependencyRef('W1-10', tasks)).toBe('200-001');
  });

  it('is case-insensitive', () => {
    const tasks: TaskRef[] = [
      { id: '200-001', title: 'W1-1 — mock hygiene fix' },
    ];
    expect(resolveDependencyRef('w1-1', tasks)).toBe('200-001');
    expect(resolveDependencyRef('W1-1', tasks)).toBe('200-001');
  });

  it('matches a ref appearing mid-title when surrounded by non-word separators', () => {
    const tasks: TaskRef[] = [
      { id: '200-001', title: 'Sprint integration smoke (GATE-3) for prompt rendering' },
    ];
    expect(resolveDependencyRef('GATE-3', tasks)).toBe('200-001');
  });

  it('returns undefined when the task list is empty', () => {
    expect(resolveDependencyRef('W1-1', [])).toBeUndefined();
  });
});

describe('parseDependenciesDirective × resolveDependencyRef — end-to-end', () => {
  it('parses a JSON-array title-prefix directive line and resolves both refs', () => {
    const refs = parseDependenciesDirective('- Dependencies: ["W1-1", "W1-2"]');
    expect(refs).toEqual(['W1-1', 'W1-2']);
    expect(resolveTaskDependencies(refs ?? [], DIRECTIVE_TASKS)).toEqual([
      '182-001',
      '182-002',
    ]);
  });

  it('parses a comma-separated mixed directive line and resolves all refs', () => {
    const refs = parseDependenciesDirective('Dependencies: W1-1, 182-004');
    expect(refs).toEqual(['W1-1', '182-004']);
    expect(resolveTaskDependencies(refs ?? [], DIRECTIVE_TASKS)).toEqual([
      '182-001',
      '182-004',
    ]);
  });

  it('end-to-end: directive title-prefix ref is correct after auto-debt prepend', () => {
    // Original DIRECTIVES had: "- Dependencies: [\"W1-1\"]"
    // Brain then prepended 2 debt tasks. The directive's intent (depend on
    // the mock-hygiene task) is preserved by the resolver:
    const refs = parseDependenciesDirective('- Dependencies: ["W1-1"]');
    const resolved = resolveTaskDependencies(refs ?? [], TASKS_AFTER_AUTO_DEBT_PREPEND);
    expect(resolved).toEqual(['182-003']);

    const blockingTask = TASKS_AFTER_AUTO_DEBT_PREPEND.find(t => t.id === resolved[0]);
    expect(blockingTask?.title.startsWith('W1-1')).toBe(true);
  });
});
