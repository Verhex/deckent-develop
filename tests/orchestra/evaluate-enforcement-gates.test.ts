/**
 * EVALUATE-phase enforcement gates — DECKENT-TRIAGE A14 + A9 (Sprint 343, task 343-001)
 *
 * Two flag-gated, default-off gates wired into runEvaluatePhase's per-task loop:
 *   (A14) gate.verify_delta_downgrade — a DONE whose task-start verify-delta
 *         baseline shows a short files-changed delta is downgraded via the REAL
 *         applyTechDebtDowngrade (DONE → GO_WITH_TECH_DEBT, severe < 0.5 → NO_GO).
 *   (A9)  gate.enforce_adr_compliance — the worker's changed files are scanned by
 *         the REAL enforceAdrCompliance; a failing verdict downgrades to NO_GO.
 *         The enforcer fails OPEN (an internal error / throw must NOT block tasks).
 *
 * Hermetic: all file I/O in tmpdir, no gitignored state, no spawnSync. The
 * verify-delta baseline is seeded with the REAL writeVerifyDeltaBaseline and the
 * ADR violation is a REAL seeded file — computeVerifyDelta / applyTechDebtDowngrade
 * / enforceAdrCompliance all run their real implementations.
 *
 * Mock scaffold mirrors promote-w1b.test.ts (the proven runEvaluatePhase harness).
 */

// ─── Mocks (hoisted before any imports) ──────────────────────────────────────

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

vi.mock('../../src/core/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/utils.js')>();
  return { ...actual, debugLog: vi.fn() };
});

// result-evaluator: stub only the rubric + honest-gate seams. applyTechDebtDowngrade
// and reconcileEvaluationSpuriousNoGo stay REAL (via ...actual) — A14 needs the real
// downgrade math.
vi.mock('../../src/orchestra/result-evaluator.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/result-evaluator.js')>();
  return {
    ...actual,
    evaluateWithRubric: vi.fn(),
    enforceHonestResultGate: vi.fn((r: unknown) => ({ result: r, honest: true })),
    classifyExitWithoutResult: vi.fn(() => ({ hasExitMarker: false })),
    buildVerifyAndCompleteGuidance: vi.fn(() => ''),
    writeHonestSentinelResult: vi.fn(),
  };
});

// authority-enforcer: spy that delegates to the REAL enforceAdrCompliance by default
// (so the violation case truly exercises checkAdr006), overridable per-test for the
// fail-open scenarios.
vi.mock('../../src/orchestra/authority-enforcer.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/authority-enforcer.js')>();
  return { ...actual, enforceAdrCompliance: vi.fn(actual.enforceAdrCompliance) };
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
  spawnWorkers: vi.fn(),
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

vi.mock('../../src/orchestra/event-stream.js', () => ({
  writeEvent: vi.fn(),
  getCurrentSprintId: vi.fn(() => 'sprint-343'),
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
  showSplashIfEnabled: vi.fn(() => ''),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { TaskEvaluation, TaskStatus, SprintPhase, SprintStatus } from '../../src/core/types.js';
import type { Task, TaskResult, Sprint, EvaluationResult, ResolvedConfig, GateConfig, DeckentConfig } from '../../src/core/types.js';

import { runEvaluatePhase } from '../../src/orchestra/sprint-phases.js';
import { handleEvaluation } from '../../src/orchestra/debt-manager.js';
import { evaluateWithRubric, enforceHonestResultGate } from '../../src/orchestra/result-evaluator.js';
import { enforceAdrCompliance } from '../../src/orchestra/authority-enforcer.js';
import { writeVerifyDeltaBaseline } from '../../src/agents/worker-lifecycle.js';
import { validateConfig, ConfigValidationError, createDefaultConfig } from '../../src/core/config.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTempRoot(): string {
  const dir = join(tmpdir(), `eval-gates-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(dir, '.deckent'), { recursive: true });
  mkdirSync(join(dir, '.tasks'), { recursive: true });
  mkdirSync(join(dir, '.brain'), { recursive: true });
  return dir;
}

function makeTask(id: string, filesWrite: string[]): Task {
  return {
    id,
    title: `Task ${id}`,
    description: 'enforcement-gate test',
    model: 'opus',
    effort: 'high',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/orchestra/'], filesRead: [], filesWrite },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'minor' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-343',
  };
}

function makeResult(taskId: string, overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: ['src/orchestra/a.ts', 'src/orchestra/b.ts'],
    linesAdded: 20,
    linesRemoved: 2,
    testsPassed: true,
    coverage: 90,
    selfAssessment: 'DONE',
    notes: '',
    ...overrides,
  };
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-343',
    number: 343,
    status: SprintStatus.ACTIVE,
    phase: SprintPhase.EVALUATE,
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
  };
}

function doneEval(overrides: Partial<EvaluationResult> = {}): EvaluationResult {
  return { decision: 'DONE', totalScore: 95, rubricScores: [], retryCount: 0, ...overrides };
}

function makeConfig(gate?: GateConfig): ResolvedConfig {
  return {
    gate,
    language: 'en',
    deckent_style: 'sprint',
    activeModeConfig: { max_workers: 2 },
  } as unknown as ResolvedConfig;
}

/** Build a valid default config with a gate override (for validateConfig tests). */
function cfgWithGate(gate: Record<string, unknown>): DeckentConfig {
  return { ...createDefaultConfig(), gate } as unknown as DeckentConfig;
}

async function runOneTask(
  root: string,
  task: Task,
  result: TaskResult,
  config: ResolvedConfig,
): Promise<TaskEvaluation | undefined> {
  const sprint = makeSprint([task]);
  const evaluations = new Map<string, TaskEvaluation>();
  writeFileSync(join(root, '.tasks', `task-${task.id}.result`), JSON.stringify(result), 'utf-8');
  await runEvaluatePhase(root, sprint, [result], evaluations, 90, config);
  return evaluations.get(task.id);
}

// ══════════════════════════════════════════════════════════════════════════════

describe('EVALUATE enforcement gates — config validation', () => {
  it('accepts valid boolean flags (no throw)', () => {
    expect(() =>
      validateConfig(cfgWithGate({ verify_delta_downgrade: true, enforce_adr_compliance: false })),
    ).not.toThrow();
  });

  it('rejects a non-boolean verify_delta_downgrade', () => {
    expect(() => validateConfig(cfgWithGate({ verify_delta_downgrade: 'yes' }))).toThrow(
      ConfigValidationError,
    );
    try {
      validateConfig(cfgWithGate({ verify_delta_downgrade: 'yes' }));
    } catch (e) {
      expect((e as ConfigValidationError).errors.some(m => m.includes('gate.verify_delta_downgrade'))).toBe(true);
    }
  });

  it('rejects a non-boolean enforce_adr_compliance', () => {
    expect(() => validateConfig(cfgWithGate({ enforce_adr_compliance: 1 }))).toThrow(
      ConfigValidationError,
    );
    try {
      validateConfig(cfgWithGate({ enforce_adr_compliance: 1 }));
    } catch (e) {
      expect((e as ConfigValidationError).errors.some(m => m.includes('gate.enforce_adr_compliance'))).toBe(true);
    }
  });

  it('absent flags leave the existing max_tech_debt_ratio validation intact', () => {
    // sanity: a valid default config (no gate block) still validates clean
    expect(() => validateConfig(createDefaultConfig())).not.toThrow();
  });
});

// ══════════════════════════════════════════════════════════════════════════════

describe('A14 — verify-delta downgrade gate', () => {
  let root: string;

  beforeEach(() => {
    vi.clearAllMocks();
    root = makeTempRoot();
    vi.mocked(enforceHonestResultGate).mockImplementation((r: unknown) => ({ result: r as TaskResult, honest: true }));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('flag-on + DONE + short verify-delta (ratio 0.7) → downgraded DONE→GO_WITH_TECH_DEBT', async () => {
    const task = makeTask('343-a14-1', ['src/orchestra/a.ts', 'src/orchestra/b.ts', 'src/orchestra/c.ts', 'src/orchestra/d.ts']);
    const result = makeResult('343-a14-1', { testsPassed: true }); // filesChanged=2, expected=4 → filesRatio 0.5 → ratio 0.7
    // Worker's task-start baseline: 0 files changed, 0 failing tests.
    writeVerifyDeltaBaseline(root, task.id, 0, 0);
    vi.mocked(evaluateWithRubric).mockReturnValue(doneEval());

    const outcome = await runOneTask(root, task, result, makeConfig({ verify_delta_downgrade: true }));

    expect(outcome).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
    expect(vi.mocked(handleEvaluation)).toHaveBeenCalledWith(
      root, task, TaskEvaluation.GO_WITH_TECH_DEBT, expect.anything(),
    );
  });

  it('flag-on + DONE + severe verify-delta (ratio 0.3) → downgraded DONE→NO_GO', async () => {
    const task = makeTask('343-a14-sev', ['src/orchestra/a.ts', 'src/orchestra/b.ts', 'src/orchestra/c.ts', 'src/orchestra/d.ts']);
    const result = makeResult('343-a14-sev', { testsPassed: false }); // filesRatio 0.5, testRatio 0 → ratio 0.3 < 0.5
    writeVerifyDeltaBaseline(root, task.id, 0, 0);
    vi.mocked(evaluateWithRubric).mockReturnValue(doneEval());

    const outcome = await runOneTask(root, task, result, makeConfig({ verify_delta_downgrade: true }));

    expect(outcome).toBe(TaskEvaluation.NO_GO);
  });

  it('flag-OFF → DONE unchanged (byte-identical), even with a short baseline on disk', async () => {
    const task = makeTask('343-a14-off', ['src/orchestra/a.ts', 'src/orchestra/b.ts', 'src/orchestra/c.ts', 'src/orchestra/d.ts']);
    const result = makeResult('343-a14-off', { testsPassed: true });
    writeVerifyDeltaBaseline(root, task.id, 0, 0);
    vi.mocked(evaluateWithRubric).mockReturnValue(doneEval());

    const outcome = await runOneTask(root, task, result, makeConfig(/* no gate */));

    expect(outcome).toBe(TaskEvaluation.DONE);
  });

  it('flag-on but NO baseline on disk → DONE unchanged (computeVerifyDelta returns null)', async () => {
    const task = makeTask('343-a14-nobase', ['src/orchestra/a.ts', 'src/orchestra/b.ts', 'src/orchestra/c.ts', 'src/orchestra/d.ts']);
    const result = makeResult('343-a14-nobase', { testsPassed: true });
    // intentionally do NOT seed a verify-delta baseline
    vi.mocked(evaluateWithRubric).mockReturnValue(doneEval());

    const outcome = await runOneTask(root, task, result, makeConfig({ verify_delta_downgrade: true }));

    expect(outcome).toBe(TaskEvaluation.DONE);
  });
});

// ══════════════════════════════════════════════════════════════════════════════

describe('A9 — ADR-compliance enforcement gate', () => {
  let root: string;
  // Captured once: the REAL enforceAdrCompliance (the module is mocked, so the
  // gate sees the spy — we reset it to the real impl before each test so the
  // violation/clean cases truly exercise checkAdr006).
  let realEnforce: typeof enforceAdrCompliance;

  beforeEach(async () => {
    vi.clearAllMocks();
    root = makeTempRoot();
    vi.mocked(enforceHonestResultGate).mockImplementation((r: unknown) => ({ result: r as TaskResult, honest: true }));
    if (!realEnforce) {
      realEnforce = (
        await vi.importActual<typeof import('../../src/orchestra/authority-enforcer.js')>(
          '../../src/orchestra/authority-enforcer.js',
        )
      ).enforceAdrCompliance;
    }
    vi.mocked(enforceAdrCompliance).mockImplementation(realEnforce);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function seedViolatingFile(root: string): string {
    const rel = 'src/orchestra/violator.ts';
    mkdirSync(join(root, 'src', 'orchestra'), { recursive: true });
    // ADR-006: `shell: true` is forbidden in spawnSync/execSync options.
    writeFileSync(
      join(root, rel),
      'export function run() {\n  return spawnSync("echo", ["hi"], { shell: true });\n}\n',
      'utf-8',
    );
    return rel;
  }

  it('flag-on + real ADR-006 violation in a changed file → downgraded to NO_GO', async () => {
    const rel = seedViolatingFile(root);
    const task = makeTask('343-a9-1', ['src/orchestra/violator.ts']);
    const result = makeResult('343-a9-1', { filesChanged: [rel] });
    vi.mocked(evaluateWithRubric).mockReturnValue(doneEval());

    const outcome = await runOneTask(root, task, result, makeConfig({ enforce_adr_compliance: true }));

    expect(outcome).toBe(TaskEvaluation.NO_GO);
    expect(vi.mocked(enforceAdrCompliance)).toHaveBeenCalledWith(
      root, expect.any(String), task.id, [rel],
    );
  });

  it('flag-OFF → DONE unchanged, enforceAdrCompliance never called (byte-identical)', async () => {
    const rel = seedViolatingFile(root);
    const task = makeTask('343-a9-off', ['src/orchestra/violator.ts']);
    const result = makeResult('343-a9-off', { filesChanged: [rel] });
    vi.mocked(evaluateWithRubric).mockReturnValue(doneEval());

    const outcome = await runOneTask(root, task, result, makeConfig(/* no gate */));

    expect(outcome).toBe(TaskEvaluation.DONE);
    expect(vi.mocked(enforceAdrCompliance)).not.toHaveBeenCalled();
  });

  it('flag-on + clean files (no violation) → DONE unchanged', async () => {
    mkdirSync(join(root, 'src', 'orchestra'), { recursive: true });
    writeFileSync(join(root, 'src/orchestra/clean.ts'), 'export const x = 1;\n', 'utf-8');
    const task = makeTask('343-a9-clean', ['src/orchestra/clean.ts']);
    const result = makeResult('343-a9-clean', { filesChanged: ['src/orchestra/clean.ts'] });
    vi.mocked(evaluateWithRubric).mockReturnValue(doneEval());

    const outcome = await runOneTask(root, task, result, makeConfig({ enforce_adr_compliance: true }));

    expect(outcome).toBe(TaskEvaluation.DONE);
  });

  it('flag-on + enforcer fail-open (returns pass:true with enforcerError) → no block, DONE preserved', async () => {
    vi.mocked(enforceAdrCompliance).mockReturnValue({ pass: true, violations: [], enforcerError: 'simulated internal error' });
    const task = makeTask('343-a9-failopen', ['src/orchestra/x.ts']);
    const result = makeResult('343-a9-failopen', { filesChanged: ['src/orchestra/x.ts'] });
    vi.mocked(evaluateWithRubric).mockReturnValue(doneEval());

    const outcome = await runOneTask(root, task, result, makeConfig({ enforce_adr_compliance: true }));

    expect(outcome).toBe(TaskEvaluation.DONE);
  });

  it('flag-on + enforcer THROWS → wiring fail-open keeps DONE (an enforcer bug must not block tasks)', async () => {
    vi.mocked(enforceAdrCompliance).mockImplementation(() => {
      throw new Error('enforcer crashed');
    });
    const task = makeTask('343-a9-throw', ['src/orchestra/x.ts']);
    const result = makeResult('343-a9-throw', { filesChanged: ['src/orchestra/x.ts'] });
    vi.mocked(evaluateWithRubric).mockReturnValue(doneEval());

    const outcome = await runOneTask(root, task, result, makeConfig({ enforce_adr_compliance: true }));

    expect(outcome).toBe(TaskEvaluation.DONE);
  });
});
