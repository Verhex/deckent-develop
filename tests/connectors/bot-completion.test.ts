// BOT-1 — live bot-agent wiring: provider fallback chain (ollama → claude → openai)
// + the config gate + fail-safe fallbacks. The chain logic is unit-tested with mock
// adapters; the real LLM round-trip is user-verified (like BOT-001/002).

import { describe, it, expect } from 'vitest';
import {
  buildBotHumanizer,
  resolveBotProviders,
  makeFallbackComplete,
  type BotProvider,
} from '../../src/connectors/bot-completion.js';
import type { ProviderEvent } from '../../src/agent/provider-tooluse/types.js';

function adapter(name: BotProvider['name'], behavior: { text?: string; throw?: boolean }): BotProvider {
  return {
    name,
    model: `${name}-model`,
    adapter: {
      name,
      // eslint-disable-next-line require-yield
      async *send(): AsyncIterable<ProviderEvent> {
        if (behavior.throw) throw new Error(`${name} down`);
        if (behavior.text) yield { type: 'text-delta', text: behavior.text };
        yield { type: 'done' };
      },
    },
  };
}

describe('buildBotHumanizer (config gate + fail-safe)', () => {
  it('passthrough when bot_agent is disabled (raw, lossless)', async () => {
    expect(await buildBotHumanizer({}, {}).toParts('approve t-42')).toEqual(['approve t-42']);
  });

  it('passthrough when config is undefined', async () => {
    expect(await buildBotHumanizer(undefined, {}).toParts('approve t-42')).toEqual(['approve t-42']);
  });

  it('fail-safe: enabled but no provider configured → passthrough (raw, never breaks)', async () => {
    const h = buildBotHumanizer({ bot_agent: { enabled: true } }, {}); // no ollama_host, no keys
    expect(await h.toParts('approve t-42')).toEqual(['approve t-42']);
  });
});

describe('resolveBotProviders (fallback order + availability)', () => {
  it('default order is ollama → claude → openai (only the available ones)', () => {
    const order = resolveBotProviders(
      { ANTHROPIC_API_KEY: 'k', OPENAI_API_KEY: 'k' },
      { ollama_host: 'http://x', bot_agent: { enabled: true } },
    ).map((p) => p.name);
    expect(order).toEqual(['ollama', 'claude', 'openai']);
  });

  it('respects an explicit providers order', () => {
    const order = resolveBotProviders(
      { ANTHROPIC_API_KEY: 'k' },
      { ollama_host: 'http://x', bot_agent: { enabled: true, providers: ['claude', 'ollama'] } },
    ).map((p) => p.name);
    expect(order).toEqual(['claude', 'ollama']);
  });

  it('includes only providers whose config/key is present', () => {
    expect(resolveBotProviders({}, { ollama_host: 'http://x' }).map((p) => p.name)).toEqual(['ollama']);
    expect(resolveBotProviders({ OPENAI_API_KEY: 'k' }, {}).map((p) => p.name)).toEqual(['openai']);
    expect(resolveBotProviders({}, {})).toEqual([]);
  });

  it('ollama uses native_model; bot_agent.model overrides it', () => {
    expect(resolveBotProviders({}, { ollama_host: 'h', native_model: 'qwen3.6:27b' })[0]?.model).toBe('qwen3.6:27b');
    expect(resolveBotProviders({}, { ollama_host: 'h', bot_agent: { model: 'llama3' } })[0]?.model).toBe('llama3');
  });
});

describe('makeFallbackComplete (runtime fallback)', () => {
  it('returns the first provider that yields text', async () => {
    const complete = makeFallbackComplete([adapter('ollama', { text: 'from ollama' })]);
    expect(await complete('p')).toBe('from ollama');
  });

  it('falls through when a provider throws (ollama down → claude)', async () => {
    const complete = makeFallbackComplete([
      adapter('ollama', { throw: true }),
      adapter('claude', { text: 'from claude' }),
    ]);
    expect(await complete('p')).toBe('from claude');
  });

  it('falls through when a provider returns blank', async () => {
    const complete = makeFallbackComplete([
      adapter('ollama', { text: '   ' }),
      adapter('openai', { text: 'from openai' }),
    ]);
    expect(await complete('p')).toBe('from openai');
  });

  it('throws when every provider fails (humanizer then falls back to raw)', async () => {
    const complete = makeFallbackComplete([adapter('ollama', { throw: true }), adapter('claude', { throw: true })]);
    await expect(complete('p')).rejects.toThrow(/all bot-agent providers failed/);
  });

  it('end-to-end: a fallback completer drives the humanizer, command preserved', async () => {
    const complete = makeFallbackComplete([
      adapter('ollama', { throw: true }),
      adapter('claude', { text: 'Hey — reply approve t-42 when ready' }),
    ]);
    const { makeBotHumanizer } = await import('../../src/connectors/bot-humanizer.js');
    const parts = await makeBotHumanizer({ complete }).toParts('[autonomous] approve t-42 / reject t-42');
    expect(parts.join('')).toContain('approve t-42');
    expect(parts.join('')).toContain('Hey');
  });
});
