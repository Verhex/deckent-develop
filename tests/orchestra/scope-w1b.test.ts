/**
 * SCOPE-W1b — Brain-side SCOPE_INSUFFICIENT Handler Tests (sprint-306, task 306-002)
 *
 * Verifies that when `config.scope_auto_expand_enabled` is true and a task emits
 * WORKER→BRAIN:SCOPE_INSUFFICIENT events, the EVALUATE phase expands the task's
 * scope.filesWrite, persists it to disk (for the FIX task to inherit), annotates
 * result.notes with diff-salvage info, and emits BRAIN→AUDITOR:SCOPE_AUTO_EXPANDED.
 *
 * Also verifies backward-compat: flag-off → no expansion (existing behavior).
 */

// ─── Mocks (must be hoisted before any imports) ──────────────────────────────

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

vi.mock('../../src/core/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/utils.js')>();
  return { ...actual, debugLog: vi.fn() };
});

vi.mock('../../src/orchestra/result-evaluator.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/result-evaluator.js')>();
  return {
    ...actual,
    evaluateWithRubric: vi.fn(),
    enforceHonestResultGate: vi.fn((r: unknown) => ({ result: r, honest: true })),
    verifyDiskAgainstClaim: vi.fn(() => undefined),
    classifyExitWithoutResult: vi.fn(() => ({ hasExitMarker: false })),
    buildVerifyAndCompleteGuidance: vi.fn(() => ''),
    isStubResult: vi.fn(() => false),
    writeHonestSentinelResult: vi.fn(),
  };
});

vi.mock('../../src/orchestra/result-promoter.js', () => ({
  attemptPartialPromotion: vi.fn(),
}));

vi.mock('../../src/agents/worker-rollback.js', () => ({
  revertFilesToHead: vi.fn(),
  rollbackWorkerScope: vi.fn(),
  snapshotWorkerScope: vi.fn(),
  dropWorkerSnapshot: vi.fn(),
  writeStashRef: vi.fn(),
  readStashRef: vi.fn(() => null),
  clearStashRef: vi.fn(),
  WorkerRollbackError: class WorkerRollbackError extends Error {},
}));

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

vi.mock('../../src/core/plugin-hooks.js', () => ({
  runHooks: vi.fn(),
  runCiRegressionCheck: vi.fn(),
  resolveCiGuardianConfig: vi.fn(() => ({ enabled: false })),
  runPreSprintValidation: vi.fn(),
  parseTscErrorFiles: vi.fn(() => []),
}));

vi.mock('../../src/orchestra/sprint-spawner.js', () => ({
  applyCascadeToSprint: vi.fn(() => ({
    decision: { shouldCascade: false, category: 'RUNTIME' },
    blockedTaskIds: [] as string[],
  })),
  applyUnblockToSprint: vi.fn(() => [] as string[]),
}));

// Event-stream mock: readEvents is controllable per-test; writeEvent + getCurrentSprintId are stubs.
vi.mock('../../src/orchestra/event-stream.js', () => ({
  writeEvent: vi.fn(),
  getCurrentSprintId: vi.fn(() => 'sprint-306'),
  readSequence: vi.fn(() => 0),
  readEvents: vi.fn(() => []),
  SCOPE_INSUFFICIENT_CHANNEL: 'WORKER→BRAIN:SCOPE_INSUFFICIENT',
}));

vi.mock('../../src/core/notify.js', () => ({
  notify: vi.fn(async () => undefined),
}));

vi.mock('../../src/orchestra/sprint-reporter.js', () => ({
  calculateMetrics: vi.fn(),
}));

vi.mock('../../src/cli/helpers/splash.js', () => ({
  showSplash: vi.fn(() => ''),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  TaskEvaluation, TaskStatus, SprintPhase, SprintStatus,
} from '../../src/core/types.js';
import type {
  Task, TaskResult, Sprint, EvaluationResult, ResolvedConfig,
} from '../../src/core/types.js';
import type { DeckentEvent } from '../../src/core/event-stream.js';

import { runEvaluatePhase } from '../../src/orchestra/sprint-phases.js';
import { writeEvent, readEvents } from '../../src/orchestra/event-stream.js';
import { evaluateWithRubric, enforceHonestResultGate } from '../../src/orchestra/result-evaluator.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTempRoot(): string {
  const dir = join(tmpdir(), `scope-w1b-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, '.deckent'), { recursive: true });
  mkdirSync(join(dir, '.tasks'), { recursive: true });
  mkdirSync(join(dir, '.brain'), { recursive: true });
  return dir;
}

function makeTask(id = '306-002', overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    description: 'Scope expand test',
    model: 'sonnet',
    effort: 'high',
    priority: 'NORMAL',
    reason: 'test',
    scope: {
      directories: ['src/orchestra/'],
      filesRead: [],
      filesWrite: ['src/orchestra/sprint-phases.ts'],
    },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'minor' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-306',
    ...overrides,
  };
}

function makeResult(taskId = '306-002', overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: ['src/orchestra/sprint-phases.ts'],
    linesAdded: 20,
    linesRemoved: 0,
    testsPassed: false,
    coverage: 0,
    selfAssessment: 'NO_GO',
    notes: 'scope rejection: src/orchestra/result-collector.ts',
    ...overrides,
  };
}

function makeSprint(tasks: Task[], id = 'sprint-306'): Sprint {
  return {
    id,
    number: 306,
    status: SprintStatus.ACTIVE,
    phase: SprintPhase.EVALUATE,
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
  };
}

function makeNoGoEvalResult(overrides: Partial<EvaluationResult> = {}): EvaluationResult {
  return {
    decision: 'NO_GO',
    totalScore: 30,
    rubricScores: [],
    retryCount: 0,
    ...overrides,
  };
}

/** Build a mock SCOPE_INSUFFICIENT DeckentEvent. */
function makeScopeEvent(taskId: string, attemptedPath: string): DeckentEvent {
  return {
    timestamp: new Date().toISOString(),
    sequence: 1,
    protocol_version: '1.0',
    source: 'worker',
    target: 'brain',
    channel: 'WORKER→BRAIN:SCOPE_INSUFFICIENT',
    payload: {
      taskId,
      attemptedPath,
      reason: `[scope-violation] write_file: path "${attemptedPath}" is outside the assigned task scope.`,
      goCriteria: 'pass',
      currentScope: { filesWrite: ['src/orchestra/sprint-phases.ts'], directories: ['src/orchestra/'] },
    },
  };
}

type ConfigWithSAE = ResolvedConfig & { scope_auto_expand_enabled?: boolean };

function makeConfig(saeEnabled: boolean): ConfigWithSAE {
  return {
    scope_auto_expand_enabled: saeEnabled,
    language: 'en',
    deckent_style: 'sprint',
    activeModeConfig: { max_workers: 2 },
  } as ConfigWithSAE;
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('SCOPE-W1b — brain-side SCOPE_INSUFFICIENT handler in runEvaluatePhase', () => {
  let root: string;

  beforeEach(() => {
    vi.clearAllMocks();
    root = makeTempRoot();
    vi.mocked(enforceHonestResultGate).mockImplementation((r: unknown) => ({
      result: r as TaskResult,
      honest: true,
    }));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('flag-on + SCOPE_INSUFFICIENT event → task.scope.filesWrite expanded', async () => {
    const task = makeTask();
    const result = makeResult();
    const sprint = makeSprint([task]);
    const evaluations = new Map<string, TaskEvaluation>();

    writeFileSync(join(root, '.tasks', `task-${task.id}.result`), JSON.stringify(result), 'utf-8');

    vi.mocked(evaluateWithRubric).mockReturnValue(makeNoGoEvalResult());
    vi.mocked(readEvents).mockReturnValue([
      makeScopeEvent(task.id, 'src/orchestra/result-collector.ts'),
    ]);

    await runEvaluatePhase(root, sprint, [result], evaluations, 90, makeConfig(true));

    // task.scope.filesWrite must include the new path from the SCOPE_INSUFFICIENT event
    expect(task.scope.filesWrite).toContain('src/orchestra/result-collector.ts');
    // Original path must still be present
    expect(task.scope.filesWrite).toContain('src/orchestra/sprint-phases.ts');
  });

  it('flag-on + SCOPE_INSUFFICIENT event → disk task JSON updated with expanded scope', async () => {
    const task = makeTask();
    const result = makeResult();
    const sprint = makeSprint([task]);
    const evaluations = new Map<string, TaskEvaluation>();

    // Write the task JSON to disk so the scope-expand can persist it
    writeFileSync(
      join(root, '.tasks', `task-${task.id}.json`),
      JSON.stringify(task),
      'utf-8',
    );
    writeFileSync(join(root, '.tasks', `task-${task.id}.result`), JSON.stringify(result), 'utf-8');

    vi.mocked(evaluateWithRubric).mockReturnValue(makeNoGoEvalResult());
    vi.mocked(readEvents).mockReturnValue([
      makeScopeEvent(task.id, 'src/orchestra/result-collector.ts'),
    ]);

    await runEvaluatePhase(root, sprint, [result], evaluations, 90, makeConfig(true));

    const persisted = JSON.parse(
      readFileSync(join(root, '.tasks', `task-${task.id}.json`), 'utf-8'),
    ) as Task;
    expect(persisted.scope.filesWrite).toContain('src/orchestra/result-collector.ts');
  });

  it('flag-on + SCOPE_INSUFFICIENT event → emits BRAIN→AUDITOR:SCOPE_AUTO_EXPANDED event', async () => {
    const task = makeTask();
    const result = makeResult();
    const sprint = makeSprint([task]);
    const evaluations = new Map<string, TaskEvaluation>();

    writeFileSync(join(root, '.tasks', `task-${task.id}.result`), JSON.stringify(result), 'utf-8');

    vi.mocked(evaluateWithRubric).mockReturnValue(makeNoGoEvalResult());
    vi.mocked(readEvents).mockReturnValue([
      makeScopeEvent(task.id, 'src/orchestra/result-collector.ts'),
    ]);

    await runEvaluatePhase(root, sprint, [result], evaluations, 90, makeConfig(true));

    const calls = vi.mocked(writeEvent).mock.calls;
    const expandEvent = calls.find(c => c[4] === 'BRAIN→AUDITOR:SCOPE_AUTO_EXPANDED');
    expect(expandEvent).toBeDefined();
    expect(expandEvent![5]).toMatchObject({
      taskId: task.id,
      addedPaths: ['src/orchestra/result-collector.ts'],
    });
  });

  it('flag-on + SCOPE_INSUFFICIENT event → result.notes annotated with diff-salvage', async () => {
    const task = makeTask();
    const result = makeResult('306-002', {
      filesChanged: ['src/orchestra/sprint-phases.ts'],
      notes: 'original notes',
    });
    const sprint = makeSprint([task]);
    const evaluations = new Map<string, TaskEvaluation>();

    writeFileSync(join(root, '.tasks', `task-${task.id}.result`), JSON.stringify(result), 'utf-8');

    vi.mocked(evaluateWithRubric).mockReturnValue(makeNoGoEvalResult());
    vi.mocked(readEvents).mockReturnValue([
      makeScopeEvent(task.id, 'src/orchestra/result-collector.ts'),
    ]);

    // Capture the result passed to handleEvaluation
    const { handleEvaluation } = await import('../../src/orchestra/debt-manager.js');
    let capturedResult: TaskResult | undefined;
    vi.mocked(handleEvaluation).mockImplementation((_root, _task, _ev, r) => {
      capturedResult = r;
    });

    await runEvaluatePhase(root, sprint, [result], evaluations, 90, makeConfig(true));

    expect(capturedResult?.notes).toContain('[scope-expand] prev-changed:');
    expect(capturedResult?.notes).toContain('src/orchestra/sprint-phases.ts');
  });

  it('flag-OFF → scope NOT expanded (backward compat)', async () => {
    const task = makeTask();
    const originalScope = [...task.scope.filesWrite];
    const result = makeResult();
    const sprint = makeSprint([task]);
    const evaluations = new Map<string, TaskEvaluation>();

    writeFileSync(join(root, '.tasks', `task-${task.id}.result`), JSON.stringify(result), 'utf-8');

    vi.mocked(evaluateWithRubric).mockReturnValue(makeNoGoEvalResult());
    vi.mocked(readEvents).mockReturnValue([
      makeScopeEvent(task.id, 'src/orchestra/result-collector.ts'),
    ]);

    await runEvaluatePhase(root, sprint, [result], evaluations, 90, makeConfig(false));

    // scope must not have changed
    expect(task.scope.filesWrite).toEqual(originalScope);

    const calls = vi.mocked(writeEvent).mock.calls;
    expect(calls.find(c => c[4] === 'BRAIN→AUDITOR:SCOPE_AUTO_EXPANDED')).toBeUndefined();
  });

  it('flag-on + no SCOPE_INSUFFICIENT events → scope NOT expanded', async () => {
    const task = makeTask();
    const originalScope = [...task.scope.filesWrite];
    const result = makeResult();
    const sprint = makeSprint([task]);
    const evaluations = new Map<string, TaskEvaluation>();

    writeFileSync(join(root, '.tasks', `task-${task.id}.result`), JSON.stringify(result), 'utf-8');

    vi.mocked(evaluateWithRubric).mockReturnValue(makeNoGoEvalResult());
    vi.mocked(readEvents).mockReturnValue([]); // no events

    await runEvaluatePhase(root, sprint, [result], evaluations, 90, makeConfig(true));

    expect(task.scope.filesWrite).toEqual(originalScope);
    const calls = vi.mocked(writeEvent).mock.calls;
    expect(calls.find(c => c[4] === 'BRAIN→AUDITOR:SCOPE_AUTO_EXPANDED')).toBeUndefined();
  });

  it('flag-on + SCOPE_INSUFFICIENT for different task → scope NOT expanded', async () => {
    const task = makeTask('306-002');
    const originalScope = [...task.scope.filesWrite];
    const result = makeResult('306-002');
    const sprint = makeSprint([task]);
    const evaluations = new Map<string, TaskEvaluation>();

    writeFileSync(join(root, '.tasks', `task-${task.id}.result`), JSON.stringify(result), 'utf-8');

    vi.mocked(evaluateWithRubric).mockReturnValue(makeNoGoEvalResult());
    // Event is for a DIFFERENT task
    vi.mocked(readEvents).mockReturnValue([
      makeScopeEvent('OTHER-TASK', 'src/orchestra/result-collector.ts'),
    ]);

    await runEvaluatePhase(root, sprint, [result], evaluations, 90, makeConfig(true));

    expect(task.scope.filesWrite).toEqual(originalScope);
  });

  it('flag-on + duplicate attemptedPath → deduplicates (no double-add)', async () => {
    const task = makeTask();
    const result = makeResult();
    const sprint = makeSprint([task]);
    const evaluations = new Map<string, TaskEvaluation>();

    writeFileSync(join(root, '.tasks', `task-${task.id}.result`), JSON.stringify(result), 'utf-8');

    vi.mocked(evaluateWithRubric).mockReturnValue(makeNoGoEvalResult());
    // Two events for the same path
    vi.mocked(readEvents).mockReturnValue([
      makeScopeEvent(task.id, 'src/orchestra/result-collector.ts'),
      makeScopeEvent(task.id, 'src/orchestra/result-collector.ts'),
    ]);

    await runEvaluatePhase(root, sprint, [result], evaluations, 90, makeConfig(true));

    const count = task.scope.filesWrite.filter(f => f === 'src/orchestra/result-collector.ts').length;
    expect(count).toBe(1);
  });
});
