// Sprint 207 Task 207-006 — Brain Evaluation Integrity (regression coverage)
//
// Locks in the Sprint 207 P0 fix that landed in commits cc557e25 + 854eb63f:
//
//   Sprint 206 forensic root cause: refactorer agent honestly wrote
//   coverage:null on targeted-edit tasks. coverageOptional() exempted only an
//   agent ALLOWLIST (bug-fixer / security-auditor / architect / …) and
//   refactorer was NOT in it → schema-NO_GO → 7 false-FIX workers, each
//   emitting +0/-0 "nothing to do" results. The SAME .result evaluated DONE
//   under bug-fixer, NO_GO under refactorer → idempotency was broken: the
//   FIX worker was changing the AGENT, not the code. Mathematical proof of a
//   false-FIX cascade.
//
// The fix has two layers, both verified here as agent-INDEPENDENT:
//   P0-1 (rubric-registry.ts): coverageOptional() gained a signal-based path —
//     a code-development task whose .result includes a `.test.`/`.spec.` file
//     in filesChanged is exempt from the missing-coverage schema error,
//     regardless of which agent ran it. Deterministic + idempotent.
//   P0-2 (rubric-registry.ts): refactorer + code-reviewer added to
//     COVERAGE_OPTIONAL_AGENTS as a bridge, so even source-only refactorer
//     edits pass (their work is rarely coverage-instrumentable).
//   P0-3 (result-evaluator.ts scoreTestCoverage): NaN propagation guard —
//     non-finite coverage normalizes to 0 instead of poisoning totalScore.
//
// Contract guarded by this file: "every sprint a different mask" pattern stays
// closed. A code-dev task with new test files + selfAssessment=DONE evaluates
// to DONE under ANY agent; a source-only task with no tests + coverage:null
// still NO_GOs under a generic agent (Sprint 153/154 anti-regression guard
// preserved per commit 854eb63f). Any drift here means false-FIX is back.

import { describe, it, expect } from 'vitest';
import {
  evaluateWithRubric,
  validateResultSchema,
  scoreTestCoverage,
} from '../../src/orchestra/result-evaluator.js';
import type { Task, TaskResult } from '../../src/core/task-types.js';

// ─── Fixture helpers ────────────────────────────────────────────────
// Modeled on tests/orchestra/spurious-nogo-169-cascade.test.ts so the
// shape stays in lockstep with the sibling regression file.

function codeDevTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Sprint 207 brain-eval integrity fixture ${id}`,
    description:
      'Targeted code-development edit with paired vitest coverage — the exact ' +
      'Sprint 206 refactorer shape that triggered the false-FIX cascade.',
    model: 'opus',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'regression fixture for brain-eval integrity',
    scope: {
      directories: ['src/orchestra/', 'tests/orchestra/'],
      filesRead: [],
      filesWrite: [
        'src/orchestra/result-evaluator.ts',
        'tests/orchestra/some-paired.test.ts',
      ],
    },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: 'EXECUTING',
    assignedAgent: 'refactorer',
    ...overrides,
  };
}

function refactorerResult(id: string, overrides: Partial<TaskResult> = {}): TaskResult {
  // The exact Sprint 206 shape: targeted edit + a new test file, but the worker
  // does not write a numeric coverage value (refactorers commonly do not run
  // coverage-instrumented test runs on a narrow scope). selfAssessment=DONE.
  return {
    taskId: id,
    workerId: `w-${id}`,
    filesChanged: [
      'src/orchestra/result-evaluator.ts',
      'tests/orchestra/some-paired.test.ts',
    ],
    linesAdded: 42,
    linesRemoved: 6,
    testsPassed: true,
    coverage: null as unknown as number,
    selfAssessment: 'DONE',
    notes: 'Refactor + paired test. tsc clean. vitest pass (no coverage flag).',
    ...overrides,
  } as TaskResult;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('Sprint 207 — Brain Evaluation Integrity (regression coverage for coverage:null false-FIX)', () => {
  it('coverage:null + new test file + selfAssessment=DONE under refactorer → DONE (the Sprint 206 happy path)', () => {
    const task = codeDevTask('207-A', { assignedAgent: 'refactorer' });
    const result = refactorerResult('207-A');

    // Schema gate: P0-1 signal path + P0-2 allowlist bridge.
    const schema = validateResultSchema(result, task);
    expect(schema.valid).toBe(true);
    expect(schema.missingFields).not.toContain('coverage');

    // Rubric verdict: must NOT be NO_GO. The Sprint 206 lesson is that NO_GO
    // here triggered a false-FIX worker, so any drift back to NO_GO reopens
    // the cascade.
    const evaluation = evaluateWithRubric(result, task);
    expect(evaluation.decision).toBe('DONE');
    expect(evaluation.totalScore).toBeGreaterThanOrEqual(70);
  });

  it('agent-independence: refactorer / bug-fixer / generic all evaluate the SAME result to the SAME decision (idempotency invariant)', () => {
    // The Sprint 206 false-FIX cascade was MATHEMATICALLY proven by showing
    // that the SAME .result evaluated DONE under bug-fixer but NO_GO under
    // refactorer — the agent was the mask. With P0-1 (signal-based), the
    // decision must not depend on `assignedAgent` once the result carries a
    // test-file signal.
    const result = refactorerResult('207-B');

    const refactorerEval = evaluateWithRubric(
      result,
      codeDevTask('207-B', { assignedAgent: 'refactorer' }),
    );
    const bugFixerEval = evaluateWithRubric(
      result,
      codeDevTask('207-B', { assignedAgent: 'bug-fixer' }),
    );
    const genericEval = evaluateWithRubric(
      result,
      codeDevTask('207-B', { assignedAgent: 'generic' }),
    );

    // Primary invariant: the agent name does not flip the decision.
    expect(refactorerEval.decision).toBe(bugFixerEval.decision);
    expect(refactorerEval.decision).toBe(genericEval.decision);

    // All three must clear the spurious-NO_GO bar.
    expect(refactorerEval.decision).not.toBe('NO_GO');
    expect(bugFixerEval.decision).not.toBe('NO_GO');
    expect(genericEval.decision).not.toBe('NO_GO');

    // And rubric scores must be byte-identical — `assignedAgent` is consumed
    // only by the schema-relaxation predicate, not by any scoring criterion.
    expect(refactorerEval.totalScore).toBe(bugFixerEval.totalScore);
    expect(refactorerEval.totalScore).toBe(genericEval.totalScore);
  });

  it('NaN guard: non-finite coverage (NaN / undefined) must NOT propagate to totalScore (Sprint 207 P0-3)', () => {
    // The pre-fix bug: Math.min(undefined, 100) → NaN → score=NaN → totalScore=NaN
    // → decision="NO_GO" with reason "score=NaN/100". The guard in
    // scoreTestCoverage normalizes non-finite coverage to 0 (a real measurable
    // value), so downstream arithmetic stays finite.
    const nanResult: TaskResult = {
      ...refactorerResult('207-C'),
      coverage: NaN as unknown as number,
    };

    const score = scoreTestCoverage(nanResult);

    // Score itself must be a finite number.
    expect(Number.isFinite(score.score)).toBe(true);
    expect(Number.isNaN(score.score)).toBe(false);

    // And the decision pipeline downstream must also stay finite.
    const evaluation = evaluateWithRubric(
      nanResult,
      codeDevTask('207-C', { assignedAgent: 'refactorer' }),
    );
    expect(Number.isFinite(evaluation.totalScore)).toBe(true);
    expect(Number.isNaN(evaluation.totalScore)).toBe(false);

    // Same for undefined coverage (the actual Sprint 206 wire shape — the
    // worker omits the field entirely instead of writing null).
    const undefResult: TaskResult = {
      ...refactorerResult('207-C2'),
      coverage: undefined as unknown as number,
    };
    const undefScore = scoreTestCoverage(undefResult);
    expect(Number.isFinite(undefScore.score)).toBe(true);
  });

  it('source-only change + coverage:null under generic agent → still NO_GO (Sprint 153/154 anti-regression guard preserved per commit 854eb63f)', () => {
    // Tightening the fix: P0-1 must NOT widen to a blanket "coverage is
    // always optional" — that would mask genuine missing-coverage bugs on
    // pure source edits. The signal is the .test./.spec. file in
    // filesChanged. Without it, a generic-agent code task with coverage:null
    // is genuinely under-tested and must keep failing the schema gate.
    const task = codeDevTask('207-D', { assignedAgent: 'generic' });
    const result: TaskResult = {
      ...refactorerResult('207-D'),
      filesChanged: ['src/orchestra/result-evaluator.ts'], // no test file
    };

    const schema = validateResultSchema(result, task);
    expect(schema.valid).toBe(false);
    expect(schema.missingFields).toContain('coverage');

    const evaluation = evaluateWithRubric(result, task);
    expect(evaluation.decision).toBe('NO_GO');
    // And the NO_GO must come from schema_validation, not from the rubric —
    // proves the gate is doing the work, not a downstream scoring fluke.
    expect(evaluation.rubricScores[0]?.criterion).toBe('schema_validation');
  });

  it('idempotent: evaluating the same result twice yields byte-identical decision and totalScore (no FIX-retry mask)', () => {
    // The Sprint 206 cascade was a NON-idempotent evaluation: attempt-1 said
    // NO_GO, FIX-retry under a different agent said DONE. The fix must
    // collapse that to a pure function of (result, task) — no hidden global
    // state, no time-dependent branches.
    const task = codeDevTask('207-E', { assignedAgent: 'refactorer' });
    const result = refactorerResult('207-E');

    const first = evaluateWithRubric(result, task);
    const second = evaluateWithRubric(result, task);

    expect(second.decision).toBe(first.decision);
    expect(second.totalScore).toBe(first.totalScore);
    expect(second.rubricScores.length).toBe(first.rubricScores.length);
    // Per-criterion score parity — defends against a stateful scorer.
    for (let i = 0; i < first.rubricScores.length; i++) {
      expect(second.rubricScores[i]?.score).toBe(first.rubricScores[i]?.score);
      expect(second.rubricScores[i]?.criterion).toBe(first.rubricScores[i]?.criterion);
    }
  });

  it('source-only refactorer (no test file) → still DONE via P0-2 allowlist bridge (proves P0-1 + P0-2 are additive)', () => {
    // The two layers of the fix protect against different failure modes:
    //   P0-1 (signal): rescues ANY agent that wrote tests
    //   P0-2 (bridge): rescues refactorer / code-reviewer even on tests-not-
    //                  written work (their narrow edits often have no paired test)
    // Together they cover the full Sprint 206 surface. This test pins down
    // P0-2: a source-only refactorer task must still pass even though the
    // signal path does not apply.
    const task = codeDevTask('207-F', { assignedAgent: 'refactorer' });
    const result: TaskResult = {
      ...refactorerResult('207-F'),
      filesChanged: ['src/orchestra/result-evaluator.ts'], // no .test. file
    };

    const schema = validateResultSchema(result, task);
    expect(schema.valid).toBe(true);
    expect(schema.missingFields).not.toContain('coverage');

    const evaluation = evaluateWithRubric(result, task);
    expect(evaluation.decision).not.toBe('NO_GO');
  });
});
