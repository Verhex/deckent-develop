// src/cli/repl/native-transport.ts
// ═══ Native transport resolution (SP-1 M3, §3) ══════════════════════════════
// Turns detectTransport's kind into a concrete provider adapter + a model id, or
// an honest error string. Model id is API-pinned (determinism, §3): an explicit
// DECKENT_NATIVE_MODEL env wins, else a per-transport default. No network here.

import { detectTransport, type TransportConfig } from '../../agent/provider-detect.js';
import { createAnthropicAdapter } from '../../agent/provider-tooluse/anthropic.js';
import { createOpenAIAdapter } from '../../agent/provider-tooluse/openai.js';
import { createOllamaAdapter } from '../../agent/provider-tooluse/ollama.js';
import type { ProviderAdapter } from '../../agent/provider-tooluse/types.js';

export interface ResolvedProvider {
  adapter: ProviderAdapter;
  model: string;
}
export interface ProviderError {
  error: string;
}

const DEFAULT_MODEL: Record<'anthropic-api' | 'openai-compatible' | 'ollama', string> = {
  'anthropic-api': 'claude-sonnet-4-6',
  'openai-compatible': 'gpt-4.1',
  ollama: 'qwen3',
};

export function resolveNativeProvider(
  env: Record<string, string | undefined>,
  config: TransportConfig & { native_model?: string },
): ResolvedProvider | ProviderError {
  const mock = env['DECKENT_NATIVE_MOCK'];
  if (mock) {
    let scripts: import('../../agent/provider-tooluse/types.js').ProviderEvent[][] = [];
    try { scripts = JSON.parse(mock); } catch { scripts = []; }
    let turn = 0;
    return {
      adapter: { name: 'mock', async *send() { for (const e of (scripts[turn++] ?? [{ type: 'done' }])) yield e; } },
      model: env['DECKENT_NATIVE_MODEL'] ?? 'mock-model',
    };
  }

  const detected = detectTransport(env, config);
  if (detected.kind === 'none') return { error: detected.reason };

  const model = env['DECKENT_NATIVE_MODEL'] ?? config.native_model ?? DEFAULT_MODEL[detected.kind];

  if (detected.kind === 'anthropic-api') {
    return { adapter: createAnthropicAdapter({ apiKey: env['ANTHROPIC_API_KEY']! }), model };
  }
  if (detected.kind === 'openai-compatible') {
    const baseUrl = config.openai_base_url ?? 'https://api.openai.com/v1';
    const opts: Parameters<typeof createOpenAIAdapter>[0] = { baseUrl };
    if (env['OPENAI_API_KEY']) opts.apiKey = env['OPENAI_API_KEY'];
    return { adapter: createOpenAIAdapter(opts), model };
  }
  return { adapter: createOllamaAdapter({ host: config.ollama_host! }), model };
}
