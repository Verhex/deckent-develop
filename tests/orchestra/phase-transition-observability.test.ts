// ═══ Sprint Phase Observability + EvaluationAuditTrail Wire Tests ═══════
// Sprint 161 Task 2 (T-003) regression suite.
//
// Scenarios:
//   1. persistPhaseTransition writes PLAN/PLANNING to sprint-state.json
//   2. persistPhaseTransition writes SPAWN transition (status update)
//   3. runEvaluatePhase writes EVALUATE/EVALUATING via wire
//   4. runFixPhase writes FIX/FIXING via wire
//   5. runEvaluatePhase writes a per-task audit.json with canonical schema
//   6. atomic write — no .tmp/.partial leftover under .deckent/
//
// The persistPhaseTransition helper is exercised directly (it is the
// shared mutation point). runEvaluatePhase + runFixPhase are exercised
// with heavily mocked collaborators so we only assert disk effects from
// the persistPhaseTransition + writeEvaluationAudit wires.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  existsSync, mkdtempSync, readFileSync, readdirSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  SprintPhase, SprintStatus, TaskEvaluation, TaskStatus,
} from '../../src/core/types.js';
import type { Sprint, Task, TaskResult } from '../../src/core/types.js';
import { EVALUATIONS_DIR } from '../../src/core/constants.js';

// ─── Mock the heavy collaborators used by runEvaluatePhase / runFixPhase ─

vi.mock('../../src/core/plugin-hooks.js', () => ({
  runHooks: vi.fn().mockResolvedValue(undefined),
  runCiRegressionCheck: vi.fn(),
  resolveCiGuardianConfig: vi.fn().mockReturnValue({ enabled: false }),
  runPreSprintValidation: vi.fn().mockReturnValue({ passed: true }),
  parseTscErrorFiles: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/monitor/auditor.js', () => ({
  updateDashboard: vi.fn(),
  startScanLoop: vi.fn().mockReturnValue(null),
  writeScanToDashboard: vi.fn(),
  runScanCycle: vi.fn().mockReturnValue({}),
}));

vi.mock('../../src/orchestra/debt-manager.js', () => ({
  handleEvaluation: vi.fn(),
  handleCrossDependencies: vi.fn(),
  escalateDebt: vi.fn(),
  resolveDebt: vi.fn(),
  runDecay: vi.fn(),
}));

vi.mock('../../src/orchestra/sprint-spawner.js', () => ({
  applyCascadeToSprint: vi.fn().mockReturnValue({
    decision: { shouldCascade: false, category: 'RUNTIME' },
    blockedTaskIds: [],
  }),
  applyUnblockToSprint: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/orchestra/event-stream.js', () => ({
  writeEvent: vi.fn(),
  getCurrentSprintId: vi.fn().mockReturnValue('sprint-161-test'),
}));

vi.mock('../../src/core/notify.js', () => ({
  notify: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/orchestra/result-evaluator.js', () => ({
  evaluateWithRubric: vi.fn(() => ({
    decision: 'DONE',
    totalScore: 88,
    rubricScores: [
      { criterion: 'correctness', score: 90, passed: true, reason: 'tests pass' },
      { criterion: 'test_coverage', score: 80, passed: true, reason: 'coverage 80%' },
      { criterion: 'scope_compliance', score: 100, passed: true, reason: 'scope ok' },
      { criterion: 'documentation', score: 70, passed: true, reason: 'notes present' },
    ],
    retryCount: 0,
  })),
  // R8/ADR-087: spurious recovery moved to this async helper — passthrough here.
  reconcileEvaluationSpuriousNoGo: vi.fn((evaluation) => evaluation),
}));

vi.mock('../../src/orchestra/sprint-controller.js', async () => {
  // Import the real writeSprintState so it actually persists on disk.
  const utils = await import('../../src/orchestra/sprint-utils.js');
  return {
    BrainError: class BrainError extends Error {
      constructor(msg: string, public phase: string) { super(msg); }
    },
    readContext: vi.fn().mockReturnValue({ memory: '', retro: '', patterns: '', debt: '' }),
    planSprint: vi.fn().mockResolvedValue({
      id: 'sprint-161-test', number: 161, tasks: [], workers: [],
      phase: SprintPhase.PLAN, status: SprintStatus.PLANNING, startedAt: '',
    }),
    writeSprintState: utils.writeSprintState,
    spawnWorkers: vi.fn().mockResolvedValue([]),
    buildSpawnRetryHint: vi.fn().mockReturnValue(''),
    waitForResults: vi.fn().mockResolvedValue([]),
    finalizeSprint: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn(),
  };
});

// ─── Imports of the module under test happen AFTER the mocks register ───

import {
  persistPhaseTransition,
  runEvaluatePhase,
  runFixPhase,
} from '../../src/orchestra/sprint-phases.js';

// ─── Test helpers ───────────────────────────────────────────────────────

function makeProjectRoot(): string {
  return mkdtempSync(join(tmpdir(), 'deckent-phase-obs-'));
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't-1',
    title: 'Sample',
    description: 'A test task',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'unit',
    scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/foo.ts'] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: TaskStatus.EXECUTING,
    ...overrides,
  } as Task;
}

function makeSprint(overrides: Partial<Sprint> = {}): Sprint {
  return {
    id: 'sprint-161-test',
    number: 161,
    status: SprintStatus.PLANNING,
    phase: SprintPhase.PLAN,
    tasks: [makeTask()],
    workers: ['w-t-1'],
    startedAt: '2026-05-12T20:00:00.000Z',
    ...overrides,
  };
}

function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: 't-1',
    workerId: 'w-t-1',
    filesChanged: ['src/foo.ts'],
    linesAdded: 5,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 80,
    selfAssessment: 'DONE',
    notes: 'done',
    ...overrides,
  } as TaskResult;
}

function readState(projectRoot: string): {
  sprintId?: string; phase?: string; status?: string; updatedAt?: string; taskIds?: string[];
} {
  const path = join(projectRoot, '.deckent', 'sprint-state.json');
  return JSON.parse(readFileSync(path, 'utf-8'));
}

// ─── Suite ──────────────────────────────────────────────────────────────

describe('Sprint 161 Task 2 — Phase observability + EvaluationAuditTrail wire', () => {
  let root: string;

  beforeEach(() => {
    root = makeProjectRoot();
    vi.clearAllMocks();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  // ─── Scenario 1: PLAN transition ─────────────────────────────────────
  it('persistPhaseTransition writes PLAN/PLANNING to sprint-state.json', () => {
    const sprint = makeSprint();
    persistPhaseTransition(root, sprint, SprintPhase.PLAN, SprintStatus.PLANNING);
    const state = readState(root);
    expect(state.sprintId).toBe('sprint-161-test');
    expect(state.phase).toBe(SprintPhase.PLAN);
    expect(state.status).toBe(SprintStatus.PLANNING);
    expect(state.taskIds).toEqual(['t-1']);
    expect(state.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // In-memory sprint reflects the transition for subsequent reads.
    expect(sprint.phase).toBe(SprintPhase.PLAN);
    expect(sprint.status).toBe(SprintStatus.PLANNING);
  });

  // ─── Scenario 2: SPAWN transition (status flip) ──────────────────────
  it('persistPhaseTransition flips PLAN→SPAWN with status update visible on disk', () => {
    const sprint = makeSprint();
    persistPhaseTransition(root, sprint, SprintPhase.SPAWN, SprintStatus.PLANNING);
    let state = readState(root);
    expect(state.phase).toBe(SprintPhase.SPAWN);
    expect(state.status).toBe(SprintStatus.PLANNING);

    // Promotion to ACTIVE after successful spawn is also reflected.
    persistPhaseTransition(root, sprint, SprintPhase.SPAWN, SprintStatus.ACTIVE);
    state = readState(root);
    expect(state.phase).toBe(SprintPhase.SPAWN);
    expect(state.status).toBe(SprintStatus.ACTIVE);
  });

  // ─── Scenario 3: EVALUATE wire via runEvaluatePhase ──────────────────
  it('runEvaluatePhase writes EVALUATE/EVALUATING to sprint-state.json', async () => {
    const sprint = makeSprint({
      phase: SprintPhase.EXECUTE, status: SprintStatus.ACTIVE,
    });
    const evaluations = new Map<string, TaskEvaluation>();
    await runEvaluatePhase(root, sprint, [makeResult()], evaluations);
    const state = readState(root);
    expect(state.phase).toBe(SprintPhase.EVALUATE);
    expect(state.status).toBe(SprintStatus.EVALUATING);
  });

  // ─── Scenario 4: FIX wire via runFixPhase ────────────────────────────
  it('runFixPhase writes FIX/FIXING to sprint-state.json', async () => {
    const sprint = makeSprint({
      phase: SprintPhase.EVALUATE, status: SprintStatus.EVALUATING,
    });
    const evaluations = new Map<string, TaskEvaluation>([
      ['t-1', TaskEvaluation.NO_GO],
    ]);
    await runFixPhase(
      root, sprint, evaluations, [makeResult({ selfAssessment: 'NO_GO' })],
      { activeModeConfig: {} } as unknown as Parameters<typeof runFixPhase>[4],
      undefined, 'v1', undefined,
    );
    const state = readState(root);
    expect(state.phase).toBe(SprintPhase.FIX);
    expect(state.status).toBe(SprintStatus.FIXING);
  });

  // ─── Scenario 5: per-task audit.json written with canonical schema ───
  it('runEvaluatePhase writes per-task audit.json with canonical schema', async () => {
    const sprint = makeSprint({
      phase: SprintPhase.EXECUTE, status: SprintStatus.ACTIVE,
    });
    const evaluations = new Map<string, TaskEvaluation>();
    await runEvaluatePhase(root, sprint, [makeResult()], evaluations);

    const auditPath = join(
      root, EVALUATIONS_DIR, 'sprint-161-test', 't-1-attempt-1.json',
    );
    expect(existsSync(auditPath)).toBe(true);
    const audit = JSON.parse(readFileSync(auditPath, 'utf-8'));
    expect(audit.taskId).toBe('t-1');
    expect(audit.sprintId).toBe('sprint-161-test');
    expect(audit.attemptNum).toBe(1);
    expect(audit.evaluator).toBe('brain');
    expect(audit.ruleSet).toBe('CODE');
    expect(audit.decision).toBe('DONE');
    expect(audit.totalScore).toBe(88);
    expect(audit.schemaValidation.valid).toBe(true);
    expect(audit.criterionScores).toHaveLength(4);
    // threshold/weight come from the CODE rubric — non-zero confirms the
    // join between rubricScores and getRubric() worked.
    const correctness = audit.criterionScores.find(
      (c: { name: string }) => c.name === 'correctness',
    );
    expect(correctness.threshold).toBe(60);
    expect(correctness.weight).toBe(0.4);
    expect(audit.decisionRationale).toMatch(/decision=DONE/);
  });

  // ─── Scenario 6: atomic write — no leftover .tmp / .partial files ────
  it('persistPhaseTransition leaves no .tmp/.partial leftover under .deckent', () => {
    const sprint = makeSprint();
    persistPhaseTransition(root, sprint, SprintPhase.PLAN, SprintStatus.PLANNING);
    persistPhaseTransition(root, sprint, SprintPhase.SPAWN, SprintStatus.ACTIVE);
    persistPhaseTransition(root, sprint, SprintPhase.EVALUATE, SprintStatus.EVALUATING);
    persistPhaseTransition(root, sprint, SprintPhase.FIX, SprintStatus.FIXING);

    const entries = readdirSync(join(root, '.deckent'));
    const leftovers = entries.filter(e => /\.(tmp|partial|swp)$/i.test(e));
    expect(leftovers).toEqual([]);

    // sprint-state.json reflects the LATEST transition (no stale state).
    const state = readState(root);
    expect(state.phase).toBe(SprintPhase.FIX);
    expect(state.status).toBe(SprintStatus.FIXING);
  });
});
