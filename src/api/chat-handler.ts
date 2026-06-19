// ─── /api/chat handler ───────────────────────────────────────────────────
// Closes the dashboard ChatPage stub: POST { message } → { reply }.
//
// Two paths (Sprint 282 DASH-UX-1 fix, part-1):
//   - Explicit slash/command (status/help, or empty → command list) is owned
//     by the `buildChatReply` classifier — a fast, provider-free front-path.
//   - A natural-language message is routed to the configured
//     `ChatProviderAdapter` (the same SSOT the REPL and /api/chat/stream use)
//     so the dashboard gets a real LLM reply instead of "Anlamadım".
// When no adapter is configured, the adapter throws, or it returns an empty
// reply, `resolveChatReply` returns an HONEST i18n error — never a silent
// classifier fallback.

import type { ChatProviderAdapter } from './chat-stream.js';

export interface ChatContext {
  /** Returns a one-line current sprint status summary, if available. */
  status?: () => string;
}

const HELP =
  'Kullanılabilir komutlar: "status" — güncel sprint durumu. ' +
  'Sprint başlatmak/izlemek için dashboard panellerini (New Sprint / Status) kullan.';

// Explicit slash/command patterns the classifier owns. A natural-language
// message does NOT match here → it is routed to the provider adapter instead.
const COMMAND_RE = /^\/|\b(status|durum|help|yardım|komut)\b/i;

/**
 * True when `message` is an explicit slash/command the classifier handles
 * (status/help), a leading-slash command, or is empty (→ command list).
 * Natural-language messages return false and are routed to the adapter.
 */
export function isExplicitChatCommand(message: string): boolean {
  const m = message.trim();
  if (m.length === 0) return true;
  return COMMAND_RE.test(m);
}

export function buildChatReply(message: string, ctx: ChatContext): string {
  const m = message.trim().toLowerCase();
  if (!m) {
    return `Komutlar: "status", "help". ${HELP}`;
  }
  if (/\b(status|durum)\b/.test(m)) {
    const s = ctx.status?.() ?? 'No status available.';
    return `Sprint durumu: ${s}`;
  }
  if (/\b(help|yardım|komut)\b/.test(m)) {
    return HELP;
  }
  return `Anlamadım: "${message.trim()}". Komutlar: "status", "help". ${HELP}`;
}

// Honest provider-unavailable message — i18n (English default, Turkish). Kept
// local to the api layer because the CLI `getMessage` catalog
// (src/cli/helpers/messages.ts) is outside this task's scope; both languages
// are always present per the project's i18n-FIRST rule.
const PROVIDER_UNAVAILABLE_PREFIX: Record<'en' | 'tr', string> = {
  en: 'Chat provider unavailable',
  tr: 'Sohbet sağlayıcısı kullanılamıyor',
};

// i18n reasons for the two internal (non-thrown) failure modes. A reason thrown
// by the adapter itself is surfaced raw — matching the SSE error path which
// already exposes `err.message` verbatim (chat-stream consumer in server.ts).
const PROVIDER_UNAVAILABLE_REASON: Record<string, Record<'en' | 'tr', string>> = {
  not_configured: { en: 'no provider configured', tr: 'sağlayıcı yapılandırılmadı' },
  empty_reply: { en: 'provider returned an empty reply', tr: 'sağlayıcı boş yanıt döndürdü' },
};

function normalizeLang(lang?: string): 'en' | 'tr' {
  return lang === 'tr' ? 'tr' : 'en';
}

function providerUnavailable(reason: string, lang: 'en' | 'tr'): string {
  return `${PROVIDER_UNAVAILABLE_PREFIX[lang]}: ${reason}`;
}

// chat-agentic-dispatch: server-side slash-command dispatcher for /status, /recall, /plan.
// Returns the dispatch reply string, or null when the slash command is not recognised.
// Only handles slash-prefixed input (e.g. "/status") — keyword commands ("status", "help")
// remain on the buildChatReply classifier path (backward-compatible).
export function chatAgenticDispatch(message: string, ctx: ChatContext): string | null {
  const m = message.trim();
  if (!m.startsWith('/')) return null;

  const [cmd = ''] = m.slice(1).split(/\s+/);
  switch (cmd.toLowerCase()) {
    case 'status':
    case 'durum':
      return `Sprint durumu: ${ctx.status?.() ?? 'No status available.'}`;
    case 'recall':
      return 'Use `deckent recall "<query>"` in the terminal, or the Memory page in the dashboard.';
    case 'plan':
      return 'Use `deckent plan` in the terminal to see the current sprint plan.';
    default:
      return `Unknown slash command: ${m}. Available: /status, /recall, /plan.`;
  }
}

export interface ResolveChatReplyOptions {
  /** Configured provider adapter; null when none was resolved at server setup. */
  adapter?: ChatProviderAdapter | null;
  /** UI language for the honest error message ('tr' | 'en', default 'en'). */
  lang?: string;
}

/**
 * Resolve a chat reply for POST /api/chat.
 *
 * - Slash command (/status, /recall, /plan) → `chatAgenticDispatch`.
 * - Explicit keyword command (status/help/empty) → `buildChatReply` classifier.
 * - Natural-language message → `adapter.send()` (real provider reply).
 * - No adapter / adapter throws / empty reply → honest i18n error
 *   ("Chat provider unavailable: …") — never a silent classifier fallback.
 */
export async function resolveChatReply(
  message: string,
  ctx: ChatContext,
  opts: ResolveChatReplyOptions = {},
): Promise<string> {
  // Slash commands (/status, /recall, /plan) → chat-agentic-dispatch
  if (message.trim().startsWith('/')) {
    const dispatched = chatAgenticDispatch(message.trim(), ctx);
    if (dispatched !== null) return dispatched;
  }

  if (isExplicitChatCommand(message)) {
    return buildChatReply(message, ctx);
  }

  const lang = normalizeLang(opts.lang);
  const adapter = opts.adapter ?? null;
  if (!adapter) {
    return providerUnavailable(PROVIDER_UNAVAILABLE_REASON['not_configured']![lang], lang);
  }

  try {
    const response = await adapter.send([{ role: 'user' as const, content: message.trim() }]);
    const text = (response.text ?? '').trim();
    if (text.length === 0) {
      return providerUnavailable(PROVIDER_UNAVAILABLE_REASON['empty_reply']![lang], lang);
    }
    return text;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return providerUnavailable(reason, lang);
  }
}
