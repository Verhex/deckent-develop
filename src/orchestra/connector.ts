// ═══ orchestra/connector.ts — MCP Connection Manager ═════════════════
//
// Provider lifecycle management with lazy initialization and health checks.
// Thread-safe: no race conditions on concurrent access.

import type { ProviderAdapter } from '../core/provider.js';
import type { ProviderName } from '../core/task-types.js';

// ─── Auth Environment Variable Map ──────────────────────────────────
const AUTH_ENV_VARS: Record<ProviderName, string | null> = {
  claude: null,          // session auth — no env var needed
  codex: 'OPENAI_API_KEY',
  gemini: 'GOOGLE_API_KEY',
};

/** Health check result for a single provider */
export interface HealthCheckResult {
  provider: ProviderName;
  available: boolean;
  authStatus: 'ok' | 'missing' | 'expired';
  cliVersion: string | null;
  error: string | null;
}

/**
 * MCP connection manager — handles provider lifecycle.
 * Lazy initialization: providers started only when first needed.
 * Thread-safe: no race conditions on concurrent access.
 */
export class Connector {
  private readonly providers = new Map<ProviderName, ProviderAdapter>();
  private readonly healthCache = new Map<ProviderName, HealthCheckResult>();

  /**
   * Register a provider adapter.
   * @param name    Canonical provider name
   * @param adapter Provider adapter instance implementing ProviderAdapter
   */
  registerProvider(name: ProviderName, adapter: ProviderAdapter): void {
    this.providers.set(name, adapter);
    // Invalidate cached health for this provider
    this.healthCache.delete(name);
  }

  /**
   * Get a registered provider adapter.
   * @param name Provider name to look up
   * @returns The adapter if registered, null otherwise
   */
  getProvider(name: ProviderName): ProviderAdapter | null {
    return this.providers.get(name) ?? null;
  }

  /**
   * Run health check on one or all providers.
   * When called without arguments, checks all registered providers.
   * When called with a provider name, checks only that provider.
   * @param name Optional provider name to check (omit for all)
   * @returns Array of health check results
   */
  async healthCheck(name?: ProviderName): Promise<HealthCheckResult[]> {
    const targets: ProviderName[] = name
      ? [name]
      : Array.from(this.providers.keys());

    const results: HealthCheckResult[] = [];

    for (const providerName of targets) {
      const adapter = this.providers.get(providerName);

      if (!adapter) {
        results.push({
          provider: providerName,
          available: false,
          authStatus: 'missing',
          cliVersion: null,
          error: `Provider "${providerName}" is not registered`,
        });
        continue;
      }

      let available = false;
      let error: string | null = null;

      try {
        available = await adapter.isAvailable();
      } catch (err: unknown) {
        available = false;
        error = err instanceof Error ? err.message : String(err);
      }

      const authStatus = this.checkAuthStatus(providerName);

      const result: HealthCheckResult = {
        provider: providerName,
        available,
        authStatus,
        cliVersion: null,
        error,
      };

      this.healthCache.set(providerName, result);
      results.push(result);
    }

    return results;
  }

  /**
   * Get list of available (registered + healthy) provider names.
   * Uses cached health results if available; call healthCheck() first for fresh data.
   * @returns Array of provider names that are registered
   */
  getAvailableProviders(): ProviderName[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Check if a specific provider is registered and ready.
   * A provider is "ready" if it has been registered via registerProvider().
   * @param name Provider name to check
   * @returns true if the provider is registered
   */
  isProviderReady(name: ProviderName): boolean {
    return this.providers.has(name);
  }

  /**
   * Unregister a provider and clear its health cache.
   * @param name Provider name to remove
   * @returns true if the provider was removed, false if not found
   */
  unregisterProvider(name: ProviderName): boolean {
    this.healthCache.delete(name);
    return this.providers.delete(name);
  }

  /**
   * Clear all registered providers and health cache.
   * Useful for testing.
   */
  clear(): void {
    this.providers.clear();
    this.healthCache.clear();
  }

  /** Number of registered providers */
  get size(): number {
    return this.providers.size;
  }

  /**
   * Check auth status for a provider by inspecting environment variables.
   * @param name Provider name
   * @returns 'ok' if auth is configured, 'missing' if not
   * @internal
   */
  private checkAuthStatus(name: ProviderName): 'ok' | 'missing' | 'expired' {
    const envVar = AUTH_ENV_VARS[name];

    // claude uses session auth — always 'ok' if no env var needed
    if (envVar === null) {
      return 'ok';
    }

    const value = process.env[envVar];
    if (typeof value === 'string' && value.length > 0) {
      return 'ok';
    }

    return 'missing';
  }
}
