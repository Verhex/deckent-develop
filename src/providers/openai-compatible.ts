// ─── OpenAICompatibleAdapter ──────────────────────────────────────────────
// HTTP-based ProviderAdapter that talks to any OpenAI `/chat/completions`-
// compatible endpoint. Sprint 214 Task 214-014: DeepSeek, Qwen (DashScope
// compat mode), GLM (Zhipu) all expose the same wire shape, so a single
// adapter + preset map covers them all. No new runtime dep — Node built-in
// fetch only (ADR-010).
//
// This adapter is **HTTP-only**: `spawn()` is not supported (workers run
// inside the calling process via `send()`). Spawn-mode callers should pick
// a CLI-spawn provider (claude/codex/gemini) instead.
//
// Wiring (registerProvider) lives in 214-016; this file only defines the
// adapter + presets.
import type { ModelType } from '../core/types.js';
import type {
  ProviderAdapter,
  ProviderSpawnOptions,
  ProviderAvailabilityDetail,
} from '../core/provider.js';
import { ProviderError } from '../core/provider.js';

// ─── Wire types (OpenAI /chat/completions) ───────────────────────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  /** Sampling temperature; passed through to upstream. */
  temperature?: number;
  /** Max tokens to generate; passed through to upstream. */
  maxTokens?: number;
  /** Stop sequences. */
  stop?: string[];
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
}

// ─── Adapter ─────────────────────────────────────────────────────────

export class OpenAICompatibleAdapter implements ProviderAdapter {
  readonly name: string;
  readonly baseURL: string;
  readonly apiKeyEnv: string;
  readonly supportedModels: readonly ModelType[];

  private readonly fetchImpl: typeof fetch;

  constructor(config: OpenAICompatibleConfig) {
    this.name = config.name;
    this.baseURL = config.baseURL.replace(/\/+$/, '');
    this.apiKeyEnv = config.apiKeyEnv;
    // Models are stringly-typed in the registry until ModelType is widened.
    this.supportedModels = config.models as unknown as readonly ModelType[];
    this.fetchImpl = config.fetchImpl ?? ((...args) => fetch(...args));
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
      choices?: Array<{ message?: { content?: string } }>;
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

  // ─── Spawn-mode stubs (HTTP-only adapter) ──────────────────────────

  spawn(_taskId: string, _model: ModelType, _prompt: string, _opts?: ProviderSpawnOptions): void {
    throw new ProviderError(
      `${this.name} is an HTTP-only adapter — use send() instead of spawn()`,
      this.name,
    );
  }

  kill(_taskId: string): void {
    // No-op: nothing to kill in an HTTP-only adapter.
  }

  listWorkers(): string[] {
    return [];
  }

  buildCommand(model: ModelType, _promptPath: string): string {
    return `# ${this.name} HTTP adapter — POST ${this.baseURL}/chat/completions (model=${String(model)})`;
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
