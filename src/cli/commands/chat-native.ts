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
import { COMMAND_REGISTRY } from '../command-registry.js';
import {
  buildSlashRegistry,
  renderHelp,
  resolveSlash,
  type SlashAction,
  type SlashCommand,
  type SlashRegistry,
} from './chat-slash-registry.js';
import { getVisibleCommands, isEnterpriseSlash, type ChatMode } from './chat-mode.js';
import type { TermMode } from '../repl/term-mode.js';
import { classifyTool, type ToolPermission } from '../repl/tool-permissions.js';
import {
  renderCatalog,
  type CatalogRenderEntry,
  type CatalogRenderLabels,
} from '../helpers/catalog-render.js';
import {
  classifyToolTrust,
  type ToolCatalogSource,
  type ToolCatalogRiskLevel,
} from '../../core/tool-catalog.js';
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
import { dispatchMcpSlash, isMcpClientEnabled, planMcpConnect, type ReplMcpBridge } from '../repl/mcp-bridge.js';
import { loadConfig } from '../../core/config.js';
// Sprint 380 T-380-014 — type-only (chat-session.ts already imports FROM this
// file; this reverse edge is erased at compile time, so there is no runtime
// cycle). Used only to duck-type-check `/clear`'s provider — see below.
import type { PersistentClaudeSession } from './chat-session.js';

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
   * it matches a deckent_* tool (status/history/recall/plan), ADR-D-013
   * Option C (sprint-375 task 375-003) resolves the matched tool's
   * command-registry risk tier: `'Oku'` (read-only) dispatches DIRECTLY —
   * no confirm call at all; any other tier (or an unresolvable tool,
   * fail-safe) is gated through {@link requireConfirmIfRisky} (or the
   * injected `agenticConfirm`) exactly as T-221-002 did unconditionally.
   * Default false preserves the pre-T-221-002 behaviour for existing
   * callers (test suite) whose canned inputs include phrases like "check
   * status" or "how are we doing?" that would otherwise be intercepted by
   * the STATUS_RE.
   */
  agenticDispatch?: boolean;
  /**
   * Injection point for the confirm gate used when `agenticDispatch`
   * matches a non-`'Oku'` tool (ADR-D-013 Option C — `'Oku'`-tier matches
   * skip this call entirely). Defaults to {@link requireConfirmIfRisky}
   * (auto-approves safe read-only tools, prompts on stdin/stdout for risky
   * ones). Tests inject a stub to drive both branches deterministically.
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
   * Sprint 358 T-358-005 — current terminal risk-ladder mode (term-mode.ts),
   * consumed ONLY to decide `/help` catalog visibility: `'control'` maps to
   * `ChatMode` `'enterprise'` (enterprise slashes like `/audit` listed),
   * anything else maps to `'user'` (hidden from the list, still dispatchable
   * directly per chat-mode.ts's "kullanılmasa da kullanılabilir" contract).
   * Defaults to `'ask'` (the safe default from `initialTermModeState()`) when
   * omitted. No `/ask`/`/run`/`/control` transition state machine is wired
   * into this loop yet (term-mode.ts has no production caller as of this
   * task) — a future caller that owns live `TermModeState` can pass its
   * current `.mode` here with no shape change.
   */
  termMode?: TermMode;
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
   * `/provider <name>` in the loop; the caller (e.g. {@link createSwitchableProvider})
   * rebuilds the underlying adapter IN-PLACE so the next turn uses the new
   * provider. The callback validates the name against the registry and THROWS
   * (ProviderNotFoundError) for an unknown provider — it never silently falls
   * back to claude (Yasa #2); the loop surfaces the throw as an honest error.
   *
   * Sprint 343 R7 — when this is OMITTED the loop NO LONGER fakes a "switched"
   * confirmation. A fixed single-provider / `--once` session cannot swap its
   * adapter, so `/provider <name>` reports HONESTLY that switching is
   * unavailable (see {@link ChatNativeOptions.switchUnavailable}) instead of
   * claiming a swap that never happened. Default-off preserves backward
   * compatibility for callers that don't wire a switcher.
   */
  switchProvider?: (providerName: string) => void;
  /**
   * Sprint 343 R7 — honest notice formatter for the case above: `/provider
   * <name>` typed in a session that has NO {@link ChatNativeOptions.switchProvider}
   * wired. Called with the requested provider name; the returned string is
   * emitted verbatim instead of a fake "switched" confirmation. i18n-first: the
   * mechanism stays string-free — the caller injects an already-localized
   * formatter; when omitted an English default is used (the entry-point phase-2
   * wire should pass a `getMessage('tui.switch_unavailable', lang, { name })`
   * backed formatter once that key is added to messages.ts).
   */
  switchUnavailable?: (providerName: string) => string;
}

const DEFAULT_MAX_TURNS = 50;
const DEFAULT_MAX_TOOL_HOPS = 10;
const EXIT_COMMANDS: readonly string[] = [':exit', ':quit'];

// ─── /help "Tools/Actions" catalog (Sprint 358 T-358-005) ───────────
//
// Bridges the live slash registry into a trust-badged catalog for the
// renderCatalog mechanism (357-002, src/cli/helpers/catalog-render.ts).
// Source/risk classification reuses two already-established single sources
// of truth instead of inventing new heuristics:
//   - isEnterpriseSlash (chat-mode.ts)   -> ToolCatalogSource (enterprise/builtin)
//   - classifyTool (tool-permissions.ts) -> confirm tier -> risk level
// classifyToolTrust (tool-catalog.ts, 357-001) then derives the trust tier
// from (source, risk) — 'always'-tier commands (/kill /cleanup /recover)
// clamp to 'Danger' regardless of source, matching their existing ⚠️ desc
// markers in chat-slash-registry.ts.
//
// messages.ts is outside this task's write scope, so no new i18n keys can be
// added here. `category`/`labelKey` below are identity-passthrough of
// already-technical vocabulary (trust-tier names, slash-command tokens) —
// consistent with the project convention that code/command tokens stay
// English-invariant regardless of UI language. The one real prose string
// (the section header) reuses the existing generic `nervous.actions_label`
// key via getMessage at the call site — see docImpact note in the task
// result for a proposed dedicated key follow-up.

const HELP_CATALOG_RISK_TO_CATALOG_RISK: Record<ToolPermission, ToolCatalogRiskLevel> = {
  read: 'safe',
  confirm: 'moderate',
  always: 'critical',
};

const HELP_CATALOG_RISK_TO_RENDER_RISK: Record<ToolPermission, CatalogRenderEntry['riskLevel']> = {
  read: 'low',
  confirm: 'medium',
  always: 'critical',
};

const HELP_CATALOG_TIER_BADGE: CatalogRenderLabels['tierBadge'] = {
  Core: 'C',
  Project: 'P',
  MCP: 'M',
  Enterprise: 'E',
  Danger: '!',
};

const HELP_CATALOG_RISK_MARKER: CatalogRenderLabels['riskMarker'] = {
  low: '',
  medium: '',
  high: '',
  critical: '',
};

/** Meta-commands (no `agenticTool`, e.g. `/help` `/model` `/cd`) default to the safe 'read' tier. */
function slashCommandRiskTier(cmd: SlashCommand): ToolPermission {
  return cmd.agenticTool ? classifyTool(cmd.agenticTool, {}) : 'read';
}

function slashCommandCatalogSource(cmd: SlashCommand): ToolCatalogSource {
  return isEnterpriseSlash(cmd.name) ? 'enterprise' : 'builtin';
}

/** Builds trust-badged catalog rows from a (mode-filtered) slash registry for /help. */
export function buildHelpCatalogEntries(registry: SlashRegistry): CatalogRenderEntry[] {
  return registry
    .filter((cmd) => cmd.name !== '/quit') // alias — renderHelp already skips it too
    .map((cmd) => {
      const tier = slashCommandRiskTier(cmd);
      const source = slashCommandCatalogSource(cmd);
      const trustTier = classifyToolTrust({ source, riskLevel: HELP_CATALOG_RISK_TO_CATALOG_RISK[tier] });
      return {
        id: cmd.name,
        category: trustTier,
        labelKey: cmd.name,
        trustTier,
        riskLevel: HELP_CATALOG_RISK_TO_RENDER_RISK[tier],
      } satisfies CatalogRenderEntry;
    });
}

/** String-free labels for the /help catalog section — see module-header comment above. */
export function buildHelpCatalogLabels(lang: string): CatalogRenderLabels {
  return {
    categoryName: (category) => category,
    entryName: (labelKey) => labelKey,
    tierBadge: HELP_CATALOG_TIER_BADGE,
    riskMarker: HELP_CATALOG_RISK_MARKER,
    emptyState: getMessage('nervous.no_pending', lang),
  };
}

// ─── NATIVE-SLASH-BRIDGE (387-002) — shared slash-output builders ──────────
//
// The legacy loop below (runChatNativeLoop) intercepts /help, /nervous,
// /interrogate and bare /directives inline. The Ink native-engine bridge
// (src/cli/repl/app.tsx) drives its OWN turn-by-turn dispatch instead of this
// loop, so it never reached any of these branches — ~24 of the 37 slash
// commands silently fell through to a plain-text chat turn (born-493). These
// exports centralize each branch's OUTPUT assembly (not its transcript/memory
// bookkeeping, which stays loop-specific) so app.tsx's bridge renders
// byte-identical results without duplicating the logic.

/**
 * Same trust-badged /help block the loop renders inline below, extracted so
 * the Ink native-engine bridge (app.tsx) renders byte-identical output
 * without re-assembling the registry/catalog/labels calls itself.
 */
export function buildHelpOutput(chatMode: ChatMode, lang: string): string {
  const visible = getVisibleCommands(chatMode);
  const sections = [renderHelp(visible)];
  const catalogEntries = buildHelpCatalogEntries(visible);
  if (catalogEntries.length > 0) {
    sections.push('', getMessage('nervous.actions_label', lang), renderCatalog(catalogEntries, buildHelpCatalogLabels(lang)));
  }
  return sections.join('\n');
}

/**
 * Same `/nervous` banner+result assembly the loop's own early interception
 * (below) performs, extracted for reuse by the Ink native-engine bridge,
 * which intercepts `/nervous` the same way — BEFORE resolveSlash, since
 * resolveSlash's own store-gated `/nervous` branch needs an injected
 * NervousPendingStore neither caller has.
 */
export function buildNervousOutput(root: string, args: readonly string[], tty: boolean, lang: string): string {
  const pending = getPendingNervous(root);
  const banner = args.length === 0 ? renderNervousPrompt(pending, tty) : '';
  const slashResult = handleNervousSlash(args, root, tty, lang);
  return banner.length > 0 ? `${banner}\n${slashResult}` : slashResult;
}

/**
 * Same `/interrogate` read+render the loop's own early interception (below)
 * performs, extracted for reuse by the Ink native-engine bridge.
 */
export function buildInterrogateOutput(root: string, lang: string): string {
  try {
    const dirContent = readFileSync(join(root, DIRECTIVES_FILE), 'utf-8');
    const questions = buildInterrogationQuestions(dirContent, { lang });
    const intro = getMessage('interrogate.intro', lang);
    const numbered = questions.map((q, i) => `${i + 1}. ${q.text}`).join('\n');
    return `${intro}\n\n${numbered}`;
  } catch {
    return getMessage('chat.directives_not_found', lang, { root });
  }
}

/**
 * Same bare-`/directives` read the loop's own `show-directives` branch
 * (below) performs, extracted for reuse by the Ink native-engine bridge.
 */
export function readDirectivesOutput(root: string, lang: string): string {
  try {
    return readFileSync(join(root, DIRECTIVES_FILE), 'utf-8');
  } catch {
    return getMessage('chat.directives_not_found', lang, { root });
  }
}

/**
 * Resolves the 3 resolveSlash outcomes that need ONLY a rendered string
 * (help / i18n message / directives) into that text. `agentic` is
 * deliberately NOT handled here — it needs an async tool dispatch, the
 * caller's job (both the loop below and app.tsx's bridge dispatch it
 * themselves, through their own `dispatcher`). Centralizing i18n resolution
 * here keeps the Ink native-engine bridge (app.tsx) from importing
 * getMessage directly — app.tsx is a "mechanism" module and stays
 * string-free per the project's i18n-first rule; a slash message KEY is
 * chosen at RUNTIME by resolveSlash (chat-slash-registry.ts), so unlike
 * app.tsx's other labels it cannot be pre-injected as a static prop — this
 * function is the caller-side resolution seam instead.
 */
export function resolveNativeSlashText(
  action: Extract<SlashAction, { action: 'help' | 'message' | 'show-directives' }>,
  ctx: { chatMode: ChatMode; lang: string; directivesRoot: string },
): string {
  if (action.action === 'help') return buildHelpOutput(ctx.chatMode, ctx.lang);
  if (action.action === 'show-directives') return readDirectivesOutput(ctx.directivesRoot, ctx.lang);
  return getMessage(action.messageKey, ctx.lang, action.params);
}

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

// ─── Agentic Dispatch Risk Class (ADR-D-013 Option C, task 375-003) ──
//
// Resolves an agenticDispatch-classified tool name (e.g. 'deckent_status')
// to its command-registry CommandRisk tier by matching against each
// entry's `mcpNames`. `'Oku'` (read-only) tools skip the confirm gate
// entirely below; everything else — including a tool this registry lookup
// can't resolve — requires confirm (fail-safe), mirroring the
// `requiresConfirm: command.risk !== 'Oku'` precedent already shipped in
// onboarding-chat-flow.ts's `buildMetaDispatch` (sprint-370 task 370-005).

function agenticToolRequiresConfirm(tool: string): boolean {
  const entry = COMMAND_REGISTRY.find((e) => e.mcpNames?.includes(tool));
  return entry ? entry.risk !== 'Oku' : true;
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
  // Sprint 358 T-358-005 — see ChatNativeOptions.termMode doc comment.
  const chatMode: ChatMode = (opts.termMode ?? 'ask') === 'control' ? 'enterprise' : 'user';
  // Most recently shown /resume list — lets `/resume <n>` pick by number.
  let lastResumeList: ReadonlyArray<{ sessionId: string; turnCount: number; lastAt: string; preview: string }> = [];
  // Sprint 280 T-280-004 — lazily-built external-MCP bridge for `/mcp`, cached
  // for the REPL session (one broker/connection pool per session). Built once
  // on first `/mcp` use when MCP servers are configured; `built` guards the
  // (cheap) discovery so a no-server session never re-probes every `/mcp`.
  let liveMcpBridge: ReplMcpBridge | null = null;
  let liveMcpBridgeBuilt = false;
  // 387-013 MCP-CLIENT-GATE (REPL-575 K1): servers configured but the opt-in
  // flag is off — remembered so `/mcp` answers with the honest disabled-notice
  // instead of the misleading "not wired" fall-through.
  let liveMcpDisabledByFlag = false;
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
      // Sprint 380 T-380-014 — the JS-side transcript is only half the
      // context: a warm PersistentClaudeSession (chat-session.ts) reuses the
      // SAME long-lived `claude --input-format stream-json` child across
      // turns, so its own conversation history survives a bare
      // `transcript.length = 0` and the model kept silently recalling
      // pre-/clear turns. Duck-typed exactly like entry.ts's `:exit` teardown
      // (only PersistentClaudeSession exposes `exit`) — calling it here kills
      // the current warm child; the NEXT turn's lazy `ensureSpawn()` spawns a
      // brand-new child with zero prior stdin history, a true context reset
      // without restarting the whole chat session (nogo: killing the entire
      // session is NOT required). codex/gemini/subscription/test adapters
      // have no warm state and are unaffected.
      const maybeSession = provider as Partial<PersistentClaudeSession>;
      if (typeof maybeSession.exit === 'function') {
        await maybeSession.exit();
      }
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
      const emitText = buildNervousOutput(nervousRoot, nervousArgs, opts.interactiveTty === true, lang);
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
      const interrText = buildInterrogateOutput(interrRoot, lang);
      output(interrText);
      transcript.push({ role: 'user', content: line });
      transcript.push({ role: 'assistant', content: interrText });
      memStore?.appendChatTurn(sessionId, 'user', line);
      memStore?.appendChatTurn(sessionId, 'assistant', interrText);
      continue;
    }
    // AS2-P2 / Sprint 343 R7 — `/provider` switcher parity: handle here (before
    // the slash registry which returns 'none' for /provider) so Path-C
    // (HTTP/terminal) has the same UX as the Ink REPL (app.tsx line ~431). Three
    // honest branches:
    //   - no arg                  → usage hint (unchanged).
    //   - arg, NO switchProvider  → HONEST "switching unavailable" notice that
    //     echoes the requested name. A fixed single-provider / `--once` session
    //     cannot rebuild its adapter, so we MUST NOT fake a "switched"
    //     confirmation for a swap that never happened (Yasa #2). i18n-first:
    //     caller injects a localized `switchUnavailable` formatter; English
    //     default otherwise (string-free mechanism + injected label).
    //   - arg, switchProvider     → rebuild in-place (the callback resolves the
    //     name from the registry and THROWS for an unknown provider — never a
    //     silent claude fallback). Success → tui.switched; throw → honest error.
    if (line === '/provider' || line.startsWith('/provider ')) {
      const arg = line.slice('/provider'.length).trim();
      let replyText: string;
      if (arg.length === 0) {
        replyText = getMessage('tui.switch_usage', lang);
      } else if (!opts.switchProvider) {
        replyText = opts.switchUnavailable
          ? opts.switchUnavailable(arg)
          : `Provider switching is unavailable in this session — cannot switch to ` +
            `"${arg}" (no provider switcher is wired). Restart with a switchable ` +
            `provider to use /provider.`;
      } else {
        try {
          opts.switchProvider(arg);
          replyText = `${getMessage('tui.switched', lang)}: ${arg}`;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          replyText = getMessage('chat.provider_error', lang, { message: msg });
        }
      }
      output(replyText);
      continue;
    }
    // Sprint 280 T-280-004 — `/mcp` external-MCP-client wire (G1). The bridge
    // (buildMcpBridge + McpClientBroker) shipped in Sprint 229 but had zero REPL
    // callers; this is the live wire. DOUBLE-gated (387-013 wired, REPL-575 K1):
    // `/mcp` routes to the broker ONLY when ≥1 MCP server is configured
    // (loadMcpServers: .mcp.json / .mcp.local.json / ~/.deckent/mcp.json) AND
    // `mcp_client_enabled` is explicitly true — OR a bridge was injected
    // (tests/entry). Servers-but-flag-off answers `chat.mcp_client_disabled`;
    // with NO server configured the block does NOT intercept — `/mcp` falls
    // through to the slash registry's existing honest notice
    // (`chat.mcp_not_wired`). Fail-safe: discovery + bridge construction are
    // wrapped so a `/mcp` line never crashes the REPL; dispatchMcpSlash itself
    // never throws.
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
          // 387-013 MCP-CLIENT-GATE wired (REPL-575 K1-C smart-split): the
          // operator's own scopes (user + gitignored local) always connect; a
          // git-tracked project .mcp.json is opt-in behind `mcp_client_enabled`.
          // Fail-closed: a config read error = off.
          let clientEnabled = false;
          try {
            clientEnabled = isMcpClientEnabled(await loadConfig(mcpRoot));
          } catch {
            clientEnabled = false;
          }
          let plan: ReturnType<typeof planMcpConnect> = { connect: false, includeProjectScope: clientEnabled, notice: false };
          try {
            plan = planMcpConnect(mcpRoot, clientEnabled);
          } catch {
            plan = { connect: false, includeProjectScope: clientEnabled, notice: false };
          }
          if (plan.connect) {
            try {
              liveMcpBridge = buildMcpBridge({
                broker: new McpClientBroker(),
                registry: new McpClientToolRegistry(),
                projectRoot: mcpRoot,
                includeProjectScope: plan.includeProjectScope,
              });
            } catch {
              liveMcpBridge = null;
            }
          }
          if (plan.notice) liveMcpDisabledByFlag = true;
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
      if (liveMcpDisabledByFlag && opts.mcpBridge === undefined) {
        // Servers ARE configured but the opt-in flag is off — the "not wired"
        // fall-through would be dishonest here; say exactly what to enable.
        const notice = getMessage('chat.mcp_client_disabled', lang);
        output(notice);
        transcript.push({ role: 'user', content: line });
        transcript.push({ role: 'assistant', content: notice });
        memStore?.appendChatTurn(sessionId, 'user', line);
        memStore?.appendChatTurn(sessionId, 'assistant', notice);
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
      // Sprint 358 T-358-005 — mode-filtered render (357-010) + trust-badged
      // "Tools/Actions" catalog section (357-002/357-001). `slashAction.registry`
      // is intentionally NOT used here — it is the FULL unfiltered registry
      // (needed by resolveSlash's dispatch path, see chat-mode.ts), while /help
      // display must go through getVisibleCommands(chatMode) to hide enterprise
      // slashes outside control mode. buildHelpOutput (387-002) is the SAME
      // assembly the Ink native-engine bridge (app.tsx) now also calls.
      output(buildHelpOutput(chatMode, lang));
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
      output(readDirectivesOutput(directivesRoot, lang));
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
    // recall/plan). ADR-D-013 Option C (sprint-375 task 375-003): the
    // resolved tool's command-registry risk tier decides whether the
    // confirm gate runs at all — `agenticToolRequiresConfirm` returns false
    // for `'Oku'` (read-only) tools, which dispatch DIRECTLY; any other tier
    // (or an unresolvable tool, fail-safe) still goes through the confirm
    // function exactly as T-221-002 did unconditionally. Then dispatch
    // through the same `dispatcher` used for provider-driven tool_use. The
    // result is echoed to output and recorded in the transcript+memory so
    // context survives across turns. Opt-in via `agenticDispatch` to
    // preserve backward compatibility with tests whose canned inputs may
    // collide with the natural-language regexes in chat-agentic-dispatch.ts.
    if (opts.agenticDispatch) {
      const intent = classifyAgenticIntent(line);
      if (intent.tool !== null) {
        let approved = true;
        if (agenticToolRequiresConfirm(intent.tool)) {
          const action: AgenticAction = {
            name: intent.tool,
            description: `agentic intent → ${intent.tool}`,
            args: intent.args,
          };
          const confirmFn = opts.agenticConfirm ?? requireConfirmIfRisky;
          approved = await confirmFn(action);
        }
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
  // Sprint 380 T-380-014 (born-509 SPAWN-ERROR-LISTENERS, this file's own
  // spawn-site) — a spawn failure (e.g. ENOENT for a missing/misconfigured
  // provider binary) fires Node's 'error' event on the ChildProcess; an
  // EventEmitter 'error' event with NO listener throws as an uncaught
  // exception (Node contract), crashing the whole REPL instead of producing a
  // handled turn. Mirrors the fix already shipped for chat-session.ts's
  // `defaultPersistentSpawn`. `chunks` re-throws the captured error once
  // stdout ends so `send()`/`stream()` reject with a real error — the same
  // pre-call-throw shape `gracefulErrors` already converts into a handled
  // `chat.provider_error` turn.
  let spawnError: Error | null = null;
  child.on('error', (err) => {
    if (!spawnError) spawnError = err instanceof Error ? err : new Error(String(err));
  });
  const chunks: AsyncIterable<string> = {
    async *[Symbol.asyncIterator]() {
      const stdout = child.stdout;
      if (!stdout) return;
      stdout.setEncoding('utf-8');
      for await (const piece of stdout) yield String(piece);
      if (spawnError) throw spawnError;
    },
  };
  const wait = new Promise<{ exitCode: number | null }>((resolve) => {
    child.once('close', (code) => resolve({ exitCode: code }));
    child.once('error', () => resolve({ exitCode: null }));
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

// ─── TODO(phase2): wire a switchable provider into the prod entry points ─────
//
// Sprint 343 R7 — `runChatNativeLoop` switches providers correctly WHEN a
// `switchProvider` callback is supplied (createSwitchableProvider below) and now
// reports HONESTLY ("switching unavailable") when one is NOT. The remaining gap
// is the two PRODUCTION entry points, which still build a FIXED provider and omit
// `switchProvider`, so `/provider` reports "unavailable" there today. Both files
// are OFF this task's single-file surface (chat-native.ts only), so the wire is
// deferred — this module already exposes everything they need:
//   • src/cli/entry.ts (~:669, non-Ink native loop) — builds `provider` via
//     buildReplProvider(providerName), which spans the FULL provider matrix
//     (claude/codex/gemini/ollama/deepseek/qwen/glm). The subscription-only
//     createSwitchableProvider here is NOT a drop-in there; wrap buildReplProvider
//     in a rebuild-on-switch proxy — the Ink REPL already does exactly this via
//     src/cli/repl/provider-switch.ts::createSwitchableProvider(initial, rebuild)
//     — then pass its switchProvider + a getMessage('tui.switch_unavailable')-
//     backed `switchUnavailable` formatter into runChatNativeLoop.
//   • src/cli/commands/chat.ts (~:500/:522, --native paths) — build the provider
//     via createSwitchableProvider({ registry }) and pass its switchProvider.
//
// ─── Switchable Provider (AS2-P2) ───────────────────────────────────
//
// Factory that builds a stable proxy ChatProviderAdapter around a mutable
// internal adapter reference. Pass the returned `provider` and `switchProvider`
// directly to runChatNativeLoop. When /provider <name> is typed, the loop
// calls `switchProvider` → the proxy's `current` ref is replaced → the next
// turn transparently uses the new adapter without restarting the loop.
//
// Mirrors the proxy pattern in src/cli/repl/provider-switch.ts (Ink REPL path).
// This version is tailored for runChatNativeLoop callers that use the
// subscription (CLI-spawn) adapter model.

/** Options accepted by createSwitchableProvider. */
export interface SwitchableProviderOptions {
  /** Initial provider name (omit → registry default). */
  initialProviderName?: string;
  /** Registry override — omit for the global providerRegistry singleton. */
  registry?: ProviderRegistry;
  /** Binary override (default: 'claude'). */
  binary?: string;
  /** Spawn function injection — for tests. */
  spawnFn?: SubscriptionSpawnFn;
  /** Extra args override (default: ['--print']). */
  extraArgs?: readonly string[];
}

/** Return shape of createSwitchableProvider. */
export interface SwitchableProviderHandle {
  /** Stable proxy — pass as ChatNativeOptions.provider. */
  provider: ChatProviderAdapter;
  /** Rebuild callback — pass as ChatNativeOptions.switchProvider. */
  switchProvider: (providerName: string) => void;
}

/**
 * Build a switchable subscription provider for use with runChatNativeLoop.
 *
 * Returns a stable proxy ChatProviderAdapter and a switchProvider callback.
 * Wire both into ChatNativeOptions so the loop handles `/provider <name>` by
 * calling switchProvider → the proxy's current adapter is replaced → subsequent
 * turns use the new provider without restarting the session.
 *
 * Example:
 *   const { provider, switchProvider } = createSwitchableProvider({ registry });
 *   await runChatNativeLoop({ provider, switchProvider, ... });
 */
export function createSwitchableProvider(
  opts: SwitchableProviderOptions = {},
): SwitchableProviderHandle {
  let current: ChatProviderAdapter = createSubscriptionChatAdapter({
    providerName: opts.initialProviderName,
    registry: opts.registry,
    binary: opts.binary,
    spawnFn: opts.spawnFn,
    extraArgs: opts.extraArgs,
  });

  // Stable proxy — delegates to the mutable `current` via closure.
  // `stream` is always defined: delegates to current.stream when available
  // (subscription adapters always have it), else wraps current.send() as a
  // single-chunk stream so non-streaming providers still work through the proxy.
  const provider: ChatProviderAdapter = {
    send: (messages) => current.send(messages),
    stream: (messages) => {
      if (current.stream) return current.stream(messages);
      return (async function* () {
        const r = await current.send(messages);
        yield { text: r.text ?? '', done: r };
      })();
    },
  };

  function switchProvider(providerName: string): void {
    current = createSubscriptionChatAdapter({
      providerName,
      registry: opts.registry,
      binary: opts.binary,
      spawnFn: opts.spawnFn,
      extraArgs: opts.extraArgs,
    });
  }

  return { provider, switchProvider };
}
