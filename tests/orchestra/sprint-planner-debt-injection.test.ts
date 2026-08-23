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
import { buildTaskPrompt } from '../../src/orchestra/prompt-god-template.js';
import { buildDockerAllowedTools } from '../../src/orchestra/spawn-backend-docker.js';
import { DebtPriority, TaskStatus } from '../../src/core/types.js';
import type { DebtItem, ModelType } from '../../src/core/types.js';

const MODEL: ModelType = 'claude-sonnet-5';
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
    // Sprint 260 BOUNDARY-TEST-PATTERN: mirrorTestScope auto-adds tests/orchestra/
    // alongside src/orchestra/ for code-development tasks so workers can add tests
    // without a BOUNDARY_VIOLATION.
    expect(fix.scope.directories).toEqual(['src/orchestra/', 'tests/orchestra/']);
    expect(fix.scope.filesWrite).toEqual(['src/orchestra/event-stream.ts']);
    // Directories are already navigation context; exact reads mirror targets.
    expect(fix.scope.filesRead).toEqual(['src/orchestra/event-stream.ts']);
    expect(fix.priority).toBe('CRITICAL');
    expect(fix.isPriorityFix).toBe(true);
    expect(fix.fixForTaskId).toBe('178-001');
    expect(result.skipped).toEqual([]);
    expect(result.nextSeq).toBe(2);
  });

  it('keeps a protected root target observable without granting worker write authority', () => {
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

    const result = injectCriticalDebtTasks(debt, SPRINT_ID, MODEL, 1, TaskStatus.PENDING);
    const fix = result.tasks[0]!;
    expect(fix.scope.filesRead).toEqual([
      'package.json',
      'scripts/lint-sprint-archive-writers.mjs',
    ]);

    const { prompt } = buildTaskPrompt(fix, {
      effort: 'high',
      trackedFiles: ['package.json', 'scripts/lint-sprint-archive-writers.mjs'],
    });
    const readBlock = prompt.slice(
      prompt.indexOf('Exact read-only project files:'),
      prompt.indexOf('WRITE authority (canonical'),
    );
    const writeBlock = prompt.slice(prompt.indexOf('WRITE authority (canonical'));
    expect(readBlock).toContain('  - package.json');
    expect(writeBlock).not.toContain('  - package.json');
    expect(writeBlock).toContain('  - scripts/lint-sprint-archive-writers.mjs');
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

  it('keeps a directory-only origin debt writable across prompt and Docker authority', () => {
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

    const result = injectCriticalDebtTasks(debt, SPRINT_ID, MODEL, 1, TaskStatus.PENDING);

    expect(result.tasks).toHaveLength(1);
    const fix = result.tasks[0]!;
    expect(fix.type).toBe('code-development');
    expect(fix.scope).toEqual({
      directories: ['src/core/', 'tests/core/'],
      filesRead: [],
      filesWrite: [],
    });

    const { prompt } = buildTaskPrompt(fix, { effort: 'high' });
    expect(prompt).toContain('You may ONLY modify files in these directories:');
    expect(prompt).toContain('src/core/');
    expect(prompt).toContain('tests/core/');
    expect(prompt).not.toContain('## Scope Rules (inspection-only)');
    expect(prompt).not.toContain('PROJECT WRITE authority: NONE');

    expect(buildDockerAllowedTools(fix.scope)).toBe(
      'Read,Write(.tasks/,src/core/,tests/core/),Edit(.tasks/,src/core/,tests/core/),Bash,Glob,Grep',
    );
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
    // Sprint 260 BOUNDARY-TEST-PATTERN: mirrorTestScope auto-adds tests/ alongside src/
    // for code-development tasks.
    expect(fix.scope.directories).toEqual(['src/', 'tests/']);
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
