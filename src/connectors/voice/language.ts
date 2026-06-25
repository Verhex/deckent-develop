// ─── Reply-language resolver ──────────────────────────────────────────────────
// WS1 Task 4.  Pure function — no I/O, no side effects.
//
// Precedence (highest → lowest):
//  1. cfg.language is a concrete BCP-47 tag  → forced (config wins; "TR sabit" use-case)
//  2. turnLang is present (STT-detected)     → forced (reply in the spoken language)
//  3. no signal                              → mirror (let the model match user's language)

import type { VoiceConfig } from './types.js';

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * The resolved reply-language decision for one turn.
 *
 * `tag`  — the BCP-47 language tag to use, or `null` when the mode is 'mirror'.
 * `mode` — 'forced' means the tag is definitive; 'mirror' means no signal was
 *           available and the model should mirror the user's input language.
 */
export type ReplyLanguage = { tag: string | null; mode: 'forced' | 'mirror' };

// ─── Resolver ────────────────────────────────────────────────────────────────

/**
 * Resolve the reply language for a single voice turn.
 *
 * @param cfg      VoiceConfig (may have `.language` set).
 * @param turnLang BCP-47 tag detected by STT for the current turn (Task 3 output).
 *
 * @returns ReplyLanguage — tag + mode pair consumed by Task 5 (LLM prompt + TTS).
 */
export function resolveReplyLanguage(cfg: VoiceConfig, turnLang?: string): ReplyLanguage {
  // Priority 1: explicit, concrete language override in config.
  if (cfg.language && cfg.language !== 'auto') {
    return { tag: cfg.language, mode: 'forced' };
  }

  // Priority 2: voice-detected language from the current turn.
  if (turnLang) {
    return { tag: turnLang, mode: 'forced' };
  }

  // Priority 3: no signal — let the LLM mirror the user's language.
  return { tag: null, mode: 'mirror' };
}
