// 523-011 FIX-ADMISSION TRUTH PIN — the Brain verdict is the settling authority.
//
// Corrected chronology (sprint-522 task 002, verified against the durable
// evaluation artifacts under `.deckent/runtime/evaluations/sprint-522/`):
//
//   522-002-attempt-1.json          decision=NO_GO  totalScore=43
//                                   correctness=20 (threshold 60)
//                                   reason: "tests failed; self-assessment GO_WITH_TECH_DEBT"
//   522-002-fix-attempt-1.json      decision=NO_GO  totalScore=43
//   522-002-fix-fix-attempt-1.json  decision=NO_GO  totalScore=43
//   522-002-fix-fix-fix-attempt-1.json decision=NO_GO totalScore=43
//
// The worker CLAIMED GO_WITH_TECH_DEBT; the Brain rubric SETTLED NO_GO. The three
// FIX spawns were therefore correct authority behaviour, not a defect — an earlier
// reading that called them a Brain-GWTD misfire is retired by those artifacts.
//
// What was missing is this pin. The contract, taken from the real modules:
//   * a lineage whose BRAIN evaluation settles GO_WITH_TECH_DEBT takes the debt
//     path and never enters the FIX spawn set;
//   * a lineage whose BRAIN evaluation settles NO_GO enters FIX;
//   * a worker self-claim, on its own, moves neither.
//
// Nothing here changes FIX admission behaviour, and nothing here treats the
// worker's selfAssessment as the settling verdict.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TaskStatus, TaskEvaluation } from '../../src/core/types.js';
import type { Task, TaskResult } from '../../src/core/types.js';

// ─── Collaborators that would otherwise need live infrastructure ─────────
// Task status persistence and lock release belong to the worker runtime; the
// debt ledger belongs to the Memory V2 SQLite store. Both are observed here,
// not exercised — the modules under test (result-evaluator, debt-manager) run
// for real against a real temporary project root.

const statusWrites: Array<{ taskId: string; status: TaskStatus }> = [];
const releasedWorkers: string[] = [];

vi.mock('../../src/agents/worker.js', () => ({
  updateTaskStatus: vi.fn((_root: string, taskId: string, status: TaskStatus) => {
    statusWrites.push({ taskId, status });
  }),
  releaseAllLocks: vi.fn((_root: string, workerId: string) => {
    releasedWorkers.push(workerId);
    return 0;
  }),
}));

const debtLedger = new Map<string, Record<string, unknown>>();
const fakeMemoryStore = {
  getById: vi.fn((id: string) => debtLedger.get(id) ?? null),
  insert: vi.fn((input: Record<string, unknown>) => {
    debtLedger.set(input.id as string, input);
    return input;
  }),
  close: vi.fn(),
};

vi.mock('../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn().mockImplementation(() => fakeMemoryStore),
}));

import { evaluateWithRubric } from '../../src/orchestra/result-evaluator.js';
import { handleEvaluation } from '../../src/orchestra/debt-manager.js';

// ─── Fixtures ────────────────────────────────────────────────────────────

let projectRoot: string;

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Pinned lineage ${id}`,
    description: 'Lineage used to pin FIX admission against the Brain verdict.',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'fix-admission regression pin',
    scope: {
      directories: ['src/orchestra/'],
      filesRead: ['src/orchestra/debt-manager.ts'],
      filesWrite: ['src/orchestra/debt-manager.ts'],
    },
    dependencies: [],
    goNogo: {
      goCriteria: 'targeted tests pass',
      noGoCriteria: 'targeted tests fail',
      techDebtAcceptable: 'minor',
    },
    status: TaskStatus.IN_PROGRESS,
    sprintId: 'sprint-523',
    assignedWorker: `w-${id}`,
    createdAt: '2026-08-12T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * The exact result shape the 522-002 lineage produced: the worker claimed
 * GO_WITH_TECH_DEBT while its tests were failing and coverage was unmeasured.
 * Reproduced field-for-field so the rubric arithmetic below is comparable with
 * the durable artifact rather than an invented example.
 */
function makeWorkerGwtdFailingResult(taskId: string): TaskResult {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: ['src/orchestra/debt-manager.ts'],
    linesAdded: 42,
    linesRemoved: 7,
    testsPassed: false,
    coverage: 0,
    selfAssessment: 'GO_WITH_TECH_DEBT',
    notes:
      'Implementation landed but the targeted suite still fails; leaving the remaining '
      + 'assertion gap as declared tech debt rather than claiming a clean pass. Detailed '
      + 'enough that the documentation criterion scores full marks, exactly as the durable '
      + 'sprint-522 artifact recorded.',
  };
}

/**
 * A genuinely healthy result whose worker still declared debt: tests pass,
 * coverage is real, every changed file is inside scope. The rubric total clears
 * the passing score, so only the debt ceiling can hold it at GO_WITH_TECH_DEBT.
 */
function makeWorkerGwtdPassingResult(taskId: string): TaskResult {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: ['src/orchestra/debt-manager.ts'],
    linesAdded: 30,
    linesRemoved: 4,
    testsPassed: true,
    coverage: 90,
    selfAssessment: 'GO_WITH_TECH_DEBT',
    notes:
      'Work is complete and verified, but one follow-up simplification is deliberately '
      + 'deferred and declared here as tech debt so the ledger keeps it. Notes are long '
      + 'enough to score the documentation criterion at full marks.',
  };
}

/** Identity bridge from the rubric decision string to the settlement enum. */
const VERDICT_TO_EVALUATION: Readonly<Record<'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO', TaskEvaluation>> = {
  DONE: TaskEvaluation.DONE,
  GO_WITH_TECH_DEBT: TaskEvaluation.GO_WITH_TECH_DEBT,
  NO_GO: TaskEvaluation.NO_GO,
};

function scoreOf(rubricScores: ReadonlyArray<{ criterion: string; score: number }>, criterion: string): number {
  const hit = rubricScores.find(s => s.criterion === criterion);
  if (!hit) throw new Error(`rubric produced no ${criterion} score`);
  return hit.score;
}

function fixTaskPath(taskId: string): string {
  return join(projectRoot, '.tasks', `task-${taskId}-fix.json`);
}

/**
 * The FIX spawn set as it actually reaches the FIX phase: the persisted priority-fix
 * task records under `.tasks/`. `handleEvaluation` is the sole producer of these
 * records on the NO_GO path, so their presence — and only their presence — is what
 * admits a lineage into a repair attempt.
 */
function persistedFixSpawnSet(): string[] {
  const tasksDir = join(projectRoot, '.tasks');
  if (!existsSync(tasksDir)) return [];
  return readdirSync(tasksDir)
    .filter(f => f.startsWith('task-') && f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(join(tasksDir, f), 'utf-8')) as Task)
    .filter(t => t.isPriorityFix === true)
    .map(t => t.id)
    .sort();
}

beforeEach(() => {
  vi.clearAllMocks();
  statusWrites.length = 0;
  releasedWorkers.length = 0;
  debtLedger.clear();
  projectRoot = mkdtempSync(join(tmpdir(), 'deckent-gwtd-fix-pin-'));
  mkdirSync(join(projectRoot, '.tasks'), { recursive: true });
  mkdirSync(join(projectRoot, '.brain'), { recursive: true });
  // getMemoryStore() opens the ledger only when the DB file exists; the store
  // itself is the in-memory fake above.
  writeFileSync(join(projectRoot, '.brain', 'memory.db'), '');
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

// ═══ 1. The Brain rubric is what settles a lineage ═══════════════════════

describe('Brain rubric settlement (sprint-522 002 chronology)', () => {
  it('reproduces the durable 522-002 verdict: worker GO_WITH_TECH_DEBT, Brain NO_GO at 43/100', () => {
    const task = makeTask('522-002-pin');
    const result = makeWorkerGwtdFailingResult(task.id);

    const evaluation = evaluateWithRubric(result, task);

    // The worker's own claim.
    expect(result.selfAssessment).toBe('GO_WITH_TECH_DEBT');
    // The Brain's verdict — the one that settles.
    expect(evaluation.decision).toBe('NO_GO');
    expect(evaluation.totalScore).toBe(43);
    // Criterion-level agreement with the artifact: correctness 20 against a
    // threshold of 60 is precisely why the self-claim did not carry.
    expect(scoreOf(evaluation.rubricScores, 'correctness')).toBe(20);
    expect(scoreOf(evaluation.rubricScores, 'test_coverage')).toBe(0);
    expect(scoreOf(evaluation.rubricScores, 'scope_compliance')).toBe(100);
    expect(scoreOf(evaluation.rubricScores, 'documentation')).toBe(100);
  });

  it('holds a passing score at the worker debt ceiling instead of raising it to DONE', () => {
    const task = makeTask('523-debt-pin');
    const evaluation = evaluateWithRubric(makeWorkerGwtdPassingResult(task.id), task);

    expect(evaluation.totalScore).toBeGreaterThanOrEqual(70);
    expect(evaluation.decision).toBe('GO_WITH_TECH_DEBT');
  });

  it('maps every rubric verdict onto the settlement enum without renaming it', () => {
    expect(VERDICT_TO_EVALUATION.DONE).toBe(TaskEvaluation.DONE);
    expect(VERDICT_TO_EVALUATION.GO_WITH_TECH_DEBT).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
    expect(VERDICT_TO_EVALUATION.NO_GO).toBe(TaskEvaluation.NO_GO);
    expect(String(TaskEvaluation.NO_GO)).toBe('NO_GO');
    expect(String(TaskEvaluation.GO_WITH_TECH_DEBT)).toBe('GO_WITH_TECH_DEBT');
  });
});

// ═══ 2. FIX admission follows that verdict, and only that verdict ════════

describe('FIX admission is driven by the Brain verdict', () => {
  it('admits a FIX for a lineage the Brain settled NO_GO', () => {
    const task = makeTask('523-nogo-pin');
    const result = makeWorkerGwtdFailingResult(task.id);

    handleEvaluation(projectRoot, task, TaskEvaluation.NO_GO, result);

    expect(existsSync(fixTaskPath(task.id))).toBe(true);
    const fixTask = JSON.parse(readFileSync(fixTaskPath(task.id), 'utf-8')) as Task;
    expect(fixTask.id).toBe(`${task.id}-fix`);
    expect(fixTask.isPriorityFix).toBe(true);
    expect(fixTask.fixForTaskId).toBe(task.id);
    expect(persistedFixSpawnSet()).toEqual([`${task.id}-fix`]);

    // NO_GO is a repair route, not a debt route.
    expect(debtLedger.size).toBe(0);
    expect(statusWrites).toContainEqual({ taskId: task.id, status: TaskStatus.NO_GO });
  });

  it('routes a lineage the Brain settled GO_WITH_TECH_DEBT to debt, never to FIX', () => {
    const task = makeTask('523-gwtd-pin');
    const result = makeWorkerGwtdPassingResult(task.id);

    handleEvaluation(projectRoot, task, TaskEvaluation.GO_WITH_TECH_DEBT, result);

    const debtEntry = debtLedger.get(`debt-${task.id}`);
    expect(debtEntry).toBeDefined();
    expect((debtEntry?.metadata as { debtSource?: string } | undefined)?.debtSource).toBe('evaluator');

    expect(existsSync(fixTaskPath(task.id))).toBe(false);
    expect(persistedFixSpawnSet()).toEqual([]);
    expect(statusWrites).toContainEqual({ taskId: task.id, status: TaskStatus.DONE });
  });
});

// ═══ 3. A worker self-claim, alone, moves neither path ═══════════════════

describe('worker self-assessment alone settles nothing', () => {
  it('does not admit a FIX when only the worker says NO_GO', () => {
    const task = makeTask('523-selfnogo-pin');
    const result: TaskResult = {
      ...makeWorkerGwtdPassingResult(task.id),
      selfAssessment: 'NO_GO',
    };

    handleEvaluation(projectRoot, task, TaskEvaluation.DONE, result);

    expect(existsSync(fixTaskPath(task.id))).toBe(false);
    expect(persistedFixSpawnSet()).toEqual([]);
    expect(statusWrites).toContainEqual({ taskId: task.id, status: TaskStatus.DONE });
    expect(statusWrites.some(w => w.status === TaskStatus.NO_GO)).toBe(false);
  });

  it('does not admit a FIX when only the worker says GO_WITH_TECH_DEBT', () => {
    const task = makeTask('523-selfgwtd-pin');
    const result = makeWorkerGwtdPassingResult(task.id);

    handleEvaluation(projectRoot, task, TaskEvaluation.DONE, result);

    // The self-declared debt still reaches the ledger (354-011) — but as debt,
    // tagged to its source, and never as a repair attempt.
    const debtEntry = debtLedger.get(`debt-${task.id}`);
    expect(debtEntry).toBeDefined();
    expect((debtEntry?.metadata as { debtSource?: string } | undefined)?.debtSource).toBe('self');
    expect(existsSync(fixTaskPath(task.id))).toBe(false);
    expect(persistedFixSpawnSet()).toEqual([]);
  });

  it('still admits a FIX when the Brain says NO_GO and the worker claimed DONE', () => {
    const task = makeTask('523-selfdone-pin');
    const result: TaskResult = {
      ...makeWorkerGwtdPassingResult(task.id),
      selfAssessment: 'DONE',
    };

    handleEvaluation(projectRoot, task, TaskEvaluation.NO_GO, result);

    expect(existsSync(fixTaskPath(task.id))).toBe(true);
    expect(persistedFixSpawnSet()).toEqual([`${task.id}-fix`]);
    expect(debtLedger.size).toBe(0);
  });
});

// ═══ 4. Both lineages together: one spawn set, one member ════════════════

describe('two lineages, evaluated and settled through the real modules', () => {
  it('lets only the Brain-NO_GO lineage into the FIX spawn set', () => {
    const noGoTask = makeTask('523-e2e-nogo');
    const debtTask = makeTask('523-e2e-gwtd');
    const noGoResult = makeWorkerGwtdFailingResult(noGoTask.id);
    const debtResult = makeWorkerGwtdPassingResult(debtTask.id);

    // Both workers claim GO_WITH_TECH_DEBT; only the evidence differs.
    expect(noGoResult.selfAssessment).toBe('GO_WITH_TECH_DEBT');
    expect(debtResult.selfAssessment).toBe('GO_WITH_TECH_DEBT');

    const noGoVerdict = evaluateWithRubric(noGoResult, noGoTask);
    const debtVerdict = evaluateWithRubric(debtResult, debtTask);
    expect(noGoVerdict.decision).toBe('NO_GO');
    expect(debtVerdict.decision).toBe('GO_WITH_TECH_DEBT');

    handleEvaluation(projectRoot, noGoTask, VERDICT_TO_EVALUATION[noGoVerdict.decision], noGoResult);
    handleEvaluation(projectRoot, debtTask, VERDICT_TO_EVALUATION[debtVerdict.decision], debtResult);

    expect(persistedFixSpawnSet()).toEqual([`${noGoTask.id}-fix`]);
    expect(debtLedger.has(`debt-${debtTask.id}`)).toBe(true);
    expect(debtLedger.has(`debt-${noGoTask.id}`)).toBe(false);
  });
});
