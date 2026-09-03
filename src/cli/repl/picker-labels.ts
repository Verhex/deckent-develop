// src/cli/repl/picker-labels.ts
// ═══ TERMINAL-PICKER-001 — PickerLabels contract + builder ═══════════════════
//
// The picker mechanism (picker.ts / picker-card.tsx) is string-free; this is
// the ONE place its user-visible text is assembled from the catalog
// (`tui.picker.*`, family cli-terminal-picker). Every field is required —
// `assertPickerLabels` turns a missing injection into the typed
// InjectedLabelMissingError (E_INJECTED_LABEL_MISSING), never a silent
// English fallback. Injected as its own prop (like inboxLabels) so the
// string-free-closure scan of buildReplLabels stays flat.

import { requireInjectedLabel } from '../helpers/injected-label.js';
import type { PickerLabels, ProviderVia } from './picker.js';

// TERMINAL-PROVIDER-VOCAB-001 — the PickerLabels CONTRACT is defined in the
// mechanism leaf (picker.ts) and re-exported here for its importers; this
// module owns only the catalog builder, the via keys and the assertion.
export type { PickerLabels } from './picker.js';

/** Catalog keys of the transport ("via") facts, shared by every surface that
 *  builds a picker context. */
export const PICKER_VIA_KEYS: Readonly<Record<ProviderVia, string>> = {
  'host-cli': 'tui.picker.fact.via.host_cli',
  api: 'tui.picker.fact.via.api',
  local: 'tui.picker.fact.via.local',
};

const BLOCKED_CODES = ['MODEL_INACTIVE', 'MODEL_NOT_IN_ACTIVE_SET', 'NO_NATIVE_TRANSPORT', 'MISSING_CREDENTIAL', 'NOT_ENUMERABLE', 'NO_MODELS_LISTED', 'NOT_LOGGED_IN', 'UNREACHABLE'] as const;

/** Resolve every picker label from the catalog for the session language. */
export function buildPickerLabels(t: (key: string) => string): PickerLabels {
  const blocked: Record<string, string> = {};
  for (const code of BLOCKED_CODES) blocked[code] = t(`tui.picker.blocked.${code}`);
  return {
    title: {
      model: t('tui.picker.title.model'),
      provider: t('tui.picker.title.provider'),
      approve: t('tui.picker.title.approve'),
      term: t('tui.picker.title.term'),
      resume: t('tui.picker.title.resume'),
      'config-key': t('tui.picker.title.config_key'),
      'config-value': t('tui.picker.title.config_value'),
      confirm: t('tui.picker.title.confirm'),
    },
    hintPick: t('tui.picker.hint_pick'),
    hintScope: t('tui.picker.hint_scope'),
    hintFilter: t('tui.picker.hint_filter'),
    empty: t('tui.picker.empty'),
    more: t('tui.picker.more'),
    reveal: t('tui.picker.reveal'),
    typedHint: t('tui.picker.typed_hint'),
    unavailableSurface: t('tui.picker.unavailable_surface'),
    notFound: t('tui.picker.not_found'),
    hintFilterEsc: t('tui.picker.hint_filter_esc'),
    typedForm: t('tui.picker.typed_form'),
    factModels: t('tui.picker.fact.models'),
    via: {
      'host-cli': t(PICKER_VIA_KEYS['host-cli']),
      api: t(PICKER_VIA_KEYS.api),
      local: t(PICKER_VIA_KEYS.local),
    },
    readOnlyBusy: t('tui.picker.read_only_busy'),
    seamMissing: t('tui.picker.seam_missing'),
    states: {
      current: t('tui.picker.state.current'),
      ok: t('tui.picker.state.ok'),
      blocked: t('tui.picker.state.blocked'),
      unknown: t('tui.picker.state.unknown'),
    },
    scopes: {
      session: t('tui.picker.scope.session'),
      default: t('tui.picker.scope.default'),
      apply: t('tui.picker.scope.apply'),
      cancel: t('tui.picker.scope.cancel'),
    },
    blocked,
    blockedGeneric: t('tui.picker.blocked_generic'),
    committed: {
      session: t('tui.picker.committed.session'),
      default: t('tui.picker.committed.default'),
      apply: t('tui.picker.committed.apply'),
      config: t('tui.picker.committed.config'),
    },
    defaultWriteFailed: t('tui.picker.default_write_failed'),
    configWriteFailed: t('tui.picker.config_write_failed'),
    configFacts: {
      current: t('tui.picker.fact.config.current'),
      default: t('tui.picker.fact.config.default'),
    },
    approveFacts: {
      suggest: t('tui.picker.fact.approve.suggest'),
      'auto-edit': t('tui.picker.fact.approve.auto_edit'),
      'full-auto': t('tui.picker.fact.approve.full_auto'),
    },
  };
}

/** Throw the typed guard error for the first missing/empty label (string-free). */
export function assertPickerLabels(labels: PickerLabels): void {
  const walk = (value: unknown, path: string): void => {
    if (typeof value === 'string') { requireInjectedLabel(path, value); return; }
    if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) walk(v, `${path}.${k}`);
      return;
    }
    requireInjectedLabel(path, undefined);
  };
  walk(labels, 'pickerLabels');
}
