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
import { createPersistentClaudeSession } from '../cli/commands/chat-session.js';
import { classifyActionRisk, type AgenticAction } from '../cli/commands/agentic-confirm.js';
import { makeGatedDispatcher, hasRealPendingCheckpoint, DECKENT_BOT_SYSTEM_PROMPT } from './bot-agentic.js';
import { parkBotAction, isSprintScopedDestructive } from './bot-action-store.js';
import { getCurrentSprintId } from '../monitor/sprint-state.js';

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
  /**
   * Slice 2 — agentic mode: use a tool_use-capable persistent provider (the model
   * can drive actions) and route every tool through the GATED dispatcher
   * (read-only auto-exec, risky → park for phone approval). Requires `root` for
   * the durable action store. Default false = slice-1 subscription chat.
   */
  agentic?: boolean;
  /** Project root — required for `agentic` (durable parked-action store). */
  root?: string;
  /** Ack/parked-action message language. */
  lang?: string;
}

export interface ChatResponder {
  (sessionId: string, text: string): Promise<string>;
  /** Release the warm persistent provider child (agentic mode). Best-effort. */
  dispose?(): Promise<void>;
}

/**
 * Build a responder: (sessionId, text) → agentic reply. Turns for the SAME
 * sessionId are serialized (queued) so concurrent/overlapping messages never
 * corrupt the shared conversation; different sessions run concurrently.
 */
type PersistentProvider = ChatProviderAdapter & { exit?(): Promise<void> };

export function makeChatResponder(deps: ChatResponderDeps = {}): ChatResponder {
  const chains = new Map<string, Promise<unknown>>();
  const lang = deps.lang ?? 'en';

  // Agentic mode holds ONE warm persistent child across every turn (the whole
  // point — eliminates per-message cold-start); created lazily on first use.
  let persistent: PersistentProvider | undefined;
  function agenticProvider(): ChatProviderAdapter {
    if (deps.provider) return deps.provider;
    if (!persistent) {
      persistent = createPersistentClaudeSession({ systemPrompt: DECKENT_BOT_SYSTEM_PROMPT });
    }
    return persistent;
  }

  async function runTurn(sessionId: string, text: string): Promise<string> {
    const collected: string[] = [];

    // Provider + dispatcher differ by mode. Agentic: tool_use provider + GATED
    // dispatcher (the single safety chokepoint — model tool_use is otherwise
    // ungated by the loop). Slice 1: subscription (no tool_use) + deny-risky.
    let provider: ChatProviderAdapter;
    let dispatcher: McpToolDispatcher;
    let confirm: (action: AgenticAction) => Promise<boolean>;

    if (deps.agentic) {
      if (!deps.root) throw new Error('chat-bridge: agentic mode requires `root` for the action store');
      const root = deps.root;
      provider = agenticProvider();
      const inner = deps.dispatcher ?? createCliToolDispatcher();
      dispatcher = makeGatedDispatcher({
        inner,
        park: (tool, args) =>
          parkBotAction(root, {
            tool,
            args,
            channelId: sessionId,
            // Bind the active sprint for destructive tools so a later approval
            // can't hit a different/later sprint (re-verified at execute time).
            ...(isSprintScopedDestructive(tool)
              ? { boundSprintId: getCurrentSprintId(root) ?? undefined }
              : {}),
          }),
        // Sprint 238 İŞ3: suppress the spurious "checkpoint awaiting approval"
        // alarm — a model-initiated deckent_checkpoint with nothing pending is a
        // no-op, not an approval gate.
        hasPendingCheckpoint: () => hasRealPendingCheckpoint(root),
        lang,
      });
      confirm = async () => true; // gating lives in the wrapper, not here
    } else {
      provider = deps.provider ?? defaultSubscriptionProvider();
      dispatcher = deps.dispatcher ?? createCliToolDispatcher();
      confirm = deps.confirm ?? denyRiskyConfirm;
    }

    const transcript = await runChatNativeLoop({
      provider,
      dispatcher,
      input: singleMessage(text),
      output: (line) => { if (line) collected.push(line); },
      agenticDispatch: true,
      agenticConfirm: confirm,
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

  const responder = ((sessionId: string, text: string): Promise<string> => {
    const prev = chains.get(sessionId) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(() => runTurn(sessionId, text));
    chains.set(
      sessionId,
      next.finally(() => {
        if (chains.get(sessionId) === next) chains.delete(sessionId);
      }),
    );
    return next;
  }) as ChatResponder;

  responder.dispose = async (): Promise<void> => {
    try {
      await persistent?.exit?.();
    } catch {
      // best-effort — the child also dies with the host process
    }
  };

  return responder;
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

// chunkMessage now lives in the dependency-free message-format.ts so the notify
// hot-path can use it without loading this chat/LLM engine. Re-exported here for
// backward compatibility with existing importers.
export { chunkMessage } from './message-format.js';
