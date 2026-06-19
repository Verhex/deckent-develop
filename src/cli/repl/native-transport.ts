// src/cli/repl/native-transport.ts
// ═══ Native transport resolution (SP-1 M3, §3) ══════════════════════════════
// Turns detectTransport's kind into a concrete provider adapter + a model id, or
// an honest error string. Model id is API-pinned (determinism, §3): an explicit
// DECKENT_NATIVE_MODEL env wins, else a per-transport default. No network here.
//
// Also exports the stream-segmenter primitives as the canonical streaming seam:
// consumers of the native transport layer use createStreamOutputHandler() to
// safely feed and flush streamed tokens, even in the presence of unclosed fences
// or mid-stream flush() calls (the "queue/flush" race guard).

import { detectTransport, type TransportConfig } from '../../agent/provider-detect.js';
import { createAnthropicAdapter } from '../../agent/provider-tooluse/anthropic.js';
import { createOpenAIAdapter } from '../../agent/provider-tooluse/openai.js';
import { createOllamaAdapter } from '../../agent/provider-tooluse/ollama.js';
import type { ProviderAdapter } from '../../agent/provider-tooluse/types.js';
import { createStreamSegmenter, type Segment } from './stream-segmenter.js';

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

// ═══ Stream output handler — fence-safe, flush-race-guarded ══════════════════
// Canonical streaming seam for native-transport consumers. The Ink REPL feeds
// provider tokens via feed(); when a turn ends (or a tool call interrupts the
// stream), flush() drains any accumulated segment — including an unclosed code
// fence — so reply text is never silently swallowed (the "queue/flush" race).
//
// Race scenario: a streaming reply opens a ``` fence block but the turn ends
// (or is interrupted by a tool call) before the closing fence arrives.
// flush() handles this by emitting the buffered fence block immediately, so the
// content reaches the caller rather than being discarded. The segmenter resets
// to prose mode, keeping subsequent chunks correctly classified.

export type { Segment } from './stream-segmenter.js';
export { createStreamSegmenter } from './stream-segmenter.js';

/**
 * A flush-safe streaming output handler for the native transport layer.
 * Wraps `createStreamSegmenter` and documents the fence/segment contract.
 */
export interface StreamOutputHandler {
  /** Feed a streamed text chunk; may emit completed segments via the callback. */
  feed(chunk: string): void;
  /**
   * Flush pending content at turn-end or on interruption.
   * Emits the trailing partial line and any open fence/table block — guards
   * against the unclosed-fence flush race so no content is lost.
   */
  flush(): void;
  /** Current in-progress partial line (no newline yet), for live preview. */
  partial(): string;
}

/**
 * Create a flush-safe stream output handler.
 * @param emit — called once per completed prose line or finished fence/table block
 */
export function createStreamOutputHandler(emit: (seg: Segment) => void): StreamOutputHandler {
  const segmenter = createStreamSegmenter(emit);
  return {
    feed: (chunk) => segmenter.feed(chunk),
    flush: () => segmenter.flush(),
    partial: () => segmenter.partial(),
  };
}
