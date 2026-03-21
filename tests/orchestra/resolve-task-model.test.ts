import { describe, it, expect } from 'vitest';
import { resolveTaskModel } from '../../src/orchestra/brain.js';
import type { ResolvedConfig, UsageMetrics, TaskScope } from '../../src/core/types.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 4,
      brain_model: 'opus',
      default_model: 'sonnet',
      haiku_allowed: false,
      usage_thresholds: { '5hr': 0.8, weekly: 0.9 },
    },
    modes: {} as never,
    language: 'en',
    projectName: 'test',
    projectRoot: '/tmp/test',
    version: '0.1.0',
    ...overrides,
  };
}

function makeUsage(overrides: Partial<UsageMetrics> = {}): UsageMetrics {
  return {
    fiveHourPercent: 10,
    weeklyPercent: 10,
    measuredAt: '2026-03-18T00:00:00.000Z',
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
    const usage = makeUsage();
    // 2+ directories → +3 score; architectural keyword → +2 score; total 5 → opus
    const scope = makeScope(['src/orchestra/', 'src/core/'], ['src/orchestra/brain.ts', 'src/core/types.ts']);
    const result = resolveTaskModel('Architect migration refactor', 'Cross-cutting refactor', scope, config, usage);
    expect(result).toBe('opus');
  });

  it('returns sonnet for single-dir moderate task', () => {
    const config = makeConfig({ mode: 'max_plan' });
    const usage = makeUsage();
    const scope = makeScope(['src/cli/']);
    const result = resolveTaskModel('Add CLI command', 'Add a new CLI command', scope, config, usage);
    expect(result).toBe('sonnet');
  });

  // Layer 1: Pro plan → no opus
  it('returns sonnet on pro_plan even when score would give opus', () => {
    const config = makeConfig({ mode: 'pro_plan' });
    const usage = makeUsage();
    const scope = makeScope(['src/orchestra/', 'src/core/']);
    const result = resolveTaskModel('Architect migration refactor', 'Cross-cutting architectural refactor', scope, config, usage);
    expect(result).toBe('sonnet'); // opus downgraded to sonnet on pro plan
  });

  it('returns sonnet on pro_plan for cross-module task (not opus)', () => {
    const config = makeConfig({ mode: 'pro_plan' });
    const usage = makeUsage();
    const scope = makeScope(['src/orchestra/', 'src/core/', 'src/cli/']);
    const result = resolveTaskModel('Big cross-module redesign', 'Migrate everything across modules', scope, config, usage);
    expect(result).toBe('sonnet');
  });

  // Layer 1: haiku_allowed=false → no haiku
  it('returns sonnet instead of haiku when haiku_allowed=false', () => {
    const config = makeConfig({
      mode: 'max_plan',
      activeModeConfig: {
        max_workers: 4,
        brain_model: 'opus',
        default_model: 'sonnet',
        haiku_allowed: false,
        usage_thresholds: { '5hr': 0.8, weekly: 0.9 },
      },
    });
    const usage = makeUsage();
    // Single dir (-1) + doc scope would give -2 or low score → haiku
    const scope = makeScope(['docs/']);
    const result = resolveTaskModel('Update docs', 'Simple documentation update', scope, config, usage);
    // docs scope → capped at sonnet by layer 3, haiku_allowed=false also prevents haiku
    expect(result).toBe('sonnet');
  });

  it('returns haiku when haiku_allowed=true and score is low', () => {
    const config = makeConfig({
      mode: 'max_plan',
      activeModeConfig: {
        max_workers: 4,
        brain_model: 'opus',
        default_model: 'sonnet',
        haiku_allowed: true,
        usage_thresholds: { '5hr': 0.8, weekly: 0.9 },
      },
    });
    const usage = makeUsage();
    // Single dir → -1, but note docs → -2; score = -3 → haiku
    // BUT layer 3 (docs scope) caps at sonnet, so still sonnet
    // Use a non-docs single dir scope with very simple task (score = -1)
    const scope = makeScope(['src/cli/'], ['src/cli/simple.ts']);
    const result = resolveTaskModel('Minimal fix', 'A very simple change', scope, config, usage);
    // score: single dir = -1 → haiku; haiku_allowed=true → returns haiku
    expect(result).toBe('haiku');
  });

  // Layer 2: Usage pressure
  it('downgrades opus to sonnet when fiveHourPercent >= 80', () => {
    const config = makeConfig({ mode: 'max_plan' });
    const usage = makeUsage({ fiveHourPercent: 85, weeklyPercent: 20 });
    const scope = makeScope(['src/orchestra/', 'src/core/']);
    const result = resolveTaskModel('Architect migration refactor', 'Cross-cutting refactor', scope, config, usage);
    expect(result).toBe('sonnet'); // opus downgraded due to high usage
  });

  it('downgrades opus to sonnet when weeklyPercent >= 80', () => {
    const config = makeConfig({ mode: 'max_plan' });
    const usage = makeUsage({ fiveHourPercent: 20, weeklyPercent: 80 });
    const scope = makeScope(['src/orchestra/', 'src/core/']);
    const result = resolveTaskModel('Architect migration refactor', 'Cross-cutting refactor', scope, config, usage);
    expect(result).toBe('sonnet');
  });

  it('keeps opus when usage is below 80%', () => {
    const config = makeConfig({ mode: 'max_plan' });
    const usage = makeUsage({ fiveHourPercent: 79, weeklyPercent: 79 });
    const scope = makeScope(['src/orchestra/', 'src/core/']);
    const result = resolveTaskModel('Architect migration refactor', 'Cross-cutting refactor', scope, config, usage);
    expect(result).toBe('opus');
  });

  // Layer 3: Task type filter — docs scope → max sonnet
  it('returns sonnet for docs/ scope task regardless of title complexity', () => {
    const config = makeConfig({ mode: 'max_plan' });
    const usage = makeUsage();
    const scope = makeScope(['docs/']);
    const result = resolveTaskModel('Massive architecture documentation', 'Write docs', scope, config, usage);
    expect(result).toBe('sonnet');
  });

  it('returns sonnet for tmp-test/ scope task', () => {
    const config = makeConfig({ mode: 'max_plan' });
    const usage = makeUsage();
    const scope = makeScope(['tmp-test/']);
    const result = resolveTaskModel('Run tmp test migration', 'Some test migration', scope, config, usage);
    expect(result).toBe('sonnet');
  });

  it('returns sonnet for scripts/ scope task', () => {
    const config = makeConfig({ mode: 'max_plan' });
    const usage = makeUsage();
    const scope = makeScope(['scripts/']);
    const result = resolveTaskModel('Update build script', 'Update build pipeline', scope, config, usage);
    expect(result).toBe('sonnet');
  });

  it('returns sonnet for test-only filesWrite', () => {
    const config = makeConfig({ mode: 'max_plan' });
    const usage = makeUsage();
    const scope = makeScope(['tests/'], ['tests/unit.test.ts', 'tests/integration.test.ts']);
    const result = resolveTaskModel('Write unit tests', 'Unit and integration tests', scope, config, usage);
    expect(result).toBe('sonnet');
  });

  // Layer ordering: plan filter > usage > task type > score
  it('pro plan takes priority over usage pressure (both give sonnet)', () => {
    const config = makeConfig({ mode: 'pro_plan' });
    const usage = makeUsage({ fiveHourPercent: 90 });
    const scope = makeScope(['src/orchestra/', 'src/core/']);
    const result = resolveTaskModel('Cross-module refactor', 'Big refactor', scope, config, usage);
    expect(result).toBe('sonnet'); // both pro plan and usage pressure result in sonnet
  });

  it('max plan with low usage and multi-dir scope returns opus', () => {
    const config = makeConfig({ mode: 'max_plan' });
    const usage = makeUsage({ fiveHourPercent: 5, weeklyPercent: 5 });
    // 3 directories → +3; architect keyword → +2; score=5 → opus
    const scope = makeScope(['src/orchestra/', 'src/core/', 'src/cli/']);
    const result = resolveTaskModel('Architect cross-cutting redesign', 'Migrate across modules', scope, config, usage);
    expect(result).toBe('opus');
  });

  it('max5x_plan behaves like max (allows opus)', () => {
    const config = makeConfig({ mode: 'max5x_plan' });
    const usage = makeUsage();
    const scope = makeScope(['src/orchestra/', 'src/core/']);
    const result = resolveTaskModel('Architect migration refactor', 'Cross-cutting refactor', scope, config, usage);
    expect(result).toBe('opus');
  });

  it('haiku_allowed=false + simple task that scores haiku → sonnet', () => {
    const config = makeConfig({
      mode: 'max_plan',
      activeModeConfig: {
        max_workers: 4,
        brain_model: 'opus',
        default_model: 'sonnet',
        haiku_allowed: false,
        usage_thresholds: { '5hr': 0.8, weekly: 0.9 },
      },
    });
    const usage = makeUsage();
    // Single-dir scope → -1; simple short task → score -1 → haiku; but haiku_allowed=false → sonnet
    const scope = makeScope(['src/cli/'], ['src/cli/small.ts']);
    const result = resolveTaskModel('Tiny fix', 'A tiny change', scope, config, usage);
    expect(result).toBe('sonnet');
  });
});

// ─── forceModel user override ───────────────────────────────────────

describe('resolveTaskModel — forceModel override', () => {
  const config = makeConfig();
  const usage = makeUsage();

  it('returns forceModel=opus directly, bypassing all layers', () => {
    // tmp-test scope would normally downgrade to sonnet
    const scope = makeScope(['tmp-test/']);
    const result = resolveTaskModel('Doc task', 'Write docs', scope, config, usage, undefined, 'opus');
    expect(result).toBe('opus');
  });

  it('returns forceModel=haiku even when haiku_allowed=false', () => {
    const scope = makeScope(['src/']);
    const result = resolveTaskModel('Simple fix', 'Fix typo', scope, config, usage, undefined, 'haiku');
    expect(result).toBe('haiku');
  });

  it('returns forceModel=sonnet without score calculation', () => {
    // High-complexity task would normally get opus
    const scope = makeScope(['src/', 'tests/', 'docs/'], Array.from({ length: 20 }, (_, i) => `f${i}.ts`));
    const result = resolveTaskModel('Architect redesign', 'Major refactor', scope, config, usage, undefined, 'sonnet');
    expect(result).toBe('sonnet');
  });

  it('undefined forceModel uses normal auto-selection', () => {
    const scope = makeScope(['src/', 'tests/']);
    const result = resolveTaskModel('Big architect redesign task', 'Cross-cutting refactor', scope, config, usage, undefined, undefined);
    // Should be opus (high score from keywords + multi-dir)
    expect(result).toBe('opus');
  });
});
