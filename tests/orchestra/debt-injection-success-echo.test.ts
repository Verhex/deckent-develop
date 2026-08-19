/**
 * sprint-573/574 — DEBT-INJECTION-SUCCESS-ECHO.
 *
 * Live case (stability runs R2/R3, sprints 573/574): critical debt rows whose
 * note was dominated by verification evidence ("LOCAL_VERIFIED: tsc exit 0,
 * 19/19 passed …") were injected as CRITICAL "Fix debt:" tasks. The fix
 * workers read a success report, found nothing actionable, honestly NO_GO'd
 * — exhausting the FIX budget and parking the whole run (4 of 8 tasks never
 * dispatched).
 *
 * This file verifies the success-echo skip class:
 *  - typed `class: 'success-echo'` (producer-side, recordDebtEntry) →
 *    skippedNoop (never resolved — classification, not verified closure);
 *  - legacy rows without a class fall back to the same text test
 *    (isSuccessOnlyDebtNote): success evidence present AND no gap language;
 *  - a note that mixes success evidence WITH residual-gap language (the
 *    debt-561-002 live shape) is still injected — gap wins;
 *  - injected tasks strip the fixed evaluator preamble from the title and
 *    frame the description so fix workers implement the gap instead of
 *    re-reading green evidence as "already done".
 */

import { describe, it, expect } from 'vitest';

import { injectCriticalDebtTasks } from '../../src/orchestra/sprint-planner.js';
import { isSuccessOnlyDebtNote } from '../../src/orchestra/debt-manager.js';
import { DebtPriority, TaskStatus } from '../../src/core/types.js';
import type { DebtItem, ModelType } from '../../src/core/types.js';

const MODEL: ModelType = 'claude-sonnet-5';
const SPRINT_ID = 'sprint-575';

function makeDebt(overrides: Partial<DebtItem>): DebtItem {
  return {
    id: 'debt-573-006',
    description: 'placeholder',
    originTaskId: '573-006',
    originSprintId: 'sprint-573',
    priority: DebtPriority.CRITICAL,
    sprintsOpen: 2,
    resolved: false,
    resolvedInSprintId: undefined,
    createdAt: '2026-08-19T00:00:00.000Z',
    ...overrides,
  };
}

// Pure success report — no gap language anywhere (the injectable-noop shape).
const PURE_SUCCESS_NOTE =
  'Task evaluated as GO_WITH_TECH_DEBT. Notes: LOCAL_VERIFIED: npx tsc --noEmit exit 0. '
  + 'Targeted set passed: 2 files, 19/19 tests. Real-repo gate run exited 0 (CLEAN).';

// The debt-561-002 live shape: success evidence up front, real residual after.
const MIXED_SUCCESS_PLUS_GAP_NOTE =
  'Task evaluated as GO_WITH_TECH_DEBT. Notes: LOCAL_VERIFIED: npx tsc --noEmit exit 0. '
  + 'Targeted set passed 19/19. Residual: the eligibility lint still skips generated '
  + 'routing files — remaining work is wiring the generated surface into the gate.';

describe('sprint-573/574 — injectCriticalDebtTasks success-echo skip', () => {
  it('typed class success-echo → skippedNoop, no task, not in skipped', () => {
    const result = injectCriticalDebtTasks(
      [makeDebt({ class: 'success-echo', description: PURE_SUCCESS_NOTE })],
      SPRINT_ID, MODEL, 1, TaskStatus.PENDING,
    );
    expect(result.tasks).toHaveLength(0);
    expect(result.skippedNoop).toEqual(['debt-573-006']);
    expect(result.skipped).toHaveLength(0);
  });

  it('legacy row (no class) with a pure-success note → skippedNoop via the text fallback', () => {
    const result = injectCriticalDebtTasks(
      [makeDebt({ description: PURE_SUCCESS_NOTE })],
      SPRINT_ID, MODEL, 1, TaskStatus.PENDING,
    );
    expect(result.tasks).toHaveLength(0);
    expect(result.skippedNoop).toEqual(['debt-573-006']);
  });

  it('mixed success+gap note (debt-561-002 live shape) is still injected — gap wins', () => {
    const result = injectCriticalDebtTasks(
      [makeDebt({ description: MIXED_SUCCESS_PLUS_GAP_NOTE })],
      SPRINT_ID, MODEL, 1, TaskStatus.PENDING,
    );
    expect(result.tasks).toHaveLength(1);
    expect(result.skippedNoop).toHaveLength(0);
  });

  it('producer-typed standard class is authoritative — text fallback does not run', () => {
    const result = injectCriticalDebtTasks(
      [makeDebt({ class: 'standard', description: PURE_SUCCESS_NOTE })],
      SPRINT_ID, MODEL, 1, TaskStatus.PENDING,
    );
    expect(result.tasks).toHaveLength(1);
  });

  it('injected task strips the evaluator preamble from the title and frames the description', () => {
    const result = injectCriticalDebtTasks(
      [makeDebt({ description: MIXED_SUCCESS_PLUS_GAP_NOTE })],
      SPRINT_ID, MODEL, 1, TaskStatus.PENDING,
    );
    const task = result.tasks[0]!;
    expect(task.title).not.toContain('Task evaluated as');
    expect(task.title).toContain('Fix debt: LOCAL_VERIFIED');
    expect(task.description).toContain('Implement ONLY the residual/remaining gap(s)');
    // The full note stays in the description verbatim (worker still sees everything).
    expect(task.description).toContain('Residual: the eligibility lint still skips');
  });
});

describe('isSuccessOnlyDebtNote', () => {
  it('true for pure verification-evidence notes', () => {
    expect(isSuccessOnlyDebtNote(PURE_SUCCESS_NOTE)).toBe(true);
  });

  it('false when any gap language is present (residual/remaining)', () => {
    expect(isSuccessOnlyDebtNote(MIXED_SUCCESS_PLUS_GAP_NOTE)).toBe(false);
  });

  it('false for a note with no success signal at all (plain defect description)', () => {
    expect(isSuccessOnlyDebtNote('The retry loop never resets its counter after the third attempt.')).toBe(false);
  });

  it('false for empty/undefined', () => {
    expect(isSuccessOnlyDebtNote(undefined)).toBe(false);
    expect(isSuccessOnlyDebtNote('')).toBe(false);
  });
});
