// ─── OpenRouterProvider ─────────────────────────────────────────────────────
// OpenRouter (https://openrouter.ai) — an OpenAI-compatible `/chat/completions`
// gateway that routes to a large, dynamic catalog of third-party models
// (Anthropic, OpenAI, Google, Meta, DeepSeek, ... — one API key, one wire
// contract). Sprint 360 Task 360-006: adapter CORE only — resolves its own
// secret via `.deck` (never touches `process.env`), sends a single chat
// round-trip with timeout + single-retry + honest errors, and maps the
// response's `usage` block into the canonical `TokenUsage` shape.
//
// DISK-VERIFIED against the two closest existing patterns:
//   - `providers/ollama.ts` — the nearest full HTTP `ProviderAdapter`: own
//     `workers` Map, `fetchWithTimeout` (AbortController), `isAvailable`/
//     `diagnoseAvailability` that never throw, `constructor(projectDir, opts?)`.
//   - `providers/openai-compatible.ts` — the actual OpenAI `/chat/completions`
//     wire contract (`ChatMessage`/`ChatCompletionOptions`/`ChatCompletionResult`
//     re-used here via import, not re-declared) + `spawn()` reuses the
//     provider-agnostic `agents/http-agentic-worker.js` agentic loop.
//
// Registration (provider-registry / bootstrapProviders) is explicitly OUT of
// scope for this task — see the wire-point note at the bottom of this file.
// This module is inert until a caller imports + registers it.

import {
  spawn as nodeSpawn,
  type ChildProcess,
  type SpawnOptions as NodeSpawnOptions,
} from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, openSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ModelType } from '../core/types.js';
import type {
  ProviderAdapter,
  ProviderSpawnOptions,
  ProviderAvailabilityDetail,
} from '../core/provider.js';
import { ProviderError, buildCliInvocation } from '../core/provider.js';
import { TASKS_DIR } from '../core/constants.js';
import { loadDeckSecrets } from '../core/deck-file.js';
import { normalizeUsage, type TokenUsage } from '../core/token-usage.js';
import type {
  ChatMessage,
  ChatCompletionOptions,
  ChatCompletionResult,
  OpenAIToolCallWire,
} from './openai-compatible.js';

// ─── Constants ───────────────────────────────────────────────────────

/** Default OpenRouter `/chat/completions` gateway base URL (config-overridable). */
const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

/** Default per-request timeout before the single retry kicks in. */
const DEFAULT_TIMEOUT_MS = 30_000;

/** 1 initial attempt + 1 retry — "tek-retry" (single retry), never more. */
const MAX_ATTEMPTS = 2;

/**
 * Canonical env var name this provider's key is addressed by — both the
 * `.deck` lookup (bare `OPENROUTER_API_KEY` / prefixed `DECKENT_OPENROUTER_API_KEY`,
 * mirroring `deck-interpolation.ts`'s `$DECK:KEY` resolution) and the child
 * process env var `spawn()` injects for the agentic worker subprocess.
 */
const OPENROUTER_API_KEY_ENV = 'OPENROUTER_API_KEY';

/** The canonical `$DECK:` reference a user configures — surfaced in error messages only. */
const OPENROUTER_DECK_REF = `$DECK:${OPENROUTER_API_KEY_ENV}`;

/**
 * Representative, informational model list — OpenRouter's real catalog is large
 * and changes independently of this codebase, so `send()` does NOT gate on this
 * list (unlike `OpenAICompatibleAdapter`'s fixed-catalog presets). It exists only
 * to satisfy `ProviderAdapter.supportedModels` for diagnostics/doctor display and
 * as the default `models` config value. Callers may override via `opts.models`.
 */
const DEFAULT_MODELS: readonly string[] = [
  'anthropic/claude-3.7-sonnet',
  'anthropic/claude-3.5-sonnet',
  'openai/gpt-4o',
  'openai/o3-mini',
  'google/gemini-2.0-flash-001',
  'meta-llama/llama-3.1-70b-instruct',
  'deepseek/deepseek-chat',
];

/**
 * Default path to the compiled HTTP agentic worker entry (reused verbatim —
 * OpenRouter is wire-identical OpenAI `/chat/completions`). Resolved from this
 * module's own URL — production: `dist/providers/openrouter.js` →
 * `dist/agents/http-agentic-worker.js`. Tests inject a stub via `workerEntryPath`.
 */
const DEFAULT_WORKER_ENTRY_PATH = fileURLToPath(
  new URL('../agents/http-agentic-worker.js', import.meta.url),
);

// ─── Config ──────────────────────────────────────────────────────────

export interface OpenRouterConfig {
  /** Base URL override (config-override'lı). Default `https://openrouter.ai/api/v1`. */
  baseURL?: string;
  /** Optional fetch override for tests (defaults to global fetch). */
  fetchImpl?: typeof fetch;
  /** Per-request timeout in ms before the single retry. Default 30_000. */
  timeoutMs?: number;
  /** Informational supported-model list (NOT a `send()` gate). See {@link DEFAULT_MODELS}. */
  models?: readonly string[];
  /**
   * `.deck` secrets loader — the ONLY secret-resolution seam (no `apiKey`
   * bypass field), defaults to the real `loadDeckSecrets`. Tests inject a pure
   * stub so secret resolution never touches disk. `loadDeckSecrets` itself never
   * writes to `process.env` — neither does this adapter, anywhere.
   */
  loadSecretsImpl?: (projectRoot: string) => Record<string, string>;
  /** Project root used by `spawn()` for `.tasks/` heartbeat + log files. Defaults to `process.cwd()`. */
  projectDir?: string;
  /** Override the compiled agentic-worker entry path (tests stub it). */
  workerEntryPath?: string;
  /** Override `node:child_process.spawn` (tests capture launch args, no real process). */
  spawnImpl?: typeof nodeSpawn;
  /** Auto-kill timeout (ms) for a spawned worker; 0 = no timeout. */
  defaultTimeoutMs?: number;
  /**
   * Host platform — injectable so the win32 cmd.exe-wrapper spawn path
   * (born-580, DEP0190 + ADR-006 parity with subprocess.ts) is testable
   * without a real spawn. Defaults to `process.platform`.
   */
  platform?: NodeJS.Platform;
}

// ─── Worker Entry (spawn lifecycle — mirrors OllamaAdapter/OpenAICompatibleAdapter) ──

interface OpenRouterWorkerEntry {
  taskId: string;
  process: ChildProcess;
  logPath: string;
  spawnedAt: string;
  timeoutHandle?: ReturnType<typeof setTimeout>;
}

// ─── OpenRouterProvider ──────────────────────────────────────────────

export class OpenRouterProvider implements ProviderAdapter {
  readonly name = 'openrouter';
  readonly supportedModels: readonly ModelType[];

  private readonly projectRoot: string;
  private readonly baseURL: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly loadSecretsImpl: (projectRoot: string) => Record<string, string>;

  private readonly projectDir: string;
  private readonly workerEntryPath: string;
  private readonly spawnImpl: typeof nodeSpawn;
  private readonly defaultTimeoutMs: number;
  private readonly platform: NodeJS.Platform;
  private readonly workers = new Map<string, OpenRouterWorkerEntry>();

  constructor(projectRoot: string, opts: OpenRouterConfig = {}) {
    this.projectRoot = projectRoot;
    this.baseURL = (opts.baseURL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.fetchImpl = opts.fetchImpl ?? ((...args) => fetch(...args));
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.loadSecretsImpl = opts.loadSecretsImpl ?? loadDeckSecrets;
    this.supportedModels = (opts.models ?? DEFAULT_MODELS) as unknown as readonly ModelType[];

    this.projectDir = opts.projectDir ?? process.cwd();
    this.workerEntryPath = opts.workerEntryPath ?? DEFAULT_WORKER_ENTRY_PATH;
    this.spawnImpl = opts.spawnImpl ?? nodeSpawn;
    this.defaultTimeoutMs = opts.defaultTimeoutMs ?? 0;
    this.platform = opts.platform ?? process.platform;
  }

  // ─── send() — primary HTTP entry ────────────────────────────────────

  /**
   * POST `${baseURL}/chat/completions` with the OpenAI-compatible schema
   * OpenRouter speaks. Resolves the API key fresh via `.deck` on every call
   * (never cached, never written to `process.env`). Timeout via
   * `AbortController`; a single retry on a network/timeout error or a
   * transient 5xx (a 4xx is a client error — fails fast, no retry). Every
   * failure path throws a `ProviderError` carrying the real cause — no
   * silent-empty return.
   */
  async send(
    messages: ChatMessage[],
    model: string,
    opts?: ChatCompletionOptions,
  ): Promise<ChatCompletionResult> {
    if (typeof model !== 'string' || model.trim().length === 0) {
      throw new ProviderError('openrouter send() requires a non-empty model id', this.name);
    }

    const apiKey = this.resolveApiKey();

    const body: Record<string, unknown> = {
      model,
      messages,
      stream: false,
    };
    if (opts?.temperature !== undefined) body['temperature'] = opts.temperature;
    if (opts?.maxTokens !== undefined) body['max_tokens'] = opts.maxTokens;
    if (opts?.stop !== undefined) body['stop'] = opts.stop;
    if (opts?.tools !== undefined && opts.tools.length > 0) body['tools'] = opts.tools;

    const init: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    };

    const res = await this.requestWithRetry(`${this.baseURL}/chat/completions`, init);

    if (!res.ok) {
      const text = await safeText(res);
      throw new ProviderError(
        `openrouter /chat/completions returned ${res.status}${text ? `: ${text}` : ''}`,
        this.name,
      );
    }

    const json = (await res.json()) as OpenRouterChatCompletionResponse;
    const content = json?.choices?.[0]?.message?.content ?? '';
    const result: ChatCompletionResult = { content };

    const usage = parseOpenRouterUsage(json);
    if (usage) {
      result.usage = { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
    }
    if (typeof json?.model === 'string') {
      result.model = json.model;
    }
    const toolCalls = normalizeToolCalls(json?.choices?.[0]?.message?.tool_calls);
    if (toolCalls.length > 0) result.toolCalls = toolCalls;

    return result;
  }

  /**
   * Timeout + single-retry wrapper around one `fetch` call.
   * - 2xx → returned immediately.
   * - 5xx (transient) → retried once, then the LAST response is returned so
   *   the caller can throw with the real status/body (honest, not swallowed).
   * - 4xx (client error) → returned immediately, no retry (retrying a bad
   *   request/auth error cannot succeed).
   * - Network/timeout error → retried once, then a wrapped `ProviderError`
   *   is thrown (never a silent empty result).
   */
  private async requestWithRetry(url: string, init: RequestInit): Promise<Response> {
    let lastNetworkError: unknown;
    let lastResponse: Response | undefined;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await this.fetchWithTimeout(url, init, this.timeoutMs);
        lastResponse = res;
        if (res.ok) return res;
        if (res.status >= 500 && attempt < MAX_ATTEMPTS) continue; // transient — retry once
        return res; // 4xx, or 5xx retries exhausted — caller inspects + throws
      } catch (err) {
        lastNetworkError = err;
        lastResponse = undefined;
        if (attempt >= MAX_ATTEMPTS) break;
        // network/timeout error on a non-final attempt → retry once
      }
    }

    if (lastResponse) return lastResponse;
    const msg = lastNetworkError instanceof Error ? lastNetworkError.message : String(lastNetworkError);
    throw new ProviderError(
      `openrouter /chat/completions request failed after retry: ${msg}`,
      this.name,
    );
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  // ─── Secret resolution — deck-secrets ONLY, never process.env ──────

  /**
   * Resolve the OpenRouter API key via `$DECK:OPENROUTER_API_KEY` — mirrors
   * `deck-interpolation.ts`'s `$DECK:KEY` semantics: bare key first, then the
   * `DECKENT_`-prefixed convention every other built-in provider uses. Throws
   * `ProviderError` (honest, actionable) when absent. This value is returned
   * to the caller and used directly in the `Authorization` header — it is
   * NEVER assigned to `process.env` anywhere in this class.
   */
  private resolveApiKey(): string {
    const secrets = this.loadSecretsImpl(this.projectRoot);
    const key = secrets[OPENROUTER_API_KEY_ENV] ?? secrets[`DECKENT_${OPENROUTER_API_KEY_ENV}`];
    if (!key || key.length === 0) {
      throw new ProviderError(
        `OpenRouter API key not found — set ${OPENROUTER_DECK_REF} in your .deck file ` +
          `(DECKENT_${OPENROUTER_API_KEY_ENV}=... or ${OPENROUTER_API_KEY_ENV}=...)`,
        this.name,
      );
    }
    return key;
  }

  /** Non-throwing probe — used only by `isAvailable()`/`diagnoseAvailability()`. */
  private tryResolveApiKey(): string | undefined {
    try {
      return this.resolveApiKey();
    } catch {
      return undefined;
    }
  }

  // ─── isAvailable() ─────────────────────────────────────────────────

  /**
   * True when `$DECK:OPENROUTER_API_KEY` resolves. No network probe — 3rd-party
   * HTTP endpoints should not be ping'd on cold-path startup.
   */
  async isAvailable(): Promise<boolean> {
    return this.tryResolveApiKey() !== undefined;
  }

  // ─── diagnoseAvailability() ────────────────────────────────────────

  async diagnoseAvailability(): Promise<ProviderAvailabilityDetail> {
    const hasKey = this.tryResolveApiKey() !== undefined;
    return {
      name: this.name,
      binaryFound: true, // HTTP — no binary
      binaryPath: undefined,
      versionStatus: hasKey ? 'unknown' : 'missing',
      authMethod: 'api_key',
      authStatus: hasKey ? 'ok' : 'missing',
      available: hasKey,
      partial: false,
      models: [...this.supportedModels] as ModelType[],
      reason: hasKey
        ? 'openrouter HTTP adapter ready (key resolved via $DECK:OPENROUTER_API_KEY)'
        : `${OPENROUTER_DECK_REF} not set in .deck — openrouter unavailable`,
      hints: hasKey ? [] : [`Add DECKENT_${OPENROUTER_API_KEY_ENV}=<your-api-key> to .deck`],
    };
  }

  // ─── extractUsage() ────────────────────────────────────────────────

  /**
   * Map a `/chat/completions` response body's `usage` block into the
   * canonical, provider-agnostic {@link TokenUsage} shape ("TaskResult
   * tokenUsage shape") — a capture, not a re-count. `send()` never streams
   * (always `stream:false`), so this parses a single JSON object; malformed
   * or usage-less input returns `null` (honest — no fabricated numbers).
   */
  extractUsage(rawOutput: string): TokenUsage | null {
    if (typeof rawOutput !== 'string') return null;
    const trimmed = rawOutput.trim();
    if (trimmed.length === 0) return null;
    const parsed = tryParseJson(trimmed);
    if (parsed === undefined) return null;
    return parseOpenRouterUsage(parsed);
  }

  // ─── Spawn-mode (agentic HTTP worker — reuses http-agentic-worker.js) ──

  /**
   * Launch a real headless agentic sprint worker. Spawns the provider-agnostic
   * `http-agentic-worker` loop as a `node` subprocess (byte-for-byte the same
   * entry `OpenAICompatibleAdapter.spawn()` uses — OpenRouter is wire-identical
   * OpenAI `/chat/completions`). The API key is resolved HOST-SIDE via
   * `resolveApiKey()` and injected into the CHILD's own env only
   * (`spawnOpts.env`) — this process's `process.env` is never touched.
   */
  spawn(taskId: string, model: ModelType, _prompt: string, opts?: ProviderSpawnOptions): void {
    if (this.workers.has(taskId)) {
      throw new ProviderError(`Worker for task "${taskId}" is already running`, this.name);
    }

    const apiKey = this.resolveApiKey();

    const dir = opts?.projectDir ?? this.projectDir;
    const tasksDir = join(dir, TASKS_DIR);
    if (!existsSync(tasksDir)) mkdirSync(tasksDir, { recursive: true });

    const logPath = join(tasksDir, `task-${taskId}.log`);
    const logFd = openSync(logPath, 'a');

    // argv = [entry, taskId, model, baseURL, apiKeyEnv, providerName].
    // SPAWN-1 (born-580, DEP0190 + ADR-006 parity with subprocess.ts): route
    // through buildCliInvocation — `node` is a real binary on every platform so
    // POSIX/win32 both stay byte-identical today, but this keeps every provider
    // spawn on one cross-platform-safe invocation path (Law #2).
    const inv = buildCliInvocation(
      'node',
      [this.workerEntryPath, taskId, String(model), this.baseURL, OPENROUTER_API_KEY_ENV, this.name],
      this.platform,
    );

    const spawnOpts: NodeSpawnOptions = {
      cwd: dir,
      stdio: ['ignore', logFd, logFd],
      env: {
        ...process.env,
        ...(opts?.env ?? {}),
        [OPENROUTER_API_KEY_ENV]: apiKey,
      },
      shell: inv.shell,
    };

    const child = this.spawnImpl(inv.command, inv.args, spawnOpts);
    closeSync(logFd);

    this.writeHeartbeat(taskId, dir, 'EXECUTING');

    const entry: OpenRouterWorkerEntry = {
      taskId,
      process: child,
      logPath,
      spawnedAt: new Date().toISOString(),
    };

    const timeoutMs = opts?.taskTimeoutSeconds ? opts.taskTimeoutSeconds * 1000 : this.defaultTimeoutMs;
    if (timeoutMs > 0) {
      entry.timeoutHandle = setTimeout(() => {
        this.killWithSignal(taskId, 'SIGKILL');
      }, timeoutMs);
    }

    this.workers.set(taskId, entry);

    child.once('exit', () => {
      const w = this.workers.get(taskId);
      if (w?.timeoutHandle) clearTimeout(w.timeoutHandle);
      this.workers.delete(taskId);
    });
  }

  kill(taskId: string): void {
    this.killWithSignal(taskId, 'SIGTERM');
  }

  listWorkers(): string[] {
    return Array.from(this.workers.keys());
  }

  private killWithSignal(taskId: string, signal: NodeJS.Signals): void {
    const entry = this.workers.get(taskId);
    if (!entry) {
      throw new ProviderError(`No running worker for task "${taskId}"`, this.name);
    }
    if (entry.timeoutHandle) clearTimeout(entry.timeoutHandle);
    entry.process.kill(signal);
    this.workers.delete(taskId);
  }

  private writeHeartbeat(taskId: string, dir: string, status: string): void {
    const hbPath = join(dir, TASKS_DIR, `task-${taskId}.hb`);
    const hb = {
      workerId: `${this.name}-${taskId}`,
      taskId,
      status,
      currentAction: 'openrouter HTTP agentic worker running',
      timestamp: new Date().toISOString(),
      filesChangedCount: 0,
      sequence: 0,
    };
    try {
      writeFileSync(hbPath, JSON.stringify(hb, null, 2), 'utf-8');
    } catch {
      // Non-fatal: a heartbeat write failure must not stop the worker.
    }
  }

  buildCommand(model: ModelType, _promptPath: string): string {
    return `# openrouter HTTP adapter — POST ${this.baseURL}/chat/completions (model=${String(model)})`;
  }
}

// ─── Wire types (OpenRouter's OpenAI-compatible /chat/completions response) ──

interface OpenRouterUsagePayload {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
}

interface OpenRouterChatCompletionResponse {
  model?: string;
  choices?: Array<{ message?: { content?: string; tool_calls?: unknown } }>;
  usage?: OpenRouterUsagePayload;
}

// ─── Module-level helpers ────────────────────────────────────────────

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return '';
  }
}

/** Parse JSON, returning `undefined` (never throwing) on malformed input. */
function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Narrow to a plain object (not null, not array). */
function asObject(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Read a non-negative finite number from an object key, else undefined. */
function readNum(obj: Record<string, unknown> | undefined, key: string): number | undefined {
  if (!obj) return undefined;
  const v = obj[key];
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;
}

/**
 * Map one parsed OpenRouter `/chat/completions` payload's `usage` block into
 * the canonical {@link TokenUsage} shape. `prompt_tokens_details.cached_tokens`
 * → cacheReadTokens, `completion_tokens_details.reasoning_tokens` →
 * reasoningTokens (OpenRouter's real, documented usage-detail fields — the
 * same shape `tests/providers/openrouter-usage.test.ts` already pins for
 * `OpenAICompatibleAdapter`). Returns `null` when no real token numbers are
 * present (absent `usage`, or an empty `usage: {}`).
 */
function parseOpenRouterUsage(payload: unknown): TokenUsage | null {
  const obj = asObject(payload);
  if (!obj) return null;
  const usage = asObject(obj['usage']);
  if (!usage) return null;

  const promptTokens = readNum(usage, 'prompt_tokens');
  const completionTokens = readNum(usage, 'completion_tokens');
  if (promptTokens === undefined && completionTokens === undefined) return null;

  const cacheReadTokens = readNum(asObject(usage['prompt_tokens_details']), 'cached_tokens') ?? 0;
  const reasoningTokens = readNum(asObject(usage['completion_tokens_details']), 'reasoning_tokens');
  const totalTokens = readNum(usage, 'total_tokens');

  return normalizeUsage({
    inputTokens: promptTokens ?? 0,
    outputTokens: completionTokens ?? 0,
    cacheReadTokens,
    ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
  });
}

/**
 * Normalize the upstream `choices[0].message.tool_calls` into the
 * {@link OpenAIToolCallWire} shape (same normalization `OpenAICompatibleAdapter`
 * applies — OpenRouter echoes the identical OpenAI tool-call wire format).
 */
function normalizeToolCalls(raw: unknown): OpenAIToolCallWire[] {
  if (!Array.isArray(raw)) return [];
  const out: OpenAIToolCallWire[] = [];
  for (const entry of raw) {
    if (entry === null || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const fn = e['function'];
    if (fn === null || typeof fn !== 'object') continue;
    const name = (fn as Record<string, unknown>)['name'];
    if (typeof name !== 'string' || name.length === 0) continue;
    const args = (fn as Record<string, unknown>)['arguments'];
    out.push({
      ...(typeof e['id'] === 'string' ? { id: e['id'] } : {}),
      type: 'function',
      function: {
        name,
        arguments:
          typeof args === 'string' || (args !== null && typeof args === 'object')
            ? (args as string | Record<string, unknown>)
            : '{}',
      },
    });
  }
  return out;
}

// ─── Factory ─────────────────────────────────────────────────────────

/** Create an OpenRouterProvider for the given project root. */
export function createOpenRouterAdapter(
  projectRoot: string,
  opts?: OpenRouterConfig,
): OpenRouterProvider {
  return new OpenRouterProvider(projectRoot, opts);
}

// ─── Wire-point note (slice-2) ────────────────────────────────────────
// Registration is explicitly OUT of scope for 360-006 (NO-GO: "provider-
// bootstrap değişikliği"). To wire this adapter in, a follow-up task adds an
// `openrouter`-shaped candidate to `bootstrapProviders()` in `core/provider.ts`
// — same pattern as the Bedrock block (AWS-creds-gated): gate registration on
// `new OpenRouterProvider(root).isAvailable()` (i.e. `$DECK:OPENROUTER_API_KEY`
// present), `registry.registerProvider(createOpenRouterAdapter(root))`, and add
// `'openrouter'` to `ProviderNameExt`/`ALL_PROVIDER_NAMES` (core/types.ts) plus
// a model-registry entry set (mirrors `registerOllamaModels`) if routing needs
// to target specific OpenRouter model ids by tier.
