// The declared model-tier ceiling, and why it had to become real.
//
// `ModelStrategy.max_tier` (src/core/mode-presets.ts) has always carried the
// doc-comment "Maximum allowed tier (tasks cannot exceed this)". Its only
// reader in the repository was `resolveConfiguredStrongerDefault` — an
// *upgrade* gate — so on the task-model path the ceiling constrained nothing,
// and `PlanModeConfig` (what `resolveTaskModel` actually reads) had no
// `max_tier` field at all. The floor (`min_tier`) was enforceable; the ceiling
// was a dead contract.
//
// Measured live (2026-09-12, sprint-747 / task 747-001): mode `performance`,
// `default_model` claude-sonnet-5, complexity score 4 → premium tier →
// claude-opus-5 on the worker task, with no configuration able to say
// otherwise. The baseline test below reproduces that resolution exactly so the
// ceiling tests are anchored to a real observation rather than a contrived one.

import { describe, expect, it } from 'vitest';
import type { ResolvedConfig, TaskScope } from '../../src/core/types.js';
import { resolveTaskModel } from '../../src/orchestra/model-selector.js';

/** The measured shape of task 747-001: 9 written files across src + tests. */
function premiumScoringScope(): TaskScope {
  return {
    directories: ['src/core', 'tests/core'],
    filesRead: ['src/core/observability.ts'],
    filesWrite: [
      'src/core/config-types.ts',
      'src/core/config.ts',
      'src/core/observability-rotation.ts',
      'src/core/observability.ts',
      'tests/core/a.test.ts',
      'tests/core/b.test.ts',
      'tests/core/c.test.ts',
      'tests/core/d.test.ts',
      'tests/core/e.test.ts',
    ],
  };
}

const TITLE =
  'Wire size-triggered metrics rotation and tenant-aware retention prune receipt into production';
const DESCRIPTION =
  'Close the production wiring of the observability metrics rotation chain in src/core so it '
  + 'actually runs on the live metrics write path instead of being reachable only from tests. '
  + 'Tenant-aware retention: the receipt records which tenant scope each pruned archive belonged '
  + 'to, ceilings are evaluated per tenant scope, and legal-hold exclusion plus the '
  + 'never-prune-the-last-surviving-archive guarantee must be preserved exactly.';

function makeConfig(
  activeModeConfig: ResolvedConfig['activeModeConfig'],
  modelStrategy?: ResolvedConfig['model_strategy'],
): ResolvedConfig {
  return {
    mode: 'performance',
    activeModeConfig,
    modes: {} as ResolvedConfig['modes'],
    language: 'en',
    projectName: 'test',
    projectRoot: '/tmp/test',
    version: '0.1.0',
    ...(modelStrategy ? { model_strategy: modelStrategy } : {}),
  } as ResolvedConfig;
}

/** The live performance-mode shape measured on 2026-09-12. */
function performanceMode(
  overrides: Partial<ResolvedConfig['activeModeConfig']> = {},
): ResolvedConfig['activeModeConfig'] {
  return {
    max_workers: 8,
    brain_model: 'claude-opus-5',
    default_model: 'claude-sonnet-5',
    haiku_allowed: false,
    min_tier: 'standard',
    ...overrides,
  } as ResolvedConfig['activeModeConfig'];
}

const resolve = (config: ResolvedConfig) =>
  resolveTaskModel(TITLE, DESCRIPTION, premiumScoringScope(), config);

describe('resolveTaskModel maximum tier ceiling', () => {
  it('reproduces the uncapped premium resolution that motivated the ceiling', () => {
    // Anchor: without a ceiling this task scores premium and resolves to a
    // premium model even though `default_model` is standard-tier. If this ever
    // stops reproducing, the ceiling tests below are no longer testing the
    // situation they were written for.
    expect(resolve(makeConfig(performanceMode()))).toBe('claude-opus-5');
  });

  it('clamps an auto-selected premium task to the declared ceiling', () => {
    expect(resolve(makeConfig(performanceMode({ max_tier: 'standard' }))))
      .toBe('claude-sonnet-5');
  });

  it('reads the mode-preset strategy when the mode config declares no ceiling', () => {
    // A configuration that only carries a preset strategy still binds — the
    // ceiling is not silently dropped just because it lives one level up.
    const config = makeConfig(performanceMode(), {
      brain_tier: 'premium',
      worker_tier: 'premium',
      min_tier: 'economy',
      max_tier: 'standard',
      auto_upgrade: true,
      auto_downgrade: false,
    });
    expect(resolve(config)).toBe('claude-sonnet-5');
  });

  it('lets the mode config win over the preset strategy', () => {
    const config = makeConfig(performanceMode({ max_tier: 'premium' }), {
      brain_tier: 'premium',
      worker_tier: 'premium',
      min_tier: 'economy',
      max_tier: 'standard',
      auto_upgrade: true,
      auto_downgrade: false,
    });
    expect(resolve(config)).toBe('claude-opus-5');
  });

  it('is inert when no ceiling is declared anywhere', () => {
    // Byte-for-byte today's behaviour for every existing configuration: an
    // absent ceiling must never be read as a ceiling of some default value.
    expect(resolve(makeConfig(performanceMode()))).toBe('claude-opus-5');
  });

  it('never upgrades — a ceiling is a ceiling, not a target', () => {
    const model = resolveTaskModel(
      'Add utility',
      'Simple utility function',
      { directories: ['src/core/'], filesRead: [], filesWrite: [] },
      makeConfig(performanceMode({ max_tier: 'premium_plus' })),
    );
    expect(model).toBe('claude-sonnet-5');
  });

  it('refuses a ceiling below the floor instead of silently picking one', () => {
    // Either silent resolution would enact a policy the operator did not
    // write, so contradictory bounds fail loudly.
    expect(() => resolve(makeConfig(performanceMode({
      min_tier: 'premium',
      max_tier: 'standard',
    })))).toThrow(/E_MODEL_TIER_BOUNDS_CONTRADICTORY|below min_tier/);
  });

  it('lets an explicit operator model override outrank the ceiling', () => {
    // Layer 0 (`- Model:` directive / forceModel) is a deliberate human pin and
    // returns before any tier arithmetic; the ceiling governs auto-selection
    // only. Silently rewriting an explicit pin would be the exact
    // substitution the model-drop fix (born-479) removed.
    const model = resolveTaskModel(
      TITLE,
      DESCRIPTION,
      premiumScoringScope(),
      makeConfig(performanceMode({ max_tier: 'standard' })),
      undefined,
      'claude-opus-5',
    );
    expect(model).toBe('claude-opus-5');
  });
});
