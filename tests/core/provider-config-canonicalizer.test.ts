import { describe, expect, it } from 'vitest';
import {
  canonicalizeProviderConfigAliases,
  ProviderConfigAliasConflictError,
} from '../../src/core/provider-config-canonicalizer.js';

const aliases = [
  ['brain_provider', 'brain', 'claude'],
  ['worker_provider', 'worker', 'codex'],
  ['fallback_provider', 'fallback', 'gemini'],
  ['provider_overrides', 'overrides', { docs: 'gemini', tests: 'codex' }],
] as const;

describe('canonicalizeProviderConfigAliases', () => {
  it.each(aliases)('promotes flat-only %s to providers.%s', (flatKey, groupedKey, value) => {
    const input = { [flatKey]: value, untouched: true };
    const result = canonicalizeProviderConfigAliases(input, 'project');

    expect(result.config[flatKey]).toBeUndefined();
    expect((result.config['providers'] as Record<string, unknown>)[groupedKey]).toEqual(value);
    expect(result.config['untouched']).toBe(true);
    expect(input).toHaveProperty(flatKey);
    expect(result.changes).toEqual([
      expect.objectContaining({ kind: 'promoted', flatKey, groupedKey: `providers.${groupedKey}` }),
    ]);
  });

  it.each(aliases)('deduplicates equal dual-form %s/providers.%s', (flatKey, groupedKey, value) => {
    const input = { [flatKey]: value, providers: { [groupedKey]: structuredClone(value) } };
    const result = canonicalizeProviderConfigAliases(input, 'global');

    expect(result.config[flatKey]).toBeUndefined();
    expect((result.config['providers'] as Record<string, unknown>)[groupedKey]).toEqual(value);
    expect(result.changes[0]?.kind).toBe('deduplicated');
  });

  it('compares provider_overrides independent of object key order', () => {
    const result = canonicalizeProviderConfigAliases({
      provider_overrides: { docs: 'gemini', tests: 'codex' },
      providers: { overrides: { tests: 'codex', docs: 'gemini' } },
    }, 'partial');

    expect(result.changes[0]?.kind).toBe('deduplicated');
  });

  it.each(aliases)('fails loudly for differing %s/providers.%s', (flatKey, groupedKey, value) => {
    const groupedValue = groupedKey === 'overrides' ? { docs: 'claude' } : 'ollama';
    const input = { [flatKey]: value, providers: { [groupedKey]: groupedValue } };

    expect(() => canonicalizeProviderConfigAliases(input, 'project')).toThrow(
      ProviderConfigAliasConflictError,
    );
    try {
      canonicalizeProviderConfigAliases(input, 'project');
    } catch (error) {
      const conflict = (error as ProviderConfigAliasConflictError).conflict;
      expect(conflict).toMatchObject({
        layer: 'project',
        flatKey,
        groupedKey: `providers.${groupedKey}`,
        flatValue: value,
        groupedValue,
      });
    }
    expect(input).toHaveProperty(flatKey);
  });

  it('does not partially canonicalize earlier slots when a later slot conflicts', () => {
    const input = {
      brain_provider: 'claude',
      worker_provider: 'codex',
      providers: { worker: 'gemini' },
    };
    const before = structuredClone(input);

    expect(() => canonicalizeProviderConfigAliases(input, 'migration')).toThrow(
      ProviderConfigAliasConflictError,
    );
    expect(input).toEqual(before);
  });

  it('leaves an invalid providers shape for the config validator', () => {
    const input = { brain_provider: 'codex', providers: 'invalid' };
    const result = canonicalizeProviderConfigAliases(input, 'partial');
    expect(result.config).toEqual(input);
    expect(result.changes).toEqual([]);
  });
});
