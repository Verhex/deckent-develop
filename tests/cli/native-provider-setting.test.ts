// tests/cli/native-provider-setting.test.ts
// ═══ TERMINAL-PROVIDER-VOCAB-001 — native_provider is validated; provider options derive ═══
//
// Owner decision (2026-09-03): `native_provider` (the native transport pin the
// picker's "save as default" writes) is validated against the native provider
// names — every transport the Terminal can pick is accepted, a typo is refused
// — and the provider option lists in CONFIG_METADATA derive from the
// validation authority instead of a narrower literal list (KANUN 10: one
// source). The native names live in core so config.ts and the REPL share one
// array. Hermetic.

import { describe, it, expect } from 'vitest';
import { NATIVE_PROVIDER_NAMES } from '../../src/core/native-provider-names.js';
import { NATIVE_PROVIDER_NAMES as FROM_TRANSPORT } from '../../src/cli/repl/native-transport.js';
import { CONFIG_METADATA, VALID_PROVIDERS_ALL, validatePartialConfig, ConfigValidationError } from '../../src/core/config.js';
import type { DeckentConfig } from '../../src/core/types.js';

describe('native provider names', () => {
  it('the REPL re-exports the core array (one identity, no copy)', () => {
    expect(FROM_TRANSPORT).toBe(NATIVE_PROVIDER_NAMES);
  });
});

describe('native_provider validation', () => {
  const partial = (native_provider: unknown): Partial<DeckentConfig> => ({ native_provider } as Partial<DeckentConfig>);
  it('accepts every native transport the picker can save as default', () => {
    for (const name of NATIVE_PROVIDER_NAMES) expect(() => validatePartialConfig(partial(name)), name).not.toThrow();
  });
  it('refuses a typo or a non-string with a message naming the valid values', () => {
    expect(() => validatePartialConfig(partial('bogus'))).toThrow(ConfigValidationError);
    expect(() => validatePartialConfig(partial(42))).toThrow(ConfigValidationError);
    try { validatePartialConfig(partial('bogus')); } catch (err) {
      expect(String((err as Error).message)).toContain('native_provider');
      expect(String((err as Error).message)).toContain('local-llm');
    }
  });
});

describe('provider option lists derive from the validation authority', () => {
  it('native_provider has metadata with the native names as options', () => {
    const meta = CONFIG_METADATA['native_provider'];
    expect(meta).toBeDefined();
    expect(meta!.options).toEqual([...NATIVE_PROVIDER_NAMES]);
    expect(meta!.category).toBe('Provider');
    expect(meta!.descriptionTr?.length ?? 0).toBeGreaterThan(0);
  });
  it('brain/chat/worker/fallback provider options equal VALID_PROVIDERS_ALL and their type strings name every provider', () => {
    for (const key of ['brain_provider', 'chat_provider', 'worker_provider', 'fallback_provider']) {
      const meta = CONFIG_METADATA[key];
      expect(meta, key).toBeDefined();
      expect(meta!.options, key).toEqual([...VALID_PROVIDERS_ALL]);
      for (const p of VALID_PROVIDERS_ALL) expect(meta!.type, `${key}.type`).toContain(`'${p}'`);
    }
  });
});
