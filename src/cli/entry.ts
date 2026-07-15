#!/usr/bin/env node

import { createInterface, type ReadLineOptions } from 'node:readline';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildProgram } from './index.js';
import { handleCliError } from './helpers/process.js';
import { registerShutdownHook, hasShutdownHooks, runShutdownHooks } from './helpers/shutdown-hooks.js';
import { interruptActiveSprint } from '../orchestra/sprint-controller.js';
import { killAllSessions } from '../orchestra/tmux.js';
import { bootstrapFromCatalog } from '../core/model-catalog.js';
import { loadConfig, resolveChatProvider, type ChatProviderName } from '../core/config.js';
import { isCatalogDependent } from './command-registry.js';
import { getMessage } from './helpers/messages.js';
import { resolveChatAdapter } from './commands/chat-provider-parity.js';
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
import { buildToolExecLabels } from './helpers/tool-exec-labels.js';
import { createPermissionStore } from './commands/chat-permissions.js';
import { slashCompleter, buildSlashRegistry } from './commands/chat-slash-registry.js';
import { slashMenuOnKeypress, renderSlashMenu, filterSlashCommands } from './commands/chat-slash-menu.js';
import { createPromptRegion, createThinkingTicker, createPasteCoalescer, createLineBufferedSink } from './commands/chat-render-region.js';
import { createStreamMarkdown } from './commands/chat-render.js';
import {
  OPENAI_COMPAT_PRESETS,
  type OpenAICompatPresetName,
} from '../providers/openai-compatible.js';
import { buildHealthSnapshot, renderHealthSnapshot } from './helpers/health-snapshot.js';
import { getLangFromConfig } from './helpers/config-reader.js';

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
 * Top-level flags that are REPL-only and must NOT be passed to Commander.
 * `--legacy-loop` (M5-NATIVE-FLIP, 376-003) is the CLI rollback path back to
 * the legacy runChatNativeLoop engine now that the native-agent tool-use loop
 * is the REPL default — see `isNativeAgentSelected` (src/cli/repl/run.tsx).
 */
const REPL_ONLY_FLAGS: ReadonlySet<string> = new Set(['--native', '--legacy-loop']);

/**
 * born-550 (SEC, 383-002) — explicit opt-in for off-TTY (piped/non-interactive)
 * invocations to auto-approve side-effecting tool calls (write/edit/bash).
 * Same flag name/semantics as the `--auto-approve` contract already
 * established for `deckent start`/`deckent run` (born-561): flag absent →
 * no auto-approve, flag present → auto-approve. Recognized alongside
 * REPL_ONLY_FLAGS so `deckent --auto-approve` (bare, piped) still routes to
 * the default REPL instead of erroring through Commander, which has no
 * top-level `--auto-approve`/`--yes` option.
 */
const OFF_TTY_AUTO_APPROVE_FLAGS: ReadonlySet<string> = new Set(['--auto-approve', '--yes']);

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

  // REPL-only flags (e.g. --native) and the off-TTY auto-approve opt-in must
  // not be handed to Commander. If every arg is one of those, launch the REPL.
  if (args.every((a) => REPL_ONLY_FLAGS.has(a) || OFF_TTY_AUTO_APPROVE_FLAGS.has(a))) return true;

  // Any non-flag token is treated as a subcommand candidate — pass through to
  // Commander so it can handle the dispatch (or surface a "did-you-mean"
  // error for typos). Top-level flag-only argv (e.g. `deckent --foo`) also
  // passes through so Commander can surface its unknown-option error.
  return false;
}

/**
 * born-550 (SEC, 383-002) — does argv carry the explicit off-TTY auto-approve
 * opt-in (`--auto-approve` / `--yes`)? Piped/non-interactive stdin is the
 * least-controlled invocation shape (no human present to see a y/N prompt),
 * so unlike the interactive-TTY path (which always uses the real confirm
 * gate), off-TTY side-effecting tool calls (write/edit/bash) now require this
 * explicit flag — no flag means no auto-approve.
 *
 * Pure function so tests can exercise the decision without spawning Node.
 *
 * @param args argv with argv[0]/argv[1] (node, script path) already stripped.
 */
export function shouldAutoApproveOffTty(args: readonly string[]): boolean {
  return args.some((a) => OFF_TTY_AUTO_APPROVE_FLAGS.has(a));
}

/**
 * SEC-04 (task 418-003) — first non-flag token in argv, i.e. the top-level
 * command name Commander will dispatch to. All top-level program options in
 * this CLI are boolean-only (`-V/--version`, `--version-json` — see
 * buildProgram()), so no top-level option ever consumes the following token
 * as a value; the first non-dash token is always the real command name.
 *
 * This deliberately reads argv directly instead of Commander's own
 * `actionCommand.name()` (only available inside a live preAction hook
 * invocation): several top-level commands have SUBcommands that share a
 * name with an unrelated top-level command (e.g. `deckent autonomous
 * start` vs top-level `deckent start`; `deckent flow run` vs top-level
 * `deckent run`) — `actionCommand.name()` would return the leaf name
 * ("start"/"run") in both cases, colliding with the top-level command's own
 * classification. Reading argv[2] instead always yields the true top-level
 * command ("autonomous"/"flow"), so the collision cannot happen.
 */
export function topLevelCommandName(argv: readonly string[]): string | undefined {
  return argv.slice(2).find((a) => !a.startsWith('-'));
}

/**
 * SEC-04 (task 418-003) — does this invocation need the model catalog
 * bootstrapped? Delegates the actual classification to the command
 * registry (`isCatalogDependent`) — no hand-written command list here.
 */
export function shouldBootstrapCatalogFor(argv: readonly string[]): boolean {
  const name = topLevelCommandName(argv);
  return name !== undefined && isCatalogDependent(name);
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

/**
 * Sprint 388 Task 388-007 (born-547, ENTRY-NDJSON-FALLBACK) — extract a
 * human-readable failure message from a claude stream-json `result` event
 * that failed (`is_error: true`).
 *
 * The stream-json protocol has no distinct top-level `error` event: a failed
 * turn (overloaded / rate-limited / max-turns / API error) is reported as a
 * `result` event — the SAME top-level `type` as a successful one — carrying
 * `is_error: true`. {@link extractClaudeStreamDelta} treats every non-
 * `assistant` type uniformly (returns `null`, caller skips silently), which
 * previously meant a failed turn's `result` event vanished exactly like a
 * successful one's — the REPL user saw a truncated reply with no indication
 * anything went wrong. This is intentionally a SEPARATE function (not a
 * change to `extractClaudeStreamDelta`'s branches) so the assistant-delta
 * path stays byte-for-byte unchanged; callers check this FIRST and only fall
 * through to the existing delta extraction when it returns `undefined`.
 *
 * Returns:
 *   - `string` — a human-readable failure message (never empty).
 *   - `undefined` — not a failed `result` event (assistant events, successful
 *     results, system/ping chatter, unparseable lines all fall through
 *     unchanged to {@link extractClaudeStreamDelta}).
 */
export function extractClaudeStreamErrorText(line: string): string | undefined {
  if (line.length === 0 || line.charCodeAt(0) !== 0x7B /* '{' */) return undefined;
  let obj: unknown;
  try {
    obj = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (!obj || typeof obj !== 'object') return undefined;
  const event = obj as { type?: string; is_error?: unknown; result?: unknown; subtype?: unknown };
  if (event.type !== 'result' || event.is_error !== true) return undefined;
  if (typeof event.result === 'string' && event.result.length > 0) return event.result;
  if (typeof event.subtype === 'string' && event.subtype.length > 0) return event.subtype;
  return 'claude stream-json result: is_error=true';
}

/** Subscription mode env — drop API-key vars so the CLI uses its bundled session auth. */
function subscriptionReplEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env['ANTHROPIC_API_KEY'];
  delete env['DECKENT_CLAUDE_API_KEY'];
  // born-548: Gemini CLI treats any of these as API-key auth, outranking its
  // own OAuth session file (see provider-auth-probe.ts's probeGemini) — strip
  // them here too, matching the parity fix already applied to
  // chat-provider-parity.ts's subscriptionEnv() (F11-014). Without this, a
  // GOOGLE_API_KEY/GEMINI_API_KEY set in the host env leaked through on the
  // .stream() / --model-override .send() paths (this function), even though
  // the SSOT-delegated .send() path already blocked it.
  delete env['GEMINI_API_KEY'];
  delete env['GOOGLE_API_KEY'];
  delete env['DECKENT_GOOGLE_API_KEY'];
  return env;
}

/**
 * Ollama HTTP adapter — talks to a local Ollama server (default
 * http://localhost:11434). Zero-API: no external network dependency, no
 * subscription. Honours DECKENT_OLLAMA_HOST / DECKENT_OLLAMA_MODEL env vars.
 *
 * Sprint 357 T-357-011 (PROVIDER-SSOT) — the HTTP mechanics (host/model
 * resolution, request body, `/api/generate` call, HTTP-status error message)
 * are single-sourced in {@link resolveChatAdapter} (chat-provider-parity.ts,
 * ADR-083 SSOT). The only REPL-only behavior kept here is Sprint 221 Task
 * 221-005's connection-refused / DNS-failure wrap: the SSOT lets a raw fetch
 * rejection propagate unwrapped (it has no REPL-specific UX concerns), so
 * this wrapper catches ONLY that case and rewraps it with the Turkish
 * `Ollama (<host>) erişilemedi… 'ollama serve' …` hint. An HTTP-status error
 * (`res.ok === false`) already carries a clear `Ollama request failed: …`
 * message from the SSOT and passes through unchanged.
 */
function buildOllamaReplAdapter(opts?: { fetchFn?: typeof fetch }): ChatProviderAdapter {
  const host = (process.env['DECKENT_OLLAMA_HOST'] ?? 'http://localhost:11434').replace(/\/$/, '');
  const inner = resolveChatAdapter('ollama', opts?.fetchFn ? { fetchFn: opts.fetchFn } : {});
  return {
    async send(messages: ChatMessage[]): Promise<ProviderResponse> {
      try {
        return await inner.send(messages);
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('Ollama request failed')) throw err;
        const reason = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Ollama (${host}) erişilemedi: ${reason}. ` +
          `'ollama serve' ile başlatın veya DECKENT_OLLAMA_HOST ile farklı host belirtin.`,
        );
      }
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
 * Sprint 222 Task 222-002 streaming logic, kept local to the REPL (see the
 * behavior-diff matrix on {@link buildReplProvider}): `resolveChatAdapter`'s
 * (SSOT) `.stream()` is raw-chunk passthrough using ONE fixed arg table
 * shared with `.send()` — it cannot request claude's `--output-format
 * stream-json --verbose` mode, so it cannot parse per-token NDJSON deltas.
 * Shared by both the SSOT-delegated and the `--model`-override send paths in
 * {@link buildReplProvider} since neither the args nor the parsing here
 * depend on `opts.model` — a pre-existing gap (model overrides apply to
 * `.send()` only, never `.stream()`) preserved as-is by this extraction.
 */
function buildCliStream(
  name: 'claude' | 'codex' | 'gemini',
  spawnFn: SubscriptionSpawnFn,
): (messages: ChatMessage[]) => AsyncGenerator<{ text?: string; done?: ProviderResponse }> {
  return async function* stream(messages: ChatMessage[]) {
    const prompt = buildSubscriptionPrompt(messages);
    // Request per-token stream-json (claude) so the CLI flushes deltas as
    // they arrive instead of dumping the full response as one batched chunk.
    // Legacy non-JSON stdout (codex/gemini, or any future fallback) is
    // detected on the first chunk and passes through unchanged so existing
    // callers / tests stay green.
    const args = streamingArgsForProvider(name);
    const { chunks, wait } = spawnFn(name, [...args, prompt], subscriptionReplEnv());
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
        // born-547 — a failed-turn `result` event (is_error: true) is checked
        // BEFORE the assistant-delta path so it is surfaced instead of silently
        // dropped; extractClaudeStreamDelta itself is untouched.
        const errorText = extractClaudeStreamErrorText(line);
        if (errorText !== undefined) {
          const notice = `\n[claude stream-json error] ${errorText}\n`;
          collected += notice;
          yield { text: notice };
          continue;
        }
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
      const trailingErrorText = extractClaudeStreamErrorText(buffer);
      if (trailingErrorText !== undefined) {
        const notice = `\n[claude stream-json error] ${trailingErrorText}\n`;
        collected += notice;
        yield { text: notice };
      } else {
        const delta = extractClaudeStreamDelta(buffer);
        if (delta === undefined) {
          collected += buffer;
          yield { text: buffer };
        } else if (delta !== null && delta.length > 0) {
          collected += delta;
          yield { text: delta };
        }
      }
      buffer = '';
    }
    await wait;
    yield { done: { text: collected, stopReason: 'end_turn' } };
  };
}

/**
 * `--model`-override `.send()` — kept local (see the behavior-diff matrix on
 * {@link buildReplProvider}): `resolveChatAdapter`'s (SSOT) arg table has no
 * `--model` parameter, so a caller-selected model (Ink REPL's provider
 * switcher) cannot be expressed through the SSOT.
 */
function buildModelOverrideSend(
  name: 'claude' | 'codex' | 'gemini',
  spawnFn: SubscriptionSpawnFn,
  model: string,
): (messages: ChatMessage[]) => Promise<ProviderResponse> {
  const extraArgs = [...extraArgsForProvider(name), '--model', model];
  return async (messages: ChatMessage[]) => {
    const prompt = buildSubscriptionPrompt(messages);
    const { chunks, wait } = spawnFn(name, [...extraArgs, prompt], subscriptionReplEnv());
    let text = '';
    for await (const chunk of chunks) text += chunk;
    await wait;
    return { text, stopReason: 'end_turn' };
  };
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
 *
 * Sprint 357 T-357-011 (PROVIDER-SSOT, ADR-083, G-034 #1) — behavior-diff
 * matrix vs. {@link resolveChatAdapter} (chat-provider-parity.ts), the
 * project's SSOT chat-adapter resolver. Modifying chat-provider-parity.ts is
 * out of this task's write scope, so any row whose "SSOT gap" column is
 * non-empty keeps a local implementation — these are INTENTIONAL, tracked
 * differences, not drift:
 *
 *   | branch                                        | SSOT gap                                                                                   | resolution |
 *   |------------------------------------------------|---------------------------------------------------------------------------------------------|------------|
 *   | claude, no spawnFn/persistentSpawnFn (REPL boot) | no persistent-session concept                                                              | local (Sprint 223 T-223-001, unchanged) |
 *   | claude/codex/gemini, `opts.model` set (Ink model-switcher) | arg table has no `--model` param                                                  | local ({@link buildModelOverrideSend}) |
 *   | claude/codex/gemini `.stream()`                | `.stream()` is raw passthrough w/ ONE fixed arg table — no `--output-format stream-json`, no NDJSON parsing | local ({@link buildCliStream}, shared by every branch below) |
 *   | claude/codex/gemini `.send()`, no `opts.model` | none — arg table (`extraArgsForProvider` ≡ SSOT's internal `cliExtraArgs`), env-stripping, and prompt-building are identical | **delegates to `resolveChatAdapter()`** |
 *   | ollama `.send()`                               | none for the HTTP mechanics; only the Turkish "erişilemedi / ollama serve" hint on network failure is REPL-only UX | **delegates to `resolveChatAdapter()`** (see {@link buildOllamaReplAdapter}) |
 *   | deepseek / qwen / glm                          | SSOT only knows the single generic `'openai-compatible'` provider (one configurable HTTP target via env), not named vendor presets (that logic lives in `providers/openai-compatible.ts`, a separate module) | local |
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

  const spawnFn: SubscriptionSpawnFn = opts.spawnFn ?? defaultSubscriptionSpawn;

  // Per-turn CLI-spawn path (claude non-persistent / codex / gemini). See
  // the behavior-diff matrix above: send() delegates to the SSOT whenever
  // there's no `--model` override; stream() always stays local.
  if (!opts.model) {
    const ssot = resolveChatAdapter(name, { spawnFn });
    return {
      send: (messages) => ssot.send(messages),
      stream: buildCliStream(name, spawnFn),
    };
  }

  return {
    send: buildModelOverrideSend(name, spawnFn, opts.model),
    stream: buildCliStream(name, spawnFn),
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
  // TERM-1 (Sprint 351) — "hazır mıyım?" health snapshot, printed before EITHER
  // REPL mode mounts (Ink or legacy) so both paths get the same at-a-glance
  // line. buildHealthSnapshot() is already field-level fail-soft and time-
  // boxed internally; this try/catch is only a backstop so the snapshot can
  // never block or crash REPL boot.
  const healthRoot = process.cwd();
  try {
    const snapshot = await buildHealthSnapshot(healthRoot);
    process.stdout.write(`${renderHealthSnapshot(snapshot, getLangFromConfig(healthRoot))}\n`);
  } catch {
    // best-effort UX chrome only
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
  // Sprint 224 — the Ink REPL is the DEFAULT for an interactive TTY (enterprise-
  // grade native: markdown/tables/code, interactive /menu, model·provider switch,
  // token footer, agentic diff, paste-as-one, …). The earlier WSL-terminal drift/
  // blank + raw-mode loss are fixed (alt-screen default-on + raw-mode re-assert
  // after subprocess) and verified live by Alperen across all features. Opt out
  // with DECKENT_INK=0 (legacy readline). Pipe/non-TTY keeps the simple path.
  const inkMode = isTtyEarly && process.env['DECKENT_INK'] !== '0';
  if (inkMode) {
    const { runInkRepl } = await import('./repl/run.js');
    await runInkRepl(provider, providerName, (sel) =>
      buildReplProvider(sel.provider as ReplProviderName, sel.model ? { model: sel.model } : {}),
      registerReplTeardown);
    return;
  }

  process.stdout.write(renderBanner({ provider: providerName, dir: process.cwd() }));

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

  // (Legacy readline path — reached only via DECKENT_INK=0. The experimental
  // scroll-region TUI path was retired in favour of the Ink default.)

  // T-224-017 — `/` command menu: a slash completer gives claude-code-style
  // Tab-completion/listing of slash commands on a TTY.
  const baseReadlineOpts = replReadlineOptions(isTty);
  const rl = createInterface(isTty ? { ...baseReadlineOpts, completer: slashCompleter } : baseReadlineOpts);
  const region = createPromptRegion(rl, process.stdout, { isTty });

  // born-549 (SIGTERM-TEARDOWN) — this legacy readline REPL's own warm-child
  // (the persistent claude session built by buildReplProvider above) was only
  // ever torn down on the normal `/exit` path below; a SIGINT/SIGTERM left it
  // running as an orphan. Registered once, reused by both the signal path
  // (via registerReplTeardown → onSignal) and the normal-exit path at the
  // bottom of this function — idempotent so whichever fires first "wins".
  let legacyTornDown = false;
  const legacyTeardown = async (): Promise<void> => {
    if (legacyTornDown) return;
    legacyTornDown = true;
    try { rl.close(); } catch { /* already closed */ }
    const maybeSession = provider as Partial<PersistentClaudeSession>;
    if (typeof maybeSession.exit === 'function') {
      try { await maybeSession.exit(); } catch { /* best-effort */ }
    }
  };
  const unregisterLegacyTeardown = registerReplTeardown(legacyTeardown);

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
  // born-550 (SEC, 383-002): off-TTY (pipe/non-interactive) no longer
  // blanket-auto-approves — that silently ran writes/edits/bash with nobody
  // watching the prompt. Off-TTY now requires the explicit --auto-approve/
  // --yes opt-in (shouldAutoApproveOffTty); without it, side-effecting calls
  // are denied (`[deckent-denied]`), matching a declined interactive prompt.
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
  const offTtyAutoApprove = shouldAutoApproveOffTty(process.argv.slice(2));
  const execDispatcher = createToolExecDispatcher({
    cwd: process.cwd(),
    // REPL-575 K5 — localized confirm-prompt summaries (i18n-FIRST).
    labels: buildToolExecLabels(getLangFromConfig(process.cwd())),
    confirm: isTty ? askConfirm : async () => offTtyAutoApprove,
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

  // Sprint 223 T-223-001 — persistent claude session cleanup. The `:exit`
  // slash drops out of runChatNativeLoop, so we kill the warm claude child
  // here. Duck-typed: only PersistentClaudeSession exposes `exit`, so the
  // codex/gemini/ollama/openai-compat branches are unaffected. born-549 —
  // shared with the SIGINT/SIGTERM path via legacyTeardown (registered above).
  unregisterLegacyTeardown();
  await legacyTeardown();
}

// ─── Node Version Guard ─────────────────────────────────────────────────────
const [major] = process.versions.node.split('.').map(Number);
if ((major ?? 0) < 24) {
  process.stderr.write(
    `deckent requires Node.js >= 24 (Active LTS). Current version: ${process.versions.node}\n`,
  );
  process.exit(1);
}

// ─── EPIPE/EOF Graceful Exit (born-501, CLI-EPIPE-GRACEFUL; 410-002 cross-platform) ─
// A piped invocation (`deckent status | head`) closes its read end once the
// downstream consumer is done — the next stdout/stderr write then fails.
// Neither stream had an 'error' listener anywhere, so Node's EventEmitter
// default (throw when no listener) turned that into an uncaughtException,
// caught by installFatalHandlers (helpers/error-handler.ts, wired from
// buildProgram()) — which prints a FATAL line AND persists a crash-log under
// .deckent/crashes/. A closed downstream pipe is routine shell plumbing, not
// a real crash (this accounted for ~80% of crash-logs) — exit silently and
// cleanly instead.
//
// 410-002 (Law #2 — every environment): POSIX (linux/darwin) reports this
// condition as 'EPIPE'. Windows has no EPIPE errno for a closed named pipe —
// libuv's Windows backend surfaces the same "downstream reader is gone"
// write failure as 'EOF' instead. Both codes are handled identically here so
// the graceful exit is not a POSIX-only fix that silently no-ops on win32
// (same pattern as {@link shutdownSignalsForPlatform}'s honest platform
// branch below).
//
// Any other stream error (disk full, EIO, …) is re-thrown unchanged: a
// synchronous throw inside an EventEmitter listener propagates out of emit()
// (Node does not swallow listener exceptions), so it still surfaces as an
// uncaughtException and hits the existing crash-log path unchanged.
function handleStdStreamError(error: NodeJS.ErrnoException): void {
  if (error.code === 'EPIPE' || error.code === 'EOF') {
    process.exit(0);
    return;
  }
  throw error;
}
process.stdout.on('error', handleStdStreamError);
process.stderr.on('error', handleStdStreamError);

// ─── Exit-Code Contract Lock (born-665 / WIN665, Task 417-001) ─────────────
//
// A command's own action handler decides `process.exitCode` as its LAST step
// before its returned promise settles — e.g. `deckent init`'s three-state
// outcome contract (init-wizard.ts's `initOutcomeExitCode`: READY=0,
// SETUP_INCOMPLETE=2, FAILED=1). Observed on windows-latest CI (born-665):
// `deckent init --yes` printed the correct 'Setup outcome: SETUP_INCOMPLETE'
// block (contract says exit 2) yet the packed-install process exited 1. This
// handler used to call `handleCliError` UNCONDITIONALLY for every
// `unhandledRejection`, including one firing from an ALREADY-FINISHED init
// step (a fire-and-forget probe/write started earlier in the flow) well
// AFTER the outcome decision had already set `process.exitCode = 2`.
// `handleCliError` then silently overwrote it to 1 — and error-handler.ts's
// `formatFatalAndExit` (a SECOND `unhandledRejection` listener, installed by
// `buildProgram()` → `installFatalHandlers()` later in this file) would
// hard-`process.exit(1)` right after, with neither listener aware a contract
// decision had already been made.
//
// The lock activates only once the top-level command dispatch (parseAsync /
// launchDefaultRepl, below) has SETTLED — a rejection occurring DURING a
// command's own execution keeps the pre-existing `handleCliError(reason)`
// behavior completely unchanged (no regression). Once settled, any further
// rejection is surfaced as an honest warning (never swallowed) and
// `process.exitCode` is restored to the already-decided value; calling
// `process.exit()` ourselves — as the FIRST registered `unhandledRejection`
// listener — pre-empts `formatFatalAndExit`'s own `process.exit()` call:
// Node invokes same-event listeners in registration order, and a listener
// that calls `process.exit()` stops the remaining listeners from running
// (verified empirically against a throwaway repro script, not assumed).
let exitCodeContractLocked = false;
let lockedExitCode: number | undefined;

/** `process.exitCode`'s declared type is `string | number | null | undefined` — normalize to our number|undefined lock state. */
function normalizeExitCode(value: string | number | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  return typeof value === 'number' ? value : Number(value);
}

/** Call once the top-level command dispatch has settled. Idempotent. */
export function lockExitCodeContract(): void {
  if (exitCodeContractLocked) return;
  exitCodeContractLocked = true;
  lockedExitCode = normalizeExitCode(process.exitCode);
}

/** Test-only reset so a suite can re-arm the lock without re-importing the module. */
export function __resetExitCodeContractLockForTest(): void {
  exitCodeContractLocked = false;
  lockedExitCode = undefined;
}

/**
 * Guarded `unhandledRejection` handler — registered before `buildProgram()`
 * runs (below) so it always fires first. Unlocked: unchanged pre-existing
 * `handleCliError` behavior. Locked: honest stderr warning + exit-code
 * contract preserved, never silently crushed to 1.
 */
export function guardUnhandledRejection(reason: unknown): void {
  if (!exitCodeContractLocked) {
    handleCliError(reason);
    return;
  }
  const detail = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
  process.stderr.write(
    `\n[deckent] warning: a non-fatal async rejection occurred after the command finished — `
    + `exit code contract preserved at ${String(lockedExitCode ?? 0)}.\n${detail}\n`,
  );
  process.exitCode = lockedExitCode;
  process.exit(lockedExitCode === undefined ? 0 : lockedExitCode);
}

process.on('unhandledRejection', guardUnhandledRejection);

// ─── Shutdown-Hook Registry (born-549 SIGTERM-TEARDOWN → born-496 generalized) ─
//
// A running REPL (entry.ts's own legacy readline path, or the Ink REPL in
// repl/run.tsx) owns a warm-child persistent-session process, an optional MCP
// client broker, and terminal state (alt-screen / raw mode) — none of which
// the ADR-G-013 signal handler below knows about (it only ever interrupted
// sprints/tmux, the Brain-orchestrator concern). Whichever surface is
// currently active registers its own async cleanup so `onSignal` can await it
// before falling through to the unchanged sprint/tmux + exit path. A process
// that registers no hook takes the exact synchronous fast-path it always has:
// same call order, same exit code, zero behavior change.
//
// born-496 B1: the registry now lives in helpers/shutdown-hooks.ts (cycle-free
// for command modules) because it is NOT REPL-specific — every long-running
// command's own `process.on(SIGINT/SIGTERM)` listener is unreachable dead code
// (this module's handler registers first and exits synchronously; see the
// helper's module doc + born-587 for the remaining migrations). Commands must
// register there instead. `registerReplTeardown` stays as the REPL-facing
// alias so existing call sites and sigterm-teardown.test.ts stay untouched.
export const registerReplTeardown = registerShutdownHook;

// ─── Graceful Shutdown ───────────────────────────────────────────────────────
// ADR-G-013 (SIGTERM-CLEANUP): SIGINT and SIGTERM share the identical cleanup
// path — a `kill <pid>` / systemd stop / docker stop of the coordinator must
// leave the same clean state (INTERRUPTED tasks, released locks, killed tmux
// sessions) as Ctrl+C, not an orphaned sprint.
//
// born-549 (SIGTERM-TEARDOWN): `onSignal` is declared `async` so it can AWAIT
// any registered REPL teardown (above) before the existing sprint/tmux
// cleanup + exit — but it only does so when a REPL actually registered a
// hook. An async function with no `await` on its executed path runs fully
// synchronously to completion (the returned Promise is just a wrapper around
// already-finished work), so the no-REPL / no-hooks case is BYTE-IDENTICAL to
// the previous synchronous implementation: same order, same exit(0), same
// tick — existing callers that never await `onSignal`'s return value (this
// file's own `process.on` registration below, and the pre-existing
// tests/cli/sigterm-cleanup.test.ts) keep working unchanged.
export async function onSignal(signal: string): Promise<void> {
  process.stderr.write(`\nReceived ${signal}, exiting…\n`);
  if (hasShutdownHooks()) {
    await runShutdownHooks();
  }
  // Interrupt active sprint: mark tasks INTERRUPTED, heartbeats ABORTED, release locks
  try { interruptActiveSprint(); } catch { /* non-fatal */ }
  // Kill tmux sessions used by workers
  try { killAllSessions(); } catch { /* non-fatal */ }
  process.exit(0);
}

/**
 * born-549 (SIGTERM-TEARDOWN, Law #2 — every environment) — cross-platform
 * shutdown-signal decision. POSIX (linux/darwin/…) delivers real SIGINT and
 * SIGTERM. Windows has no native SIGTERM: Node's own signal emulation there
 * only recognizes SIGINT (Ctrl+C) and SIGBREAK (Ctrl+Break) as real,
 * interceptable console events — a `process.on('SIGTERM', …)` listener on
 * win32 is never invoked by an actual OS event. Registering it there anyway
 * would be a silent no-op masquerading as cross-platform support, so the
 * Windows branch swaps SIGTERM for SIGBREAK instead of layering it on top —
 * an honest platform adapter (unsupported → not registered, not fake-handled)
 * rather than a faked one. Neither branch spawns or blocks a subprocess to
 * make this work (no `spawnSync`) — both are plain, async-safe event
 * listeners over the same `onSignal`.
 *
 * Exported as a pure function (same "pull the platform branch out so it's
 * testable without a real OS" pattern as providers/codex.ts's injectable
 * `platform` param) so the Windows-vs-POSIX choice is unit-testable without
 * mocking the live process's `process.platform` or re-registering real
 * signal listeners on the test runner itself.
 */
export function shutdownSignalsForPlatform(platform: NodeJS.Platform): readonly NodeJS.Signals[] {
  return platform === 'win32' ? ['SIGINT', 'SIGBREAK'] : ['SIGINT', 'SIGTERM'];
}

for (const sig of shutdownSignalsForPlatform(process.platform)) {
  process.on(sig, () => { void onSignal(sig); });
}

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
    launchDefaultRepl()
      .catch((err: unknown) => {
        handleCliError(err);
      })
      .finally(() => {
        // WIN665 / 417-001 — dispatch has settled; arm the exit-code contract lock.
        lockExitCodeContract();
      });
  } else {
    buildProgram()
      .hook('preAction', async () => {
        // SEC-04 (task 418-003): lazy catalog-bootstrap — only commands whose
        // execution path actually needs model-catalog data trigger this (see
        // command-registry.ts `catalogDependent`). Read-only commands like
        // `status`/`doctor`/`history`/`config` skip this entirely: no cache
        // read, no network, no bootstrap call at all.
        if (!shouldBootstrapCatalogFor(process.argv)) return;
        const lang = getLangFromConfig(process.cwd());
        await bootstrapFromCatalog({
          offline: process.env['DECKENT_OFFLINE'] === '1',
          onFetchAttempt: () => {
            process.stderr.write(`${getMessage('catalog.network_fetch_notice', lang)}\n`);
          },
        });
      })
      .parseAsync(process.argv)
      .catch((err: unknown) => {
        handleCliError(err);
      })
      .finally(() => {
        // WIN665 / 417-001 — dispatch has settled; arm the exit-code contract lock.
        lockExitCodeContract();
      });
  }
}
