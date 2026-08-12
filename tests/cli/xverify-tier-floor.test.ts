// tests/cli/xverify-tier-floor.test.ts
//
// XVerify capability-tier floor — a verifier may never judge from BELOW the
// author model's tier, and the author model is an authoritative CLI input
// rather than a host-substituted guess.
//
// Two contracts, one file, because neither is worth anything alone:
//   1. `src/cli/commands/xverify.ts` — `--author-model` is registry-validated,
//      reaches the runner as its own typed input, and is recorded as
//      low-confidence when the operator did not state it. The claim envelope
//      (task.provider / task.model) is NOT rewritten by the flag.
//   2. `src/orchestra/cross-verify-runner.ts` — the floor lives in verifier
//      resolution, reads tiers from the model registry alone, and cannot be
//      bypassed by `--verifier-model`.
//
// Hermetic: every spawn seam is mocked, all I/O is under os.tmpdir(), no
// gitignored state is read, no spawnSync. Passes on a fresh checkout.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  runCrossVerify,
  resolveVerifierTierFloorRefusal,
  VERIFIER_TIER_BELOW_AUTHOR,
  VERIFIER_TIER_FLOOR_UNRESOLVABLE,
} from '../../src/orchestra/cross-verify-runner.js';
import { runXverifyForResult, XverifyInvocationError } from '../../src/cli/commands/xverify.js';
import { getMessage } from '../../src/cli/helpers/messages.js';
import { TaskEvaluation, TaskStatus } from '../../src/core/types.js';
import type { Task, TaskResult, ResolvedConfig, CrossVerifyConfig } from '../../src/core/types.js';
import { TASKS_DIR } from '../../src/core/constants.js';
import { modelRegistry } from '../../src/core/model-registry.js';
import { resolveDefaultModel } from '../../src/core/config.js';

const spawnMocks = vi.hoisted(() => ({
  spawnWorkerMultiProvider: vi.fn(async () => ({ backend: 'docker', provider: 'codex' })),
  finalizeTaskStatusFromSettlement: vi.fn(() => 'DONE'),
  pollForResultFile: vi.fn(async () => ({ notes: 'VERDICT: CONFIRMED reproduced the check' })),
}));

vi.mock('../../src/cli/commands/spawn.js', () => ({
  spawnWorkerMultiProvider: spawnMocks.spawnWorkerMultiProvider,
  finalizeTaskStatusFromSettlement: spawnMocks.finalizeTaskStatusFromSettlement,
}));
vi.mock('../../src/orchestra/sprint-phases.js', () => ({
  pollForResultFile: spawnMocks.pollForResultFile,
}));

// ─── Registry-sourced tier facts (asserted, never assumed) ───────────────────
//
// Every tier below is READ from the registry so this file can never become the
// second tier table the task forbids — if the catalog moves, these assertions
// fail loudly instead of silently testing a stale ladder.
const PREMIUM_AUTHOR = 'claude-opus-5';
const STANDARD_AUTHOR = 'claude-sonnet-5';
const PREMIUM_VERIFIER = 'gpt-5.6-sol';
const STANDARD_VERIFIER = 'gpt-5.6-terra';
const ECONOMY_VERIFIER = 'gpt-5.6-luna';

let root: string;
const originalDeckentHome = process.env.DECKENT_HOME;

beforeEach(() => {
  spawnMocks.spawnWorkerMultiProvider.mockClear();
  spawnMocks.finalizeTaskStatusFromSettlement.mockClear();
  spawnMocks.pollForResultFile.mockClear();
  root = mkdtempSync(join(tmpdir(), 'deckent-xverify-tier-floor-'));
  mkdirSync(join(root, TASKS_DIR), { recursive: true });
  process.env.DECKENT_HOME = `${root}-host-state`;
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(`${root}-host-state`, { recursive: true, force: true });
  if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = originalDeckentHome;
});

/** High-stakes by construction: CRITICAL + security reason. */
function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '524-004',
    title: 'Harden auth token validation',
    description: 'Add JWT signature checks to the login endpoint',
    model: PREMIUM_AUTHOR,
    effort: 'normal',
    priority: 'CRITICAL',
    reason: 'security',
    scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/auth.ts'] },
    dependencies: [],
    goNogo: { goCriteria: 'JWT verified', noGoCriteria: 'bypass possible', techDebtAcceptable: 'none' },
    status: TaskStatus.DONE,
    sprintId: 'sprint-524',
    provider: 'claude',
    ...overrides,
  } as Task;
}

function makeResult(): TaskResult {
  return {
    taskId: '524-004',
    workerId: 'w-524-004',
    filesChanged: ['src/core/auth.ts'],
    linesAdded: 40,
    linesRemoved: 5,
    testsPassed: true,
    coverage: 92,
    selfAssessment: 'DONE',
    notes: 'Added JWT verification.',
  };
}

function makeRunnerConfig(
  crossVerify: Partial<CrossVerifyConfig> & { enabled: boolean },
): ResolvedConfig {
  return {
    spawn_backend: 'docker',
    execution_budget: {
      roles: { auditor: { default: { maxCacheReadTokens: 1_000_000, maxTurns: 12 } } },
      landing: { reserve_ratio: 0.25 },
      unmetered_backend: { action: 'reroute-or-hold', ordered_backends: ['docker', 'subprocess'] },
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

// ─── The registry owns the ladder ────────────────────────────────────────────

describe('tier facts come from the model registry, not from this codebase', () => {
  it('reads the fixture ladder straight out of the registry', () => {
    expect(modelRegistry.getTier(PREMIUM_AUTHOR)).toBe('premium');
    expect(modelRegistry.getTier(STANDARD_AUTHOR)).toBe('standard');
    expect(modelRegistry.getTier(PREMIUM_VERIFIER)).toBe('premium');
    expect(modelRegistry.getTier(STANDARD_VERIFIER)).toBe('standard');
    expect(modelRegistry.getTier(ECONOMY_VERIFIER)).toBe('economy');
    // Ordering authority is the registry's comparator, not a local constant.
    expect(modelRegistry.compareTiers('economy', 'premium')).toBeLessThan(0);
  });

  it('refuses below-tier, admits equal and above-tier, in the pure seam', () => {
    expect(resolveVerifierTierFloorRefusal(PREMIUM_AUTHOR, ECONOMY_VERIFIER))
      .toContain(VERIFIER_TIER_BELOW_AUTHOR);
    expect(resolveVerifierTierFloorRefusal(PREMIUM_AUTHOR, PREMIUM_VERIFIER)).toBeNull();
    expect(resolveVerifierTierFloorRefusal(STANDARD_AUTHOR, PREMIUM_VERIFIER)).toBeNull();
  });

  it('fails closed — an identity absent from the registry proves no floor', () => {
    const refusal = resolveVerifierTierFloorRefusal('ghost-model-9', PREMIUM_VERIFIER);
    expect(refusal).toContain(VERIFIER_TIER_FLOOR_UNRESOLVABLE);
    expect(refusal).toContain('ghost-model-9');
  });
});

// ─── Runner: the floor lives in verifier resolution ──────────────────────────

describe('cross-verify-runner — verifier capability-tier floor', () => {
  it('refuses a below-tier verifier requested explicitly, before any spawn', async () => {
    const res = await runCrossVerify(
      root,
      makeTask(),
      makeResult(),
      TaskEvaluation.DONE,
      makeRunnerConfig({ enabled: true }),
      { availableProviders: ['claude', 'codex'], verifierModel: ECONOMY_VERIFIER },
    );

    expect(res.outcome).toBe('unavailable');
    expect(res.skippedReason).toContain(VERIFIER_TIER_BELOW_AUTHOR);
    expect(res.skippedReason).toContain(ECONOMY_VERIFIER);
    expect(res.skippedReason).toContain(PREMIUM_AUTHOR);
    // The whole point of refusing here: nothing was dispatched, nothing spent.
    expect(spawnMocks.spawnWorkerMultiProvider).not.toHaveBeenCalled();
  });

  it('admits an equal-tier verifier', async () => {
    const res = await runCrossVerify(
      root,
      makeTask(),
      makeResult(),
      TaskEvaluation.DONE,
      makeRunnerConfig({ enabled: true }),
      { availableProviders: ['claude', 'codex'], verifierModel: PREMIUM_VERIFIER },
    );

    expect(res.outcome).toBe('confirmed');
    expect(dispatchedModel()).toBe(PREMIUM_VERIFIER);
  });

  it('admits an above-tier verifier — the floor is a floor, not an equality', async () => {
    const res = await runCrossVerify(
      root,
      makeTask({ model: STANDARD_AUTHOR }),
      makeResult(),
      TaskEvaluation.DONE,
      makeRunnerConfig({ enabled: true }),
      { availableProviders: ['claude', 'codex'], verifierModel: PREMIUM_VERIFIER },
    );

    expect(res.outcome).toBe('confirmed');
    expect(dispatchedModel()).toBe(PREMIUM_VERIFIER);
  });

  it('refuses a below-tier identity that came from config, not from a flag', async () => {
    const res = await runCrossVerify(
      root,
      makeTask(),
      makeResult(),
      TaskEvaluation.DONE,
      makeRunnerConfig({ enabled: true, verifier_model: { codex: ECONOMY_VERIFIER } }),
      { availableProviders: ['claude', 'codex'] },
    );

    expect(res.outcome).toBe('unavailable');
    expect(res.skippedReason).toContain(VERIFIER_TIER_BELOW_AUTHOR);
    expect(spawnMocks.spawnWorkerMultiProvider).not.toHaveBeenCalled();
  });

  it('enforces the floor against the AUTHORITATIVE author model, not the task stamp', async () => {
    // The standalone claim envelope stamps a host-resolved default. Without an
    // authoritative author model this pairing looks equal-tier and dispatches;
    // with it, the same call is refused. That difference IS the task.
    const withoutAuthority = await runCrossVerify(
      root,
      makeTask({ model: STANDARD_AUTHOR }),
      makeResult(),
      TaskEvaluation.DONE,
      makeRunnerConfig({ enabled: true }),
      { availableProviders: ['claude', 'codex'], verifierModel: STANDARD_VERIFIER },
    );
    expect(withoutAuthority.outcome).toBe('confirmed');

    spawnMocks.spawnWorkerMultiProvider.mockClear();

    const withAuthority = await runCrossVerify(
      root,
      makeTask({ model: STANDARD_AUTHOR }),
      makeResult(),
      TaskEvaluation.DONE,
      makeRunnerConfig({ enabled: true }),
      {
        availableProviders: ['claude', 'codex'],
        verifierModel: STANDARD_VERIFIER,
        authorModel: PREMIUM_AUTHOR,
      },
    );

    expect(withAuthority.outcome).toBe('unavailable');
    expect(withAuthority.skippedReason).toContain(VERIFIER_TIER_BELOW_AUTHOR);
    expect(withAuthority.skippedReason).toContain(PREMIUM_AUTHOR);
    expect(spawnMocks.spawnWorkerMultiProvider).not.toHaveBeenCalled();
  });

  it('refuses when the author identity is unknown to the registry', async () => {
    const res = await runCrossVerify(
      root,
      makeTask(),
      makeResult(),
      TaskEvaluation.DONE,
      makeRunnerConfig({ enabled: true }),
      {
        availableProviders: ['claude', 'codex'],
        verifierModel: PREMIUM_VERIFIER,
        authorModel: 'ghost-model-9',
      },
    );

    expect(res.outcome).toBe('unavailable');
    expect(res.skippedReason).toContain(VERIFIER_TIER_FLOOR_UNRESOLVABLE);
    expect(spawnMocks.spawnWorkerMultiProvider).not.toHaveBeenCalled();
  });

  it('leaves the same-provider prohibition exactly as it was', async () => {
    await runCrossVerify(
      root,
      makeTask(),
      makeResult(),
      TaskEvaluation.DONE,
      makeRunnerConfig({ enabled: true }),
      { availableProviders: ['claude', 'codex'], authorModel: PREMIUM_AUTHOR },
    );

    const verifierTask = JSON.parse(readFileSync(
      join(root, TASKS_DIR, 'task-524-004-xverify.json'),
      'utf-8',
    )) as Record<string, unknown>;
    // The author provider is never the verifier — an authoritative author MODEL
    // does not soften the author PROVIDER exclusion.
    expect(verifierTask.provider).toBe('codex');
    expect(verifierTask.provider).not.toBe(makeTask().provider);
    expect(modelRegistry.getOrThrow(dispatchedModel()).provider).toBe('codex');
  });
});

// ─── CLI: `--author-model` is an authoritative, validated input ──────────────

function makeCliConfig(): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 1,
      brain_model: 'claude-fable-5',
      default_model: STANDARD_AUTHOR,
      haiku_allowed: false,
      brain_planning: 'structured',
    },
    modes: {},
    language: 'en',
    projectName: 'xverify-tier-floor-test',
    projectRoot: '/unused',
    version: '1.0.0',
    auto_docs: { tier1: false, tier2: false, tier3: false },
  } as ResolvedConfig;
}

/** Runner stub that records the options the CLI handed it. */
function makeStubRunner(skippedReason = 'stub') {
  const seen: { authorModel?: string; taskModel?: string; taskProvider?: string } = {};
  const fn = vi.fn(async (...args: unknown[]) => {
    const task = args[1] as { model: string; provider: string };
    const opts = args[5] as { authorModel?: string } | undefined;
    seen.authorModel = opts?.authorModel;
    seen.taskModel = task.model;
    seen.taskProvider = task.provider;
    return {
      outcome: 'unavailable' as const,
      disposition: 'hold' as const,
      ran: false,
      skippedReason,
      refuted: false,
      blocked: false,
    };
  });
  return { fn, seen };
}

function cliDeps(runner: ReturnType<typeof makeStubRunner>) {
  return {
    resolveProjectRootFn: () => root,
    loadConfigFn: async () => makeCliConfig(),
    bootstrapProvidersFn: async () => undefined,
    runCrossVerifyFn: runner.fn as never,
  };
}

describe('xverify CLI — --author-model', () => {
  it('refuses an id absent from the model registry, before any dispatch', async () => {
    const runner = makeStubRunner();
    await expect(runXverifyForResult(
      'The resolver enforces the floor.',
      { author: 'claude', authorModel: 'ghost-model-9', files: 'src/core/auth.ts' },
      cliDeps(runner),
    )).rejects.toThrow(XverifyInvocationError);
    expect(runner.fn).not.toHaveBeenCalled();
  });

  it('refuses an id owned by a provider other than --author', async () => {
    const runner = makeStubRunner();
    await expect(runXverifyForResult(
      'The resolver enforces the floor.',
      { author: 'claude', authorModel: PREMIUM_VERIFIER, files: 'src/core/auth.ts' },
      cliDeps(runner),
    )).rejects.toThrow(/gpt-5\.6-sol/u);
    expect(runner.fn).not.toHaveBeenCalled();
  });

  it('carries the stated author model to the runner and leaves the claim envelope alone', async () => {
    const runner = makeStubRunner();
    const res = await runXverifyForResult(
      'The resolver enforces the floor.',
      { author: 'claude', authorModel: PREMIUM_AUTHOR, files: 'src/core/auth.ts' },
      cliDeps(runner),
    );

    expect(runner.seen.authorModel).toBe(PREMIUM_AUTHOR);
    expect(res.authorModel).toBe(PREMIUM_AUTHOR);
    expect(res.authorModelConfidence).toBe('authoritative');
    // The envelope's author stamp is untouched: provider still the author, model
    // still the host-resolved default — the flag never rewrites the claim.
    expect(runner.seen.taskProvider).toBe('claude');
    expect(runner.seen.taskModel).toBe(resolveDefaultModel(makeCliConfig()));
    const claimTask = JSON.parse(readFileSync(
      join(root, TASKS_DIR, `task-${res.id}.json`),
      'utf-8',
    )) as Record<string, unknown>;
    expect(claimTask.provider).toBe('claude');
    expect(claimTask.model).toBe(resolveDefaultModel(makeCliConfig()));
  });

  it('records the substituted default as low-confidence when the flag is omitted', async () => {
    const runner = makeStubRunner();
    const res = await runXverifyForResult(
      'The resolver enforces the floor.',
      { author: 'claude', files: 'src/core/auth.ts' },
      cliDeps(runner),
    );

    const resolvedDefault = resolveDefaultModel(makeCliConfig());
    expect(res.authorModel).toBe(resolvedDefault);
    expect(res.authorModelConfidence).toBe('resolved-default');
    // Still enforced — just honestly labelled as an assumed input.
    expect(runner.seen.authorModel).toBe(resolvedDefault);
    expect(readFileSync(res.report, 'utf-8'))
      .toContain(getMessage('xverify.report.author_model_low_confidence', 'en'));
  });

  it('renders the runner typed refusal in the operator language, not as a wire code', async () => {
    // Built by the runner's OWN seam, so a drifted code literal on either side
    // fails this test instead of silently printing a raw machine string.
    const typedRefusal = resolveVerifierTierFloorRefusal(PREMIUM_AUTHOR, ECONOMY_VERIFIER);
    expect(typedRefusal).not.toBeNull();

    const runner = makeStubRunner(typedRefusal!);
    const res = await runXverifyForResult(
      'The resolver enforces the floor.',
      { author: 'claude', authorModel: PREMIUM_AUTHOR, files: 'src/core/auth.ts' },
      cliDeps(runner),
    );

    expect(res.reason).toBe(getMessage('xverify.err.verifier_tier_below_author', 'en', {
      verifierModel: ECONOMY_VERIFIER,
      verifierTier: 'economy',
      authorModel: PREMIUM_AUTHOR,
      authorTier: 'premium',
    }));
    expect(res.reason).not.toContain(VERIFIER_TIER_BELOW_AUTHOR);
    expect(readFileSync(res.report, 'utf-8')).toContain(ECONOMY_VERIFIER);
  });

  it('keeps the self-verification prohibition unchanged alongside the new flag', async () => {
    const runner = makeStubRunner();
    await expect(runXverifyForResult(
      'The resolver enforces the floor.',
      { author: 'claude', verifier: 'claude', authorModel: PREMIUM_AUTHOR },
      cliDeps(runner),
    )).rejects.toThrow(XverifyInvocationError);
    expect(runner.fn).not.toHaveBeenCalled();
  });

  it('ships every new operator string in both catalog languages', () => {
    for (const key of [
      'xverify.opt_author_model',
      'xverify.err.unknown_author_model',
      'xverify.err.author_model_provider_mismatch',
      'xverify.err.verifier_tier_below_author',
      'xverify.err.verifier_tier_floor_unresolvable',
      'xverify.report.author_model',
      'xverify.report.author_model_authoritative',
      'xverify.report.author_model_low_confidence',
    ]) {
      const en = getMessage(key, 'en');
      const tr = getMessage(key, 'tr');
      expect(en).not.toBe(key);
      expect(tr).not.toBe(key);
      expect(tr).not.toBe(en);
    }
  });
});
