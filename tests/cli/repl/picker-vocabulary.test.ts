// tests/cli/repl/picker-vocabulary.test.ts
// ═══ TERMINAL-PROVIDER-VOCAB-001 — one provider vocabulary across surfaces ═══
//
// Owner decision (2026-09-03): the readline surface listed registry owners
// (claude / codex / gemini) while the native surface listed transports
// (claude / openai / ollama …) — two vocabularies for the same thing. Now a
// row is LABELED by its registry owner and the transport is a FACT ("via host
// CLI" / "via API" / "local"); the row's id stays the value the switch seam
// consumes, and the resolver still accepts either word. Hermetic.

import { describe, it, expect } from 'vitest';
import { buildModelPickerSpec, buildProviderPickerSpec, type PickerSpecContext } from '../../../src/cli/repl/picker-specs.js';
import { resolvePickerArg } from '../../../src/cli/repl/picker.js';
import { nativeProviderVia, hostProviderVia, NATIVE_PROVIDER_NAMES } from '../../../src/core/native-provider-names.js';
import { AUTH_PROBE_PROVIDERS } from '../../../src/core/provider-auth-probe.js';
import type { ModelActivationPolicy } from '../../../src/core/model-activation-store.js';

const policy: ModelActivationPolicy = {
  isExecutable: () => true,
  providerMode: () => 'implicit-active',
  explicitProviders: new Set(),
  activeModels: [],
  snapshotDigest: 'f'.repeat(64),
};

const base = (over: Partial<PickerSpecContext> = {}): PickerSpecContext => ({
  providers: ['claude', 'openai', 'ollama'],
  candidatesFor: (provider) => (provider === 'openai'
    ? [{ provider, id: 'gpt-x', definition: null }]
    : [{ provider, id: `${provider}-model`, definition: null }]),
  policy,
  current: { provider: 'openai', model: 'gpt-x' },
  availability: () => ({ ok: true }),
  transport: (p) => ({ owner: p === 'openai' ? 'codex' : p, via: p === 'ollama' ? 'local' : 'api' }),
  viaFact: (via) => `via:${via}`,
  ...over,
});

describe('provider rows', () => {
  it('are labeled by the registry owner, keep the transport id, and carry the via fact first', () => {
    const spec = buildProviderPickerSpec(base());
    expect(spec.candidates.map((c) => c.id)).toEqual(['openai', 'claude', 'ollama']);
    expect(spec.candidates.map((c) => c.label)).toEqual(['codex', 'claude', 'ollama']);
    expect(spec.candidates[0]!.facts[0]).toEqual({ key: 'via', value: 'via:api' });
    expect(spec.candidates[2]!.facts[0]).toEqual({ key: 'via', value: 'via:local' });
    expect(spec.candidates[0]!.facts.some((f) => f.key === 'models')).toBe(true);
  });
  it('the typed form accepts the owner word or the transport id', () => {
    const spec = buildProviderPickerSpec(base());
    const byLabel = resolvePickerArg('codex', spec.candidates);
    const byId = resolvePickerArg('openai', spec.candidates);
    expect(byLabel.kind === 'found' && byLabel.candidate.id).toBe('openai');
    expect(byId.kind === 'found' && byId.candidate.id).toBe('openai');
  });
  it('without a transport seam the label is the id and no via fact is invented', () => {
    const spec = buildProviderPickerSpec(base({ transport: undefined, viaFact: undefined }));
    expect(spec.candidates.map((c) => c.label)).toEqual(['openai', 'claude', 'ollama']);
    expect(spec.candidates.every((c) => !c.facts.some((f) => f.key === 'via'))).toBe(true);
  });
});

describe('model rows', () => {
  it('name the registry owner as the provider fact and add the via fact', () => {
    const spec = buildModelPickerSpec(base());
    const gpt = spec.candidates.find((c) => c.id === 'gpt-x')!;
    expect(gpt.facts).toEqual(expect.arrayContaining([{ key: 'provider', value: 'codex' }, { key: 'via', value: 'via:api' }]));
    const local = spec.candidates.find((c) => c.id === 'ollama-model')!;
    expect(local.facts).toEqual(expect.arrayContaining([{ key: 'provider', value: 'ollama' }, { key: 'via', value: 'via:local' }]));
  });
});

describe('transport kinds (SSOT beside the native provider names)', () => {
  it('every native provider has a via kind; ollama and local-llm are local, the rest API', () => {
    for (const name of NATIVE_PROVIDER_NAMES) expect(['api', 'local']).toContain(nativeProviderVia(name));
    expect(nativeProviderVia('ollama')).toBe('local');
    expect(nativeProviderVia('local-llm')).toBe('local');
    expect(nativeProviderVia('claude')).toBe('api');
    expect(nativeProviderVia('openai')).toBe('api');
  });
  it('host surface: the auth-probe (subscription CLI) providers are host-cli, native locals stay local, others API', () => {
    for (const p of AUTH_PROBE_PROVIDERS) expect(hostProviderVia(p)).toBe('host-cli');
    expect(hostProviderVia('ollama')).toBe('local');
    expect(hostProviderVia('openrouter')).toBe('api');
  });
});
