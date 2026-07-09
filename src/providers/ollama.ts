// ─── OllamaAdapter ──────────────────────────────────────────────────────────
// Local LLM provider — talks to a self-hosted Ollama server (default
// http://localhost:11434). Sprint 190 W-F F-11. No API key, no third-party cost:
// authentication is implicitly "your machine owns the model".

import {
  spawn,
  type ChildProcess,
  type SpawnOptions as NodeSpawnOptions,
} from 'node:child_process';
import {
  writeFileSync,
  mkdirSync,
  existsSync,
  openSync,
  closeSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ModelType, OllamaModel } from '../core/types.js';
import type {
  ProviderAdapter,
  ProviderSpawnOptions,
  ProviderAvailabilityDetail,
} from '../core/provider.js';
import { ProviderError, buildCliInvocation } from '../core/provider.js';
import { TASKS_DIR } from '../core/constants.js';
import type { ModelTier } from '../core/model-equivalence.js';
import {
  modelRegistry,
  registerOllamaModels,
  type RegistryProviderName,
} from '../core/model-registry.js';

// Side-effect: register Ollama model definitions into the singleton catalog
// the first time this module is imported. Kept out of `BUILTIN_MODELS` so the
// default 13-model / 3-provider invariant relied on by `tests/core/model-
// registry.test.ts` (and any external consumer) holds when Ollama is unused.
registerOllamaModels(modelRegistry);

// `RegistryProviderName` doesn't yet include 'ollama' (see model-registry.ts
// note — task-types.ts widening is out of scope for 190-009), so we cast at
// the lookup site. The runtime registry holds the literal value correctly.
const OLLAMA_PROVIDER = 'ollama' as unknown as RegistryProviderName;

// ─── Constants ───────────────────────────────────────────────────────

/** Default Ollama HTTP endpoint. Override via OLLAMA_HOST / DECKENT_OLLAMA_HOST. */
const DEFAULT_OLLAMA_HOST = 'http://localhost:11434';

/** HTTP probe timeout (ms) used for isAvailable() / diagnoseAvailability(). */
const PROBE_TIMEOUT_MS = 3000;

/**
 * Default path to the compiled agentic worker entry script (T-233-002).
 * Resolved from this module's own URL — production: `dist/providers/ollama.js`
 * → `dist/agents/agentic-worker-entry.js`. Tests inject a stub via the
 * `workerEntryPath` constructor option.
 */
const DEFAULT_WORKER_ENTRY_PATH = fileURLToPath(
  new URL('../agents/agentic-worker-entry.js', import.meta.url),
);

/** Models registered for the 'ollama' provider — derived from ModelRegistry. */
const OLLAMA_MODELS: readonly OllamaModel[] = modelRegistry
  .getByProvider(OLLAMA_PROVIDER)
  .map(m => m.id as OllamaModel);

// ─── Output Parser ───────────────────────────────────────────────────

/**
 * Parse stdout from `ollama` HTTP `/api/generate` (non-streaming JSON).
 * Shape: `{ model, created_at, response, done, ... prompt_eval_count, eval_count }`.
 * Falls back to raw stdout when the body is not valid JSON.
 */
export function parseOllamaOutput(stdout: string): {
  response: string;
  stats?: { inputTokens: number; outputTokens: number };
} {
  if (!stdout.trim()) {
    return { response: '' };
  }
  try {
    const parsed = JSON.parse(stdout);
    const response =
      typeof parsed?.response === 'string'
        ? parsed.response
        : typeof parsed?.message?.content === 'string'
          ? parsed.message.content
          : typeof parsed === 'string'
            ? parsed
            : JSON.stringify(parsed);

    let stats: { inputTokens: number; outputTokens: number } | undefined;
    if (
      typeof parsed?.prompt_eval_count === 'number' &&
      typeof parsed?.eval_count === 'number'
    ) {
      stats = {
        inputTokens: parsed.prompt_eval_count,
        outputTokens: parsed.eval_count,
      };
    }
    return { response, stats };
  } catch {
    return { response: stdout.trim() };
  }
}

// ─── Worker Entry ────────────────────────────────────────────────────

interface OllamaWorkerEntry {
  taskId: string;
  process: ChildProcess;
  logPath: string;
  model: OllamaModel;
  spawnedAt: string;
  timeoutHandle?: ReturnType<typeof setTimeout>;
}

// ─── Detection Result ────────────────────────────────────────────────

/**
 * Rich detection payload — what an external caller gets back from
 * `OllamaAdapter.detect()`. Mirrors the shape requested in the task spec
 * (`{ binary, version, auth, ready }` style) with Ollama-specific fields.
 *
 * Sprint 192 Task 192-007: `ready` is now 3-state aligning with the other
 * provider adapters — `'partial'` when the server is reachable but no models
 * are installed (actionable hint: `ollama pull <model>`).
 */
export interface OllamaDetectionResult {
  available: boolean;
  /** Resolved endpoint URL (post env-override). */
  endpoint: string;
  /** Server version string, when /api/version responds. */
  version?: string;
  /** Locally installed model tag names (from /api/tags). */
  models: string[];
  /** Auth status — always 'none' for local Ollama, but kept for shape parity. */
  auth: 'none';
  /**
   * 3-state readiness:
   * - `true` — server reachable and at least one model installed
   * - `'partial'` — server reachable but no models pulled yet (actionable)
   * - `false` — server unreachable
   */
  ready: true | false | 'partial';
  /** Human-readable reason for the result. */
  reason: string;
}

// ─── OllamaAdapter ───────────────────────────────────────────────────

/**
 * Result returned by `OllamaAdapter.checkHealthGate()`.
 * Never throws — callers can gate dispatch decisions on `available` directly.
 */
export interface HealthGateResult {
  /** True only when the host is reachable AND the requested model (if any) is installed. */
  available: boolean;
  /** Human-readable explanation — actionable on false. */
  reason: string;
  /** Installed model names from `/api/tags` (empty when host is unreachable). */
  models: string[];
}

/**
 * OllamaAdapter — ProviderAdapter for a locally hosted Ollama server.
 *
 * Talks HTTP to `http://localhost:11434` by default; override via
 * `OLLAMA_HOST` or `DECKENT_OLLAMA_HOST`. Worker spawn is implemented by
 * invoking `curl` as a subprocess so the spawn lifecycle stays uniform with
 * the other adapters (log file, kill via signal, etc.).
 *
 * Sprint 190 W-F F-11.
 */
export class OllamaAdapter implements ProviderAdapter {
  readonly name = 'ollama';
  // `OllamaModel` runs alongside the existing ModelType union but is not yet
  // a member of it (task-types.ts widening is out of scope — see model-registry).
  // The cast is structural-only; at runtime these are plain string ids.
  readonly supportedModels: readonly ModelType[] =
    OLLAMA_MODELS as unknown as readonly ModelType[];

  private readonly projectDir: string;
  private readonly workers = new Map<string, OllamaWorkerEntry>();

  /** Default timeout in ms before a worker is killed automatically (0 = no timeout). */
  protected defaultTimeoutMs: number;

  /** Resolved endpoint base URL (no trailing slash). */
  private readonly host: string;

  /**
   * Override for the global `fetch` — used by tests to inject a stub without
   * touching the network. Falls back to the global fetch when unset.
   */
  private readonly fetchImpl: typeof fetch;

  /**
   * Path to the agentic-worker-entry.js compiled script. Override in tests to
   * stub the entry without touching disk. Production resolves to
   * `dist/agents/agentic-worker-entry.js`.
   */
  private readonly workerEntryPath: string;

  /**
   * Override for `node:child_process.spawn` — used by tests to capture launch
   * args without firing real subprocesses. Defaults to the real `spawn`.
   */
  private readonly spawnImpl: typeof spawn;

  /**
   * Host platform — injectable so the win32 cmd.exe-wrapper spawn path
   * (born-580, DEP0190 + ADR-006 parity with subprocess.ts) is testable
   * without a real spawn. Defaults to `process.platform`.
   */
  private readonly platform: NodeJS.Platform;

  /**
   * Cache of model ids returned by the live `/api/tags` probe (T-233-002).
   * Populated by `refreshSupportedModels()` and consulted by `isSupportedModel`
   * as a dynamic acceptance layer alongside the static catalog. `null` means
   * "no probe yet"; only the static catalog is honored.
   */
  private dynamicModelsCache: Set<string> | null = null;

  constructor(
    projectDir: string,
    opts?: {
      defaultTimeoutMs?: number;
      host?: string;
      fetchImpl?: typeof fetch;
      workerEntryPath?: string;
      spawnImpl?: typeof spawn;
      platform?: NodeJS.Platform;
    },
  ) {
    this.projectDir = projectDir;
    this.defaultTimeoutMs = opts?.defaultTimeoutMs ?? 0;
    this.host = (opts?.host ?? this.resolveHost()).replace(/\/+$/, '');
    this.fetchImpl = opts?.fetchImpl ?? ((...args) => fetch(...args));
    this.workerEntryPath = opts?.workerEntryPath ?? DEFAULT_WORKER_ENTRY_PATH;
    this.spawnImpl = opts?.spawnImpl ?? spawn;
    this.platform = opts?.platform ?? process.platform;
  }

  // ─── spawn() ───────────────────────────────────────────────────────

  spawn(
    taskId: string,
    model: ModelType,
    // The agentic worker reads the prompt from `.tasks/task-{id}.json`
    // (description field) inside the spawned node process; we keep the
    // ProviderAdapter signature unchanged but no longer forward this string.
    _prompt: string,
    opts?: ProviderSpawnOptions,
  ): void {
    if (this.workers.has(taskId)) {
      throw new ProviderError(
        `Worker for task "${taskId}" is already running`,
        this.name,
      );
    }
    if (!this.isSupportedModel(model)) {
      throw new ProviderError(
        `Unsupported model "${model}" for Ollama provider. Supported: ${OLLAMA_MODELS.join(', ')}`,
        this.name,
      );
    }

    const dir = opts?.projectDir ?? this.projectDir;
    const tasksDir = join(dir, TASKS_DIR);
    ensureDir(tasksDir);

    const logPath = join(tasksDir, `task-${taskId}.log`);
    const logFd = openSync(logPath, 'a');

    // T-233-002: spawn the agentic worker entry as a long-running node
    // subprocess (replaces the prior one-shot `curl /api/generate`). The
    // entry reads task json, drives the runner's tool-calling loop, and
    // writes a structured `.result`. Lifecycle (workers map, heartbeat,
    // timeout SIGKILL, kill SIGTERM, exit cleanup) is unchanged.
    const apiId = modelRegistry.get(model)?.apiId ?? model;

    // SPAWN-1 (born-580, DEP0190 + ADR-006 parity with subprocess.ts): route
    // through buildCliInvocation — `node` is a real binary on every platform so
    // POSIX/win32 both stay byte-identical today, but this keeps every provider
    // spawn on one cross-platform-safe invocation path (Law #2).
    const inv = buildCliInvocation('node', [this.workerEntryPath, taskId, apiId, this.host], this.platform);

    const spawnOpts: NodeSpawnOptions = {
      cwd: dir,
      stdio: ['ignore', logFd, logFd],
      env: { ...process.env, ...(opts?.env ?? {}) },
      shell: inv.shell,
    };

    const child = this.spawnImpl(inv.command, inv.args, spawnOpts);
    closeSync(logFd);

    this.writeHeartbeat(taskId, dir, 'EXECUTING');

    const entry: OllamaWorkerEntry = {
      taskId,
      process: child,
      logPath,
      model: model as OllamaModel,
      spawnedAt: new Date().toISOString(),
    };

    if (this.defaultTimeoutMs > 0) {
      entry.timeoutHandle = setTimeout(() => {
        this.killWithSignal(taskId, 'SIGKILL');
      }, this.defaultTimeoutMs);
    }

    this.workers.set(taskId, entry);

    child.once('exit', () => {
      const w = this.workers.get(taskId);
      if (w?.timeoutHandle) clearTimeout(w.timeoutHandle);
      this.workers.delete(taskId);
    });
  }

  // ─── kill() ────────────────────────────────────────────────────────

  kill(taskId: string): void {
    this.killWithSignal(taskId, 'SIGTERM');
  }

  // ─── listWorkers() ─────────────────────────────────────────────────

  listWorkers(): string[] {
    return Array.from(this.workers.keys());
  }

  // ─── isAvailable() ─────────────────────────────────────────────────

  /**
   * True when the Ollama server responds successfully to `/api/tags` within
   * `PROBE_TIMEOUT_MS`. Returns false on any network/transport error — never
   * throws, so callers can use this in cold-path startup probes.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const res = await this.fetchWithTimeout(`${this.host}/api/tags`);
      return res.ok;
    } catch {
      return false;
    }
  }

  // ─── checkHealthGate() ─────────────────────────────────────────────

  /**
   * Pre-dispatch health gate — probes `/api/tags` and reports whether the
   * adapter is ready to serve `requestedModel` (or any model when omitted).
   *
   * Design goals (AS-2 §4A Phase-2):
   * - Never throws; host-down returns `available: false` with an actionable reason.
   * - Non-blocking: probe runs through the injectable `fetchImpl` + `PROBE_TIMEOUT_MS`.
   * - No silent fallback to another provider — honest fail only.
   * - Returns the full installed model list so callers can surface alternatives.
   */
  async checkHealthGate(requestedModel?: string): Promise<HealthGateResult> {
    let models: string[] = [];
    try {
      const res = await this.fetchWithTimeout(`${this.host}/api/tags`);
      if (!res.ok) {
        return {
          available: false,
          reason: `Ollama /api/tags returned HTTP ${res.status} — host may be starting up`,
          models: [],
        };
      }
      const body = (await res.json()) as { models?: { name: string }[] };
      models = Array.isArray(body?.models)
        ? body.models.map(m => m.name).filter((n): n is string => typeof n === 'string' && n.length > 0)
        : [];
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        available: false,
        reason: `Ollama host unreachable (${this.host}): ${msg}`,
        models: [],
      };
    }

    if (models.length === 0) {
      return {
        available: false,
        reason: 'Ollama host reachable but no models installed — run `ollama pull <model>`',
        models: [],
      };
    }

    if (requestedModel !== undefined) {
      const found = models.includes(requestedModel);
      if (!found) {
        return {
          available: false,
          reason: `Model "${requestedModel}" not found in Ollama (installed: ${models.join(', ')})`,
          models,
        };
      }
    }

    return {
      available: true,
      reason: `Ollama ready — ${models.length} model${models.length === 1 ? '' : 's'} available`,
      models,
    };
  }

  // ─── detect() ──────────────────────────────────────────────────────

  /**
   * Probe the server and return rich status: endpoint, version, model list,
   * ready flag. Used by `deckent doctor --providers` and the chat-mode
   * naive provider picker. Never throws.
   */
  async detect(): Promise<OllamaDetectionResult> {
    const base: OllamaDetectionResult = {
      available: false,
      endpoint: this.host,
      models: [],
      auth: 'none',
      ready: false,
      reason: 'Ollama server not reachable',
    };
    try {
      const tagsRes = await this.fetchWithTimeout(`${this.host}/api/tags`);
      if (!tagsRes.ok) {
        return { ...base, reason: `Ollama /api/tags returned ${tagsRes.status}` };
      }
      const tagsBody = (await tagsRes.json()) as { models?: { name: string }[] };
      const models = Array.isArray(tagsBody?.models)
        ? tagsBody.models.map(m => m.name).filter(Boolean)
        : [];

      let version: string | undefined;
      try {
        const verRes = await this.fetchWithTimeout(`${this.host}/api/version`);
        if (verRes.ok) {
          const verBody = (await verRes.json()) as { version?: string };
          version = typeof verBody?.version === 'string' ? verBody.version : undefined;
        }
      } catch {
        // version endpoint is optional on older Ollama builds
      }

      // Sprint 192 Task 192-007: 3-state readiness — server reachable with
      // zero models pulled is `'partial'` (actionable: `ollama pull <model>`).
      const ready: true | 'partial' = models.length > 0 ? true : 'partial';
      const reason = models.length > 0
        ? `Ollama server reachable (${models.length} model${models.length === 1 ? '' : 's'})`
        : 'Ollama server reachable but no models installed — pull a model to use it';
      return {
        available: models.length > 0,
        endpoint: this.host,
        version,
        models,
        auth: 'none',
        ready,
        reason,
      };
    } catch (err) {
      return {
        ...base,
        reason: `Ollama probe failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // ─── diagnoseAvailability() ────────────────────────────────────────

  /**
   * ProviderAdapter-shaped availability detail, derived from `detect()`. Local
   * Ollama has no separate auth layer, so `authMethod` is always 'none' but
   * `authStatus` is reported as 'ok' when the server is reachable (consistent
   * with the "binary + auth OK" semantics other adapters use).
   */
  async diagnoseAvailability(): Promise<ProviderAvailabilityDetail> {
    const d = await this.detect();
    // Reachability — "binary" means "server reachable" for Ollama; the local
    // server stands in for the CLI binary used by the other adapters.
    const reachable = d.ready !== false;
    const versionStatus: ProviderAvailabilityDetail['versionStatus'] = reachable
      ? d.version
        ? 'ok'
        : 'unknown'
      : 'missing';

    const hints: string[] = [];
    if (!reachable) {
      hints.push('Install Ollama: https://ollama.com/download');
      hints.push('Start the server: `ollama serve`');
      hints.push(`Or set OLLAMA_HOST=<url> (current: ${this.host})`);
    } else if (d.models.length === 0) {
      hints.push('Pull a model: `ollama pull qwen2.5-coder:7b`');
    }

    return {
      name: 'ollama',
      binaryFound: reachable,
      binaryPath: undefined,
      version: d.version,
      versionStatus,
      authMethod: 'none',
      authStatus: reachable ? 'ok' : 'missing',
      available: d.ready === true,
      partial: d.ready === 'partial',
      models: [...OLLAMA_MODELS] as unknown as ModelType[],
      reason: d.reason,
      hints,
    };
  }

  // ─── complete() ────────────────────────────────────────────────────

  /**
   * Non-streaming completion via `/api/generate`. Returns the parsed
   * response text plus optional token stats (from prompt_eval_count /
   * eval_count). Mirrors the spec in the task description.
   */
  async complete(
    prompt: string,
    model: ModelType,
  ): Promise<{ response: string; stats?: { inputTokens: number; outputTokens: number } }> {
    if (!this.isSupportedModel(model)) {
      throw new ProviderError(
        `Unsupported model "${model}" for Ollama provider`,
        this.name,
      );
    }
    const apiId = modelRegistry.get(model)?.apiId ?? model;
    const res = await this.fetchImpl(`${this.host}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: apiId, prompt, stream: false }),
    });
    if (!res.ok) {
      throw new ProviderError(
        `Ollama /api/generate returned ${res.status}`,
        this.name,
      );
    }
    const text = await res.text();
    return parseOllamaOutput(text);
  }

  // ─── stream() ──────────────────────────────────────────────────────

  /**
   * Streaming completion via `/api/chat`. Async-iterable over the
   * incremental text chunks (NDJSON-decoded). Each chunk yields the
   * cumulative text response.
   */
  async *stream(
    prompt: string,
    model: ModelType,
  ): AsyncGenerator<string, void, void> {
    if (!this.isSupportedModel(model)) {
      throw new ProviderError(
        `Unsupported model "${model}" for Ollama provider`,
        this.name,
      );
    }
    const apiId = modelRegistry.get(model)?.apiId ?? model;
    const res = await this.fetchImpl(`${this.host}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: apiId,
        messages: [{ role: 'user', content: prompt }],
        stream: true,
      }),
    });
    if (!res.ok || !res.body) {
      throw new ProviderError(
        `Ollama /api/chat returned ${res.status}`,
        this.name,
      );
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          const chunk =
            typeof parsed?.message?.content === 'string'
              ? parsed.message.content
              : typeof parsed?.response === 'string'
                ? parsed.response
                : '';
          if (chunk) yield chunk;
        } catch {
          // skip malformed NDJSON line
        }
      }
    }
  }

  // ─── buildCommand() / buildPlannerCommand() ────────────────────────

  buildCommand(
    model: ModelType,
    promptPath: string,
    _opts?: Pick<ProviderSpawnOptions, 'allowedTools' | 'autoApprove'>,
  ): string {
    const apiId = modelRegistry.get(model)?.apiId ?? model;
    return `curl -s -X POST "${this.host}/api/generate" -H "Content-Type: application/json" --data-binary @${promptPath} -d '{"model":"${apiId}","stream":false}'`;
  }

  buildPlannerCommand(prompt: string, model: ModelType): { command: string; args: string[] } {
    const apiId = modelRegistry.get(model)?.apiId ?? model;
    const body = JSON.stringify({ model: apiId, prompt, stream: false });
    return {
      command: 'curl',
      args: [
        '-s',
        '-X',
        'POST',
        `${this.host}/api/generate`,
        '-H',
        'Content-Type: application/json',
        '-d',
        body,
      ],
    };
  }

  // ─── parseAgentResponse() ──────────────────────────────────────────

  parseAgentResponse(raw: string): string {
    return parseOllamaOutput(raw).response || raw;
  }

  // ─── getModelForTier() ─────────────────────────────────────────────

  /**
   * Get the recommended Ollama model for a given capability tier.
   * Reads directly from ModelRegistry so the catalog stays the single
   * source of truth (registry → tier map → model id).
   */
  getModelForTier(tier: ModelTier): OllamaModel {
    const match = modelRegistry.getByProviderAndTier(OLLAMA_PROVIDER, tier);
    if (match) return match.id as OllamaModel;
    // Fallback chain: walk down tiers
    const order: ModelTier[] = ['premium_plus', 'premium', 'standard', 'economy'];
    for (let i = order.indexOf(tier) + 1; i < order.length; i++) {
      const t = order[i];
      if (!t) continue;
      const m = modelRegistry.getByProviderAndTier(OLLAMA_PROVIDER, t);
      if (m) return m.id as OllamaModel;
    }
    return 'llama-3.2-3b';
  }

  // ─── Accessors ─────────────────────────────────────────────────────

  getHost(): string {
    return this.host;
  }

  getWorkerEntry(taskId: string): OllamaWorkerEntry | undefined {
    return this.workers.get(taskId);
  }

  getLogPath(taskId: string): string {
    return join(this.projectDir, TASKS_DIR, `task-${taskId}.log`);
  }

  getProjectDir(): string {
    return this.projectDir;
  }

  // ─── Internal helpers ──────────────────────────────────────────────

  private resolveHost(): string {
    return (
      process.env['DECKENT_OLLAMA_HOST'] ??
      process.env['OLLAMA_HOST'] ??
      DEFAULT_OLLAMA_HOST
    );
  }

  /**
   * Probe the live `/api/tags` endpoint and cache the model name list so
   * subsequent `isSupportedModel` calls accept any installed model — not
   * just the static 4-entry catalog used for tier-routing defaults.
   *
   * T-233-002: this is what lets `qwen3.6:27b` (and any other locally pulled
   * model) be a valid spawn target. Production callers should invoke this
   * once at startup; failures are swallowed (the static catalog stays as
   * the fallback).
   */
  async refreshSupportedModels(): Promise<void> {
    try {
      const res = await this.fetchWithTimeout(`${this.host}/api/tags`);
      if (!res.ok) return;
      const body = (await res.json()) as { models?: { name: string }[] };
      const names = Array.isArray(body?.models)
        ? body.models.map(m => m.name).filter((n): n is string => typeof n === 'string' && n.length > 0)
        : [];
      this.dynamicModelsCache = new Set(names);
    } catch {
      // Probe failure: leave the existing cache intact (null or prior set).
    }
  }

  /**
   * True if `model` is in the static catalog OR in the dynamic `/api/tags`
   * cache populated by `refreshSupportedModels()`. Public so callers (and
   * tests) can check acceptance without going through spawn().
   */
  isSupportedModel(model: ModelType): boolean {
    if ((OLLAMA_MODELS as readonly string[]).includes(model)) return true;
    if (this.dynamicModelsCache?.has(model as string)) return true;
    return false;
  }

  private async fetchWithTimeout(
    url: string,
    init?: RequestInit,
    timeoutMs: number = PROBE_TIMEOUT_MS,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  private killWithSignal(taskId: string, signal: NodeJS.Signals): void {
    const entry = this.workers.get(taskId);
    if (!entry) {
      throw new ProviderError(
        `No running worker for task "${taskId}"`,
        this.name,
      );
    }
    if (entry.timeoutHandle) clearTimeout(entry.timeoutHandle);
    entry.process.kill(signal);
    this.workers.delete(taskId);
  }

  protected writeHeartbeat(taskId: string, dir: string, status: string): void {
    const hbPath = join(dir, TASKS_DIR, `task-${taskId}.hb`);
    const hb = {
      workerId: `ollama-${taskId}`,
      taskId,
      status,
      currentAction: 'Ollama HTTP worker running',
      timestamp: new Date().toISOString(),
      filesChangedCount: 0,
      sequence: 0,
    };
    try {
      writeFileSync(hbPath, JSON.stringify(hb, null, 2), 'utf-8');
    } catch {
      // Non-fatal: heartbeat write failure should not stop the worker
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// ─── Factory ─────────────────────────────────────────────────────────

/**
 * Create an OllamaAdapter for the given project directory.
 */
export function createOllamaAdapter(
  projectDir: string,
  opts?: { defaultTimeoutMs?: number; host?: string; fetchImpl?: typeof fetch },
): OllamaAdapter {
  return new OllamaAdapter(projectDir, opts);
}
