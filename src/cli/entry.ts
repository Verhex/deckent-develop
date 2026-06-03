#!/usr/bin/env node

import { createInterface, type ReadLineOptions } from 'node:readline';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildProgram } from './index.js';
import { handleCliError } from './helpers/process.js';
import { interruptActiveSprint } from '../orchestra/sprint-controller.js';
import { killAllSessions } from '../orchestra/tmux.js';
import { bootstrapFromCatalog } from '../core/model-catalog.js';
import { loadConfig, resolveChatProvider, type ChatProviderName } from '../core/config.js';
import {
  runChatNativeLoop,
  buildSubscriptionPrompt,
  defaultSubscriptionSpawn,
  type ChatMessage,
  type ChatProviderAdapter,
  type ProviderResponse,
  type SubscriptionSpawnFn,
} from './commands/chat-native.js';
import {
  createPersistentClaudeSession,
  DECKENT_AGENTIC_SYSTEM_PROMPT,
  DEFAULT_PERSISTENT_ARGS,
  type PersistentClaudeSession,
  type PersistentSpawnFn,
} from './commands/chat-session.js';
import { createSpinner } from './commands/chat-spinner.js';
import { renderBanner } from './commands/chat-banner.js';
import { createCliToolDispatcher } from './commands/chat-tool-bridge.js';
import { createToolExecDispatcher } from './commands/chat-tool-exec.js';
import { createPermissionStore } from './commands/chat-permissions.js';
import { slashCompleter, buildSlashRegistry } from './commands/chat-slash-registry.js';
import { slashMenuOnKeypress, renderSlashMenu, filterSlashCommands } from './commands/chat-slash-menu.js';
import { createPromptRegion, createThinkingTicker, createPasteCoalescer, createLineBufferedSink } from './commands/chat-render-region.js';
import { PinnedTui } from './commands/chat-pinned-tui.js';
import { getMessage, getLanguage } from './helpers/messages.js';
import { createStreamMarkdown, renderMarkdown } from './commands/chat-render.js';
import {
  OPENAI_COMPAT_PRESETS,
  type OpenAICompatPresetName,
} from '../providers/openai-compatible.js';

// ─── Default REPL Routing (Sprint 219 T-219-001) ────────────────────────────
//
// When `deckent` is invoked with no subcommand and no help/version flag, route
// to `deckent chat --native` so the binary behaves like `claude` — opening an
// agentic REPL by default. Explicit subcommands and help/version flags are
// left untouched so existing UX is preserved.

/** Top-level flags / tokens that must short-circuit the default REPL route. */
const HELP_AND_VERSION_FLAGS: ReadonlySet<string> = new Set([
  '--help', '-h', 'help',
  '--version', '-V', '--version-json',
]);

/**
 * Decide whether the given argv should be redirected to `chat --native`.
 *
 * Pure function so tests can exercise the routing without spawning Node.
 *
 * @param argv Full argv (with argv[0]=node, argv[1]=entry script path).
 */
export function shouldLaunchDefaultRepl(argv: readonly string[]): boolean {
  const args = argv.slice(2);
  if (args.length === 0) return true;

  for (const a of args) {
    if (HELP_AND_VERSION_FLAGS.has(a)) return false;
  }

  // Any non-flag token is treated as a subcommand candidate — pass through to
  // Commander so it can handle the dispatch (or surface a "did-you-mean"
  // error for typos). Top-level flag-only argv (e.g. `deckent --foo`) also
  // passes through so Commander can surface its unknown-option error.
  return false;
}

/**
 * Build the argv that `parseAsync` should consume. When the default REPL is
 * triggered, append `chat --native` after argv[0] and argv[1]; otherwise
 * return the original argv unchanged.
 *
 * Sprint 220 Task 220-001: kept as a public export for compatibility with
 * existing tests (`tests/cli/default-repl.test.ts`). At runtime the default
 * REPL path no longer routes through Commander — it is handled inline by
 * {@link launchDefaultRepl} so the REPL connects to a real LLM adapter
 * resolved from config (config.chat_provider → brain_provider → claude).
 */
export function buildEntryArgv(argv: readonly string[]): string[] {
  if (!shouldLaunchDefaultRepl(argv)) return [...argv];
  const [node = 'node', script = 'deckent'] = argv;
  return [node, script, 'chat', '--native'];
}

// ─── Native REPL Provider Wire (Sprint 220 Task 220-001) ────────────────
//
// The default REPL (bare `deckent`) used to print
//   "Deckent native chat (Path C skeleton) — provider not yet wired."
// because chat.ts's --native branch hands runChatNativeLoop a stub adapter.
// This task wires the REPL to a real ChatProviderAdapter resolved from the
// project's config so `echo "selam" | deckent` returns a real LLM response.
//
// Resolution chain (see core/config.ts → resolveChatProvider):
//   1. config.chat_provider — explicit REPL override (e.g. 'ollama')
//   2. config.brain_provider — project's primary provider (e.g. 'opus' → 'claude')
//   3. 'claude' — safe default for fresh checkouts (no config)
//
// The adapter is built inline (host CLI spawn for claude/codex/gemini,
// HTTP fetch for ollama). createSubscriptionChatAdapter from chat-native is
// the design inspiration but its registry resolution is skipped here so we
// can wire the REPL without a full provider bootstrap.

/** Build args appended before the user prompt when invoking the host CLI in "print one-shot" mode. */
function extraArgsForProvider(name: ChatProviderName): readonly string[] {
  switch (name) {
    case 'codex':  return ['exec', '--full-auto'];
    case 'gemini': return ['-p'];
    case 'claude': return ['--print'];
    default:       return ['--print'];
  }
}

/**
 * Sprint 222 Task 222-002 — streaming args (per-token NDJSON output).
 *
 * The default `--print` mode for claude flushes the entire response as one
 * stdout chunk → REPL feels frozen until completion. `--output-format
 * stream-json --verbose` flips the CLI into NDJSON event-stream mode where
 * each assistant message turn (typically a sentence or sub-sentence) is
 * emitted as a single complete JSON line as soon as it is produced (ADR-017
 * stream-json contract). codex (`exec --full-auto`) already streams text
 * incrementally over stdout — no flag needed. gemini stream-json schema
 * differs from claude's and is deferred (out of this task's scope).
 */
function streamingArgsForProvider(name: 'claude' | 'codex' | 'gemini'): readonly string[] {
  switch (name) {
    case 'claude': return ['--print', '--output-format', 'stream-json', '--verbose'];
    case 'codex':  return ['exec', '--full-auto'];
    case 'gemini': return ['-p'];
  }
}

/**
 * Sprint 222 Task 222-002 — extract the assistant text delta from one
 * NDJSON line emitted by `claude --output-format stream-json --verbose`.
 *
 * Returns:
 *   - `string` — partial assistant text delta (caller yields to the stream).
 *   - `null`   — valid JSON event but no text (e.g. `system`/`result`/
 *                ping events). Caller skips silently.
 *   - `undefined` — line is not a parseable JSON object. Caller falls back
 *                   to raw-text passthrough so the legacy `--print` batch
 *                   mode and the existing `streams chunks as they arrive`
 *                   test in `native-repl-wire.test.ts` keep working.
 *
 * Exported so the test suite can drive both the happy + edge branches
 * without spinning up the full streaming pipeline.
 */
export function extractClaudeStreamDelta(line: string): string | null | undefined {
  if (line.length === 0 || line.charCodeAt(0) !== 0x7B /* '{' */) return undefined;
  let obj: unknown;
  try {
    obj = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (!obj || typeof obj !== 'object') return null;
  const event = obj as { type?: string; message?: { content?: unknown } };
  if (event.type !== 'assistant') return null;
  const content = event.message?.content;
  if (!Array.isArray(content)) return null;
  let delta = '';
  for (const part of content) {
    if (
      part && typeof part === 'object'
      && (part as { type?: string }).type === 'text'
      && typeof (part as { text?: unknown }).text === 'string'
    ) {
      delta += (part as { text: string }).text;
    }
  }
  return delta;
}

/** Subscription mode env — drop API-key vars so the CLI uses its bundled session auth. */
function subscriptionReplEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env['ANTHROPIC_API_KEY'];
  delete env['DECKENT_CLAUDE_API_KEY'];
  return env;
}

/**
 * Ollama HTTP adapter — talks to a local Ollama server (default
 * http://localhost:11434). Zero-API: no external network dependency, no
 * subscription. Honours DECKENT_OLLAMA_HOST / DECKENT_OLLAMA_MODEL env vars.
 *
 * Uses the global `fetch` (Node 18+; project requires Node >= 24) so no new
 * runtime dependency is introduced (ADR-010 compliance).
 *
 * Sprint 221 Task 221-005: connection-refused / DNS failures are wrapped
 * with a NET error (`Ollama (<host>) erişilemedi…`) so the smoke command
 * (`DECKENT_CHAT_PROVIDER=ollama … node dist/cli/entry.js`) surfaces a
 * clear "ollama serve" hint instead of an opaque `TypeError: fetch failed`.
 */
function buildOllamaReplAdapter(opts?: { fetchFn?: typeof fetch }): ChatProviderAdapter {
  const host = (process.env['DECKENT_OLLAMA_HOST'] ?? 'http://localhost:11434').replace(/\/$/, '');
  const model = process.env['DECKENT_OLLAMA_MODEL'] ?? 'llama3';
  const fetchImpl = opts?.fetchFn ?? fetch;
  return {
    async send(messages: ChatMessage[]): Promise<ProviderResponse> {
      const prompt = buildSubscriptionPrompt(messages);
      let res: Response;
      try {
        res = await fetchImpl(`${host}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, prompt, stream: false }),
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Ollama (${host}) erişilemedi: ${reason}. ` +
          `'ollama serve' ile başlatın veya DECKENT_OLLAMA_HOST ile farklı host belirtin.`,
        );
      }
      if (!res.ok) {
        throw new Error(`Ollama request failed: ${res.status} ${res.statusText}`);
      }
      const data = (await res.json()) as { response?: string };
      return { text: data.response ?? '', stopReason: 'end_turn' };
    },
  };
}

/**
 * Sprint 221 Task 221-005 — OpenAI-compatible REPL adapter. Bridges the
 * REPL's {@link ChatProviderAdapter} contract onto
 * {@link OpenAICompatibleAdapter} from src/providers/openai-compatible.ts so
 * users can pick `deepseek` / `qwen` / `glm` via DECKENT_CHAT_PROVIDER
 * (or a future config wire) without growing a second adapter implementation.
 *
 * The upstream adapter needs an `apiKey` env var (DEEPSEEK_API_KEY etc.);
 * `send()` surfaces a `ProviderError` when it's missing so the REPL prints
 * a clear actionable message instead of a "provider not yet wired" skeleton.
 */
function buildOpenAICompatReplAdapter(
  presetName: OpenAICompatPresetName,
  opts?: { fetchFn?: typeof fetch },
): ChatProviderAdapter {
  const factory = OPENAI_COMPAT_PRESETS[presetName];
  const adapter = factory(opts?.fetchFn);
  const firstSupported = (adapter.supportedModels[0] as string | undefined) ?? 'unknown';
  const model = process.env['DECKENT_OPENAI_COMPAT_MODEL'] ?? firstSupported;
  return {
    async send(messages: ChatMessage[]): Promise<ProviderResponse> {
      const chatMessages = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
      const result = await adapter.send(chatMessages, model);
      return { text: result.content, stopReason: 'end_turn' };
    },
  };
}

/** Inputs for {@link buildReplProvider} — tests inject `spawnFn`/`fetchFn` to keep hermetic. */
export interface BuildReplProviderOptions {
  /** Custom spawn — injected by tests to avoid touching real binaries. */
  spawnFn?: SubscriptionSpawnFn;
  /** Custom fetch — injected by tests so the Ollama branch never hits the network. */
  fetchFn?: typeof fetch;
  /**
   * Sprint 223 T-223-001 — persistent claude spawn injection. When supplied
   * (or when `spawnFn` is absent on the claude branch), the REPL builds a
   * {@link createPersistentClaudeSession} so a single warm child is reused
   * across every turn instead of paying the per-turn cold-start.
   */
  persistentSpawnFn?: PersistentSpawnFn;
  /** Model id to pass to the host CLI (`--model`). Omit → provider default. */
  model?: string;
}

/**
 * Sprint 221 Task 221-005 — widened union accepted by {@link buildReplProvider}
 * so the REPL can dispatch to OpenAI-compatible HTTP backends (`deepseek` /
 * `qwen` / `glm`) without modifying the narrower {@link ChatProviderName}
 * union owned by `core/config.ts` (out of this task's scope). Selected via
 * the `DECKENT_CHAT_PROVIDER` env override (see {@link resolveReplProviderForCwd}).
 */
export type ReplProviderName = ChatProviderName | OpenAICompatPresetName;

const OPENAI_COMPAT_NAMES: readonly OpenAICompatPresetName[] = ['deepseek', 'qwen', 'glm'];

function isOpenAICompatName(name: string): name is OpenAICompatPresetName {
  return (OPENAI_COMPAT_NAMES as readonly string[]).includes(name);
}

/**
 * Build a real {@link ChatProviderAdapter} for the native REPL.
 *
 * - `'ollama'`               → HTTP fetch adapter (zero external API).
 * - `'deepseek' | 'qwen' | 'glm'` → OpenAI-compatible HTTP adapter via
 *   `OPENAI_COMPAT_PRESETS` (apiKey from preset env var; Sprint 221 T-005).
 * - `'claude' | 'codex' | 'gemini'` → spawn the host CLI in print/one-shot
 *   mode. The shape mirrors createSubscriptionChatAdapter (chat-native.ts)
 *   without the global registry lookup so the REPL boot does not require a
 *   full provider bootstrap.
 * - anything else            → throws a clear `Unknown REPL provider …` error.
 */
export function buildReplProvider(
  name: ReplProviderName,
  opts: BuildReplProviderOptions = {},
): ChatProviderAdapter {
  if (name === 'ollama') {
    return buildOllamaReplAdapter(opts.fetchFn ? { fetchFn: opts.fetchFn } : {});
  }
  if (isOpenAICompatName(name)) {
    return buildOpenAICompatReplAdapter(name, opts.fetchFn ? { fetchFn: opts.fetchFn } : {});
  }
  if (name !== 'claude' && name !== 'codex' && name !== 'gemini') {
    throw new Error(
      `Unknown REPL provider: "${String(name)}". Valid: claude, codex, gemini, ollama, deepseek, qwen, glm.`,
    );
  }

  // Sprint 223 T-223-001 — persistent claude session wire. The default REPL
  // path (no `spawnFn` injected) and the new persistent-wire tests
  // (`persistentSpawnFn` injected) both spawn ONE warm claude child and reuse
  // it across every turn — eliminating the per-turn ~4.5s cold-start that
  // made the 2-message REPL feel ~17s. codex/gemini stay per-turn here; only
  // claude pays a cold-start big enough to justify the persistent stream-json
  // session. Legacy tests that inject `spawnFn` (SubscriptionSpawnFn) keep
  // the per-turn path so the existing repl-streaming/native-repl-wire suites
  // remain green.
  if (name === 'claude' && (opts.persistentSpawnFn || !opts.spawnFn)) {
    // T-224-005/006 — append the agentic system prompt so the model emits
    // <deckent_tool> directives for file/shell actions (the REPL confirms +
    // executes them via the tool-exec dispatcher). Plain chat is unaffected.
    return createPersistentClaudeSession({
      systemPrompt: DECKENT_AGENTIC_SYSTEM_PROMPT,
      ...(opts.model ? { extraArgs: [...DEFAULT_PERSISTENT_ARGS, '--model', opts.model] } : {}),
      ...(opts.persistentSpawnFn ? { spawnFn: opts.persistentSpawnFn } : {}),
    });
  }

  const binary = name;
  const extraArgs = opts.model
    ? [...extraArgsForProvider(name), '--model', opts.model]
    : extraArgsForProvider(name);
  const spawnFn: SubscriptionSpawnFn = opts.spawnFn ?? defaultSubscriptionSpawn;

  return {
    async send(messages) {
      const prompt = buildSubscriptionPrompt(messages);
      const { chunks, wait } = spawnFn(binary, [...extraArgs, prompt], subscriptionReplEnv());
      let text = '';
      for await (const chunk of chunks) text += chunk;
      await wait;
      return { text, stopReason: 'end_turn' };
    },
    async *stream(messages) {
      const prompt = buildSubscriptionPrompt(messages);
      // Sprint 222 Task 222-002 — request per-token stream-json (claude) so the
      // CLI flushes deltas as they arrive instead of dumping the full response
      // as one batched chunk. Legacy non-JSON stdout (codex/gemini, or any
      // future fallback) is detected on the first chunk and passes through
      // unchanged so existing callers / tests stay green.
      const args = streamingArgsForProvider(name);
      const { chunks, wait } = spawnFn(binary, [...args, prompt], subscriptionReplEnv());
      let collected = '';
      let buffer = '';
      let mode: 'unknown' | 'raw' | 'ndjson' = 'unknown';
      for await (const chunk of chunks) {
        if (chunk.length === 0) continue;
        if (mode === 'unknown') {
          mode = chunk.charCodeAt(0) === 0x7B /* '{' */ ? 'ndjson' : 'raw';
        }
        if (mode === 'raw') {
          collected += chunk;
          yield { text: chunk };
          continue;
        }
        // ndjson: buffer across chunk boundaries, drain complete lines.
        buffer += chunk;
        let nlIdx: number;
        while ((nlIdx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nlIdx);
          buffer = buffer.slice(nlIdx + 1);
          if (line.length === 0) continue;
          const delta = extractClaudeStreamDelta(line);
          if (delta === undefined) {
            // Looked like NDJSON but didn't parse — never swallow data.
            collected += line + '\n';
            yield { text: line + '\n' };
          } else if (delta !== null && delta.length > 0) {
            collected += delta;
            yield { text: delta };
          }
        }
      }
      // Flush trailing partial line (no terminating newline) — only relevant
      // in ndjson mode; raw mode already emitted everything inline above.
      if (mode === 'ndjson' && buffer.length > 0) {
        const delta = extractClaudeStreamDelta(buffer);
        if (delta === undefined) {
          collected += buffer;
          yield { text: buffer };
        } else if (delta !== null && delta.length > 0) {
          collected += delta;
          yield { text: delta };
        }
        buffer = '';
      }
      await wait;
      yield { done: { text: collected, stopReason: 'end_turn' } };
    },
  };
}

const ALL_REPL_PROVIDER_NAMES: readonly ReplProviderName[] = [
  'claude', 'codex', 'gemini', 'ollama', 'deepseek', 'qwen', 'glm',
];

function isValidReplProviderName(name: string): name is ReplProviderName {
  return (ALL_REPL_PROVIDER_NAMES as readonly string[]).includes(name);
}

/**
 * Resolve the REPL provider for the current cwd.
 *
 * Precedence (Sprint 221 Task 221-005):
 *   1. `DECKENT_CHAT_PROVIDER` env override — power-user / smoke command path
 *      (e.g. `DECKENT_CHAT_PROVIDER=ollama node dist/cli/entry.js`). Accepts
 *      the widened {@link ReplProviderName} union (ollama + openai-compat
 *      presets) so the smoke command can hit those without disk config.
 *   2. `config.chat_provider` → `config.brain_provider` → `'claude'` via
 *      {@link resolveChatProvider} (Sprint 220 Task 220-001 fallback chain).
 *
 * Invalid env values fall through to disk config so a typo cannot stall the
 * REPL boot path.
 */
async function resolveReplProviderForCwd(): Promise<ReplProviderName> {
  const envOverride = process.env['DECKENT_CHAT_PROVIDER'];
  if (envOverride && isValidReplProviderName(envOverride)) return envOverride;
  try {
    const cfg = await loadConfig();
    return resolveChatProvider(cfg);
  } catch {
    return 'claude';
  }
}

/**
 * Sprint 224 T-224-001 — readline options for the REPL stdin reader.
 *
 * On a TTY we enable full terminal mode: `output` + `terminal: true` turn on
 * readline's line-editing (←/→ cursor, backspace/Delete), ↑/↓ history
 * (`historySize`) and arrow-key handling, so raw escape sequences (`^[[A`) no
 * longer leak into the buffer. Non-TTY/pipe contexts get the line-only reader
 * (no echo, deterministic) so tests, HTTP backends and `printf | deckent`
 * smoke runs are unaffected. Exported so the selection logic is unit-testable
 * without a real terminal.
 */
export function replReadlineOptions(isTty: boolean): ReadLineOptions {
  return isTty
    ? { input: process.stdin, output: process.stdout, terminal: true, historySize: 100 }
    : { input: process.stdin };
}

/**
 * Launch the default REPL (bare `deckent`). Connects stdin to runChatNativeLoop
 * with a real {@link ChatProviderAdapter} so the user gets a real LLM round-trip
 * instead of the legacy skeleton message.
 */
export async function launchDefaultRepl(): Promise<void> {
  const providerName = await resolveReplProviderForCwd();
  let provider: ChatProviderAdapter;
  try {
    provider = buildReplProvider(providerName);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`deckent REPL: ${msg}\n`);
    process.exit(1);
    return;
  }
  // Welcome chrome. The banner shows `deckent  provider  dir` + the /help hint.
  // (Sprint 222's separate status-line print was dropped here: at boot
  // activeSprint is null, so it was byte-identical to the banner header and
  // produced a visible duplicate. renderStatusLine stays exported for
  // sprint-aware status surfaces.) In TUI mode the banner is skipped — the
  // scroll-region TUI prints its own intro.
  const isTtyEarly = process.stdin.isTTY === true && process.stdout.isTTY === true;

  // Sprint 224 — Ink REPL (React-for-CLI, the enterprise-grade native foundation
  // that replaces the hand-rolled raw-ANSI TUI). Opt-in via DECKENT_INK=1 while
  // it is verified; will become the default once it reaches parity. Dynamic
  // import keeps Ink/React out of the non-REPL CLI startup path.
  // Sprint 224 E7 — the Ink REPL is now the DEFAULT for an interactive TTY
  // (enterprise-grade native parity: markdown/tables/code, interactive /menu,
  // model·provider switch, token footer, agentic diff, paste-as-one, …). The
  // legacy readline/scroll-region paths remain reachable via DECKENT_INK=0 as a
  // one-release escape hatch (full removal is a follow-up cleanup).
  const inkMode = isTtyEarly && process.env['DECKENT_INK'] !== '0';
  if (inkMode) {
    const { runInkRepl } = await import('./repl/run.js');
    await runInkRepl(provider, providerName, (sel) =>
      buildReplProvider(sel.provider as ReplProviderName, sel.model ? { model: sel.model } : {}));
    return;
  }

  const tuiMode = isTtyEarly && process.env['DECKENT_TUI'] === '1';
  if (!tuiMode) {
    process.stdout.write(renderBanner({ provider: providerName, dir: process.cwd() }));
  }

  // Sprint 224 — interactive REPL render model.
  //
  // T-224-001 terminal-mode readline (line-editing/history/arrow-keys) +
  // T-224-014 pinned-prompt render region: ONE readline owns the `› ` input
  // line at the bottom; provider output is written ABOVE it via writeAbove so
  // streamed replies and the still-editable input never collide (the
  // "düşünüyor…fd" garble). The animated braille spinner is intentionally NOT
  // used on an interactive TTY — it `\r`-overwrites the same bottom line as
  // readline and was the main collision source; the `● deckent` header plus the
  // streamed tokens are the working indicator instead. createLineQueue buffers
  // lines typed during a turn so back-to-back sends are processed in order
  // ("art arda"). Non-TTY/pipe keeps the simple line iterator + plain output so
  // tests, HTTP backends and `printf | deckent` smoke runs are byte-for-byte
  // unchanged (spinner stays a no-op there).
  const isTty = process.stdin.isTTY === true && process.stdout.isTTY === true;

  // T-224-019 v2 — true bottom-pinned TUI (DECSTBM scroll region + manual input
  // line). EXPERIMENTAL, opt-in via DECKENT_TUI=1. This is the real claude-code
  // fixed-input-bar (readline's writeAbove approach could not pin). Self-test +
  // visual-verify before it becomes the default. Falls through to the readline
  // path otherwise.
  if (isTty && process.env['DECKENT_TUI'] === '1') {
    await runPinnedTuiRepl(provider);
    return;
  }

  // T-224-017 — `/` command menu: a slash completer gives claude-code-style
  // Tab-completion/listing of slash commands on a TTY.
  const baseReadlineOpts = replReadlineOptions(isTty);
  const rl = createInterface(isTty ? { ...baseReadlineOpts, completer: slashCompleter } : baseReadlineOpts);
  const region = createPromptRegion(rl, process.stdout, { isTty });

  // T-224-020 — interactive `/` menu. When the user types a lone `/`, write the
  // command menu ONCE above the pinned prompt (the verified writeAbove path —
  // prompt stays pinned, the typed `/` is preserved). Refinement is handled by
  // the Tab completer (224-017). This is the safe wire: no cursor-takeover, so
  // the working line-editing REPL is never destabilised. Off-TTY: no-op.
  if (isTty) {
    const slashRegistry = buildSlashRegistry();
    let menuShownFor: string | null = null;
    process.stdin.on('keypress', () => {
      // Defer so readline has updated rl.line for this keystroke.
      setImmediate(() => {
        const line = (rl as unknown as { line?: string }).line ?? '';
        const next = slashMenuOnKeypress(line, menuShownFor);
        menuShownFor = next.shownFor;
        if (next.show) {
          region.writeAbove(renderSlashMenu(filterSlashCommands(slashRegistry, '/'), 0, isTty));
        }
      });
    });
  }

  // T-224-006 — input arbiter. A single 'line' handler routes each typed line
  // either to a PENDING confirm (askConfirm) or to the chat queue, so the
  // interactive y/N tool confirm shares the REPL's ONE stdin/readline instead
  // of opening a second (colliding) interface. The `› ` prompt is (re)shown
  // only when idle (between turns / at startup), never mid-turn, so streamed
  // output never collides with it. Back-to-back lines queue ("art arda").
  const lineBuf: string[] = [];
  let lineWake: (() => void) | null = null;
  let inputClosed = false;
  let pendingAnswer: ((line: string) => void) | null = null;
  const enqueue = (msg: string): void => {
    lineBuf.push(msg);
    if (lineWake) { const w = lineWake; lineWake = null; w(); }
  };
  // T-224-004 — paste coalescer: multi-line paste arrives as a burst of 'line'
  // events; coalesce them into ONE message (else each line is a separate turn).
  // Single typed line → emitted after the small window. Confirm answers bypass
  // this (handled before feed). Only on an interactive TTY.
  const paste = isTty ? createPasteCoalescer(enqueue) : null;
  rl.on('line', (line: string) => {
    if (pendingAnswer) { const p = pendingAnswer; pendingAnswer = null; p(line); return; }
    if (paste) paste.feed(line); else enqueue(line);
  });
  rl.on('close', () => {
    inputClosed = true;
    if (pendingAnswer) { const p = pendingAnswer; pendingAnswer = null; p(''); }
    paste?.flush();
    if (lineWake) { const w = lineWake; lineWake = null; w(); }
  });
  async function* arbitratedInput(): AsyncGenerator<string> {
    while (true) {
      while (lineBuf.length > 0) yield lineBuf.shift() as string;
      if (inputClosed) return;
      region.reprompt();
      await new Promise<void>((r) => { lineWake = r; });
    }
  }
  async function* simpleLines(): AsyncGenerator<string> {
    for await (const line of rl) yield line;
  }
  // T-224-016 — permission memory. Approvals can be persisted to
  // .deckent/repl-permissions.json so a remembered tool is auto-approved and
  // never re-asked (claude-code settings.allow feel).
  const perms = createPermissionStore(process.cwd());

  // Interactive confirm for side-effecting tools — reads the next line via the
  // arbiter (TTY, single stdin). 3-way: y = bir kez · a = bu tool'a hep izin
  // ver (persist) · N = reddet. Remembered tools skip the prompt entirely.
  // Off-TTY auto-approves (pipe/smoke/tests stay headless).
  const askConfirm = (summary: string, toolName: string): Promise<boolean> => {
    if (perms.isAllowed(toolName)) return Promise.resolve(true);
    process.stdout.write(
      `\n\x1b[33m${summary}\x1b[0m\n(y = izin ver · a = bu tool'a hep izin ver · N = reddet) `,
    );
    return new Promise<boolean>((resolve) => {
      pendingAnswer = (line) => {
        const ans = line.trim().toLowerCase();
        if (ans === 'a') {
          perms.allow(toolName);
          resolve(true);
        } else {
          resolve(ans === 'y');
        }
      };
    });
  };

  // T-224-005 — combined dispatcher: deckent_* action tools (write/edit/read/
  // bash) go to the confirm-gated tool-exec layer; read-only status/recall/
  // history slashes stay on the CLI bridge.
  const cliDispatcher = createCliToolDispatcher();
  const execDispatcher = createToolExecDispatcher({
    cwd: process.cwd(),
    confirm: isTty ? askConfirm : async () => true,
  });
  const EXEC_TOOLS = new Set([
    'deckent_write_file', 'deckent_read_file', 'deckent_edit_file', 'deckent_bash',
  ]);
  const dispatcher = {
    dispatch: (toolName: string, args: Record<string, unknown>): Promise<string> =>
      EXEC_TOOLS.has(toolName)
        ? execDispatcher.dispatch(toolName, args)
        : cliDispatcher.dispatch(toolName, args),
  };

  // T-224-023 — streaming markdown. On a TTY the reply streams token-by-token,
  // so `**bold**` / `` `code` `` are rendered inline via this stateful transform
  // (else the markers show literally). Non-TTY → passthrough (pipe unchanged).
  const streamMd = createStreamMarkdown(isTty);

  // T-224-019 — pinned-input-bar (line-buffered writeAbove). HONEST NOTE: this
  // approach does NOT truly pin the prompt to the terminal bottom — writeAbove
  // pushes the `› ` prompt DOWN one line per output line (it descends through
  // the screen, "yukarıdan aşağıya kayıyor"), and the line-buffering breaks the
  // token-smooth stream (felt slow). A true claude-code bottom-pinned bar needs
  // a scroll-region (DECSTBM) + manual input line — built separately as
  // chat-pinned-tui. So this path is now DEFAULT OFF (opt-in DECKENT_PINNED_BAR=1
  // for experiments); the default restores the fast raw token-smooth stream.
  const pinnedBar = isTty && process.env['DECKENT_PINNED_BAR'] === '1';
  const lineSink = pinnedBar
    ? createLineBufferedSink((line) => region.writeAbove(streamMd.feed(line) + streamMd.flush()))
    : null;

  await runChatNativeLoop({
    provider,
    dispatcher,
    input: isTty ? arbitratedInput() : simpleLines(),
    // T-224-011 — on an interactive TTY write provider output RAW (no forced
    // newline) so streamed token deltas concatenate INLINE (smooth, claude-code
    // feel) instead of one-fragment-per-line. T-224-023 — fed through the
    // streaming-markdown transform so bold/code render live. The loop closes
    // each turn with a single newline. Off-TTY keeps the line-buffered sink
    // (pipe/HTTP/tests byte-for-byte unchanged).
    output: pinnedBar
      ? (line) => lineSink!.feed(line)
      : isTty
        ? (line) => process.stdout.write(streamMd.feed(line))
        : (line) => process.stdout.write(line.endsWith('\n') ? line : line + '\n'),
    gracefulErrors: true,
    layoutEnabled: true,
    // T-224-014 — rotating-verb ticker animates `● deckent · <fiil>…` on its
    // own line during thinking and finalizes to `● deckent` + newline on the
    // first token (reply then streams inline below). Off-TTY: no-op spinner.
    thinkingIndicator: isTty
      ? createThinkingTicker(process.stdout, { isTty })
      : createSpinner('düşünüyor…'),
    // T-224-002 — on an interactive TTY readline already echoes the typed line,
    // so the loop suppresses its own `› line` echo to avoid the double-print.
    interactiveTty: isTty,
  });

  rl.close();

  // Sprint 223 T-223-001 — persistent claude session cleanup. The `:exit`
  // slash drops out of runChatNativeLoop, so we kill the warm claude child
  // here. Duck-typed: only PersistentClaudeSession exposes `exit`, so the
  // codex/gemini/ollama/openai-compat branches are unaffected.
  const maybeSession = provider as Partial<PersistentClaudeSession>;
  if (typeof maybeSession.exit === 'function') {
    await maybeSession.exit();
  }
}

/**
 * T-224-019 v2 — bottom-pinned TUI REPL loop. The {@link PinnedTui} controller
 * owns raw-mode stdin + a DECSTBM scroll region: the `› ` input is pinned to the
 * last terminal row, provider output streams above it, and side-effecting tools
 * confirm via a single-key (y/a/N) modal. Experimental (DECKENT_TUI=1).
 */
async function runPinnedTuiRepl(provider: ChatProviderAdapter): Promise<void> {
  const DIM = '\x1b[2m';
  const BOLD = '\x1b[1m';
  const TEAL = '\x1b[38;2;77;184;164m';
  const RESET = '\x1b[0m';
  // i18n-first: resolve language once, inject localized labels into the
  // string-free TUI controller (getMessage, never hardcoded).
  let lang = 'en';
  try { lang = getLanguage((await loadConfig()).language); } catch { /* default en */ }
  const t = (key: string): string => getMessage(key, lang);
  const ctl = new PinnedTui({
    out: process.stdout,
    input: process.stdin,
    labels: {
      confirmHint: t('tui.confirm_hint'),
      confirmGranted: t('tui.confirm_granted'),
      confirmAlways: t('tui.confirm_always'),
      confirmDenied: t('tui.confirm_denied'),
    },
    // Tokens stream raw (smooth); each completed line is re-rendered through
    // renderMarkdown (links → clickable OSC-8, bold/code/headings/lists, file
    // paths → cyan). Best of both: live streaming + correct markdown per line.
    renderLine: (line) => renderMarkdown(line, true),
  });
  const perms = createPermissionStore(process.cwd());

  const askConfirm = async (summary: string, toolName: string): Promise<boolean> => {
    if (perms.isAllowed(toolName)) return true;
    const answer = await ctl.confirm(summary);
    if (answer === 'a') perms.allow(toolName);
    return answer !== 'n';
  };

  const cliDispatcher = createCliToolDispatcher();
  const execDispatcher = createToolExecDispatcher({ cwd: process.cwd(), confirm: askConfirm });
  const EXEC_TOOLS = new Set(['deckent_write_file', 'deckent_read_file', 'deckent_edit_file', 'deckent_bash']);
  const dispatcher = {
    dispatch: (toolName: string, args: Record<string, unknown>): Promise<string> =>
      EXEC_TOOLS.has(toolName) ? execDispatcher.dispatch(toolName, args) : cliDispatcher.dispatch(toolName, args),
  };

  ctl.start();
  ctl.writeLine(`${DIM}${t('tui.intro')}${RESET}`);
  ctl.onInterrupt(() => ctl.stop());

  try {
    await runChatNativeLoop({
      provider,
      dispatcher,
      input: ctl.lines(),
      // Stream tokens raw+smooth; each completed line re-renders via renderLine.
      output: (text: string) => ctl.writeStreaming(text),
      gracefulErrors: true,
      layoutEnabled: false, // the controller echoes the user turn + we stream the reply
      interactiveTty: true,
      // Clean `● deckent` block header (kraken-colored) marks the assistant turn
      // — distinct from the user's `›` echo; the "· düşünüyor…" marker is
      // transient (wiped when the first reply token arrives, not left in history).
      thinkingIndicator: {
        start: () => { ctl.writeLine(`${TEAL}●${RESET} ${BOLD}deckent${RESET}`); ctl.setThinking(`${DIM}· ${t('tui.thinking')}${RESET}`); },
        stop: () => ctl.clearThinking(),
      },
    });
  } finally {
    ctl.stop();
    const maybeSession = provider as Partial<PersistentClaudeSession>;
    if (typeof maybeSession.exit === 'function') await maybeSession.exit();
  }
}

// ─── Node Version Guard ─────────────────────────────────────────────────────
const [major] = process.versions.node.split('.').map(Number);
if ((major ?? 0) < 24) {
  process.stderr.write(
    `deckent requires Node.js >= 24 (Active LTS). Current version: ${process.versions.node}\n`,
  );
  process.exit(1);
}

// ─── Unhandled Rejections ────────────────────────────────────────────────────
process.on('unhandledRejection', (reason: unknown) => {
  handleCliError(reason);
});

// ─── Graceful Shutdown ───────────────────────────────────────────────────────
function onSignal(signal: string): void {
  process.stderr.write(`\nReceived ${signal}, exiting…\n`);
  if (signal === 'SIGINT') {
    // Interrupt active sprint: mark tasks INTERRUPTED, heartbeats ABORTED, release locks
    try { interruptActiveSprint(); } catch { /* non-fatal */ }
    // Kill tmux sessions used by workers
    try { killAllSessions(); } catch { /* non-fatal */ }
  }
  process.exit(0);
}

process.on('SIGINT', () => onSignal('SIGINT'));
process.on('SIGTERM', () => onSignal('SIGTERM'));

// ─── Entry ───────────────────────────────────────────────────────────────────
// Sprint 220 Task 220-001: when the user invokes `deckent` with no subcommand
// the REPL launches inline against a real provider adapter resolved from
// config — no Commander dispatch, no "provider not yet wired" skeleton. All
// other invocations continue through buildProgram() unchanged.
//
// The dispatcher is gated by `isEntryMain()` so importing this module from a
// test file (vi.mock + dynamic import) does not fire the REPL or open stdin.
// The smoke command (`node dist/cli/entry.js`) still executes both branches.
function isEntryMain(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  try {
    const here = fileURLToPath(import.meta.url);
    if (here === argv1) return true;
    // npm-link / global bin: argv[1] is a symlink (e.g. ~/.nvm/.../bin/deckent)
    // pointing at this file. Resolve it so `deckent` / `npx deckent` fire main,
    // not just `node dist/cli/entry.js`.
    try {
      return here === realpathSync(argv1);
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

// Sprint 221 Task 221-013: routing contract — argümansız (no args) → REPL;
// argümanlı (`help` / `serve` / `--version` / unknown / any subcommand) →
// Commander. Verified by tests/cli/cli-bin-invocation.test.ts so the global
// `deckent` / `npx deckent <cmd>` cannot silently fall back to the REPL.
if (isEntryMain()) {
  if (shouldLaunchDefaultRepl(process.argv)) {
    launchDefaultRepl().catch((err: unknown) => {
      handleCliError(err);
    });
  } else {
    buildProgram()
      .hook('preAction', async () => {
        await bootstrapFromCatalog({ offline: process.env['DECKENT_OFFLINE'] === '1' });
      })
      .parseAsync(process.argv)
      .catch((err: unknown) => {
        handleCliError(err);
      });
  }
}
