import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { enrichResultCost } from '../../src/orchestra/result-collector.js';
import type { TaskResult } from '../../src/core/task-types.js';

// Worker Output Contract — Step 2 wiring: a monetary `cost` on every result,
// computed orchestrator-side from the captured tokenUsage + per-model pricing.
// loadCostConfig falls back to the bundled baseline, so no config file is needed.
function makeResult(tokenUsage?: TaskResult['tokenUsage']): TaskResult {
  return {
    taskId: 'T1',
    workerId: 'w1',
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 0,
    selfAssessment: 'DONE',
    notes: '',
    tokenUsage,
  } as TaskResult;
}

describe('enrichResultCost — cost in every result', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs.length = 0;
  });
  function root(): string {
    const d = mkdtempSync(join(tmpdir(), 'cost-enrich-'));
    dirs.push(d);
    return d;
  }

  it('paid provider/model → cost.usd > 0 (real per-model pricing)', () => {
    const r = makeResult({
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      provider: 'claude' as never,
      model: 'claude-opus-4-6' as never,
    });
    enrichResultCost(r, undefined, root());
    expect(r.cost).toBeDefined();
    expect(typeof r.cost!.usd).toBe('number');
    expect(r.cost!.usd).toBeGreaterThan(0);
    expect(r.cost!.isLocal).toBe(false);
  });

  it('cache-creation tokens are priced into cost (G6 — limit-dominant cache-write)', () => {
    const withCacheWrite = makeResult({
      inputTokens: 100_000,
      cacheCreationTokens: 1_000_000, // 1M cache-write ≈ 1.25×$5 = $6.25
      provider: 'claude' as never,
      model: 'claude-opus-4-6' as never,
    });
    const withoutCacheWrite = makeResult({
      inputTokens: 100_000,
      provider: 'claude' as never,
      model: 'claude-opus-4-6' as never,
    });
    enrichResultCost(withCacheWrite, undefined, root());
    enrichResultCost(withoutCacheWrite, undefined, root());
    // Pre-G6 enrichResultCost dropped cacheCreationTokens → the two costs were EQUAL.
    // After the fix the cache-write is priced in → the cache-writing run costs strictly more.
    expect(withCacheWrite.cost!.usd).toBeGreaterThan(withoutCacheWrite.cost!.usd);
  });

  it('local/ollama usage → cost set with usd 0 and isLocal true', () => {
    const r = makeResult({
      inputTokens: 1000,
      outputTokens: 500,
      provider: 'ollama' as never,
      model: 'qwen2.5' as never,
    });
    enrichResultCost(r, undefined, root());
    expect(r.cost).toBeDefined();
    expect(r.cost!.usd).toBe(0);
    expect(r.cost!.isLocal).toBe(true);
  });

  it('no tokenUsage → no cost (no-op)', () => {
    const r = makeResult(undefined);
    enrichResultCost(r, undefined, root());
    expect(r.cost).toBeUndefined();
  });

  it('zero tokens → no cost (no-op)', () => {
    const r = makeResult({ inputTokens: 0, outputTokens: 0, provider: 'claude' as never, model: 'claude-opus-4-6' as never });
    enrichResultCost(r, undefined, root());
    expect(r.cost).toBeUndefined();
  });

  it('no projectRoot → no cost, never throws', () => {
    const r = makeResult({ inputTokens: 100, outputTokens: 50, provider: 'claude' as never, model: 'claude-opus-4-6' as never });
    expect(() => enrichResultCost(r, undefined, undefined)).not.toThrow();
    expect(r.cost).toBeUndefined();
  });

  it('uses provider-final billing as authoritative and preserves local variance evidence', () => {
    const projectRoot = root();
    mkdirSync(join(projectRoot, '.tasks'), { recursive: true });
    const r = makeResult({
      inputTokens: 9853,
      outputTokens: 100804,
      cacheReadTokens: 29598013,
      cacheCreationTokens: 352211,
      provider: 'claude' as never,
      model: 'claude-sonnet-5' as never,
    });
    writeFileSync(join(projectRoot, '.tasks', 'task-T1.log'), JSON.stringify({
      ts: '2026-07-20T08:20:32.194Z',
      seq: 909,
      type: 'usage',
      content: {
        type: 'result',
        total_cost_usd: 19.57630525,
        usage: {
          input_tokens: 9853,
          output_tokens: 100804,
          cache_read_input_tokens: 29598013,
          cache_creation_input_tokens: 352211,
        },
      },
    }), 'utf-8');

    enrichResultCost(r, undefined, projectRoot);

    expect(r.cost).toEqual({
      usd: 19.57630525,
      currency: 'USD',
      pricingSource: 'provider-envelope',
      isLocal: false,
    });
    expect(r.providerBilling?.reconciliation?.state).toBe('variance');
    expect(r.providerBilling?.reconciliation?.localEstimateUsd).not.toBe(19.57630525);
  });

  it('ignores worker-forged providerBilling when no provider log proves it', () => {
    const r = makeResult({
      inputTokens: 100_000,
      outputTokens: 10_000,
      provider: 'claude' as never,
      model: 'claude-sonnet-5' as never,
    });
    r.providerBilling = {
      source: 'provider-envelope',
      provider: 'claude',
      currency: 'USD',
      providerReportedUsd: 0.000001,
      modelUsage: {},
      capturedAt: '2026-07-20T00:00:00.000Z',
    };

    enrichResultCost(r, undefined, root());

    expect(r.providerBilling).toBeUndefined();
    expect(r.cost!.pricingSource).not.toBe('provider-envelope');
    expect(r.cost!.usd).toBeGreaterThan(0.000001);
  });

  it('does not let a zero provider total erase a nonzero paid-model estimate', () => {
    const projectRoot = root();
    mkdirSync(join(projectRoot, '.tasks'), { recursive: true });
    writeFileSync(join(projectRoot, '.tasks', 'task-T1.log'), JSON.stringify({
      type: 'result',
      total_cost_usd: 0,
      usage: { input_tokens: 100_000, output_tokens: 10_000 },
    }), 'utf-8');
    const r = makeResult({
      inputTokens: 100_000,
      outputTokens: 10_000,
      provider: 'claude' as never,
      model: 'claude-sonnet-5' as never,
    });

    enrichResultCost(r, undefined, projectRoot);

    expect(r.providerBilling?.providerReportedUsd).toBe(0);
    expect(r.cost!.pricingSource).not.toBe('provider-envelope');
    expect(r.cost!.usd).toBeGreaterThan(0);
  });
});
