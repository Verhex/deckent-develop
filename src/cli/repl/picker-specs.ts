// src/cli/repl/picker-specs.ts
// ═══ TERMINAL-PICKER-002 — /model and /provider candidate specs (pure) ═══════
//
// Candidates are DATA, never literals: the caller injects the provider list
// (NATIVE_PROVIDER_NAMES or the registry's providers), a per-provider model
// lister (native-transport.ts listNativeModelCandidates), the owner's
// activation policy (model-activation-store.ts resolveActiveModelPolicy —
// re-resolved on every open, the store has no events) and a per-provider
// availability probe (resolveNativeSelection with model:null, sync and
// network-free). Every row therefore carries entitlement / reachability /
// policy evidence (DECKENT-DESKTOP-TERMINAL-RECONCILIATION L204). Inactive
// models stay VISIBLE with a typed blocked code — never hidden, never
// silently substituted (owner decision, 2026-09-02). String-free: fact values
// are technical tokens (provider, tier, 200k, ga); the availability detail is
// localized by the caller.

import type { PickerCandidate, PickerFact, PickerSpec } from './picker.js';
import type { NativeModelCandidate } from './native-transport.js';
import { registryProviderFor } from './native-transport.js';

export type ProviderAvailability = { readonly ok: true } | { readonly ok: false; readonly code: string; readonly detail: string };

/** A structural subset of ModelActivationPolicy — only what the specs consult. */
export interface PickerActivationPolicy {
  isExecutable(provider: string, modelId: string): boolean;
  providerMode(provider: string): 'implicit-active' | 'explicit-active';
}

export interface PickerSpecContext {
  /** Provider order for the list (the current provider is hoisted first). */
  readonly providers: readonly string[];
  readonly candidatesFor: (provider: string) => readonly NativeModelCandidate[];
  readonly policy: PickerActivationPolicy;
  readonly current: { readonly provider: string; readonly model: string | null };
  readonly availability: (provider: string) => ProviderAvailability;
}

const SCOPES: PickerSpec['scopes'] = ['session', 'default'];

/** Providers with the current one first, order otherwise preserved. */
function orderedProviders(ctx: PickerSpecContext): string[] {
  const rest = ctx.providers.filter((p) => p !== ctx.current.provider);
  return ctx.providers.includes(ctx.current.provider) ? [ctx.current.provider, ...rest] : [...ctx.providers];
}

function contextFact(contextWindow: number | undefined): string | null {
  if (contextWindow === undefined || contextWindow <= 0) return null;
  return contextWindow >= 1000 ? `${Math.round(contextWindow / 1000)}k` : String(contextWindow);
}

/** Policy lookups use the registry owner of a native transport (openai → codex). */
function policyProviderFor(provider: string): string {
  return registryProviderFor(provider) ?? provider;
}

export function buildModelPickerSpec(ctx: PickerSpecContext): PickerSpec {
  const candidates: PickerCandidate[] = [];
  for (const provider of orderedProviders(ctx)) {
    const availability = ctx.availability(provider);
    const policyProvider = policyProviderFor(provider);
    for (const m of ctx.candidatesFor(provider)) {
      const facts: PickerFact[] = [{ key: 'provider', value: provider }];
      if (m.definition) {
        facts.push({ key: 'tier', value: m.definition.tier });
        const ctxFact = contextFact(m.definition.contextWindow);
        if (ctxFact) facts.push({ key: 'ctx', value: ctxFact });
        facts.push({ key: 'status', value: m.definition.status });
      }
      const isCurrent = provider === ctx.current.provider && m.id === ctx.current.model;
      if (isCurrent) {
        candidates.push({ id: m.id, label: m.id, facts, state: 'current' });
        continue;
      }
      if (!availability.ok) {
        candidates.push({ id: m.id, label: m.id, facts, state: 'blocked', blockedCode: availability.code, detail: availability.detail });
        continue;
      }
      if (!ctx.policy.isExecutable(policyProvider, m.id)) {
        const code = ctx.policy.providerMode(policyProvider) === 'explicit-active' ? 'MODEL_NOT_IN_ACTIVE_SET' : 'MODEL_INACTIVE';
        candidates.push({ id: m.id, label: m.id, facts, state: 'blocked', blockedCode: code });
        continue;
      }
      candidates.push({ id: m.id, label: m.id, facts, state: 'ok' });
    }
  }
  const initialId = ctx.current.model !== null && candidates.some((c) => c.id === ctx.current.model) ? ctx.current.model : null;
  return { kind: 'model', candidates, initialId, scopes: SCOPES };
}

export function buildProviderPickerSpec(ctx: PickerSpecContext): PickerSpec {
  const candidates: PickerCandidate[] = orderedProviders(ctx).map((provider) => {
    const availability = ctx.availability(provider);
    const facts: PickerFact[] = [{ key: 'models', value: String(ctx.candidatesFor(provider).length) }];
    if (provider === ctx.current.provider) return { id: provider, label: provider, facts, state: 'current' };
    if (!availability.ok) return { id: provider, label: provider, facts, state: 'blocked', blockedCode: availability.code, detail: availability.detail };
    return { id: provider, label: provider, facts, state: 'ok' };
  });
  const initialId = candidates.some((c) => c.id === ctx.current.provider) ? ctx.current.provider : null;
  return { kind: 'provider', candidates, initialId, scopes: SCOPES };
}
