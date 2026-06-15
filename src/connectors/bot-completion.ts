// ═══ BOT-1 — live bot-agent wiring (resolveNativeProvider glue) ══════════════
// Builds the one-shot LLM `complete` that powers the bot humanizer from deckent's
// native transport (ollama-local / anthropic-api / openai-compatible), then wraps
// it in a BotHumanizer. Mirrors the REPL's native-provider resolution
// (run.tsx:176) — config fields are read via cast, the same way the REPL does.
//
// Fail-safe everywhere: bot_agent disabled OR no provider resolves → a passthrough
// humanizer (raw text, lossless chunk) identical to the pre-BOT-1 behavior. The
// bot never breaks because humanization is unavailable.

import { resolveNativeProvider } from '../cli/repl/native-transport.js';
import { makeBotHumanizer, type BotHumanizer } from './bot-humanizer.js';

/** `bot_agent` config block (read via cast — loader preserves it, like the REPL's
 *  native_model/ollama_host). Default OFF (safe default; explicit opt-in). */
export interface BotAgentConfig {
  /** Turn the humanizer on. Default false. */
  enabled?: boolean;
  /** Tone/persona injected into the rephrase prompt (user-customizable). */
  persona?: string;
  /** Output language (e.g. 'en', 'tr'). */
  lang?: string;
  /** Override the native model used for humanizing (else native_model / default). */
  model?: string;
}

const BOT_AGENT_SYSTEM =
  "You are deckent's messaging bot-agent. You rephrase internal bot messages into " +
  'natural, human, conversational text for a chat app. You always preserve ids, ' +
  'commands, numbers and file paths exactly, and you output only the rephrased message.';

/**
 * Build a one-shot completer from the resolved native provider, or null when no
 * provider is available (→ passthrough humanizer). Uses tools:[] (pure text turn).
 */
export function buildBotComplete(
  env: Record<string, string | undefined>,
  cfg: Record<string, unknown>,
): ((prompt: string) => Promise<string>) | null {
  const ba = (cfg.bot_agent ?? {}) as BotAgentConfig;
  const resolved = resolveNativeProvider(env, {
    openai_base_url: (cfg as { openai_base_url?: string }).openai_base_url,
    ollama_host: (cfg as { ollama_host?: string }).ollama_host,
    native_model: ba.model ?? (cfg as { native_model?: string }).native_model,
  });
  if ('error' in resolved) return null;
  const { adapter, model } = resolved;
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
 * Build the live bot humanizer from config. Passthrough (raw, lossless chunk) when
 * `bot_agent.enabled` is falsy OR no native provider resolves — both fail-safe and
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
  });
}
