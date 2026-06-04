// Claude prompt-cache surface tests.
//
// Anthropic applies prompt caching automatically at the CLI/API layer and
// reports the result via `cache_read_input_tokens`; deckent reads that back
// through `parseCacheUsage`, and the native-chat / API adapter path marks the
// frozen system block ephemeral via `attachCacheControlToMessages`. These are
// the live cache surfaces. (The former deckent-side frozen/cacheKey/marker
// subsystem in task-builder was removed — it forwarded a write-only env that
// no backend consumed and polluted every provider's prompt; Anthropic's
// automatic caching makes it redundant.)

import { describe, it, expect } from 'vitest';
import {
  parseCacheUsage,
  attachCacheControlToMessages,
  CACHE_CONTROL_EPHEMERAL,
} from '../../src/providers/claude.js';

describe('claude prompt-cache surface', () => {
  it('parseCacheUsage extracts cache_read_input_tokens from a Claude CLI JSON envelope', () => {
    const envelope = JSON.stringify({
      type: 'result',
      subtype: 'success',
      result: 'task ok',
      usage: {
        input_tokens: 1500,
        output_tokens: 320,
        cache_read_input_tokens: 85000,
        cache_creation_input_tokens: 1200,
      },
    });
    const usage = parseCacheUsage(envelope);
    expect(usage.cacheReadTokens).toBe(85000);
    expect(usage.cacheCreationTokens).toBe(1200);

    // Object input (already-parsed SDK response) works too
    const usageObj = parseCacheUsage({
      usage: { cache_read_input_tokens: 42, cache_creation_input_tokens: 7 },
    });
    expect(usageObj.cacheReadTokens).toBe(42);
    expect(usageObj.cacheCreationTokens).toBe(7);
  });

  it('parseCacheUsage returns zeros for envelopes without cache fields (cache miss fallback)', () => {
    const noCache = JSON.stringify({ type: 'result', usage: { input_tokens: 100, output_tokens: 50 } });
    const u1 = parseCacheUsage(noCache);
    expect(u1.cacheReadTokens).toBe(0);
    expect(u1.cacheCreationTokens).toBe(0);

    // Garbage in → zeros, never throws
    expect(parseCacheUsage('not json').cacheReadTokens).toBe(0);
    expect(parseCacheUsage('').cacheReadTokens).toBe(0);
    expect(parseCacheUsage(null).cacheReadTokens).toBe(0);
    expect(parseCacheUsage({ usage: null }).cacheReadTokens).toBe(0);
    // Negative or NaN values are clamped to 0
    expect(parseCacheUsage({ usage: { cache_read_input_tokens: -5 } }).cacheReadTokens).toBe(0);
    expect(parseCacheUsage({ usage: { cache_read_input_tokens: 'abc' } }).cacheReadTokens).toBe(0);
  });

  it('attachCacheControlToMessages marks the system block as ephemeral', () => {
    const messages = [
      { role: 'system' as const, content: 'FROZEN BOILERPLATE — Karpathy + agent + skills' },
      { role: 'user' as const,   content: 'task-specific description' },
    ];
    const out = attachCacheControlToMessages(messages);

    // System message content becomes a block array with the cache_control marker
    const systemMsg = out.find((m) => m.role === 'system');
    expect(systemMsg).toBeDefined();
    expect(Array.isArray(systemMsg!.content)).toBe(true);
    const blocks = systemMsg!.content as Array<{ type: string; cache_control?: unknown }>;
    expect(blocks[0]?.cache_control).toEqual({ type: CACHE_CONTROL_EPHEMERAL.type });

    // Input is not mutated
    expect(typeof messages[0]!.content).toBe('string');
  });
});
