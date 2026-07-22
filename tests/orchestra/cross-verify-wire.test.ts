// tests/orchestra/cross-verify-wire.test.ts
//
// Hermetic tests for the XVER-1 cross-verify dispatch runner (Sprint 276 Task 276-007).
//
// All tests inject `spawnVerifier`, so NO real worker/provider is ever spawned and the
// provider registry is never consulted. File I/O happens entirely under os.tmpdir().
// No gitignored state read; no spawnSync; passes on a fresh checkout (CI-hermetic).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  runCrossVerify,
  type SpawnVerifierInput,
  type SpawnVerifierFn,
} from '../../src/orchestra/cross-verify-runner.js';
import { TaskEvaluation, TaskStatus } from '../../src/core/types.js';
import type { Task, TaskResult, ResolvedConfig, ProviderName, CrossVerifyConfig } from '../../src/core/types.js';
import { TASKS_DIR } from '../../src/core/constants.js';
import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlement,
  createTaskResultSettlementRef,
  writeTaskResultSettlementAtomic,
  writeTaskResultSettlementAttemptAtomic,
  writeTaskResultSettlementClosureAtomic,
} from '../../src/core/task-result-settlement.js';

const defaultSpawnMocks = vi.hoisted(() => ({
  spawnWorkerMultiProvider: vi.fn(async () => ({ backend: 'docker', provider: 'claude' })),
  finalizeTaskStatusFromSettlement: vi.fn(() => 'DONE'),
  pollForResultFile: vi.fn(async () => ({ notes: 'VERDICT: CONFIRMED default path' })),
}));

vi.mock('../../src/cli/commands/spawn.js', () => ({
  spawnWorkerMultiProvider: defaultSpawnMocks.spawnWorkerMultiProvider,
  finalizeTaskStatusFromSettlement: defaultSpawnMocks.finalizeTaskStatusFromSettlement,
}));
vi.mock('../../src/orchestra/sprint-phases.js', () => ({
  pollForResultFile: defaultSpawnMocks.pollForResultFile,
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

let root: string;
const originalDeckentHome = process.env.DECKENT_HOME;

beforeEach(() => {
  defaultSpawnMocks.spawnWorkerMultiProvider.mockClear();
  defaultSpawnMocks.finalizeTaskStatusFromSettlement.mockClear();
  defaultSpawnMocks.pollForResultFile.mockClear();
  root = mkdtempSync(join(tmpdir(), 'deckent-xverify-'));
  mkdirSync(join(root, TASKS_DIR), { recursive: true });
  process.env.DECKENT_HOME = `${root}-host-state`;
});

afterEach(() => {
  if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = originalDeckentHome;
  try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
  try { rmSync(`${root}-host-state`, { recursive: true, force: true }); } catch { /* ignore */ }
});

/** High-stakes by default (priority CRITICAL); override to make it low-stakes. */
function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '276-001',
    title: 'Harden auth token validation',
    description: 'Add JWT signature checks to the login endpoint',
    model: 'claude-sonnet-5',
    effort: 'normal',
    priority: 'CRITICAL',
    reason: 'security',
    scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/auth.ts'] },
    dependencies: [],
    goNogo: { goCriteria: 'JWT verified', noGoCriteria: 'bypass possible', techDebtAcceptable: 'none' },
    status: TaskStatus.DONE,
    sprintId: 'sprint-276',
    provider: 'claude',
    ...overrides,
  } as Task;
}

/** A clearly LOW-stakes task: no security keywords, NORMAL priority, neutral scope. */
function makeLowStakesTask(overrides: Partial<Task> = {}): Task {
  return makeTask({
    id: '276-002',
    title: 'Tidy up the config loader formatting',
    description: 'Reorder fields and reflow comments in the loader',
    priority: 'NORMAL',
    reason: 'cleanup',
    scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/loader.ts'] },
    ...overrides,
  });
}

function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '276-001',
    workerId: 'w-276-001',
    filesChanged: ['src/core/auth.ts'],
    linesAdded: 40,
    linesRemoved: 5,
    testsPassed: true,
    coverage: 92,
    selfAssessment: 'DONE',
    notes: 'Added JWT verification.',
    ...overrides,
  };
}

function makeConfig(
  crossVerify?: Partial<CrossVerifyConfig> & { enabled: boolean },
  overrides: Partial<ResolvedConfig> = {},
): ResolvedConfig {
  return {
    spawn_backend: 'docker',
    execution_budget: {
      roles: { auditor: { default: { maxCacheReadTokens: 1_000_000, maxTurns: 12 } } },
      unmetered_backend: { action: 'reroute-or-hold', ordered_backends: ['docker', 'subprocess'] },
    },
    cross_verify: crossVerify,
    ...overrides,
  } as unknown as ResolvedConfig;
}

function writeResultFile(taskId: string, result: TaskResult): void {
  writeFileSync(
    join(root, TASKS_DIR, `task-${taskId}.result`),
    JSON.stringify(result, null, 2),
    'utf-8',
  );
}

function readResultFile(taskId: string): TaskResult & {
  crossVerify?: { outcome: string; verifier?: string; verifierModel?: string; verdict?: string; reason: string };
} {
  return JSON.parse(
    readFileSync(join(root, TASKS_DIR, `task-${taskId}.result`), 'utf-8'),
  );
}

/** A spawn spy that records its last input and returns a fixed output. */
function makeSpawnSpy(output: string): { fn: SpawnVerifierFn; calls: SpawnVerifierInput[] } {
  const calls: SpawnVerifierInput[] = [];
  const fn = vi.fn(async (input: SpawnVerifierInput) => {
    calls.push(input);
    return output;
  });
  return { fn, calls };
}

const TWO_PROVIDERS: readonly ProviderName[] = ['claude', 'codex'];

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('runCrossVerify — config gate', () => {
  it('disabled config → skip "disabled", spawn never called', async () => {
    const { fn, calls } = makeSpawnSpy('VERDICT: CONFIRMED ok');
    const res = await runCrossVerify(
      root, makeTask(), makeResult(), TaskEvaluation.DONE,
      makeConfig(undefined), // no cross_verify block at all
      { availableProviders: TWO_PROVIDERS, spawnVerifier: fn },
    );
    expect(res.ran).toBe(false);
    expect(res.outcome).toBe('disabled');
    expect(res.skippedReason).toBe('disabled');
    expect(res.refuted).toBe(false);
    expect(calls.length).toBe(0);
  });

  it('enabled:false → skip "disabled"', async () => {
    const { fn, calls } = makeSpawnSpy('VERDICT: CONFIRMED ok');
    const res = await runCrossVerify(
      root, makeTask(), makeResult(), TaskEvaluation.DONE,
      makeConfig({ enabled: false }),
      { availableProviders: TWO_PROVIDERS, spawnVerifier: fn },
    );
    expect(res.ran).toBe(false);
    expect(res.outcome).toBe('disabled');
    expect(res.skippedReason).toBe('disabled');
    expect(calls.length).toBe(0);
  });
});

describe('runCrossVerify — evaluation gate', () => {
  it('NO_GO evaluation → skip "not-passing", spawn never called', async () => {
    const { fn, calls } = makeSpawnSpy('VERDICT: CONFIRMED ok');
    const res = await runCrossVerify(
      root, makeTask(), makeResult({ selfAssessment: 'NO_GO' }), TaskEvaluation.NO_GO,
      makeConfig({ enabled: true }),
      { availableProviders: TWO_PROVIDERS, spawnVerifier: fn },
    );
    expect(res.ran).toBe(false);
    expect(res.outcome).toBe('not-applicable');
    expect(res.skippedReason).toBe('not-passing');
    expect(calls.length).toBe(0);
  });
});

describe('runCrossVerify — dispatch + advisory write', () => {
  it('default path writes audit budget provenance and forwards Docker execution options', async () => {
    const task = makeTask({
      provider: 'codex',
      model: 'gpt-5.6-sol',
      scope: {
        directories: ['src/core/'],
        filesRead: ['src/core/auth.ts', 'src/core/auth.ts'],
        filesWrite: ['src/core/auth.ts'],
      },
    });
    const res = await runCrossVerify(
      root, task, makeResult(), TaskEvaluation.DONE,
      makeConfig({ enabled: true }, { docker_image: 'deckent-worker:test', docker_timeout: 321 }),
      { availableProviders: ['codex', 'claude'], verifierModel: 'claude-fable-5' },
    );

    expect(res.outcome).toBe('confirmed');
    expect(defaultSpawnMocks.spawnWorkerMultiProvider).toHaveBeenCalledTimes(1);
    const call = defaultSpawnMocks.spawnWorkerMultiProvider.mock.calls[0]!;
    expect(call[1]).toBe('claude-fable-5');
    expect(call[4]).toMatchObject({
      provider: 'claude',
      spawnBackend: 'docker',
      dockerImage: 'deckent-worker:test',
      dockerTimeout: 321,
      executionBudget: { maxCacheReadTokens: 1_000_000, maxTurns: 12 },
      hostTerminalResultContract: {
        version: 1,
        kind: 'terminal-verdict',
        protocol: 'xverify-v1',
      },
    });

    const verifierTask = JSON.parse(readFileSync(
      join(root, TASKS_DIR, 'task-276-001-xverify.json'),
      'utf-8',
    )) as Record<string, unknown>;
    expect(verifierTask).toMatchObject({
      model: 'claude-fable-5',
      provider: 'claude',
      type: 'audit',
      backend: 'docker',
      budget: { maxCacheReadTokens: 1_000_000, maxTurns: 12 },
      scope: {
        directories: [],
        filesRead: ['src/core/auth.ts'],
        filesWrite: [],
      },
    });
  });

  it('consumes a terminal Docker receipt and finalizes task projection from that receipt', async () => {
    defaultSpawnMocks.spawnWorkerMultiProvider.mockImplementationOnce(async (taskId, _model, _prompt, projectRoot) => {
      const ref = createTaskResultSettlementRef(projectRoot, taskId);
      writeTaskResultSettlementAttemptAtomic(ref);
      claimTaskResultSettlementAttemptAtomic(ref);
      writeTaskResultSettlementAtomic(createTaskResultSettlement({
        ref,
        exitCode: 0,
        result: {
          taskId,
          selfAssessment: 'DONE',
          testsPassed: true,
          notes: 'Host-observed terminal xverify protocol completed.\nVERDICT: CONFIRMED settled evidence',
        },
      }));
      writeTaskResultSettlementClosureAtomic(ref, {
        containerDisposition: 'stopped-removed',
        locksReleased: true,
      });
      return { backend: 'docker', provider: 'claude', settlementRef: ref };
    });

    const res = await runCrossVerify(
      root,
      makeTask({ provider: 'codex', model: 'gpt-5.6-sol' }),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true }),
      { availableProviders: ['codex', 'claude'], verifierModel: 'claude-fable-5' },
    );

    expect(res).toMatchObject({
      outcome: 'confirmed',
      advisory: { verdict: 'confirmed', reason: 'settled evidence' },
    });
    expect(defaultSpawnMocks.finalizeTaskStatusFromSettlement).toHaveBeenCalledOnce();
    expect(defaultSpawnMocks.pollForResultFile).not.toHaveBeenCalled();
  });

  it('does not accept a verifier receipt without lifecycle closure as a verdict', async () => {
    defaultSpawnMocks.finalizeTaskStatusFromSettlement.mockReturnValueOnce(null);
    defaultSpawnMocks.spawnWorkerMultiProvider.mockImplementationOnce(async (taskId, _model, _prompt, projectRoot) => {
      const ref = createTaskResultSettlementRef(projectRoot, taskId);
      writeTaskResultSettlementAttemptAtomic(ref);
      claimTaskResultSettlementAttemptAtomic(ref);
      writeTaskResultSettlementAtomic(createTaskResultSettlement({
        ref,
        exitCode: 0,
        result: {
          taskId,
          selfAssessment: 'DONE',
          testsPassed: true,
          notes: 'VERDICT: CONFIRMED receipt-only evidence',
        },
      }));
      return { backend: 'docker', provider: 'claude', settlementRef: ref };
    });

    const res = await runCrossVerify(
      root,
      makeTask({ provider: 'codex', model: 'gpt-5.6-sol' }),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true }),
      { availableProviders: ['codex', 'claude'], verifierModel: 'claude-fable-5', timeoutMs: 30 },
    );

    expect(res).toMatchObject({ outcome: 'unclear', advisory: { verdict: 'unclear' } });
    expect(defaultSpawnMocks.finalizeTaskStatusFromSettlement).toHaveBeenCalledOnce();
    expect(defaultSpawnMocks.pollForResultFile).not.toHaveBeenCalled();
  });

  it('does not override a settled NO_GO with a later provider-log verdict', async () => {
    defaultSpawnMocks.spawnWorkerMultiProvider.mockImplementationOnce(async (taskId, _model, _prompt, projectRoot) => {
      const ref = createTaskResultSettlementRef(projectRoot, taskId);
      writeTaskResultSettlementAttemptAtomic(ref);
      claimTaskResultSettlementAttemptAtomic(ref);
      writeTaskResultSettlementAtomic(createTaskResultSettlement({
        ref,
        exitCode: 0,
        result: {
          taskId,
          selfAssessment: 'NO_GO',
          testsPassed: false,
          markerType: 'EXIT_WITHOUT_RESULT',
          notes: 'Worker exited without writing result.',
        },
      }));
      writeTaskResultSettlementClosureAtomic(ref, {
        containerDisposition: 'stopped-removed',
        locksReleased: true,
      });
      writeFileSync(
        join(projectRoot, TASKS_DIR, `task-${taskId}.log`),
        'VERDICT: CONFIRMED contradictory raw log',
        'utf-8',
      );
      return { backend: 'docker', provider: 'claude', settlementRef: ref };
    });

    const res = await runCrossVerify(
      root,
      makeTask({ provider: 'codex', model: 'gpt-5.6-sol' }),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true }),
      { availableProviders: ['codex', 'claude'], verifierModel: 'claude-fable-5' },
    );

    expect(res).toMatchObject({ outcome: 'unclear', advisory: { verdict: 'unclear' } });
    expect(defaultSpawnMocks.finalizeTaskStatusFromSettlement).toHaveBeenCalledOnce();
    expect(defaultSpawnMocks.pollForResultFile).not.toHaveBeenCalled();
  });

  it('ignores wrapper marker notes and recovers the terminal verdict from the provider log', async () => {
    defaultSpawnMocks.spawnWorkerMultiProvider.mockImplementationOnce(async (taskId, _model, _prompt, projectRoot) => {
      writeFileSync(
        join(projectRoot, TASKS_DIR, `task-${taskId}.result`),
        JSON.stringify({
          taskId,
          workerId: `docker-${taskId}`,
          filesChanged: [],
          linesAdded: 0,
          linesRemoved: 0,
          testsPassed: false,
          coverage: 0,
          selfAssessment: 'NO_GO',
          markerType: 'EXIT_WITHOUT_RESULT',
          workPresent: false,
          diffStat: '',
          exitCode: 0,
          notes: 'Worker exited without writing result. EXIT_WITHOUT_RESULT marker.',
          tokenUsage: { inputTokens: 11, outputTokens: 22, cacheReadTokens: 33 },
          providerBilling: { source: 'provider-envelope', providerReportedUsd: 0.25 },
        }),
        'utf-8',
      );
      writeFileSync(
        join(projectRoot, TASKS_DIR, `task-${taskId}.log`),
        [
          'prompt example: VERDICT: REFUTED placeholder',
          'bounded evidence was insufficient',
          'VERDICT: UNCLEAR exact receipt was not present',
        ].join('\n'),
        'utf-8',
      );
      return { backend: 'docker', provider: 'claude' };
    });
    defaultSpawnMocks.pollForResultFile.mockResolvedValueOnce({
      notes: 'Worker exited without writing result. EXIT_WITHOUT_RESULT marker.',
    });

    const res = await runCrossVerify(
      root,
      makeTask({ provider: 'codex', model: 'gpt-5.6-sol' }),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true }),
      { availableProviders: ['codex', 'claude'], verifierModel: 'claude-fable-5' },
    );

    expect(res).toMatchObject({
      ran: true,
      outcome: 'unclear',
      advisory: {
        verdict: 'unclear',
        reason: 'exact receipt was not present',
      },
    });

    const recovered = JSON.parse(readFileSync(
      join(root, TASKS_DIR, 'task-276-001-xverify.result'),
      'utf-8',
    )) as Record<string, unknown>;
    expect(recovered).toMatchObject({
      selfAssessment: 'DONE',
      testsPassed: true,
      exitCode: 0,
      tokenUsage: { inputTokens: 11, outputTokens: 22, cacheReadTokens: 33 },
      providerBilling: { source: 'provider-envelope', providerReportedUsd: 0.25 },
    });
    expect(recovered).not.toHaveProperty('markerType');
    expect(recovered).not.toHaveProperty('workPresent');
    expect(recovered).not.toHaveProperty('diffStat');
    expect(String(recovered.notes)).toMatch(/VERDICT: UNCLEAR exact receipt was not present$/);
    expect(JSON.parse(readFileSync(
      join(root, TASKS_DIR, 'task-276-001-xverify.json'),
      'utf-8',
    ))).toMatchObject({ id: '276-001-xverify', status: TaskStatus.DONE });
  });

  it('waits for a provider log finalized shortly after the wrapper marker', async () => {
    defaultSpawnMocks.spawnWorkerMultiProvider.mockImplementationOnce(async (taskId, _model, _prompt, projectRoot) => {
      writeFileSync(
        join(projectRoot, TASKS_DIR, `task-${taskId}.result`),
        JSON.stringify({
          taskId,
          workerId: `docker-${taskId}`,
          filesChanged: [],
          linesAdded: 0,
          linesRemoved: 0,
          testsPassed: false,
          coverage: 0,
          selfAssessment: 'NO_GO',
          markerType: 'EXIT_WITHOUT_RESULT',
          notes: 'Worker exited without writing result. EXIT_WITHOUT_RESULT marker.',
          tokenUsage: { inputTokens: 101, outputTokens: 202, cacheReadTokens: 303 },
        }),
        'utf-8',
      );
      setTimeout(() => {
        writeFileSync(
          join(projectRoot, TASKS_DIR, `task-${taskId}.log`),
          [
            'prompt example: VERDICT: REFUTED placeholder',
            'VERDICT: CONFIRMED delayed normalized log is authoritative',
          ].join('\n'),
          'utf-8',
        );
      }, 25);
      return { backend: 'docker', provider: 'claude' };
    });
    defaultSpawnMocks.pollForResultFile.mockResolvedValueOnce({
      notes: 'Worker exited without writing result. EXIT_WITHOUT_RESULT marker.',
    });

    const res = await runCrossVerify(
      root,
      makeTask({ provider: 'codex', model: 'gpt-5.6-sol' }),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true }),
      { availableProviders: ['codex', 'claude'], verifierModel: 'claude-fable-5' },
    );

    expect(res).toMatchObject({
      ran: true,
      outcome: 'confirmed',
      advisory: {
        verdict: 'confirmed',
        reason: 'delayed normalized log is authoritative',
      },
    });
    expect(JSON.parse(readFileSync(
      join(root, TASKS_DIR, 'task-276-001-xverify.result'),
      'utf-8',
    ))).toMatchObject({
      selfAssessment: 'DONE',
      testsPassed: true,
      tokenUsage: { inputTokens: 101, outputTokens: 202, cacheReadTokens: 303 },
    });
    expect(JSON.parse(readFileSync(
      join(root, TASKS_DIR, 'task-276-001-xverify.json'),
      'utf-8',
    ))).toMatchObject({ id: '276-001-xverify', status: TaskStatus.DONE });
  });

  it('keeps the verifier task pending when no terminal verdict exists', async () => {
    defaultSpawnMocks.spawnWorkerMultiProvider.mockImplementationOnce(async (taskId, _model, _prompt, projectRoot) => {
      writeFileSync(
        join(projectRoot, TASKS_DIR, `task-${taskId}.result`),
        JSON.stringify({
          taskId,
          selfAssessment: 'NO_GO',
          testsPassed: false,
          markerType: 'EXIT_WITHOUT_RESULT',
          notes: 'Worker exited without writing result. EXIT_WITHOUT_RESULT marker.',
        }),
        'utf-8',
      );
      writeFileSync(
        join(projectRoot, TASKS_DIR, `task-${taskId}.log`),
        'bounded evidence ended without a terminal protocol line',
        'utf-8',
      );
      return { backend: 'docker', provider: 'claude' };
    });
    defaultSpawnMocks.pollForResultFile.mockResolvedValueOnce({
      notes: 'Worker exited without writing result. EXIT_WITHOUT_RESULT marker.',
    });

    const res = await runCrossVerify(
      root,
      makeTask({ provider: 'codex', model: 'gpt-5.6-sol' }),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true }),
      {
        availableProviders: ['codex', 'claude'],
        verifierModel: 'claude-fable-5',
        timeoutMs: 0,
      },
    );

    expect(res).toMatchObject({ ran: true, outcome: 'unclear' });
    expect(JSON.parse(readFileSync(
      join(root, TASKS_DIR, 'task-276-001-xverify.result'),
      'utf-8',
    ))).toMatchObject({ selfAssessment: 'NO_GO', markerType: 'EXIT_WITHOUT_RESULT' });
    expect(JSON.parse(readFileSync(
      join(root, TASKS_DIR, 'task-276-001-xverify.json'),
      'utf-8',
    ))).toMatchObject({ id: '276-001-xverify', status: 'PENDING' });
  });

  it('enabled + high-stakes + 2 providers + CONFIRMED → runs, writes advisory, not refuted', async () => {
    writeResultFile('276-001', makeResult());
    const { fn, calls } = makeSpawnSpy('Examined the diff.\nVERDICT: CONFIRMED jwt checks present');
    const res = await runCrossVerify(
      root, makeTask(), makeResult(), TaskEvaluation.DONE,
      makeConfig({ enabled: true }),
      { availableProviders: TWO_PROVIDERS, spawnVerifier: fn },
    );
    expect(res.ran).toBe(true);
    expect(res.outcome).toBe('confirmed');
    expect(res.refuted).toBe(false);
    expect(res.advisory?.verdict).toBe('confirmed');
    expect(res.advisory?.verifier).toBe('codex'); // different from claude task provider
    // spawn received the adversarial refute prompt
    expect(calls.length).toBe(1);
    expect(calls[0]!.prompt).toMatch(/REFUTE/i);
    expect(calls[0]!.verifierProvider).toBe('codex');
    expect(calls[0]!.verifierModel).toBe('gpt-4.1');
    expect(calls[0]!.executionBudget).toEqual({ maxCacheReadTokens: 1_000_000, maxTurns: 12 });
    expect(calls[0]!.spawnBackend).toBe('docker');
    // advisory persisted to .result, original fields preserved
    const persisted = readResultFile('276-001');
    expect(persisted.crossVerify?.verdict).toBe('confirmed');
    expect(persisted.crossVerify?.verifier).toBe('codex');
    expect(persisted.crossVerify?.verifierModel).toBe('gpt-4.1');
    expect(persisted.selfAssessment).toBe('DONE');
  });

  it('REFUTED verdict → refuted=true, advisory written, evaluation NOT downgraded', async () => {
    writeResultFile('276-001', makeResult());
    const { fn } = makeSpawnSpy('VERDICT: REFUTED signature check is missing on the refresh path');
    const res = await runCrossVerify(
      root, makeTask(), makeResult(), TaskEvaluation.DONE,
      makeConfig({ enabled: true }),
      { availableProviders: TWO_PROVIDERS, spawnVerifier: fn },
    );
    expect(res.ran).toBe(true);
    expect(res.outcome).toBe('refuted');
    expect(res.refuted).toBe(true);
    // Default (enforce_refuted unset) → advisory-only: blocked is false (323-004).
    expect(res.blocked).toBe(false);
    expect(res.advisory?.verdict).toBe('refuted');
    expect(res.advisory?.reason).toMatch(/signature check is missing/);
    // No downgrade: the runner never touches selfAssessment / evaluation.
    const persisted = readResultFile('276-001');
    expect(persisted.selfAssessment).toBe('DONE');
    expect(persisted.crossVerify?.verdict).toBe('refuted');
  });

  it('unparseable verifier output → verdict "unclear" (honest non-result), still runs', async () => {
    writeResultFile('276-001', makeResult());
    const { fn } = makeSpawnSpy('I looked at it and have no strong opinion.');
    const res = await runCrossVerify(
      root, makeTask(), makeResult(), TaskEvaluation.DONE,
      makeConfig({ enabled: true }),
      { availableProviders: TWO_PROVIDERS, spawnVerifier: fn },
    );
    expect(res.ran).toBe(true);
    expect(res.outcome).toBe('unclear');
    expect(res.refuted).toBe(false);
    expect(res.advisory?.verdict).toBe('unclear');
  });
});

describe('runCrossVerify — REFUTED enforcement (323-004 / A18)', () => {
  it('enforce_refuted=true + REFUTED → blocked=true (enforcement signal fires)', async () => {
    writeResultFile('276-001', makeResult());
    const { fn } = makeSpawnSpy('VERDICT: REFUTED signature check is missing on the refresh path');
    const res = await runCrossVerify(
      root, makeTask(), makeResult(), TaskEvaluation.DONE,
      makeConfig({ enabled: true, enforce_refuted: true }),
      { availableProviders: TWO_PROVIDERS, spawnVerifier: fn },
    );
    expect(res.ran).toBe(true);
    expect(res.refuted).toBe(true);
    expect(res.blocked).toBe(true);
    // ADR-070: even when enforcing, the runner never mutates the on-disk verdict —
    // it only SURFACES `blocked`; the evaluation layer owns the NO_GO downgrade.
    const persisted = readResultFile('276-001');
    expect(persisted.selfAssessment).toBe('DONE');
    expect(persisted.crossVerify?.verdict).toBe('refuted');
  });

  it('enforce_refuted=true + CONFIRMED → blocked=false (only REFUTED blocks)', async () => {
    writeResultFile('276-001', makeResult());
    const { fn } = makeSpawnSpy('VERDICT: CONFIRMED jwt checks present');
    const res = await runCrossVerify(
      root, makeTask(), makeResult(), TaskEvaluation.DONE,
      makeConfig({ enabled: true, enforce_refuted: true }),
      { availableProviders: TWO_PROVIDERS, spawnVerifier: fn },
    );
    expect(res.ran).toBe(true);
    expect(res.refuted).toBe(false);
    expect(res.blocked).toBe(false);
  });

  it('enforce_refuted=false (explicit) + REFUTED → blocked=false (advisory-only)', async () => {
    writeResultFile('276-001', makeResult());
    const { fn } = makeSpawnSpy('VERDICT: REFUTED missing check on the refresh path');
    const res = await runCrossVerify(
      root, makeTask(), makeResult(), TaskEvaluation.DONE,
      makeConfig({ enabled: true, enforce_refuted: false }),
      { availableProviders: TWO_PROVIDERS, spawnVerifier: fn },
    );
    expect(res.refuted).toBe(true);
    expect(res.blocked).toBe(false);
  });
});

describe('runCrossVerify — honest-skip paths', () => {
  it('missing auditor budget policy → durable HOLD before verifier dispatch', async () => {
    writeResultFile('276-001', makeResult());
    const { fn, calls } = makeSpawnSpy('VERDICT: CONFIRMED must not run');
    const res = await runCrossVerify(
      root, makeTask(), makeResult(), TaskEvaluation.DONE,
      makeConfig({ enabled: true }, { execution_budget: undefined }),
      { availableProviders: TWO_PROVIDERS, spawnVerifier: fn },
    );
    expect(res.ran).toBe(false);
    expect(res.outcome).toBe('unavailable');
    expect(res.skippedReason).toContain('verifier-budget-hold:budget-policy-missing');
    expect(calls).toHaveLength(0);
    expect(readResultFile('276-001').crossVerify).toMatchObject({
      outcome: 'unavailable',
      reason: expect.stringContaining('verifier-budget-hold:budget-policy-missing'),
    });
  });

  it('single provider (no different provider) → honest-skip, spawn never called', async () => {
    writeResultFile('276-001', makeResult());
    const { fn, calls } = makeSpawnSpy('VERDICT: CONFIRMED ok');
    const res = await runCrossVerify(
      root, makeTask(), makeResult(), TaskEvaluation.DONE,
      makeConfig({ enabled: true }),
      { availableProviders: ['claude'], spawnVerifier: fn }, // only the task's own provider
    );
    expect(res.ran).toBe(false);
    expect(res.outcome).toBe('unavailable');
    expect(res.skippedReason).toMatch(/no second provider/i);
    expect(res.evidencePersisted).toBe(true);
    expect(calls.length).toBe(0);
    expect(readResultFile('276-001').crossVerify).toEqual({
      outcome: 'unavailable',
      reason: 'no second provider available; honest-skip',
    });
  });

  it('low-stakes task with high_stakes_only=true (default) → skip, spawn never called', async () => {
    const { fn, calls } = makeSpawnSpy('VERDICT: CONFIRMED ok');
    const res = await runCrossVerify(
      root, makeLowStakesTask(), makeResult({ taskId: '276-002' }), TaskEvaluation.DONE,
      makeConfig({ enabled: true }), // high_stakes_only defaults true
      { availableProviders: TWO_PROVIDERS, spawnVerifier: fn },
    );
    expect(res.ran).toBe(false);
    expect(res.outcome).toBe('not-applicable');
    expect(res.skippedReason).toMatch(/not high-stakes/i);
    expect(calls.length).toBe(0);
  });

  it('low-stakes task with high_stakes_only=false → verifies anyway', async () => {
    writeResultFile('276-002', makeResult({ taskId: '276-002' }));
    const { fn, calls } = makeSpawnSpy('VERDICT: CONFIRMED clean refactor');
    const res = await runCrossVerify(
      root, makeLowStakesTask(), makeResult({ taskId: '276-002' }), TaskEvaluation.DONE,
      makeConfig({ enabled: true, high_stakes_only: false }),
      { availableProviders: TWO_PROVIDERS, spawnVerifier: fn },
    );
    expect(res.ran).toBe(true);
    expect(res.advisory?.verdict).toBe('confirmed');
    expect(calls.length).toBe(1);
  });
});

describe('runCrossVerify — fail-safe + verifier selection', () => {
  it('preserves exact API IDs and auditor budget for a Codex-authored Fable verification', async () => {
    const { fn, calls } = makeSpawnSpy('VERDICT: CONFIRMED exact API IDs preserved');
    const task = makeTask({ provider: 'codex', model: 'gpt-5.6-sol' });
    const res = await runCrossVerify(
      root, task, makeResult(), TaskEvaluation.DONE,
      makeConfig({ enabled: true }),
      {
        availableProviders: ['codex', 'claude'],
        spawnVerifier: fn,
        verifierModel: 'claude-fable-5',
      },
    );
    expect(res.outcome).toBe('confirmed');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.verifierProvider).toBe('claude');
    expect(calls[0]!.verifierModel).toBe('claude-fable-5');
    expect(calls[0]!.executionBudget).toEqual({ maxCacheReadTokens: 1_000_000, maxTurns: 12 });
    expect(calls[0]!.spawnBackend).toBe('docker');
  });

  it('spawn throws → does NOT throw, records explicit unavailable evidence', async () => {
    writeResultFile('276-001', makeResult());
    const fn: SpawnVerifierFn = vi.fn(async () => { throw new Error('verifier boom'); });
    const res = await runCrossVerify(
      root, makeTask(), makeResult(), TaskEvaluation.DONE,
      makeConfig({ enabled: true }),
      { availableProviders: TWO_PROVIDERS, spawnVerifier: fn },
    );
    expect(res.ran).toBe(false);
    expect(res.outcome).toBe('unavailable');
    expect(res.skippedReason).toBe('spawn-error');
    expect(res.evidencePersisted).toBe(true);
    expect(res.refuted).toBe(false);
    // Original result remains intact and the non-result is durable/auditable.
    const persisted = readResultFile('276-001');
    expect(persisted.crossVerify).toEqual({
      outcome: 'unavailable',
      verifier: 'codex',
      verifierModel: 'gpt-4.1',
      reason: 'spawn-error',
    });
    expect(persisted.selfAssessment).toBe('DONE');
  });

  it('reports evidencePersisted=false when the canonical result is missing', async () => {
    const fn: SpawnVerifierFn = vi.fn(async () => { throw new Error('verifier boom'); });
    const res = await runCrossVerify(
      root, makeTask(), makeResult(), TaskEvaluation.DONE,
      makeConfig({ enabled: true }),
      { availableProviders: TWO_PROVIDERS, spawnVerifier: fn },
    );
    expect(res.outcome).toBe('unavailable');
    expect(res.evidencePersisted).toBe(false);
  });

  it('verifier_priority config is respected when several providers qualify', async () => {
    const { fn, calls } = makeSpawnSpy('VERDICT: CONFIRMED ok');
    const res = await runCrossVerify(
      root, makeTask(), makeResult(), TaskEvaluation.DONE,
      makeConfig({ enabled: true, verifier_priority: ['gemini', 'codex'] }),
      { availableProviders: ['claude', 'codex', 'gemini'], spawnVerifier: fn },
    );
    expect(res.ran).toBe(true);
    expect(res.advisory?.verifier).toBe('gemini'); // first in priority among available ≠ claude
    expect(calls[0]!.verifierProvider).toBe('gemini');
    expect(calls[0]!.verifierModel).toBe('gemini-2.5-flash');
  });

  it('rejects an explicit verifier model owned by a different provider before spawn', async () => {
    writeResultFile('276-001', makeResult());
    const { fn, calls } = makeSpawnSpy('VERDICT: CONFIRMED should not run');
    const res = await runCrossVerify(
      root, makeTask(), makeResult(), TaskEvaluation.DONE,
      makeConfig({ enabled: true }),
      { availableProviders: TWO_PROVIDERS, spawnVerifier: fn, verifierModel: 'claude-opus-4-8' },
    );

    expect(res.outcome).toBe('unavailable');
    expect(res.skippedReason).toMatch(/belongs to claude, not codex/);
    expect(calls).toHaveLength(0);
    expect(readResultFile('276-001').crossVerify).toMatchObject({
      outcome: 'unavailable',
      verifier: 'codex',
      reason: expect.stringContaining('model-resolution-error'),
    });
  });
});
