import { describe, expect, it } from 'vitest';

import {
  aggregateProviderBillingEvidence,
  extractProviderBillingEvidence,
  reconcileProviderBilling,
} from '../../src/core/provider-billing-evidence.js';
import { DeckentError } from '../../src/core/errors.js';

describe('provider billing evidence', () => {
  it('captures the provider-final total and normalized per-model usage', () => {
    const raw = [
      'provider stderr noise',
      JSON.stringify({
        type: 'result',
        total_cost_usd: 19.57630525,
        modelUsage: {
          'claude-sonnet-5': {
            inputTokens: 9853,
            outputTokens: 100804,
            cacheReadInputTokens: 29598013,
            cacheCreationInputTokens: 352211,
            costUSD: 19.56969025,
            contextWindow: 200000,
          },
          'claude-haiku-4-5': { inputTokens: 100, outputTokens: 20, costUSD: 0.006615 },
        },
      }),
    ].join('\n');

    const evidence = extractProviderBillingEvidence('claude', raw, '2026-07-20T00:00:00.000Z');

    expect(evidence).toEqual({
      source: 'provider-envelope',
      provider: 'claude',
      currency: 'USD',
      providerReportedUsd: 19.57630525,
      capturedAt: '2026-07-20T00:00:00.000Z',
      modelUsage: {
        'claude-sonnet-5': {
          inputTokens: 9853,
          outputTokens: 100804,
          cacheReadTokens: 29598013,
          cacheCreationTokens: 352211,
          costUsd: 19.56969025,
          contextWindow: 200000,
        },
        'claude-haiku-4-5': { inputTokens: 100, outputTokens: 20, costUsd: 0.006615 },
      },
    });
  });

  it('keeps the last billed envelope and ignores usage-only events', () => {
    const raw = [
      JSON.stringify({ type: 'assistant', usage: { input_tokens: 1 } }),
      JSON.stringify({ type: 'result', total_cost_usd: 2, modelUsage: {} }),
      JSON.stringify({ type: 'result', total_cost_usd: 3, modelUsage: {} }),
    ].join('\n');
    expect(extractProviderBillingEvidence('claude', raw)?.providerReportedUsd).toBe(3);
  });

  it('unwraps the canonical host-written usage LogEvent used by Docker capture', () => {
    const raw = [
      JSON.stringify({
        ts: '2026-07-20T08:20:32.168Z',
        seq: 1,
        type: 'tool_use',
        content: { total_cost_usd: 0.000001 },
      }),
      JSON.stringify({
        ts: '2026-07-20T08:20:32.194Z',
        seq: 909,
        type: 'usage',
        content: {
          type: 'result',
          total_cost_usd: 19.57630525,
          modelUsage: {
            'claude-sonnet-5': { costUSD: 19.56969025 },
          },
        },
      }),
    ].join('\n');

    const evidence = extractProviderBillingEvidence('claude', raw);
    expect(evidence?.providerReportedUsd).toBe(19.57630525);
    expect(evidence?.modelUsage['claude-sonnet-5']?.costUsd).toBe(19.56969025);
  });

  it('does not trust arbitrary nested billing-looking content', () => {
    expect(extractProviderBillingEvidence('claude', JSON.stringify({
      type: 'text',
      content: { total_cost_usd: 0.000001 },
    }))).toBeNull();
    expect(extractProviderBillingEvidence('claude', JSON.stringify({
      type: 'usage',
      content: { total_cost_usd: 0.000001 },
    }))).toBeNull();
  });

  it('marks the Sprint-455 local/provider gap as variance', () => {
    const evidence = extractProviderBillingEvidence(
      'claude', JSON.stringify({ type: 'result', total_cost_usd: 19.57630525 }),
    )!;
    const result = reconcileProviderBilling(evidence, 11.74181415);
    expect(result.state).toBe('variance');
    expect(result.relativeVariance).toBeGreaterThan(0.39);
    expect(result.threshold).toBe(0.15);
  });

  it('rejects malformed or negative provider totals', () => {
    expect(extractProviderBillingEvidence('claude', '{bad')).toBeNull();
    expect(extractProviderBillingEvidence('claude', JSON.stringify({ total_cost_usd: -1 }))).toBeNull();
  });

  it('aggregates exact-attempt envelopes and preserves lineage provenance', () => {
    const parent = extractProviderBillingEvidence('claude', JSON.stringify({
      type: 'result',
      total_cost_usd: 0.4,
      modelUsage: {
        'claude-fable-5': {
          inputTokens: 100,
          outputTokens: 20,
          cacheReadInputTokens: 500,
          cacheCreationInputTokens: 50,
          costUSD: 0.39,
          contextWindow: 1000,
        },
      },
    }))!;
    const continuation = extractProviderBillingEvidence('claude', JSON.stringify({
      type: 'result',
      total_cost_usd: 0.15,
      modelUsage: {
        'claude-fable-5': {
          inputTokens: 30,
          outputTokens: 10,
          cacheReadInputTokens: 100,
          cacheCreationInputTokens: 20,
          costUSD: 0.14,
          contextWindow: 800,
        },
        'claude-haiku-4-5': {
          inputTokens: 5,
          outputTokens: 1,
          costUSD: 0.01,
          contextWindow: 200000,
        },
      },
    }))!;

    expect(aggregateProviderBillingEvidence([
      { attemptId: 'parent', evidenceRef: 'parent-log:sha256:a', billing: parent },
      { attemptId: 'continuation', evidenceRef: 'terminal-log:sha256:b', billing: continuation },
    ], '2026-07-24T00:00:00.000Z')).toEqual({
      source: 'provider-envelope',
      provider: 'claude',
      currency: 'USD',
      providerReportedUsd: 0.55,
      capturedAt: '2026-07-24T00:00:00.000Z',
      modelUsage: {
        'claude-fable-5': {
          inputTokens: 130,
          outputTokens: 30,
          cacheReadTokens: 600,
          cacheCreationTokens: 70,
          costUsd: 0.53,
          contextWindow: 1000,
        },
        'claude-haiku-4-5': {
          inputTokens: 5,
          outputTokens: 1,
          costUsd: 0.01,
          contextWindow: 200000,
        },
      },
      lineage: {
        coverage: 'complete',
        attemptIds: ['parent', 'continuation'],
        evidenceRefs: ['parent-log:sha256:a', 'terminal-log:sha256:b'],
      },
    });
  });

  it('rejects duplicate attempts and cross-provider aggregation', () => {
    const claude = extractProviderBillingEvidence(
      'claude',
      JSON.stringify({ type: 'result', total_cost_usd: 1 }),
    )!;
    const codex = extractProviderBillingEvidence(
      'codex',
      JSON.stringify({ type: 'result', total_cost_usd: 2 }),
    )!;

    const duplicate = () => aggregateProviderBillingEvidence([
      { attemptId: 'same', evidenceRef: 'a', billing: claude },
      { attemptId: 'same', evidenceRef: 'b', billing: claude },
    ]);
    expect(duplicate).toThrow(/Duplicate provider billing attempt/);
    try {
      duplicate();
      expect.unreachable('duplicate attempt must fail closed');
    } catch (error) {
      expect(error).toBeInstanceOf(DeckentError);
      expect((error as DeckentError).code).toBe('DECKENT_E077');
    }

    const crossProvider = () => aggregateProviderBillingEvidence([
      { attemptId: 'parent', evidenceRef: 'a', billing: claude },
      { attemptId: 'continuation', evidenceRef: 'b', billing: codex },
    ]);
    expect(crossProvider).toThrow(/cannot cross provider or currency/);
    try {
      crossProvider();
      expect.unreachable('cross-provider aggregation must fail closed');
    } catch (error) {
      expect(error).toBeInstanceOf(DeckentError);
      expect((error as DeckentError).code).toBe('DECKENT_E077');
    }
  });
});
