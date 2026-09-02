// tests/core/model-registry-fable51.test.ts
// Paket 2 — Claude Fable 5.1 catalog registration (registry SSOT, KANUN 10).
//
// Primary-source evidence (fetched 2026-09-02):
//   https://platform.claude.com/docs/en/models/fable-5-1/overview  — Model ID
//   `claude-fable-5-1`, released 2026-09-01, status Active (latest); 1M context,
//   128K max output; $10 / $50 per MTok; 5m cache write $12.50, 1h $20, cache
//   read $0.25 (0.025×); adaptive thinking always on; default effort `high`;
//   forced tool_choice (`any`/`tool`) rejected; retirement not before 2027-09-01.
//   https://platform.claude.com/docs/en/about-claude/pricing — same numbers.
//
// Owner contract for this package: the new model is selectable ONLY through
// the registry + effective config (never default, never a forced route), Fable
// 5 and Fable 5.1 are never aliased onto each other, XVerify provider
// separation is untouched, and every unverified capability stays a typed HOLD
// (subscription quota-window membership is NOT asserted here).

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BUILTIN_MODELS,
  ModelRegistry,
  modelRegistry,
  CLAUDE_FABLE_API_ID,
  CLAUDE_FABLE_5_1_API_ID,
  LEGACY_MODEL_ALIASES,
  getLegacyModelMigration,
  resolveCanonicalModelIdentity,
} from '../../src/core/model-registry.js';
import { getEquivalentModel, getModelTier } from '../../src/core/model-equivalence.js';
import { loadCostConfig, findModel } from '../../src/core/cost-config-loader.js';
import { ClaudeAdapter } from '../../src/providers/claude.js';
import { ModelActivationStore, resolveActiveModelPolicy } from '../../src/core/model-activation-store.js';

describe('Claude Fable 5.1 — canonical registry identity', () => {
  it('is registered under the exact provider API id (pinned dateless snapshot, no alias)', () => {
    expect(CLAUDE_FABLE_5_1_API_ID).toBe('claude-fable-5-1');
    const def = BUILTIN_MODELS.find((m) => m.id === CLAUDE_FABLE_5_1_API_ID);
    expect(def).toBeDefined();
    expect(def!.apiId).toBe(def!.id);
    expect(def!.provider).toBe('claude');
  });

  it('carries the primary-source specification (tier, context, output, price, capabilities, status)', () => {
    const def = BUILTIN_MODELS.find((m) => m.id === CLAUDE_FABLE_5_1_API_ID)!;
    expect(def.tier).toBe('premium_plus');
    expect(def.contextWindow).toBe(1_000_000);
    expect(def.maxOutputTokens).toBe(128_000);
    expect(def.costPerMillion).toEqual({ input: 10, output: 50 });
    expect(def.status).toBe('ga');
    // Same registry convention as Fable 5 / Opus 5: adaptive thinking is not
    // the legacy extended-thinking capability the `reasoning` flag denotes.
    expect(def.capabilities).toEqual({ streaming: true, toolUse: true, vision: true, codeExecution: true, reasoning: false });
  });

  it('is first-class on a fresh registry and priced by the registry estimator', () => {
    const registry = new ModelRegistry();
    expect(registry.has(CLAUDE_FABLE_5_1_API_ID)).toBe(true);
    expect(registry.resolveApiId(CLAUDE_FABLE_5_1_API_ID)).toBe(CLAUDE_FABLE_5_1_API_ID);
    expect(registry.getTier(CLAUDE_FABLE_5_1_API_ID)).toBe('premium_plus');
    expect(registry.getByProvider('claude').some((m) => m.id === CLAUDE_FABLE_5_1_API_ID)).toBe(true);
    expect(registry.estimateCost(CLAUDE_FABLE_5_1_API_ID, 1_000_000, 1_000_000)).toBe(60);
  });

  it('resolves canonically for provider claude and refuses a foreign provider claim', () => {
    expect(resolveCanonicalModelIdentity(CLAUDE_FABLE_5_1_API_ID, { provider: 'claude' }).id).toBe(CLAUDE_FABLE_5_1_API_ID);
    expect(() => resolveCanonicalModelIdentity(CLAUDE_FABLE_5_1_API_ID, { provider: 'codex' })).toThrow(/E_MODEL_PROVIDER_MISMATCH/);
  });
});

describe('Claude Fable 5.1 — never default, never aliased onto Fable 5', () => {
  it('Fable 5 stays the designated claude/premium_plus generation; Fable 5.1 is selectable only by exact id', () => {
    const def = BUILTIN_MODELS.find((m) => m.id === CLAUDE_FABLE_5_1_API_ID)!;
    expect(def.preferredForTier).not.toBe(true);
    expect(modelRegistry.getByProviderAndTier('claude', 'premium_plus')?.id).toBe(CLAUDE_FABLE_API_ID);
    // Mode presets keep resolving their claude/premium default to Opus 5.
    expect(modelRegistry.getByProviderAndTier('claude', 'premium')?.id).toBe('claude-opus-5');
  });

  it('no legacy alias points at Fable 5.1 and the `fable` alias still means Fable 5', () => {
    expect(LEGACY_MODEL_ALIASES.fable).toBe(CLAUDE_FABLE_API_ID);
    expect(getLegacyModelMigration(CLAUDE_FABLE_5_1_API_ID)).toBeUndefined();
    expect(Object.values(LEGACY_MODEL_ALIASES)).not.toContain(CLAUDE_FABLE_5_1_API_ID);
  });

  it('tier equivalence keeps XVerify provider separation: Fable 5.1 → codex gpt-5.6-sol; sol → claude stays Fable 5', () => {
    expect(getModelTier(CLAUDE_FABLE_5_1_API_ID)).toBe('premium_plus');
    expect(getEquivalentModel(CLAUDE_FABLE_5_1_API_ID, 'codex')).toBe('gpt-5.6-sol');
    expect(getEquivalentModel('gpt-5.6-sol', 'claude')).toBe(CLAUDE_FABLE_API_ID);
  });
});

describe('Claude Fable 5.1 — cost SSOT (pricing-data-baseline.json)', () => {
  const roots: string[] = [];
  afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });

  it('prices from the primary source: $10/$50, cache write 1.25×/2×, cache read 0.025×, no invented aliases', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-fable51-cost-'));
    roots.push(root);
    const cfg = loadCostConfig(root, { forceReload: true });
    const row = findModel(cfg, CLAUDE_FABLE_5_1_API_ID);
    expect(row).toBeDefined();
    expect(row!.provider).toBe('anthropic');
    expect(row!.modelId).toBe(CLAUDE_FABLE_5_1_API_ID);
    const p = row!.pricing;
    expect(p.input_cost_per_token).toBeCloseTo(0.00001, 12);
    expect(p.output_cost_per_token).toBeCloseTo(0.00005, 12);
    expect(p.cache_creation_input_token_cost).toBeCloseTo(0.0000125, 12);
    expect(p.cache_creation_input_token_cost_above_1hr).toBeCloseTo(0.00002, 12);
    expect(p.cache_read_input_token_cost).toBeCloseTo(0.00000025, 12);
    expect(p.max_input_tokens).toBe(1_000_000);
    expect(p.max_output_tokens).toBe(128_000);
    expect(p.deckent_tier).toBe('premium_plus');
    expect(p.deckent_aliases ?? []).toEqual([]);
    // The `fable` alias must keep resolving to Fable 5 in the cost SSOT too.
    expect(findModel(cfg, 'fable')?.modelId).toBe(CLAUDE_FABLE_API_ID);
  });
});

describe('Claude Fable 5.1 — provider adapter and activation policy', () => {
  const roots: string[] = [];
  afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });

  it('ClaudeAdapter advertises it and pins the exact id + effort vocabulary on the spawn command', () => {
    const adapter = new ClaudeAdapter(tmpdir());
    expect(adapter.supportedModels).toContain(CLAUDE_FABLE_5_1_API_ID);
    const cmd = adapter.buildCommand(CLAUDE_FABLE_5_1_API_ID, '/tmp/prompt.md', { reasoningEffort: 'xhigh' });
    // Token-exact: `--model claude-fable-5-1` must not be mistaken for (or
    // rewritten to) the Fable 5 id, which is a prefix of it.
    expect(cmd).toMatch(new RegExp(`--model ${CLAUDE_FABLE_5_1_API_ID}(\\s|$)`));
    expect(cmd).not.toMatch(new RegExp(`--model ${CLAUDE_FABLE_API_ID}(\\s|$)`));
    expect(cmd).toContain('--effort xhigh');
  });

  it('under explicit-active the new catalog model is NOT executable until the owner activates it', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-fable51-activation-'));
    roots.push(root);
    const store = new ModelActivationStore(root);
    store.setProviderPolicy('claude', 'explicit-active');
    store.setActivation('claude', CLAUDE_FABLE_API_ID, true);
    store.close();
    const policy = resolveActiveModelPolicy(root);
    expect(policy.providerMode('claude')).toBe('explicit-active');
    expect(policy.isExecutable('claude', CLAUDE_FABLE_API_ID)).toBe(true);
    expect(policy.isExecutable('claude', CLAUDE_FABLE_5_1_API_ID)).toBe(false);
    const owner = new ModelActivationStore(root);
    owner.setActivation('claude', CLAUDE_FABLE_5_1_API_ID, true);
    owner.close();
    expect(resolveActiveModelPolicy(root).isExecutable('claude', CLAUDE_FABLE_5_1_API_ID)).toBe(true);
  });

  it('under the default implicit-active mode it is eligible but still not the tier default', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-fable51-activation-'));
    roots.push(root);
    const policy = resolveActiveModelPolicy(root);
    expect(policy.providerMode('claude')).toBe('implicit-active');
    expect(policy.isExecutable('claude', CLAUDE_FABLE_5_1_API_ID)).toBe(true);
    expect(modelRegistry.getByProviderAndTier('claude', 'premium_plus')?.id).toBe(CLAUDE_FABLE_API_ID);
  });
});
