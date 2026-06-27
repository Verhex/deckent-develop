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

import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { persistBrainVerdict } from '../../src/orchestra/sprint-phases.js';
import { TaskEvaluation } from '../../src/core/task-types.js';
import type { TaskResult } from '../../src/core/task-types.js';

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
