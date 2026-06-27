// ─── OpenAICompatibleAdapter ──────────────────────────────────────────────
// HTTP-based ProviderAdapter that talks to any OpenAI `/chat/completions`-
// compatible endpoint. Sprint 214 Task 214-014: DeepSeek, Qwen (DashScope
// compat mode), GLM (Zhipu) all expose the same wire shape, so a single
// adapter + preset map covers them all. No new runtime dep — Node built-in
// fetch only (ADR-010).
//
// `send()` is the synchronous chat entry; `spawn()` (F1-013, Sprint 332) runs a
// real headless **agentic sprint worker** by launching the provider-agnostic
// `http-agentic-worker` loop as a subprocess (mirrors OllamaAdapter's spawn
// lifecycle). The loop drives this adapter's tool-aware `send()` through the
// chat-tool-exec executor with ADR-037 scope enforcement.
//
// Wiring (registerProvider) lives in 214-016; this file only defines the
// adapter + presets.
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
import { ProviderError } from '../core/provider.js';
import { TASKS_DIR } from '../core/constants.js';
import { normalizeUsage, type TokenUsage } from '../core/token-usage.js';

// ─── Wire types (OpenAI /chat/completions) ───────────────────────────

/**
 * OpenAI chat message. The `tool` role + `tool_calls`/`tool_call_id`/`name`
 * fields are the agentic tool-calling superset (F1-013) — additive and
 * back-compat: a plain system/user/assistant message is still valid.
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: OpenAIToolCallWire[];
  tool_call_id?: string;
  name?: string;
}

/** OpenAI tool-call wire shape (request echo + response). */
export interface OpenAIToolCallWire {
  id?: string;
  type?: 'function';
  function: { name: string; arguments: string | Record<string, unknown> };
}

export interface ChatCompletionOptions {
  /** Sampling temperature; passed through to upstream. */
  temperature?: number;
  /** Max tokens to generate; passed through to upstream. */
  maxTokens?: number;
  /** Stop sequences. */
  stop?: string[];
  /**
   * Tool schemas (OpenAI `tools` array) advertised to the model for an agentic
   * tool-calling round (F1-013). When set, the parsed `choices[0].message.
   * tool_calls` are surfaced on {@link ChatCompletionResult.toolCalls}.
   */
  tools?: readonly unknown[];
}

export interface ChatCompletionResult {
  content: string;
  /** Raw `usage` object when the upstream returns one. */
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  /** Resolved model id echoed by upstream (for telemetry). */
  model?: string;
  /** Parsed `choices[0].message.tool_calls` when the model requested tools (F1-013). */
  toolCalls?: OpenAIToolCallWire[];
}

/**
 * Default path to the compiled HTTP agentic worker entry (F1-013). Resolved
 * from this module's own URL — production: `dist/providers/openai-compatible.js`
 * → `dist/agents/http-agentic-worker.js`. Tests inject a stub via the
 * `workerEntryPath` constructor option.
 */
const DEFAULT_HTTP_WORKER_ENTRY_PATH = fileURLToPath(
  new URL('../agents/http-agentic-worker.js', import.meta.url),
);

/** Tracks a spawned agentic worker subprocess for lifecycle (kill/timeout). */
interface HttpWorkerEntry {
  taskId: string;
  process: ChildProcess;
  logPath: string;
  spawnedAt: string;
  timeoutHandle?: ReturnType<typeof setTimeout>;
}

// ─── Adapter config ──────────────────────────────────────────────────

export interface OpenAICompatibleConfig {
  /** Public-facing provider id, e.g. 'deepseek' | 'qwen' | 'zhipu'. */
  name: string;
  /** Base URL without `/chat/completions` (e.g. https://api.deepseek.com/v1). */
  baseURL: string;
  /** Environment variable that holds the apiKey. */
  apiKeyEnv: string;
  /** Supported model ids — used to validate `send()` calls. */
  models: readonly string[];
  /** Optional fetch override for tests (defaults to global fetch). */
  fetchImpl?: typeof fetch;
  /**
   * Project root used by `spawn()` for `.tasks/` heartbeat + log files (F1-013).
   * Defaults to `process.cwd()`; `spawn(opts.projectDir)` overrides per-call.
   */
  projectDir?: string;
  /** Override the compiled agentic-worker entry path (tests stub it). */
  workerEntryPath?: string;
  /** Override `node:child_process.spawn` (tests capture launch args, no real process). */
  spawnImpl?: typeof nodeSpawn;
  /** Auto-kill timeout (ms) for a spawned worker; 0 = no timeout. */
  defaultTimeoutMs?: number;
}

// ─── Adapter ─────────────────────────────────────────────────────────

export class OpenAICompatibleAdapter implements ProviderAdapter {
  readonly name: string;
  readonly baseURL: string;
  readonly apiKeyEnv: string;
  readonly supportedModels: readonly ModelType[];

  private readonly fetchImpl: typeof fetch;
  private readonly projectDir: string;
  private readonly workerEntryPath: string;
  private readonly spawnImpl: typeof nodeSpawn;
  private readonly defaultTimeoutMs: number;
  private readonly workers = new Map<string, HttpWorkerEntry>();

  constructor(config: OpenAICompatibleConfig) {
    this.name = config.name;
    this.baseURL = config.baseURL.replace(/\/+$/, '');
    this.apiKeyEnv = config.apiKeyEnv;
    // Models are stringly-typed in the registry until ModelType is widened.
    this.supportedModels = config.models as unknown as readonly ModelType[];
    this.fetchImpl = config.fetchImpl ?? ((...args) => fetch(...args));
    this.projectDir = config.projectDir ?? process.cwd();
    this.workerEntryPath = config.workerEntryPath ?? DEFAULT_HTTP_WORKER_ENTRY_PATH;
    this.spawnImpl = config.spawnImpl ?? nodeSpawn;
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? 0;
  }

  // ─── send() — primary HTTP entry ────────────────────────────────────

  /**
   * POST `${baseURL}/chat/completions` with OpenAI schema. Throws
   * ProviderError on missing key, unsupported model, or non-2xx response.
   */
  async send(
    messages: ChatMessage[],
    model: string,
    opts?: ChatCompletionOptions,
  ): Promise<ChatCompletionResult> {
    const apiKey = process.env[this.apiKeyEnv];
    if (!apiKey) {
      throw new ProviderError(
        `${this.apiKeyEnv} is not set — cannot call ${this.name}`,
        this.name,
      );
    }
    if (!this.isSupportedModel(model)) {
      throw new ProviderError(
        `Unsupported model "${model}" for ${this.name}. Supported: ${this.supportedModels.join(', ')}`,
        this.name,
      );
    }

    const body: Record<string, unknown> = {
      model,
      messages,
      stream: false,
    };
    if (opts?.temperature !== undefined) body['temperature'] = opts.temperature;
    if (opts?.maxTokens !== undefined) body['max_tokens'] = opts.maxTokens;
    if (opts?.stop !== undefined) body['stop'] = opts.stop;
    // F1-013 agentic round: advertise tool schemas so the model can emit
    // `tool_calls`. Absent for a plain chat — keeps the request byte-identical
    // to today's behavior when `tools` is unset.
    if (opts?.tools !== undefined && opts.tools.length > 0) body['tools'] = opts.tools;

    const res = await this.fetchImpl(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await safeText(res);
      throw new ProviderError(
        `${this.name} /chat/completions returned ${res.status}${text ? `: ${text}` : ''}`,
        this.name,
      );
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string; tool_calls?: unknown } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      model?: string;
    };
    const content = json?.choices?.[0]?.message?.content ?? '';
    const result: ChatCompletionResult = { content };
    if (json?.usage) {
      result.usage = {
        inputTokens: json.usage.prompt_tokens ?? 0,
        outputTokens: json.usage.completion_tokens ?? 0,
      };
    }
    if (typeof json?.model === 'string') {
      result.model = json.model;
    }
    // F1-013: surface the model's tool_calls (when present) for the agentic loop.
    const toolCalls = normalizeToolCalls(json?.choices?.[0]?.message?.tool_calls);
    if (toolCalls.length > 0) result.toolCalls = toolCalls;
    return result;
  }

  // ─── isAvailable() ─────────────────────────────────────────────────

  /**
   * True when the configured apiKey env var is set. No network probe —
   * 3rd-party HTTP endpoints should not be ping'd on cold-path startup.
   */
  async isAvailable(): Promise<boolean> {
    return Boolean(process.env[this.apiKeyEnv]);
  }

  // ─── diagnoseAvailability() ────────────────────────────────────────

  async diagnoseAvailability(): Promise<ProviderAvailabilityDetail> {
    const hasKey = Boolean(process.env[this.apiKeyEnv]);
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
        ? `${this.name} HTTP adapter ready (apiKey present in ${this.apiKeyEnv})`
        : `${this.apiKeyEnv} not set — ${this.name} unavailable`,
      hints: hasKey ? [] : [`Set ${this.apiKeyEnv}=<your-api-key>`],
    };
  }

  // ─── Spawn-mode (F1-013 agentic HTTP worker) ───────────────────────

  /**
   * Launch a real headless agentic sprint worker (F1-013). Spawns the
   * provider-agnostic `http-agentic-worker` loop as a `node` subprocess — the
   * loop reads `.tasks/task-{id}.json`, drives THIS adapter's tool-aware
   * `send()` through the chat-tool-exec executor (scope-enforced, ADR-037), and
   * writes a structured `.result`. Lifecycle (workers map, heartbeat, timeout
   * SIGKILL, kill SIGTERM, exit cleanup) mirrors OllamaAdapter.
   *
   * `prompt` is read from the task JSON by the subprocess (parity with the
   * Ollama path), so the ProviderAdapter signature is honored without forwarding
   * the string. v1 = ONE task; concurrency parity is a phase-2 follow-up.
   */
  spawn(taskId: string, model: ModelType, _prompt: string, opts?: ProviderSpawnOptions): void {
    if (this.workers.has(taskId)) {
      throw new ProviderError(`Worker for task "${taskId}" is already running`, this.name);
    }
    if (!this.isSupportedModel(String(model))) {
      throw new ProviderError(
        `Unsupported model "${String(model)}" for ${this.name}. Supported: ${this.supportedModels.join(', ')}`,
        this.name,
      );
    }

    const dir = opts?.projectDir ?? this.projectDir;
    const tasksDir = join(dir, TASKS_DIR);
    if (!existsSync(tasksDir)) mkdirSync(tasksDir, { recursive: true });

    const logPath = join(tasksDir, `task-${taskId}.log`);
    const logFd = openSync(logPath, 'a');

    const spawnOpts: NodeSpawnOptions = {
      cwd: dir,
      stdio: ['ignore', logFd, logFd],
      env: { ...process.env, ...(opts?.env ?? {}) },
    };

    // argv = [entry, taskId, model, baseURL, apiKeyEnv, providerName]. The
    // subprocess reconstructs the adapter from these + the inherited apiKey env.
    const child = this.spawnImpl(
      'node',
      [this.workerEntryPath, taskId, String(model), this.baseURL, this.apiKeyEnv, this.name],
      spawnOpts,
    );
    closeSync(logFd);

    this.writeHeartbeat(taskId, dir, 'EXECUTING');

    const entry: HttpWorkerEntry = {
      taskId,
      process: child,
      logPath,
      spawnedAt: new Date().toISOString(),
    };

    const timeoutMs = opts?.taskTimeoutSeconds
      ? opts.taskTimeoutSeconds * 1000
      : this.defaultTimeoutMs;
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
      currentAction: `${this.name} HTTP agentic worker running`,
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
    return `# ${this.name} HTTP adapter — POST ${this.baseURL}/chat/completions (model=${String(model)})`;
  }

  // ─── extractUsage() ────────────────────────────────────────────────

  /**
   * Extract real token usage from an OpenAI-compatible `/chat/completions`
   * response body (capture, not re-count — the numbers already exist in the
   * response, zero added latency). This single seam covers the entire
   * Class-C gateway matrix AND OpenAI-shape Class-B APIs — OpenRouter,
   * LiteLLM-proxy, vLLM, DeepSeek, Qwen all return the same normalized
   * `usage` object, so no provider is special-cased (Law #2, full matrix):
   *
   *   `usage: { prompt_tokens, completion_tokens, total_tokens,
   *             prompt_tokens_details: { cached_tokens },
   *             completion_tokens_details: { reasoning_tokens } }`
   *
   * Maps to the rich normalized schema: `prompt_tokens` → inputTokens,
   * `completion_tokens` → outputTokens (reasoning is a breakdown of it, not
   * additive — AI-SDK parity), `prompt_tokens_details.cached_tokens` →
   * cacheReadTokens, `completion_tokens_details.reasoning_tokens` →
   * reasoningTokens, `total_tokens` → provider-authoritative totalTokens.
   *
   * `rawOutput` is the response body string; a streamed gateway (SSE/NDJSON,
   * `stream: true` with usage in the final chunk) is also handled — every
   * parseable JSON line is scanned and the LAST recognizable usage wins.
   * Returns null when no usage is present (empty `usage: {}` included) — the
   * orchestrator then falls back to external tokenizer counting.
   */
  extractUsage(rawOutput: string): TokenUsage | null {
    if (typeof rawOutput !== 'string') return null;
    const trimmed = rawOutput.trim();
    if (trimmed.length === 0) return null;

    // The non-streaming response is a single JSON object; a streamed gateway
    // emits NDJSON/SSE lines with usage in the final chunk. Collect the whole
    // string plus every JSON line — a one-line object is seen twice, harmless
    // (last-wins is idempotent), and the streamed final-chunk usage is caught.
    const candidates: unknown[] = [];
    const whole = tryParseJson(trimmed);
    if (whole !== undefined) candidates.push(whole);
    for (const line of rawOutput.split(/\r?\n/)) {
      const t = stripSseDataPrefix(line.trim());
      if (t.length < 2 || (t[0] !== '{' && t[0] !== '[')) continue;
      const parsed = tryParseJson(t);
      if (parsed !== undefined) candidates.push(parsed);
    }

    let found: TokenUsage | null = null;
    for (const candidate of candidates) {
      const usage = extractOpenAIUsage(candidate);
      if (usage) found = usage; // streamed cumulative usage — last recognizable wins
    }
    return found;
  }

  // ─── Internal helpers ──────────────────────────────────────────────

  private isSupportedModel(model: string): boolean {
    return (this.supportedModels as readonly string[]).includes(model);
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return '';
  }
}

/**
 * Normalize the upstream `choices[0].message.tool_calls` into the agentic
 * {@link OpenAIToolCallWire} shape. Tolerant of partial gateways: drops entries
 * without a function name; keeps `arguments` as the JSON string (the loop parses
 * it). Returns `[]` for any non-array / absent value.
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

// ─── Token-usage parsing helpers (extractUsage) ───────────────────────

/**
 * Pull a normalized {@link TokenUsage} out of one parsed `/chat/completions`
 * payload. Recognizes the OpenAI-standard `usage` object shared by every
 * Class-C gateway and OpenAI-shape API (OpenRouter/LiteLLM/vLLM/DeepSeek/Qwen).
 * Returns null when the payload carries no recognizable token numbers.
 */
function extractOpenAIUsage(payload: unknown): TokenUsage | null {
  const obj = asObject(payload);
  if (!obj) return null;
  const usage = asObject(obj['usage']);
  if (!usage) return null;

  const promptTokens = readNum(usage, 'prompt_tokens') ?? readNum(usage, 'input_tokens');
  const completionTokens = readNum(usage, 'completion_tokens') ?? readNum(usage, 'output_tokens');
  // No real token numbers (e.g. an empty `usage: {}`) → nothing to capture.
  if (promptTokens === undefined && completionTokens === undefined) return null;

  // cache-read: OpenAI/OpenRouter standard `prompt_tokens_details.cached_tokens`;
  // DeepSeek-direct `prompt_cache_hit_tokens`; legacy `cached_input_tokens`.
  const cacheReadTokens =
    readNum(asObject(usage['prompt_tokens_details']), 'cached_tokens') ??
    readNum(usage, 'prompt_cache_hit_tokens') ??
    readNum(usage, 'cached_input_tokens') ??
    0;

  // reasoning: OpenAI o1/o3 + OpenRouter `completion_tokens_details.reasoning_tokens`.
  // It is a breakdown of completion_tokens (not additive) — surfaced as a detail.
  const reasoningTokens = readNum(asObject(usage['completion_tokens_details']), 'reasoning_tokens');

  // total: provider-reported `total_tokens` is authoritative; else the
  // normalizer fills inputTokens + outputTokens.
  const totalTokens = readNum(usage, 'total_tokens');

  return normalizeUsage({
    inputTokens: promptTokens ?? 0,
    outputTokens: completionTokens ?? 0,
    cacheReadTokens,
    ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
  });
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

/** Strip a leading SSE `data:` field marker so streamed chunks parse as JSON. */
function stripSseDataPrefix(line: string): string {
  return line.startsWith('data:') ? line.slice(5).trim() : line;
}

// ─── Presets ─────────────────────────────────────────────────────────

/**
 * Factory presets for known OpenAI-compatible providers. Each preset
 * returns a fully configured adapter — caller passes the env var holding
 * the apiKey via standard process env (no extra config plumbing).
 *
 * Endpoints (verified against vendor docs as of Sprint 214):
 *   - DeepSeek:  https://api.deepseek.com/v1            (DEEPSEEK_API_KEY)
 *   - Qwen:      https://dashscope.aliyuncs.com/compatible-mode/v1
 *                                                       (DASHSCOPE_API_KEY)
 *   - GLM/Zhipu: https://open.bigmodel.cn/api/paas/v4   (ZHIPU_API_KEY)
 */
export const OPENAI_COMPAT_PRESETS = {
  deepseek: (fetchImpl?: typeof fetch): OpenAICompatibleAdapter =>
    new OpenAICompatibleAdapter({
      name: 'deepseek',
      baseURL: 'https://api.deepseek.com/v1',
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      models: ['deepseek-chat', 'deepseek-reasoner'],
      fetchImpl,
    }),

  qwen: (fetchImpl?: typeof fetch): OpenAICompatibleAdapter =>
    new OpenAICompatibleAdapter({
      name: 'qwen',
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKeyEnv: 'DASHSCOPE_API_KEY',
      models: ['qwen-plus', 'qwen-turbo', 'qwen-max'],
      fetchImpl,
    }),

  glm: (fetchImpl?: typeof fetch): OpenAICompatibleAdapter =>
    new OpenAICompatibleAdapter({
      name: 'zhipu',
      baseURL: 'https://open.bigmodel.cn/api/paas/v4',
      apiKeyEnv: 'ZHIPU_API_KEY',
      models: ['glm-4-plus', 'glm-4-flash', 'glm-4-air'],
      fetchImpl,
    }),
} as const;

export type OpenAICompatPresetName = keyof typeof OPENAI_COMPAT_PRESETS;
