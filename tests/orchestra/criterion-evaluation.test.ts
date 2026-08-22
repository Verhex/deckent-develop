// ─── Evaluation Surface — deterministic criterion kernel (EVALUATION-001) ───
//
// 7097 item-3 first brick: typed goNogo.items bind to the evaluator through
// a deterministic kernel. Pins: (1) file-path requirements decide from disk/
// result evidence; (2) prose requirements are honestly undecidable (never a
// penalty — the llm/human adapter families' future territory); (3) a decisive
// typed-contract failure caps the rubric verdict at NO_GO with criterion-
// level audit rows; (4) legacy items (prose-only, e.g. debt-fix "Debt
// resolved") leave every existing verdict untouched.

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { evaluateGoNogoCriteria, hasUnsalvageableContractFailure } from '../../src/orchestra/criterion-evaluation.js';
import { evaluateWithRubric, reconcileEvaluationSpuriousNoGo } from '../../src/orchestra/result-evaluator.js';
import { reconcileRubricNoGo } from '../../src/orchestra/mid-sprint-adapter.js';
import { createGoNoGoCriterionItem } from '../../src/core/task-types.js';
import { TaskStatus } from '../../src/core/types.js';
import type { Task, TaskResult } from '../../src/core/types.js';

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'criterion-kernel-'));
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(root, 'docs', 'delivered.md'), '# delivered\n');
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function makeTask(items: ReturnType<typeof createGoNoGoCriterionItem>[], over: Partial<Task> = {}): Task {
  return {
    id: '900-100',
    title: 'criterion kernel test',
    description: 'typed contract',
    model: 'claude-sonnet-5',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['docs'], filesRead: [], filesWrite: ['docs/delivered.md'] },
    dependencies: [],
    goNogo: { goCriteria: 'delivered', noGoCriteria: 'missing', techDebtAcceptable: '', items },
    status: TaskStatus.PENDING,
    ...over,
  } as Task;
}

function makeResult(over: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '900-100',
    workerId: 'w-900-100',
    filesChanged: ['docs/delivered.md'],
    linesAdded: 5,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 0,
    selfAssessment: 'DONE',
    notes: 'Wrote the deliverable with several sections and detail for readers to follow.',
    ...over,
  };
}

describe('evaluateGoNogoCriteria — deterministic kernel', () => {
  it('decides a file-path go requirement from disk/result evidence', () => {
    const outcome = evaluateGoNogoCriteria(makeTask([
      createGoNoGoCriterionItem({
        polarity: 'go',
        statement: 'deliverable exists',
        evidenceRequirements: [{ kind: 'file', value: 'docs/delivered.md' }],
      }),
    ]), makeResult(), root)!;
    expect(outcome.items[0]).toMatchObject({ status: 'satisfied', mode: 'deterministic' });
    expect(outcome.decisiveNoGo).toBe(false);
    expect(outcome.decided).toBe(1);
  });

  it('a go requirement with provably absent evidence is decisive NO_GO input', () => {
    const outcome = evaluateGoNogoCriteria(makeTask([
      createGoNoGoCriterionItem({
        polarity: 'go',
        statement: 'report exists',
        evidenceRequirements: [{ kind: 'file', value: 'docs/never-written.md' }],
      }),
    ]), makeResult({ filesChanged: [] }), root)!;
    expect(outcome.items[0]!.status).toBe('unsatisfied');
    expect(outcome.decisiveNoGo).toBe(true);
  });

  it('a SATISFIED no-go item is decisive (the failure condition provably holds)', () => {
    const outcome = evaluateGoNogoCriteria(makeTask([
      createGoNoGoCriterionItem({
        polarity: 'no-go',
        statement: 'forbidden artifact appears',
        evidenceRequirements: [{ kind: 'file', value: 'docs/delivered.md' }],
      }),
    ]), makeResult(), root)!;
    expect(outcome.items[0]!.status).toBe('satisfied');
    expect(outcome.decisiveNoGo).toBe(true);
  });

  it('prose requirements stay honestly undecidable and never decide (legacy debt-fix shape)', () => {
    const outcome = evaluateGoNogoCriteria(makeTask([
      createGoNoGoCriterionItem({
        polarity: 'go',
        statement: 'Debt resolved',
        evidenceRequirements: ['Debt resolved'],
      }),
      createGoNoGoCriterionItem({
        polarity: 'no-go',
        statement: 'Debt still present',
        evidenceRequirements: ['Debt still present'],
      }),
    ]), makeResult(), root)!;
    expect(outcome.items.every(item => item.status === 'undecidable')).toBe(true);
    expect(outcome.decisiveNoGo).toBe(false);
    expect(outcome.decided).toBe(0);
  });

  it('does not infer file authority from slashy legacy prose', () => {
    const outcome = evaluateGoNogoCriteria(makeTask([
      createGoNoGoCriterionItem({
        polarity: 'go',
        statement: 'slashy prose remains ambiguous',
        evidenceRequirements: ['Run lint/test before release'],
      }),
    ]), makeResult(), root)!;
    expect(outcome.items[0]).toMatchObject({ status: 'undecidable', mode: 'llm' });
    expect(outcome.decisiveNoGo).toBe(false);
  });

  it.each([
    '/etc/passwd',
    '../outside.md',
    'docs/../outside.md',
    'C:/Windows/system.ini',
  ])('rejects unsafe explicit file locator %s as undecidable', value => {
    const outcome = evaluateGoNogoCriteria(makeTask([
      createGoNoGoCriterionItem({
        polarity: 'go',
        statement: 'unsafe locator is not authority',
        evidenceRequirements: [{ kind: 'file', value }],
      }),
    ]), makeResult({ filesChanged: [] }), root)!;
    expect(outcome.items[0]!.status).toBe('undecidable');
    expect(outcome.decisiveNoGo).toBe(false);
  });

  it.each([
    { kind: 'command' as const, value: 'npx vitest run' },
    { kind: 'assertion' as const, value: 'The feature behaves correctly' },
  ])('leaves explicit $kind requirements for a non-deterministic adapter', requirement => {
    const outcome = evaluateGoNogoCriteria(makeTask([
      createGoNoGoCriterionItem({
        polarity: 'go',
        statement: 'adapter-specific requirement',
        evidenceRequirements: [requirement],
      }),
    ]), makeResult(), root)!;
    expect(outcome.items[0]).toMatchObject({ status: 'undecidable', mode: 'llm' });
  });

  it('returns null for tasks without typed items (no behaviour change)', () => {
    expect(evaluateGoNogoCriteria(makeTask([]), makeResult(), root)).toBeNull();
  });
});

describe('rubric bridge — typed contract caps the verdict', () => {
  it('a decisive typed-contract failure caps DONE at NO_GO with criterion audit rows', () => {
    const task = makeTask([
      createGoNoGoCriterionItem({
        polarity: 'go',
        statement: 'report exists',
        evidenceRequirements: [{ kind: 'file', value: 'docs/never-written.md' }],
      }),
    ]);
    const evaluation = evaluateWithRubric(makeResult({ filesChanged: [] }), task, undefined, root);
    expect(evaluation.decision).toBe('NO_GO');
    const row = evaluation.rubricScores.find(score => score.criterion.startsWith('goNogo:'));
    expect(row).toBeDefined();
    expect(row!.passed).toBe(false);
    expect(row!.reason).toContain('absent: docs/never-written.md');
  });

  it('prose-only legacy items leave the verdict untouched', () => {
    const task = makeTask([
      createGoNoGoCriterionItem({
        polarity: 'go',
        statement: 'Debt resolved',
        evidenceRequirements: ['Debt resolved'],
      }),
    ]);
    const evaluation = evaluateWithRubric(makeResult(), task, undefined, root);
    expect(evaluation.decision).not.toBe('NO_GO');
    const row = evaluation.rubricScores.find(score => score.criterion.startsWith('goNogo:'));
    expect(row).toBeDefined();
    expect(row!.reason).toContain('undecidable');
  });

  it('salvage gates never soften a deterministic contract failure', async () => {
    // Gate 1 — reconcileRubricNoGo: worker-reported signals (DONE, tests
    // green, high coverage) would clear the heuristic salvage thresholds,
    // but the goNogo contract row is CONCRETE disk evidence → NO_GO stands.
    const task = makeTask([
      createGoNoGoCriterionItem({
        polarity: 'go',
        statement: 'report exists',
        evidenceRequirements: [{ kind: 'file', value: 'docs/never-written.md' }],
      }),
    ]);
    const evaluation = evaluateWithRubric(
      makeResult({ filesChanged: [], coverage: 95 }), task, undefined, root);
    expect(evaluation.decision).toBe('NO_GO');
    const gate1 = reconcileRubricNoGo(makeResult({ filesChanged: [], coverage: 95 }), evaluation);
    expect(gate1.decision).toBe('NO_GO');
    expect(gate1.reason).toBe('concrete_contract_failure');

    // Gate 2 — the real-probe recovery path returns the evaluation untouched
    // (probes skipped entirely: green tsc/vitest is unrelated evidence).
    const gate2 = await reconcileEvaluationSpuriousNoGo(
      evaluation, makeResult({ filesChanged: [], coverage: 95 }), task, root);
    expect(gate2).toBe(evaluation);

    expect(hasUnsalvageableContractFailure(evaluation.rubricScores)).toBe(true);
  });

  it('without projectRoot the kernel stays inert (pure-sync callers unchanged)', () => {
    const task = makeTask([
      createGoNoGoCriterionItem({
        polarity: 'go',
        statement: 'report exists',
        evidenceRequirements: [{ kind: 'file', value: 'docs/never-written.md' }],
      }),
    ]);
    const evaluation = evaluateWithRubric(makeResult(), task);
    expect(evaluation.rubricScores.some(score => score.criterion.startsWith('goNogo:'))).toBe(false);
  });
});
