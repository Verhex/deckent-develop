// ─── POSTFIX-PENDING-SCAN Tests (Sprint 361 Task 361-004 — born-475) ─────
//
// Sprint 360 live lesson: tasks 003/008 whose parent tasks were already DONE
// were never spawned — a stall window swallowed the per-completion
// respawnEligibleTasks call, leaving a PENDING+dependency-eligible task with
// zero dispatch attempts. This suite covers the safety-net block wired at the
// very end of `runFixPhase` (src/orchestra/sprint-phases.ts): after the
// existing NO_GO/NOT_DISPATCHED fix machinery runs, ONE single pass reuses
// respawnEligibleTasks (the same wave mechanism spawnWorkers/EVALUATE use
// elsewhere) to catch anything still PENDING+eligible, spawns it, and waits
// for its result via the same waitForResults seam the fix pipeline uses.
//
// respawnEligibleTasks itself is mocked here (its own dependency-graph
// internals are already covered by tests/orchestra/sprint-spawner.test.ts and
// the dependency-pipeline-*.test.ts suites) — this suite isolates the NEW
// wiring: is it called, are its spawned tasks waited-on and evaluated, and
// does the whole thing stay a no-op when nothing is eligible.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TaskEvaluation, TaskStatus, SprintPhase, SprintStatus,
} from '../../src/core/types.js';
import type { Task, TaskResult, Sprint, ResolvedConfig, EvaluationResult } from '../../src/core/types.js';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  readdirSync: vi.fn(() => [] as string[]),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => ''),
  promises: {
    readFile: vi.fn(async () => ''),
    writeFile: vi.fn(async () => undefined),
    mkdir: vi.fn(async () => undefined),
    appendFile: vi.fn(async () => undefined),
    access: vi.fn(async () => undefined),
    stat: vi.fn(async () => ({ size: 0 })),
  },
}));

vi.mock('../../src/core/utils.js', () => ({
  readJsonSafe: vi.fn(() => null),
  parseDebtTable: vi.fn(() => []),
  debugLog: vi.fn(),
}));

vi.mock('../../src/orchestra/result-evaluator.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/result-evaluator.js')>();
  return {
    ...actual,
    evaluateWithRubric: vi.fn(),
    reconcileEvaluationSpuriousNoGo: vi.fn((evaluation) => evaluation),
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
// elsewhere in runFixPhase) and mock ONLY the new respawnEligibleTasks seam
// this task wires up — isolates the postfix-scan wiring under test.
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
}));

vi.mock('../../src/core/constants.js', () => ({
  RUNTIME_DIR: '.deckent/runtime',  // sprint-429 (429-011) tool-inventory yolu modül-yüklemede okur
  BRAIN_DIR: '.brain',
  TASKS_DIR: '.tasks',
  DEBT_FILE: 'DEBT.md',
  DECKENT_VERSION: '0.4.0-test',
  DECKENT_DIR: '.deckent',
  // born-630 (406-002): permission-store→approval-allowscope zinciri artık
  // SETTINGS_DIR'i modül-yüklemede okuyor — factory-mock'a eksik export eklendi.
  SETTINGS_DIR: '.deckent/settings',
  SPRINT_STATE_FILE: '.deckent/sprint-state.json',
  SPRINT_ACTIVE_FILE: '.deckent/sprint-active.json',
}));

vi.mock('../../src/orchestra/event-stream.js', () => ({
  writeEvent: vi.fn(),
  getCurrentSprintId: vi.fn(() => 'sprint-361'),
  readEvents: vi.fn(() => []),
  SCOPE_INSUFFICIENT_CHANNEL: 'WORKER→BRAIN:SCOPE_INSUFFICIENT',
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────

import { runFixPhase } from '../../src/orchestra/sprint-phases.js';
import { waitForResults } from '../../src/orchestra/sprint-controller.js';
import { respawnEligibleTasks } from '../../src/orchestra/sprint-spawner.js';
import { evaluateWithRubric } from '../../src/orchestra/result-evaluator.js';
import { handleEvaluation } from '../../src/orchestra/debt-manager.js';
import { writeEvent } from '../../src/orchestra/event-stream.js';

// ─── Helpers ───────────────────────────────────────────────────────────────

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
    projectRoot: '/tmp/test-project',
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
  });

  it('parent DONE + child PENDING: post-FIX single pass dispatches the never-spawned child', async () => {
    const parent = makeTask({ id: '361-003', status: TaskStatus.DONE });
    const child = makeTask({ id: '361-008', status: TaskStatus.PENDING, dependencies: ['361-003'] });
    const sprint = makeSprint([parent, child]);
    const evaluations = new Map<string, TaskEvaluation>();

    vi.mocked(respawnEligibleTasks).mockResolvedValue(['361-008']);
    vi.mocked(waitForResults).mockResolvedValue([makeResult('361-008')]);
    vi.mocked(evaluateWithRubric).mockReturnValue(makeEvalResult('DONE'));

    await runFixPhase('/tmp/test-project', sprint, evaluations, [], makeConfig(), undefined, 'v1', undefined);

    expect(respawnEligibleTasks).toHaveBeenCalledTimes(1);
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

    vi.mocked(respawnEligibleTasks).mockResolvedValue([]);

    await runFixPhase('/tmp/test-project', sprint, evaluations, [], makeConfig(), undefined, 'v1', undefined);

    expect(respawnEligibleTasks).toHaveBeenCalledTimes(1);
    expect(waitForResults).not.toHaveBeenCalled();
    expect(postFixScanEvent()).toBeUndefined();
    expect(evaluations.size).toBe(0);
  });

  it('a NEW failure from the post-FIX pass is a single-pass NO_GO — no immediate second respawn attempt', async () => {
    const parent = makeTask({ id: '361-010', status: TaskStatus.DONE });
    const child = makeTask({ id: '361-011', status: TaskStatus.PENDING, dependencies: ['361-010'] });
    const sprint = makeSprint([parent, child]);
    const evaluations = new Map<string, TaskEvaluation>();

    vi.mocked(respawnEligibleTasks).mockResolvedValue(['361-011']);
    vi.mocked(waitForResults).mockResolvedValue([makeResult('361-011', {
      testsPassed: false,
      selfAssessment: 'NO_GO',
      notes: 'build failed',
    })]);
    vi.mocked(evaluateWithRubric).mockReturnValue(makeEvalResult('NO_GO'));

    await runFixPhase('/tmp/test-project', sprint, evaluations, [], makeConfig(), undefined, 'v1', undefined);

    // Exactly one respawn/wait round within this single runFixPhase call —
    // the single-pass guard means a new failure does NOT trigger another
    // immediate respawnEligibleTasks/waitForResults invocation here.
    expect(respawnEligibleTasks).toHaveBeenCalledTimes(1);
    expect(waitForResults).toHaveBeenCalledTimes(1);

    expect(evaluations.get('361-011')).toBe(TaskEvaluation.NO_GO);
    // Standard NO_GO path — same handleEvaluation used everywhere else,
    // which is what creates the normal "-fix" task for a LATER sprint.
    expect(handleEvaluation).toHaveBeenCalledWith(
      '/tmp/test-project', child, TaskEvaluation.NO_GO, expect.objectContaining({ taskId: '361-011' }),
    );
    expect(postFixScanEvent()).toMatchObject({ spawned: 1, succeeded: 0, failed: 1 });
  });

  it('spawned task with no result (worker crashed) is skipped, not evaluated', async () => {
    const task = makeTask({ id: '361-012', status: TaskStatus.PENDING });
    const sprint = makeSprint([task]);
    const evaluations = new Map<string, TaskEvaluation>();

    vi.mocked(respawnEligibleTasks).mockResolvedValue(['361-012']);
    vi.mocked(waitForResults).mockResolvedValue([]);

    await runFixPhase('/tmp/test-project', sprint, evaluations, [], makeConfig(), undefined, 'v1', undefined);

    expect(evaluations.has('361-012')).toBe(false);
    expect(handleEvaluation).not.toHaveBeenCalled();
    expect(postFixScanEvent()).toMatchObject({ spawned: 1, succeeded: 0, failed: 0 });
  });
});
