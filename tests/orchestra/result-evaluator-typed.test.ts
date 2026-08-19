// ═══ Result Evaluator — Typed (Task-Type Aware) Integration Tests ═════
// Sprint 154 Bug B regression guard. These scenarios encode the live
// failure from Sprint 153 smoke test (2026-05-12): 9/10 doc tasks reported
// coverage:null and were graded by the code rubric, yielding false NO_GO.
// After the rubric-registry wire-up, doc-write and audit tasks must DONE
// while code tasks with coverage:null must still NO_GO.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TaskStatus } from '../../src/core/types.js';
import type { Task, TaskResult } from '../../src/core/types.js';
import { evaluateWithRubric } from '../../src/orchestra/result-evaluator.js';

// ─── Test fixture directory ────────────────────────────────────────────
// Scope rules allow writes only under tests/orchestra/, docs/smoke/, and
// docs/audits/sprint-X/. Fixture files live under those paths so they can
// be created in this test process without violating the auditor.

const SMOKE_DIR = 'docs/smoke';
const AUDIT_DIR = 'docs/audits/sprint-X';

const SMOKE_FILE = `${SMOKE_DIR}/T.md`;
const AUDIT_FILE = `${AUDIT_DIR}/T.md`;

const SMOKE_REPORT_BODY = [
  '# Sprint 153 Smoke — T-001',
  '',
  '## Overview',
  '',
  'This document captures the smoke test report for Sprint 153.',
  '',
  '## Findings',
  '',
  '- The deckent pipeline executed end-to-end.',
  '- 10 doc tasks were planned and 9 produced coverage:null in their result file.',
  '- The evaluator graded 9/10 as NO_GO under the legacy code rubric.',
  '',
  '## Details',
  '',
  Array.from({ length: 80 }, (_, i) => `Sentence ${i + 1} of the doc-write body — narrative content here.`).join(' '),
  '',
  '## Next Steps',
  '',
  'Re-run after rubric-registry foundation lands.',
].join('\n');

const AUDIT_REPORT_BODY = [
  '# Audit — sprint-X / T',
  '',
  '## Findings',
  '',
  '- Finding 1: Coverage:null routinely emitted by Claude workers in `src/agents/worker.ts:120`.',
  '- Finding 2: Rubric dispatch in `src/orchestra/result-evaluator.ts:701` ignored task type.',
  '- Finding 3: Schema validator at `src/orchestra/result-evaluator.ts:499` rejected null coverage.',
  '- Bug: `Math.min(null, 100)` evaluates to `0`, silently zeroing the score.',
  '- Risk: cascade NO_GO blocks all dependent fix tasks.',
  '- Drift: doc workers report no coverage signal at all.',
  '',
  '## Citations',
  '',
  '- `src/orchestra/result-evaluator.ts:586` `scoreTestCoverage`',
  '- `src/orchestra/result-evaluator.ts:499` `validateResultSchema`',
  '- `src/agents/worker.ts:120` result writer',
  '- `tests/orchestra/result-evaluator.test.ts:1` legacy suite',
  '- `docs/audits/sprint-153/SMOKE.md:1` baseline observations',
  '- `.brain/exports/summary.md:1` Sprint 153 export',
  '',
  '## Triage',
  '',
  '| Priority | Item |',
  '|----------|------|',
  '| P0       | Schema null coverage tolerance |',
  '| P1       | Rubric dispatch by task-type |',
  '| P2       | Worker self-report calibration |',
  '',
  Array.from({ length: 40 }, (_, i) => `Paragraph ${i + 1} of audit narrative — additional context.`).join(' '),
].join('\n');

// ─── Fixture setup / teardown ──────────────────────────────────────────

beforeAll(() => {
  mkdirSync(SMOKE_DIR, { recursive: true });
  mkdirSync(AUDIT_DIR, { recursive: true });
  writeFileSync(SMOKE_FILE, SMOKE_REPORT_BODY, 'utf-8');
  writeFileSync(AUDIT_FILE, AUDIT_REPORT_BODY, 'utf-8');
});

afterAll(() => {
  rmSync(SMOKE_FILE, { force: true });
  rmSync(AUDIT_FILE, { force: true });
  // Best-effort directory cleanup — ignore failure when directory has other
  // content (e.g., other tests dropping files).
  try { rmSync(SMOKE_DIR, { recursive: true, force: true }); } catch {}
  try { rmSync(AUDIT_DIR, { recursive: true, force: true }); } catch {}
  try { rmSync(join('docs/audits'), { recursive: false }); } catch {}
});

// ─── Helpers ───────────────────────────────────────────────────────────

function makeTask(scope: {
  directories: string[];
  filesWrite: string[];
}, overrides: Partial<Task> = {}): Task {
  return {
    id: '154-test',
    title: 'Test task',
    description: 'Sprint 153 smoke regression scenario — ≥800 kelime doc task.',
    model: 'opus',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: scope.directories, filesRead: [], filesWrite: scope.filesWrite },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    ...overrides,
  };
}

function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '154-test',
    workerId: 'w-154-test',
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 0,
    selfAssessment: 'DONE',
    notes: '',
    ...overrides,
  };
}

// `coverage:null` is the precise wire shape that broke Sprint 153 — a worker
// emitted JSON with `"coverage": null`. We replicate it through a typed
// override so TypeScript stays out of the way.
function withNullCoverage(result: TaskResult): TaskResult {
  return { ...result, coverage: null as unknown as number };
}

// ─── Scenarios ─────────────────────────────────────────────────────────

describe('evaluateWithRubric — Sprint 154 typed scenarios', () => {
  it('doc-write task with coverage:null + DONE notes → DONE (Sprint 153 smoke regression guard)', () => {
    // Sprint 153 smoke (2026-05-12): 9 of 10 doc tasks emitted coverage:null
    // and were graded by the code rubric, producing false NO_GO. Once the
    // registry dispatches doc-write tasks to DOC_WRITE_RUBRIC and the
    // schema tolerates null coverage on non-code tasks, this scenario must
    // DONE with totalScore ≥ 70.
    const task = makeTask({
      directories: [SMOKE_DIR],
      filesWrite: [SMOKE_FILE],
    });

    const result = withNullCoverage(makeResult({
      filesChanged: [SMOKE_FILE],
      notes: 'Wrote ~800 kelime smoke report covering Sprint 153 findings; structure includes 4 H2 sections.',
    }));

    const evaluation = evaluateWithRubric(result, task);

    expect(evaluation.decision).toBe('DONE');
    expect(evaluation.totalScore).toBeGreaterThanOrEqual(70);
  });

  it('audit task with coverage:null + detailed report → DONE or GO_WITH_TECH_DEBT', () => {
    const task = makeTask({
      directories: [AUDIT_DIR],
      filesWrite: [AUDIT_FILE],
    });

    const result = withNullCoverage(makeResult({
      filesChanged: [AUDIT_FILE],
      notes: 'Audit report with 6 findings, 6 citations, P0/P1/P2 triage labels.',
    }));

    const evaluation = evaluateWithRubric(result, task);

    expect(['DONE', 'GO_WITH_TECH_DEBT']).toContain(evaluation.decision);
    expect(evaluation.totalScore).toBeGreaterThan(0);
  });

  it('code task with coverage:null still NO_GO (schema regression preserved)', () => {
    // The schema tolerance must remain strict for code-development tasks —
    // otherwise we lose the original signal that the worker failed to
    // measure coverage on real production code.
    const task = makeTask({
      directories: ['src/orchestra/'],
      filesWrite: ['src/x.ts'],
    });

    const result = withNullCoverage(makeResult({
      filesChanged: ['src/x.ts'],
      notes: 'Wrote new module.',
    }));

    const evaluation = evaluateWithRubric(result, task);

    expect(evaluation.decision).toBe('NO_GO');
    expect(evaluation.rubricScores[0]?.criterion).toBe('schema_validation');
  });

  it('doc-write task with coverage:0 (numeric) → DONE (Sprint 153 T-005 scenario)', () => {
    // In Sprint 153 smoke, exactly one of 10 doc workers reported coverage:0
    // (number) instead of null. That single task DONE'd. After the fix, both
    // should DONE, but this asserts the historical "happy path" still works.
    const task = makeTask({
      directories: [SMOKE_DIR],
      filesWrite: [SMOKE_FILE],
    });

    const result = makeResult({
      coverage: 0,
      filesChanged: [SMOKE_FILE],
      notes: 'Wrote ~800 kelime smoke report; coverage:0 reported as number.',
    });

    const evaluation = evaluateWithRubric(result, task);

    expect(evaluation.decision).toBe('DONE');
  });

  it('doc-write task whose worker wrote to src/x.ts → NO_GO (scope violation)', () => {
    // Scope compliance still matters even on doc-write tasks. A worker
    // emitting src/ changes when the task is purely doc-write must fail.
    const task = makeTask({
      directories: [SMOKE_DIR],
      filesWrite: [SMOKE_FILE],
    });

    const result = withNullCoverage(makeResult({
      filesChanged: ['src/x.ts'],
      notes: 'Wrote source code instead of doc.',
    }));

    const evaluation = evaluateWithRubric(result, task);

    expect(evaluation.decision).toBe('NO_GO');
  });

  it('doc-write task with NO_GO self-assessment → NO_GO (worker self-verdict ceiling)', () => {
    // Sprint-573/574 honesty fix: testsPassed carries no signal for the
    // doc-write class, so the score alone can clear passingScore — but the
    // worker's own NO_GO is a ceiling the rubric may never raise. Only the
    // evidence-backed reconcile probes (git-diff/tsc/vitest) may lift it.
    const task = makeTask({
      directories: [SMOKE_DIR],
      filesWrite: [SMOKE_FILE],
    });

    const result = withNullCoverage(makeResult({
      testsPassed: false,
      selfAssessment: 'NO_GO',
      filesChanged: [SMOKE_FILE],
      notes: 'short',
    }));

    const evaluation = evaluateWithRubric(result, task);

    expect(evaluation.decision).toBe('NO_GO');
  });

  it('audit task missing the report file falls back gracefully (no crash)', () => {
    // Sprint 153 dogfood: workers occasionally crash before flushing the
    // report file. The scorers must not throw; instead, the scope_compliance
    // check (filesChanged points at a file that does not match scope.filesWrite)
    // pulls the score down. We assert (a) no exception, (b) at least one
    // rubric criterion was scored — proves graceful degradation.
    const task = makeTask({
      directories: [AUDIT_DIR],
      filesWrite: [AUDIT_FILE],
    });

    const result = withNullCoverage(makeResult({
      filesChanged: [`${AUDIT_DIR}/missing-file.md`],
      notes: 'Report write failed — file not flushed to disk.',
    }));

    const evaluation = evaluateWithRubric(result, task);

    expect(evaluation.rubricScores.length).toBeGreaterThan(0);
    // No exception was thrown — that is the primary assertion. Decision may
    // be anything depending on partial-credit math, but the evaluator must
    // not crash on missing report files.
    expect(['DONE', 'GO_WITH_TECH_DEBT', 'NO_GO']).toContain(evaluation.decision);
  });

  it('code task with coverage:95 + passing tests → DONE (baseline sanity)', () => {
    // Make sure the default code rubric still functions normally — i.e. the
    // Bug B fix doesn't regress code-task evaluation.
    const task = makeTask({
      directories: ['src/orchestra/'],
      filesWrite: ['src/x.ts'],
    });

    const result = makeResult({
      coverage: 95,
      filesChanged: ['src/x.ts', 'tests/x.test.ts'],
      notes: 'Implemented module + tests; coverage 95%.',
    });

    const evaluation = evaluateWithRubric(result, task);

    expect(evaluation.decision).toBe('DONE');
    expect(evaluation.totalScore).toBeGreaterThanOrEqual(70);
  });

  it('explicit rubric override still wins over registry dispatch', () => {
    // When a caller explicitly passes a rubric, the registry must defer.
    // Otherwise we'd silently break callers that construct custom rubrics
    // (e.g., for experiments or stricter gates).
    const task = makeTask({
      directories: [SMOKE_DIR],
      filesWrite: [SMOKE_FILE],
    });

    const result = makeResult({
      coverage: 95,
      filesChanged: [SMOKE_FILE, 'tests/x.test.ts'],
      notes: 'Coverage forced via custom rubric — passes with default code rubric semantics.',
    });

    const evaluation = evaluateWithRubric(result, task, {
      criteria: [
        { name: 'correctness', weight: 1, threshold: 60, evaluator: 'auto' },
      ],
      passingScore: 70,
      maxRetries: 0,
    });

    expect(evaluation.decision).toBe('DONE');
    expect(evaluation.rubricScores).toHaveLength(1);
    expect(evaluation.rubricScores[0]?.criterion).toBe('correctness');
  });
});

// ─── 7097-B3: unevidenced test-claim ceiling (code class only) ───────

describe('evaluateWithRubric — unevidenced test-claim ceiling (7097-B3)', () => {
  function makeCodeTask() {
    return makeTask({
      directories: ['src/core'],
      filesWrite: ['src/core/widget.ts'],
    });
  }

  it('code task: bare testsPassed:true with NO evidence caps DONE at GO_WITH_TECH_DEBT', () => {
    // A plain code task with coverage:null dies at schema validation — the
    // reachable fabrication shape is the coverage-OPTIONAL code task (e.g.
    // a bug-fixer-assigned fix): schema tolerates the missing number, the
    // 227-001 reweight lifts the score to DONE, and "tests passed" stands
    // on nothing. Exactly the sprint-568..575 fix-worker pattern
    // ("verification task — tests passed") the ceiling must catch.
    const task = makeCodeTask();
    task.assignedAgent = 'bug-fixer';
    const result = withNullCoverage(makeResult({
      testsPassed: true,
      filesChanged: ['src/core/widget.ts'],
      notes: 'Implemented the widget as requested.',
      selfAssessment: 'DONE',
    }));
    const evaluation = evaluateWithRubric(result, task);
    expect(evaluation.decision).toBe('GO_WITH_TECH_DEBT');
  });

  it('code task: a test-run trace in notes keeps DONE (evidence honored)', () => {
    const result = makeResult({
      testsPassed: true,
      coverage: 0,
      filesChanged: ['src/core/widget.ts'],
      notes: 'npx vitest run passed 19/19; npx tsc --noEmit exit 0.',
      selfAssessment: 'DONE',
    });
    const evaluation = evaluateWithRubric(result, makeCodeTask());
    expect(evaluation.decision).toBe('DONE');
  });

  it('code task: changed test file + measured coverage keep DONE (ceiling stays inert on evidence)', () => {
    // coverage 0 would independently drag the test_coverage criterion into
    // the DEBT band — that is rubric math, not the ceiling. A measured
    // coverage plus a touched test file isolates the ceiling's behaviour.
    const result = makeResult({
      testsPassed: true,
      coverage: 78,
      filesChanged: ['src/core/widget.ts', 'tests/core/widget.test.ts'],
      notes: 'done',
      selfAssessment: 'DONE',
    });
    const evaluation = evaluateWithRubric(result, makeCodeTask());
    expect(evaluation.decision).toBe('DONE');
  });

  it('doc task: the ceiling is inert (testsPassed already neutral for the class)', () => {
    const task = makeTask({ directories: [SMOKE_DIR], filesWrite: [SMOKE_FILE] });
    const result = withNullCoverage(makeResult({
      testsPassed: true,
      filesChanged: [SMOKE_FILE],
      notes: 'Wrote the doc. This documentation summarizes the module thoroughly with several sections and detailed explanations for readers.',
      selfAssessment: 'DONE',
    }));
    const evaluation = evaluateWithRubric(result, task);
    expect(evaluation.decision).toBe('DONE');
  });
});
