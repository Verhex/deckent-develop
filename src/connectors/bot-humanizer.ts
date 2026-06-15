// ═══ BOT-1 — bot-agent humanizer (MASTER-PLAN §4G) ═══════════════════════════
// Rephrases raw deckent bot messages into natural, conversational text and
// summarizes-to-fit when long — so the Telegram/Discord bot reads like a person,
// not a structured log. Every outbound message passes through it (notifications,
// command acks, bot-action results, chat replies); fixed-structure flows do NOT
// bypass it.
//
// 🔴 Two invariants:
//   1. NEVER drop actionable items — ids, `approve <id>`/`reject <id>` commands,
//      numbers, paths survive verbatim (the prompt enforces it; the operator must
//      still be able to act).
//   2. NEVER throw / NEVER cut — a disabled humanizer or an LLM error/timeout
//      falls back to the RAW text, losslessly chunked (chunkMessage). The bot is
//      meaningless if it loses content, so summarize-or-split, never truncate.
//
// The LLM `complete` is INJECTED (provider-agnostic) so the core is unit-testable
// without a real provider; the live `complete` is built from resolveNativeProvider
// (ollama-local / anthropic-api / openai-compatible) by the connector bootstrap.

import { chunkMessage } from './message-format.js';

export interface BotHumanizer {
  /**
   * Turn a raw outbound message into Telegram-ready parts (humanized + fit).
   * ALWAYS resolves to ≥1 part and NEVER throws — on any failure it returns the
   * raw text losslessly chunked.
   */
  toParts(text: string): Promise<string[]>;
}

export interface BotHumanizerOptions {
  /**
   * One-shot LLM completion (full prompt → text). Absent → passthrough humanizer
   * (raw text, lossless chunk) so the send path is uniform whether or not the
   * bot-agent is enabled.
   */
  complete?: (prompt: string) => Promise<string>;
  /** Tone/persona descriptor injected into the prompt (user-customizable). */
  persona?: string;
  /** Target language for the humanized output (e.g. 'en', 'tr'). */
  lang?: string;
  /** Telegram-safe char cap for the final parts (default 4000). */
  maxChars?: number;
  /** Hard timeout (ms) for the LLM call before falling back to raw (default 8000). */
  timeoutMs?: number;
}

const DEFAULT_PERSONA = 'concise, warm, and clear';
const DEFAULT_LANG = 'en';
const DEFAULT_MAX = 4000;
const DEFAULT_TIMEOUT = 8000;

/** Build the humanize/summarize prompt — actionable-item preservation is explicit. */
function buildPrompt(text: string, persona: string, lang: string): string {
  return [
    'Rephrase the following deckent bot message into natural, friendly, conversational text for a messaging app (like Telegram).',
    `Target language: ${lang}.`,
    `Tone/persona: ${persona}.`,
    'STRICT RULES:',
    '- NEVER translate or modify any token that contains a dot ("."), underscore ("_"), hyphen ("-") or digit — these are EXACT technical identifiers and commands (e.g. "autonomous.execute", "t-42", "approve t-42"); copy them character-for-character, same case.',
    '- Preserve EVERY id, command ("approve <id>" / "reject <id>"), number, and file path EXACTLY — never drop, rename, translate, re-case, or alter them.',
    '- If the message is long, summarize the prose but keep ALL action items intact.',
    '- Output ONLY the message text — no preamble, no reasoning, no quotes, no markdown headers.',
    '',
    'MESSAGE:',
    text,
  ].join('\n');
}

/**
 * Extract the must-preserve action ids from a raw message — the `<id>` after an
 * approve/reject/accept command. The humanized text MUST keep these verbatim
 * (case-sensitive) or the operator's reply won't resolve; if a model drops or
 * re-cases one, we discard the humanized output and send the raw text instead.
 */
export function criticalTokens(text: string): string[] {
  const ids = new Set<string>();
  const re = /\b(?:approve|reject|accept)\s+(\S+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    // Strip trailing punctuation a model might glue on (e.g. "t-42.").
    ids.add(m[1]!.replace(/[.,;:!?]+$/, ''));
  }
  return [...ids];
}

/** Resolve `undefined` after `ms` so a slow LLM never blocks the bot. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([
    p,
    new Promise<undefined>((resolve) => {
      const timer = setTimeout(() => resolve(undefined), ms);
      if (typeof timer.unref === 'function') timer.unref();
    }),
  ]);
}

/**
 * Build a humanizer. With no `complete` it is a pure passthrough (lossless chunk);
 * with a `complete` it humanizes + summarizes-to-fit, falling back to raw on any
 * failure. The returned object is cheap to construct and safe to reuse.
 */
export function makeBotHumanizer(opts: BotHumanizerOptions = {}): BotHumanizer {
  const maxChars = opts.maxChars ?? DEFAULT_MAX;
  const persona = opts.persona ?? DEFAULT_PERSONA;
  const lang = opts.lang ?? DEFAULT_LANG;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT;
  const complete = opts.complete;

  return {
    async toParts(text: string): Promise<string[]> {
      if (!complete) return chunkMessage(text, maxChars);
      try {
        const humanized = await withTimeout(complete(buildPrompt(text, persona, lang)), timeoutMs);
        const trimmed = humanized?.trim();
        if (!trimmed) return chunkMessage(text, maxChars); // blank/timeout → raw fallback
        // Correctness gate: if the model dropped/altered any approve/reject <id>,
        // the operator's reply would not resolve — discard the humanized text and
        // send the raw (correct) message instead. Weak models stay SAFE this way.
        const must = criticalTokens(text);
        if (must.some((tok) => !trimmed.includes(tok))) return chunkMessage(text, maxChars);
        return chunkMessage(trimmed, maxChars);
      } catch {
        return chunkMessage(text, maxChars); // LLM error → raw, never throw
      }
    },
  };
}
