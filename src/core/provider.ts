import type { ModelType, UsageMetrics } from './types.js';

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
