import type { McpToolDispatcher } from './chat-native.js';
import { getMessage } from '../helpers/messages.js';

// ═══ chat-agentic-dispatch — natural language → MCP tool router ═════════
//
// Sprint 219 task 219-004. The REPL (`deckent chat --native`, runChatNativeLoop)
// already wires an `McpToolDispatcher` for provider-driven tool_use. THIS
// module wires the second path: the user types a plain Turkish/English
// sentence ("sprint durumu ne / son sprint'i göster / hafızada rbac ara"),
// we classify the intent, and dispatch the matching deckent_* MCP tool
// directly — no LLM round-trip needed for the read-only quick actions.
//
// Risky / destructive actions (start/kill/cleanup) are deliberately NOT
// mapped here — they will be gated through the confirm prompt added in
// task 219-005. This module returns `null` tool for unknown input so the
// caller can fall through to the provider-driven loop gracefully.
//
// Karpathy D2: pure functions + a tiny rule table. No new runtime deps.

// ─── Types ──────────────────────────────────────────────────────────

/** Result of intent classification — `tool: null` means no match. */
export type AgenticIntent =
  | {
      tool: 'deckent_status' | 'deckent_history' | 'deckent_memory_query' | 'deckent_plan';
      args: Record<string, unknown>;
    }
  | { tool: null; reason: 'no_match' };

/** Result of dispatching an intent — caller renders `output` into the REPL. */
export interface AgenticDispatchResult {
  matched: boolean;
  tool?: string;
  args?: Record<string, unknown>;
  output: string;
}

// ─── Intent Rules ───────────────────────────────────────────────────
//
// Order matters: more specific patterns first. Each rule returns the MCP
// tool name + the args record to send through the dispatcher. Regexes
// cover Turkish-with-and-without-diacritics and English keywords.

interface IntentRule {
  /** Returns true when the normalized input should fire this rule. */
  test(normalized: string): boolean;
  /** Build the MCP tool action descriptor from the matched input. */
  build(text: string): Extract<AgenticIntent, { tool: string }>;
}

const TR_DIACRITIC_MAP: Record<string, string> = {
  ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u',
  Ç: 'C', Ğ: 'G', İ: 'I', Ö: 'O', Ş: 'S', Ü: 'U',
};

/** Normalize Turkish diacritics + lowercase so patterns stay readable. */
function normalize(text: string): string {
  let out = '';
  for (const ch of text) out += TR_DIACRITIC_MAP[ch] ?? ch;
  return out.toLowerCase().trim();
}

// task 380-007 (born-514, AGENTIC-DISPATCH-OVERMATCH): the original rules below matched on a
// single bare, unqualified keyword ("ara", "memory", "find", "search", "plan", "status", bare
// "durum\w*"/"gecmis", "how is/are") anywhere in the sentence — measured (359-009,
// tests/cli/nl-dispatch-evidence.test.ts) to silently misroute 16/20 ordinary conversational
// sentences into a tool call. Every trigger below now requires either a distinctive/rare word
// (recall, planla) or an explicit command-shape context (sprint-scoped, or a memory-noun +
// search-verb pairing) — a bare generic word alone no longer fires.

const STATUS_RE = /\b(?:sprint\s+durum\w*|durum(?:u|un)?\s+ne(?:dir)?|durumu\s+nasil|what(?:'s|\s+is)\s+the\s+status|nasil\s+gidiyor)\b/;
const HISTORY_RE = /\b(?:son\s+sprint\w*|sprint\s+gecmis\w*|gecmis\w*\s+sprint\w*|history|sprint\s+history|past\s+sprints?)\b/;
const RECALL_RE = /\brecall\b/;
const MEMORY_WORD_RE = /\b(?:hafiza\w*|memory)\b/;
const SEARCH_VERB_RE = /\b(?:ara|search|find)\b/;
const RECALL_STRIP_RE = /\b(?:hafiza\w*|recall|memory|ara|search|find|for)\b/g;
const PLAN_RE = /\b(?:planla|sprint\s+plan\w*|generate\s+plan)\b/;

const RULES: readonly IntentRule[] = [
  {
    test: (normalized) => STATUS_RE.test(normalized),
    build: () => ({ tool: 'deckent_status', args: { root: '.' } }),
  },
  {
    test: (normalized) => HISTORY_RE.test(normalized),
    build: () => ({ tool: 'deckent_history', args: { root: '.' } }),
  },
  {
    // "recall" is a distinctive/rare word — safe as a standalone trigger. The generic
    // ara/search/find verbs are extremely common in ordinary conversation on their own
    // (call me later / find my keys / search for an apartment), so they only fire when
    // paired with an explicit memory-noun word in the SAME utterance.
    test: (normalized) => RECALL_RE.test(normalized)
      || (MEMORY_WORD_RE.test(normalized) && SEARCH_VERB_RE.test(normalized)),
    build: (text) => {
      // Strip the intent keywords + connector "for" so the remainder is the query.
      const query = normalize(text)
        .replace(RECALL_STRIP_RE, ' ')
        .replace(/^[\s,:;'"-]+|[\s,:;'"?!.-]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      return {
        tool: 'deckent_memory_query',
        args: query.length > 0 ? { query } : {},
      };
    },
  },
  {
    test: (normalized) => PLAN_RE.test(normalized),
    build: () => ({ tool: 'deckent_plan', args: { mode: 'auto' } }),
  },
];

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Classify a single raw REPL line into an MCP-tool intent. Returns
 * `{ tool: null, reason: 'no_match' }` when no rule matches — callers
 * should treat this as "fall back to provider-driven chat".
 */
export function classifyAgenticIntent(text: string): AgenticIntent {
  const normalized = normalize(text);
  if (normalized.length === 0) return { tool: null, reason: 'no_match' };
  for (const rule of RULES) {
    if (rule.test(normalized)) return rule.build(text);
  }
  return { tool: null, reason: 'no_match' };
}

/**
 * Classify `text`, dispatch the matched tool through the supplied
 * `McpToolDispatcher`, and return a renderable result. When nothing
 * matches the result carries `matched: false` and a graceful message
 * the REPL can echo back to the user.
 *
 * Multiple intents in a single string are NOT chained here — the
 * caller can invoke `dispatchAgenticIntent` per line / per concern.
 *
 * `lang` localizes the no-match notice (i18n, 269-003); defaults to 'en'
 * so existing two-arg callers keep their exact output.
 */
export async function dispatchAgenticIntent(
  text: string,
  dispatcher: McpToolDispatcher,
  lang: string = 'en',
): Promise<AgenticDispatchResult> {
  const intent = classifyAgenticIntent(text);
  if (intent.tool === null) {
    return {
      matched: false,
      output: getMessage('chat.agentic_no_match', lang),
    };
  }
  const output = await dispatcher.dispatch(intent.tool, intent.args);
  return { matched: true, tool: intent.tool, args: intent.args, output };
}
