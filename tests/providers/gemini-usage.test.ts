import { describe, it, expect, beforeEach } from 'vitest';
import { tmpdir } from 'node:os';
import { GeminiAdapter } from '../../src/providers/gemini.js';

// `extractUsage` is a pure stdout parser — no spawn, no fs. Construct the
// adapter directly against a tmpdir (the constructor performs no I/O).

describe('GeminiAdapter.extractUsage', () => {
  let adapter: GeminiAdapter;

  beforeEach(() => {
    adapter = new GeminiAdapter(tmpdir());
  });

  it('is implemented (pre-fix the adapter had no extractUsage)', () => {
    expect(typeof adapter.extractUsage).toBe('function');
  });

  it('parses a real gemini --output-format json usageMetadata → real tokens incl. reasoning (goNogo)', () => {
    // Real Gemini CLI `--output-format json` envelope: top-level `usageMetadata`.
    // totalTokenCount (2048) = prompt(1500) + candidates(420) + thoughts(128) — Gemini
    // folds thoughts into the total but NOT into candidatesTokenCount, so reasoning is additive.
    const raw = JSON.stringify({
      response: 'Task complete.',
      usageMetadata: {
        promptTokenCount: 1500,
        candidatesTokenCount: 420,
        cachedContentTokenCount: 900,
        thoughtsTokenCount: 128,
        totalTokenCount: 2048,
      },
    });
    const usage = adapter.extractUsage(raw);
    expect(usage).not.toBeNull();
    expect(usage).toEqual({
      inputTokens: 1500,
      outputTokens: 420,
      cacheReadTokens: 900,
      cacheCreationTokens: 0,
      reasoningTokens: 128, // reasoning = thoughtsTokenCount
      totalTokens: 2048, // provider-reported total (passed through, includes thoughts)
      source: 'provider-adapter',
    });
  });

  it('normalizes reasoning from thoughtsTokenCount specifically (reasoning=thoughts)', () => {
    const raw = JSON.stringify({
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 3, totalTokenCount: 18 },
    });
    const usage = adapter.extractUsage(raw);
    expect(usage?.reasoningTokens).toBe(3);
    expect(usage?.totalTokens).toBe(18);
  });

  it('omits reasoningTokens entirely when Gemini reports no thoughts (sparse output)', () => {
    const raw = JSON.stringify({
      response: 'Hi',
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
    });
    const usage = adapter.extractUsage(raw);
    expect(usage).toEqual({
      inputTokens: 10,
      outputTokens: 20,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      totalTokens: 30,
      source: 'provider-adapter',
    });
    expect('reasoningTokens' in (usage ?? {})).toBe(false);
  });

  it('parses a stream-json (NDJSON) event stream and takes the LAST cumulative usageMetadata', () => {
    const raw = [
      JSON.stringify({ response: 'Hello ' }),
      JSON.stringify({ response: 'world', usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 60, thoughtsTokenCount: 10, totalTokenCount: 120 } }),
    ].join('\n');
    const usage = adapter.extractUsage(raw);
    expect(usage?.inputTokens).toBe(50);
    expect(usage?.outputTokens).toBe(60);
    expect(usage?.reasoningTokens).toBe(10);
    expect(usage?.totalTokens).toBe(120);
    expect(usage?.source).toBe('provider-adapter');
  });

  it('takes the LAST usageMetadata when several cumulative chunks appear', () => {
    const raw = [
      JSON.stringify({ response: 'a', usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 40, totalTokenCount: 140 } }),
      JSON.stringify({ response: 'b', usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 120, totalTokenCount: 420 } }),
    ].join('\n');
    const usage = adapter.extractUsage(raw);
    expect(usage?.inputTokens).toBe(300);
    expect(usage?.outputTokens).toBe(120);
    expect(usage?.totalTokens).toBe(420);
  });

  it('computes total as input+output when Gemini omits totalTokenCount', () => {
    const raw = JSON.stringify({ usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 4 } });
    const usage = adapter.extractUsage(raw);
    expect(usage?.inputTokens).toBe(12);
    expect(usage?.outputTokens).toBe(4);
    expect(usage?.totalTokens).toBe(16); // filled by normalizeUsage when provider omits total
  });

  it('returns null when the output carries no usageMetadata', () => {
    expect(adapter.extractUsage('just some agent prose, no json here')).toBeNull();
    expect(adapter.extractUsage(JSON.stringify({ response: 'hello, no usage' }))).toBeNull();
  });

  it('returns null for empty or malformed input', () => {
    expect(adapter.extractUsage('')).toBeNull();
    expect(adapter.extractUsage('   ')).toBeNull();
    expect(adapter.extractUsage('{not valid json')).toBeNull();
  });

  it('ignores an empty usageMetadata object (no real numbers reported)', () => {
    expect(adapter.extractUsage(JSON.stringify({ usageMetadata: {} }))).toBeNull();
  });
});
