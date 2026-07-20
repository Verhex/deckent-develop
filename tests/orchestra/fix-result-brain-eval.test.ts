// ═══ MF-5 (Sprint 331 — Task 331-014) — fix-result brainEvaluation consistency ═══
//
// RC: the main `.result` carries `brainEvaluation` + `brainEvaluationReason`
// post-EVALUATE (runEvaluatePhase), but the FIX-phase `-fix.result`
// (`task-<id>-fix.result`) historically carried NEITHER — a result-format
// inconsistency: a consumer reading a fix-result got no Brain verdict, only the
// worker's self-claim.
//
// Fix: `persistBrainVerdict()` is the shared, fail-soft enrichment used by BOTH
// the EVALUATE phase and the FIX phase, guaranteeing an identical
// `brainEvaluation` block on either path. `rubricScores` stay intentionally
// audit-only (written separately to `.deckent/evaluations/` via
// writeEvaluationAudit) and must NOT leak into the result file.
//
// These tests pin: (a) a fix-result write gains brainEvaluation; (b) the block
// shape matches the main path; (c) rubricScores never enter the result;
// (d) all other result fields are preserved byte-for-byte; (e) the enrichment
// is non-blocking / fail-soft; (f) the NO_GO veto-cause derivation still works.

// 455-002: partial mock of result-evaluator.js so `evaluateWithRubric` can be
// forced to throw per-test (simulating a restart-recovered/malformed result
// hitting an edge the primary rubric path doesn't defend against), while
// every other export (notably `reconstructFromDurableEvidence`, used by
// safeRubricReconcile's fault-fallback) stays the real implementation. The
// existing persistBrainVerdict tests above never call evaluateWithRubric, so
// this mock is inert for them.
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
vi.mock('../../src/orchestra/result-evaluator.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/result-evaluator.js')>();
  return { ...actual, evaluateWithRubric: vi.fn() };
});

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { persistBrainVerdict, safeRubricReconcile } from '../../src/orchestra/sprint-phases.js';
import { evaluateWithRubric } from '../../src/orchestra/result-evaluator.js';
import { TaskEvaluation, TaskStatus } from '../../src/core/task-types.js';
import type { Task, TaskResult } from '../../src/core/task-types.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'deckent-mf5-'));
  mkdirSync(join(root, '.tasks'), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** A worker-written result (no Brain fields yet) — the on-disk pre-enrichment state. */
function workerResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '331-014-fix',
    workerId: 'w-331-014-fix',
    filesChanged: ['src/orchestra/sprint-phases.ts'],
    linesAdded: 12,
    linesRemoved: 3,
    testsPassed: true,
    coverage: 0,
    selfAssessment: 'DONE',
    notes: 'fix applied',
    ...overrides,
  } as TaskResult;
}

function writeResult(taskId: string, result: TaskResult): string {
  const p = join(root, '.tasks', `task-${taskId}.result`);
  writeFileSync(p, JSON.stringify(result, null, 2) + '\n', 'utf-8');
  return p;
}

function readResult(taskId: string): TaskResult & { brainEvaluation?: string; brainEvaluationReason?: string } {
  const p = join(root, '.tasks', `task-${taskId}.result`);
  return JSON.parse(readFileSync(p, 'utf-8'));
}

describe('persistBrainVerdict — fix-result brainEvaluation consistency (MF-5)', () => {
  // ─── (a) FIX-phase result write gains the Brain verdict ───────────────────
  it('enriches a fix-result with brainEvaluation + brainEvaluationReason', () => {
    const fixId = '331-014-fix';
    writeResult(fixId, workerResult());

    // Pre-condition: the worker-written fix-result carries NO Brain verdict.
    expect(readResult(fixId).brainEvaluation).toBeUndefined();

    // FIX path: no honest-gate → gated = { honest: true }.
    persistBrainVerdict(root, fixId, TaskEvaluation.DONE, 92, { honest: true }, workerResult());

    const after = readResult(fixId);
    expect(after.brainEvaluation).toBe('DONE');
    expect(after.brainEvaluationReason).toBe('rubric total 92 → DONE');
  });

  // ─── (b) The fix-path block matches the main-path block shape ─────────────
  it('produces the SAME brainEvaluation block shape as the main (EVALUATE) path', () => {
    const mainId = '331-014';
    const fixId = '331-014-fix';
    writeResult(mainId, workerResult({ taskId: mainId, workerId: 'w-331-014' }));
    writeResult(fixId, workerResult());

    // Equivalent inputs on both paths (DONE, same score, honest result).
    persistBrainVerdict(root, mainId, TaskEvaluation.DONE, 88, { honest: true }, workerResult());
    persistBrainVerdict(root, fixId, TaskEvaluation.DONE, 88, { honest: true }, workerResult());

    const main = readResult(mainId);
    const fix = readResult(fixId);

    // Same Brain-owned key set …
    const brainKeys = (r: Record<string, unknown>) =>
      Object.keys(r).filter(k => k.startsWith('brainEvaluation')).sort();
    expect(brainKeys(fix)).toEqual(['brainEvaluation', 'brainEvaluationReason']);
    expect(brainKeys(fix)).toEqual(brainKeys(main));

    // … and identical value format.
    expect(fix.brainEvaluation).toBe(main.brainEvaluation);
    expect(fix.brainEvaluationReason).toBe(main.brainEvaluationReason);
  });

  // ─── (c) rubricScores stay audit-only — never injected into the result ────
  it('never adds rubricScores to the fix-result (audit-only invariant)', () => {
    const fixId = '331-014-fix';
    writeResult(fixId, workerResult());

    persistBrainVerdict(root, fixId, TaskEvaluation.GO_WITH_TECH_DEBT, 71, { honest: true }, workerResult());

    const after = readResult(fixId) as TaskResult & { rubricScores?: unknown };
    expect(after.rubricScores).toBeUndefined();
    expect(after.brainEvaluation).toBe('GO_WITH_TECH_DEBT');
  });

  // ─── (d) All other result fields preserved byte-for-byte ──────────────────
  it('preserves every non-Brain result field unchanged', () => {
    const fixId = '331-014-fix';
    const original = workerResult({
      filesChanged: ['a.ts', 'b.ts'],
      linesAdded: 40,
      linesRemoved: 7,
      notes: 'multi-file fix',
      selfAssessment: 'GO_WITH_TECH_DEBT',
    });
    writeResult(fixId, original);

    persistBrainVerdict(root, fixId, TaskEvaluation.DONE, 90, { honest: true }, original);

    const after = readResult(fixId);
    // Worker-owned fields are untouched (only brain* keys were added).
    expect(after.taskId).toBe(original.taskId);
    expect(after.workerId).toBe(original.workerId);
    expect(after.filesChanged).toEqual(original.filesChanged);
    expect(after.linesAdded).toBe(original.linesAdded);
    expect(after.linesRemoved).toBe(original.linesRemoved);
    expect(after.testsPassed).toBe(original.testsPassed);
    expect(after.coverage).toBe(original.coverage);
    expect(after.selfAssessment).toBe(original.selfAssessment);
    expect(after.notes).toBe(original.notes);
  });

  // ─── (e) Non-blocking / fail-soft ─────────────────────────────────────────
  it('is a silent no-op (no throw, no file) when the .result is absent', () => {
    const fixId = 'does-not-exist-fix';
    expect(() =>
      persistBrainVerdict(root, fixId, TaskEvaluation.DONE, 50, { honest: true }, workerResult()),
    ).not.toThrow();
    expect(existsSync(join(root, '.tasks', `task-${fixId}.result`))).toBe(false);
  });

  it('does not throw on a malformed .result (readJsonSafe → null)', () => {
    const fixId = 'corrupt-fix';
    const p = join(root, '.tasks', `task-${fixId}.result`);
    writeFileSync(p, '{ not valid json', 'utf-8');
    expect(() =>
      persistBrainVerdict(root, fixId, TaskEvaluation.NO_GO, 0, { honest: true }, workerResult()),
    ).not.toThrow();
    // Left untouched — no partial/destructive write on parse failure.
    expect(readFileSync(p, 'utf-8')).toBe('{ not valid json');
  });

  // ─── (f) NO_GO veto-cause derivation still works on the fix path ──────────
  it('derives concrete_test_failed for a NO_GO fix-result with testsPassed:false', () => {
    const fixId = '331-014-fix';
    writeResult(fixId, workerResult({ testsPassed: false, selfAssessment: 'NO_GO' }));

    persistBrainVerdict(
      root, fixId, TaskEvaluation.NO_GO, 12, { honest: true },
      workerResult({ testsPassed: false, selfAssessment: 'NO_GO' }),
    );

    const after = readResult(fixId);
    expect(after.brainEvaluation).toBe('NO_GO');
    expect(after.brainEvaluationReason).toContain('(cause: concrete_test_failed)');
  });
});

// ═══ 455-002 — safeRubricReconcile durable-evidence fault recovery ═══
//
// safeRubricReconcile's fault-fallback (the "recovery path" for a thrown
// evaluateWithRubric) used to collapse ANY fault into a hardcoded
// totalScore:0 capped at GO_WITH_TECH_DEBT/NO_GO — discarding a genuinely
// honest worker DONE+tests result and fabricating a "rubric total 0" reason.
// It now reconstructs from durable evidence via reconstructFromDurableEvidence.
// These tests exercise safeRubricReconcile directly (exported for this
// purpose) with evaluateWithRubric mocked to throw — the exact shape a
// restart-recovered or otherwise malformed `.result` can trigger.

describe('safeRubricReconcile — durable-evidence fault recovery (455-002)', () => {
  afterEach(() => {
    vi.mocked(evaluateWithRubric).mockReset();
  });

  function makeTask(overrides: Partial<Task> = {}): Task {
    return {
      id: '455-002-safe',
      title: 'safeRubricReconcile fixture',
      description: 'desc',
      model: 'sonnet',
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'test',
      scope: {
        directories: ['src/orchestra/'],
        filesRead: [],
        filesWrite: ['src/orchestra/result-evaluator.ts'],
      },
      dependencies: [],
      goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
      status: TaskStatus.EXECUTING,
      ...overrides,
    } as Task;
  }

  const richNotes =
    'Implemented the change end-to-end, ran the targeted test suite, and confirmed ' +
    'tsc --noEmit is clean. Coverage instrumented via vitest; all scoped files touched ' +
    'are within the declared write list.';

  function makeTaskResult(overrides: Partial<TaskResult> = {}): TaskResult {
    return {
      taskId: '455-002-safe',
      workerId: 'w-455-002-safe',
      filesChanged: ['src/orchestra/result-evaluator.ts'],
      linesAdded: 30,
      linesRemoved: 4,
      testsPassed: true,
      coverage: 92,
      selfAssessment: 'DONE',
      notes: richNotes,
      ...overrides,
    };
  }

  it('a thrown evaluateWithRubric no longer collapses a valid DONE+tests result to a fabricated rubric total 0', async () => {
    vi.mocked(evaluateWithRubric).mockImplementation(() => {
      throw new TypeError('restart-recovered result hit an unguarded edge');
    });

    const task = makeTask();
    const result = makeTaskResult();
    const evaluation = await safeRubricReconcile(root, 'sprint-455', task, result);

    // The old fallback ALWAYS returned totalScore:0 — durable reconstruction
    // must produce a real, non-zero, evidence-derived score.
    expect(evaluation.totalScore).toBeGreaterThan(0);
    expect(evaluation.decision).toBe('DONE');
    expect(evaluation.rubricScores.some(s => s.criterion === 'recovery_provenance')).toBe(true);
    // No generic "evaluation-fault" placeholder criterion — every criterion
    // is a real, scored durable-evidence entry.
    expect(evaluation.rubricScores.some(s => s.criterion === 'evaluation-fault')).toBe(false);
  });

  it('thin durable evidence on a thrown evaluation → honest GO_WITH_TECH_DEBT, not a fabricated zero and not NO_GO', async () => {
    vi.mocked(evaluateWithRubric).mockImplementation(() => {
      throw new Error('boom');
    });

    const task = makeTask();
    const result = makeTaskResult({ notes: '' });
    const evaluation = await safeRubricReconcile(root, 'sprint-455', task, result);

    expect(evaluation.decision).toBe('GO_WITH_TECH_DEBT');
    expect(evaluation.totalScore).toBeGreaterThan(0);
  });

  it('a concrete test failure still forces NO_GO even when rubric evaluation throws', async () => {
    vi.mocked(evaluateWithRubric).mockImplementation(() => {
      throw new Error('boom');
    });

    const task = makeTask();
    const result = makeTaskResult({ testsPassed: false });
    const evaluation = await safeRubricReconcile(root, 'sprint-455', task, result);

    expect(evaluation.decision).toBe('NO_GO');
  });

  it('worker self-NO_GO still forces NO_GO even when rubric evaluation throws', async () => {
    vi.mocked(evaluateWithRubric).mockImplementation(() => {
      throw new Error('boom');
    });

    const task = makeTask();
    const result = makeTaskResult({ selfAssessment: 'NO_GO' });
    const evaluation = await safeRubricReconcile(root, 'sprint-455', task, result);

    expect(evaluation.decision).toBe('NO_GO');
  });

  it('appends an [evaluation-fault recovery] note documenting the reconstructed decision', async () => {
    vi.mocked(evaluateWithRubric).mockImplementation(() => {
      throw new Error('registry unavailable');
    });

    const task = makeTask();
    const result = makeTaskResult();
    const evaluation = await safeRubricReconcile(root, 'sprint-455', task, result);

    expect(result.notes).toContain('[evaluation-fault recovery]');
    expect(result.notes).toContain('registry unavailable');
    expect(result.notes).toContain(evaluation.decision);
  });

  it('a healthy evaluateWithRubric call is returned unchanged — the durable-evidence path is fault-only', async () => {
    const passingEvaluation = {
      decision: 'DONE' as const,
      totalScore: 95,
      rubricScores: [{ criterion: 'correctness', score: 95, passed: true, reason: 'ok' }],
      retryCount: 0,
    };
    vi.mocked(evaluateWithRubric).mockReturnValue(passingEvaluation);

    const task = makeTask();
    const result = makeTaskResult();
    const evaluation = await safeRubricReconcile(root, 'sprint-455', task, result);

    expect(evaluation.decision).toBe('DONE');
    expect(evaluation.totalScore).toBe(95);
    expect(evaluation.rubricScores).toEqual(passingEvaluation.rubricScores);
  });
});
