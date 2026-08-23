// OWNER-MODEL-POLICY-001 (FAZ-0 item 7) — enforcement + selection proof.
//
// The store records the owner's provider-scoped activation policy; these pins
// prove that policy actually GOVERNS the pool and every selection boundary:
//   - explicit-active provider → ONLY owner-active models are selectable,
//   - a newly registered GA model can never auto-enter an explicit-active pool,
//   - identity resolution stays total (a tombstoned model still resolves — so a
//     parametric re-register cannot resurrect it into the selectable pool),
//   - deterministic tier→model resolves to the owner's ladder (standard→terra,
//     premium_plus→sol, economy→luna) while the inactive gpt-5.5 is unreachable,
//   - an explicit inactive forceModel is a typed MODEL_INACTIVE HOLD (never a
//     silent substitution), fired before any provider/backend touch,
//   - the implicit-active default is byte-compatible (no policy → unchanged),
//   - planner/selection/dispatch all read ONE snapshot (the registry's injected
//     policy digest equals the freshly-resolved store digest).
//
// The gpt-5.6 tier ladder is asserted against the bundled BUILTIN registry
// (hermetic — no models.dev fetch), which is the owner-reviewed authority for
// these ids. The live models.dev catalog currently projects terra/sol as
// `premium`; reconciling that owner-reviewed projection is tracked separately
// and does not affect this activation contract.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ModelRegistry, modelRegistry, type ModelDefinition } from '../../src/core/model-registry.js';
import {
  ModelActivationStore,
  resolveActiveModelPolicy,
} from '../../src/core/model-activation-store.js';
import { resolveTaskModel } from '../../src/orchestra/brain.js';
import type { ResolvedConfig, TaskScope } from '../../src/core/types.js';
import { DeckentError } from '../../src/core/errors.js';

// Owner active Codex set (exact ids) + the inactive premium model to prove out.
const CODEX_ACTIVE = ['gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-5.6-luna'] as const;
const CODEX_INACTIVE_PREMIUM = 'gpt-5.5';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'model-policy-enf-'));
});

afterEach(() => {
  // Never leak a policy onto the process-wide singleton between tests.
  modelRegistry.setActivationPolicy(undefined);
  rmSync(root, { recursive: true, force: true });
});

/** Record codex→explicit-active with the owner active set, return the snapshot. */
function ownerCodexPolicy() {
  const store = new ModelActivationStore(root, { now: () => '2026-08-16T00:00:00.000Z' });
  try {
    store.setProviderPolicy('codex', 'explicit-active');
    for (const id of CODEX_ACTIVE) store.setActivation('codex', id, true);
  } finally {
    store.close();
  }
  return resolveActiveModelPolicy(root);
}

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 4,
      brain_model: 'claude-fable-5',
      default_model: 'gpt-5.6-terra',
      haiku_allowed: false,
    },
    modes: {} as never,
    language: 'en',
    projectName: 'test',
    projectRoot: '/tmp/test',
    version: '0.1.0',
    ...overrides,
  };
}

const scope: TaskScope = { directories: ['src/core/'], filesRead: [], filesWrite: [] };
const complexScope: TaskScope = {
  directories: ['src/core/', 'src/orchestra/'],
  filesRead: [],
  filesWrite: ['src/core/example.ts', 'src/orchestra/example.ts'],
};

describe('BUILTIN registry carries the owner tier ladder (fail-fast precondition)', () => {
  it('gpt-5.6 family + gpt-5.5 exist with the owner-reviewed tiers', () => {
    const r = new ModelRegistry();
    expect(r.get('gpt-5.6-luna')?.tier).toBe('economy');
    expect(r.get('gpt-5.6-terra')?.tier).toBe('standard');
    expect(r.get('gpt-5.6-sol')?.tier).toBe('premium_plus');
    expect(r.get(CODEX_INACTIVE_PREMIUM)?.tier).toBe('premium');
  });
});

describe('registry read-filter — explicit-active hides the non-active pool', () => {
  it('an inactive premium model is unreachable via getByProviderAndTier', () => {
    const r = new ModelRegistry();
    // Before policy: gpt-5.5 IS the premium codex model.
    expect(r.getByProviderAndTier('codex', 'premium')?.id).toBe(CODEX_INACTIVE_PREMIUM);
    r.setActivationPolicy(ownerCodexPolicy());
    // After policy: premium codex has no active member → unreachable.
    expect(r.getByProviderAndTier('codex', 'premium')).toBeUndefined();
  });

  it('deterministic tier→model resolves to the owner ladder', () => {
    const r = new ModelRegistry();
    r.setActivationPolicy(ownerCodexPolicy());
    expect(r.getByProviderAndTier('codex', 'economy')?.id).toBe('gpt-5.6-luna');
    expect(r.getByProviderAndTier('codex', 'standard')?.id).toBe('gpt-5.6-terra');
    expect(r.getByProviderAndTier('codex', 'premium_plus')?.id).toBe('gpt-5.6-sol');
  });

  it('getAllModels / getAllModelIds exclude every inactive codex model but keep the active three', () => {
    const r = new ModelRegistry();
    r.setActivationPolicy(ownerCodexPolicy());
    const ids = new Set(r.getAllModelIds());
    for (const id of CODEX_ACTIVE) expect(ids.has(id)).toBe(true);
    expect(ids.has(CODEX_INACTIVE_PREMIUM)).toBe(false);
    // Other codex generations the owner did not activate are gone from the pool.
    for (const gone of ['gpt-5-mini', 'gpt-4.1', 'o3', 'o4-mini']) {
      if (r.get(gone)) expect(ids.has(gone)).toBe(false);
    }
    // A different (implicit-active) provider is untouched.
    expect(r.getAllModels().some((m) => m.provider === 'claude')).toBe(true);
  });

  it('identity resolution stays TOTAL — an inactive model still resolves (tombstone, not deletion)', () => {
    const r = new ModelRegistry();
    r.setActivationPolicy(ownerCodexPolicy());
    // Hidden from the pool…
    expect(r.getAllModelIds()).not.toContain(CODEX_INACTIVE_PREMIUM);
    // …but still resolvable for identity / receipts / accounting.
    expect(r.get(CODEX_INACTIVE_PREMIUM)?.id).toBe(CODEX_INACTIVE_PREMIUM);
    expect(r.has(CODEX_INACTIVE_PREMIUM)).toBe(true);
  });

  it('a newly registered GA model can NOT auto-enter an explicit-active pool', () => {
    const r = new ModelRegistry();
    r.setActivationPolicy(ownerCodexPolicy());
    const fresh: ModelDefinition = {
      id: 'gpt-9.9-newga', apiId: 'gpt-9.9-newga', provider: 'codex', tier: 'standard',
      contextWindow: 128_000, costPerMillion: { input: 1, output: 2 },
      capabilities: { streaming: true, toolUse: true, vision: false, codeExecution: false, reasoning: false },
      status: 'ga', maxOutputTokens: 8_192,
    };
    r.register(fresh); // simulates catalog/parametric discovery (the resurrection vector)
    expect(r.get('gpt-9.9-newga')?.id).toBe('gpt-9.9-newga'); // identity total
    expect(r.getAllModelIds()).not.toContain('gpt-9.9-newga'); // pool excludes it
    expect(r.getByProviderAndTier('codex', 'standard')?.id).toBe('gpt-5.6-terra'); // still terra
  });
});

describe('forceModel HOLD — explicit inactive override is a typed MODEL_INACTIVE, never a substitution', () => {
  it('resolveTaskModel(forceModel=gpt-5.5, codex) throws MODEL_INACTIVE before any dispatch', () => {
    modelRegistry.setActivationPolicy(ownerCodexPolicy());
    let caught: unknown;
    try {
      resolveTaskModel('t', 'd', scope, makeConfig(), undefined, CODEX_INACTIVE_PREMIUM, undefined, 'codex');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(DeckentError);
    expect((caught as DeckentError).code).toBe('MODEL_INACTIVE');
  });

  it('resolveTaskModel(forceModel=gpt-5.6-terra, codex) returns the active model verbatim', () => {
    modelRegistry.setActivationPolicy(ownerCodexPolicy());
    const result = resolveTaskModel('t', 'd', scope, makeConfig(), undefined, 'gpt-5.6-terra', undefined, 'codex');
    expect(result).toBe('gpt-5.6-terra');
  });
});

describe('auto-selection — an active stronger tier may satisfy a missing exact tier', () => {
  it('resolves a premium task to active premium_plus sol without resurrecting inactive gpt-5.5', () => {
    modelRegistry.setActivationPolicy(ownerCodexPolicy());

    const result = resolveTaskModel(
      'Architect migration refactor',
      'Cross-cutting refactor across the terminal archive authority',
      complexScope,
      makeConfig({
        model_strategy: {
          brain_tier: 'premium',
          worker_tier: 'premium',
          min_tier: 'economy',
          max_tier: 'premium_plus',
          auto_upgrade: true,
          auto_downgrade: false,
        },
        activeModeConfig: {
          max_workers: 4,
          brain_model: 'claude-fable-5',
          default_model: 'gpt-5.6-sol',
          haiku_allowed: false,
        },
      }),
      undefined,
      undefined,
      undefined,
      'codex',
    );

    expect(result).toBe('gpt-5.6-sol');
    expect(result).not.toBe(CODEX_INACTIVE_PREMIUM);
    expect(modelRegistry.isAtLeastTier(result, 'premium')).toBe(true);
  });

  it.each([
    {
      name: 'auto-upgrade is disabled',
      strategy: {
        brain_tier: 'standard', worker_tier: 'standard', min_tier: 'economy',
        max_tier: 'premium_plus', auto_upgrade: false, auto_downgrade: true,
      } as const,
    },
    {
      name: 'the configured ceiling excludes premium_plus',
      strategy: {
        brain_tier: 'standard', worker_tier: 'premium', min_tier: 'economy',
        max_tier: 'premium', auto_upgrade: true, auto_downgrade: true,
      } as const,
    },
  ])('holds instead of exceeding policy when $name', ({ strategy }) => {
    modelRegistry.setActivationPolicy(ownerCodexPolicy());
    const config = makeConfig({
      model_strategy: strategy,
      activeModeConfig: {
        max_workers: 4,
        brain_model: 'claude-fable-5',
        default_model: 'gpt-5.6-sol',
        haiku_allowed: false,
      },
    });

    expect(() => resolveTaskModel(
      'Architect migration refactor',
      'Cross-cutting refactor across the terminal archive authority',
      complexScope,
      config,
      undefined,
      undefined,
      undefined,
      'codex',
    )).toThrow("No premium-tier model registered for provider 'codex'");
  });
});

describe('implicit-active default — byte-compatible when no policy is injected', () => {
  it('with no policy, gpt-5.5 is still selectable and forceModel does not throw', () => {
    // No setActivationPolicy → undefined → zero filtering.
    const r = new ModelRegistry();
    expect(r.getByProviderAndTier('codex', 'premium')?.id).toBe(CODEX_INACTIVE_PREMIUM);
    const result = resolveTaskModel('t', 'd', scope, makeConfig(), undefined, CODEX_INACTIVE_PREMIUM, undefined, 'codex');
    expect(result).toBe(CODEX_INACTIVE_PREMIUM);
  });

  it('an implicit-active provider with an unrecorded model keeps it executable', () => {
    const store = new ModelActivationStore(root, { now: () => '2026-08-16T00:00:00.000Z' });
    try {
      store.setProviderPolicy('codex', 'implicit-active');
    } finally {
      store.close();
    }
    const r = new ModelRegistry();
    r.setActivationPolicy(resolveActiveModelPolicy(root));
    // implicit-active + no deactivation → gpt-5.5 stays selectable.
    expect(r.getByProviderAndTier('codex', 'premium')?.id).toBe(CODEX_INACTIVE_PREMIUM);
  });
});

describe('single active snapshot — planner/selection/dispatch read the SAME digest', () => {
  it('the registry-injected policy digest equals the freshly-resolved store digest', () => {
    const policy = ownerCodexPolicy();
    modelRegistry.setActivationPolicy(policy);
    const reResolved = resolveActiveModelPolicy(root);
    expect(modelRegistry.getActivationPolicy()?.snapshotDigest).toBe(policy.snapshotDigest);
    // Deterministic across identical stores → the same active-set everywhere.
    expect(reResolved.snapshotDigest).toBe(policy.snapshotDigest);
  });
});
