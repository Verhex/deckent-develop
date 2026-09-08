import { describe, expect, it } from 'vitest';

import { createProviderTerminalUsageEvidence } from '../../src/core/provider-terminal-usage-evidence.js';

describe('provider terminal usage evidence', () => {
  it('binds adapter-normalized Codex usage without repricing or double-counting reasoning', () => {
    expect(createProviderTerminalUsageEvidence({
      provider: 'codex',
      model: 'gpt-5.6-terra',
      capturedAt: '2026-09-05T09:01:26.249Z',
      usage: {
        inputTokens: 113_286 - 92_928,
        outputTokens: 4_209,
        cacheReadTokens: 92_928,
        cacheCreationTokens: 0,
        totalTokens: 117_495,
        reasoningTokens: 1_637,
        source: 'provider-adapter',
      },
    })).toEqual({
      source: 'provider-adapter',
      provider: 'codex',
      model: 'gpt-5.6-terra',
      inputTokens: 20_358,
      outputTokens: 4_209,
      cacheReadTokens: 92_928,
      cacheCreationTokens: 0,
      totalTokens: 117_495,
      reasoningTokens: 1_637,
      capturedAt: '2026-09-05T09:01:26.249Z',
    });
  });

  it('rejects estimates, unsafe counters and inconsistent totals', () => {
    const base = {
      provider: 'codex', model: 'gpt-5.6-terra', capturedAt: '2026-09-05T09:01:26.249Z',
      usage: {
        inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheCreationTokens: 4,
        totalTokens: 10, source: 'provider-adapter' as const,
      },
    };
    expect(() => createProviderTerminalUsageEvidence({
      ...base, usage: { ...base.usage, source: 'tokenizer-fallback' as const },
    })).toThrow(/provider-adapter/);
    expect(() => createProviderTerminalUsageEvidence({
      ...base, usage: { ...base.usage, inputTokens: Number.MAX_SAFE_INTEGER + 1 },
    })).toThrow(/safe non-negative integer/);
    expect(() => createProviderTerminalUsageEvidence({
      ...base, usage: { ...base.usage, totalTokens: 11 },
    })).toThrow(/totalTokens/);
  });
});
