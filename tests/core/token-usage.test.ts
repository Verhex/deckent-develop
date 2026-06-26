import { describe, it, expect } from 'vitest';
import {
  normalizeUsage,
  type TokenUsage,
  type TokenUsageSource,
} from '../../src/core/token-usage.js';

describe('normalizeUsage', () => {
  it('fills totalTokens as input+output and defaults source to provider-adapter (goNogo)', () => {
    const usage = normalizeUsage({ inputTokens: 10, outputTokens: 5 });
    expect(usage.totalTokens).toBe(15);
    expect(usage.source).toBe<TokenUsageSource>('provider-adapter');
    expect(usage.cacheReadTokens).toBe(0);
    expect(usage.cacheCreationTokens).toBe(0);
    expect(usage.inputTokens).toBe(10);
    expect(usage.outputTokens).toBe(5);
  });

  it('defaults every numeric field to 0 for an empty input', () => {
    const usage = normalizeUsage({});
    expect(usage).toEqual<TokenUsage>({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      totalTokens: 0,
      source: 'provider-adapter',
    });
  });

  it('defaults every numeric field to 0 when called with no argument', () => {
    const usage = normalizeUsage();
    expect(usage.totalTokens).toBe(0);
    expect(usage.source).toBe('provider-adapter');
  });

  it('preserves cache read/creation tokens', () => {
    const usage = normalizeUsage({
      inputTokens: 100,
      outputTokens: 40,
      cacheReadTokens: 800,
      cacheCreationTokens: 64,
    });
    expect(usage.cacheReadTokens).toBe(800);
    expect(usage.cacheCreationTokens).toBe(64);
    // total is input+output — cache tokens are a subset of input, not double-counted
    expect(usage.totalTokens).toBe(140);
  });

  it('honors an explicitly provided totalTokens (provider total may exceed input+output)', () => {
    const usage = normalizeUsage({ inputTokens: 10, outputTokens: 5, totalTokens: 21 });
    expect(usage.totalTokens).toBe(21);
  });

  it('allows the source to be overridden to tokenizer-fallback', () => {
    const usage = normalizeUsage({ inputTokens: 7, outputTokens: 3, source: 'tokenizer-fallback' });
    expect(usage.source).toBe<TokenUsageSource>('tokenizer-fallback');
  });

  it('clamps negative and non-finite values to 0', () => {
    const usage = normalizeUsage({
      inputTokens: -5,
      outputTokens: Number.NaN,
      cacheReadTokens: -1,
      cacheCreationTokens: Number.POSITIVE_INFINITY,
      totalTokens: -100,
    });
    expect(usage.inputTokens).toBe(0);
    expect(usage.outputTokens).toBe(0);
    expect(usage.cacheReadTokens).toBe(0);
    expect(usage.cacheCreationTokens).toBe(0);
    expect(usage.totalTokens).toBe(0);
  });

  it('floors fractional token counts to integers', () => {
    const usage = normalizeUsage({ inputTokens: 10.9, outputTokens: 5.4 });
    expect(usage.inputTokens).toBe(10);
    expect(usage.outputTokens).toBe(5);
    expect(usage.totalTokens).toBe(15);
  });
});
