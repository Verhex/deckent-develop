// tests/cli/repl/picker-specs.test.ts
// ═══ TERMINAL-PICKER-002 (P15b) — /model and /provider candidate specs ═══════
//
// The picker's candidates are DATA: registry ∩ owner activation policy ∩
// native-transport availability (DECKENT-DESKTOP-TERMINAL-RECONCILIATION L204:
// "model selection only inside entitlement/reachability/policy evidence").
// Inactive models stay visible with a typed blocked code (owner decision 4:
// no hiding, no silent substitution); a provider whose credential is missing
// carries the localized ProviderError in-row BEFORE Enter. No model/provider
// literal drives these builders — the registry, the preset metadata and the
// injected policy do. Hermetic.

import { describe, it, expect } from 'vitest';
import { buildModelPickerSpec, buildProviderPickerSpec, type PickerSpecContext } from '../../../src/cli/repl/picker-specs.js';
import { listNativeModelCandidates, registryProviderFor, NATIVE_PROVIDER_NAMES } from '../../../src/cli/repl/native-transport.js';
import { modelRegistry } from '../../../src/core/model-registry.js';
import { OLLAMA_BUILTIN_MODELS } from '../../../src/core/ollama-models.js';
import { OPENAI_COMPAT_PRESET_META } from '../../../src/providers/openai-compatible.js';
import type { ModelActivationPolicy } from '../../../src/core/model-activation-store.js';
import type { ModelDefinition } from '../../../src/core/model-registry-types.js';

/** Fixture metadata — only the fields the spec builders read. */
const def = (tier: string, contextWindow: number, status: string): ModelDefinition =>
  ({ tier, contextWindow, status } as unknown as ModelDefinition);

function policyOf(inactive: readonly string[], explicit: readonly string[] = []): ModelActivationPolicy {
  return {
    isExecutable: (provider, modelId) => !inactive.includes(`${provider}/${modelId}`) && (!explicit.includes(provider) || inactive.length === 0),
    providerMode: (provider) => (explicit.includes(provider) ? 'explicit-active' : 'implicit-active'),
    explicitProviders: new Set(explicit),
    activeModels: [],
    snapshotDigest: 'f'.repeat(64),
  };
}

const ctx = (over: Partial<PickerSpecContext> = {}): PickerSpecContext => ({
  providers: ['claude', 'openai', 'ollama'],
  candidatesFor: (provider) => {
    if (provider === 'claude') return [
      { provider: 'claude', id: 'claude-a', definition: def('premium', 200_000, 'ga') },
      { provider: 'claude', id: 'claude-b', definition: def('standard', 200_000, 'preview') },
    ];
    if (provider === 'openai') return [{ provider: 'openai', id: 'gpt-x', definition: def('premium', 400_000, 'ga') }];
    if (provider === 'ollama') return [{ provider: 'ollama', id: 'qwen:8b', definition: null }];
    return [];
  },
  policy: policyOf([]),
  current: { provider: 'openai', model: 'gpt-x' },
  availability: (provider) => (provider === 'claude' ? { ok: false, code: 'MISSING_CREDENTIAL', detail: 'claude needs an API key' } : { ok: true }),
  ...over,
});

describe('buildModelPickerSpec', () => {
  it('lists the current provider first, marks the current model, carries tier/ctx/status facts, offers session+default', () => {
    const spec = buildModelPickerSpec(ctx());
    expect(spec.kind).toBe('model');
    expect(spec.scopes).toEqual(['session', 'default']);
    expect(spec.initialId).toBe('gpt-x');
    expect(spec.candidates.map((c) => c.id)).toEqual(['gpt-x', 'claude-a', 'claude-b', 'qwen:8b']);
    const current = spec.candidates[0]!;
    expect(current.state).toBe('current');
    expect(current.facts.map((f) => f.value)).toEqual(['openai', 'premium', '400k', 'ga']);
    expect(spec.candidates[3]!.facts.map((f) => f.value)).toEqual(['ollama']);
  });

  it('a provider without a credential blocks its models with the localized detail in-row', () => {
    const spec = buildModelPickerSpec(ctx());
    const a = spec.candidates.find((c) => c.id === 'claude-a')!;
    expect(a).toMatchObject({ state: 'blocked', blockedCode: 'MISSING_CREDENTIAL', detail: 'claude needs an API key' });
  });

  it('owner policy: an inactive model is visible and blocked with the typed code; explicit-active providers get the set code', () => {
    const inactive = buildModelPickerSpec(ctx({ policy: policyOf(['ollama/qwen:8b']) }));
    expect(inactive.candidates.find((c) => c.id === 'qwen:8b')).toMatchObject({ state: 'blocked', blockedCode: 'MODEL_INACTIVE' });
    const explicit = buildModelPickerSpec(ctx({ policy: policyOf(['ollama/qwen:8b'], ['ollama']) }));
    expect(explicit.candidates.find((c) => c.id === 'qwen:8b')).toMatchObject({ state: 'blocked', blockedCode: 'MODEL_NOT_IN_ACTIVE_SET' });
    // the current model is never demoted by policy display (it is what serves the turns)
    expect(buildModelPickerSpec(ctx({ policy: policyOf(['openai/gpt-x']) })).candidates[0]!.state).toBe('current');
  });

  it('policy lookups use the REGISTRY provider name for native providers that map to one (openai → codex)', () => {
    const spec = buildModelPickerSpec(ctx({ policy: policyOf(['codex/gpt-x']), current: { provider: 'claude', model: null } }));
    expect(spec.candidates.find((c) => c.id === 'gpt-x')).toMatchObject({ state: 'blocked', blockedCode: 'MODEL_INACTIVE' });
  });
});

describe('buildProviderPickerSpec', () => {
  it('one row per provider with its model count, current marked, missing credential blocked in-row', () => {
    const spec = buildProviderPickerSpec(ctx());
    expect(spec.kind).toBe('provider');
    expect(spec.initialId).toBe('openai');
    expect(spec.candidates.map((c) => [c.id, c.state])).toEqual([['openai', 'current'], ['claude', 'blocked'], ['ollama', 'ok']]);
    expect(spec.candidates[1]).toMatchObject({ blockedCode: 'MISSING_CREDENTIAL', detail: 'claude needs an API key' });
    expect(spec.candidates[0]!.facts.map((f) => f.value)).toEqual(['1']);
    expect(spec.scopes).toEqual(['session', 'default']);
  });
});

describe('native-transport candidate listing (real registry, no literals in the builder)', () => {
  it('registryProviderFor maps native transports to registry owners', () => {
    expect(registryProviderFor('claude')).toBe('claude');
    expect(registryProviderFor('openai')).toBe('codex');
    expect(registryProviderFor('ollama')).toBe('ollama');
    expect(registryProviderFor('local-llm')).toBe('local-llm');
    expect(registryProviderFor('deepseek')).toBeNull();
    expect(registryProviderFor('nope')).toBeNull();
  });
  it('lists registry models for claude/openai, ollama builtins, preset models for compat providers, discovered ids for local-llm', () => {
    const claude = listNativeModelCandidates('claude', {});
    expect(claude.length).toBeGreaterThan(0);
    expect(claude.every((c) => c.provider === 'claude' && c.definition !== null)).toBe(true);
    expect(claude.map((c) => c.id)).toEqual(modelRegistry.getByProvider('claude').map((m) => m.id));
    const openai = listNativeModelCandidates('openai', {});
    expect(openai.map((c) => c.id)).toEqual(modelRegistry.getByProvider('codex').map((m) => m.id));
    expect(listNativeModelCandidates('ollama', {}).map((c) => c.id)).toEqual(OLLAMA_BUILTIN_MODELS.map((m) => m.id));
    expect(listNativeModelCandidates('deepseek', {}).map((c) => c.id)).toEqual([...OPENAI_COMPAT_PRESET_META.deepseek.models]);
    expect(listNativeModelCandidates('local-llm', {}, ['served-model'])).toEqual([{ provider: 'local-llm', id: 'served-model', definition: null }]);
    expect(listNativeModelCandidates('unknown', {})).toEqual([]);
    expect(NATIVE_PROVIDER_NAMES.every((p) => Array.isArray(listNativeModelCandidates(p, {})))).toBe(true);
  });
});
