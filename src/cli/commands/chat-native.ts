import { spawn as nodeSpawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DIRECTIVES_FILE } from '../../core/constants.js';
import {
  providerRegistry as defaultProviderRegistry,
  type ProviderAdapter,
  type ProviderRegistry,
} from '../../core/provider.js';
import { handleReplCommand } from './chat-repl-ux.js';
import { renderUserMessage, renderAssistantHeader, messageSeparator } from './chat-layout.js';
import { renderToolActivity } from './chat-render-region.js';
import { classifyAgenticIntent, dispatchAgenticIntent } from './chat-agentic-dispatch.js';
import { requireConfirmIfRisky, type AgenticAction } from './agentic-confirm.js';
import { buildSlashRegistry, renderHelp, resolveSlash } from './chat-slash-registry.js';
import {
  dispatchEnterpriseSlash,
  type EnterpriseSpawnFn,
} from './chat-enterprise-bridge.js';
import {
  getPendingNervous,
  renderNervousPrompt,
  handleNervousSlash,
} from './chat-nervous-bridge.js';
import {
  renderSessionList,
  resolveResumeTarget,
  renderResumedHistory,
} from './chat-resume.js';
import { getMessage } from '../helpers/messages.js';
import { buildInterrogationQuestions } from '../../core/directive-interrogator.js';
import { buildMcpBridge, type McpConfirmFn } from './chat-mcp-bridge.js';
import { McpClientBroker } from '../../mcp-client/broker.js';
// Aliased: this file already exports a local duck-typed `McpToolRegistry`
// interface (the in-process deckent_* tool registry); the external-MCP client
// registry class is a distinct type used only to compose the `/mcp` bridge.
import { McpToolRegistry as McpClientToolRegistry } from '../../mcp-client/registry.js';
import { loadMcpServers } from '../../mcp-client/config.js';
import { dispatchMcpSlash, type ReplMcpBridge } from '../repl/mcp-bridge.js';

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
  /**
   * Sprint 224 T-224-021 — optional token usage for the per-turn stats footer
   * (`⏱ 3.2s · 240 tok`). Populated by adapters that surface it (the persistent
   * claude session reads it from the stream-json `result` event); omitted by
   * adapters/tests that don't, in which case only the elapsed time is shown.
   */
  usage?: { inputTokens: number; outputTokens: number };
}

/**
 * One unit yielded by a streaming provider. Either a partial text delta to
 * write to stdout, or the terminal `done` marker carrying the full response.
 * A single chunk may carry both (final delta + done) so consumers don't have
 * to special-case the last text fragment.
 */
export interface StreamChunk {
  text?: string;
  done?: ProviderResponse;
}

/** Pluggable LLM backend — tests inject a fake, future tasks wire SDKs. */
export interface ChatProviderAdapter {
  send(messages: ChatMessage[]): Promise<ProviderResponse>;
  /**
   * Optional streaming variant. When defined, the loop drains it and writes
   * each `chunk.text` to output as it arrives; the chunk carrying `done`
   * supplies the final `ProviderResponse` used for tool-use branching.
   */
  stream?(messages: ChatMessage[]): AsyncIterable<StreamChunk>;
}

/** Pluggable MCP tool dispatcher — wraps the in-process MCP registry. */
export interface McpToolDispatcher {
  dispatch(name: string, args: Record<string, unknown>): Promise<string>;
}

// ─── mcp tool dispatch — toolRegistry bridge (Sprint 211 T-211-002) ─
//
// Bridges the loop's McpToolDispatcher onto a real, in-process mcp tool
// dispatch surface (toolRegistry: get(name)/list()). Read-only tools
// like deckent_status / deckent_memory_query are the intended call
// surface for a chat session — the registry shape is duck-typed so
// tests, the production server-side toolRegistry, or a custom allow-
// listed wrapper can all satisfy it without pulling the MCP server
// SDK into the loop module.

/** One entry in an in-process MCP tool registry. */
export interface McpToolEntry {
  name: string;
  invoke(args: Record<string, unknown>): Promise<string | object> | string | object;
}

/** Minimal lookup surface — get a tool by name, list available names. */
export interface McpToolRegistry {
  get(name: string): McpToolEntry | undefined;
  list(): readonly string[];
}

export interface McpDispatcherOptions {
  registry: McpToolRegistry;
  /**
   * Optional name allow-list. When set, dispatch refuses tools outside it
   * with a tagged error string — useful for restricting chat sessions to
   * read-only tools without modifying the registry itself.
   */
  allowList?: readonly string[];
}

/**
 * Build an McpToolDispatcher backed by a real MCP tool registry. The
 * returned dispatcher NEVER throws out of `dispatch()` — invocation errors
 * and unknown tools are returned as `[mcp-error] …` strings so the chat
 * loop can feed them back to the model as tool_result content.
 *
 * Non-string registry return values are JSON-stringified to honour the
 * existing McpToolDispatcher.dispatch contract (Promise<string>).
 */
export function createMcpToolDispatcher(opts: McpDispatcherOptions): McpToolDispatcher {
  const { registry: toolRegistry, allowList } = opts;
  const allowed = allowList ? new Set(allowList) : null;
  return {
    async dispatch(name, args) {
      if (allowed && !allowed.has(name)) {
        return `[mcp-error] tool not allowed: ${name}`;
      }
      const entry = toolRegistry.get(name);
      if (!entry) {
        return `[mcp-error] unknown tool: ${name}`;
      }
      try {
        const out = await entry.invoke(args);
        return typeof out === 'string' ? out : JSON.stringify(out);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `[mcp-error] ${name}: ${msg}`;
      }
    },
  };
}

/** Minimal memory interface for chat session persistence (duck-typed for MemoryStore). */
export interface ChatMemoryAdapter {
  appendChatTurn(sessionId: string, role: 'user' | 'assistant', content: string): number;
  getChatHistory(sessionId: string, limit?: number): ReadonlyArray<{ role: string; content: string }>;
  /** List recent chat sessions for the /resume picker (most-recently-active first). */
  listChatSessions?(limit?: number): ReadonlyArray<{ sessionId: string; turnCount: number; lastAt: string; preview: string }>;
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
  /** Sliding context window: only the last N turns are sent to the provider. Undefined = no truncation. */
  contextWindowSize?: number;
  /**
   * Sprint 219 T-219-002 — REPL hata graceful: when true, pre-call provider
   * failures (spawn ENOENT, network down, adapter throws BEFORE emitting any
   * output) are caught, surfaced as a tagged error turn, and the session
   * continues. Mid-stream errors (output already emitted) still propagate.
   * Default false preserves the prior `runChatNativeLoop` contract for
   * existing callers that need errors to bubble.
   */
  gracefulErrors?: boolean;
  /**
   * Sprint 221 T-221-002 — natural-language → MCP tool routing. When true,
   * each REPL line is first classified via {@link classifyAgenticIntent}; if
   * it matches a deckent_* tool (status/history/recall/plan) the call is
   * gated through {@link requireConfirmIfRisky} and then dispatched through
   * the supplied `dispatcher`, skipping the provider turn entirely. Default
   * false preserves the pre-T-221-002 behaviour for existing callers
   * (test suite) whose canned inputs include phrases like "check status" or
   * "how are we doing?" that would otherwise be intercepted by the STATUS_RE.
   */
  agenticDispatch?: boolean;
  /**
   * Injection point for the risky-confirm gate used when `agenticDispatch`
   * matches a tool. Defaults to {@link requireConfirmIfRisky} (auto-approves
   * safe read-only tools, prompts on stdin/stdout for risky ones). Tests
   * inject a stub to drive both branches deterministically.
   */
  agenticConfirm?: (action: AgenticAction) => Promise<boolean>;
  /**
   * Sprint 222 T-222-007 — enterprise slash bridge spawn injection. The
   * enterprise slashes (/cost /audit /rbac /flow) shell out to the deckent
   * CLI for their underlying handlers. Tests supply a fake `EnterpriseSpawnFn`
   * to stay hermetic — when omitted, {@link dispatchEnterpriseSlash} uses its
   * built-in child_process spawn against `dist/cli/entry.js`.
   */
  enterpriseSpawn?: EnterpriseSpawnFn;
  /**
   * Sprint 223 T-223-004 — chat-layout wire toggle. When true, each
   * provider-driven turn emits visual chrome via chat-layout so user input
   * and Deckent replies are clearly distinguishable in the REPL:
   *   - `renderUserMessage(line)` echoes the user line with the `›` prefix
   *   - `renderAssistantHeader()` announces the Deckent block before reply
   *   - `messageSeparator()` follows the assistant body
   * The chat-layout module is TTY-aware (plain prefixes on pipe contexts,
   * bold ANSI colour on TTY), so this flag controls structure only — never
   * raw colour escapes. Default `false` preserves the prior contract for
   * HTTP backends, slash-only callers, and the existing chat-native test
   * suites whose output assertions predate the chrome. The REPL entry point
   * (src/cli/entry.ts) opts in to render the conversation layout.
   */
  layoutEnabled?: boolean;
  /**
   * Optional "thinking" indicator started right after the assistant header is
   * emitted and stopped on the first byte of provider output (or in the
   * per-turn `finally` if the response is empty). Duck-typed to the
   * chat-spinner `Spinner` shape so the REPL entry point can pass a TTY-only
   * braille spinner while HTTP/test callers omit it (no-op). Only the
   * provider-driven path uses it — slash/agentic turns `continue` earlier and
   * keep their own UI semantics.
   */
  thinkingIndicator?: { start(): void; stop(): void };
  /**
   * Sprint 224 E4 — fires at the end of every assistant turn with the elapsed
   * time + token usage, so a non-layout (Ink) consumer can render its own stats
   * footer and accumulate session totals. Independent of `layoutEnabled`.
   */
  onTurnEnd?: (stats: { elapsedMs: number; usage?: ProviderResponse['usage'] }) => void;
  /**
   * Sprint 224 T-224-002 — interactive-TTY echo guard. When true, the input
   * is read by a `terminal: true` readline (224-001) which ALREADY echoes the
   * typed line to the screen. Re-emitting it via `renderUserMessage` would
   * double-print the prompt ("prompt tekrar gidiyor"), so on an interactive
   * TTY the layout user-echo is suppressed and we rely on readline's own echo
   * (the `› ` prompt prefix is supplied by the entry point). On non-TTY/pipe
   * callers there is NO readline echo, so the `› line` echo is kept — this
   * preserves the existing chat-native pipe-output assertions and the HTTP
   * backend contract. Set from `process.stdout.isTTY` by the REPL entry point;
   * default false.
   */
  interactiveTty?: boolean;
  /**
   * Sprint 224 T-224-002 — `/nervous` slash wire root. The `/nervous` slash
   * (list/accept/reject) reads .deckent/nervous-pending.json under this root
   * via the chat-nervous-bridge module. Tests inject a tmpdir; production
   * defaults to `process.cwd()` so the live `deckent` REPL points at the
   * current project. Caller-only here — the def lives in chat-nervous-bridge.ts.
   */
  nervousRoot?: string;
  /**
   * UI language for loop-emitted user-facing strings (currently the `/resume`
   * picker/blocks). Defaults to 'en'. The Ink REPL passes the resolved config
   * language so /resume output is localized (i18n-first).
   */
  lang?: string;
  /**
   * Sprint 269 T-269-003 — project root used by the `/directives` slash to
   * read DIRECTIVES.md. Tests inject a tmpdir fixture (hermetic file I/O);
   * production defaults to `process.cwd()` like the nervous bridge.
   */
  projectRoot?: string;
  /**
   * Sprint 280 T-280-004 — external-MCP `/mcp` wire. A pre-built bridge
   * (`buildMcpBridge` return). When provided (non-null) the `/mcp` slash routes
   * to it directly; when `null` it forces the honest no-server fall-through.
   * When OMITTED (the production/default), the loop builds a bridge lazily from
   * server-discovery (`loadMcpServers(projectRoot)`) and only when ≥1 MCP server
   * is configured — otherwise `/mcp` keeps its existing honest notice. Tests
   * inject a fake bridge to stay hermetic (no real MCP subprocess/connect).
   */
  mcpBridge?: ReplMcpBridge | null;
  /**
   * Sprint 280 T-280-004 — confirm gate for `/mcp call <tool>` (external MCP
   * tool = arbitrary side-effect). Defaults to auto-approve (an explicit
   * `/mcp call` is the user's consent); the REPL entry point may inject a
   * stricter prompt. Tests inject a stub to drive the cancel path.
   */
  mcpConfirm?: McpConfirmFn;
  /**
   * AS2-P2 — REPL `/provider` switcher parity. Called when the user types
   * `/provider <name>` in the loop; the caller (e.g. createSwitchableProvider)
   * rebuilds the underlying adapter. When omitted the switch is acknowledged
   * (confirmation message emitted) but no adapter rebuild occurs. Default-off
   * for backward compatibility with callers that don't wire a switcher.
   */
  switchProvider?: (providerName: string) => void;
}

const DEFAULT_MAX_TURNS = 50;
const DEFAULT_MAX_TOOL_HOPS = 10;
const EXIT_COMMANDS: readonly string[] = [':exit', ':quit'];

// ─── Per-turn stats footer (Sprint 224 T-224-021) ──────────────────
//
// `⏱ 3.2s · 240 tok` — dim line shown after each interactive-TTY reply.
// Elapsed is always shown; token count only when the provider surfaced usage
// (the persistent claude session reads it from the stream-json `result`
// event). Exported for unit tests.
function formatTokenCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
export function renderTurnStatsFooter(
  elapsedMs: number,
  usage?: { inputTokens: number; outputTokens: number },
): string {
  const parts = [`${(elapsedMs / 1000).toFixed(1)}s`];
  if (usage) parts.push(`${formatTokenCount(usage.outputTokens)} tok`);
  return `\x1b[2m⏱ ${parts.join(' · ')}\x1b[0m`;
}

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

// ─── Streaming Bridge ───────────────────────────────────────────────
//
// Drains provider.stream when available: each text chunk is written to the
// output sink as it arrives so users see incremental output; the chunk that
// carries `done` supplies the final ProviderResponse used downstream.
// Falls back to provider.send when stream is not implemented.

export async function runProviderTurn(
  provider: ChatProviderAdapter,
  messages: ChatMessage[],
  output: (line: string) => void,
): Promise<ProviderResponse> {
  if (!provider.stream) return provider.send(messages);

  let collectedText = '';
  let finalResponse: ProviderResponse | undefined;
  for await (const chunk of provider.stream(messages)) {
    if (typeof chunk.text === 'string' && chunk.text.length > 0) {
      collectedText += chunk.text;
      output(chunk.text);
    }
    if (chunk.done) finalResponse = chunk.done;
  }
  if (!finalResponse) {
    return { text: collectedText, stopReason: 'end_turn' };
  }
  if (typeof finalResponse.text !== 'string' && collectedText.length > 0) {
    return { ...finalResponse, text: collectedText };
  }
  return finalResponse;
}

// ─── Context Window Helper ──────────────────────────────────────────
//
// Returns the last `n` turns from the transcript (sliding window).
// When `n` is undefined the full transcript is returned unchanged.

export function getRecentTurns(transcript: ChatMessage[], n: number | undefined): ChatMessage[] {
  if (n === undefined || n <= 0 || transcript.length <= n) return transcript;
  return transcript.slice(-n);
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
  // Mutable: `/resume` switches the active session id so subsequent turns
  // append to (and continue) the resumed conversation.
  let sessionId = (opts.sessionId && opts.sessionId.trim().length > 0)
    ? opts.sessionId
    : `chat-${Date.now()}`;
  const resumeLimit = opts.resumeLimit ?? 0;
  const lang = opts.lang ?? 'en';
  // Most recently shown /resume list — lets `/resume <n>` pick by number.
  let lastResumeList: ReadonlyArray<{ sessionId: string; turnCount: number; lastAt: string; preview: string }> = [];
  // Sprint 280 T-280-004 — lazily-built external-MCP bridge for `/mcp`, cached
  // for the REPL session (one broker/connection pool per session). Built once
  // on first `/mcp` use when MCP servers are configured; `built` guards the
  // (cheap) discovery so a no-server session never re-probes every `/mcp`.
  let liveMcpBridge: ReplMcpBridge | null = null;
  let liveMcpBridgeBuilt = false;
  // Sprint 223 T-223-004 — chat-layout wire. emitLayout suppresses empty
  // strings (messageSeparator returns '' on non-TTY) so callers see only
  // meaningful chrome. Default-off so existing HTTP/test callers keep their
  // raw output contract; the REPL entry point opts in.
  const layoutOn = opts.layoutEnabled === true;
  const emitLayout = (text: string): void => {
    if (text.length > 0) output(text);
  };

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
    // Sprint 221 T-221-001 — slash command wire. Handle /exit, /quit, /clear
    // here so they work for ALL input sources (createReplLines filters them
    // at the readline layer, but HTTP backend / tests / agentic dispatch
    // pass raw lines straight through). `handleReplCommand` lives in
    // chat-repl-ux.ts; this is the caller, def excluded from grep.
    const slash = handleReplCommand(line);
    if (slash.action === 'exit') break;
    if (slash.action === 'clear') {
      transcript.length = 0;
      continue;
    }
    // Sprint 224 T-224-002 — `/nervous` slash wire (chat-nervous-bridge caller).
    // Intercepts `/nervous`, `/nervous accept <id>`, `/nervous reject <id>` so
    // pending nervous notifications are visible+actionable from the REPL. Runs
    // BEFORE the enterprise+registry path so the slash never round-trips to
    // claude. `nervousRoot` defaults to `process.cwd()` for the live REPL; tests
    // inject a tmpdir fixture for hermetic file I/O.
    if (line.startsWith('/nervous')) {
      const parts = line.split(/\s+/);
      const nervousArgs = parts.slice(1);
      const nervousRoot = opts.nervousRoot ?? process.cwd();
      const pending = getPendingNervous(nervousRoot);
      const isPlainList = nervousArgs.length === 0;
      const banner = isPlainList
        ? renderNervousPrompt(pending, opts.interactiveTty === true)
        : '';
      const slashResult = handleNervousSlash(
        nervousArgs,
        nervousRoot,
        opts.interactiveTty === true,
        lang,
      );
      const emitText = banner.length > 0 ? `${banner}\n${slashResult}` : slashResult;
      output(emitText);
      transcript.push({ role: 'user', content: line });
      transcript.push({ role: 'assistant', content: emitText });
      memStore?.appendChatTurn(sessionId, 'user', line);
      memStore?.appendChatTurn(sessionId, 'assistant', emitText);
      continue;
    }
    // Faz D — `/resume` chat-session resume. `/resume` lists recent sessions;
    // `/resume <n|id>` loads that session's history into the transcript (so the
    // model regains context) AND switches the active sessionId (so new turns
    // continue it). Runs BEFORE the registry so it never round-trips to claude.
    if (line === '/resume' || line.startsWith('/resume ')) {
      const arg = line.slice('/resume'.length).trim();
      let emitText: string;
      if (!memStore || typeof memStore.listChatSessions !== 'function') {
        emitText = getMessage('tui.resume_no_memory', lang);
      } else if (arg.length === 0) {
        lastResumeList = memStore.listChatSessions(10);
        emitText = renderSessionList(lastResumeList, lang);
      } else {
        const sessions = lastResumeList.length > 0 ? lastResumeList : memStore.listChatSessions(20);
        const target = resolveResumeTarget(arg, sessions);
        const history = target ? memStore.getChatHistory(target) : [];
        if (!target || history.length === 0) {
          emitText = getMessage('tui.resume_not_found', lang, { session: target ?? arg });
        } else {
          // Replace the in-memory transcript with the resumed context and
          // switch the active session so subsequent turns append/continue it.
          transcript.length = 0;
          for (const turn of history) {
            transcript.push({ role: turn.role === 'assistant' ? 'assistant' : 'user', content: turn.content });
          }
          sessionId = target;
          emitText = renderResumedHistory(target, history, lang);
        }
      }
      output(emitText);
      continue;
    }
    // Sprint 276 T-276-009 — `/interrogate` slash wire (PLAN-INT-1).
    // REPL-içi meta-komut: reads DIRECTIVES.md, builds structural interrogation
    // questions via buildInterrogationQuestions, and renders them inline.
    // No CLI-spawn, no tool-bridge — pure file read + pure fn call.
    // Tests inject opts.projectRoot for hermetic file I/O (same pattern as /directives).
    if (line === '/interrogate' || line.startsWith('/interrogate ')) {
      const interrRoot = opts.projectRoot ?? process.cwd();
      let interrText: string;
      try {
        const dirContent = readFileSync(join(interrRoot, DIRECTIVES_FILE), 'utf-8');
        const questions = buildInterrogationQuestions(dirContent, { lang });
        const intro = getMessage('interrogate.intro', lang);
        const numbered = questions.map((q, i) => `${i + 1}. ${q.text}`).join('\n');
        interrText = `${intro}\n\n${numbered}`;
      } catch {
        interrText = getMessage('chat.directives_not_found', lang, { root: interrRoot });
      }
      output(interrText);
      transcript.push({ role: 'user', content: line });
      transcript.push({ role: 'assistant', content: interrText });
      memStore?.appendChatTurn(sessionId, 'user', line);
      memStore?.appendChatTurn(sessionId, 'assistant', interrText);
      continue;
    }
    // AS2-P2 — `/provider` switcher parity: handle here (before the slash
    // registry which returns 'none' for /provider) so Path-C (HTTP/terminal)
    // has the same UX as the Ink REPL (app.tsx line ~431). The switchProvider
    // callback rebuilds the underlying adapter; when omitted the confirmation
    // is still emitted so the user knows the command was received.
    if (line === '/provider' || line.startsWith('/provider ')) {
      const arg = line.slice('/provider'.length).trim();
      let replyText: string;
      if (arg.length === 0) {
        replyText = getMessage('tui.switch_usage', lang);
      } else {
        opts.switchProvider?.(arg);
        replyText = `${getMessage('tui.switched', lang)}: ${arg}`;
      }
      output(replyText);
      continue;
    }
    // Sprint 280 T-280-004 — `/mcp` external-MCP-client wire (G1). The bridge
    // (buildMcpBridge + McpClientBroker) shipped in Sprint 229 but had zero REPL
    // callers; this is the live wire. Config-gated on server-discovery: `/mcp`
    // routes to the broker ONLY when ≥1 MCP server is configured
    // (loadMcpServers: .mcp.json / .mcp.local.json / ~/.deckent/mcp.json) OR a
    // bridge was injected (tests/entry). With NO server configured the block
    // does NOT intercept — `/mcp` falls through to the slash registry's existing
    // honest notice (behaviour preserved, `chat.mcp_not_wired`). Fail-safe:
    // discovery + bridge construction are wrapped so a `/mcp` line never crashes
    // the REPL; dispatchMcpSlash itself never throws.
    if (line === '/mcp' || line.startsWith('/mcp ')) {
      const mcpRoot = opts.projectRoot ?? process.cwd();
      let bridge: ReplMcpBridge | null;
      if (opts.mcpBridge !== undefined) {
        // Explicit injection (tests / future entry wire). `null` forces the
        // honest no-server fall-through below.
        bridge = opts.mcpBridge;
      } else {
        if (!liveMcpBridgeBuilt) {
          liveMcpBridgeBuilt = true;
          let configured = false;
          try {
            configured = Object.keys(loadMcpServers(mcpRoot)).length > 0;
          } catch {
            configured = false;
          }
          if (configured) {
            try {
              liveMcpBridge = buildMcpBridge({
                broker: new McpClientBroker(),
                registry: new McpClientToolRegistry(),
                projectRoot: mcpRoot,
              });
            } catch {
              liveMcpBridge = null;
            }
          }
        }
        bridge = liveMcpBridge;
      }
      if (bridge !== null) {
        const mcpArgs = line.split(/\s+/).slice(1);
        const mcpText = await dispatchMcpSlash({
          args: mcpArgs,
          bridge,
          lang,
          ...(opts.mcpConfirm !== undefined ? { confirm: opts.mcpConfirm } : {}),
        });
        output(mcpText);
        transcript.push({ role: 'user', content: line });
        transcript.push({ role: 'assistant', content: mcpText });
        memStore?.appendChatTurn(sessionId, 'user', line);
        memStore?.appendChatTurn(sessionId, 'assistant', mcpText);
        continue;
      }
      // bridge === null → no MCP server configured. Fall through to the slash
      // registry below, which returns the existing honest `/mcp` notice.
    }
    // Sprint 222 T-222-005 — slash registry wire. Extended slash commands
    // (/help, /status, /recall, /plan, /sprint) resolve via the live
    // catalog in chat-slash-registry.ts. `/help` renders the registry
    // INSTANTLY without round-tripping to claude (was 15.9s). Agentic
    // slashes dispatch through the same dispatcher as agenticDispatch,
    // gated by the risky-confirm function. Fires regardless of the
    // `agenticDispatch` flag — an explicit slash is unambiguous user
    // intent, while the flag only gates natural-language classification.
    // Sprint 269 T-269-003 — the registry now resolves BEFORE the enterprise
    // bridge so structured subactions (`/audit gate|query|compliance`) map to
    // MCP dispatch; bare `/audit`, `-`-prefixed flags and the other enterprise
    // slashes (/cost /rbac /flow) resolve to 'none' here and keep falling
    // through to the enterprise CLI bridge below (behaviour preserved).
    const slashAction = resolveSlash(line, buildSlashRegistry());
    if (slashAction.action === 'help') {
      output(renderHelp(slashAction.registry));
      continue;
    }
    // Sprint 269 T-269-003 — i18n informational/error reply from the registry
    // (unknown subaction, `/mcp` honest not-wired notice, usage hints). The
    // registry stays pure; the loop localizes the key here.
    if (slashAction.action === 'message') {
      output(getMessage(slashAction.messageKey, lang, slashAction.params));
      continue;
    }
    // Sprint 269 T-269-003 — `/directives` (bare): show the project's current
    // DIRECTIVES.md. Root is injectable for hermetic tests; defaults to cwd.
    if (slashAction.action === 'show-directives') {
      const directivesRoot = opts.projectRoot ?? process.cwd();
      let directivesText: string;
      try {
        directivesText = readFileSync(join(directivesRoot, DIRECTIVES_FILE), 'utf-8');
      } catch {
        directivesText = getMessage('chat.directives_not_found', lang, { root: directivesRoot });
      }
      output(directivesText);
      continue;
    }
    if (slashAction.action === 'agentic') {
      const action: AgenticAction = {
        name: slashAction.tool,
        description: `slash → ${slashAction.tool}`,
        args: slashAction.args,
      };
      const confirmFn = opts.agenticConfirm ?? requireConfirmIfRisky;
      const approved = await confirmFn(action);
      if (!approved) {
        output(`[slash] cancelled: ${slashAction.tool}`);
        continue;
      }
      const slashResult = await dispatcher.dispatch(slashAction.tool, slashAction.args);
      output(slashResult);
      transcript.push({ role: 'user', content: line });
      transcript.push({ role: 'assistant', content: slashResult });
      memStore?.appendChatTurn(sessionId, 'user', line);
      memStore?.appendChatTurn(sessionId, 'assistant', slashResult);
      continue;
    }
    // Sprint 222 T-222-007 — enterprise slash bridge wire. /cost /audit /rbac
    // /flow shell out to the deckent enterprise CLI via dispatchEnterpriseSlash
    // (def file chat-enterprise-bridge.ts excluded from kanıt grep). Reached
    // only when the registry above resolved 'none' (Sprint 269 reorder), so
    // bare `/audit` and the other enterprise slashes intercept here and never
    // round-trip to claude. Tests inject `opts.enterpriseSpawn` to stay
    // hermetic; production uses the built-in child_process spawn.
    if (line.startsWith('/')) {
      const parts = line.split(/\s+/);
      const slashName = (parts[0] ?? '').toLowerCase();
      const extraArgs = parts.slice(1);
      const enterpriseResult = await dispatchEnterpriseSlash(
        slashName,
        extraArgs,
        opts.enterpriseSpawn ? { spawnFn: opts.enterpriseSpawn } : {},
      );
      if (enterpriseResult.handled) {
        output(enterpriseResult.output);
        transcript.push({ role: 'user', content: line });
        transcript.push({ role: 'assistant', content: enterpriseResult.output });
        memStore?.appendChatTurn(sessionId, 'user', line);
        memStore?.appendChatTurn(sessionId, 'assistant', enterpriseResult.output);
        continue;
      }
    }
    // Sprint 221 T-221-002 — agentic dispatch wire. After the slash check,
    // classify the line as a deckent_* MCP tool intent (status/history/
    // recall/plan). On match: gate risky tools through the confirm function,
    // then dispatch through the same `dispatcher` used for provider-driven
    // tool_use. The result is echoed to output and recorded in the
    // transcript+memory so context survives across turns. Opt-in via
    // `agenticDispatch` to preserve backward compatibility with tests whose
    // canned inputs may collide with the natural-language regexes in
    // chat-agentic-dispatch.ts.
    if (opts.agenticDispatch) {
      const intent = classifyAgenticIntent(line);
      if (intent.tool !== null) {
        const action: AgenticAction = {
          name: intent.tool,
          description: `agentic intent → ${intent.tool}`,
          args: intent.args,
        };
        const confirmFn = opts.agenticConfirm ?? requireConfirmIfRisky;
        const approved = await confirmFn(action);
        if (!approved) {
          output(`[agentic] cancelled: ${intent.tool}`);
          continue;
        }
        const agenticResult = await dispatchAgenticIntent(line, dispatcher, lang);
        output(agenticResult.output);
        transcript.push({ role: 'user', content: line });
        transcript.push({ role: 'assistant', content: agenticResult.output });
        memStore?.appendChatTurn(sessionId, 'user', line);
        memStore?.appendChatTurn(sessionId, 'assistant', agenticResult.output);
        continue;
      }
    }
    if (EXIT_COMMANDS.includes(line.toLowerCase())) break;
    if (turnCount >= maxTurns) {
      // i18n (269-003): en template byte-identical to the prior hardcode.
      output(getMessage('chat.max_turns_reached', lang, { max: String(maxTurns) }));
      break;
    }
    turnCount++;

    // Sprint 223 T-223-004 — chat-layout wire (caller of chat-layout.ts).
    // Echo the user line with `›` prefix before the provider call so each
    // turn shows up as a discrete block in the REPL. Slash and agentic
    // paths above already `continue` before this point, so they keep their
    // own UI semantics unchanged.
    // Sprint 224 T-224-002 — on an interactive TTY the `terminal: true`
    // readline already echoed this line (with the `› ` prompt prefix), so
    // re-emitting it would double-print. Suppress the layout echo there;
    // keep it on non-TTY/pipe where there is no readline echo.
    if (layoutOn && opts.interactiveTty !== true) emitLayout(renderUserMessage(line));

    transcript.push({ role: 'user', content: line });
    memStore?.appendChatTurn(sessionId, 'user', line);

    // Sprint 223 T-223-004 — assistant block header. Announces `● deckent`
    // immediately before the streaming/send call so users see who is about
    // to speak even on slow first-token providers.
    // Sprint 224 T-224-011/014 — on an interactive TTY the thinking ticker
    // OWNS the `● deckent · <fiil>…` line and finalizes it to `● deckent` on
    // first token, so the loop must NOT also emit a separate header (would
    // duplicate). Off-TTY keeps the header so pipe/HTTP output is unchanged.
    if (layoutOn && opts.interactiveTty !== true) emitLayout(renderAssistantHeader());

    // "Thinking" indicator — started after the header, stopped on the first
    // byte of provider output (see stopIndicator below) or in the per-turn
    // `finally` for empty responses. No-op when no indicator is supplied.
    opts.thinkingIndicator?.start();

    // Sprint 219 T-219-002 — pre-call round-trip error guard (opt-in via
    // `gracefulErrors`). Wraps the per-turn body so a pre-call provider
    // failure (spawn ENOENT, network down, adapter throws before emitting
    // any output) is surfaced as a tagged error turn instead of crashing
    // the REPL session. Mid-stream errors (output already emitted) still
    // propagate so the chat-native-stream "mid-stream error" contract and
    // the HTTP error propagation contract are preserved.
    let outputCount = 0;
    let indicatorStopped = false;
    const stopIndicator = (): void => {
      if (indicatorStopped) return;
      indicatorStopped = true;
      opts.thinkingIndicator?.stop();
    };
    const trackedOutput = (text: string): void => {
      stopIndicator();
      if (opts.gracefulErrors) outputCount++;
      output(text);
    };
    // Sprint 224 T-224-021 — per-turn stats. Measure wall-clock from just
    // before the provider call; capture token usage off the final response.
    const turnStart = Date.now();
    let turnUsage: ProviderResponse['usage'];
    try {
      let response = await runProviderTurn(provider, getRecentTurns(transcript, opts.contextWindowSize), trackedOutput);
      let toolHops = 0;
      while (response.stopReason === 'tool_use' && response.toolCalls?.length) {
        if (toolHops >= maxToolHops) {
          // i18n (269-003): en template byte-identical to the prior hardcode.
          trackedOutput(getMessage('chat.max_tool_hops_reached', lang, { max: String(maxToolHops) }));
          break;
        }
        toolHops++;

        transcript.push({
          role: 'assistant',
          content: response.text ?? '',
          toolCalls: response.toolCalls,
        });

        for (const call of response.toolCalls) {
          // Sprint 224 T-224-022 — live activity: show what deckent is doing
          // (which tool, on what) while it runs, instead of a silent wait.
          if (layoutOn && opts.interactiveTty === true) {
            trackedOutput(`\n${renderToolActivity(call.name, call.args, true)}\n`);
          }
          const result = await dispatcher.dispatch(call.name, call.args);
          transcript.push({ role: 'tool', content: result, toolUseId: call.id });
        }

        response = await runProviderTurn(provider, getRecentTurns(transcript, opts.contextWindowSize), trackedOutput);
      }

      const assistantText = response.text ?? '';
      turnUsage = response.usage; // T-224-021 — for the stats footer
      transcript.push({ role: 'assistant', content: assistantText });
      if (assistantText.length > 0) {
        if (!provider.stream) trackedOutput(assistantText);
        memStore?.appendChatTurn(sessionId, 'assistant', assistantText);
      }
    } catch (err) {
      if (!opts.gracefulErrors || outputCount > 0) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      // i18n (269-003): en template byte-identical to the prior hardcode.
      const errorTurn = getMessage('chat.provider_error', lang, { message: msg });
      output(errorTurn);
      transcript.push({ role: 'assistant', content: errorTurn });
      memStore?.appendChatTurn(sessionId, 'assistant', errorTurn);
    } finally {
      // Safety net: ensure the indicator stops even when the provider emits
      // no output (empty end_turn) so a stray spinner never lingers.
      stopIndicator();
    }

    // Close the turn. Sprint 224 T-224-011 — on an interactive TTY the reply
    // streamed inline (raw, no trailing newline), so emit a single newline to
    // close the response line before the `› ` prompt is redrawn for the next
    // turn. Off-TTY keeps the thin separator (messageSeparator returns '' on
    // non-TTY anyway, so emitLayout drops it and pipe output is unchanged).
    // Sprint 224 T-224-021 — on an interactive TTY, replace the bare newline
    // with a dim stats footer `⏱ 3.2s · 240 tok` (elapsed always; token count
    // when the provider surfaced usage). Closes the response line, shows the
    // footer, then a newline so the next `› ` prompt starts fresh.
    if (layoutOn) {
      if (opts.interactiveTty === true) {
        emitLayout('\n' + renderTurnStatsFooter(Date.now() - turnStart, turnUsage) + '\n');
      } else {
        emitLayout(messageSeparator());
      }
    }
    // E4 — report turn stats to a non-layout (Ink) consumer for its own footer.
    opts.onTurnEnd?.({ elapsedMs: Date.now() - turnStart, usage: turnUsage });
  }

  return transcript;
}

// ─── Subscription Adapter Bridge (Sprint 206 T-206-006) ─────────────
//
// Wires the loop's ChatProviderAdapter shape onto a real provider — resolved
// from the global ProviderRegistry — and drives the host CLI in SUBSCRIPTION
// mode (session auth managed by the CLI itself; API keys are stripped from
// the child env). API-mode is intentionally NOT routed through here per the
// project DIRECTIVE `project_api_mode_deferred_post_beta`.

/** Spawn shim — production wraps node:child_process.spawn, tests inject a fake. */
export interface SubscriptionSpawnFn {
  (binary: string, args: readonly string[], env: NodeJS.ProcessEnv): {
    chunks: AsyncIterable<string>;
    wait: Promise<{ exitCode: number | null }>;
  };
}

export interface SubscriptionChatAdapterOptions {
  /** Provider name to resolve from registry (omit → use registry default). */
  providerName?: string;
  /** Registry override (omit → use global providerRegistry singleton). */
  registry?: ProviderRegistry;
  /** Override the CLI binary (default: 'claude'). */
  binary?: string;
  /** Inject a custom spawn function — primarily for tests. */
  spawnFn?: SubscriptionSpawnFn;
  /** Args inserted before the prompt (default: ['--print'] — one-shot mode). */
  extraArgs?: readonly string[];
}

/**
 * Concatenate the transcript into one prompt blob suitable for a `--print`
 * style one-shot invocation. Tool turns are tagged so the model can see
 * earlier tool results in the same conversation.
 */
export function buildSubscriptionPrompt(messages: readonly ChatMessage[]): string {
  return messages
    .map((m) => {
      const tag = m.role === 'tool' ? 'tool-result' : m.role;
      return `<${tag}>${m.content}</${tag}>`;
    })
    .join('\n');
}

/**
 * Default subscription spawn — invokes the CLI with the child env scrubbed
 * of API keys so the binary falls through to its bundled session auth.
 * Returns an async-iterable of stdout text chunks plus a wait promise that
 * resolves once the child closes.
 */
export function defaultSubscriptionSpawn(
  binary: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): { chunks: AsyncIterable<string>; wait: Promise<{ exitCode: number | null }> } {
  const child = nodeSpawn(binary, [...args], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  const chunks: AsyncIterable<string> = {
    async *[Symbol.asyncIterator]() {
      const stdout = child.stdout;
      if (!stdout) return;
      stdout.setEncoding('utf-8');
      for await (const piece of stdout) yield String(piece);
    },
  };
  const wait = new Promise<{ exitCode: number | null }>((resolve) => {
    child.once('close', (code) => resolve({ exitCode: code }));
  });
  return { chunks, wait };
}

/**
 * Build a ChatProviderAdapter that drives the host CLI in subscription mode.
 *
 * - Resolves a {@link ProviderAdapter} from the {@link ProviderRegistry} —
 *   raising ProviderNotFoundError when the requested name is missing.
 * - `send()` runs the CLI to completion and returns the concatenated stdout
 *   as a single end_turn response.
 * - `stream()` yields incremental stdout chunks as the CLI emits them and
 *   finalizes with a `done` chunk carrying the full transcript.
 */
export function createSubscriptionChatAdapter(
  opts: SubscriptionChatAdapterOptions = {},
): ChatProviderAdapter {
  const registry = opts.registry ?? defaultProviderRegistry;
  // Resolve the provider — confirms registration; throws if missing.
  // The resolved adapter is held so future per-provider routing can branch
  // on adapter.name without changing the public factory signature.
  const adapter: ProviderAdapter = opts.providerName !== undefined
    ? registry.getProvider(opts.providerName)
    : registry.getDefault();
  void adapter;

  const binary = opts.binary ?? 'claude';
  const spawnFn = opts.spawnFn ?? defaultSubscriptionSpawn;
  const extraArgs = opts.extraArgs ?? ['--print'];

  function subscriptionEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env['ANTHROPIC_API_KEY'];
    delete env['DECKENT_CLAUDE_API_KEY'];
    return env;
  }

  return {
    async send(messages) {
      const prompt = buildSubscriptionPrompt(messages);
      const { chunks, wait } = spawnFn(binary, [...extraArgs, prompt], subscriptionEnv());
      let text = '';
      for await (const chunk of chunks) text += chunk;
      await wait;
      return { text, stopReason: 'end_turn' };
    },
    async *stream(messages) {
      const prompt = buildSubscriptionPrompt(messages);
      const { chunks, wait } = spawnFn(binary, [...extraArgs, prompt], subscriptionEnv());
      let collected = '';
      for await (const chunk of chunks) {
        if (chunk.length === 0) continue;
        collected += chunk;
        yield { text: chunk };
      }
      await wait;
      yield { done: { text: collected, stopReason: 'end_turn' } };
    },
  };
}
