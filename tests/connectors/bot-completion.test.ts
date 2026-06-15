// BOT-1 — live bot-agent wiring: provider fallback chain (ollama → claude → openai)
// + the config gate + fail-safe fallbacks. The chain logic is unit-tested with mock
// runners; the real LLM round-trip is user-verified (like BOT-001/002).

import { describe, it, expect } from 'vitest';
import {
  buildBotHumanizer,
  resolveBotProviders,
  makeFallbackComplete,
  type BotProvider,
} from '../../src/connectors/bot-completion.js';

function prov(name: BotProvider['name'], behavior: { text?: string; throw?: boolean }): BotProvider {
  return {
    name,
    run: async () => {
      if (behavior.throw) throw new Error(`${name} down`);
      return behavior.text ?? '';
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

  it('ollama calls native /api/chat with think:false; native_model used, bot_agent.model overrides', async () => {
    let body: Record<string, unknown> = {};
    const fetchMock = (async (_url: string, opts: { body: string }) => {
      body = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ message: { content: 'ok' } }) };
    }) as unknown as typeof fetch;

    await resolveBotProviders({}, { ollama_host: 'http://h', native_model: 'qwen3.5:4b' }, fetchMock)[0]!.run('hi');
    expect(body['model']).toBe('qwen3.5:4b');
    expect(body['think']).toBe(false);

    await resolveBotProviders({}, { ollama_host: 'http://h', bot_agent: { model: 'llama3.2' } }, fetchMock)[0]!.run('hi');
    expect(body['model']).toBe('llama3.2');
  });
});

describe('makeFallbackComplete (runtime fallback)', () => {
  it('returns the first provider that yields text', async () => {
    expect(await makeFallbackComplete([prov('ollama', { text: 'from ollama' })])('p')).toBe('from ollama');
  });

  it('falls through when a provider throws (ollama down → claude)', async () => {
    const complete = makeFallbackComplete([prov('ollama', { throw: true }), prov('claude', { text: 'from claude' })]);
    expect(await complete('p')).toBe('from claude');
  });

  it('falls through when a provider returns blank', async () => {
    const complete = makeFallbackComplete([prov('ollama', { text: '   ' }), prov('openai', { text: 'from openai' })]);
    expect(await complete('p')).toBe('from openai');
  });

  it('throws when every provider fails (humanizer then falls back to raw)', async () => {
    const complete = makeFallbackComplete([prov('ollama', { throw: true }), prov('claude', { throw: true })]);
    await expect(complete('p')).rejects.toThrow(/all bot-agent providers failed/);
  });

  it('end-to-end: a fallback completer drives the humanizer, command preserved', async () => {
    const complete = makeFallbackComplete([
      prov('ollama', { throw: true }),
      prov('claude', { text: 'Hey — reply approve t-42 when ready' }),
    ]);
    const { makeBotHumanizer } = await import('../../src/connectors/bot-humanizer.js');
    const parts = await makeBotHumanizer({ complete }).toParts('[autonomous] approve t-42 / reject t-42');
    expect(parts.join('')).toContain('approve t-42');
    expect(parts.join('')).toContain('Hey');
  });
});
