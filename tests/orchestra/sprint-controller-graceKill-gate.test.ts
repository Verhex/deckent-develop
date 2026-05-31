// ═══ Sprint 199 199-001 — Synthetic NO_GO Kaynak 7 Gate ══════════════
// W-INTEGRITY — graceKill disk-verify gate.
//
// Closes the ungated synthetic NO_GO paths at sprint-controller.ts:
//   • panic-guard BLOCK branch
//   • explicit-kill branch
// Both wrote synthetic NO_GO without consulting disk state. Mirrors the
// existing disk-verify gate at result-collector.ts:513-583.

import { describe, it, expect } from 'vitest';

import {
  gateSyntheticGraceKillResult,
} from '../../src/orchestra/sprint-controller.js';
import {
  makeStaticNumstatProvider,
  makeStaticLsOthersProvider,
  type GitDiffNumstatProvider,
  type GitLsOthersProvider,
} from '../../src/orchestra/disk-verify.js';
import type { Task, TaskResult, TaskScope } from '../../src/core/types.js';
import { TaskStatus } from '../../src/core/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────

function makeScope(overrides: Partial<TaskScope> = {}): TaskScope {
  return {
    directories: ['src/orchestra/'],
    filesRead: [],
    filesWrite: ['src/orchestra/foo.ts'],
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '199-001',
    title: 'Test',
    description: '',
    model: 'opus',
    effort: 'normal',
    priority: 'NORMAL',
    reason: '',
    scope: makeScope(),
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: TaskStatus.EXECUTING,
    sprintId: 'sprint-199',
    createdAt: '2026-05-31T00:00:00Z',
    assignedWorker: 'w-199-001',
    ...overrides,
  } as Task;
}

function makeBaseBlocked(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '199-001',
    workerId: 'w-199-001',
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: false,
    coverage: 0,
    selfAssessment: 'NO_GO',
    notes:
      'Worker had heartbeat but failed to write result within grace period — ' +
      'kill blocked by panic guard (user approval required); liveness=alive',
    ...overrides,
  };
}

function makeBaseKilled(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '199-001',
    workerId: 'w-199-001',
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: false,
    coverage: 0,
    selfAssessment: 'NO_GO',
    notes:
      'Worker had heartbeat but failed to write result within grace period — ' +
      'killed (user-explicit override); liveness=alive',
    ...overrides,
  };
}

// ─── (a) BLOCK + disk empty → legacy NO_GO preserved ─────────────────

describe('gateSyntheticGraceKillResult — Sprint 199 199-001 KAYNAK 7', () => {
  it('(a) panic-guard BLOCK + disk empty → returns base NO_GO unchanged (legacy preserved)', () => {
    const task = makeTask();
    const base = makeBaseBlocked();
    const gated = gateSyntheticGraceKillResult(
      '/tmp/fake', task, base, 'grace-kill-blocked',
      {
        numstatProvider: makeStaticNumstatProvider(0),
        lsOthersProvider: makeStaticLsOthersProvider([]),
      },
    );
    expect(gated.reclassified).toBe(false);
    expect(gated.result).toBe(base);
    expect(gated.diskVerify.hasDiskEvidence).toBe(false);
  });

  // ─── (b) BLOCK + disk evidence → MANUAL_REVIEW_REQUIRED ──────────
  it('(b) panic-guard BLOCK + disk has tracked diff → reclassified with disk findings', () => {
    const task = makeTask();
    const base = makeBaseBlocked();
    const gated = gateSyntheticGraceKillResult(
      '/tmp/fake', task, base, 'grace-kill-blocked',
      {
        numstatProvider: makeStaticNumstatProvider(42),
        lsOthersProvider: makeStaticLsOthersProvider([]),
      },
    );
    expect(gated.reclassified).toBe(true);
    expect(gated.diskVerify.linesAdded).toBe(42);
    expect(gated.result.linesAdded).toBe(42);
    expect(gated.result.notes).toContain('disk-verify found evidence');
    expect(gated.result.notes).toContain('linesAdded=42');
    expect(gated.result.notes).toContain('cause=grace-kill-blocked');
    expect(gated.result.notes).toContain('MANUAL_REVIEW_REQUIRED');
    // selfAssessment stays NO_GO — caller mutates task.status, not the result
    expect(gated.result.selfAssessment).toBe('NO_GO');
  });

  // ─── (c) Explicit-kill + disk evidence → MANUAL_REVIEW_REQUIRED ──
  it('(c) explicit-kill path + untracked files → reclassified with disk findings', () => {
    const task = makeTask();
    const base = makeBaseKilled();
    const gated = gateSyntheticGraceKillResult(
      '/tmp/fake', task, base, 'grace-kill-explicit',
      {
        numstatProvider: makeStaticNumstatProvider(0),
        lsOthersProvider: makeStaticLsOthersProvider([
          'src/orchestra/new-feature.ts',
          'src/orchestra/new-helper.ts',
        ]),
      },
    );
    expect(gated.reclassified).toBe(true);
    expect(gated.result.filesChanged).toEqual([
      'src/orchestra/new-feature.ts',
      'src/orchestra/new-helper.ts',
    ]);
    expect(gated.result.notes).toContain('untrackedFiles=2');
    expect(gated.result.notes).toContain('cause=grace-kill-explicit');
  });

  // ─── (d) Idempotency: already MANUAL_REVIEW_REQUIRED → skip ──────
  it('(d) idempotent: task already MANUAL_REVIEW_REQUIRED → reclassified=false and verifier is NOT called', () => {
    // Track verifier invocations — when status is already MANUAL_REVIEW_REQUIRED,
    // the gate must short-circuit before consulting disk so no duplicate
    // audit event fires downstream.
    let numstatCalls = 0;
    let lsOthersCalls = 0;
    const numstatProvider: GitDiffNumstatProvider = {
      numstatSum(_paths) { numstatCalls += 1; return 999; },
    };
    const lsOthersProvider: GitLsOthersProvider = {
      lsOthers(_paths) { lsOthersCalls += 1; return ['src/orchestra/x.ts']; },
    };

    const task = makeTask({ status: TaskStatus.MANUAL_REVIEW_REQUIRED });
    const base = makeBaseBlocked();
    const gated = gateSyntheticGraceKillResult(
      '/tmp/fake', task, base, 'grace-kill-blocked',
      { numstatProvider, lsOthersProvider },
    );
    expect(gated.reclassified).toBe(false);
    expect(gated.result).toBe(base); // unchanged passthrough
    expect(numstatCalls).toBe(0);
    expect(lsOthersCalls).toBe(0);
  });

  // ─── Bonus: explicit-kill + disk empty → legacy NO_GO preserved ──
  it('explicit-kill + disk empty → returns base NO_GO unchanged', () => {
    const task = makeTask();
    const base = makeBaseKilled();
    const gated = gateSyntheticGraceKillResult(
      '/tmp/fake', task, base, 'grace-kill-explicit',
      {
        numstatProvider: makeStaticNumstatProvider(0),
        lsOthersProvider: makeStaticLsOthersProvider([]),
      },
    );
    expect(gated.reclassified).toBe(false);
    expect(gated.result).toBe(base);
  });
});
