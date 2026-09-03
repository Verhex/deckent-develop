// src/cli/repl/picker-legacy.ts
// ═══ TERMINAL-PICKER-005 — picker specs for the non-native paths ════════════
//
// The Ink REPL's legacy proxy path AND the readline loop (DECKENT_INK=0) have
// no native transport: candidates come from the registry itself, the owner's
// activation policy still applies (re-resolved per open), and there is no
// credential probe here — rows are `ok` and the switch reports honestly.
// Ink-free on purpose: entry.ts imports this statically for the readline
// path, which must never drag Ink/React into the non-REPL CLI startup.

import { modelRegistry } from '../../core/model-registry.js';
import { resolveActiveModelPolicy } from '../../core/model-activation-store.js';
import type { ActiveSelection } from './provider-switch.js';
import type { PickerKind, PickerSpec } from './picker.js';
import { buildModelPickerSpec, buildProviderPickerSpec, type PickerSpecContext, type ProviderVia } from './picker-specs.js';
import { hostProviderVia } from '../../core/native-provider-names.js';

export function buildLegacyPickerSpecs(
  current: () => ActiveSelection,
  projectRoot: () => string = () => process.cwd(),
  modelsFact?: (n: number) => string,
  viaFact?: (via: ProviderVia) => string,
): Partial<Record<PickerKind, () => PickerSpec>> {
  const context = (): PickerSpecContext => ({
    providers: modelRegistry.getAllProviders(),
    candidatesFor: (provider) => modelRegistry.getByProvider(provider as Parameters<typeof modelRegistry.getByProvider>[0])
      .map((m) => ({ provider, id: m.id, definition: m })),
    policy: resolveActiveModelPolicy(projectRoot()),
    current: { provider: current().provider, model: current().model ?? null },
    // No credential/reachability probe on these paths → `unknown`, never a
    // false `ok` (RECONCILIATION L204; TERMINAL-PICKER-007).
    availability: () => ({ ok: 'unknown' }),
    // TERMINAL-PROVIDER-VOCAB-001 — registry owners ARE the rows here; the
    // transport fact says how each is reached (host CLI / API / local).
    transport: (provider) => ({ owner: provider, via: hostProviderVia(provider) }),
    ...(modelsFact ? { modelsFact } : {}),
    ...(viaFact ? { viaFact } : {}),
  });
  return {
    model: () => buildModelPickerSpec(context()),
    provider: () => buildProviderPickerSpec(context()),
  };
}
