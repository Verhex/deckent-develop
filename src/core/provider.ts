import { spawnSync } from 'node:child_process';
import type { ModelType, ProviderName } from './types.js';
import type { ResolvedConfig, ProviderDefinition } from './config-types.js';
import { PROVIDER_MODEL_MAP } from './task-types.js';
import { getEquivalentModel } from './model-equivalence.js';
import { Connector } from './session-interface.js';
import { loadDeckSecrets } from './deck-file.js';
import { detectAndRegisterModels, type DetectResult, type DetectAndRegisterOptions } from './model-auto-detect.js';
import { modelRegistry as globalModelRegistry, type ModelRegistry } from './model-registry.js';
import type { TokenUsage } from './token-usage.js';
import { DeckBroker } from './deck-broker.js';

// ─── Provider Spawn Options ──────────────────────────────────────────
export interface ProviderSpawnOptions {
  allowedTools?: string;
  autoApprove?: boolean;
  projectDir?: string;
  logPath?: string;
  /** Environment variable overrides injected into the worker process (only provider-specific keys) */
  env?: Record<string, string>;
  /**
   * Resolved MODEL reasoning-effort level (F1-RE, Sprint 252) — already validated
   * for this provider via `resolveReasoningEffort`. When set, the adapter/backend
   * appends the provider's reasoning-effort flag (claude `--effort`, codex
   * `-c model_reasoning_effort=`). Distinct from work-size effort.
   */
  reasoningEffort?: string;
  /**
   * Adaptive per-task timeout in seconds (Sprint 280 root-cause fix), computed by
   * `brainEstimateTimeout` via `emitTimeoutEvents` and passed at every spawn site.
   * SpawnBackend implementations (docker/tmux/subprocess) use it as the worker
   * kill-timeout, making the static `docker_timeout` a FALLBACK rather than the
   * de-facto cap. Host-CLI adapters that lack a timeout wrapper may ignore it.
   */
  taskTimeoutSeconds?: number;
  /**
   * DECKBROKER-WIRE (354-006, flag-gated, ADR-G-005/G-017 row 422): host-side
   * credential broker for THIS spawn batch — `BootstrapResult.deckBroker`,
   * minted only when `config.deck_broker.enabled` is true. When present, a
   * backend that supports it (`SubprocessSpawnBackend`) resolves ITS OWN
   * task-scoped credential via `deckBroker.resolveForTask(taskId, provider)`
   * instead of the ambient `.deck`→`process.env` inheritance — audited,
   * TTL'd, and the `.deck` file path never reaches the worker. A denied or
   * absent resolution falls through to `env` below unchanged, so passing a
   * broker never breaks a caller that also sets `env` as a fallback.
   * Omitted (the default — nothing upstream wires this yet) keeps today's
   * env-scrub + `env` reinject flow byte-for-byte unchanged.
   */
  deckBroker?: DeckBroker;
}

// ─── Provider Worker Info ────────────────────────────────────────────
export interface ProviderWorkerInfo {
  taskId: string;
  model: ModelType;
  spawnedAt: string;
  pid?: number;
}

// ─── Provider Availability Diagnostics ───────────────────────────────

/**
 * Rich availability info for a single provider — used by doctor --providers
 * and bootstrap diagnostics. Distinguishes between:
 *   - binary missing (CLI not installed)
 *   - binary present + auth missing (partial availability)
 *   - binary + auth + version OK (full availability)
 *
 * Returned by `adapter.diagnoseAvailability()` and aggregated by
 * `runProviderDiagnostics()`.
 */
export interface ProviderAvailabilityDetail {
  /** Provider name, e.g. 'claude' | 'codex' | 'gemini' */
  name: string;
  /** Whether the CLI binary is found in PATH */
  binaryFound: boolean;
  /** Resolved absolute path of the binary (when found) */
  binaryPath?: string;
  /** Trimmed version output, e.g. "0.18.2" or full first line */
  version?: string;
  /** Coarse version status: 'ok' (matched), 'warn-mismatch' (minor diff), 'unknown' (parsable), 'missing' (no binary) */
  versionStatus: 'ok' | 'warn-mismatch' | 'unknown' | 'missing';
  /** Active auth method: 'session', 'api_key', 'none', or 'unknown' */
  authMethod: 'session' | 'api_key' | 'none' | 'unknown';
  /** Auth status: 'ok' (usable), 'missing' (no creds), 'expired', 'unknown' */
  authStatus: 'ok' | 'missing' | 'expired' | 'unknown';
  /** Full availability: binary + auth + (optional) version all OK */
  available: boolean;
  /** Partial availability: binary installed but auth missing — useful for hint UI */
  partial: boolean;
  /** Supported models (full list when binary present; empty if missing) */
  models: ModelType[];
  /** Human-readable status reason, e.g. "CLI installed, OPENAI_API_KEY missing" */
  reason: string;
  /** Suggested user actions, e.g. ["Set OPENAI_API_KEY", "Run codex login"] */
  hints: string[];
}

// ─── ProviderAdapter Interface ───────────────────────────────────────
/**
 * ProviderAdapter — abstract interface for AI provider backends.
 * Concrete implementations: ClaudeAdapter (tmux), SubprocessAdapter, etc.
 */
export interface ProviderAdapter {
  /** Human-readable provider name (e.g. 'claude-tmux', 'claude-subprocess') */
  readonly name: string;

  /** Models this provider supports */
  readonly supportedModels: readonly ModelType[];

  /**
   * Spawn a worker for the given task.
   * @param taskId  Unique task identifier
   * @param model   Model to use
   * @param prompt  Prompt to send to the worker
   * @param opts    Additional spawn options
   */
  spawn(taskId: string, model: ModelType, prompt: string, opts?: ProviderSpawnOptions): void;

  /**
   * Kill a running worker.
   * @param taskId  Task identifier of the worker to kill
   */
  kill(taskId: string): void;

  /**
   * List currently active worker task IDs.
   */
  listWorkers(): string[];

  /**
   * Check whether the provider is available in the current environment.
   */
  isAvailable(): Promise<boolean>;

  /**
   * Build the shell command string that this provider would use to invoke the AI.
   * Equivalent to tmux.ts buildClaudeCommand(). Used for debugging/dry-run display.
   * @param model         Model to use
   * @param promptPath    Path to the prompt file (stdin redirection)
   * @param opts          Spawn options (allowedTools, autoApprove, reasoningEffort)
   */
  buildCommand(model: ModelType, promptPath: string, opts?: Pick<ProviderSpawnOptions, 'allowedTools' | 'autoApprove' | 'reasoningEffort'>): string;

  /**
   * Build CLI command + args for planner invocations.
   * Each provider can override this to produce provider-specific args
   * instead of the default Claude-shaped args.
   * @param prompt  The planner prompt text
   * @param model   Model to use
   * @returns command (CLI binary) and args array
   */
  buildPlannerCommand?(prompt: string, model: ModelType): { command: string; args: string[] };

  /**
   * Optional: rich availability diagnostic — returns binary/version/auth detail
   * suitable for `deckent doctor --providers` and bootstrap UI hints. When not
   * implemented, `runProviderDiagnostics()` falls back to `isAvailable()` + a
   * synthesized detail record.
   */
  diagnoseAvailability?(): Promise<ProviderAvailabilityDetail>;

  /**
   * Optional: extract the agent's actual response from the CLI's stdout envelope.
   * Provider CLIs wrap responses in different shapes:
   *   - Claude  `--output-format json`: `{type:"result", result:"<inner-json-string>", usage:{...}}`
   *   - Gemini  `--output-format json`: `{response:"<text>", candidates:[...], usageMetadata:{...}}`
   *   - Gemini  `--output-format stream-json`: NDJSON (newline-delimited JSON, last line carries final response)
   *   - Codex   raw stdout (no envelope)
   *
   * Returns the inner agent response as a plain string (JSON parser handles further structure).
   * If the input isn't a recognised envelope for this provider, returns `raw` unchanged.
   * @param raw  Full stdout captured from spawnSync
   * @returns Unwrapped response string (still text — caller decides whether to JSON.parse)
   */
  parseAgentResponse?(raw: string): string;

  /**
   * Optional: extract real token usage from the provider's raw stdout/response.
   *
   * Each adapter normalizes its native usage report into the provider-agnostic
   * {@link TokenUsage} shape via `normalizeUsage()` (Anthropic `input_tokens/
   * output_tokens/cache_*`, OpenAI `prompt_tokens/completion_tokens`, Ollama
   * `prompt_eval_count/eval_count`, Gemini `usageMetadata.*`, Codex
   * token-count/usage events). This is a CAPTURE, not a re-count: the numbers
   * already exist in the response, so there is zero added latency.
   *
   * Returns `null` when the provider reported no usage in `rawOutput` — the
   * orchestrator then falls back to external tokenizer counting (which marks
   * `source: 'tokenizer-fallback'`).
   *
   * @param rawOutput  Full stdout/response captured from the worker run.
   * @returns Normalized usage with `source: 'provider-adapter'`, or null if absent.
   */
  extractUsage?(rawOutput: string): TokenUsage | null;
}

// ─── ProviderError ───────────────────────────────────────────────────
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly providerName: string,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export class ProviderNotFoundError extends ProviderError {
  constructor(providerName: string) {
    super(`Provider not found: "${providerName}"`, providerName);
    this.name = 'ProviderNotFoundError';
  }
}

export class ProviderUnavailableError extends ProviderError {
  constructor(providerName: string, reason?: string) {
    const msg = reason
      ? `Provider "${providerName}" is unavailable: ${reason}`
      : `Provider "${providerName}" is unavailable`;
    super(msg, providerName);
    this.name = 'ProviderUnavailableError';
  }
}

// ─── Provider Name Validation ────────────────────────────────────────

/**
 * Runtime-validate a provider name string.
 *
 * Accepts any non-empty string composed of ASCII letters, digits, hyphens, and
 * underscores — including arbitrary names like 'test-ai', 'groq', 'mistral' that
 * are NOT in the built-in ProviderName union. This intentionally does NOT reject
 * unknown names: config-driven providers (F1-012) extend the known set at runtime.
 *
 * Returns false only for empty/whitespace or names containing characters outside
 * the safe set (prevents injection via config.providers.registry).
 */
export function validateProviderName(name: string): boolean {
  if (typeof name !== 'string') return false;
  const trimmed = name.trim();
  return trimmed.length > 0 && /^[A-Za-z0-9_-]+$/.test(trimmed);
}

// ─── ProviderRegistry ────────────────────────────────────────────────
/**
 * ProviderRegistry — singleton registry for ProviderAdapter instances.
 * Supports register, get, list, and default provider management.
 */
export class ProviderRegistry {
  private readonly providers = new Map<string, ProviderAdapter>();
  private defaultProviderName: string | null = null;

  /**
   * Register a provider. Throws if name is already registered.
   * @param provider  The ProviderAdapter to register
   * @param setDefault  Whether to set this as the default provider
   */
  registerProvider(provider: ProviderAdapter, setDefault = false): void {
    if (this.providers.has(provider.name)) {
      throw new ProviderError(
        `Provider "${provider.name}" is already registered`,
        provider.name,
      );
    }
    this.providers.set(provider.name, provider);
    if (setDefault || this.defaultProviderName === null) {
      this.defaultProviderName = provider.name;
    }
  }

  /**
   * Retrieve a provider by name. Throws ProviderNotFoundError if missing.
   */
  getProvider(name: string): ProviderAdapter {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new ProviderNotFoundError(name);
    }
    return provider;
  }

  /**
   * List all registered provider names.
   */
  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get the default provider. Throws if none is registered.
   */
  getDefault(): ProviderAdapter {
    if (this.defaultProviderName === null) {
      throw new ProviderError('No providers registered', '');
    }
    return this.getProvider(this.defaultProviderName);
  }

  /**
   * Set the default provider by name. Throws if not registered.
   */
  setDefault(name: string): void {
    if (!this.providers.has(name)) {
      throw new ProviderNotFoundError(name);
    }
    this.defaultProviderName = name;
  }

  /**
   * Check whether a provider with the given name is registered.
   */
  hasProvider(name: string): boolean {
    return this.providers.has(name);
  }

  /**
   * Unregister a provider. Returns true if removed, false if not found.
   */
  unregisterProvider(name: string): boolean {
    const removed = this.providers.delete(name);
    if (removed && this.defaultProviderName === name) {
      // Reset default to first remaining provider (if any)
      const next = this.providers.keys().next();
      this.defaultProviderName = next.done ? null : next.value;
    }
    return removed;
  }

  /**
   * Clear all registered providers (useful for testing).
   */
  clear(): void {
    this.providers.clear();
    this.defaultProviderName = null;
  }

  /** Number of registered providers */
  get size(): number {
    return this.providers.size;
  }
}

// ─── Global Registry Singleton ───────────────────────────────────────
export const providerRegistry = new ProviderRegistry();

// Sprint 202 Task 202-003: `getDefaultProvider` + `getDefaultProviderName`
// helpers live in `src/orchestra/sprint-utils.ts` next to the existing
// `getDefaultProvider`. Placing the registry-default helpers there (instead
// of here) keeps them available to consumers that mock `core/provider.js`
// with a literal `vi.mock(...)` factory — the `sprint-utils.ts` mocks across
// the test suite consistently use `importOriginal()` and so propagate new
// exports without per-test mock updates.

// ─── Provider Auto-Detection ────────────────────────────────────────

/** Result of detecting a single provider's availability */
export interface DetectedProvider {
  name: ProviderName;
  available: boolean;
  version?: string;
  authMethod: 'session' | 'api_key' | 'none';
  models: ModelType[];
}

/**
 * Resolve the absolute path of a CLI binary by querying the OS lookup tool
 * (`which` on POSIX, `where` on Windows). Used by provider diagnostics to
 * surface the actual path of a detected binary.
 */
export function resolveBinaryPath(cmd: string): string | undefined {
  try {
    const isWindows = process.platform === 'win32';
    const lookup = isWindows ? 'where' : 'which';
    const result = spawnSync(lookup, [cmd], { encoding: 'utf-8', timeout: 3000 });
    if (result.status === 0 && result.stdout) {
      const firstLine = result.stdout.split(/\r?\n/).find(l => l.trim().length > 0);
      return firstLine?.trim();
    }
  } catch {
    // lookup tool unavailable
  }
  return undefined;
}

/**
 * Parse a version string from arbitrary CLI output. Extracts the first
 * `\d+\.\d+(\.\d+)?` substring, e.g. "codex 0.18.2 (rev abc)" → "0.18.2".
 * Returns undefined if no semver pattern present.
 */
export function parseSemverFromOutput(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const match = raw.match(/(\d+\.\d+(?:\.\d+)?)/);
  return match ? match[1] : undefined;
}

/** Injectable seams for {@link detectCliVersion} so tests never spawn a real process. */
export interface CliInvocationDeps {
  /** Override the host platform (defaults to `process.platform`). */
  platform?: NodeJS.Platform;
  /** Override the synchronous spawn impl (defaults to `node:child_process` `spawnSync`). */
  spawnSyncImpl?: typeof spawnSync;
}

/**
 * Build a cross-platform, **shell-free** invocation tuple for a CLI command
 * (`{ command, args, shell:false }` — always safe to spread into spawn/spawnSync).
 *
 * Windows provider CLIs ship as `.cmd`/`.ps1` wrappers on PATH. A bare
 * `spawn('claude', args, { shell:false })` cannot launch a batch wrapper —
 * CreateProcess rejects non-PE files, and post-CVE-2024-27980 Node refuses
 * `.cmd`/`.bat` without a shell — which is why the old code reached for
 * `shell:true`. But `shell:true` WITH an args array is the exact Node DEP0190
 * condition AND concatenates the args into one command string (the ADR-006
 * command-injection surface). The fix routes through `cmd.exe /c <cmd> <args…>`
 * with `shell:false`: cmd.exe resolves the wrapper via PATHEXT while Node passes
 * each arg as a discrete, escaped argv entry — closing both the deprecation and
 * the injection hole. POSIX needs no wrapper: the binary is a real executable,
 * spawned directly with no shell (behaviour byte-for-byte unchanged).
 */
export function buildCliInvocation(
  cmd: string,
  args: string[],
  platform: NodeJS.Platform = process.platform,
): { command: string; args: string[]; shell: false } {
  if (platform === 'win32') {
    return { command: 'cmd.exe', args: ['/c', cmd, ...args], shell: false };
  }
  return { command: cmd, args, shell: false };
}

/**
 * Try to detect a CLI tool version by running `<cmd> --version`.
 * Returns the version string on success, undefined on failure.
 * Cross-platform & shell-free via {@link buildCliInvocation} (DEP0190 + ADR-006 safe).
 * @internal
 */
export function detectCliVersion(
  cmd: string,
  args: string[] = ['--version'],
  deps: CliInvocationDeps = {},
): string | undefined {
  const spawnSyncImpl = deps.spawnSyncImpl ?? spawnSync;
  try {
    const inv = buildCliInvocation(cmd, args, deps.platform);
    const result = spawnSyncImpl(inv.command, inv.args, {
      encoding: 'utf-8',
      timeout: 5000,
      shell: inv.shell,
    });
    if (result.status === 0 && result.stdout) {
      return result.stdout.trim();
    }
  } catch {
    // CLI not found or timed out
  }
  return undefined;
}

/**
 * Detect Claude CLI availability.
 * Checks `claude --version` and returns session-based auth (Claude CLI uses OAuth/session).
 */
function detectClaude(): DetectedProvider {
  const version = detectCliVersion('claude');
  return {
    name: 'claude',
    available: version !== undefined,
    version,
    authMethod: version !== undefined ? 'session' : 'none',
    models: [...PROVIDER_MODEL_MAP.claude],
  };
}

/**
 * Detect Codex (OpenAI) CLI availability.
 *
 * Sprint 248 (Provider Parity): the Codex CLI supports two auth modes, mirroring
 * Claude — an OAuth/ChatGPT subscription session (`codex login`) OR an
 * `OPENAI_API_KEY`. Previously this required the API key, so a subscription-only
 * user (no key) was reported `available: false` and the adapter was never
 * registered — making `worker_provider=codex` silently fall back to Claude.
 * Now CLI presence alone marks the provider available; `authMethod` is `api_key`
 * when a key is set, otherwise `session` (OAuth). A logged-out CLI still reports
 * available — the spawn surfaces the auth error in the worker log, exactly as
 * Claude does. Live login state is the auto-detect feature's concern (deferred).
 */
function detectCodex(): DetectedProvider {
  const version = detectCliVersion('codex');
  const hasApiKey = typeof process.env['OPENAI_API_KEY'] === 'string' && process.env['OPENAI_API_KEY'].length > 0;
  const available = version !== undefined;
  let authMethod: DetectedProvider['authMethod'] = 'none';
  if (hasApiKey) {
    authMethod = 'api_key';
  } else if (version !== undefined) {
    // CLI found, no API key → assume OAuth/subscription session (codex login).
    authMethod = 'session';
  }
  return {
    name: 'codex',
    available,
    version,
    authMethod,
    models: [...PROVIDER_MODEL_MAP.codex],
  };
}

/**
 * Detect Ollama local-server availability.
 *
 * Sprint 202 Task 202-001 (F1 Provider Independence): Ollama is a 1st-class
 * spawn target. The probe is HTTP-only — there is no `ollama` CLI dependency
 * at the orchestration layer; what matters is whether a local server is
 * reachable. Endpoint resolution order:
 *   1. `DECKENT_OLLAMA_HOST` env override
 *   2. `OLLAMA_HOST` env (matches Ollama's own convention)
 *   3. Default `http://localhost:11434`
 *
 * Always resolves — never throws. When the server is unreachable, returns
 * `available: false` with `authMethod: 'none'`, mirroring the other detectors.
 * The Ollama adapter (providers/ollama.ts) holds the rich diagnostics; this
 * detection is intentionally minimal to keep bootstrap fast.
 */
async function detectOllama(): Promise<DetectedProvider> {
  const host =
    process.env['DECKENT_OLLAMA_HOST'] ??
    process.env['OLLAMA_HOST'] ??
    'http://localhost:11434';
  const url = `${host.replace(/\/+$/, '')}/api/tags`;
  let available = false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      available = res.ok;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Server unreachable, timed out, or fetch unavailable.
    available = false;
  }
  return {
    name: 'ollama',
    available,
    // Ollama is local — "your machine owns the model"; no auth concept.
    authMethod: 'none',
    models: [...PROVIDER_MODEL_MAP.ollama],
  };
}

/**
 * Detect Gemini CLI availability.
 *
 * Sprint 248 (Provider Parity): like Codex, the Gemini CLI supports an
 * OAuth/subscription session (`gemini` interactive login) in addition to
 * `GOOGLE_API_KEY` / `DECKENT_GOOGLE_API_KEY`. Previously a key was required, so
 * an OAuth-only user was reported unavailable and the adapter never registered.
 * Now CLI presence marks the provider available; `authMethod` is `api_key` when
 * a key is set, otherwise `session` (OAuth). The GeminiAdapter spawn honors both
 * (key in env when present, OAuth session otherwise).
 */
function detectGemini(): DetectedProvider {
  const version = detectCliVersion('gemini');
  const hasApiKey =
    (typeof process.env['GOOGLE_API_KEY'] === 'string' && process.env['GOOGLE_API_KEY'].length > 0) ||
    (typeof process.env['DECKENT_GOOGLE_API_KEY'] === 'string' && process.env['DECKENT_GOOGLE_API_KEY'].length > 0);
  const available = version !== undefined;
  let authMethod: DetectedProvider['authMethod'] = 'none';
  if (hasApiKey) {
    authMethod = 'api_key';
  } else if (version !== undefined) {
    // CLI found, no API key → assume OAuth/subscription session.
    authMethod = 'session';
  }
  return {
    name: 'gemini',
    available,
    version,
    authMethod,
    models: [...PROVIDER_MODEL_MAP.gemini],
  };
}

/**
 * Detect all known providers and their availability.
 * For each provider, checks CLI availability and/or API key presence.
 */
export async function detectAvailableProviders(): Promise<DetectedProvider[]> {
  // Ollama probe is async (HTTP); CLI detectors are sync. Run the HTTP probe
  // first so we honor the 3s timeout before assembling the result array.
  const ollama = await detectOllama();
  return [
    detectClaude(),
    detectCodex(),
    detectGemini(),
    ollama,
  ];
}

/**
 * Run rich diagnostics for a list of provider adapters.
 *
 * Each adapter SHOULD implement `diagnoseAvailability()`. If not, we fall back
 * to the legacy `isAvailable()` boolean and synthesize a minimal detail record.
 *
 * @param adapters  Provider adapters to probe (typically created via
 *                  createClaudeAdapter/createCodexAdapter/createGeminiAdapter)
 */
export async function runProviderDiagnostics(
  adapters: ProviderAdapter[],
): Promise<ProviderAvailabilityDetail[]> {
  const results: ProviderAvailabilityDetail[] = [];
  for (const adapter of adapters) {
    if (typeof adapter.diagnoseAvailability === 'function') {
      try {
        results.push(await adapter.diagnoseAvailability());
        continue;
      } catch (err) {
        results.push({
          name: adapter.name,
          binaryFound: false,
          versionStatus: 'unknown',
          authMethod: 'unknown',
          authStatus: 'unknown',
          available: false,
          partial: false,
          models: [...adapter.supportedModels],
          reason: `Diagnostic probe failed: ${err instanceof Error ? err.message : String(err)}`,
          hints: ['Re-run `deckent doctor --providers` after fixing the environment'],
        });
        continue;
      }
    }
    // Fallback: synthesize from isAvailable()
    const isAvail = await adapter.isAvailable();
    results.push({
      name: adapter.name,
      binaryFound: isAvail,
      versionStatus: isAvail ? 'unknown' : 'missing',
      authMethod: isAvail ? 'unknown' : 'none',
      authStatus: isAvail ? 'unknown' : 'missing',
      available: isAvail,
      partial: false,
      models: [...adapter.supportedModels],
      reason: isAvail
        ? `${adapter.name} reports available (legacy isAvailable())`
        : `${adapter.name} reports unavailable`,
      hints: isAvail ? [] : ['Adapter does not provide detailed diagnostics'],
    });
  }
  return results;
}

/**
 * Format a compact provider diagnostic table (human-readable).
 * Each row: `STATUS  Provider  vX.Y.Z  AUTH  reason`.
 */
export function formatProviderDiagnostics(details: ProviderAvailabilityDetail[]): string {
  const lines: string[] = ['Provider Diagnostics:'];
  for (const d of details) {
    const status = d.available ? '[OK]    ' : d.partial ? '[PARTIAL]' : '[MISSING]';
    const versionLabel = d.version ? ` v${d.version}` : '';
    const authLabel = d.authMethod === 'none' || d.authMethod === 'unknown'
      ? '(no auth)'
      : `(${d.authMethod})`;
    lines.push(`  ${status} ${d.name}${versionLabel} ${authLabel} — ${d.reason}`);
    if (d.binaryPath) {
      lines.push(`        path: ${d.binaryPath}`);
    }
    for (const hint of d.hints) {
      lines.push(`        hint: ${hint}`);
    }
  }
  return lines.join('\n');
}

/**
 * Format detected providers for display (used by doctor and init).
 */
export function formatDetectedProviders(providers: DetectedProvider[]): string {
  const lines: string[] = ['Providers:'];
  for (const p of providers) {
    const status = p.available ? '\u2714' : '\u2718';
    const version = p.version ? ` v${p.version}` : '';
    const auth = p.authMethod !== 'none' ? ` (${p.authMethod})` : ' (not configured)';
    const models = p.models.join(', ');
    lines.push(`  ${status} ${p.name}${version}${auth} — models: ${models}`);
  }
  return lines.join('\n');
}

// ─── Provider Fallback Chain ────────────────────────────────────────

/**
 * Result of resolving a provider with fallback logic.
 */
export interface FallbackResult {
  /** The provider that will be used */
  provider: ProviderName;
  /** The model to use (may be remapped for fallback provider) */
  model: ModelType;
  /** Human-readable reason for the selection */
  reason: string;
  /** True if the originally requested provider was used */
  wasOriginal: boolean;
}

/**
 * Resolve a provider with fallback chain.
 *
 * 1. Try requestedProvider — if available in registry, return it
 * 2. If unavailable, check config.fallback_provider
 * 3. If fallback is available: remap model via getEquivalentModel, return fallback
 * 4. If no fallback configured or fallback also unavailable: throw ProviderUnavailableError
 *
 * No infinite retry loops — single fallback attempt only.
 */
export async function resolveProviderWithFallback(
  requestedProvider: ProviderName,
  model: ModelType,
  config: { fallback_provider?: ProviderName },
  registry: ProviderRegistry,
): Promise<FallbackResult> {
  // Step 1: Try the requested provider
  if (registry.hasProvider(requestedProvider)) {
    const adapter = registry.getProvider(requestedProvider);
    const available = await adapter.isAvailable();
    if (available) {
      return {
        provider: requestedProvider,
        model,
        reason: `Primary provider "${requestedProvider}" is available`,
        wasOriginal: true,
      };
    }
  }

  // Step 2: Check for fallback
  const fallbackName = config.fallback_provider;
  if (!fallbackName) {
    throw new ProviderUnavailableError(
      requestedProvider,
      `Provider "${requestedProvider}" is unavailable and no fallback_provider is configured`,
    );
  }

  // Step 3: Try the fallback provider
  if (!registry.hasProvider(fallbackName)) {
    throw new ProviderUnavailableError(
      fallbackName,
      `Fallback provider "${fallbackName}" is not registered`,
    );
  }

  const fallbackAdapter = registry.getProvider(fallbackName);
  const fallbackAvailable = await fallbackAdapter.isAvailable();
  if (!fallbackAvailable) {
    throw new ProviderUnavailableError(
      fallbackName,
      `Both primary ("${requestedProvider}") and fallback ("${fallbackName}") providers are unavailable`,
    );
  }

  // Step 4: Remap model for the fallback provider
  const equivalentModel = getEquivalentModel(model, fallbackName);

  return {
    provider: fallbackName,
    model: equivalentModel,
    reason: `Primary "${requestedProvider}" unavailable, using fallback "${fallbackName}" with model "${equivalentModel}"`,
    wasOriginal: false,
  };
}

// ─── .deck Secret Application ───────────────────────────────────────

/**
 * Apply .deck secrets to process.env and return per-provider env override maps.
 *
 * .deck keys take PRECEDENCE over system env vars (explicit > implicit).
 * This means DECKENT_*_API_KEY values always override any existing env vars.
 *
 * Only the provider-specific key is included in each override entry — the worker
 * process should only receive the key it needs, not the full .deck contents.
 *
 * Per-provider credential isolation is load-bearing (F1-014): each override map
 * carries ONLY its own provider's key, with zero cross-leak — see
 * tests/core/auth-matrix.test.ts.
 *
 * Config-driven providers (F1-012): when `providerDefs` is supplied, every
 * `openai-compatible` definition with an `apiKeyEnv` is ALSO honored — its deck
 * secret `DECKENT_<apiKeyEnv>` is applied to `process.env[apiKeyEnv]` and added
 * to the override map under the provider's name. This mirrors the built-in
 * openai-compat convention exactly (DeepSeek `DEEPSEEK_API_KEY` ↔
 * `DECKENT_DEEPSEEK_API_KEY`), so adding a provider needs NO code change.
 * Omitting `providerDefs` (or passing none) leaves the built-in behavior
 * byte-for-byte unchanged — backward-compat is load-bearing.
 *
 * @param secrets       Key-value pairs loaded from the .deck file
 * @param providerDefs  Optional config-driven provider definitions
 *                      (`config.providers.registry`) — config precedence.
 * @returns  Map of provider name → { ENV_VAR: value } for each provider with a key
 */
export function applyDeckSecretsToEnv(
  secrets: Record<string, string>,
  providerDefs?: ProviderDefinition[],
): Record<string, Record<string, string>> {
  const providerEnvOverrides: Record<string, Record<string, string>> = {};

  // Claude: DECKENT_CLAUDE_API_KEY → ANTHROPIC_API_KEY (.deck takes precedence)
  const claudeKey = secrets['DECKENT_CLAUDE_API_KEY'];
  if (claudeKey && claudeKey.length > 0) {
    process.env['ANTHROPIC_API_KEY'] = claudeKey;
    providerEnvOverrides['claude'] = { ANTHROPIC_API_KEY: claudeKey };
  }

  // Codex: DECKENT_OPENAI_API_KEY → OPENAI_API_KEY (.deck takes precedence)
  const openaiKey = secrets['DECKENT_OPENAI_API_KEY'];
  if (openaiKey && openaiKey.length > 0) {
    process.env['OPENAI_API_KEY'] = openaiKey;
    providerEnvOverrides['codex'] = { OPENAI_API_KEY: openaiKey };
  }

  // Gemini: DECKENT_GOOGLE_API_KEY → GOOGLE_API_KEY (.deck takes precedence)
  const googleKey = secrets['DECKENT_GOOGLE_API_KEY'];
  if (googleKey && googleKey.length > 0) {
    process.env['GOOGLE_API_KEY'] = googleKey;
    providerEnvOverrides['gemini'] = { GOOGLE_API_KEY: googleKey };
  }

  // OpenAI-compatible providers: deck key → canonical env var
  // DeepSeek: DECKENT_DEEPSEEK_API_KEY → DEEPSEEK_API_KEY
  const deepseekKey = secrets['DECKENT_DEEPSEEK_API_KEY'];
  if (deepseekKey && deepseekKey.length > 0) {
    process.env['DEEPSEEK_API_KEY'] = deepseekKey;
    providerEnvOverrides['deepseek'] = { DEEPSEEK_API_KEY: deepseekKey };
  }
  // Qwen: DECKENT_DASHSCOPE_API_KEY → DASHSCOPE_API_KEY
  const dashscopeKey = secrets['DECKENT_DASHSCOPE_API_KEY'];
  if (dashscopeKey && dashscopeKey.length > 0) {
    process.env['DASHSCOPE_API_KEY'] = dashscopeKey;
    providerEnvOverrides['qwen'] = { DASHSCOPE_API_KEY: dashscopeKey };
  }
  // Zhipu/GLM: DECKENT_ZHIPU_API_KEY → ZHIPU_API_KEY
  const zhipuKey = secrets['DECKENT_ZHIPU_API_KEY'];
  if (zhipuKey && zhipuKey.length > 0) {
    process.env['ZHIPU_API_KEY'] = zhipuKey;
    providerEnvOverrides['zhipu'] = { ZHIPU_API_KEY: zhipuKey };
  }

  // Config-driven openai-compatible providers (F1-012, zero-hardcode): apply
  // each declared provider's deck secret (`DECKENT_<apiKeyEnv>`) to its
  // `apiKeyEnv`, keeping per-provider isolation. Applied AFTER built-ins so a
  // config entry takes precedence on collision. CLI-kind entries
  // (claude/codex/gemini/ollama aliases) use session/host auth and are covered
  // by the built-in mappings above — they carry no `apiKeyEnv`, so are skipped.
  if (Array.isArray(providerDefs)) {
    for (const def of providerDefs) {
      const kind = def?.type ?? def?.adapter;
      if (kind !== 'openai-compatible') continue;
      const name = typeof def?.name === 'string' ? def.name.trim() : '';
      const apiKeyEnv = typeof def?.apiKeyEnv === 'string' ? def.apiKeyEnv.trim() : '';
      if (!name || !apiKeyEnv) continue;
      const deckKey = `DECKENT_${apiKeyEnv}`;
      const value = secrets[deckKey];
      if (value && value.length > 0) {
        process.env[apiKeyEnv] = value;
        providerEnvOverrides[name] = { [apiKeyEnv]: value };
      }
    }
  }

  return providerEnvOverrides;
}

// ─── OpenAI-Compatible Candidate Resolution (F1-012) ─────────────────

/** Built-in openai-compat preset keys — mirrors `OPENAI_COMPAT_PRESETS`. */
type BuiltinOpenAICompatPreset = 'deepseek' | 'qwen' | 'glm';

/**
 * A single openai-compatible provider candidate for bootstrap registration.
 * Built-in candidates carry a `preset` (constructed via `OPENAI_COMPAT_PRESETS`);
 * config-driven candidates carry explicit `baseURL` + `models` (constructed via
 * `OpenAICompatibleAdapter`). The two are mutually exclusive.
 */
export interface OpenAICompatCandidate {
  /** Registry name, e.g. 'deepseek' | 'groq'. */
  name: string;
  /** Env var holding the API key — registration is gated on its presence. */
  apiKeyEnv: string;
  /** Built-in preset (set for the byte-for-byte built-in providers). */
  preset?: BuiltinOpenAICompatPreset;
  /** Explicit base URL (set for config-driven providers). */
  baseURL?: string;
  /** Explicit model ids (set for config-driven providers). */
  models?: string[];
}

/**
 * Built-in openai-compatible candidates (byte-for-byte today's behavior).
 * Endpoints/models live in `OPENAI_COMPAT_PRESETS`; here we only need the
 * registry name, the api-key env var (the registration gate), and the preset.
 */
const BUILTIN_OPENAI_COMPAT_CANDIDATES: readonly OpenAICompatCandidate[] = [
  { name: 'deepseek', apiKeyEnv: 'DEEPSEEK_API_KEY',  preset: 'deepseek' },
  { name: 'qwen',     apiKeyEnv: 'DASHSCOPE_API_KEY', preset: 'qwen'     },
  { name: 'zhipu',    apiKeyEnv: 'ZHIPU_API_KEY',     preset: 'glm'      },
];

/**
 * Resolve the full set of openai-compatible provider candidates — the built-in
 * presets (DeepSeek/Qwen/Zhipu) MERGED with config-declared `openai-compatible`
 * providers (F1-012, zero-hardcode). A config entry with the same name as a
 * built-in REPLACES it (config precedence). Incomplete config entries (missing
 * name/apiKeyEnv/baseUrl/models) are omitted here — the config-driven
 * registration block surfaces a friendly skip reason for them.
 *
 * Passing no `providerDefs` returns exactly the built-in candidates, so the
 * bootstrap registration path is byte-for-byte unchanged when no registry is
 * configured (backward-compat is load-bearing).
 */
export function resolveOpenAICompatCandidates(
  providerDefs?: ProviderDefinition[],
): OpenAICompatCandidate[] {
  const merged: OpenAICompatCandidate[] = BUILTIN_OPENAI_COMPAT_CANDIDATES.map(c => ({ ...c }));
  if (Array.isArray(providerDefs)) {
    for (const def of providerDefs) {
      const kind = def?.type ?? def?.adapter;
      if (kind !== 'openai-compatible') continue;
      const name = typeof def?.name === 'string' ? def.name.trim() : '';
      const apiKeyEnv = typeof def?.apiKeyEnv === 'string' ? def.apiKeyEnv.trim() : '';
      const baseURL = typeof def?.baseUrl === 'string' ? def.baseUrl.trim() : '';
      const models = Array.isArray(def?.models) ? def.models : [];
      if (!name || !apiKeyEnv || !baseURL || models.length === 0) continue;
      const candidate: OpenAICompatCandidate = { name, apiKeyEnv, baseURL, models };
      const idx = merged.findIndex(c => c.name === name);
      if (idx >= 0) merged[idx] = candidate; // config precedence over built-in
      else merged.push(candidate);
    }
  }
  return merged;
}

// ─── Bootstrap Providers ────────────────────────────────────────────

/** Result of bootstrapping providers */
export interface BootstrapResult {
  connector: Connector;
  registered: ProviderName[];
  skipped: { name: ProviderName; reason: string }[];
  defaultProvider: ProviderName | null;
  /**
   * Per-provider env overrides loaded from .deck file.
   * Keys are ProviderName values ('claude' | 'codex' | 'gemini').
   * Only contains the provider-specific API key — not the full .deck contents.
   * Intended for passing to SubprocessBackend.spawn() env option.
   */
  providerEnvOverrides: Record<string, Record<string, string>>;
  /**
   * Background model auto-detect promise (F1-AD). Resolves once all probed
   * providers have registered discovered models into the global ModelRegistry.
   * Fire-and-forget: bootstrap does NOT await this — callers that need the
   * detected models available synchronously should await this promise.
   */
  modelAutoDetectPromise: Promise<DetectResult[]>;
  /**
   * DECKBROKER-WIRE (354-006, flag-gated DEFAULT-OFF): host-side credential
   * broker minted over the SAME `.deck` secrets this bootstrap call already
   * loaded, when `config.deck_broker.enabled` is true (and not
   * `auth_mode: 'subscription'`). `null` when the flag is off/unset — the
   * default, and the only behavior before this field existed. Optional so
   * pre-existing `BootstrapResult` object literals (tests/mocks) keep
   * compiling without it.
   *
   * Callers that want per-task, audited, TTL'd credential resolution instead
   * of the ambient `process.env` mutation `providerEnvOverrides` already
   * performs pass this through `ProviderSpawnOptions.deckBroker` at spawn
   * time (see `SubprocessSpawnBackend.spawn`). Forwarding this into the real
   * sprint spawn call sites (`orchestra/sprint-spawner.ts`,
   * `cli/commands/spawn.ts`) is a tracked follow-up — this bootstrap surface
   * plus the subprocess consumption side are the two halves this task closes.
   */
  deckBroker?: DeckBroker | null;
}

/**
 * Detect available providers, create adapters, register them, and set default.
 *
 * 1. Detects which providers are available (CLI, env vars)
 * 2. For each available provider, dynamically imports the adapter factory and registers it
 * 3. Sets default provider based on config.brain_provider (falls back to first available)
 * 4. Logs warnings for configured-but-unavailable providers
 *
 * @param config      Resolved project configuration
 * @param projectRoot Absolute path to the project root
 * @param registry    Provider registry (defaults to global singleton)
 */
export async function bootstrapProviders(
  config: Pick<ResolvedConfig, 'brain_provider' | 'worker_provider' | 'fallback_provider' | 'projectRoot' | 'providers'> & {
    auth_mode?: 'subscription' | 'api' | 'hybrid';
    /**
     * DECKBROKER-WIRE (354-006, flag-gated DEFAULT-OFF, ADR-G-005/G-017 row
     * 422): when `enabled`, bootstrap mints a host-side `DeckBroker`
     * (`core/deck-broker.ts`) over the same `.deck` secrets this function
     * already loads below, returned as `BootstrapResult.deckBroker` for a
     * spawn backend to resolve task-scoped credentials via
     * `resolveForTask` instead of inheriting the ambient `process.env`
     * mutation `applyDeckSecretsToEnv` performs. Unset/false (default) →
     * `deckBroker: null`; the `providerEnvOverrides`/`process.env` path
     * below is entirely unaffected either way (both run side by side).
     * Not yet on `ResolvedConfig` — a caller must pass this explicitly
     * (see this task's plan notes); real `.deckent/config.json` wiring is
     * a tracked follow-up.
     */
    deck_broker?: { enabled?: boolean };
  },
  projectRoot?: string,
  registry: ProviderRegistry = providerRegistry,
  _hooks?: { mr?: ModelRegistry; detectOpts?: DetectAndRegisterOptions },
): Promise<BootstrapResult> {
  const root = projectRoot ?? config.projectRoot;

  // ─── Load .deck secrets for provider auth ────────────────────────
  // Skip .deck loading in subscription mode (subscription uses session auth).
  // When auth_mode is 'api' or 'hybrid', .deck keys take precedence over system env vars.
  let providerEnvOverrides: Record<string, Record<string, string>> = {};
  if (config.auth_mode !== 'subscription') {
    const secrets = loadDeckSecrets(root);
    // F1-012: pass the config-driven registry so a declared openai-compat
    // provider's deck secret (`DECKENT_<apiKeyEnv>`) is applied to its env var.
    providerEnvOverrides = applyDeckSecretsToEnv(secrets, config.providers?.registry);
  }

  // ─── DECKBROKER-WIRE (354-006) — flag-gated, DEFAULT-OFF ──────────
  // Mint a host-side broker over the SAME .deck secrets, gated the same way
  // as providerEnvOverrides above (skip in subscription mode — no .deck read
  // at all). DeckBroker's constructor never throws (loadDeckSecrets never
  // throws), so no try/catch is needed. This is purely additive: it runs
  // alongside the process.env mutation above, never replaces it.
  const deckBroker: DeckBroker | null =
    config.deck_broker?.enabled && config.auth_mode !== 'subscription'
      ? new DeckBroker(root, { providerRegistry: config.providers?.registry })
      : null;

  const detected = await detectAvailableProviders();

  const registered: ProviderName[] = [];
  const skipped: { name: ProviderName; reason: string }[] = [];

  // Adapter factory map — lazy imports to avoid pulling in all providers at startup
  const adapterFactories: Record<ProviderName, () => Promise<ProviderAdapter>> = {
    claude: async () => {
      const { createClaudeAdapter } = await import('../providers/claude.js');
      return createClaudeAdapter(root);
    },
    codex: async () => {
      const { createCodexAdapter } = await import('../providers/codex.js');
      return createCodexAdapter(root);
    },
    gemini: async () => {
      const { createGeminiAdapter } = await import('../providers/gemini.js');
      return createGeminiAdapter(root);
    },
    // Sprint 202 Task 202-001 (F1 Provider Independence): Ollama is now a
    // 1st-class spawn target — bootstrap registers it so `worker_provider=
    // ollama` resolves to a real adapter instead of silently falling back
    // to Claude.
    ollama: async () => {
      const { createOllamaAdapter } = await import('../providers/ollama.js');
      return createOllamaAdapter(root);
    },
  };

  for (const provider of detected) {
    if (!provider.available) {
      skipped.push({
        name: provider.name,
        reason: provider.authMethod === 'none'
          ? `${provider.name} CLI not found or API key not set`
          : `${provider.name} is not available`,
      });
      continue;
    }

    // Skip if already registered (idempotent)
    if (registry.hasProvider(provider.name)) {
      registered.push(provider.name);
      continue;
    }

    try {
      const factory = adapterFactories[provider.name];
      if (factory) {
        const adapter = await factory();
        // Wrap adapter to register under canonical ProviderName if needed
        // (e.g., ClaudeAdapter.name is 'claude-tmux' but ProviderName is 'claude')
        const registrationAdapter = adapter.name === provider.name
          ? adapter
          : Object.create(adapter, { name: { value: provider.name, writable: false } }) as ProviderAdapter;
        registry.registerProvider(registrationAdapter);
        registered.push(provider.name);
      }
    } catch {
      skipped.push({
        name: provider.name,
        reason: `Failed to create adapter for ${provider.name}`,
      });
    }
  }

  // ─── Bootstrap OpenAI-compatible providers (built-in + config-driven) ──
  // Built-in DeepSeek/Qwen/Zhipu MERGED with config-declared openai-compatible
  // providers (F1-012, zero-hardcode — config precedence). Register an adapter
  // for each candidate whose API key is present in process.env (either from
  // .deck via applyDeckSecretsToEnv above or from the host env directly). No key
  // → skip gracefully (ADR-014). A config-declared provider WITHOUT its key here
  // is still registered (unconditionally) by the config-driven block below, so
  // `worker_provider=<name>` resolves and fails honestly at send-time rather
  // than silently falling back — hence config candidates skip silently here.
  const openaiCompatCandidates = resolveOpenAICompatCandidates(config.providers?.registry);
  const anyOpenAICompatKey = openaiCompatCandidates.some(c => Boolean(process.env[c.apiKeyEnv]));
  if (anyOpenAICompatKey) {
    const { OPENAI_COMPAT_PRESETS, OpenAICompatibleAdapter } = await import('../providers/openai-compatible.js');
    for (const candidate of openaiCompatCandidates) {
      const apiKey = process.env[candidate.apiKeyEnv];
      if (!apiKey) {
        // Built-in presets keep today's friendly skip reason; config-declared
        // providers are registered (unconditionally) by the config block below.
        if (candidate.preset) {
          skipped.push({ name: candidate.name as unknown as ProviderName, reason: `${candidate.apiKeyEnv} not set` });
        }
        continue;
      }
      if (registry.hasProvider(candidate.name)) {
        registered.push(candidate.name as unknown as ProviderName);
        continue;
      }
      try {
        const adapter = candidate.preset
          ? OPENAI_COMPAT_PRESETS[candidate.preset]()
          : new OpenAICompatibleAdapter({
              name: candidate.name,
              baseURL: candidate.baseURL!,
              apiKeyEnv: candidate.apiKeyEnv,
              models: candidate.models!,
            });
        registry.registerProvider(adapter);
        registered.push(candidate.name as unknown as ProviderName);
      } catch {
        skipped.push({ name: candidate.name as unknown as ProviderName, reason: `Failed to create OpenAICompatibleAdapter for ${candidate.name}` });
      }
    }
  }

  // ─── Bootstrap Bedrock (F1-015) — AWS-creds-gated ──────────────────────
  // Register BedrockAdapter when AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY +
  // AWS_REGION are all present. No AWS SDK — hand-rolled SigV4 (ADR-010).
  const hasBedrockCreds =
    Boolean(process.env['AWS_ACCESS_KEY_ID']) &&
    Boolean(process.env['AWS_SECRET_ACCESS_KEY']) &&
    Boolean(process.env['AWS_REGION'] ?? process.env['AWS_DEFAULT_REGION']);
  if (hasBedrockCreds && !registry.hasProvider('bedrock')) {
    try {
      const { createBedrockAdapter } = await import('../providers/bedrock.js');
      const bedrockAdapter = createBedrockAdapter(root);
      registry.registerProvider(bedrockAdapter);
      registered.push('bedrock' as ProviderName);
    } catch {
      skipped.push({ name: 'bedrock' as ProviderName, reason: 'Failed to create BedrockAdapter' });
    }
  }

  // ─── Config-driven provider registry (F1-012, zero-hardcode) ───────────
  // When `config.providers.registry` is present, register each declared
  // provider generically — adding a provider needs NO code change. Absent
  // (or empty) → built-in claude/codex/gemini/ollama behavior is unchanged
  // (backward-safe default). Invalid entries are skipped with a friendly
  // reason and NEVER throw mid-bootstrap.
  const providerRegistryDefs: ProviderDefinition[] | undefined = config.providers?.registry;
  if (Array.isArray(providerRegistryDefs)) {
    for (const def of providerRegistryDefs) {
      const name = typeof def?.name === 'string' ? def.name.trim() : '';
      const kind = def?.type ?? def?.adapter;
      if (!validateProviderName(name)) {
        skipped.push({ name: 'unknown' as ProviderName, reason: 'provider registry entry is missing a non-empty name' });
        continue;
      }
      if (!kind) {
        skipped.push({ name: name as ProviderName, reason: `provider "${name}" registry entry is missing type/adapter` });
        continue;
      }
      // Idempotent — a name already registered (built-in or earlier entry) wins.
      if (registry.hasProvider(name)) {
        registered.push(name as ProviderName);
        continue;
      }
      try {
        let adapter: ProviderAdapter | null = null;
        if (kind === 'openai-compatible') {
          if (!def.baseUrl || !def.apiKeyEnv || !Array.isArray(def.models) || def.models.length === 0) {
            skipped.push({ name: name as ProviderName, reason: `openai-compatible provider "${name}" needs baseUrl, apiKeyEnv and a non-empty models list` });
            continue;
          }
          const { OpenAICompatibleAdapter } = await import('../providers/openai-compatible.js');
          adapter = new OpenAICompatibleAdapter({
            name,
            baseURL: def.baseUrl,
            apiKeyEnv: def.apiKeyEnv,
            models: def.models,
          });
        } else {
          // CLI kind (claude/codex/gemini/ollama) — alias a built-in adapter
          // under the custom registry name via the same factory map used above.
          const factory = adapterFactories[kind as ProviderName];
          if (!factory) {
            skipped.push({ name: name as ProviderName, reason: `unknown adapter type "${kind}" for provider "${name}"` });
            continue;
          }
          const built = await factory();
          adapter = built.name === name
            ? built
            : Object.create(built, { name: { value: name, writable: false } }) as ProviderAdapter;
        }
        registry.registerProvider(adapter);
        registered.push(name as ProviderName);
      } catch {
        skipped.push({ name: name as ProviderName, reason: `Failed to create adapter for provider "${name}"` });
      }
    }
  }

  // Collapse duplicate registrations (order-preserving): a config-driven
  // openai-compat provider whose API key is present registers via BOTH the
  // candidate loop AND the config-driven block (idempotent) — keep a single
  // entry so `registered[0]`, the Connector mirror, and the return value are
  // clean. No-op for the built-in-only path.
  if (registered.length > 1) {
    const unique = Array.from(new Set(registered));
    if (unique.length !== registered.length) {
      registered.length = 0;
      registered.push(...unique);
    }
  }

  // Set default provider based on config
  // Sprint 202 Task 202-003: when brain_provider is unset, prefer the first
  // registered provider so a pure-Ollama config resolves to Ollama rather than
  // silently falling through to a Claude literal that may not be registered.
  let defaultProvider: ProviderName | null = null;
  const preferredDefault =
    config.brain_provider ?? (registered[0] ?? 'claude');

  if (registry.hasProvider(preferredDefault)) {
    registry.setDefault(preferredDefault);
    defaultProvider = preferredDefault;
  } else if (registered.length > 0) {
    // Configured provider unavailable — warn and fall back to first registered
    const fallback = registered[0]!;
    registry.setDefault(fallback);
    defaultProvider = fallback;

    if (config.brain_provider) {
      skipped.push({
        name: config.brain_provider,
        reason: `Configured brain_provider "${config.brain_provider}" is unavailable, using "${fallback}" instead`,
      });
    }
  }

  // ─── Wire Connector ────────────────────────────────────────────────
  const connector = new Connector();

  // Mirror all registered providers into the Connector
  for (const providerName of registered) {
    if (registry.hasProvider(providerName)) {
      connector.registerProvider(providerName, registry.getProvider(providerName));
    }
  }

  // Run health check — log warnings for unhealthy providers but don't remove them
  try {
    const healthResults = await connector.healthCheck();
    for (const hr of healthResults) {
      if (!hr.available || hr.authStatus !== 'ok') {
        // Unhealthy but still registered — caller can inspect connector.healthCheck() later
        // We intentionally do NOT unregister unhealthy providers
      }
    }
  } catch {
    // Health check failure should not block bootstrap
  }

  // ─── Model Auto-Detect (F1-AD) — fire-and-forget, best-effort ─────────────
  // Probe available provider CLIs and register any discovered model-ids in
  // the global ModelRegistry (parametric — no code change needed for new models).
  // Does NOT block bootstrap: the promise is returned for callers that need it.
  const mr = _hooks?.mr ?? globalModelRegistry;
  const modelAutoDetectPromise = detectAndRegisterModels(
    mr,
    { timeoutMs: 5_000, ...(_hooks?.detectOpts ?? {}) },
  ).catch(() => [] as DetectResult[]);

  return { connector, registered, skipped, defaultProvider, providerEnvOverrides, modelAutoDetectPromise, deckBroker };
}
