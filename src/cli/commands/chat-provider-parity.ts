import {
  buildSubscriptionPrompt,
  defaultSubscriptionSpawn,
  type ChatProviderAdapter,
  type ChatMessage,
  type ProviderResponse,
  type SubscriptionSpawnFn,
} from './chat-native.js';
import { ALL_PROVIDER_NAMES } from '../../core/types.js';
import { ErrorRegistry } from '../../core/errors.js';

// ─── Provider Parity — unified adapter resolver ─────────────────────────────
//
// Single entry point mapping all 5 supported chat providers to a
// ChatProviderAdapter with the same send(messages)→ProviderResponse contract.
// All HTTP providers use Node 24+ built-in fetch (ADR-010: no new runtime dep).
// All CLI providers use the subscription spawn shim — tests inject fakes.

/** All providers with first-class REPL support. */
export type ParityProviderName =
  | 'claude'
  | 'codex'
  | 'cursor'
  | 'gemini'
  | 'ollama'
  | 'openai-compatible';

/** Injection options — tests supply fakes to stay hermetic. */
export interface ResolveChatAdapterOptions {
  /** Custom spawn function — injected to avoid real CLI invocations in tests. */
  spawnFn?: SubscriptionSpawnFn;
  /** Custom fetch — injected to avoid real HTTP calls in tests. */
  fetchFn?: typeof fetch;
  /** Ollama HTTP base URL. Env var DECKENT_OLLAMA_HOST takes precedence. */
  ollamaHost?: string;
  /** Ollama model name. Env var DECKENT_OLLAMA_MODEL takes precedence. */
  ollamaModel?: string;
  /** OpenAI-compatible base URL (no trailing slash). Env var DECKENT_OPENAI_COMPAT_BASE_URL takes precedence. */
  openaiCompatBaseUrl?: string;
  /** Model name for openai-compatible endpoint. Env var DECKENT_OPENAI_COMPAT_MODEL takes precedence. */
  openaiCompatModel?: string;
  /**
   * HTTP request timeout (ms) for the Ollama / openai-compatible adapters —
   * guards against an unresponsive local server hanging the REPL turn
   * indefinitely. Env var DECKENT_CHAT_HTTP_TIMEOUT_MS takes precedence.
   * Default 60_000 (60s) — a chat-completion budget, not a liveness-probe
   * budget (cf. the 3s PROBE_TIMEOUT_MS in src/providers/ollama.ts).
   */
  httpTimeoutMs?: number;
}

// ─── CLI-spawn adapter (claude / codex / gemini) ─────────────────────────

function cliExtraArgs(name: 'claude' | 'codex' | 'cursor' | 'gemini'): readonly string[] {
  switch (name) {
    case 'codex':  return ['exec', '--full-auto'];
    case 'cursor': return ['--mode', 'ask', '-p', '--trust', '--output-format', 'json'];
    case 'gemini': return ['-p'];
    case 'claude': return ['--print'];
  }
}

function subscriptionEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env['ANTHROPIC_API_KEY'];
  delete env['DECKENT_CLAUDE_API_KEY'];
  // Gemini CLI treats any of these as API-key auth, outranking its own OAuth
  // session file (~/.gemini/oauth_creds.json — see provider-auth-probe.ts's
  // probeGemini). Stripping them keeps the gemini branch on subscription/OAuth
  // auth, matching the claude branch's ANTHROPIC_API_KEY stripping above.
  delete env['GEMINI_API_KEY'];
  delete env['GOOGLE_API_KEY'];
  delete env['DECKENT_GOOGLE_API_KEY'];
  // Codex CLI treats either of these as API-key auth, outranking its own
  // subscription/OAuth session (see provider-auth-probe.ts's probeCodex,
  // which honors OPENAI_API_KEY / DECKENT_OPENAI_API_KEY in that exact
  // order). Stripped unconditionally alongside the gemini keys above —
  // harmless for the claude/gemini branches, required for codex.
  delete env['OPENAI_API_KEY'];
  delete env['DECKENT_OPENAI_API_KEY'];
  return env;
}

/**
 * A non-zero subprocess exit (expired auth, rate limit, crash) previously
 * surfaced as a silent empty-success turn — `wait`'s `{ exitCode }` was
 * resolved but never inspected. `SubscriptionSpawnFn` exposes no stderr
 * channel, so any already-collected stdout text is the best available
 * failure signal here.
 */
function subscriptionExitError(binary: string, exitCode: number, collectedText: string): string {
  const suffix = collectedText.length > 0 ? `: ${collectedText}` : ' (no output)';
  return `${binary} subscription call exited with code ${exitCode}${suffix}`;
}

function buildCliSpawnAdapter(
  name: 'claude' | 'codex' | 'cursor' | 'gemini',
  spawnFn: SubscriptionSpawnFn,
): ChatProviderAdapter {
  const binary = name;
  const extraArgs = cliExtraArgs(name);
  return {
    async send(messages: ChatMessage[]): Promise<ProviderResponse> {
      const prompt = buildSubscriptionPrompt(messages);
      const { chunks, wait } = spawnFn(binary, [...extraArgs, prompt], subscriptionEnv());
      let text = '';
      for await (const chunk of chunks) text += chunk;
      const { exitCode } = await wait;
      if (exitCode !== null && exitCode !== 0) {
        throw ErrorRegistry.createError('DECKENT_E096', { message: subscriptionExitError(binary, exitCode, text) });
      }
      return { text, stopReason: 'end_turn' };
    },
    async *stream(messages: ChatMessage[]) {
      const prompt = buildSubscriptionPrompt(messages);
      const { chunks, wait } = spawnFn(binary, [...extraArgs, prompt], subscriptionEnv());
      let collected = '';
      for await (const chunk of chunks) {
        if (chunk.length === 0) continue;
        collected += chunk;
        yield { text: chunk };
      }
      const { exitCode } = await wait;
      if (exitCode !== null && exitCode !== 0) {
        throw ErrorRegistry.createError('DECKENT_E096', { message: subscriptionExitError(binary, exitCode, collected) });
      }
      yield { done: { text: collected, stopReason: 'end_turn' } };
    },
  };
}

// ─── HTTP timeout helper (Ollama / openai-compatible) ────────────────

const DEFAULT_HTTP_TIMEOUT_MS = 60_000;

function resolveHttpTimeoutMs(opts: ResolveChatAdapterOptions): number {
  const envVal = process.env['DECKENT_CHAT_HTTP_TIMEOUT_MS'];
  if (envVal !== undefined) {
    const parsed = Number(envVal);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return opts.httpTimeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS;
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

/**
 * fetch wrapper with a bounded timeout — mirrors the established
 * AbortController + setTimeout pattern used elsewhere in the codebase
 * (src/providers/ollama.ts's fetchWithTimeout, src/core/notify-adapters/
 * webhook-adapter.ts's fetchHttpClient). Without this, an unresponsive
 * local Ollama/openai-compat server hangs the REPL turn forever.
 */
async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (isAbortError(err)) {
      throw ErrorRegistry.createError('DECKENT_E096', { message: `Request timed out after ${timeoutMs}ms: ${url}` });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Ollama HTTP adapter ──────────────────────────────────────────────

function buildOllamaAdapter(opts: ResolveChatAdapterOptions): ChatProviderAdapter {
  const host = (
    process.env['DECKENT_OLLAMA_HOST'] ??
    opts.ollamaHost ??
    'http://localhost:11434'
  ).replace(/\/$/, '');
  const model = process.env['DECKENT_OLLAMA_MODEL'] ?? opts.ollamaModel ?? 'llama3';
  const fetchImpl = opts.fetchFn ?? fetch;
  const timeoutMs = resolveHttpTimeoutMs(opts);

  return {
    async send(messages: ChatMessage[]): Promise<ProviderResponse> {
      const prompt = buildSubscriptionPrompt(messages);
      const res = await fetchWithTimeout(fetchImpl, `${host}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, stream: false }),
      }, timeoutMs);
      if (!res.ok) {
        throw ErrorRegistry.createError('DECKENT_E096', { message: `Ollama request failed: ${res.status} ${res.statusText} (${host})` });
      }
      const data = (await res.json()) as { response?: string };
      return { text: data.response ?? '', stopReason: 'end_turn' };
    },
  };
}

// ─── OpenAI-compatible HTTP adapter ──────────────────────────────────

function buildOpenAiCompatAdapter(opts: ResolveChatAdapterOptions): ChatProviderAdapter {
  const baseUrl = (
    process.env['DECKENT_OPENAI_COMPAT_BASE_URL'] ??
    opts.openaiCompatBaseUrl ??
    'http://localhost:8080'
  ).replace(/\/$/, '');
  const model = process.env['DECKENT_OPENAI_COMPAT_MODEL'] ?? opts.openaiCompatModel ?? 'default';
  const fetchImpl = opts.fetchFn ?? fetch;
  const timeoutMs = resolveHttpTimeoutMs(opts);

  return {
    async send(messages: ChatMessage[]): Promise<ProviderResponse> {
      const prompt = buildSubscriptionPrompt(messages);
      const body = {
        model,
        messages: [{ role: 'user', content: prompt }],
      };
      const res = await fetchWithTimeout(fetchImpl, `${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, timeoutMs);
      if (!res.ok) {
        throw ErrorRegistry.createError('DECKENT_E096', { message: `OpenAI-compat request failed: ${res.status} ${res.statusText} (${baseUrl})` });
      }
      type CompletionResp = { choices?: Array<{ message?: { content?: string } }> };
      const data = (await res.json()) as CompletionResp;
      const text = data.choices?.[0]?.message?.content ?? '';
      return { text, stopReason: 'end_turn' };
    },
  };
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Resolve a `ChatProviderAdapter` for the given provider name.
 *
 * Supported: `'claude'` | `'codex'` | `'gemini'` | `'ollama'` | `'openai-compatible'`
 *
 * All providers fulfill the same contract:
 *   `send(messages: ChatMessage[]): Promise<ProviderResponse>`
 *
 * Tests inject `opts.spawnFn` / `opts.fetchFn` to remain hermetic.
 * Unknown providers throw a descriptive error — never silently fall back.
 */
export function resolveChatAdapter(
  provider: string,
  opts: ResolveChatAdapterOptions = {},
): ChatProviderAdapter {
  const spawnFn = opts.spawnFn ?? defaultSubscriptionSpawn;

  switch (provider) {
    case 'claude':
    case 'codex':
    case 'cursor':
    case 'gemini':
      return buildCliSpawnAdapter(provider, spawnFn);

    case 'ollama':
      return buildOllamaAdapter(opts);

    case 'openai-compatible':
      return buildOpenAiCompatAdapter(opts);

    default:
      throw ErrorRegistry.createError('DECKENT_E096', {
        message: `Unknown REPL provider: "${String(provider)}". ` +
          `Valid providers: ${[...ALL_PROVIDER_NAMES, 'openai-compatible'].join(', ')}.`,
      });
  }
}
