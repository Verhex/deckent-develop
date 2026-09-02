// src/cli/commands/chat-thinking-verbs.ts
// ═══ TERMINAL-TOOLS-002 — catalog-owned verbs for the legacy thinking ticker ═
//
// The legacy readline REPL animates `● deckent · <verb>…` while a turn is
// pending (chat-render-region.ts createThinkingTicker). The verb pool used to
// be a Turkish literal list inside that mechanism module — visible in every
// session language. It now lives in the message catalog as ONE row per
// language (`tui.thinking_verbs`, `|`-separated) and is resolved here by the
// caller side (entry.ts), so the ticker itself stays string-free.
//
// Fail-closed: an empty or missing row is a Deckent defect, surfaced as the
// same typed InjectedLabelMissingError every other missing injection uses —
// never a silent English/Turkish default.

import { getMessage } from '../helpers/messages.js';
import { InjectedLabelMissingError } from '../helpers/injected-label.js';

export const THINKING_VERBS_KEY = 'tui.thinking_verbs' as const;
export const THINKING_VERBS_SEPARATOR = '|' as const;

/** Resolve the session-language verb pool (≥ 1 entry, deduplicated, trimmed). */
export function buildThinkingVerbs(lang: string): readonly string[] {
  const row = getMessage(THINKING_VERBS_KEY, lang);
  const verbs = row === THINKING_VERBS_KEY
    ? []
    : Array.from(new Set(row.split(THINKING_VERBS_SEPARATOR).map((v) => v.trim()).filter((v) => v.length > 0)));
  if (verbs.length === 0) throw new InjectedLabelMissingError('thinkingVerbs');
  return Object.freeze(verbs);
}
