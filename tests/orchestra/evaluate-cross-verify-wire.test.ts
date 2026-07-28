/**
 * XVER-SPRINT-WIRE (MASTER-PLAN 659) — the EVALUATE-phase side of cross-verify.
 *
 * `cross_verify.enabled` alone never dispatched anything from a sprint: the call
 * site passed no verifier eligibility evidence, so `runCrossVerify` fail-closed on
 * `verifier-eligibility-evidence-missing`. These tests pin the wiring:
 *
 *   • the owner's `verifier_priority` reaches the runner as the explicit verifier
 *     selection (`availableProviders`) — the sprint counterpart of CLI `--verifier`;
 *   • an unauthored `verifier_priority` passes NOTHING, preserving fail-closed;
 *   • `max_verifications_per_sprint` bounds one sprint's billed dispatches (canary=1).
 *
 * Harness mirrors evaluate-trigger-gate.test.ts (real tmp root, heavy
 * collaborators mocked).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { TaskEvaluation, TaskStatus, SprintPhase, SprintStatus } from '../../src/core/types.js';
import type {
  Task, TaskResult, Sprint, EvaluationResult, ResolvedConfig,
} from '../../src/core/types.js';

vi.mock('../../src/core/utils.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/core/utils.js')>()),
  debugLog: vi.fn(),
}));

vi.mock('../../src/orchestra/result-evaluator.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/orchestra/result-evaluator.js')>()),
  evaluateWithRubric: vi.fn(),
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
  getCurrentSprintId: vi.fn(() => 'sprint-659'),
  readSequence: vi.fn(() => 0),
}));

vi.mock('../../src/core/notify.js', () => ({ notify: vi.fn(async () => undefined) }));
vi.mock('../../src/orchestra/sprint-reporter.js', () => ({ calculateMetrics: vi.fn() }));
vi.mock('../../src/cli/helpers/splash.js', () => ({ showSplash: vi.fn(() => '') }));

vi.mock('../../src/orchestra/cross-verify-runner.js', () => ({
  runCrossVerify: vi.fn(async () => ({
    outcome: 'confirmed', ran: true, refuted: false, blocked: false,
    advisory: { verifier: 'codex', verifierModel: 'gpt-5.6-sol', verdict: 'confirmed', reason: 'ok' },
  })),
}));

import { runEvaluatePhase } from '../../src/orchestra/sprint-phases.js';
import { runCrossVerify } from '../../src/orchestra/cross-verify-runner.js';
import { evaluateWithRubric } from '../../src/orchestra/result-evaluator.js';

const mockRunCrossVerify = vi.mocked(runCrossVerify);

function makeTempRoot(): string {
  const dir = join(tmpdir(), `evaluate-xverify-wire-${process.pid}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(dir, '.tasks'), { recursive: true });
  mkdirSync(join(dir, '.deckent'), { recursive: true });
  return dir;
}

/** High-stakes by construction so the runner's own gate is not what filters here. */
function makeTask(id: string): Task {
  return {
    id,
    title: `Harden auth for ${id}`,
    description: 'JWT signature validation on the login endpoint',
    model: 'claude-sonnet-5',
    effort: 'normal',
    priority: 'CRITICAL',
    reason: 'security',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [`src/${id}.ts`] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'none' },
    status: TaskStatus.DONE,
    sprintId: 'sprint-659',
    provider: 'claude',
  };
}

function makeResult(taskId: string): TaskResult {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: [`src/${taskId}.ts`],
    linesAdded: 10,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 90,
    selfAssessment: 'DONE',
    notes: 'OK',
  };
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-659',
    number: 659,
    status: SprintStatus.ACTIVE,
    phase: SprintPhase.EXECUTE,
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
  };
}

function makeConfig(crossVerify: Record<string, unknown>): ResolvedConfig {
  return { cross_verify: crossVerify } as unknown as ResolvedConfig;
}

const DONE_EVAL: EvaluationResult = {
  decision: 'DONE', totalScore: 90, rubricScores: [], retryCount: 1,
};

describe('runEvaluatePhase — cross-verify sprint wiring (XVER-SPRINT-WIRE)', () => {
  let root: string;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(evaluateWithRubric).mockReturnValue(DONE_EVAL);
    root = makeTempRoot();
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('carries the owner-authored verifier selection into the runner', async () => {
    const sprint = makeSprint([makeTask('659-001')]);
    await runEvaluatePhase(
      root, sprint, [makeResult('659-001')], new Map<string, TaskEvaluation>(),
      undefined,
      makeConfig({ enabled: true, high_stakes_only: true, verifier_priority: ['codex', 'claude'] }),
    );
    expect(mockRunCrossVerify).toHaveBeenCalledOnce();
    expect(mockRunCrossVerify.mock.calls[0]?.[5]).toMatchObject({
      availableProviders: ['codex', 'claude'],
    });
  });

  it('passes no selection when the owner authored none, preserving the fail-closed skip', async () => {
    const sprint = makeSprint([makeTask('659-002')]);
    await runEvaluatePhase(
      root, sprint, [makeResult('659-002')], new Map<string, TaskEvaluation>(),
      undefined,
      makeConfig({ enabled: true, high_stakes_only: true }),
    );
    expect(mockRunCrossVerify).toHaveBeenCalledOnce();
    expect(mockRunCrossVerify.mock.calls[0]?.[5]).not.toHaveProperty('availableProviders');
  });

  it('drops an unknown provider name instead of forwarding it as a selection', async () => {
    const sprint = makeSprint([makeTask('659-003')]);
    await runEvaluatePhase(
      root, sprint, [makeResult('659-003')], new Map<string, TaskEvaluation>(),
      undefined,
      makeConfig({ enabled: true, high_stakes_only: true, verifier_priority: ['codex', 'not-a-provider'] }),
    );
    expect(mockRunCrossVerify.mock.calls[0]?.[5]).toMatchObject({ availableProviders: ['codex'] });
  });

  it('stops billed dispatches at the owner canary ceiling', async () => {
    const sprint = makeSprint([makeTask('659-004'), makeTask('659-005'), makeTask('659-006')]);
    await runEvaluatePhase(
      root, sprint,
      [makeResult('659-004'), makeResult('659-005'), makeResult('659-006')],
      new Map<string, TaskEvaluation>(),
      undefined,
      makeConfig({
        enabled: true,
        high_stakes_only: true,
        verifier_priority: ['codex'],
        max_verifications_per_sprint: 1,
      }),
    );
    expect(mockRunCrossVerify).toHaveBeenCalledOnce();
  });

  it('verifies every eligible task when the owner set no ceiling', async () => {
    const sprint = makeSprint([makeTask('659-007'), makeTask('659-008')]);
    await runEvaluatePhase(
      root, sprint, [makeResult('659-007'), makeResult('659-008')],
      new Map<string, TaskEvaluation>(),
      undefined,
      makeConfig({ enabled: true, high_stakes_only: true, verifier_priority: ['codex'] }),
    );
    expect(mockRunCrossVerify).toHaveBeenCalledTimes(2);
  });

  it('fails closed when a mandatory verification cannot dispatch because the ceiling is reached', async () => {
    const sprint = makeSprint([makeTask('659-009')]);
    const evaluations = new Map<string, TaskEvaluation>();
    const result = makeResult('659-009');

    await runEvaluatePhase(
      root, sprint, [result], evaluations,
      undefined,
      makeConfig({
        enabled: true,
        enforce_refuted: true,
        high_stakes_only: true,
        verifier_priority: ['codex'],
        max_verifications_per_sprint: 0,
      }),
    );

    expect(mockRunCrossVerify).not.toHaveBeenCalled();
    expect(evaluations.get('659-009')).toBe(TaskEvaluation.NO_GO);
    expect(result.notes).toContain('xverify_mandatory_sprint_ceiling_reached');
  });

  it('fails closed when the mandatory runner faults unexpectedly', async () => {
    mockRunCrossVerify.mockRejectedValueOnce(new Error('broker unavailable'));
    const sprint = makeSprint([makeTask('659-010')]);
    const evaluations = new Map<string, TaskEvaluation>();
    const result = makeResult('659-010');

    await runEvaluatePhase(
      root, sprint, [result], evaluations,
      undefined,
      makeConfig({
        enabled: true,
        enforce_refuted: true,
        high_stakes_only: true,
        verifier_priority: ['codex'],
      }),
    );

    expect(evaluations.get('659-010')).toBe(TaskEvaluation.NO_GO);
    expect(result.notes).toContain('xverify_runtime_fault:broker unavailable');
  });
});
