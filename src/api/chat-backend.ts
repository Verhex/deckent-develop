// ═══ chat-backend — Path A embedded chat (Sprint 214 T-214-007) ════════
//
// Wires F2 `runChatNativeLoop` (src/cli/commands/chat-native.ts) into a
// server-side, single-shot handler suitable for the `/api/chat` HTTP
// endpoint. The browser POSTs `{ sessionId?, message }` and the server
// returns `{ sessionId, reply, transcript }`.
//
// IMPORTANT:
//   - No host CLI is required on the user's machine. Production wires a
//     real ProviderAdapter (subscription spawn via
//     `createSubscriptionChatAdapter`); tests inject a mock
//     ChatProviderAdapter.
//   - This module is pure logic — it does NOT import the http server.
//     `src/api/server.ts` will call `handleChatBackendRequest` from its
//     `/api/chat` branch in a follow-up wire-up; that's out of scope for
//     this task (worker scope = chat-backend.ts only).

import {
  runChatNativeLoop,
  createMcpToolDispatcher,
  type ChatProviderAdapter,
  type ChatMessage,
  type ChatMemoryAdapter,
  type McpToolDispatcher,
  type McpToolRegistry,
} from '../cli/commands/chat-native.js';
import type { ProviderAdapter } from '../core/provider.js';

// Re-export so callers (server.ts, tests) get the adapter contract from
// one place without reaching into cli/commands/.
export type { ChatProviderAdapter, ChatMessage, ChatMemoryAdapter };

/** Browser → server payload for `/api/chat`. */
export interface ChatBackendRequest {
  /** Free-form user text. Required (non-empty after trim). */
  message: string;
  /** Optional client-supplied session id for multi-turn continuity. */
  sessionId?: string;
}

/** Server → browser payload for `/api/chat`. */
export interface ChatBackendResponse {
  /** Echoed or freshly-minted session id — clients persist this. */
  sessionId: string;
  /** Concatenated final assistant text for the turn. */
  reply: string;
  /** Full transcript of THIS turn (history + new exchanges). */
  transcript: ChatMessage[];
}

/**
 * Dependencies injected by the server. The provider is mandatory; everything
 * else is optional and degrades gracefully.
 *
 * - `provider`: ChatProviderAdapter — the loop's LLM contract. Production
 *   resolves a {@link ProviderAdapter} from `providerRegistry` and wraps it
 *   via `createSubscriptionChatAdapter`. Tests inject a fake.
 * - `dispatcher` OR `toolRegistry`: tool-use surface. If neither is set,
 *   the loop falls back to a no-op dispatcher that returns an mcp-error
 *   string (the model can still complete an end_turn without tools).
 * - `memory`: enables multi-turn continuity across `/api/chat` requests
 *   by sharing a sessionId.
 */
export interface ChatBackendDeps {
  provider: ChatProviderAdapter;
  dispatcher?: McpToolDispatcher;
  toolRegistry?: McpToolRegistry;
  memory?: ChatMemoryAdapter;
  /** Hard cap on outer turns per request. Default 1 — single round-trip. */
  maxTurns?: number;
  /** Hard cap on inner tool hops in this single round-trip. Default 10. */
  maxToolHops?: number;
  /** How many prior turns to load from memory on each request. Default 50. */
  resumeLimit?: number;
}

const NOOP_DISPATCHER: McpToolDispatcher = {
  async dispatch(name) {
    return `[mcp-error] no dispatcher configured for ${name}`;
  },
};

/**
 * One-shot input iterator — feeds the user's single browser message into
 * `runChatNativeLoop`, then signals EOF so the loop returns.
 */
async function* singleMessageIterator(line: string): AsyncIterable<string> {
  yield line;
}

function resolveDispatcher(deps: ChatBackendDeps): McpToolDispatcher {
  if (deps.dispatcher) return deps.dispatcher;
  if (deps.toolRegistry) return createMcpToolDispatcher({ registry: deps.toolRegistry });
  return NOOP_DISPATCHER;
}

function lastAssistantText(transcript: readonly ChatMessage[]): string {
  for (let i = transcript.length - 1; i >= 0; i--) {
    const m = transcript[i];
    if (m && m.role === 'assistant' && m.content.length > 0) return m.content;
  }
  return '';
}

/**
 * Handle one browser → server chat round-trip.
 *
 * The loop accepts the user's message, possibly fans out via the
 * dispatcher to MCP tools (e.g. `deckent_status`), and returns once the
 * provider emits an `end_turn` response. Memory persistence (sessionId
 * + appendChatTurn) supplies multi-turn behaviour across requests.
 */
export async function handleChatBackendRequest(
  request: ChatBackendRequest,
  deps: ChatBackendDeps,
): Promise<ChatBackendResponse> {
  const message = (request.message ?? '').trim();
  if (message.length === 0) {
    throw new Error('chat-backend: message is required');
  }

  const sessionId = request.sessionId?.trim().length
    ? request.sessionId.trim()
    : `chat-${Date.now()}`;

  const transcript = await runChatNativeLoop({
    provider: deps.provider,
    dispatcher: resolveDispatcher(deps),
    input: singleMessageIterator(message),
    output: () => {
      // Browser receives the final transcript / reply — incremental
      // stdout sinking is not used in the single-shot HTTP path. SSE
      // streaming is a follow-up (ADR-074 streaming canlı).
    },
    maxTurns: deps.maxTurns ?? 1,
    maxToolHops: deps.maxToolHops ?? 10,
    memory: deps.memory,
    sessionId,
    // resumeLimit > 0 only makes sense when memory is wired.
    resumeLimit: deps.memory ? (deps.resumeLimit ?? 50) : 0,
  });

  return {
    sessionId,
    reply: lastAssistantText(transcript),
    transcript,
  };
}

/**
 * Type-only re-export so server.ts can type the registry-resolved
 * adapter alongside the loop adapter without a second import path.
 * (Production wire: registry.getProvider(...) → createSubscriptionChatAdapter
 *   → handleChatBackendRequest.)
 */
export type ServerSideProviderAdapter = ProviderAdapter;
