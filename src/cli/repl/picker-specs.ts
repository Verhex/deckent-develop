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

/** `ok: 'unknown'` — no evidence either way (a surface without a credential
 *  probe): rows render the `unknown` word, never a false `ok` (RECONCILIATION L204). */
export type ProviderAvailability =
  | { readonly ok: true }
  | { readonly ok: 'unknown' }
  | { readonly ok: false; readonly code: string; readonly detail: string };

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
  /** Localized "{n} models" fact for provider rows (default: the bare count). */
  readonly modelsFact?: (n: number) => string;
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
      if (availability.ok === false) {
        candidates.push({ id: m.id, label: m.id, facts, state: 'blocked', blockedCode: availability.code, detail: availability.detail });
        continue;
      }
      if (!ctx.policy.isExecutable(policyProvider, m.id)) {
        const code = ctx.policy.providerMode(policyProvider) === 'explicit-active' ? 'MODEL_NOT_IN_ACTIVE_SET' : 'MODEL_INACTIVE';
        candidates.push({ id: m.id, label: m.id, facts, state: 'blocked', blockedCode: code });
        continue;
      }
      candidates.push({ id: m.id, label: m.id, facts, state: availability.ok === 'unknown' ? 'unknown' : 'ok' });
    }
  }
  const initialId = ctx.current.model !== null && candidates.some((c) => c.id === ctx.current.model) ? ctx.current.model : null;
  return { kind: 'model', candidates, initialId, scopes: SCOPES };
}

// ─── TERMINAL-PICKER-003 — session-only choices: approval mode, posture, resume ─

const APPLY_ONLY: PickerSpec['scopes'] = ['apply'];

/** One row per approval mode; `describe` supplies the localized meaning (a fact). */
export function buildApprovalPickerSpec<M extends string>(modes: readonly M[], current: M, describe: (mode: M) => string): PickerSpec {
  const candidates: PickerCandidate[] = modes.map((mode) => ({
    id: mode, label: mode, facts: [{ key: 'meaning', value: describe(mode) }], state: mode === current ? 'current' : 'ok',
  }));
  return { kind: 'approve', candidates, initialId: modes.includes(current) ? current : null, scopes: APPLY_ONLY };
}

/** One row per authority posture; `admits` renders the risk classes it allows. */
export function buildTermPickerSpec<M extends string>(modes: readonly M[], current: M, admits: (mode: M) => string, labelOf: (mode: M) => string = (m) => m): PickerSpec {
  const candidates: PickerCandidate[] = modes.map((mode) => ({
    id: mode, label: labelOf(mode), facts: [{ key: 'admits', value: admits(mode) }], state: mode === current ? 'current' : 'ok',
  }));
  return { kind: 'term', candidates, initialId: modes.includes(current) ? current : null, scopes: APPLY_ONLY };
}

export interface ResumePickerRecord { readonly id: string; readonly title: string; readonly date: string; readonly status: string }

/** Sessions as stable identities; `facts` renders status/time per record. */
export function buildResumePickerSpec(records: readonly ResumePickerRecord[], currentId: string | null, facts: (record: ResumePickerRecord) => readonly string[]): PickerSpec {
  const candidates: PickerCandidate[] = records.map((r) => ({
    id: r.id, label: r.title, facts: facts(r).map((value, i) => ({ key: `f${i}`, value })), state: r.id === currentId ? 'current' : 'ok',
  }));
  const initialId = currentId !== null && records.some((r) => r.id === currentId) ? currentId : null;
  return { kind: 'resume', candidates, initialId, scopes: APPLY_ONLY };
}

// ─── TERMINAL-PICKER-004 — the /config settings menu (key → value) ──────────

/** One CONFIG_METADATA entry as the picker sees it (built by run.tsx; provider
 *  keys arrive with their options widened to VALID_PROVIDERS). */
export interface ConfigKeyEntry {
  readonly key: string;
  readonly category: string;
  readonly type: string;
  /** Present → enumerable (a value picker can follow); absent → typed path only. */
  readonly options?: readonly string[];
  readonly defaultValue: unknown;
  /** The project-level value today (undefined when unset). */
  readonly current: unknown;
}

/** Key picker: enumerable keys are `ok`, the rest stay visible but blocked. */
export function buildConfigKeyPickerSpec(entries: readonly ConfigKeyEntry[], facts: (entry: ConfigKeyEntry) => readonly string[]): PickerSpec {
  const candidates: PickerCandidate[] = entries.map((e) => ({
    id: e.key,
    label: e.key,
    facts: facts(e).map((value, i) => ({ key: `f${i}`, value })),
    ...(e.options && e.options.length > 0 ? { state: 'ok' as const } : { state: 'blocked' as const, blockedCode: 'NOT_ENUMERABLE' }),
  }));
  return { kind: 'config-key', candidates, initialId: candidates[0]?.id ?? null, scopes: APPLY_ONLY };
}

const APPLY_OR_CANCEL: PickerSpec['scopes'] = ['apply', 'cancel'];

/** Value picker for one key: its options with the current value marked; the
 *  confirm stage offers apply / cancel. */
export function buildConfigValuePickerSpec(key: string, options: readonly string[], current: unknown): PickerSpec {
  const currentText = current === undefined || current === null ? null : String(current);
  const candidates: PickerCandidate[] = options.map((value) => ({
    id: value, label: value, facts: [], state: value === currentText ? 'current' : 'ok',
  }));
  return { kind: 'config-value', candidates, initialId: currentText !== null && options.includes(currentText) ? currentText : null, scopes: APPLY_OR_CANCEL, titleSubject: key };
}

const CONFIG_VALUE_CELLS = 40;

/** A setting's value as a bounded, honest token: never "[object Object]". */
export function formatConfigValue(value: unknown): string {
  if (value === undefined || value === null) return '-';
  const text = typeof value === 'string' ? value : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return text.length > CONFIG_VALUE_CELLS ? `${text.slice(0, CONFIG_VALUE_CELLS)}…` : text;
}

export function buildProviderPickerSpec(ctx: PickerSpecContext): PickerSpec {
  const candidates: PickerCandidate[] = orderedProviders(ctx).map((provider) => {
    const availability = ctx.availability(provider);
    const count = ctx.candidatesFor(provider).length;
    const facts: PickerFact[] = [{ key: 'models', value: ctx.modelsFact ? ctx.modelsFact(count) : String(count) }];
    if (provider === ctx.current.provider) return { id: provider, label: provider, facts, state: 'current' };
    if (availability.ok === false) return { id: provider, label: provider, facts, state: 'blocked', blockedCode: availability.code, detail: availability.detail };
    // A provider with nothing to pick is not "ok" (it would claim usability).
    if (count === 0) return { id: provider, label: provider, facts, state: 'blocked', blockedCode: 'NO_MODELS_LISTED' };
    return { id: provider, label: provider, facts, state: availability.ok === 'unknown' ? 'unknown' : 'ok' };
  });
  const initialId = candidates.some((c) => c.id === ctx.current.provider) ? ctx.current.provider : null;
  return { kind: 'provider', candidates, initialId, scopes: SCOPES };
}
