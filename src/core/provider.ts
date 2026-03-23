import { spawnSync } from 'node:child_process';
import type { ModelType, ProviderName, UsageMetrics } from './types.js';
import type { ResolvedConfig } from './config-types.js';
import { PROVIDER_MODEL_MAP } from './task-types.js';
import { getEquivalentModel } from './model-equivalence.js';

// ─── Provider Spawn Options ──────────────────────────────────────────
export interface ProviderSpawnOptions {
  allowedTools?: string;
  autoApprove?: boolean;
  projectDir?: string;
  logPath?: string;
}

// ─── Provider Worker Info ────────────────────────────────────────────
export interface ProviderWorkerInfo {
  taskId: string;
  model: ModelType;
  spawnedAt: string;
  pid?: number;
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
   * Check current API / subscription usage.
   */
  checkUsage(): Promise<UsageMetrics>;

  /**
   * Check whether the provider is available in the current environment.
   */
  isAvailable(): Promise<boolean>;

  /**
   * Build the shell command string that this provider would use to invoke the AI.
   * Equivalent to tmux.ts buildClaudeCommand(). Used for debugging/dry-run display.
   * @param model         Model to use
   * @param promptPath    Path to the prompt file (stdin redirection)
   * @param opts          Spawn options (allowedTools, autoApprove)
   */
  buildCommand(model: ModelType, promptPath: string, opts?: Pick<ProviderSpawnOptions, 'allowedTools' | 'autoApprove'>): string;

  /**
   * Build CLI command + args for planner invocations.
   * Each provider can override this to produce provider-specific args
   * instead of the default Claude-shaped args.
   * @param prompt  The planner prompt text
   * @param model   Model to use
   * @returns command (CLI binary) and args array
   */
  buildPlannerCommand?(prompt: string, model: ModelType): { command: string; args: string[] };
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
 * Try to detect a CLI tool version by running `<cmd> --version`.
 * Returns the version string on success, undefined on failure.
 * @internal
 */
export function detectCliVersion(cmd: string, args: string[] = ['--version']): string | undefined {
  try {
    const result = spawnSync(cmd, args, { encoding: 'utf-8', timeout: 5000 });
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
 * Checks `codex --version` CLI and OPENAI_API_KEY env variable.
 * Both CLI and API key are needed for full availability.
 */
function detectCodex(): DetectedProvider {
  const version = detectCliVersion('codex');
  const hasApiKey = typeof process.env['OPENAI_API_KEY'] === 'string' && process.env['OPENAI_API_KEY'].length > 0;
  const available = version !== undefined && hasApiKey;
  let authMethod: DetectedProvider['authMethod'] = 'none';
  if (hasApiKey) {
    authMethod = 'api_key';
  } else if (version !== undefined) {
    // CLI found but no API key
    authMethod = 'none';
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
 * Detect Gemini availability.
 * No CLI yet — checks GOOGLE_API_KEY env variable only.
 */
function detectGemini(): DetectedProvider {
  const hasApiKey = typeof process.env['GOOGLE_API_KEY'] === 'string' && process.env['GOOGLE_API_KEY'].length > 0;
  return {
    name: 'gemini',
    available: hasApiKey,
    version: undefined,
    authMethod: hasApiKey ? 'api_key' : 'none',
    models: [...PROVIDER_MODEL_MAP.gemini],
  };
}

/**
 * Detect all known providers and their availability.
 * For each provider, checks CLI availability and/or API key presence.
 */
export async function detectAvailableProviders(): Promise<DetectedProvider[]> {
  return [
    detectClaude(),
    detectCodex(),
    detectGemini(),
  ];
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

// ─── Bootstrap Providers ────────────────────────────────────────────

/** Result of bootstrapping providers */
export interface BootstrapResult {
  registered: ProviderName[];
  skipped: { name: ProviderName; reason: string }[];
  defaultProvider: ProviderName | null;
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
  config: Pick<ResolvedConfig, 'brain_provider' | 'worker_provider' | 'fallback_provider' | 'projectRoot'>,
  projectRoot?: string,
  registry: ProviderRegistry = providerRegistry,
): Promise<BootstrapResult> {
  const root = projectRoot ?? config.projectRoot;
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

  // Set default provider based on config
  let defaultProvider: ProviderName | null = null;
  const preferredDefault = config.brain_provider ?? 'claude';

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

  return { registered, skipped, defaultProvider };
}
