// ═══ chat-stream — F2-007 token-streaming surface (Sprint 219 T-219-007) ═
//
// `streamChatMessage` exposes the chat backend as an async generator of
// stream chunks. Two consumers tap it:
//   1. The CLI REPL (Task 219-008) — drains the generator directly.
//   2. The HTTP `/api/chat/stream` SSE endpoint in `server.ts` — formats each
//      chunk as `data: ${JSON}\n\n` via the `streamToSseLines` helper.
//
// The module is intentionally pure logic: it never opens sockets, never
// reads gitignored state, and never spawns a CLI. Tests inject a mock
// `ChatProviderAdapter` and assert on the yielded chunk sequence.
//
// Tool-use mid-stream is OUT of scope for the V1 streaming surface — the
// non-streaming `/api/chat` JSON path (handleChatBackendRequest) still
// owns tool dispatch. F2-007 focuses on Claude-style incremental TEXT
// output for the single-shot end_turn case.

import type {
  ChatProviderAdapter,
  ChatMessage,
  StreamChunk,
} from '../cli/commands/chat-native.js';

export type { ChatProviderAdapter };

/** One event yielded by {@link streamChatMessage}. */
export type ChatStreamEvent =
  | { type: 'chunk'; text: string }
  | { type: 'done'; reply: string }
  | { type: 'error'; message: string };

export interface StreamChatOptions {
  /**
   * Prior conversation turns to prepend before the new user message. The
   * server-side caller is responsible for resume / sliding-window logic;
   * `streamChatMessage` just forwards what it is given.
   */
  history?: readonly ChatMessage[];
}

/**
 * Stream a single user → assistant round-trip from a {@link ChatProviderAdapter}.
 *
 * Emits a sequence of `chunk` events (one per provider stream delta) followed
 * by exactly one terminal event (`done` on success, `error` on any failure).
 *
 * Behaviour:
 *   - When `adapter.stream` is defined, each {@link StreamChunk} with non-empty
 *     `text` is forwarded as a `chunk` event; the accumulated full text is
 *     emitted as a single `done` event after the stream drains.
 *   - When only `adapter.send` exists, the full reply is yielded as ONE chunk
 *     followed by `done` — keeping the consumer contract uniform.
 *   - An empty / whitespace-only `message` yields a single `error` event and
 *     stops (no provider call).
 *   - Any throw from `adapter.stream()` or `adapter.send()` is caught and
 *     translated into a single `error` event — the generator never rejects.
 */
export async function* streamChatMessage(
  message: string,
  adapter: ChatProviderAdapter,
  opts: StreamChatOptions = {},
): AsyncGenerator<ChatStreamEvent, void, void> {
  const trimmed = (message ?? '').trim();
  if (trimmed.length === 0) {
    yield { type: 'error', message: 'chat-stream: message is required' };
    return;
  }

  const history = opts.history ?? [];
  const messages: ChatMessage[] = [...history, { role: 'user', content: trimmed }];

  let collected = '';

  try {
    if (adapter.stream) {
      for await (const chunk of adapter.stream(messages)) {
        if (typeof chunk.text === 'string' && chunk.text.length > 0) {
          collected += chunk.text;
          yield { type: 'chunk', text: chunk.text };
        }
        if (chunk.done && typeof chunk.done.text === 'string' && collected.length === 0) {
          // Adapter only sent text inside the terminal `done` marker.
          collected = chunk.done.text;
          yield { type: 'chunk', text: chunk.done.text };
        }
      }
    } else {
      const response = await adapter.send(messages);
      const text = response.text ?? '';
      if (text.length > 0) {
        collected = text;
        yield { type: 'chunk', text };
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    yield { type: 'error', message: msg };
    return;
  }

  yield { type: 'done', reply: collected };
}

/**
 * Format a chat-stream event sequence as SSE `data:` frames.
 *
 * Each event becomes one `data: ${JSON}\n\n` line. Production callers pipe
 * the resulting lines into a `text/event-stream` `ServerResponse`; tests use
 * it to assert on the wire format without standing up an HTTP server.
 */
export async function* streamToSseLines(
  events: AsyncIterable<ChatStreamEvent>,
): AsyncIterable<string> {
  for await (const event of events) {
    yield `data: ${JSON.stringify(event)}\n\n`;
  }
}

// Re-export for callers that want to consume raw provider chunks alongside
// the higher-level ChatStreamEvent shape.
export type { StreamChunk };
