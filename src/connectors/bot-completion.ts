// ═══ BOT-1 — live bot-agent wiring (provider fallback chain) ═════════════════
// Builds the one-shot LLM `complete` that powers the bot humanizer as a FALLBACK
// CHAIN: ollama (local, zero-cost) → claude (haiku) → openai (gpt-4.1-mini). The
// first available provider that returns text wins; a provider that is unreachable
// at call-time falls through to the next. If every provider fails → throw, and the
// humanizer falls back to the raw text (lossless chunk). Order is configurable via
// `bot_agent.providers`.
//
// Ollama uses its NATIVE /api/chat with `think:false` — the bot must be fast, and
// reasoning models (qwen3/qwen3.5) otherwise spend 30s+ "thinking" for a simple
// rephrase. (The native-agent adapter speaks the OpenAI-compat /v1 endpoint, which
// can't disable thinking — so the bot path calls /api/chat directly.) Cloud
// providers run through the shared native adapters.
//
// Fail-safe everywhere: bot_agent disabled OR no provider configured → a
// passthrough humanizer (raw text, lossless chunk) identical to the pre-BOT-1
// behavior. The bot never breaks because humanization is unavailable.

import { createAnthropicAdapter } from '../agent/provider-tooluse/anthropic.js';
import { createOpenAIAdapter } from '../agent/provider-tooluse/openai.js';
import type { ProviderAdapter } from '../agent/provider-tooluse/types.js';
import { makeBotHumanizer, type BotHumanizer } from './bot-humanizer.js';
import type { BotAgentConfig } from '../core/config-types.js';

export type { BotAgentConfig } from '../core/config-types.js';

const BOT_AGENT_SYSTEM =
  "You are deckent's messaging bot-agent. You rephrase internal bot messages into " +
  'natural, human, conversational text for a chat app. You always preserve ids, ' +
  'commands, numbers and file paths exactly, and you output only the rephrased message.';

/** Default provider preference: local-free first, then cheap claude, then openai. */
const DEFAULT_ORDER: ReadonlyArray<'ollama' | 'claude' | 'openai'> = ['ollama', 'claude', 'openai'];
/** Cheap defaults per cloud provider (economy tier) — ollama uses native_model. */
const CHEAP_MODEL = { claude: 'claude-haiku-4-5-20251001', openai: 'gpt-4.1-mini' } as const;

/** One provider candidate in the fallback chain — `run` is a one-shot completer. */
export interface BotProvider {
  name: 'ollama' | 'claude' | 'openai';
  run: (prompt: string) => Promise<string>;
}

/** One-shot ollama completer over the NATIVE /api/chat with think disabled (fast). */
function ollamaRunner(
  host: string,
  model: string,
  fetchImpl: typeof fetch = fetch,
): (prompt: string) => Promise<string> {
  return async (prompt: string): Promise<string> => {
    const res = await fetchImpl(`${host}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: BOT_AGENT_SYSTEM }, { role: 'user', content: prompt }],
        think: false, // reasoning OFF — a rephrase must not cost 30s of hidden thinking
        stream: false,
      }),
    });
    if (!res.ok) throw new Error(`ollama /api/chat ${res.status}`);
    const data = (await res.json()) as { message?: { content?: string } };
    return data.message?.content ?? '';
  };
}

/** One-shot completer over a native ProviderAdapter (cloud: claude / openai). */
function adapterRunner(adapter: ProviderAdapter, model: string): (prompt: string) => Promise<string> {
  return async (prompt: string): Promise<string> => {
    let text = '';
    for await (const ev of adapter.send({
      system: BOT_AGENT_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
      tools: [],
      model,
    })) {
      if (ev.type === 'text-delta') text += ev.text;
      else if (ev.type === 'done') break;
    }
    return text;
  };
}

/**
 * Resolve the ordered list of AVAILABLE bot-agent providers. Order follows
 * `bot_agent.providers` or the default (ollama → claude → openai); a provider is
 * included only when its config/key is present. Empty list → no provider (→
 * passthrough humanizer).
 */
export function resolveBotProviders(
  env: Record<string, string | undefined>,
  cfg: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): BotProvider[] {
  const ba = (cfg.bot_agent ?? {}) as BotAgentConfig;
  const ollamaHost = (cfg as { ollama_host?: string }).ollama_host;
  const nativeModel = (cfg as { native_model?: string }).native_model;
  const openaiBaseUrl = (cfg as { openai_base_url?: string }).openai_base_url;
  const order = ba.providers ?? DEFAULT_ORDER;

  const out: BotProvider[] = [];
  for (const kind of order) {
    if (kind === 'ollama' && ollamaHost) {
      out.push({ name: 'ollama', run: ollamaRunner(ollamaHost, ba.model ?? nativeModel ?? 'qwen3.5:4b', fetchImpl) });
    } else if (kind === 'claude' && env['ANTHROPIC_API_KEY']) {
      out.push({ name: 'claude', run: adapterRunner(createAnthropicAdapter({ apiKey: env['ANTHROPIC_API_KEY'] }), ba.model ?? CHEAP_MODEL.claude) });
    } else if (kind === 'openai' && (env['OPENAI_API_KEY'] || openaiBaseUrl)) {
      const opts: Parameters<typeof createOpenAIAdapter>[0] = { baseUrl: openaiBaseUrl ?? 'https://api.openai.com/v1' };
      if (env['OPENAI_API_KEY']) opts.apiKey = env['OPENAI_API_KEY'];
      out.push({ name: 'openai', run: adapterRunner(createOpenAIAdapter(opts), ba.model ?? CHEAP_MODEL.openai) });
    }
  }
  return out;
}

/**
 * Build a completer that tries each candidate provider in order until one returns
 * non-empty text. A provider that throws (unreachable / model missing) OR returns
 * blank falls through to the next; all-fail → throw (humanizer → raw fallback).
 */
export function makeFallbackComplete(
  candidates: ReadonlyArray<BotProvider>,
): (prompt: string) => Promise<string> {
  return async (prompt: string): Promise<string> => {
    let lastErr: unknown;
    for (const c of candidates) {
      try {
        const text = await c.run(prompt);
        if (text.trim()) return text; // success → stop the chain
      } catch (err) {
        lastErr = err; // provider down → fall through to the next
      }
    }
    throw new Error(
      `all bot-agent providers failed: ${lastErr instanceof Error ? lastErr.message : 'no output'}`,
    );
  };
}

/**
 * Build a one-shot completer from the provider fallback chain, or null when no
 * provider is configured (→ passthrough humanizer).
 */
export function buildBotComplete(
  env: Record<string, string | undefined>,
  cfg: Record<string, unknown>,
): ((prompt: string) => Promise<string>) | null {
  const providers = resolveBotProviders(env, cfg);
  if (providers.length === 0) return null;
  return makeFallbackComplete(providers);
}

/**
 * Build the live bot humanizer from config. Passthrough (raw, lossless chunk) when
 * `bot_agent.enabled` is falsy OR no provider resolves — both fail-safe and
 * byte-identical to the pre-BOT-1 send path, so wiring it in is zero-risk when off.
 */
export function buildBotHumanizer(
  cfg: Record<string, unknown> | undefined,
  env: Record<string, string | undefined> = process.env,
): BotHumanizer {
  const ba = (cfg?.bot_agent ?? {}) as BotAgentConfig;
  if (!ba.enabled || !cfg) return makeBotHumanizer();
  const complete = buildBotComplete(env, cfg);
  if (!complete) return makeBotHumanizer();
  return makeBotHumanizer({
    complete,
    ...(ba.persona !== undefined ? { persona: ba.persona } : {}),
    ...(ba.lang !== undefined ? { lang: ba.lang } : {}),
    ...(ba.timeout_ms !== undefined ? { timeoutMs: ba.timeout_ms } : {}),
  });
}
