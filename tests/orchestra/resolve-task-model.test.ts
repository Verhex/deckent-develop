import { describe, it, expect } from 'vitest';
import { resolveTaskModel } from '../../src/orchestra/brain.js';
import type { ResolvedConfig, TaskScope } from '../../src/core/types.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 4,
      brain_model: 'claude-opus-4-8',
      default_model: 'claude-sonnet-5',
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

function makeScope(dirs: string[], filesWrite: string[] = []): TaskScope {
  return { directories: dirs, filesRead: [], filesWrite };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('resolveTaskModel', () => {
  // Layer 4: base score system
  it('returns opus for high-complexity cross-module task on max plan', () => {
    const config = makeConfig({ mode: 'max_plan' });
    // 2+ directories → +3 score; architectural keyword → +2 score; total 5 → opus
    const scope = makeScope(['src/orchestra/', 'src/core/'], ['src/orchestra/brain.ts', 'src/core/types.ts']);
    const result = resolveTaskModel('Architect migration refactor', 'Cross-cutting refactor', scope, config);
    expect(result).toBe('claude-opus-5');
  });

  it('returns sonnet for single-dir moderate task', () => {
    const config = makeConfig({ mode: 'max_plan' });
    const scope = makeScope(['src/cli/']);
    const result = resolveTaskModel('Add CLI command', 'Add a new CLI command', scope, config);
    expect(result).toBe('claude-sonnet-5');
  });

  // Layer 1: Pro plan → no opus
  it('returns sonnet on pro_plan even when score would give opus', () => {
    const config = makeConfig({ mode: 'pro_plan' });
    const scope = makeScope(['src/orchestra/', 'src/core/']);
    const result = resolveTaskModel('Architect migration refactor', 'Cross-cutting architectural refactor', scope, config);
    expect(result).toBe('claude-sonnet-5'); // premium downgraded to standard on pro plan
  });

  it('returns sonnet on pro_plan for cross-module task (not opus)', () => {
    const config = makeConfig({ mode: 'pro_plan' });
    const scope = makeScope(['src/orchestra/', 'src/core/', 'src/cli/']);
    const result = resolveTaskModel('Big cross-module redesign', 'Migrate everything across modules', scope, config);
    expect(result).toBe('claude-sonnet-5');
  });

  // Layer 1: haiku_allowed=false → no haiku
  it('returns sonnet instead of haiku when haiku_allowed=false', () => {
    const config = makeConfig({
      mode: 'max_plan',
      activeModeConfig: {
        max_workers: 4,
        brain_model: 'claude-opus-4-8',
        default_model: 'claude-sonnet-5',
        haiku_allowed: false,
      },
    });
    // Single dir (-1) + doc scope would give -2 or low score → haiku
    const scope = makeScope(['docs/']);
    const result = resolveTaskModel('Update docs', 'Simple documentation update', scope, config);
    // docs scope → capped at sonnet by layer 3, haiku_allowed=false also prevents haiku
    expect(result).toBe('claude-sonnet-5');
  });

  it('floors a low-score CODE task to sonnet even when haiku_allowed=true (MODEL-GUARD)', () => {
    const config = makeConfig({
      mode: 'max_plan',
      activeModeConfig: {
        max_workers: 4,
        brain_model: 'claude-opus-4-8',
        default_model: 'claude-sonnet-5',
        haiku_allowed: true,
      },
    });
    // score: single dir = -1 → economy → would be haiku; but src/cli is a
    // code-development scope, so MODEL-GUARD upgrades economy → sonnet.
    const scope = makeScope(['src/cli/'], ['src/cli/simple.ts']);
    const result = resolveTaskModel('Minimal fix', 'A very simple change', scope, config);
    expect(result).toBe('claude-sonnet-5');
  });

  it('returns haiku for a low-score DOC task when haiku_allowed=true (economy allowed)', () => {
    const config = makeConfig({
      mode: 'max_plan',
      activeModeConfig: {
        max_workers: 4,
        brain_model: 'claude-opus-4-8',
        default_model: 'claude-sonnet-5',
        haiku_allowed: true,
      },
    });
    // A documentation task may use an economy model. forceModel pins haiku; the
    // guard exempts doc kinds, so haiku survives.
    const scope = makeScope(['docs/'], ['docs/note.md']);
    const result = resolveTaskModel('Tiny doc', 'A doc note', scope, config, [], 'claude-haiku-4-5-20251001');
    expect(result).toBe('claude-haiku-4-5-20251001');
  });

  // Layer 3: Task type filter — docs scope → max sonnet
  it('returns sonnet for docs/ scope task regardless of title complexity', () => {
    const config = makeConfig({ mode: 'max_plan' });
    const scope = makeScope(['docs/']);
    const result = resolveTaskModel('Massive architecture documentation', 'Write docs', scope, config);
    expect(result).toBe('claude-sonnet-5');
  });

  it('returns sonnet for tmp-test/ scope task', () => {
    const config = makeConfig({ mode: 'max_plan' });
    const scope = makeScope(['tmp-test/']);
    const result = resolveTaskModel('Run tmp test migration', 'Some test migration', scope, config);
    expect(result).toBe('claude-sonnet-5');
  });

  it('returns sonnet for scripts/ scope task', () => {
    const config = makeConfig({ mode: 'max_plan' });
    const scope = makeScope(['scripts/']);
    const result = resolveTaskModel('Update build script', 'Update build pipeline', scope, config);
    expect(result).toBe('claude-sonnet-5');
  });

  it('returns sonnet for test-only filesWrite', () => {
    const config = makeConfig({ mode: 'max_plan' });
    const scope = makeScope(['tests/'], ['tests/unit.test.ts', 'tests/integration.test.ts']);
    const result = resolveTaskModel('Write unit tests', 'Unit and integration tests', scope, config);
    expect(result).toBe('claude-sonnet-5');
  });

  // Layer ordering: plan filter > task type > score
  it('pro plan takes priority (gives sonnet)', () => {
    const config = makeConfig({ mode: 'pro_plan' });
    const scope = makeScope(['src/orchestra/', 'src/core/']);
    const result = resolveTaskModel('Cross-module refactor', 'Big refactor', scope, config);
    expect(result).toBe('claude-sonnet-5'); // pro plan caps at the standard Claude API identity
  });

  it('max plan with multi-dir scope returns opus', () => {
    const config = makeConfig({ mode: 'max_plan' });
    // 3 directories → +3; architect keyword → +2; score=5 → opus
    const scope = makeScope(['src/orchestra/', 'src/core/', 'src/cli/']);
    const result = resolveTaskModel('Architect cross-cutting redesign', 'Migrate across modules', scope, config);
    expect(result).toBe('claude-opus-5');
  });

  it('max5x_plan behaves like max (allows opus)', () => {
    const config = makeConfig({ mode: 'max5x_plan' });
    const scope = makeScope(['src/orchestra/', 'src/core/']);
    const result = resolveTaskModel('Architect migration refactor', 'Cross-cutting refactor', scope, config);
    expect(result).toBe('claude-opus-5');
  });

  it('haiku_allowed=false + simple task that scores haiku → sonnet', () => {
    const config = makeConfig({
      mode: 'max_plan',
      activeModeConfig: {
        max_workers: 4,
        brain_model: 'claude-opus-4-8',
        default_model: 'claude-sonnet-5',
        haiku_allowed: false,
      },
    });
    // Single-dir scope → -1; simple short task → score -1 → haiku; but haiku_allowed=false → sonnet
    const scope = makeScope(['src/cli/'], ['src/cli/small.ts']);
    const result = resolveTaskModel('Tiny fix', 'A tiny change', scope, config);
    expect(result).toBe('claude-sonnet-5');
  });
});

// ─── forceModel user override ───────────────────────────────────────

describe('resolveTaskModel — forceModel override', () => {
  const config = makeConfig();

  it('returns forceModel=opus directly, bypassing all layers', () => {
    // tmp-test scope would normally downgrade to sonnet
    const scope = makeScope(['tmp-test/']);
    const result = resolveTaskModel('Doc task', 'Write docs', scope, config, undefined, 'claude-opus-4-8');
    expect(result).toBe('claude-opus-4-8');
  });

  it('returns forceModel=haiku even when haiku_allowed=false', () => {
    const scope = makeScope(['src/']);
    const result = resolveTaskModel('Simple fix', 'Fix typo', scope, config, undefined, 'claude-haiku-4-5-20251001');
    expect(result).toBe('claude-haiku-4-5-20251001');
  });

  it('returns forceModel=sonnet without score calculation', () => {
    // High-complexity task would normally get opus
    const scope = makeScope(['src/', 'tests/', 'docs/'], Array.from({ length: 20 }, (_, i) => `f${i}.ts`));
    const result = resolveTaskModel('Architect redesign', 'Major refactor', scope, config, undefined, 'claude-sonnet-5');
    expect(result).toBe('claude-sonnet-5');
  });

  it('undefined forceModel uses normal auto-selection', () => {
    const scope = makeScope(['src/', 'tests/']);
    const result = resolveTaskModel('Big architect redesign task', 'Cross-cutting refactor', scope, config, undefined, undefined);
    // Should be opus (high score from keywords + multi-dir)
    expect(result).toBe('claude-opus-5');
  });
});
