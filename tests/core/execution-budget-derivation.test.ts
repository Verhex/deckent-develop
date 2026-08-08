// ═══ KN2 (GR-2026-08-08-DOGFOOD-KN2-01) — estimate-anchored budget derivation ═
// The request side of the budget ledger: per-task ceilings derive from the
// task's own estimator numbers × config-resolved headroom, capped by the sprint
// USD budget. ADR-G-036: every number in these pins flows from a config object
// built by the test — the production module carries no numeric fallback.
import { describe, it, expect } from 'vitest';
import {
  buildTaskCostInput,
  deriveRequestedExecutionBudget,
} from '../../src/core/execution-budget-derivation.js';
import { loadCostConfig, validateCostConfig, type EstimatorDefaults } from '../../src/core/cost-config-loader.js';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const estimator: EstimatorDefaults = {
  default_input_tokens: 2_000,
  output_tokens_by_effort: { low: 400, normal: 1_000, high: 3_000 },
  budget_headroom_factor: 2,
};

describe('buildTaskCostInput — config-resolved estimator defaults', () => {
  it('uses the task estimate when present, the config default when absent', () => {
    expect(buildTaskCostInput(
      { id: 't1', model: 'm', estimatedTokens: 5_000 }, estimator,
    ).estimatedInputTokens).toBe(5_000);
    expect(buildTaskCostInput(
      { id: 't2', model: 'm' }, estimator,
    ).estimatedInputTokens).toBe(2_000);
  });

  it('maps effort through the config table, defaulting to normal', () => {
    expect(buildTaskCostInput({ id: 't', model: 'm', effort: 'high' }, estimator).estimatedOutputTokens).toBe(3_000);
    expect(buildTaskCostInput({ id: 't', model: 'm', effort: 'low' }, estimator).estimatedOutputTokens).toBe(400);
    expect(buildTaskCostInput({ id: 't', model: 'm' }, estimator).estimatedOutputTokens).toBe(1_000);
  });
});

describe('deriveRequestedExecutionBudget', () => {
  it('scales input/output ceilings by retry × headroom — and NEVER derives aggregate maxTokens', () => {
    const b = deriveRequestedExecutionBudget({
      estimatedInputTokens: 1_000,
      estimatedOutputTokens: 500,
      retryMultiplier: 1.2,
      headroomFactor: 2,
    });
    expect(b.maxInputTokens).toBe(Math.ceil(1_000 * 1.2 * 2));
    expect(b.maxOutputTokens).toBe(Math.ceil(500 * 1.2 * 2));
    // KN5: maxTokens counts AGGREGATE usage (cache reads included) — a
    // cache-blind estimate must not manufacture that ceiling. Measured: an
    // honest worker was killed at 15,120 while consuming 42,126 aggregate.
    expect(b.maxTokens).toBeUndefined();
  });

  it('subscription-billed (USD 0 / absent) derives NO maxUsd — a 0-ceiling would block the task it contains', () => {
    const zero = deriveRequestedExecutionBudget({
      estimatedInputTokens: 100, estimatedOutputTokens: 100,
      estimatedCostUsd: 0, headroomFactor: 3,
    });
    expect(zero.maxUsd).toBeUndefined();
    expect(zero.maxInputTokens).toBeGreaterThan(0); // containment still present (unit-correct ceilings)
  });

  it('API-billed derives maxUsd, hard-capped by the sprint budget', () => {
    const uncapped = deriveRequestedExecutionBudget({
      estimatedInputTokens: 100, estimatedOutputTokens: 100,
      estimatedCostUsd: 0.5, retryMultiplier: 1, headroomFactor: 2, sprintMaxUsd: 5,
    });
    expect(uncapped.maxUsd).toBe(1); // 0.5 × 2
    const capped = deriveRequestedExecutionBudget({
      estimatedInputTokens: 100, estimatedOutputTokens: 100,
      estimatedCostUsd: 4, retryMultiplier: 1, headroomFactor: 2, sprintMaxUsd: 5,
    });
    expect(capped.maxUsd).toBe(5); // 8 → capped at the sprint budget
  });
});

// ═══ Estimator block resolution — the bundled baseline is the single source ═
describe('cost config — estimator resolution (ADR-G-036)', () => {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

  it('the bundled baseline itself carries the estimator block (data, not code)', () => {
    const baseline = JSON.parse(
      readFileSync(join(repoRoot, 'src/core/pricing-data-baseline.json'), 'utf-8'),
    ) as { estimator?: EstimatorDefaults };
    expect(baseline.estimator).toBeDefined();
    expect(baseline.estimator!.budget_headroom_factor).toBeGreaterThanOrEqual(1);
    expect(baseline.estimator!.output_tokens_by_effort.high).toBeGreaterThan(
      baseline.estimator!.output_tokens_by_effort.low,
    );
  });

  it('a project cost-config that PREDATES the block loads with the baseline values resolved in', () => {
    const root = mkdtempSync(join(tmpdir(), 'kn2-est-'));
    try {
      const baseline = JSON.parse(
        readFileSync(join(repoRoot, 'src/core/pricing-data-baseline.json'), 'utf-8'),
      ) as Record<string, unknown>;
      const legacy = { ...baseline };
      delete legacy['estimator']; // an older project file
      mkdirSync(join(root, '.deckent'), { recursive: true });
      writeFileSync(join(root, '.deckent', 'cost-config.json'), JSON.stringify(legacy));

      const loaded = loadCostConfig(root, { forceReload: true });
      expect(loaded.estimator).toEqual((baseline as { estimator: EstimatorDefaults }).estimator);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('a present-but-malformed estimator block fails CLOSED with a typed error', () => {
    const baseline = JSON.parse(
      readFileSync(join(repoRoot, 'src/core/pricing-data-baseline.json'), 'utf-8'),
    ) as Record<string, unknown>;
    const broken = { ...baseline, estimator: { default_input_tokens: -5 } };
    expect(() => validateCostConfig(broken)).toThrowError(/estimator\.default_input_tokens/u);
  });
});
