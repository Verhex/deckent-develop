// src/agent/provider-tooluse/sse.ts
// ═══ SSE parser — byte stream → {event?, data} records (SP-1 §5) ════════════
// Handles both OpenAI ('data:'-only) and Anthropic ('event:'+'data:') SSE.
// A record is flushed on a blank line; multiple 'data:' lines join with '\n'.
// No network — operates on any AsyncIterable<Uint8Array> (real body or canned).

export interface SSEEvent {
  event: string | undefined;
  data: string;
}

export async function* parseSSE(chunks: AsyncIterable<Uint8Array>): AsyncIterable<SSEEvent> {
  const decoder = new TextDecoder();
  let buf = '';
  let event: string | undefined;
  const dataLines: string[] = [];

  for await (const chunk of chunks) {
    buf += decoder.decode(chunk, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, '');
      buf = buf.slice(nl + 1);
      if (line === '') {
        if (dataLines.length > 0) {
          yield { event, data: dataLines.join('\n') };
          dataLines.length = 0;
          event = undefined;
        }
        continue;
      }
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
      // other lines (':' comments, 'id:', 'retry:') are ignored
    }
  }
  // Flush any remaining buffered text (no trailing newline in the stream)
  buf += decoder.decode(); // signal end-of-stream to TextDecoder
  if (buf.length > 0) {
    const line = buf.replace(/\r?\n$/, '');
    if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
    else if (line.startsWith('event:')) event = line.slice(6).trim();
  }
  if (dataLines.length > 0) yield { event, data: dataLines.join('\n') };
}
