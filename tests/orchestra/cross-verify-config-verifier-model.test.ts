// tests/orchestra/cross-verify-config-verifier-model.test.ts
//
// MASTER-PLAN 669 — owner-configured verifier identity on the in-sprint path.
//
// Before this, the sprint path could only derive the verifier model from
// capability-tier equivalence with the task's own model. Tier equivalence
// cannot express "judge this with a named model": a standard-tier task always
// resolves to a standard-tier verifier, so a premium judge was unreachable
// unless a caller passed `--verifier-model` by hand on the CLI/MCP surface.
// `cross_verify.verifier_model` gives that same exact-ID authority to config.
//
// Hermetic: `spawnVerifier` is never real — the spawn module is mocked, all I/O
// is under os.tmpdir(), no gitignored state is read, no spawnSync. Passes on a
// fresh checkout.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runCrossVerify } from '../../src/orchestra/cross-verify-runner.js';
import { TaskEvaluation, TaskStatus } from '../../src/core/types.js';
import type { Task, TaskResult, ResolvedConfig, CrossVerifyConfig } from '../../src/core/types.js';
import { TASKS_DIR } from '../../src/core/constants.js';
import { modelRegistry } from '../../src/core/model-registry.js';

const spawnMocks = vi.hoisted(() => ({
  spawnWorkerMultiProvider: vi.fn(async () => ({ backend: 'docker', provider: 'codex' })),
  finalizeTaskStatusFromSettlement: vi.fn(() => 'DONE'),
  // The terminal protocol line requires a rationale after the verdict word — a
  // bare `VERDICT: CONFIRMED` is deliberately NOT accepted as terminal, so it
  // would fall through to the provider-log fallback and resolve UNCLEAR.
  pollForResultFile: vi.fn(async () => ({ notes: 'VERDICT: CONFIRMED reproduced the JWT check' })),
}));

vi.mock('../../src/cli/commands/spawn.js', () => ({
  spawnWorkerMultiProvider: spawnMocks.spawnWorkerMultiProvider,
  finalizeTaskStatusFromSettlement: spawnMocks.finalizeTaskStatusFromSettlement,
}));
vi.mock('../../src/orchestra/sprint-phases.js', () => ({
  pollForResultFile: spawnMocks.pollForResultFile,
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

let root: string;
const originalDeckentHome = process.env.DECKENT_HOME;

beforeEach(() => {
  spawnMocks.spawnWorkerMultiProvider.mockClear();
  spawnMocks.finalizeTaskStatusFromSettlement.mockClear();
  spawnMocks.pollForResultFile.mockClear();
  root = mkdtempSync(join(tmpdir(), 'deckent-xverify-model-'));
  mkdirSync(join(root, TASKS_DIR), { recursive: true });
  process.env.DECKENT_HOME = `${root}-host-state`;
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(`${root}-host-state`, { recursive: true, force: true });
  if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = originalDeckentHome;
});

/** High-stakes by construction: CRITICAL + security reason + auth scope. */
function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '669-001',
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
    sprintId: 'sprint-669',
    provider: 'claude',
    ...overrides,
  } as Task;
}

function makeResult(): TaskResult {
  return {
    taskId: '669-001',
    workerId: 'w-669-001',
    filesChanged: ['src/core/auth.ts'],
    linesAdded: 40,
    linesRemoved: 5,
    testsPassed: true,
    coverage: 92,
    selfAssessment: 'DONE',
    notes: 'Added JWT verification.',
  };
}

function makeConfig(crossVerify: Partial<CrossVerifyConfig> & { enabled: boolean }): ResolvedConfig {
  return {
    spawn_backend: 'docker',
    execution_budget: {
      roles: { auditor: { default: { maxCacheReadTokens: 1_000_000, maxTurns: 12 } } },
      landing: { reserve_ratio: 0.25 },
      unmetered_backend: { action: 'reroute-or-hold', ordered_backends: ['docker', 'subprocess'] },
      // codex reports usage only at call end; the owner authorizes it for the
      // auditor role under host wall-clock containment (mirrors real config).
      final_only_usage: {
        action: 'allow-wall-clock-containment',
        roles: ['auditor'],
        max_wall_clock_seconds: 300,
      },
    },
    cross_verify: crossVerify,
  } as unknown as ResolvedConfig;
}

/** The model the verifier was actually dispatched with. */
function dispatchedModel(): string {
  const [call] = spawnMocks.spawnWorkerMultiProvider.mock.calls as unknown as [unknown[]];
  expect(call).toBeDefined();
  return call[1] as unknown as string;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('cross_verify.verifier_model — owner-configured verifier identity', () => {
  it('dispatches the configured exact model instead of the tier-equivalent one', async () => {
    const res = await runCrossVerify(
      root,
      makeTask(),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true, verifier_model: { codex: 'gpt-5.6-sol' } }),
      { availableProviders: ['claude', 'codex'] },
    );

    expect(res.outcome).toBe('confirmed');
    expect(dispatchedModel()).toBe('gpt-5.6-sol');

    const verifierTask = JSON.parse(readFileSync(
      join(root, TASKS_DIR, 'task-669-001-xverify.json'),
      'utf-8',
    )) as Record<string, unknown>;
    expect(verifierTask.provider).toBe('codex');
    expect(verifierTask.model).toBe('gpt-5.6-sol');
  });

  it('reaches a premium judge for a standard-tier task — unreachable via tier equivalence', async () => {
    // The whole reason the config key exists: `claude-sonnet-5` is standard, so
    // tier equivalence can only ever return a standard-tier codex model.
    expect(modelRegistry.getOrThrow('claude-sonnet-5').tier).toBe('standard');
    expect(modelRegistry.getOrThrow('gpt-5.6-sol').tier).toBe('premium');
    expect(modelRegistry.getEquivalent('claude-sonnet-5', 'codex')).not.toBe('gpt-5.6-sol');

    await runCrossVerify(
      root,
      makeTask(),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true, verifier_model: { codex: 'gpt-5.6-sol' } }),
      { availableProviders: ['claude', 'codex'] },
    );

    expect(dispatchedModel()).toBe('gpt-5.6-sol');
  });

  it('lets an explicit caller flag outrank the configured identity', async () => {
    await runCrossVerify(
      root,
      makeTask(),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true, verifier_model: { codex: 'gpt-5.6-sol' } }),
      { availableProviders: ['claude', 'codex'], verifierModel: 'gpt-5.6-terra' },
    );

    expect(dispatchedModel()).toBe('gpt-5.6-terra');
  });

  it('only applies the entry for the provider actually selected as verifier', async () => {
    // Verifier resolves to claude here; a codex-keyed entry must not leak across.
    await runCrossVerify(
      root,
      makeTask({ provider: 'codex', model: 'gpt-5.6-sol' }),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true, verifier_model: { codex: 'gpt-5.6-luna' } }),
      { availableProviders: ['codex', 'claude'] },
    );

    const dispatched = dispatchedModel();
    expect(dispatched).not.toBe('gpt-5.6-luna');
    expect(modelRegistry.getOrThrow(dispatched).provider).toBe('claude');
  });

  it('keeps tier equivalence byte-for-byte when no entry is configured', async () => {
    await runCrossVerify(
      root,
      makeTask(),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true }),
      { availableProviders: ['claude', 'codex'] },
    );

    expect(dispatchedModel()).toBe(modelRegistry.getEquivalent('claude-sonnet-5', 'codex'));
  });

  it('honestly skips on an unknown model ID rather than substituting one', async () => {
    const res = await runCrossVerify(
      root,
      makeTask(),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true, verifier_model: { codex: 'gpt-9.9-nonexistent' } }),
      { availableProviders: ['claude', 'codex'] },
    );

    expect(res.outcome).toBe('unavailable');
    expect(res.skippedReason).toContain('model-resolution-error');
    expect(res.skippedReason).toContain('gpt-9.9-nonexistent');
    expect(spawnMocks.spawnWorkerMultiProvider).not.toHaveBeenCalled();
  });

  it('honestly skips a deprecated identity the tier path would have filtered out', async () => {
    // The tier path only ever returns `status: 'ga'`; an explicit override has no
    // such floor, so a withdrawn model could otherwise spend real verifier budget.
    // `preferredForTier` must NOT be carried over by the spread: the source model
    // is its tier's designated one (MASTER-PLAN 670) and a second designation in
    // codex/economy is rejected outright by `assertSoleTierPreference`. Dropping
    // it here is the fixture being honest — this clone is a withdrawn model, not
    // a rival answer for the tier.
    const retired = {
      ...modelRegistry.getOrThrow('gpt-5.6-luna'),
      id: 'codex-retired',
      apiId: 'codex-retired',
      status: 'deprecated' as const,
      preferredForTier: false,
    };
    modelRegistry.register(retired);
    try {
      const res = await runCrossVerify(
        root,
        makeTask(),
        makeResult(),
        TaskEvaluation.DONE,
        makeConfig({ enabled: true, verifier_model: { codex: 'codex-retired' } }),
        { availableProviders: ['claude', 'codex'] },
      );

      expect(res.outcome).toBe('unavailable');
      expect(res.skippedReason).toContain('deprecated');
      expect(spawnMocks.spawnWorkerMultiProvider).not.toHaveBeenCalled();
    } finally {
      modelRegistry.unregister('codex-retired');
    }
  });

  it('honestly skips when the configured ID belongs to a different provider', async () => {
    const res = await runCrossVerify(
      root,
      makeTask(),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true, verifier_model: { codex: 'claude-fable-5' } }),
      { availableProviders: ['claude', 'codex'] },
    );

    expect(res.outcome).toBe('unavailable');
    expect(res.skippedReason).toContain('model-resolution-error');
    expect(res.skippedReason).toContain('claude-fable-5');
    expect(spawnMocks.spawnWorkerMultiProvider).not.toHaveBeenCalled();
  });
});
