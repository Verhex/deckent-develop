// ─── /api/chat handler ───────────────────────────────────────────────────
// Closes the dashboard ChatPage stub: POST { message } → { reply }.
// Minimal but real — recognizes status/help commands and always returns
// actionable guidance (never a "not implemented" stub or 404).

export interface ChatContext {
  /** Returns a one-line current sprint status summary, if available. */
  status?: () => string;
}

const HELP =
  'Kullanılabilir komutlar: "status" — güncel sprint durumu. ' +
  'Sprint başlatmak/izlemek için dashboard panellerini (New Sprint / Status) kullan.';

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
