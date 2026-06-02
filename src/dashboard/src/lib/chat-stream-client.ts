/**
 * chat-stream-client — Dashboard SSE consumer for /api/chat/stream (F2-007).
 *
 * EventSource cannot send Authorization headers, so the API token rides as a
 * `?token=` query parameter — matching the same pattern used by `buildSseUrl`
 * in api.ts for the /api/events SSE channel. The user message goes on
 * `?message=` since EventSource only supports GET requests.
 *
 * Stream event shapes (from chat-stream.ts):
 *   { type: 'chunk', text: string }   — incremental token, call onChunk
 *   { type: 'done',  reply: string }  — full reply accumulated, call onDone + close
 *   { type: 'error', message: string } — server-side error, call onError + close
 */

import { getBootstrapApiToken } from "./api";

export interface ChatStreamHandlers {
  onChunk: (text: string) => void;
  onDone: (reply: string) => void;
  onError: (message: string) => void;
}

export interface ChatStreamController {
  close: () => void;
}

/**
 * Build the EventSource URL for the chat-stream endpoint.
 * Encodes `message` and the bootstrap API token as query params.
 */
export function buildChatStreamUrl(
  message: string,
  baseUrl = "/api/chat/stream",
): string {
  const params = new URLSearchParams({ message });
  const token = getBootstrapApiToken();
  if (token) params.set("token", token);
  return `${baseUrl}?${params.toString()}`;
}

/**
 * Open an SSE connection to /api/chat/stream and dispatch events via handlers.
 *
 * Returns a controller whose `close()` method tears down the EventSource.
 * The connection is also closed automatically on `done` and `error` events.
 */
export function streamChatResponse(options: {
  message: string;
  handlers: ChatStreamHandlers;
}): ChatStreamController {
  const { message, handlers } = options;
  const url = buildChatStreamUrl(message);
  const es = new EventSource(url);
  let closed = false;

  function teardown(): void {
    if (!closed) {
      closed = true;
      es.close();
    }
  }

  es.onmessage = (event: MessageEvent) => {
    if (closed) return;
    let parsed: { type: string; text?: string; reply?: string; message?: string };
    try {
      parsed = JSON.parse(event.data as string) as typeof parsed;
    } catch {
      handlers.onError("failed to parse stream event");
      teardown();
      return;
    }

    if (parsed.type === "chunk" && typeof parsed.text === "string") {
      handlers.onChunk(parsed.text);
    } else if (parsed.type === "done" && typeof parsed.reply === "string") {
      handlers.onDone(parsed.reply);
      teardown();
    } else if (parsed.type === "error") {
      handlers.onError(parsed.message ?? "unknown stream error");
      teardown();
    }
  };

  es.onerror = () => {
    if (closed) return;
    handlers.onError("stream connection error");
    teardown();
  };

  return { close: teardown };
}
