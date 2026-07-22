import { describe, it, expect, vi } from 'vitest';
import { BUILTIN_MODELS, type ModelDefinition } from '../../src/core/model-registry.js';
import {
  loadBundledClaudePricing,
  resolveSsotForModel,
  detectTariffDrift,
  tariffDrifts,
  buildCostLedger,
  detectCostVariance,
  formatCostVarianceAlert,
  warnOnCostVariance,
  reconcileLedgerAgainstProvider,
  DEFAULT_COST_VARIANCE_THRESHOLD,
  type CostLedgerEntry,
} from '../../src/core/cost-ledger.js';
import {
  TokenCounter,
  PROMPT_FIXED_LOAD_TOTAL,
  PROMPT_FIXED_LOADS,
} from '../../src/core/token-counter.js';
import {
  computeSafeCoveragePercent,
  resolveTaskVsAttempt,
  computeFilesChangedAndCost,
} from '../../src/orchestra/sprint-reporter.js';
import type { CostConfig } from '../../src/core/cost-config-loader.js';

// Hermetic: build a CostConfig from the CHECKED-IN bundled SSOT only (never the
// gitignored .deckent/cost-config.json), so this test passes on a fresh checkout.
function bundledConfig(): CostConfig {
  return {
    _version: '1.0',
    providers: {
      anthropic: {
        enabled: true,
        billing_modes_supported: ['api'],
        default_billing_mode: 'api',
        models: loadBundledClaudePricing(),
      },
    },
    cost_limits: { sprint_max_usd: 100, daily_max_usd: 100 },
    update_config: { sources_priority: ['bundled'] },
  };
}

// ═══ KALEM 1 — TARIFF / CAPABILITY drift (evidence-referenced, hardcode-yamasız) ══

describe('TT554 K1 — tariff/capability drift vs cost SSOT', () => {
  const ssot = loadBundledClaudePricing();
  const drift = detectTariffDrift(BUILTIN_MODELS, ssot);
  const of = (model: string, field: string) =>
    drift.find(d => d.modelId === model && d.field === field)!;

  it('DISPROVES the "sonnet-5 3/15 → 5/25" premise: SSOT + registry agree at 3/15', () => {
    // The task claimed sonnet was under-priced (3/15, should be 5/25). Primary source
    // (bundled SSOT, _verified_at 2026-07-02) says 3/15 — so the registry is correct
    // and changing it would be the hardcode-without-evidence the nogo forbids.
    const sonnetSsot = resolveSsotForModel({ id: 'claude-sonnet-5', apiId: 'claude-sonnet-5' }, ssot)!;
    expect(sonnetSsot.pricing.input_cost_per_token * 1e6).toBeCloseTo(3, 6);
    expect(sonnetSsot.pricing.output_cost_per_token * 1e6).toBeCloseTo(15, 6);
    expect(of('claude-sonnet-5', 'inputCostPerMTok').drift).toBe(false);
    expect(of('claude-sonnet-5', 'outputCostPerMTok').drift).toBe(false);
  });

  it('RED→GREEN: opus maxOutputTokens drift is now FIXED (128K, was unset)', () => {
    // RED — pre-fix synthetic opus WITHOUT maxOutputTokens is flagged by the detector.
    const preFix: ModelDefinition[] = [
      { ...BUILTIN_MODELS.find(m => m.id === 'claude-opus-4-8')!, maxOutputTokens: undefined },
    ];
    const red = detectTariffDrift(preFix, ssot).find(d => d.field === 'maxOutputTokens')!;
    expect(red.drift).toBe(true);
    expect(red.ssotValue).toBe(128_000);

    // GREEN — the real (fixed) registry entry now matches the SSOT.
    expect(of('claude-opus-4-8', 'maxOutputTokens').registryValue).toBe(128_000);
    expect(of('claude-opus-4-8', 'maxOutputTokens').drift).toBe(false);
  });

  it('RED→GREEN: haiku maxOutputTokens drift is now FIXED (64K, was unset)', () => {
    const preFix: ModelDefinition[] = [
      { ...BUILTIN_MODELS.find(m => m.id === 'claude-haiku-4-5-20251001')!, maxOutputTokens: undefined },
    ];
    const red = detectTariffDrift(preFix, ssot).find(d => d.field === 'maxOutputTokens')!;
    expect(red.drift).toBe(true);
    expect(red.ssotValue).toBe(64_000);

    expect(of('claude-haiku-4-5-20251001', 'maxOutputTokens').registryValue).toBe(64_000);
    expect(of('claude-haiku-4-5-20251001', 'maxOutputTokens').drift).toBe(false);
  });

  it('SURFACES (not silences) the known haiku cost drift 0.8/4 vs SSOT 1/5', () => {
    // Deliberately NOT changed in the registry (would red the read-only
    // model-registry.test.ts:429). The detector proves it is caught, loudly.
    expect(of('claude-haiku-4-5-20251001', 'inputCostPerMTok').registryValue).toBe(0.8);
    expect(of('claude-haiku-4-5-20251001', 'inputCostPerMTok').ssotValue).toBeCloseTo(1, 6);
    expect(of('claude-haiku-4-5-20251001', 'inputCostPerMTok').drift).toBe(true);
    expect(of('claude-haiku-4-5-20251001', 'outputCostPerMTok').drift).toBe(true);
  });

  it('after the maxOut fix, the ONLY residual claude drift is the known haiku cost', () => {
    const drifts = tariffDrifts(BUILTIN_MODELS, ssot);
    // No capability (maxOut/ctx) drift survives — that was the RED→GREEN flip.
    expect(drifts.some(d => d.field === 'maxOutputTokens')).toBe(false);
    expect(drifts.some(d => d.field === 'contextWindow')).toBe(false);
    // Everything left is haiku cost, and only haiku cost.
    expect(drifts.every(d => d.modelId === 'claude-haiku-4-5-20251001' && d.field.endsWith('CostPerMTok'))).toBe(true);
    expect(drifts).toHaveLength(2);
  });
});

// ═══ KALEM 2 — provider modelUsage → ledger bridge + LOCAL-vs-PROVIDER variance ══

describe('TT554 K2 — cost-ledger bridge + variance alert', () => {
  it('prices EVERY entry incl off-task helper calls (haiku helper on-ledger)', () => {
    const entries: CostLedgerEntry[] = [
      { model: 'claude-sonnet-5', usage: { inputTokens: 1_000_000, outputTokens: 100_000 }, kind: 'task' },
      { model: 'claude-haiku-4-5-20251001', usage: { inputTokens: 50_000, outputTokens: 5_000 }, kind: 'helper' },
    ];
    const ledger = buildCostLedger(entries, bundledConfig(), 'claude');
    // sonnet 1M*$3 + 100k*$15 = 4.5 ; haiku 50k*$1 + 5k*$5 = 0.075 (SSOT rates)
    expect(ledger.totalUsd).toBeCloseTo(4.575, 4);
    expect(ledger.unpricedCount).toBe(0);
    const helper = ledger.rows.find(r => r.kind === 'helper')!;
    expect(helper.usd).toBeGreaterThan(0); // the haiku helper is NOT off-ledger
    expect(helper.model).toBe('claude-haiku-4-5-20251001');
  });

  it('detects the 413-002/003 under-count (provider $8.48 vs ledger $5.08 = ~40%)', () => {
    const report = detectCostVariance(5.08, 8.48);
    expect(report.variance).toBeCloseTo(0.4009, 3);
    expect(report.exceeded).toBe(true);
    expect(formatCostVarianceAlert(report)).toContain('UNDER-counted');
    expect(formatCostVarianceAlert(report)).toContain('COST-VARIANCE');
  });

  it('LOUD-warns on drift and stays silent within tolerance (variance sessiz kalmaz)', () => {
    const loud = vi.fn();
    expect(warnOnCostVariance(detectCostVariance(5.08, 8.48), loud)).toBe(true);
    expect(loud).toHaveBeenCalledTimes(1);

    const quiet = vi.fn();
    const within = detectCostVariance(8.40, 8.48); // ~0.9% gap, under 15%
    expect(within.exceeded).toBe(false);
    expect(warnOnCostVariance(within, quiet)).toBe(false);
    expect(quiet).not.toHaveBeenCalled();
    expect(formatCostVarianceAlert(within)).toBe('');
  });

  it('reconcile ties the bridge under-count to a loud alert', () => {
    const log = vi.fn();
    const entries: CostLedgerEntry[] = [
      { model: 'claude-sonnet-5', usage: { inputTokens: 1_000_000, outputTokens: 100_000 } },
      { model: 'claude-haiku-4-5-20251001', usage: { inputTokens: 50_000, outputTokens: 5_000 }, kind: 'helper' },
    ];
    const { ledger, variance, warned } = reconcileLedgerAgainstProvider(
      entries,
      8.48, // provider envelope total >> local $4.575
      bundledConfig(),
      { log },
    );
    expect(ledger.totalUsd).toBeCloseTo(4.575, 4);
    expect(variance.exceeded).toBe(true);
    expect(warned).toBe(true);
    expect(log).toHaveBeenCalledTimes(1);
    expect(DEFAULT_COST_VARIANCE_THRESHOLD).toBe(0.15);
  });
});

// ═══ KALEM 3 — component-aware estimator (chars/4 → fixed-load-aware) ═════════

describe('TT554 K3 — component-aware prompt estimator', () => {
  const counter = new TokenCounter();

  it('RED→GREEN: naive visible-only estimate is 8–10× low; fixed loads close the gap', () => {
    // ~1500 words → naive countTokens = ceil(1500/0.75) = 2000 (representative body).
    const text = 'word '.repeat(1500).trim();
    const naive = counter.countTokens(text);
    expect(naive).toBe(2000);

    const est = counter.estimateWorkerPromptTokens(text);
    // RED: the naive estimate omits the fixed loads → runs badly low.
    const ratio = est.totalTokens / naive;
    expect(ratio).toBeGreaterThanOrEqual(8); // 418 trace-audit: 8–10× low
    expect(ratio).toBeLessThanOrEqual(11);
    // GREEN: the fixed loads (system prompt + tool schema + connector) are counted.
    expect(est.fixedLoadTokens).toBe(PROMPT_FIXED_LOAD_TOTAL);
    expect(est.breakdown.systemPrompt).toBe(PROMPT_FIXED_LOADS.systemPrompt);
  });

  it('fixed loads dominate a small task (the whole point of the under-count)', () => {
    const est = counter.estimateWorkerPromptTokens('Add a login page with OAuth');
    // Even a tiny task carries the full fixed load — never estimated near-zero.
    expect(est.totalTokens).toBeGreaterThanOrEqual(PROMPT_FIXED_LOAD_TOTAL);
    expect(est.fixedLoadTokens).toBeGreaterThan(est.visibleTokens);
  });
});

// ═══ KALEM 4 — reporter: coverage-NaN + attempt-vs-task ══════════════════════

describe('TT554 K4 — reporter truth guards', () => {
  it('RED→GREEN: coverage average never NaN when a result lacks coverage', () => {
    const results = [{ coverage: 80 }, { coverage: undefined }, { coverage: 90 }];
    // RED: the live formula (sum / length, guard only on length) yields NaN.
    const naive = results.reduce((s, r) => s + (r.coverage as number), 0) / results.length;
    expect(Number.isNaN(naive)).toBe(true);
    // GREEN: the guard skips the missing value → finite average of the valid ones.
    expect(computeSafeCoveragePercent(results)).toBe(85);
  });

  it('coverage guard returns 0 (not NaN) when no result has finite coverage', () => {
    const r = computeSafeCoveragePercent([{ coverage: undefined }, { coverage: NaN }]);
    expect(Number.isNaN(r)).toBe(false);
    expect(r).toBe(0);
  });

  it('RED→GREEN: distinguishes 5-attempt / 4-task instead of conflating to 5', () => {
    // RED: the live path is Math.max(tasks, evaluations.size) → prints 5 tasks.
    expect(Math.max(4, 5)).toBe(5);
    // GREEN: distinct task count stays 4; attempts is the retry-swollen count.
    const counts = resolveTaskVsAttempt(4, 5, 5);
    expect(counts.tasks).toBe(4);
    expect(counts.attempts).toBe(5);
  });

  it('RED→GREEN: surfaces REAL files-changed/cost fields, not 0-placeholders', () => {
    const results = [
      { filesChanged: ['a.ts', 'b.ts'], linesAdded: 10, linesRemoved: 2, cost: { usd: 0.5 } },
      { filesChanged: ['b.ts', 'c.ts'], linesAdded: 5, linesRemoved: 1, cost: { usd: 0.25 } },
      { filesChanged: undefined, linesAdded: NaN, cost: undefined }, // missing/NaN → skipped
    ];
    // RED: the live metrics carry hardcoded-0 placeholders (crossAssignments/contextLinesUsed=0).
    const placeholder = 0;
    const s = computeFilesChangedAndCost(results);
    // GREEN: real ground-truth aggregation — distinct files (b.ts counted once), summed cost.
    expect(s.filesChanged).toBe(3); // a, b, c — deduped
    expect(s.linesAdded).toBe(15);
    expect(s.linesRemoved).toBe(3);
    expect(s.costUsd).toBeCloseTo(0.75, 6);
    expect(s.filesChanged).toBeGreaterThan(placeholder);
    expect(Number.isNaN(s.linesAdded)).toBe(false); // NaN result skipped, never poisons the sum
  });
});
