#!/usr/bin/env node

import { createInterface } from 'node:readline';
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
  type McpToolDispatcher,
  type ProviderResponse,
  type SubscriptionSpawnFn,
} from './commands/chat-native.js';

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
 */
function buildOllamaReplAdapter(opts?: { fetchFn?: typeof fetch }): ChatProviderAdapter {
  const host = (process.env['DECKENT_OLLAMA_HOST'] ?? 'http://localhost:11434').replace(/\/$/, '');
  const model = process.env['DECKENT_OLLAMA_MODEL'] ?? 'llama3';
  const fetchImpl = opts?.fetchFn ?? fetch;
  return {
    async send(messages: ChatMessage[]): Promise<ProviderResponse> {
      const prompt = buildSubscriptionPrompt(messages);
      const res = await fetchImpl(`${host}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, stream: false }),
      });
      if (!res.ok) {
        throw new Error(`Ollama request failed: ${res.status} ${res.statusText}`);
      }
      const data = (await res.json()) as { response?: string };
      return { text: data.response ?? '', stopReason: 'end_turn' };
    },
  };
}

/** Inputs for {@link buildReplProvider} — tests inject `spawnFn`/`fetchFn` to keep hermetic. */
export interface BuildReplProviderOptions {
  /** Custom spawn — injected by tests to avoid touching real binaries. */
  spawnFn?: SubscriptionSpawnFn;
  /** Custom fetch — injected by tests so the Ollama branch never hits the network. */
  fetchFn?: typeof fetch;
}

/**
 * Build a real {@link ChatProviderAdapter} for the native REPL.
 *
 * - `'ollama'`               → HTTP fetch adapter (zero external API).
 * - `'claude' | 'codex' | 'gemini'` → spawn the host CLI in print/one-shot
 *   mode. The shape mirrors createSubscriptionChatAdapter (chat-native.ts)
 *   without the global registry lookup so the REPL boot does not require a
 *   full provider bootstrap.
 * - anything else            → throws a clear `Unknown REPL provider …` error.
 */
export function buildReplProvider(
  name: ChatProviderName,
  opts: BuildReplProviderOptions = {},
): ChatProviderAdapter {
  if (name === 'ollama') {
    return buildOllamaReplAdapter(opts.fetchFn ? { fetchFn: opts.fetchFn } : {});
  }
  if (name !== 'claude' && name !== 'codex' && name !== 'gemini') {
    throw new Error(
      `Unknown REPL provider: "${String(name)}". Valid: claude, codex, gemini, ollama.`,
    );
  }
  const binary = name;
  const extraArgs = extraArgsForProvider(name);
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
      const { chunks, wait } = spawnFn(binary, [...extraArgs, prompt], subscriptionReplEnv());
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

/** Resolve the REPL provider from disk config; falls back to 'claude' when load fails. */
async function resolveReplProviderForCwd(): Promise<ChatProviderName> {
  try {
    const cfg = await loadConfig();
    return resolveChatProvider(cfg);
  } catch {
    return 'claude';
  }
}

/** No-op MCP dispatcher used until the REPL grows agentic tool-use (220-003). */
const NOOP_MCP_DISPATCHER: McpToolDispatcher = {
  async dispatch(name) {
    return `[chat-native] tool "${name}" not yet wired`;
  },
};

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
  process.stdout.write(`deckent (${providerName}) — type :exit to quit\n`);

  async function* readStdin(): AsyncGenerator<string> {
    const rl = createInterface({ input: process.stdin });
    try {
      for await (const line of rl) yield line;
    } finally {
      rl.close();
    }
  }

  await runChatNativeLoop({
    provider,
    dispatcher: NOOP_MCP_DISPATCHER,
    input: readStdin(),
    output: (line) => process.stdout.write(line.endsWith('\n') ? line : line + '\n'),
    gracefulErrors: true,
  });
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
    return fileURLToPath(import.meta.url) === argv1;
  } catch {
    return false;
  }
}

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
