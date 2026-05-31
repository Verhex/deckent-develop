/**
 * Sprint 179 W1-1 — Auto-debt empty-scope inheritance.
 *
 * Verifies the `injectCriticalDebtTasks()` helper extracted from `planSprint()`:
 *  - inheritance: CRITICAL debt carrying `originScope` produces a fix task with
 *    that scope (not the legacy empty scope that previously stranded fix work).
 *  - skip: CRITICAL debt with `class === 'verified-no-result'` is skipped
 *    (honest closure — no follow-up task needed).
 *  - legacy fallback: CRITICAL debt without `originScope` still gets a fix
 *    task, falling back to broad `src/` scope so pre-W1-1 debt rows continue
 *    to work.
 */

import { describe, it, expect } from 'vitest';

import { injectCriticalDebtTasks } from '../../src/orchestra/sprint-planner.js';
import { DebtPriority, TaskStatus } from '../../src/core/types.js';
import type { DebtItem, ModelType } from '../../src/core/types.js';

const MODEL: ModelType = 'sonnet';
const SPRINT_ID = 'sprint-179';

function makeDebt(overrides: Partial<DebtItem>): DebtItem {
  return {
    id: 'DEBT-001',
    description: 'placeholder',
    originTaskId: '178-001',
    originSprintId: 'sprint-178',
    priority: DebtPriority.CRITICAL,
    sprintsOpen: 1,
    resolved: false,
    resolvedInSprintId: undefined,
    createdAt: '2026-05-20T00:00:00.000Z',
    ...overrides,
  };
}

describe('Sprint 179 W1-1 — injectCriticalDebtTasks', () => {
  it('(a) inheritance: originScope on debt is copied into the fix task scope', () => {
    const debt: DebtItem[] = [
      makeDebt({
        id: 'DEBT-INHERIT',
        description: 'Boundary violation in event-stream',
        originScope: {
          directories: ['src/orchestra/'],
          filesWrite: ['src/orchestra/event-stream.ts'],
        },
      }),
    ];

    const result = injectCriticalDebtTasks(debt, SPRINT_ID, MODEL, 1, TaskStatus.PENDING);

    expect(result.tasks).toHaveLength(1);
    const fix = result.tasks[0]!;
    expect(fix.scope.directories).toEqual(['src/orchestra/']);
    expect(fix.scope.filesWrite).toEqual(['src/orchestra/event-stream.ts']);
    // filesRead defaults to the same directories so the worker can read what
    // it must write to (otherwise scope check would block legitimate edits).
    expect(fix.scope.filesRead).toEqual(['src/orchestra/']);
    expect(fix.priority).toBe('CRITICAL');
    expect(fix.isPriorityFix).toBe(true);
    expect(fix.fixForTaskId).toBe('178-001');
    expect(result.skipped).toEqual([]);
    expect(result.nextSeq).toBe(2);
  });

  it('(b) skip: class=verified-no-result debt produces no fix task', () => {
    const debt: DebtItem[] = [
      makeDebt({
        id: 'DEBT-VERIFIED',
        description: 'Earlier sprint verified no follow-up needed',
        class: 'verified-no-result',
        // Even with an originScope present, the verified-no-result class wins.
        originScope: {
          directories: ['src/orchestra/'],
          filesWrite: ['src/orchestra/result-collector.ts'],
        },
      }),
    ];

    const result = injectCriticalDebtTasks(debt, SPRINT_ID, MODEL, 1, TaskStatus.PENDING);

    expect(result.tasks).toEqual([]);
    expect(result.skipped).toEqual(['DEBT-VERIFIED']);
    expect(result.nextSeq).toBe(1);
  });

  it('(c) legacy fallback: debt without originScope still gets a fix task with broad src/ scope', () => {
    const debt: DebtItem[] = [
      makeDebt({
        id: 'DEBT-LEGACY',
        description: 'Pre-W1-1 debt row, no originScope persisted',
      }),
    ];

    const result = injectCriticalDebtTasks(debt, SPRINT_ID, MODEL, 1, TaskStatus.PENDING);

    expect(result.tasks).toHaveLength(1);
    const fix = result.tasks[0]!;
    expect(fix.scope.directories).toEqual(['src/']);
    expect(fix.scope.filesWrite).toEqual(['src/']);
    expect(fix.priority).toBe('CRITICAL');
    expect(fix.isPriorityFix).toBe(true);
    expect(result.skipped).toEqual([]);
    expect(result.nextSeq).toBe(2);
  });

  it('non-CRITICAL debts are ignored entirely', () => {
    const debt: DebtItem[] = [
      makeDebt({ id: 'DEBT-HIGH', priority: DebtPriority.HIGH }),
      makeDebt({ id: 'DEBT-NORMAL', priority: DebtPriority.NORMAL }),
    ];

    const result = injectCriticalDebtTasks(debt, SPRINT_ID, MODEL, 5, TaskStatus.PENDING);

    expect(result.tasks).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.nextSeq).toBe(5);
  });

  it('resolved debts are skipped (no fix task generated)', () => {
    const debt: DebtItem[] = [
      makeDebt({ id: 'DEBT-RESOLVED', resolved: true, resolvedInSprintId: 'sprint-178' }),
    ];

    const result = injectCriticalDebtTasks(debt, SPRINT_ID, MODEL, 1, TaskStatus.PENDING);

    expect(result.tasks).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.nextSeq).toBe(1);
  });
});
