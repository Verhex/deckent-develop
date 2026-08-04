// ─── POSTFIX-PENDING-SCAN Tests (Sprint 361 Task 361-004 — born-475) ─────
//
// Sprint 360 live lesson: tasks 003/008 whose parent tasks were already DONE
// were never spawned — a stall window swallowed the per-completion
// respawnEligibleTasks call, leaving a PENDING+dependency-eligible task with
// zero dispatch attempts. This suite covers the safety-net block wired at the
// very end of `runFixPhase` (src/orchestra/sprint-phases.ts): after the
// existing NO_GO/NOT_DISPATCHED fix machinery runs, a BOUNDED re-scan loop
// reuses respawnEligibleTasks (the same wave mechanism spawnWorkers/EVALUATE
// use elsewhere) to catch anything still PENDING+eligible, spawns it, waits
// for its results via the same waitForResults seam the fix pipeline uses, and
// re-scans after every completed wave (structurally bounded by the number of
// sprint tasks) so a root→consumer→verifier chain drains in one lifecycle.
//
// respawnEligibleTasks itself is mocked here (its own dependency-graph
// internals are already covered by tests/orchestra/sprint-spawner.test.ts and
// the dependency-pipeline-*.test.ts suites) — this suite isolates the NEW
// wiring: is it called, are its spawned tasks waited-on and evaluated, and
// does the whole thing stay a no-op when nothing is eligible. Mocking the
// seam also keeps the suite independent of the production
// `config.dependency_pipeline_enabled` gate inside the real function.
//
// ─── REAL FILESYSTEM (FAZ4A-S7, mirrors S4's fix-phase-map.test.ts) ──
// The node:fs / constants / utils mocks are deliberately GONE. runFixPhase's
// entry (`persistPhaseTransition` → `publishCanonicalRunStatusReadModel`) is
// an atomic write→rename→readback→digest publication chain an in-memory fs
// mock cannot carry (RECORDED-FAILED approach, do not retry) — under the old
// mock the phase failed BEFORE ever reaching the postfix scan, so the seam
// under test never ran. Each test gets a fresh real scratch project root
// under tmpdir with real `.tasks` / `.deckent` directories.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  TaskEvaluation, TaskStatus, SprintPhase, SprintStatus,
} from '../../src/core/types.js';
import type { Task, TaskResult, Sprint, ResolvedConfig, EvaluationResult } from '../../src/core/types.js';

// Real fs, mocked processes: git/tsc probes must not escape the sandbox. A bare
// vi.fn() would return undefined and crash callers reading `.status`.
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => ({ status: 0, stdout: '', stderr: '' })),
  execSync: vi.fn(() => ''),
  execFileSync: vi.fn(() => ''),
  spawn: vi.fn(),
  exec: vi.fn(),
}));

// HYBRID (importOriginal spread): only the rubric grader + spurious-NO_GO
// reconcile are stubbed; classifyFixPhaseTasks & friends stay REAL. Impls are
// passed at factory time so vi.clearAllMocks preserves the passthrough.
vi.mock('../../src/orchestra/result-evaluator.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/result-evaluator.js')>();
  return {
    ...actual,
    evaluateWithRubric: vi.fn(),
    reconcileEvaluationSpuriousNoGo: vi.fn(async (evaluation: EvaluationResult) => evaluation),
  };
});

vi.mock('../../src/orchestra/sprint-controller.js', () => ({
  BrainError: class BrainError extends Error {},
  readContext: vi.fn(),
  planSprint: vi.fn(),
  writeSprintState: vi.fn(),
  spawnWorkers: vi.fn(async () => []),
  buildSpawnRetryHint: vi.fn(() => ''),
  waitForResults: vi.fn(async () => []),
  finalizeSprint: vi.fn(),
  cleanup: vi.fn(),
}));

// Partial mock: keep the REAL applyCascadeToSprint/applyUnblockToSprint (used
// elsewhere in runFixPhase) and mock ONLY the respawnEligibleTasks seam this
// task wires up — isolates the postfix-scan wiring under test.
vi.mock('../../src/orchestra/sprint-spawner.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/sprint-spawner.js')>();
  return {
    ...actual,
    respawnEligibleTasks: vi.fn(async () => [] as string[]),
  };
});

vi.mock('../../src/orchestra/debt-manager.js', () => ({
  handleEvaluation: vi.fn(),
  handleCrossDependencies: vi.fn(),
  escalateDebt: vi.fn(),
  resolveDebt: vi.fn(),
  runDecay: vi.fn(),
}));

vi.mock('../../src/monitor/auditor.js', () => ({
  updateDashboard: vi.fn(),
  startScanLoop: vi.fn(),
  writeScanToDashboard: vi.fn(),
  runScanCycle: vi.fn(),
}));

vi.mock('../../src/core/agent-pool.js', () => ({
  AgentPoolManager: vi.fn().mockImplementation(() => ({ loadAgents: () => [] })),
}));
vi.mock('../../src/core/skill-pool.js', () => ({
  SkillPoolManager: vi.fn().mockImplementation(() => ({ loadSkills: () => [] })),
}));
vi.mock('../../src/core/stack-detector.js', () => ({
  detectProjectStack: vi.fn(() => ({})),
}));

vi.mock('../../src/orchestra/rollback.js', () => ({
  createSafetyPoint: vi.fn(),
  rollback: vi.fn(),
  getRollbackPolicy: vi.fn(),
  recordRollbackInDebt: vi.fn(),
  saveSafetyPoint: vi.fn(),
  deleteSafetyPoint: vi.fn(),
  deleteSafetyPointFile: vi.fn(),
  isCleanWorkingTree: vi.fn().mockReturnValue(true),
  safetyBranchExists: vi.fn().mockReturnValue(false),
  isGitRepo: vi.fn().mockReturnValue(true),
  cleanOrphanSafetyPoint: vi.fn().mockReturnValue(false),
  loadSafetyPoint: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/core/plugin-hooks.js', () => ({
  runHooks: vi.fn(),
  runCiRegressionCheck: vi.fn(),
  resolveCiGuardianConfig: vi.fn(() => ({ enabled: false })),
  runPreSprintValidation: vi.fn(),
  parseTscErrorFiles: vi.fn(() => []),
}));

vi.mock('../../src/orchestra/sprint-reporter.js', () => ({
  calculateMetrics: vi.fn(),
}));

vi.mock('../../src/cli/helpers/splash.js', () => ({
  showSplash: vi.fn(() => ''),
  showSplashIfEnabled: vi.fn(() => ''),
}));

// HYBRID: real CHANNELS/constants (the real sprint-spawner module imports
// them at load), stubbed write/read seams for call-based assertions.
vi.mock('../../src/orchestra/event-stream.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/event-stream.js')>();
  return {
    ...actual,
    writeEvent: vi.fn(),
    getCurrentSprintId: vi.fn(() => 'sprint-361'),
    readSequence: vi.fn(() => 0),
  };
});

// ─── Imports (after mocks) ────────────────────────────────────────────────

import { runFixPhase } from '../../src/orchestra/sprint-phases.js';
import { waitForResults } from '../../src/orchestra/sprint-controller.js';
import { respawnEligibleTasks } from '../../src/orchestra/sprint-spawner.js';
import { evaluateWithRubric } from '../../src/orchestra/result-evaluator.js';
import { handleEvaluation } from '../../src/orchestra/debt-manager.js';
import { writeEvent } from '../../src/orchestra/event-stream.js';

// ─── Helpers ───────────────────────────────────────────────────────────────

let root: string;

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '361-777',
    title: 'Test task',
    description: 'A test task',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'minor' },
    status: TaskStatus.PENDING,
    ...overrides,
  };
}

function makeResult(taskId: string, overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: ['src/test.ts'],
    linesAdded: 10,
    linesRemoved: 2,
    testsPassed: true,
    coverage: 85,
    selfAssessment: 'DONE',
    notes: 'OK',
    ...overrides,
  };
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-361',
    number: 361,
    status: SprintStatus.ACTIVE,
    phase: SprintPhase.EVALUATE,
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
  };
}

function makeConfig(): ResolvedConfig {
  return {
    mode: 'balanced',
    activeModeConfig: { max_workers: 4 },
    modes: {},
    language: 'en',
    projectName: 'test',
    projectRoot: root,
    version: '0.4.0',
  } as ResolvedConfig;
}

function makeEvalResult(decision: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO'): EvaluationResult {
  return {
    decision,
    totalScore: decision === 'DONE' ? 90 : decision === 'GO_WITH_TECH_DEBT' ? 65 : 30,
    rubricScores: [],
    retryCount: 1,
  };
}

function postFixScanEvent(): Record<string, unknown> | undefined {
  const call = vi.mocked(writeEvent).mock.calls.find(c => c[4] === 'BRAIN→WORKER:POSTFIX_PENDING_SCAN');
  return call?.[5] as Record<string, unknown> | undefined;
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe('FIX Phase — postfix-pending-scan (361-004, born-475)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks does NOT reset implementations — restore seam defaults so
    // a previous test's mockResolvedValue can never leak into the next. Tests
    // queue one wave via mockResolvedValueOnce; the bounded re-scan loop then
    // falls back to this empty default and terminates.
    vi.mocked(respawnEligibleTasks).mockResolvedValue([]);
    vi.mocked(waitForResults).mockResolvedValue([]);
    root = mkdtempSync(join(tmpdir(), 'deckent-pps-'));
    mkdirSync(join(root, '.tasks'), { recursive: true });
    mkdirSync(join(root, '.deckent', 'runtime'), { recursive: true });
    mkdirSync(join(root, '.deckent', 'pids'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('parent DONE + child PENDING: post-FIX pass dispatches the never-spawned child', async () => {
    const parent = makeTask({ id: '361-003', status: TaskStatus.DONE });
    const child = makeTask({ id: '361-008', status: TaskStatus.PENDING, dependencies: ['361-003'] });
    const sprint = makeSprint([parent, child]);
    const evaluations = new Map<string, TaskEvaluation>();

    vi.mocked(respawnEligibleTasks).mockResolvedValueOnce(['361-008']);
    vi.mocked(waitForResults).mockResolvedValue([makeResult('361-008')]);
    vi.mocked(evaluateWithRubric).mockReturnValue(makeEvalResult('DONE'));

    await runFixPhase(root, sprint, evaluations, [], makeConfig(), undefined, 'v1', undefined);

    // Wave 1 dispatches the stalled child; the bounded re-scan (wave 2) finds
    // nothing further eligible and terminates without a second dispatch.
    expect(respawnEligibleTasks).toHaveBeenCalledTimes(2);
    expect(waitForResults).toHaveBeenCalledTimes(1);
    const waitedSprint = vi.mocked(waitForResults).mock.calls[0][1] as Sprint;
    expect(waitedSprint.tasks.map(t => t.id)).toEqual(['361-008']);

    expect(evaluations.get('361-008')).toBe(TaskEvaluation.DONE);
    expect(handleEvaluation).toHaveBeenCalledTimes(1);

    expect(postFixScanEvent()).toMatchObject({
      spawned: 1,
      taskIds: ['361-008'],
      succeeded: 1,
      failed: 0,
    });
  });

  it('no eligible PENDING tasks: behavior is byte-identical (no wait, no event)', async () => {
    const task = makeTask({ id: '361-900', status: TaskStatus.PENDING });
    const sprint = makeSprint([task]);
    const evaluations = new Map<string, TaskEvaluation>();

    await runFixPhase(root, sprint, evaluations, [], makeConfig(), undefined, 'v1', undefined);

    expect(respawnEligibleTasks).toHaveBeenCalledTimes(1);
    expect(waitForResults).not.toHaveBeenCalled();
    expect(postFixScanEvent()).toBeUndefined();
    expect(evaluations.size).toBe(0);
  });

  it('a NEW failure from the post-FIX pass is a single-pass NO_GO — no second dispatch wave', async () => {
    const parent = makeTask({ id: '361-010', status: TaskStatus.DONE });
    const child = makeTask({ id: '361-011', status: TaskStatus.PENDING, dependencies: ['361-010'] });
    const sprint = makeSprint([parent, child]);
    const evaluations = new Map<string, TaskEvaluation>();

    vi.mocked(respawnEligibleTasks).mockResolvedValueOnce(['361-011']);
    vi.mocked(waitForResults).mockResolvedValue([makeResult('361-011', {
      testsPassed: false,
      selfAssessment: 'NO_GO',
      notes: 'build failed',
    })]);
    vi.mocked(evaluateWithRubric).mockReturnValue(makeEvalResult('NO_GO'));

    await runFixPhase(root, sprint, evaluations, [], makeConfig(), undefined, 'v1', undefined);

    // Exactly one dispatch/wait round within this single runFixPhase call —
    // the bounded re-scan (wave 2) runs the eligibility scan once more, finds
    // the failed task no longer spawnable, and does NOT trigger another
    // immediate waitForResults round for it.
    expect(respawnEligibleTasks).toHaveBeenCalledTimes(2);
    expect(waitForResults).toHaveBeenCalledTimes(1);

    expect(evaluations.get('361-011')).toBe(TaskEvaluation.NO_GO);
    // Standard NO_GO path — same handleEvaluation used everywhere else,
    // which is what creates the normal "-fix" task for a LATER sprint.
    // (The postfix loop passes no minting policy → default {}.)
    expect(handleEvaluation).toHaveBeenCalledWith(
      root, child, TaskEvaluation.NO_GO, expect.objectContaining({ taskId: '361-011' }), {},
    );
    expect(postFixScanEvent()).toMatchObject({ spawned: 1, succeeded: 0, failed: 1 });
  });

  it('spawned task with no result (worker crashed) is skipped, not evaluated', async () => {
    const task = makeTask({ id: '361-012', status: TaskStatus.PENDING });
    const sprint = makeSprint([task]);
    const evaluations = new Map<string, TaskEvaluation>();

    vi.mocked(respawnEligibleTasks).mockResolvedValueOnce(['361-012']);
    vi.mocked(waitForResults).mockResolvedValue([]);

    await runFixPhase(root, sprint, evaluations, [], makeConfig(), undefined, 'v1', undefined);

    expect(evaluations.has('361-012')).toBe(false);
    expect(handleEvaluation).not.toHaveBeenCalled();
    expect(postFixScanEvent()).toMatchObject({ spawned: 1, succeeded: 0, failed: 0 });
  });
});
