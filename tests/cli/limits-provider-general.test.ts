import { describe, expect, it, vi } from 'vitest';
import type { ResolvedConfig } from '../../src/core/types.js';
import {
  configuredProviders,
  resolveConfiguredAuthenticatedProviders,
} from '../../src/cli/commands/limits.js';

function config(overrides: Record<string, unknown> = {}): ResolvedConfig {
  return {
    brain_provider: 'claude',
    worker_provider: 'codex',
    fallback_provider: 'cursor',
    provider_overrides: {},
    providers: { registry: [] },
    ...overrides,
  } as unknown as ResolvedConfig;
}

describe('provider-general limits resolution', () => {
  it('deduplicates providers from every effective-config provider slot', () => {
    const resolved = config({
      provider_overrides: { review: 'cursor' },
      providers: {
        brain: 'claude',
        overrides: { docs: 'codex' },
        registry: [{ name: 'custom', authMode: 'api_key' }],
      },
    });
    expect(configuredProviders(resolved)).toEqual(['claude', 'codex', 'cursor', 'custom']);
  });

  it('keeps only authenticated configured providers and honors all filters', async () => {
    const auth = vi.fn(async (provider: string) => ({
      state: provider === 'codex' ? 'logged-out' as const : 'logged-in' as const,
      authenticated: provider !== 'codex',
    }));
    const resolved = config();
    await expect(resolveConfiguredAuthenticatedProviders(resolved, {}, auth))
      .resolves.toEqual(['claude', 'cursor']);
    await expect(resolveConfiguredAuthenticatedProviders(resolved, { claude: true }, auth))
      .resolves.toEqual(['claude']);
    await expect(resolveConfiguredAuthenticatedProviders(resolved, { codex: true }, auth))
      .resolves.toEqual([]);
    await expect(resolveConfiguredAuthenticatedProviders(resolved, { cursor: true }, auth))
      .resolves.toEqual(['cursor']);
  });
});
