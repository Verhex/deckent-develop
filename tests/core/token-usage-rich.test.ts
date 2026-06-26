import { describe, it, expect } from 'vitest';
import { normalizeUsage, type TokenUsage } from '../../src/core/token-usage.js';

describe('normalizeUsage — rich provider-matrix fields', () => {
  // ── cacheWriteTokens ────────────────────────────────────────────────────

  it('includes cacheWriteTokens when provided (Anthropic cache_creation parity)', () => {
    const usage = normalizeUsage({ inputTokens: 100, outputTokens: 20, cacheWriteTokens: 500 });
    expect(usage.cacheWriteTokens).toBe(500);
  });

  it('clamps negative cacheWriteTokens to 0', () => {
    const usage = normalizeUsage({ cacheWriteTokens: -10 });
    expect(usage.cacheWriteTokens).toBe(0);
  });

  it('clamps NaN cacheWriteTokens to 0', () => {
    const usage = normalizeUsage({ cacheWriteTokens: Number.NaN });
    expect(usage.cacheWriteTokens).toBe(0);
  });

  it('floors fractional cacheWriteTokens to integer', () => {
    const usage = normalizeUsage({ cacheWriteTokens: 7.9 });
    expect(usage.cacheWriteTokens).toBe(7);
  });

  it('omits cacheWriteTokens from output when not provided (backward-compat sparse output)', () => {
    const usage = normalizeUsage({ inputTokens: 5, outputTokens: 3 });
    expect(Object.prototype.hasOwnProperty.call(usage, 'cacheWriteTokens')).toBe(false);
  });

  // ── reasoningTokens ─────────────────────────────────────────────────────

  it('includes reasoningTokens when provided (OpenAI o1/o3 reasoning)', () => {
    const usage = normalizeUsage({ inputTokens: 200, outputTokens: 50, reasoningTokens: 30 });
    expect(usage.reasoningTokens).toBe(30);
  });

  it('includes reasoningTokens when provided (Gemini thoughtsTokenCount)', () => {
    const usage = normalizeUsage({ inputTokens: 80, outputTokens: 40, reasoningTokens: 15 });
    expect(usage.reasoningTokens).toBe(15);
  });

  it('clamps negative reasoningTokens to 0', () => {
    const usage = normalizeUsage({ reasoningTokens: -99 });
    expect(usage.reasoningTokens).toBe(0);
  });

  it('clamps Infinity reasoningTokens to 0', () => {
    const usage = normalizeUsage({ reasoningTokens: Number.POSITIVE_INFINITY });
    expect(usage.reasoningTokens).toBe(0);
  });

  it('floors fractional reasoningTokens to integer', () => {
    const usage = normalizeUsage({ reasoningTokens: 12.7 });
    expect(usage.reasoningTokens).toBe(12);
  });

  it('omits reasoningTokens from output when not provided (backward-compat sparse output)', () => {
    const usage = normalizeUsage({ inputTokens: 5, outputTokens: 3 });
    expect(Object.prototype.hasOwnProperty.call(usage, 'reasoningTokens')).toBe(false);
  });

  // ── combined new fields ──────────────────────────────────────────────────

  it('handles both new fields together with all legacy fields', () => {
    const usage = normalizeUsage({
      inputTokens: 100,
      outputTokens: 40,
      cacheReadTokens: 800,
      cacheCreationTokens: 64,
      cacheWriteTokens: 64,
      reasoningTokens: 20,
    });
    expect(usage.inputTokens).toBe(100);
    expect(usage.outputTokens).toBe(40);
    expect(usage.cacheReadTokens).toBe(800);
    expect(usage.cacheCreationTokens).toBe(64);
    expect(usage.cacheWriteTokens).toBe(64);
    expect(usage.reasoningTokens).toBe(20);
    // totalTokens fallback: input + output (provider did not supply explicit total)
    expect(usage.totalTokens).toBe(140);
  });

  it('honors provider-reported totalTokens that includes reasoning overhead', () => {
    // Provider says total = 300, which folds in reasoning separately tracked
    const usage = normalizeUsage({
      inputTokens: 100,
      outputTokens: 150,
      reasoningTokens: 50,
      totalTokens: 300,
    });
    expect(usage.totalTokens).toBe(300);
    expect(usage.reasoningTokens).toBe(50);
  });

  it('satisfies TypeScript TokenUsage type with new optional fields present', () => {
    const usage: TokenUsage = normalizeUsage({
      inputTokens: 10,
      outputTokens: 5,
      cacheWriteTokens: 100,
      reasoningTokens: 8,
    });
    // Type assertions verified at compile time; runtime checks as smoke
    expect(usage.cacheWriteTokens).toBe(100);
    expect(usage.reasoningTokens).toBe(8);
    expect(usage.source).toBe('provider-adapter');
  });

  it('new fields default to absent (consumers use ?? 0) — explicit zero passes through', () => {
    const usage = normalizeUsage({ cacheWriteTokens: 0, reasoningTokens: 0 });
    // Explicitly provided as 0 → present in output as 0
    expect(usage.cacheWriteTokens).toBe(0);
    expect(usage.reasoningTokens).toBe(0);
  });
});
