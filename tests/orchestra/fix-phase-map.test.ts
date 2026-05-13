/**
 * FIX Phase Map Mutation Tests
 *
 * Validates that runFixPhase() correctly updates the evaluations Map
 * when fix tasks complete with different outcomes (DONE, GO_WITH_TECH_DEBT, NO_GO).
 *
 * Sprint 126 reported debt-126-001-fix: fix task success didn't update original
 * task evaluation in the Map. Sprint 127 applied the fix (lines 510-512 in
 * sprint-phases.ts). These tests verify the fix is correct and prevents regression.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TaskEvaluation, TaskStatus, SprintPhase, SprintStatus,
} from '../../src/core/types.js';
import type { Task, TaskResult, Sprint, ResolvedConfig, EvaluationResult } from '../../src/core/types.js';

// ─── Mocks ──────────────────────────────────────────────────────────

// Mock node:fs — runFixPhase uses existsSync, readdirSync, writeFileSync, readFileSync
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  readdirSync: vi.fn(() => [] as string[]),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => ''),
  // Sprint 139 async I/O migration: sprint-finalizer and other modules use
  // `import { promises as fsPromises } from 'node:fs'`. Bind async impls via
  // `vi.fn(async () => ...)` so vi.clearAllMocks preserves them.
  promises: {
    readFile: vi.fn(async () => ''),
    writeFile: vi.fn(async () => undefined),
    mkdir: vi.fn(async () => undefined),
    appendFile: vi.fn(async () => undefined),
    access: vi.fn(async () => undefined),
    stat: vi.fn(async () => ({ size: 0 })),
  },
}));

// Mock core/utils — readJsonSafe reads fix task JSON files
vi.mock('../../src/core/utils.js', () => ({
  readJsonSafe: vi.fn(() => null),
  parseDebtTable: vi.fn(() => []),
  debugLog: vi.fn(),
}));

// Mock result-evaluator — evaluateWithRubric grades fix results
vi.mock('../../src/orchestra/result-evaluator.js', () => ({
  evaluateWithRubric: vi.fn(),
}));

// Mock sprint-controller — spawnWorkers, waitForResults, etc.
vi.mock('../../src/orchestra/sprint-controller.js', () => ({
  BrainError: class BrainError extends Error {},
  readContext: vi.fn(),
  planSprint: vi.fn(),
  writeSprintState: vi.fn(),
  spawnWorkers: vi.fn(),
  buildSpawnRetryHint: vi.fn(() => ''),
  waitForResults: vi.fn(async () => []),
  finalizeSprint: vi.fn(),
  cleanup: vi.fn(),
}));

// Mock debt-manager
vi.mock('../../src/orchestra/debt-manager.js', () => ({
  handleEvaluation: vi.fn(),
  handleCrossDependencies: vi.fn(),
  escalateDebt: vi.fn(),
  resolveDebt: vi.fn(),
  runDecay: vi.fn(),
}));

// Mock auditor
vi.mock('../../src/monitor/auditor.js', () => ({
  updateDashboard: vi.fn(),
  startScanLoop: vi.fn(),
  writeScanToDashboard: vi.fn(),
  runScanCycle: vi.fn(),
}));

// Mock agent-pool, skill-pool, stack-detector (used in V2 reroute path)
vi.mock('../../src/core/agent-pool.js', () => ({
  AgentPoolManager: vi.fn().mockImplementation(() => ({ loadAgents: () => [] })),
}));
vi.mock('../../src/core/skill-pool.js', () => ({
  SkillPoolManager: vi.fn().mockImplementation(() => ({ loadSkills: () => [] })),
}));
vi.mock('../../src/core/stack-detector.js', () => ({
  detectProjectStack: vi.fn(() => ({})),
}));

// Mock rollback
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

// Mock plugin-hooks
vi.mock('../../src/core/plugin-hooks.js', () => ({
  runHooks: vi.fn(),
  runCiRegressionCheck: vi.fn(),
  resolveCiGuardianConfig: vi.fn(() => ({ enabled: false })),
  runPreSprintValidation: vi.fn(),
  parseTscErrorFiles: vi.fn(() => []),
}));

// Mock sprint-reporter
vi.mock('../../src/orchestra/sprint-reporter.js', () => ({
  calculateMetrics: vi.fn(),
}));

// Mock splash
vi.mock('../../src/cli/helpers/splash.js', () => ({
  showSplash: vi.fn(() => ''),
}));

// Mock constants
// DECKENT_DIR is referenced by event-stream.getCurrentSprintId, which sprint-phases
// imports at module-init; an unmocked export here throws inside the runFixPhase try
// and silently aborts the evaluations.set assignments below — keep this list in
// sync with src/core/constants.ts when adding new transitive deps.
vi.mock('../../src/core/constants.js', () => ({
  BRAIN_DIR: '.brain',
  TASKS_DIR: '.tasks',
  DEBT_FILE: 'DEBT.md',
  DECKENT_VERSION: '0.4.0-test',
  DECKENT_DIR: '.deckent',
}));

// ─── Imports (after mocks) ──────────────────────────────────────────

import { runFixPhase } from '../../src/orchestra/sprint-phases.js';
import { existsSync, readdirSync } from 'node:fs';
import { readJsonSafe } from '../../src/core/utils.js';
import { evaluateWithRubric } from '../../src/orchestra/result-evaluator.js';
import { waitForResults } from '../../src/orchestra/sprint-controller.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '129-001',
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

function makeFixTask(fixForTaskId: string | undefined, overrides: Partial<Task> = {}): Task {
  return makeTask({
    id: `fix-${fixForTaskId ?? 'orphan'}`,
    title: `Fix for ${fixForTaskId ?? 'unknown'}`,
    isPriorityFix: true,
    fixForTaskId,
    status: TaskStatus.PENDING,
    ...overrides,
  });
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
    id: 'sprint-129',
    number: 129,
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

// ─── Tests ──────────────────────────────────────────────────────────

describe('FIX Phase — evaluations Map mutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fix task DONE → original task evaluation updated to DONE in Map', async () => {
    // Arrange
    const originalTask = makeTask({ id: '129-001', status: TaskStatus.DONE });
    const fixTask = makeFixTask('129-001');
    const sprint = makeSprint([originalTask]);
    const evaluations = new Map<string, TaskEvaluation>();
    evaluations.set('129-001', TaskEvaluation.NO_GO); // original was NO_GO

    // Mock: .tasks/ directory contains the fix task JSON
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([`task-${fixTask.id}.json`] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readJsonSafe).mockReturnValue(fixTask);

    // Mock: fix worker returns a successful result
    const fixResult = makeResult(fixTask.id, { testsPassed: true, selfAssessment: 'DONE' });
    vi.mocked(waitForResults).mockResolvedValue([fixResult]);

    // Mock: evaluateWithRubric returns DONE for fix result
    vi.mocked(evaluateWithRubric).mockReturnValue(makeEvalResult('DONE'));

    // Act
    await runFixPhase('/tmp/test-project', sprint, evaluations, [], makeConfig(), undefined, 'v1', undefined);

    // Assert — original task's evaluation should be updated to DONE
    expect(evaluations.get('129-001')).toBe(TaskEvaluation.DONE);
    // Fix task itself should also be in the Map
    expect(evaluations.get(fixTask.id)).toBe(TaskEvaluation.DONE);
  });

  it('fix task GO_WITH_TECH_DEBT → original task evaluation updated to GO_WITH_TECH_DEBT in Map', async () => {
    // Arrange
    const originalTask = makeTask({ id: '129-002' });
    const fixTask = makeFixTask('129-002');
    const sprint = makeSprint([originalTask]);
    const evaluations = new Map<string, TaskEvaluation>();
    evaluations.set('129-002', TaskEvaluation.NO_GO);

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([`task-${fixTask.id}.json`] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readJsonSafe).mockReturnValue(fixTask);

    const fixResult = makeResult(fixTask.id, { testsPassed: true, selfAssessment: 'GO_WITH_TECH_DEBT' });
    vi.mocked(waitForResults).mockResolvedValue([fixResult]);
    vi.mocked(evaluateWithRubric).mockReturnValue(makeEvalResult('GO_WITH_TECH_DEBT'));

    // Act
    await runFixPhase('/tmp/test-project', sprint, evaluations, [], makeConfig(), undefined, 'v1', undefined);

    // Assert — original task evaluation should now be GO_WITH_TECH_DEBT
    expect(evaluations.get('129-002')).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
    expect(evaluations.get(fixTask.id)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('fix task NO_GO → original task evaluation remains unchanged (still NO_GO)', async () => {
    // Arrange
    const originalTask = makeTask({ id: '129-003' });
    const fixTask = makeFixTask('129-003');
    const sprint = makeSprint([originalTask]);
    const evaluations = new Map<string, TaskEvaluation>();
    evaluations.set('129-003', TaskEvaluation.NO_GO);

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([`task-${fixTask.id}.json`] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readJsonSafe).mockReturnValue(fixTask);

    const fixResult = makeResult(fixTask.id, { testsPassed: false, selfAssessment: 'NO_GO' });
    vi.mocked(waitForResults).mockResolvedValue([fixResult]);
    vi.mocked(evaluateWithRubric).mockReturnValue(makeEvalResult('NO_GO'));

    // Act
    await runFixPhase('/tmp/test-project', sprint, evaluations, [], makeConfig(), undefined, 'v1', undefined);

    // Assert — original task evaluation must NOT change (line 511: fixEval !== NO_GO guard)
    expect(evaluations.get('129-003')).toBe(TaskEvaluation.NO_GO);
    // Fix task's own evaluation is recorded as NO_GO
    expect(evaluations.get(fixTask.id)).toBe(TaskEvaluation.NO_GO);
  });

  it('fixForTaskId undefined → Map does not crash, graceful handle', async () => {
    // Arrange — fix task with no fixForTaskId (orphan fix)
    const fixTask = makeFixTask(undefined);
    const sprint = makeSprint([]);
    const evaluations = new Map<string, TaskEvaluation>();

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([`task-${fixTask.id}.json`] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readJsonSafe).mockReturnValue(fixTask);

    const fixResult = makeResult(fixTask.id, { testsPassed: true, selfAssessment: 'DONE' });
    vi.mocked(waitForResults).mockResolvedValue([fixResult]);
    vi.mocked(evaluateWithRubric).mockReturnValue(makeEvalResult('DONE'));

    // Act — should not throw even though fixForTaskId is undefined
    await expect(
      runFixPhase('/tmp/test-project', sprint, evaluations, [], makeConfig(), undefined, 'v1', undefined),
    ).resolves.not.toThrow();

    // Assert — fix task itself should be recorded, no phantom original entry
    expect(evaluations.get(fixTask.id)).toBe(TaskEvaluation.DONE);
    // Map should only contain the fix task entry, not an undefined key
    expect(evaluations.size).toBe(1);
    expect(evaluations.has(undefined as unknown as string)).toBe(false);
  });

  it('evaluations Map starts empty, fix task populates correct key-value pairs', async () => {
    // Arrange — empty evaluations Map, original task not pre-registered
    const fixTask = makeFixTask('129-005');
    const sprint = makeSprint([]);
    const evaluations = new Map<string, TaskEvaluation>();
    // Note: original task '129-005' is NOT in the Map (empty start)

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([`task-${fixTask.id}.json`] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readJsonSafe).mockReturnValue(fixTask);

    const fixResult = makeResult(fixTask.id, { testsPassed: true, selfAssessment: 'DONE' });
    vi.mocked(waitForResults).mockResolvedValue([fixResult]);
    vi.mocked(evaluateWithRubric).mockReturnValue(makeEvalResult('DONE'));

    // Act
    await runFixPhase('/tmp/test-project', sprint, evaluations, [], makeConfig(), undefined, 'v1', undefined);

    // Assert — fix task itself is recorded
    expect(evaluations.get(fixTask.id)).toBe(TaskEvaluation.DONE);
    // Original task is NOT updated because evaluations.has('129-005') was false
    // (line 511 guard: evaluations.has(fixTask.fixForTaskId))
    expect(evaluations.has('129-005')).toBe(false);
    // Map should contain exactly 1 entry (the fix task only)
    expect(evaluations.size).toBe(1);
  });
});
