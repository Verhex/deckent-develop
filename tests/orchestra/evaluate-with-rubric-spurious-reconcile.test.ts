/**
 * Sprint 191 P191-1 — evaluateWithRubric must wire reconcileSpuriousNoGo
 *
 * Sprint 189+190 dogfood: workers got Docker OOM-killed (exit 137 SIGKILL).
 * Partial-result (Sprint 151 safety net) promoted to .result with
 * selfAssessment='NO_GO' even though files were on disk.
 *
 * RC: result-evaluator.ts:1087 (evaluateWithRubric) → reconcileRubricNoGo ✓
 *     + reconcileSpuriousNoGo ✗ (Sprint 145 only wired into deprecated path)
 * Fix: when evaluateWithRubric returns NO_GO AND projectRoot provided,
 * attempt spurious reconciliation as a final fallback before NO_GO.
 * OOM-killed marker triggers vitest-skip (worker died before tests).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { evaluateWithRubric } from '../../src/orchestra/result-evaluator.js';
import * as midSprintAdapter from '../../src/orchestra/mid-sprint-adapter.js';
import type { TaskResult, Task } from '../../src/core/task-types.js';

const baseTask: Task = {
  id: '190-004',
  title: 'Native chat Path B',
  description: 'Build native chat',
  model: 'opus',
  effort: 'high',
  priority: 'NORMAL',
  reason: 'test',
  scope: {
    directories: ['src/'],
    filesRead: [],
    filesWrite: ['src/chat.ts'],
  },
  dependencies: [],
  goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
  status: 'PENDING',
  sprintId: 'sprint-190',
  createdAt: new Date().toISOString(),
} as Task;

const ooMResult: TaskResult = {
  taskId: '190-004',
  filesChanged: [],
  linesAdded: 0,
  linesRemoved: 0,
  testsPassed: false,
  coverage: 0,
  selfAssessment: 'NO_GO',
  notes:
    'Container OOM-killed (exit 137, SIGKILL). Partial-result promoted by host monitor.',
} as TaskResult;

const genuineNoGoResult: TaskResult = {
  taskId: '190-005',
  filesChanged: [],
  linesAdded: 0,
  linesRemoved: 0,
  testsPassed: false,
  coverage: 0,
  selfAssessment: 'NO_GO',
  notes: 'Genuine NO_GO — no work done',
} as TaskResult;

describe('evaluateWithRubric — Sprint 191 P191-1 spurious reconcile wire', () => {
  let reconcileSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    reconcileSpy = vi.spyOn(midSprintAdapter, 'reconcileSpuriousNoGo');
  });

  afterEach(() => {
    reconcileSpy.mockRestore();
  });

  it('OOM-killed NO_GO + projectRoot triggers reconcileSpuriousNoGo with vitest-skip dep', () => {
    reconcileSpy.mockReturnValue({
      decision: 'GO_WITH_TECH_DEBT',
      reconciled: true,
      notes: 'reconciled by test mock',
      linesChanged: 446,
      filesChanged: ['src/chat.ts'],
      tscPassed: true,
      vitestPassRatio: null,
      scopeCompliant: true,
    });

    const evaluation = evaluateWithRubric(ooMResult, baseTask, undefined, '/tmp/fake-root');

    // Fix asserted: reconcileSpuriousNoGo was called with vitest-skip deps for OOM
    expect(reconcileSpy).toHaveBeenCalledTimes(1);
    const call = reconcileSpy.mock.calls[0];
    expect(call[0]).toBe(ooMResult);
    expect(call[1]).toBe(baseTask);
    expect(call[2]).toBe('/tmp/fake-root');
    // OOM path injects runVitestScopeCheck mock (skip vitest)
    expect(call[3]).toBeDefined();
    expect(typeof call[3]?.runVitestScopeCheck).toBe('function');
    // The injected vitest mock should report pass without running anything
    const vitestMock = call[3]?.runVitestScopeCheck!;
    const vitestResult = vitestMock('/tmp/fake-root', ['src/']);
    expect(vitestResult.passed).toBe(true);

    // Final decision promoted to GO_WITH_TECH_DEBT
    expect(evaluation.decision).toBe('GO_WITH_TECH_DEBT');
  });

  it('NO_GO with projectRoot but no OOM marker still calls reconcile WITHOUT vitest-skip', () => {
    reconcileSpy.mockReturnValue({
      decision: 'NO_GO',
      reconciled: false,
      notes: 'no diff',
      linesChanged: 0,
      filesChanged: [],
      tscPassed: false,
      vitestPassRatio: null,
      scopeCompliant: true,
    });

    const evaluation = evaluateWithRubric(genuineNoGoResult, baseTask, undefined, '/tmp/fake-root');

    expect(reconcileSpy).toHaveBeenCalledTimes(1);
    // Genuine NO_GO path: no deps injection (real vitest runs)
    expect(reconcileSpy.mock.calls[0][3]).toBeUndefined();
    expect(evaluation.decision).toBe('NO_GO');
  });

  it('NO_GO with projectRoot omitted skips spurious reconcile (backwards compat)', () => {
    const evaluation = evaluateWithRubric(ooMResult, baseTask);
    expect(reconcileSpy).not.toHaveBeenCalled();
    expect(evaluation.decision).toBe('NO_GO');
  });

  it('reconcileSpuriousNoGo returning NO_GO leaves evaluation NO_GO (no false positive)', () => {
    reconcileSpy.mockReturnValue({
      decision: 'NO_GO',
      reconciled: false,
      notes: 'tsc failed',
      linesChanged: 100,
      filesChanged: ['src/chat.ts'],
      tscPassed: false,
      vitestPassRatio: null,
      scopeCompliant: true,
    });

    const evaluation = evaluateWithRubric(ooMResult, baseTask, undefined, '/tmp/fake-root');
    expect(reconcileSpy).toHaveBeenCalledTimes(1);
    expect(evaluation.decision).toBe('NO_GO');
  });
});
