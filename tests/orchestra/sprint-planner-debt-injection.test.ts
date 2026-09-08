/**
 * Sprint 179 W1-1 — Auto-debt empty-scope inheritance.
 *
 * Verifies the `injectCriticalDebtTasks()` helper extracted from `planSprint()`:
 *  - inheritance: CRITICAL debt carrying `originScope` produces a fix task with
 *    that scope (not the legacy empty scope that previously stranded fix work).
 *  - skip: CRITICAL debt with `class === 'verified-no-result'` is skipped
 *    (honest closure — no follow-up task needed).
 *  - legacy hold: a debt without paired V2 origin authority remains visible
 *    and open; it is never widened into a broad `src/` fix task.
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';

import { injectCriticalDebtTasks } from '../../src/orchestra/sprint-planner.js';
import { buildTaskPrompt } from '../../src/orchestra/prompt-god-template.js';
import { buildDockerAllowedTools } from '../../src/orchestra/spawn-backend-docker.js';
import { DebtPriority, TaskStatus } from '../../src/core/types.js';
import type { DebtItem, ModelType } from '../../src/core/types.js';
import { canonicalJson } from '../../src/core/audit-writer.js';
import { productionWiringPlanFixture } from '../helpers/production-wiring-plan-fixture.js';

const MODEL: ModelType = 'claude-sonnet-5';
const SPRINT_ID = 'sprint-179';

function makeDebt(overrides: Partial<DebtItem>, withAuthority = true): DebtItem {
  const debt: DebtItem = {
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
  if (!withAuthority) return debt;
  const authority = productionWiringPlanFixture();
  const originScope = debt.originScope ?? { directories: [], filesWrite: [] };
  debt.originProductionWiring = authority;
  debt.originProductionWiringBinding = createHash('sha256').update(canonicalJson({
    originTaskId: debt.originTaskId, originScope,
    contractDigest: authority.contractDigest,
    hostProofProgramDigest: authority.hostProofProgramDigest,
  })).digest('hex');
  return debt;
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
    // Sprint 260 BOUNDARY-TEST-PATTERN: mirrorTestScope auto-adds tests/orchestra/
    // alongside src/orchestra/ for code-development tasks so workers can add tests
    // without a BOUNDARY_VIOLATION.
    expect(fix.scope.directories).toEqual(['src/orchestra', 'tests/orchestra']);
    expect(fix.scope.filesWrite).toEqual(['src/orchestra/event-stream.ts']);
    // Directories are already navigation context; exact reads mirror targets.
    expect(fix.scope.filesRead).toEqual([]);
    expect(fix.priority).toBe('CRITICAL');
    expect(fix.isPriorityFix).toBe(true);
    expect(fix.fixForTaskId).toBe('178-001');
    expect(result.skipped).toEqual([]);
    expect(result.nextSeq).toBe(2);
  });

  it('holds when the residual scope can write a trusted verifier asset', () => {
    const debt: DebtItem[] = [
      makeDebt({
        id: 'DEBT-PROTECTED-ROOT',
        description: 'package.json lint:gates must contain the archive writer ratchet',
        originScope: {
          directories: ['scripts/'],
          filesWrite: ['package.json', 'scripts/lint-sprint-archive-writers.mjs'],
        },
      }),
    ];

    expect(() => injectCriticalDebtTasks(debt, SPRINT_ID, MODEL, 1, TaskStatus.PENDING))
      .toThrow(/can write a trusted verifier asset/);
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

  it('holds a directory residual whose inherited contract verifier is writable', () => {
    const debt: DebtItem[] = [
      makeDebt({
        id: 'DEBT-DIRECTORY-WRITE',
        description: 'Repair the affected core area when no exact file survived recovery',
        originScope: {
          directories: ['src/core/'],
          filesWrite: [],
        },
      }),
    ];

    expect(() => injectCriticalDebtTasks(debt, SPRINT_ID, MODEL, 1, TaskStatus.PENDING))
      .toThrow(/can write a trusted verifier asset/);
  });

  it('(c) legacy debt remains open as an explicit hold (no broad fallback)', () => {
    const debt: DebtItem[] = [
      makeDebt({
        id: 'DEBT-LEGACY',
        description: 'Pre-W1-1 debt row, no originScope persisted',
      }, false),
    ];

    const result = injectCriticalDebtTasks(debt, SPRINT_ID, MODEL, 1, TaskStatus.PENDING);

    expect(result.tasks).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.held).toEqual([{ debtId: 'DEBT-LEGACY', reason: 'legacy-unavailable' }]);
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
