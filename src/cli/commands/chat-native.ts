// ═══ chat-native — Path C tool-use loop iskelet (Sprint 203 T-203-005) ═══
//
// Path B (`deckent chat`, src/cli/commands/chat.ts) spawns the user's host
// AI CLI and lets that CLI drive tool calls via host-side MCP attachment.
// Path C (this file) is the foundation for `deckent` driving its OWN
// tool-use loop: user → provider → tool_use → MCP dispatch → response.
//
// THIS IS A SKELETON. No real SDK call lives here yet. The loop is fully
// dependency-injected (provider + dispatcher + I/O streams) so:
//   - tests can drive the full round-trip with mocks (T-203-005),
//   - future tasks bolt on a real ChatProviderAdapter (Claude/Codex/Gemini
//     streaming SDK) and a real McpToolDispatcher (in-process MCP registry).
//
// Companion tasks: T-203-006 (memory wire — appendChatTurn),
// T-203-007 (CLI flag — `deckent chat --native`).

// ─── Types ──────────────────────────────────────────────────────────

/** One conversational turn passed back and forth with the provider. */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  /** Present on assistant turns that requested a tool call. */
  toolCalls?: ToolCall[];
  /** Present on tool turns: links the result back to a prior call id. */
  toolUseId?: string;
}

/** A single tool invocation parsed out of a provider response. */
export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/**
 * Provider response shape — deliberately minimal. A real adapter will lift
 * this from the SDK's streaming events; the skeleton only cares about
 * "did we end the turn or do we need to dispatch tools?".
 */
export interface ProviderResponse {
  text?: string;
  toolCalls?: ToolCall[];
  stopReason: 'end_turn' | 'tool_use';
}

/** Pluggable LLM backend — tests inject a fake, future tasks wire SDKs. */
export interface ChatProviderAdapter {
  send(messages: ChatMessage[]): Promise<ProviderResponse>;
}

/** Pluggable MCP tool dispatcher — wraps the in-process MCP registry. */
export interface McpToolDispatcher {
  dispatch(name: string, args: Record<string, unknown>): Promise<string>;
}

/** Minimal memory interface for chat session persistence (duck-typed for MemoryStore). */
export interface ChatMemoryAdapter {
  appendChatTurn(sessionId: string, role: 'user' | 'assistant', content: string): number;
  getChatHistory(sessionId: string, limit?: number): ReadonlyArray<{ role: string; content: string }>;
}

export interface ChatNativeOptions {
  provider: ChatProviderAdapter;
  dispatcher: McpToolDispatcher;
  /** Each yielded string is one user REPL turn. End the iterator to exit. */
  input: AsyncIterable<string>;
  output: (line: string) => void;
  /** Hard cap on outer turns — guards against runaway agent loops. */
  maxTurns?: number;
  /** Hard cap on inner tool-dispatch iterations per user turn. */
  maxToolHops?: number;
  /** Optional memory adapter — persists each turn via appendChatTurn. */
  memory?: ChatMemoryAdapter;
  /** Session id used when memory is wired. Auto-generated if omitted. */
  sessionId?: string;
  /** Load this many prior turns from memory on startup (0 = fresh session). */
  resumeLimit?: number;
}

const DEFAULT_MAX_TURNS = 50;
const DEFAULT_MAX_TOOL_HOPS = 10;
const EXIT_COMMANDS: readonly string[] = [':exit', ':quit'];

// ─── Fallback Tool-Call Parser ──────────────────────────────────────
//
// Some providers stream tool-use as plain text containing a JSON-tagged
// block. This parser is a last-resort heuristic so the skeleton remains
// useful when the adapter cannot pre-structure toolCalls itself.

const TOOL_CALL_TAG_RE = /<tool_use\b[^>]*>([\s\S]*?)<\/tool_use>/i;

export function parseToolCallFromText(text: string): ToolCall | null {
  const match = TOOL_CALL_TAG_RE.exec(text);
  const body = match?.[1];
  if (!body) return null;
  try {
    const parsed = JSON.parse(body.trim()) as Partial<ToolCall>;
    if (typeof parsed.name !== 'string' || typeof parsed.id !== 'string') return null;
    const args = (parsed.args && typeof parsed.args === 'object') ? parsed.args : {};
    return { id: parsed.id, name: parsed.name, args };
  } catch {
    return null;
  }
}

// ─── The Loop ───────────────────────────────────────────────────────

/**
 * Native tool-use REPL loop. Returns the full transcript when the input
 * iterator drains, the user types an exit command, or `maxTurns` is hit.
 *
 * The loop is intentionally flat and synchronous-shaped:
 *   outer while(user turn) →
 *     provider.send →
 *     inner while(stopReason === 'tool_use') → dispatcher.dispatch → re-send
 *   → output assistant text → next user turn.
 */
export async function runChatNativeLoop(opts: ChatNativeOptions): Promise<ChatMessage[]> {
  const { provider, dispatcher, input, output } = opts;
  const maxTurns = opts.maxTurns ?? DEFAULT_MAX_TURNS;
  const maxToolHops = opts.maxToolHops ?? DEFAULT_MAX_TOOL_HOPS;
  const memStore = opts.memory;
  const sessionId = (opts.sessionId && opts.sessionId.trim().length > 0)
    ? opts.sessionId
    : `chat-${Date.now()}`;
  const resumeLimit = opts.resumeLimit ?? 0;

  const transcript: ChatMessage[] = [];
  let turnCount = 0;

  if (memStore && resumeLimit > 0) {
    const history = memStore.getChatHistory(sessionId, resumeLimit);
    for (const turn of history) {
      const role: 'user' | 'assistant' = turn.role === 'assistant' ? 'assistant' : 'user';
      transcript.push({ role, content: turn.content });
    }
  }

  for await (const rawLine of input) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    if (EXIT_COMMANDS.includes(line.toLowerCase())) break;
    if (turnCount >= maxTurns) {
      output(`[chat-native] maxTurns (${maxTurns}) reached — ending session.`);
      break;
    }
    turnCount++;

    transcript.push({ role: 'user', content: line });
    memStore?.appendChatTurn(sessionId, 'user', line);

    let response = await provider.send(transcript);
    let toolHops = 0;
    while (response.stopReason === 'tool_use' && response.toolCalls?.length) {
      if (toolHops >= maxToolHops) {
        output(`[chat-native] maxToolHops (${maxToolHops}) reached — aborting tool chain.`);
        break;
      }
      toolHops++;

      transcript.push({
        role: 'assistant',
        content: response.text ?? '',
        toolCalls: response.toolCalls,
      });

      for (const call of response.toolCalls) {
        const result = await dispatcher.dispatch(call.name, call.args);
        transcript.push({ role: 'tool', content: result, toolUseId: call.id });
      }

      response = await provider.send(transcript);
    }

    const assistantText = response.text ?? '';
    transcript.push({ role: 'assistant', content: assistantText });
    if (assistantText.length > 0) {
      output(assistantText);
      memStore?.appendChatTurn(sessionId, 'assistant', assistantText);
    }
  }

  return transcript;
}
