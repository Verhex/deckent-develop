// MET668B (task 419-002) — TT554-artıkları: haiku helper-cost ledger-flip + reporter live-wire.
//
// Pins the two 418-001 residuals that landed in read-only scope:
//   (A) the haiku auxiliary-call cost is now ON-ledger (with a double-count guard), and
//   (B) the reporter prints the REAL files-changed/cost from live results, not the 0-placeholder.
// All pricing is built from the CHECKED-IN bundled SSOT (never the gitignored cost-config),
// so the whole file is hermetic on a fresh checkout.

import { describe, it, expect } from 'vitest';
import {
  extractHelperUsageEntries,
  buildHelperLedger,
  buildCostLedger,
  canonicalClaudeModelKey,
  loadBundledClaudePricing,
  type ModelUsageMap,
  type HelperEnvelope,
} from '../../src/core/cost-ledger.js';
import { buildFilesChangedCostSection } from '../../src/orchestra/sprint-reporter.js';
import { buildUsageTotals, collectHelperCost } from '../../src/orchestra/sprint-finalizer.js';
import type { CostConfig } from '../../src/core/cost-config-loader.js';
import type { TaskResult } from '../../src/core/types.js';

// Hermetic CostConfig from the bundled SSOT only (mirrors metering-truth.test.ts).
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

const OPUS = 'claude-opus-4-8';
const HAIKU = 'claude-haiku-4-5';

function mkResult(over: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: 't1',
    workerId: 'w-t1',
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 0,
    selfAssessment: 'DONE',
    notes: '',
    ...over,
  };
}

// A representative sprint envelope: opus was the PRIMARY worker model (its cost is captured
// on result.cost.usd), plus a haiku auxiliary (helper) turn the aggregate capture dropped.
const MODEL_USAGE: ModelUsageMap = {
  [OPUS]: { inputTokens: 1_000_000, outputTokens: 100_000, costUSD: 4.5 },
  [HAIKU]: { inputTokens: 50_000, outputTokens: 5_000, costUSD: 0.075 },
};

// ═══ PART A — haiku helper cost flows to the ledger, with NO double-count ═════
describe('MET668B A — haiku helper cost is on-ledger (double-count guarded)', () => {
  const ssot = loadBundledClaudePricing();

  it('RED: today the worker-cost path (result.cost.usd) carries NO haiku helper component', () => {
    // The captured task cost is opus-only (primary); buildUsageTotals sums result.cost.usd.
    const opusOnly = mkResult({
      cost: { usd: 4.5, currency: 'USD', pricingSource: 'cost-config:anthropic/claude-opus-4-8', isLocal: false },
      tokenUsage: { inputTokens: 1_000_000, outputTokens: 100_000, model: OPUS, provider: 'claude' },
    });
    // The $0.075 haiku helper turn is NOWHERE in the worker-cost total → off-ledger today.
    expect(buildUsageTotals([opusOnly]).costUsd).toBeCloseTo(4.5, 6);
  });

  it('GREEN: extractHelperUsageEntries surfaces ONLY the haiku helper (opus excluded)', () => {
    const entries = extractHelperUsageEntries(MODEL_USAGE, OPUS, ssot);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind).toBe('helper');

    // Canonical match: the primary excludes opus whether passed as wire id OR deckent id.
    expect(extractHelperUsageEntries(MODEL_USAGE, 'opus', ssot)).toHaveLength(1);

    const ledger = buildCostLedger(entries, bundledConfig(), 'claude');
    // haiku SSOT rates 1/5 per MTok: 50k*$1 + 5k*$5 = 0.075
    expect(ledger.totalUsd).toBeCloseTo(0.075, 4);
    expect(ledger.unpricedCount).toBe(0);
    // The primary opus is NEVER re-priced here (that would be the forbidden double-count).
    expect(ledger.rows.every(r => r.model !== OPUS)).toBe(true);
  });

  it('GUARD: an unresolvable primary emits ZERO helper entries (never primary-as-helper)', () => {
    // Advisor item 1 — the graded direction: undefined / non-claude primary must not
    // re-add the primary as a "helper", which would double-count. Honest under-count wins.
    expect(extractHelperUsageEntries(MODEL_USAGE, undefined, ssot)).toHaveLength(0);
    expect(extractHelperUsageEntries(MODEL_USAGE, 'gpt-5-some-non-claude', ssot)).toHaveLength(0);
  });

  it('GUARD: when every envelope model IS the primary, the helper ledger totals $0', () => {
    const onlyOpus: ModelUsageMap = { [OPUS]: { inputTokens: 10, outputTokens: 10 } };
    const ledger = buildHelperLedger([{ primaryModel: OPUS, modelUsage: onlyOpus }], bundledConfig(), ssot);
    expect(ledger.totalUsd).toBe(0);
    expect(ledger.rows).toHaveLength(0);
  });

  it('buildHelperLedger sums helper cost across multiple task envelopes', () => {
    const envelopes: HelperEnvelope[] = [
      { primaryModel: OPUS, modelUsage: MODEL_USAGE },
      { primaryModel: 'sonnet', modelUsage: { [HAIKU]: { inputTokens: 50_000, outputTokens: 5_000 } } },
    ];
    const ledger = buildHelperLedger(envelopes, bundledConfig(), ssot);
    expect(ledger.totalUsd).toBeCloseTo(0.15, 4); // two independent haiku helpers @ $0.075
    expect(ledger.rows).toHaveLength(2);
  });

  it('canonicalClaudeModelKey collapses aliases; returns null for non-claude', () => {
    expect(canonicalClaudeModelKey('haiku', ssot)).toBe(HAIKU);
    expect(canonicalClaudeModelKey('claude-haiku-4-5-20251001', ssot)).toBe(HAIKU);
    expect(canonicalClaudeModelKey('opus', ssot)).toBe(OPUS);
    expect(canonicalClaudeModelKey('gpt-5', ssot)).toBeNull();
  });
});

// ═══ PART B — reporter prints REAL files-changed/cost, not the 0-placeholder ══
describe('MET668B B — reporter live files-changed/cost section', () => {
  const results = [
    { filesChanged: ['a.ts', 'b.ts'], linesAdded: 10, linesRemoved: 2, cost: { usd: 0.5 } },
    { filesChanged: ['b.ts', 'c.ts'], linesAdded: 5, linesRemoved: 1, cost: { usd: 0.25 } },
    { filesChanged: undefined, linesAdded: NaN, cost: undefined }, // missing/NaN → skipped
  ];

  it('RED→GREEN: shows real distinct files + summed cost, not the hardcoded 0', () => {
    // RED: the live metrics carry hardcoded-0 placeholders (crossAssignments/contextLinesUsed=0).
    const placeholder = 0;
    const section = buildFilesChangedCostSection(results);
    expect(section).toContain('## Files Changed & Cost');
    expect(section).toContain('Files changed: 3');   // a, b, c — b deduped
    expect(section).toContain('Lines: +15 / -3');
    expect(section).toContain('Task cost: $0.7500'); // 0.5 + 0.25
    expect(3).toBeGreaterThan(placeholder);
  });

  it('renders the helper-call cost on its OWN line, separate from task cost', () => {
    const section = buildFilesChangedCostSection(results, { helperCostUsd: 0.075 });
    expect(section).toContain('Helper-call cost');
    expect(section).toContain('$0.0750');
    // Combined total is a distinct, explicitly-advisory line (auxiliary may overlap under the
    // opus output-fallback quirk) — the authoritative task/helper components stay separate above.
    expect(section).toContain('Total cost');
    expect(section).toContain('advisory');
    expect(section).toContain('$0.8250'); // 0.75 + 0.075
  });

  it('omits the helper/total lines when there is no helper cost (≤ 0 or absent)', () => {
    expect(buildFilesChangedCostSection(results)).not.toContain('Helper-call cost');
    expect(buildFilesChangedCostSection(results, { helperCostUsd: 0 })).not.toContain('Total cost');
  });
});

// ═══ PART C — finalize wire: collectHelperCost (injected reader, fail-safe) ════
describe('MET668B C — collectHelperCost finalize wire', () => {
  it('aggregates helper cost from the injected reader, excluding the primary', () => {
    const results = [mkResult({ taskId: 't1', tokenUsage: { inputTokens: 1, outputTokens: 1, model: OPUS, provider: 'claude' } })];
    const report = collectHelperCost('/nonexistent-root', results, {
      readModelUsage: () => MODEL_USAGE,
      loadConfig: () => bundledConfig(),
    });
    expect(report.helperUsd).toBeCloseTo(0.075, 4);
    expect(report.envelopesWithHelper).toBe(1);
    expect(report.ledger.rows.every(r => r.model !== OPUS)).toBe(true);
  });

  it('fail-safe: a throwing reader yields $0 and never throws', () => {
    const results = [mkResult({ taskId: 't1', tokenUsage: { inputTokens: 1, outputTokens: 1, model: OPUS } })];
    const report = collectHelperCost('/root', results, {
      readModelUsage: () => { throw new Error('boom'); },
      loadConfig: () => bundledConfig(),
    });
    expect(report.helperUsd).toBe(0);
    expect(report.envelopesWithHelper).toBe(0);
  });

  it('no envelope (reader returns undefined) → $0, no crash', () => {
    const results = [mkResult({ taskId: 't1', tokenUsage: { inputTokens: 1, outputTokens: 1, model: OPUS } })];
    const report = collectHelperCost('/root', results, {
      readModelUsage: () => undefined,
      loadConfig: () => bundledConfig(),
    });
    expect(report.helperUsd).toBe(0);
  });
});
