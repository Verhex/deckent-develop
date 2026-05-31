// ═══ Sprint 199 199-001 — Synthetic NO_GO Kaynak 6 Gate ══════════════
// W-INTEGRITY — runEvaluatePhase disk-verify gate.
//
// Closes the ungated synthetic NO_GO path at sprint-phases.ts:1318
// (Sprint 196 196-005 token-counter.ts pattern). Mirrors the existing
// disk-verify gate at result-collector.ts:513-583 (Sprint 195 195-001).

import { describe, it, expect } from 'vitest';

import {
  gateSyntheticTimeoutResult,
} from '../../src/orchestra/sprint-phases.js';
import {
  makeStaticNumstatProvider,
  makeStaticLsOthersProvider,
  DISK_VS_CLAIM_MISMATCH_CHANNEL,
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

function makeBaseSynthetic(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '199-001',
    workerId: 'w-199-001',
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: false,
    coverage: 0,
    selfAssessment: 'NO_GO',
    notes: 'Timeout - no result received (extension denied: ...); liveness=alive',
    ...overrides,
  };
}

// ─── (a) No disk evidence → legacy synthetic NO_GO preserved ──────────

describe('gateSyntheticTimeoutResult — Sprint 199 199-001 KAYNAK 6', () => {
  it('(a) no .result + no disk evidence → returns base synthetic NO_GO unchanged (legacy preserved)', () => {
    const task = makeTask();
    const base = makeBaseSynthetic();
    const gated = gateSyntheticTimeoutResult(
      '/tmp/fake', task, base, 'evaluate-no-result',
      {
        numstatProvider: makeStaticNumstatProvider(0),
        lsOthersProvider: makeStaticLsOthersProvider([]),
      },
    );
    expect(gated.reclassified).toBe(false);
    expect(gated.result).toBe(base);
    expect(gated.diskVerify.hasDiskEvidence).toBe(false);
    expect(gated.diskVerify.linesAdded).toBe(0);
    expect(gated.diskVerify.untrackedFiles).toEqual([]);
  });

  // ─── (b) Tracked diff (linesAdded > 0) → MANUAL_REVIEW_REQUIRED ───
  it('(b) no .result + tracked diff (linesAdded=85) → reclassified result with disk notes', () => {
    const task = makeTask();
    const base = makeBaseSynthetic();
    const gated = gateSyntheticTimeoutResult(
      '/tmp/fake', task, base, 'evaluate-no-result',
      {
        numstatProvider: makeStaticNumstatProvider(85),
        lsOthersProvider: makeStaticLsOthersProvider([]),
      },
    );
    expect(gated.reclassified).toBe(true);
    expect(gated.diskVerify.hasDiskEvidence).toBe(true);
    expect(gated.diskVerify.linesAdded).toBe(85);
    expect(gated.result.linesAdded).toBe(85);
    expect(gated.result.filesChanged).toEqual([]);
    expect(gated.result.notes).toContain('disk-verify found evidence');
    expect(gated.result.notes).toContain('linesAdded=85');
    expect(gated.result.notes).toContain('MANUAL_REVIEW_REQUIRED');
    expect(gated.result.notes).toContain('cause=evaluate-no-result');
    // selfAssessment stays NO_GO — status mutation is the caller's job
    expect(gated.result.selfAssessment).toBe('NO_GO');
  });

  // ─── (c) Untracked files (new file on disk) → MANUAL_REVIEW_REQUIRED
  it('(c) no .result + untracked file → reclassified with filesChanged from disk-verify', () => {
    const task = makeTask();
    const base = makeBaseSynthetic();
    const gated = gateSyntheticTimeoutResult(
      '/tmp/fake', task, base, 'evaluate-no-result',
      {
        numstatProvider: makeStaticNumstatProvider(0),
        lsOthersProvider: makeStaticLsOthersProvider([
          'src/orchestra/token-counter.ts',
        ]),
      },
    );
    expect(gated.reclassified).toBe(true);
    expect(gated.diskVerify.untrackedFiles).toEqual([
      'src/orchestra/token-counter.ts',
    ]);
    expect(gated.result.filesChanged).toEqual([
      'src/orchestra/token-counter.ts',
    ]);
    expect(gated.result.notes).toContain('untrackedFiles=1');
  });

  // ─── (d) Audit event channel constant (regression safety) ────────
  it('(d) DISK_VS_CLAIM_MISMATCH channel constant is the documented value', () => {
    // Production caller emits this exact channel via writeEvent. If the
    // constant ever drifts away from the documented value, downstream
    // consumers (auditor, dashboard) silently break — regression-guard
    // the contract here.
    expect(DISK_VS_CLAIM_MISMATCH_CHANNEL).toBe('BRAIN→AUDITOR:DISK_VS_CLAIM_MISMATCH');
  });

  // ─── (e) Sprint 196 196-005 simulation — token-counter.ts pattern ─
  it('(e) Sprint 196 196-005 token-counter.ts scenario → reclassified instead of synthetic NO_GO', () => {
    // Reproduces the catastrophic Sprint 196 196-005 path: worker exited
    // cleanly without a .result, no .timeout marker, ungated synthetic
    // NO_GO at sprint-phases.ts:1318 fired. With the disk-verify gate
    // wired, the new untracked token-counter.ts must trigger
    // reclassification to MANUAL_REVIEW_REQUIRED instead of NO_GO.
    const task = makeTask({
      id: '196-005',
      sprintId: 'sprint-196',
      assignedWorker: 'w-196-005',
      scope: {
        directories: ['src/orchestra/'],
        filesRead: [],
        filesWrite: ['src/orchestra/token-counter.ts'],
      },
    });
    const base = makeBaseSynthetic({
      taskId: '196-005',
      workerId: 'w-196-005',
      notes: 'Timeout - no result received (extension denied: max-reached); liveness=dead',
    });
    const gated = gateSyntheticTimeoutResult(
      '/tmp/fake', task, base, 'evaluate-no-result',
      {
        // worker created the new file but never committed (untracked)
        numstatProvider: makeStaticNumstatProvider(0),
        lsOthersProvider: makeStaticLsOthersProvider([
          'src/orchestra/token-counter.ts',
        ]),
      },
    );
    expect(gated.reclassified).toBe(true);
    expect(gated.diskVerify.hasDiskEvidence).toBe(true);
    expect(gated.result.filesChanged).toEqual(['src/orchestra/token-counter.ts']);
    expect(gated.result.notes).toContain('MANUAL_REVIEW_REQUIRED');
    expect(gated.result.notes).toContain('cause=evaluate-no-result');
  });

  // ─── Bonus: explicit cause string flows through to the notes ─────
  it('preserves cause string in the enriched notes for forensic traceability', () => {
    const task = makeTask();
    const base = makeBaseSynthetic({ notes: 'baseline notes' });
    const gated = gateSyntheticTimeoutResult(
      '/tmp/fake', task, base, 'custom-cause-xyz',
      {
        numstatProvider: makeStaticNumstatProvider(1),
        lsOthersProvider: makeStaticLsOthersProvider([]),
      },
    );
    expect(gated.result.notes).toContain('baseline notes');
    expect(gated.result.notes).toContain('cause=custom-cause-xyz');
  });
});
