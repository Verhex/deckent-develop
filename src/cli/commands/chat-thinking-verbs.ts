// src/cli/commands/chat-thinking-verbs.ts
// ═══ TERMINAL-TOOLS-002 — catalog-owned verbs for the legacy loop indicators ═
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

// ─── Live tool-activity verbs (`🔧 <verb>: <target>…`) ──────────────────────
//
// Same closure for chat-render-region.ts renderToolActivity: its TOOL_VERBS
// map was a Turkish literal table. The built-in tool names are technical
// tokens (never localized); only the verb shown next to them is catalog text.

export const TOOL_ACTIVITY_VERB_KEY_PREFIX = 'tui.tool_activity.' as const;

/** Built-in tools that carry a localized activity verb (registry order). */
export const TOOL_ACTIVITY_TOOLS: readonly string[] = Object.freeze([
  'deckent_write_file', 'deckent_edit_file', 'deckent_read_file', 'deckent_bash',
  'deckent_status', 'deckent_memory_query', 'deckent_history', 'deckent_plan',
]);

/** Resolve tool → verb for the session language (fail-closed on a missing row). */
export function buildToolActivityVerbs(lang: string): Readonly<Record<string, string>> {
  const verbs: Record<string, string> = {};
  for (const tool of TOOL_ACTIVITY_TOOLS) {
    const key = `${TOOL_ACTIVITY_VERB_KEY_PREFIX}${tool}`;
    const row = getMessage(key, lang);
    if (row === key || row.trim().length === 0) throw new InjectedLabelMissingError(`toolActivity.${tool}`);
    verbs[tool] = row;
  }
  return Object.freeze(verbs);
}
