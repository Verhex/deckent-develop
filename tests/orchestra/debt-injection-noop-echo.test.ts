/**
 * born-603 (396-003) — DEBT-INJECTION-NOOP-ECHO.
 *
 * Live case (sprint-395 plan): a fix-wave task (`<id>-fix` / `<id>-xfix`)
 * investigates a debt item, finds nothing wrong, and still lands a
 * GO_WITH_TECH_DEBT/NO_GO debt-ledger row (recordDebtEntry has no "no-defect"
 * DebtClass yet — that producer-side fix is tracked separately, out of this
 * task's scope). `injectCriticalDebtTasks()` used to re-inject that row as a
 * fresh CRITICAL "Priority fix for critical debt item" task every sprint —
 * spawning another no-op investigation worker that reports the same "no
 * defect" finding forever.
 *
 * This file verifies the new conjunctive "honest no-op fix-wave echo" skip
 * class added to `injectCriticalDebtTasks()`:
 *  - BOTH signals required: originTaskId matches `-fix`/`-xfix` AND the debt
 *    note (now the FULL `description`, sourced from `content` in the
 *    readContext row→DebtItem mapper) contains a no-defect marker.
 *  - Skipped ids land in the NEW `skippedNoop` array, NOT the existing
 *    `skipped` array — the caller (`planSprint`) only `resolveDebt()`s ids in
 *    `skipped` (permanent closure); a heuristic text-match false positive
 *    must stay open for re-evaluation, not close real debt forever.
 *  - Genuine actionable fix-wave debt (no no-defect marker) is injected
 *    exactly as before — no over-broad skip.
 *  - The injected task's `description` carries the full debt note, not the
 *    old generic "Priority fix for critical debt item X" placeholder.
 */

import { describe, it, expect } from 'vitest';

import { injectCriticalDebtTasks } from '../../src/orchestra/sprint-planner.js';
import { DebtPriority, TaskStatus } from '../../src/core/types.js';
import type { DebtItem, ModelType } from '../../src/core/types.js';

const MODEL: ModelType = 'claude-sonnet-5';
const SPRINT_ID = 'sprint-396';

function makeDebt(overrides: Partial<DebtItem>): DebtItem {
  return {
    id: 'DEBT-001',
    description: 'placeholder',
    originTaskId: '395-014',
    originSprintId: 'sprint-395',
    priority: DebtPriority.CRITICAL,
    sprintsOpen: 1,
    resolved: false,
    resolvedInSprintId: undefined,
    createdAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

// Mirrors the real recordDebtEntry() content shape (debt-manager.ts):
// `${evalLabel}. Notes: ${result.notes}` — the worker's own investigation
// notes land verbatim after "Notes: ".
const HONEST_NOOP_NOTE =
  'Task evaluated as GO_WITH_TECH_DEBT. Notes: Investigated the reported issue in '
  + 'src/orchestra/foo.ts — no defect found; no source change was necessary. The '
  + 'behavior described in the debt ticket does not reproduce under current code.';

const REAL_DEFECT_NOTE =
  'Task evaluated as GO_WITH_TECH_DEBT. Notes: Root cause found in src/orchestra/foo.ts — '
  + 'the retry loop never resets its counter on success, causing an off-by-one after the '
  + 'third retry. Fix requires resetting the counter in the success branch.';

describe('born-603 — injectCriticalDebtTasks honest no-op fix-wave echo', () => {
  it('(1) REPRODUCE: fix-wave origin + no-defect note → skipped as noop, not injected, not in `skipped`', () => {
    const debt: DebtItem[] = [
      makeDebt({
        id: 'debt-395-014-fix',
        originTaskId: '395-014-fix',
        description: HONEST_NOOP_NOTE,
      }),
    ];

    const result = injectCriticalDebtTasks(debt, SPRINT_ID, MODEL, 1, TaskStatus.PENDING);

    expect(result.tasks).toEqual([]);
    expect(result.skippedNoop).toEqual(['debt-395-014-fix']);
    expect(result.skipped).toEqual([]);
    expect(result.nextSeq).toBe(1);
  });

  it('(2) REGRESSION: fix-wave origin + real-defect note → injected exactly as before', () => {
    const debt: DebtItem[] = [
      makeDebt({
        id: 'debt-395-020-fix',
        originTaskId: '395-020-fix',
        description: REAL_DEFECT_NOTE,
      }),
    ];

    const result = injectCriticalDebtTasks(debt, SPRINT_ID, MODEL, 1, TaskStatus.PENDING);

    expect(result.tasks).toHaveLength(1);
    expect(result.skippedNoop).toEqual([]);
    expect(result.skipped).toEqual([]);
    const fix = result.tasks[0]!;
    expect(fix.isPriorityFix).toBe(true);
    expect(fix.priority).toBe('CRITICAL');
    expect(fix.fixForTaskId).toBe('395-020-fix');
    expect(result.nextSeq).toBe(2);
  });

  it('(3) conjunctive guard A: no-defect note but NON-fix-wave origin → injected normally (content alone is insufficient)', () => {
    const debt: DebtItem[] = [
      makeDebt({
        id: 'debt-395-030',
        originTaskId: '395-030', // no -fix / -xfix suffix
        description: HONEST_NOOP_NOTE,
      }),
    ];

    const result = injectCriticalDebtTasks(debt, SPRINT_ID, MODEL, 1, TaskStatus.PENDING);

    expect(result.tasks).toHaveLength(1);
    expect(result.skippedNoop).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it('(4) conjunctive guard B: fix-wave origin but no no-defect marker → injected normally (origin alone is insufficient)', () => {
    const debt: DebtItem[] = [
      makeDebt({
        id: 'debt-395-040-fix',
        originTaskId: '395-040-fix',
        description: REAL_DEFECT_NOTE,
      }),
    ];

    const result = injectCriticalDebtTasks(debt, SPRINT_ID, MODEL, 1, TaskStatus.PENDING);

    expect(result.tasks).toHaveLength(1);
    expect(result.skippedNoop).toEqual([]);
  });

  it('(5) `-xfix` suffix (cross-fix tasks) also classifies as fix-wave origin', () => {
    const debt: DebtItem[] = [
      makeDebt({
        id: 'debt-395-050-xfix',
        originTaskId: '395-050-xfix',
        description: 'Task evaluated as GO_WITH_TECH_DEBT. Notes: no source change needed — dependency already satisfied.',
      }),
    ];

    const result = injectCriticalDebtTasks(debt, SPRINT_ID, MODEL, 1, TaskStatus.PENDING);

    expect(result.tasks).toEqual([]);
    expect(result.skippedNoop).toEqual(['debt-395-050-xfix']);
  });

  it('(6) description carries the full debt note verbatim, not the old generic placeholder', () => {
    const debt: DebtItem[] = [
      makeDebt({
        id: 'debt-395-020-fix',
        originTaskId: '395-020-fix',
        description: REAL_DEFECT_NOTE,
        originScope: { directories: ['src/orchestra/'], filesWrite: ['src/orchestra/foo.ts'] },
      }),
    ];

    const result = injectCriticalDebtTasks(debt, SPRINT_ID, MODEL, 1, TaskStatus.PENDING);

    const fix = result.tasks[0]!;
    expect(fix.description).toContain(REAL_DEFECT_NOTE);
    expect(fix.description).not.toContain('Priority fix for critical debt item');
    // scope note is still appended for worker context
    expect(fix.description).toContain('Origin scope inherited');
  });

  it('(7) `skippedNoop` and the existing `skipped` (verified-no-result) stay independent', () => {
    const debt: DebtItem[] = [
      makeDebt({
        id: 'debt-verified',
        originTaskId: '395-060',
        class: 'verified-no-result',
        description: 'Earlier sprint verified no follow-up needed',
      }),
      makeDebt({
        id: 'debt-395-070-fix',
        originTaskId: '395-070-fix',
        description: HONEST_NOOP_NOTE,
      }),
    ];

    const result = injectCriticalDebtTasks(debt, SPRINT_ID, MODEL, 1, TaskStatus.PENDING);

    expect(result.tasks).toEqual([]);
    expect(result.skipped).toEqual(['debt-verified']);
    expect(result.skippedNoop).toEqual(['debt-395-070-fix']);
  });

  it('(8) long note is truncated in the task TITLE but kept full in the description', () => {
    const longNote = 'Task evaluated as GO_WITH_TECH_DEBT. Notes: '
      + 'A'.repeat(200) + ' — root cause identified, fix required.';
    const debt: DebtItem[] = [
      makeDebt({
        id: 'debt-395-080-fix',
        originTaskId: '395-080-fix',
        description: longNote,
      }),
    ];

    const result = injectCriticalDebtTasks(debt, SPRINT_ID, MODEL, 1, TaskStatus.PENDING);

    const fix = result.tasks[0]!;
    expect(fix.title.length).toBeLessThan(longNote.length);
    expect(fix.description).toContain(longNote);
  });
});
