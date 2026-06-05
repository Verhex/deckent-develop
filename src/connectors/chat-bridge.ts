/**
 * BOT chat bridge (§4G) — drive deckent's native agentic chat engine from a
 * messaging connector, so Telegram becomes a full conversational head (not just
 * approve/reject). One inbound text → one agentic reply string.
 *
 * Slice 1 safety posture (advisor): the default provider is the SUBSCRIPTION
 * claude adapter, which never emits tool_use — the model can converse but cannot
 * itself decide to run a tool. Recognized read-only intents (status/recall/
 * history) still ground answers via agenticDispatch; risky actions are DENIED by
 * the default confirm (no destructive surface over chat yet). Slice 2 swaps in a
 * tool_use provider and routes risky actions through the BOT-002 approve gate.
 *
 * Correctness guards the advisor flagged as blocking:
 *  - per-session serialization (a stateful chat corrupts under concurrent turns)
 *  - graceful errors (the bot must always reply, never silently die)
 *  - Telegram 4096-char chunking (sendMessage throws on long replies)
 */

import {
  runChatNativeLoop,
  buildSubscriptionPrompt,
  defaultSubscriptionSpawn,
  type ChatProviderAdapter,
  type McpToolDispatcher,
  type ChatMemoryAdapter,
} from '../cli/commands/chat-native.js';
import { createCliToolDispatcher } from '../cli/commands/chat-tool-bridge.js';
import { classifyActionRisk, type AgenticAction } from '../cli/commands/agentic-confirm.js';

/** Default provider: subscription claude (API key stripped → session auth, no tool_use). */
function defaultSubscriptionProvider(): ChatProviderAdapter {
  return {
    async send(messages) {
      const prompt = buildSubscriptionPrompt(messages);
      const env: NodeJS.ProcessEnv = { ...process.env };
      delete env['ANTHROPIC_API_KEY'];
      delete env['DECKENT_CLAUDE_API_KEY'];
      const { chunks, wait } = defaultSubscriptionSpawn('claude', ['--print', prompt], env);
      let text = '';
      for await (const chunk of chunks) text += chunk;
      await wait;
      return { text, stopReason: 'end_turn' };
    },
  };
}

/** Slice-1 confirm: auto-approve read-only (safe) intents, DENY risky ones. */
const denyRiskyConfirm = async (action: AgenticAction): Promise<boolean> =>
  classifyActionRisk(action) === 'safe';

export interface ChatResponderDeps {
  /** Chat provider. Default: subscription claude (no tool_use surface). */
  provider?: ChatProviderAdapter;
  /** Tool dispatcher for agenticDispatch/slash. Default: CLI bridge (read-only via confirm). */
  dispatcher?: McpToolDispatcher;
  /** Risky-action gate. Default: deny risky, allow safe (slice 1). */
  confirm?: (action: AgenticAction) => Promise<boolean>;
  /** Conversation memory (per-session history). Omit for stateless turns. */
  memory?: ChatMemoryAdapter;
  maxTurns?: number;
  maxToolHops?: number;
  /** Prior turns to load from memory for context (default 30 when memory wired). */
  resumeLimit?: number;
}

export type ChatResponder = (sessionId: string, text: string) => Promise<string>;

/**
 * Build a responder: (sessionId, text) → agentic reply. Turns for the SAME
 * sessionId are serialized (queued) so concurrent/overlapping messages never
 * corrupt the shared conversation; different sessions run concurrently.
 */
export function makeChatResponder(deps: ChatResponderDeps = {}): ChatResponder {
  const chains = new Map<string, Promise<unknown>>();

  async function runTurn(sessionId: string, text: string): Promise<string> {
    const provider = deps.provider ?? defaultSubscriptionProvider();
    const dispatcher = deps.dispatcher ?? createCliToolDispatcher();
    const collected: string[] = [];

    const transcript = await runChatNativeLoop({
      provider,
      dispatcher,
      input: singleMessage(text),
      output: (line) => { if (line) collected.push(line); },
      agenticDispatch: true,
      agenticConfirm: deps.confirm ?? denyRiskyConfirm,
      gracefulErrors: true, // a provider failure becomes a tagged turn, not a throw
      maxTurns: deps.maxTurns ?? 1,
      maxToolHops: deps.maxToolHops ?? 6,
      ...(deps.memory
        ? { memory: deps.memory, sessionId, resumeLimit: deps.resumeLimit ?? 30 }
        : { sessionId }),
    });

    const streamed = collected.join('').trim();
    if (streamed) return streamed; // agenticDispatch result / streamed provider text
    return lastAssistantText(transcript);
  }

  return (sessionId: string, text: string): Promise<string> => {
    const prev = chains.get(sessionId) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(() => runTurn(sessionId, text));
    chains.set(
      sessionId,
      next.finally(() => {
        if (chains.get(sessionId) === next) chains.delete(sessionId);
      }),
    );
    return next;
  };
}

async function* singleMessage(text: string): AsyncIterable<string> {
  yield text;
}

function lastAssistantText(transcript: ReadonlyArray<{ role: string; content: string }>): string {
  for (let i = transcript.length - 1; i >= 0; i--) {
    const m = transcript[i];
    if (m && m.role === 'assistant' && m.content.trim().length > 0) return m.content.trim();
  }
  return '';
}

/**
 * Split a reply into Telegram-safe chunks (≤ limit chars), preferring newline
 * boundaries; hard-splits a single oversized line. Telegram rejects messages
 * over ~4096 chars, so tool output / logs must be chunked before send.
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
