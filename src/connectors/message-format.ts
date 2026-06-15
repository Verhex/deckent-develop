// ═══ Connector message formatting — dependency-free outbound helpers ═════════
// Lives apart from chat-bridge.ts (which pulls in the full chat/LLM engine) so
// the notify hot-path (connector-notify-adapter, sprint lifecycle) can chunk
// messages WITHOUT transitively loading the chat engine. chat-bridge re-exports
// chunkMessage for backward compatibility.

/**
 * Split a reply into Telegram-safe chunks (≤ limit chars), preferring newline
 * boundaries; hard-splits a single oversized line. Telegram rejects messages
 * over ~4096 chars, so tool output / logs / long notifications must be chunked
 * before send. NON-LOSSY — no words/content are dropped (only a single newline
 * separator is consumed at each split boundary); the bot is meaningless if it
 * truncates, so split instead of cut.
 */
export function chunkMessage(text: string, limit = 4000): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf('\n', limit);
    if (cut <= 0) cut = limit; // no newline in window → hard split
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/, '');
  }
  if (rest.length > 0) chunks.push(rest);
  return chunks;
}
