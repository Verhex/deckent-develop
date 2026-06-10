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

// ─── Fixtures ────────────────────────────────────────────────────────────────

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'deckent-xverify-'));
  mkdirSync(join(root, TASKS_DIR), { recursive: true });
});

afterEach(() => {
  try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
});

/** High-stakes by default (priority CRITICAL); override to make it low-stakes. */
function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '276-001',
    title: 'Harden auth token validation',
    description: 'Add JWT signature checks to the login endpoint',
    model: 'sonnet',
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

function makeConfig(crossVerify?: Partial<CrossVerifyConfig> & { enabled: boolean }): ResolvedConfig {
  return { cross_verify: crossVerify } as unknown as ResolvedConfig;
}

function writeResultFile(taskId: string, result: TaskResult): void {
  writeFileSync(
    join(root, TASKS_DIR, `task-${taskId}.result`),
    JSON.stringify(result, null, 2),
    'utf-8',
  );
}

function readResultFile(taskId: string): TaskResult & { crossVerify?: { verifier: string; verdict: string; reason: string } } {
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
    expect(res.skippedReason).toBe('not-passing');
    expect(calls.length).toBe(0);
  });
});

describe('runCrossVerify — dispatch + advisory write', () => {
  it('enabled + high-stakes + 2 providers + CONFIRMED → runs, writes advisory, not refuted', async () => {
    writeResultFile('276-001', makeResult());
    const { fn, calls } = makeSpawnSpy('Examined the diff.\nVERDICT: CONFIRMED jwt checks present');
    const res = await runCrossVerify(
      root, makeTask(), makeResult(), TaskEvaluation.DONE,
      makeConfig({ enabled: true }),
      { availableProviders: TWO_PROVIDERS, spawnVerifier: fn },
    );
    expect(res.ran).toBe(true);
    expect(res.refuted).toBe(false);
    expect(res.advisory?.verdict).toBe('confirmed');
    expect(res.advisory?.verifier).toBe('codex'); // different from claude task provider
    // spawn received the adversarial refute prompt
    expect(calls.length).toBe(1);
    expect(calls[0]!.prompt).toMatch(/REFUTE/i);
    expect(calls[0]!.verifierProvider).toBe('codex');
    // advisory persisted to .result, original fields preserved
    const persisted = readResultFile('276-001');
    expect(persisted.crossVerify?.verdict).toBe('confirmed');
    expect(persisted.crossVerify?.verifier).toBe('codex');
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
    expect(res.refuted).toBe(true);
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
    expect(res.refuted).toBe(false);
    expect(res.advisory?.verdict).toBe('unclear');
  });
});

describe('runCrossVerify — honest-skip paths', () => {
  it('single provider (no different provider) → honest-skip, spawn never called', async () => {
    const { fn, calls } = makeSpawnSpy('VERDICT: CONFIRMED ok');
    const res = await runCrossVerify(
      root, makeTask(), makeResult(), TaskEvaluation.DONE,
      makeConfig({ enabled: true }),
      { availableProviders: ['claude'], spawnVerifier: fn }, // only the task's own provider
    );
    expect(res.ran).toBe(false);
    expect(res.skippedReason).toMatch(/no second provider/i);
    expect(calls.length).toBe(0);
  });

  it('low-stakes task with high_stakes_only=true (default) → skip, spawn never called', async () => {
    const { fn, calls } = makeSpawnSpy('VERDICT: CONFIRMED ok');
    const res = await runCrossVerify(
      root, makeLowStakesTask(), makeResult({ taskId: '276-002' }), TaskEvaluation.DONE,
      makeConfig({ enabled: true }), // high_stakes_only defaults true
      { availableProviders: TWO_PROVIDERS, spawnVerifier: fn },
    );
    expect(res.ran).toBe(false);
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
  it('spawn throws → does NOT throw, skip "spawn-error", .result left intact', async () => {
    writeResultFile('276-001', makeResult());
    const fn: SpawnVerifierFn = vi.fn(async () => { throw new Error('verifier boom'); });
    const res = await runCrossVerify(
      root, makeTask(), makeResult(), TaskEvaluation.DONE,
      makeConfig({ enabled: true }),
      { availableProviders: TWO_PROVIDERS, spawnVerifier: fn },
    );
    expect(res.ran).toBe(false);
    expect(res.skippedReason).toBe('spawn-error');
    expect(res.refuted).toBe(false);
    // .result must not have been corrupted or annotated.
    const persisted = readResultFile('276-001');
    expect(persisted.crossVerify).toBeUndefined();
    expect(persisted.selfAssessment).toBe('DONE');
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
  });
});
