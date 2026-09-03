// src/cli/repl/picker.ts
// ═══ TERMINAL-PICKER-001 — the pure picker core (React-free, string-free) ════
//
// One selection primitive for every Terminal surface that asks the operator
// to choose from a finite set: bare `/model`, `/provider`, `/approve`, `/term`,
// `/resume`, `/config`. Design contract (docs/design/DECKENT-TERMINAL-SINGLE-
// SURFACE.md §3/§6/§7/§8): the menu is a focus-rail item that replaces the
// bounded dynamic region (never an overlay, never a second input owner);
// Arrow/J-K move a STABLE identity (row index is never selection authority);
// Enter activates; Esc returns without side effects; every state has a word;
// narrow widths drop facts before they truncate; readline/line surfaces get
// the same choices as numbered lines + a typed argument.
//
// House pattern: pure key-map + pure reducer (run-flow-inbox.ts mapInboxKey /
// reduceInboxNav) with a thin Ink shell (picker-card.tsx). No user-facing text
// here — labels are injected (picker-labels.ts). No model/provider/mode
// literal here either (KANUN 10): candidates are built by the caller from the
// registry / config / policy (picker-specs.ts).

import { displayWidth } from './cursor-model.js';
import { truncateEnd } from './status-row.js';
// TERMINAL-PROVIDER-VOCAB-001 — the label CONTRACT lives in this leaf (the
// builder + assertion stay in picker-labels.ts) so the mechanism never
// imports its label module back: no picker ↔ picker-labels cycle.
export interface PickerLabels {
  readonly title: Readonly<Record<PickerKind, string>>;
  readonly hintPick: string;
  readonly hintScope: string;
  /** Template with `{query}`. */
  readonly hintFilter: string;
  readonly empty: string;
  /** Template with `{glyph}` and `{n}` (rows scrolled out of the window). */
  readonly more: string;
  /** Template with `{glyph}` and `{id}` (full id of a truncated focused row). */
  readonly reveal: string;
  /** Template with `{command}` — the typed-argument path on every surface. */
  readonly typedHint: string;
  /** Template with `{command}` — readline/line surfaces without a menu. */
  readonly unavailableSurface: string;
  /** TERMINAL-PICKER-005 — template with `{arg}`: a typed `<n|id>` that matched nothing. */
  readonly notFound: string;
  /** TERMINAL-PICKER-007 — hint while a filter is active (Esc clears it). */
  readonly hintFilterEsc: string;
  /** TERMINAL-PICKER-007 — template with `{command}`: the typed form where no resolver exists. */
  readonly typedForm: string;
  /** TERMINAL-PICKER-007 — template with `{n}`: the provider row's model count. */
  readonly factModels: string;
  /** TERMINAL-PROVIDER-VOCAB-001 — the transport fact words per via kind. */
  readonly via: Readonly<Record<ProviderVia, string>>;
  /** TERMINAL-PICKER-007 — in-card reason while a turn is running (non-switch kinds). */
  readonly readOnlyBusy: string;
  /** TERMINAL-PICKER-007 — the config write seam is not wired in this session. */
  readonly seamMissing: string;
  readonly states: Readonly<Record<PickerState, string>>;
  readonly scopes: Readonly<Record<PickerScope, string>>;
  /** Typed blocked reasons by code; unknown codes render `blockedGeneric`. */
  readonly blocked: Readonly<Record<string, string>>;
  /** Template with `{code}`. */
  readonly blockedGeneric: string;
  /** Templates with `{value}` (`config` also takes `{key}`). */
  readonly committed: Readonly<Record<'session' | 'default' | 'apply' | 'config', string>>;
  /** Template with `{error}`. */
  readonly defaultWriteFailed: string;
  /** TERMINAL-PICKER-004 — template with `{error}`. */
  readonly configWriteFailed: string;
  /** TERMINAL-PICKER-004 — key-row facts, templates with `{value}`. */
  readonly configFacts: Readonly<Record<'current' | 'default', string>>;
  /** TERMINAL-PICKER-003 — the meaning of each approval mode (a row fact). */
  readonly approveFacts: Readonly<Record<'suggest' | 'auto-edit' | 'full-auto', string>>;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type PickerKind = 'model' | 'provider' | 'approve' | 'term' | 'resume' | 'config-key' | 'config-value' | 'confirm';
export type PickerState = 'current' | 'ok' | 'blocked' | 'unknown';
export type PickerScope = 'session' | 'default' | 'apply' | 'cancel';

/** One fact shown beside a candidate (`value` is already localized by the builder). */
export interface PickerFact { readonly key: string; readonly value: string }

/** TERMINAL-PROVIDER-VOCAB-001 — how a provider is reached from the Terminal
 *  (the "via" fact); defined in this leaf so specs and labels share it
 *  without a cycle. */
export type ProviderVia = 'host-cli' | 'api' | 'local';

export interface ProviderTransport {
  /** The registry owner the row is labeled by. */
  readonly owner: string;
  readonly via: ProviderVia;
}

export interface PickerCandidate {
  /** Stable identity (model id, provider name, session id, config key…). */
  readonly id: string;
  readonly label: string;
  readonly facts: readonly PickerFact[];
  readonly state: PickerState;
  /** Typed reason code when `state === 'blocked'` (rendered via labels.blocked). */
  readonly blockedCode?: string;
  /** Extra sentence under the focused row (e.g. a localized ProviderError). */
  readonly detail?: string;
}

export interface PickerSpec {
  readonly kind: PickerKind;
  readonly candidates: readonly PickerCandidate[];
  /** Focused first (usually the current value); null → first row. */
  readonly initialId: string | null;
  /** Commit scopes; more than one → a second "scope" stage before commit. */
  readonly scopes: readonly PickerScope[];
  /** Substituted into the kind title's `{key}` (e.g. the setting a value picker is for). */
  readonly titleSubject?: string;
}

export interface PickerNav {
  readonly selectedId: string | null;
  readonly query: string;
  readonly stage: 'pick' | 'scope';
  readonly scopeIdx: number;
}

export type PickerAction =
  | { readonly kind: 'move'; readonly by: 1 | -1 }
  | { readonly kind: 'page'; readonly by: 1 | -1 }
  | { readonly kind: 'edge'; readonly to: 'first' | 'last' }
  | { readonly kind: 'jump'; readonly index: number }
  | { readonly kind: 'type'; readonly ch: string }
  | { readonly kind: 'backspace' }
  | { readonly kind: 'select' }
  | { readonly kind: 'close' }
  | { readonly kind: 'interrupt' }
  | { readonly kind: 'scope'; readonly by: 1 | -1 };

/** Structural subset of Ink's `Key` — only the flags the picker consumes. */
export interface PickerKeyFlags {
  upArrow?: boolean; downArrow?: boolean; leftArrow?: boolean; rightArrow?: boolean;
  pageUp?: boolean; pageDown?: boolean; home?: boolean; end?: boolean;
  return?: boolean; escape?: boolean; backspace?: boolean; delete?: boolean; tab?: boolean;
  shift?: boolean; ctrl?: boolean; meta?: boolean;
}

export type PickerEffect =
  | { readonly kind: 'commit'; readonly id: string; readonly scope: PickerScope }
  | { readonly kind: 'blocked'; readonly id: string; readonly code: string }
  | { readonly kind: 'close' }
  | { readonly kind: 'interrupt' };

export interface PickerReduceResult { readonly nav: PickerNav; readonly effect: PickerEffect | null }

// ─── Key map ─────────────────────────────────────────────────────────────────

/**
 * Map one keypress to a picker action, or null for an unmapped key (never an
 * implicit decision). `j`/`k` and `1-9` navigate only while the filter is
 * empty — with a query they are text. Tab / ←→ act only in the scope stage.
 */
export function mapPickerKey(
  input: string,
  key: PickerKeyFlags,
  ctx: { readonly queryEmpty: boolean; readonly stage: PickerNav['stage'] },
): PickerAction | null {
  if (key.escape === true) return { kind: 'close' };
  if (key.ctrl === true && input.toLowerCase() === 'c') return { kind: 'interrupt' };
  if (key.return === true) return { kind: 'select' };
  if (key.upArrow === true) return { kind: 'move', by: -1 };
  if (key.downArrow === true) return { kind: 'move', by: 1 };
  if (key.pageUp === true) return { kind: 'page', by: -1 };
  if (key.pageDown === true) return { kind: 'page', by: 1 };
  if (key.home === true) return { kind: 'edge', to: 'first' };
  if (key.end === true) return { kind: 'edge', to: 'last' };
  if (key.backspace === true || key.delete === true) return { kind: 'backspace' };
  if (ctx.stage === 'scope') {
    if (key.tab === true) return { kind: 'scope', by: key.shift === true ? -1 : 1 };
    if (key.rightArrow === true) return { kind: 'scope', by: 1 };
    if (key.leftArrow === true) return { kind: 'scope', by: -1 };
    return null;
  }
  if (key.tab === true || key.leftArrow === true || key.rightArrow === true) return null;
  if (key.ctrl === true || key.meta === true) return null;
  if (input.length === 0) return null;
  // TERMINAL-PICKER-007 — digits TYPE (rows carry no numbers in the card; a
  // silent jump would make the row index a selection authority, §6).
  if (ctx.queryEmpty && input.length === 1) {
    if (input === 'j') return { kind: 'move', by: 1 };
    if (input === 'k') return { kind: 'move', by: -1 };
  }
  // A pasted chunk arrives as one multi-character input — it types as a whole.
  for (const ch of input) {
    const code = ch.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) return null; // control characters never type
  }
  return { kind: 'type', ch: input };
}

// ─── Navigation state ────────────────────────────────────────────────────────

export function initialPickerNav(spec: PickerSpec): PickerNav {
  const first = spec.candidates[0]?.id ?? null;
  const selectedId = spec.initialId !== null && spec.candidates.some((c) => c.id === spec.initialId) ? spec.initialId : first;
  return { selectedId, query: '', stage: 'pick', scopeIdx: 0 };
}

/** Case-insensitive substring filter over id, label and fact values. */
export function filterPickerCandidates(candidates: readonly PickerCandidate[], query: string): PickerCandidate[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [...candidates];
  return candidates.filter((c) =>
    c.id.toLowerCase().includes(q)
    || c.label.toLowerCase().includes(q)
    || c.facts.some((f) => f.value.toLowerCase().includes(q)));
}

/** Keep the selection if it is still listed, else fall back to the first row. */
export function realignPickerSelection(selectedId: string | null, rows: readonly PickerCandidate[]): string | null {
  if (selectedId !== null && rows.some((r) => r.id === selectedId)) return selectedId;
  return rows[0]?.id ?? null;
}

/** The visible window that keeps `idx` in view (input-bar slash-menu precedent). */
export function resolveMenuWindow(count: number, idx: number, rows: number): { lo: number; hi: number } {
  const size = Math.max(1, rows);
  const lo = Math.max(0, Math.min(idx - (size >> 1), count - size));
  return { lo, hi: Math.min(count, lo + size) };
}

/**
 * Advance the nav state for one action. Pure — the caller owns React state
 * and performs the returned effect (commit / blocked notice / close /
 * interrupt). Moves wrap over the FILTERED rows; pages clamp; Esc peels one
 * layer at a time (scope stage → pick, then filter → empty, then close).
 */
export function reducePicker(nav: PickerNav, action: PickerAction, spec: PickerSpec, windowRows: number): PickerReduceResult {
  const rows = filterPickerCandidates(spec.candidates, nav.query);
  const n = rows.length;
  const current = realignPickerSelection(nav.selectedId, rows);
  const idx = current === null ? -1 : rows.findIndex((r) => r.id === current);
  const at = (i: number): PickerNav => ({ ...nav, selectedId: rows[i]?.id ?? null });

  switch (action.kind) {
    case 'interrupt': return { nav, effect: { kind: 'interrupt' } };
    case 'close':
      if (nav.stage === 'scope') return { nav: { ...nav, stage: 'pick', scopeIdx: 0 }, effect: null };
      if (nav.query.length > 0) return { nav: { ...nav, query: '' }, effect: null };
      return { nav, effect: { kind: 'close' } };
    case 'scope': {
      if (nav.stage !== 'scope' || spec.scopes.length === 0) return { nav, effect: null };
      const m = spec.scopes.length;
      return { nav: { ...nav, scopeIdx: (nav.scopeIdx + action.by + m) % m }, effect: null };
    }
    case 'select': {
      if (nav.stage === 'scope') {
        const scope = spec.scopes[nav.scopeIdx] ?? spec.scopes[0];
        if (scope === undefined || nav.selectedId === null) return { nav: { ...nav, stage: 'pick', scopeIdx: 0 }, effect: null };
        if (scope === 'cancel') return { nav: { ...nav, stage: 'pick', scopeIdx: 0 }, effect: { kind: 'close' } };
        return { nav: { ...nav, stage: 'pick', scopeIdx: 0 }, effect: { kind: 'commit', id: nav.selectedId, scope } };
      }
      if (current === null) return { nav, effect: null };
      const candidate = rows[idx]!;
      if (candidate.state === 'blocked') {
        return { nav: { ...nav, selectedId: current }, effect: { kind: 'blocked', id: current, code: candidate.blockedCode ?? 'BLOCKED' } };
      }
      if (spec.scopes.length > 1) return { nav: { ...nav, selectedId: current, stage: 'scope', scopeIdx: 0 }, effect: null };
      return { nav: { ...nav, selectedId: current }, effect: { kind: 'commit', id: current, scope: spec.scopes[0] ?? 'apply' } };
    }
    case 'type': {
      const query = nav.query + action.ch;
      const next = filterPickerCandidates(spec.candidates, query);
      return { nav: { ...nav, query, selectedId: realignPickerSelection(nav.selectedId, next) }, effect: null };
    }
    case 'backspace': {
      if (nav.query.length === 0) return { nav, effect: null };
      const query = nav.query.slice(0, -1);
      const next = filterPickerCandidates(spec.candidates, query);
      return { nav: { ...nav, query, selectedId: realignPickerSelection(nav.selectedId, next) }, effect: null };
    }
    case 'move':
      if (n === 0) return { nav: { ...nav, selectedId: null }, effect: null };
      return { nav: at(((Math.max(0, idx) + action.by) % n + n) % n), effect: null };
    case 'page':
      if (n === 0) return { nav: { ...nav, selectedId: null }, effect: null };
      return { nav: at(Math.min(n - 1, Math.max(0, Math.max(0, idx) + action.by * Math.max(1, windowRows)))), effect: null };
    case 'edge':
      if (n === 0) return { nav: { ...nav, selectedId: null }, effect: null };
      return { nav: at(action.to === 'first' ? 0 : n - 1), effect: null };
    case 'jump': {
      if (n === 0) return { nav: { ...nav, selectedId: null }, effect: null };
      const { lo, hi } = resolveMenuWindow(n, Math.max(0, idx), windowRows);
      const target = lo + action.index - 1;
      if (target < lo || target >= hi) return { nav, effect: null };
      return { nav: at(target), effect: null };
    }
    default: return { nav, effect: null };
  }
}

// ─── Rendering helpers (display cells) ───────────────────────────────────────

export interface PickerRowParts { readonly label: string; readonly facts: readonly string[]; readonly state: string }
export interface FittedPickerRow { readonly line: string; readonly dropped: number; readonly truncated: boolean }

const FACT_SEP = ' · ';
const GAP = '  ';

/**
 * Fit one row into `columns` display cells: `label  fact · fact  [state]`.
 * Facts drop from the END first (the caller orders them most→least useful);
 * only then does the label truncate (`…`). The state word always survives.
 */
export function fitPickerRow(parts: PickerRowParts, columns: number, opts: { readonly labelWidth?: number } = {}): FittedPickerRow {
  const stateTag = `[${parts.state}]`;
  // TERMINAL-PICKER-007 — a shared label column keeps facts and state tags
  // aligned across rows (§7: alignment before color); it yields when the row
  // would overflow.
  const padTo = opts.labelWidth ?? 0;
  const padded = (label: string): string => {
    const w = displayWidth(label);
    return w < padTo ? label + ' '.repeat(padTo - w) : label;
  };
  const compose = (facts: readonly string[], label: string): string =>
    facts.length > 0 ? `${label}${GAP}${facts.join(FACT_SEP)}${GAP}${stateTag}` : `${label}${GAP}${stateTag}`;
  let facts = [...parts.facts];
  let line = compose(facts, padded(parts.label));
  let dropped = 0;
  while (displayWidth(line) > columns && facts.length > 0) {
    facts = facts.slice(0, -1);
    dropped += 1;
    line = compose(facts, padded(parts.label));
  }
  if (displayWidth(line) <= columns) return { line, dropped, truncated: false };
  line = compose(facts, parts.label); // give the padding back before truncating
  if (displayWidth(line) <= columns) return { line, dropped, truncated: false };
  const budget = columns - displayWidth(GAP) - displayWidth(stateTag);
  const label = truncateEnd(parts.label, Math.max(1, budget));
  return { line: compose([], label), dropped, truncated: true };
}

export interface PickerGlyphs {
  readonly cursor: string; readonly up: string; readonly down: string; readonly reveal: string;
  readonly on: string; readonly off: string;
}

/** Unicode glyphs, or ASCII when the terminal cannot be trusted with them. */
export function resolvePickerGlyphs(ascii: boolean): PickerGlyphs {
  return ascii
    ? { cursor: '>', up: '^', down: 'v', reveal: '->', on: '(x)', off: '( )' }
    : { cursor: '❯', up: '↑', down: '↓', reveal: '↳', on: '◉', off: '○' };
}

/** The state word for a row (blocked rows carry their typed reason). */
export function pickerStateWord(candidate: PickerCandidate, labels: PickerLabels): string {
  if (candidate.state !== 'blocked') return labels.states[candidate.state];
  return `${labels.states.blocked}: ${pickerBlockedReason(candidate.blockedCode ?? 'BLOCKED', labels, candidate.detail)}`;
}

/** The localized reason for a blocked code; `{detail}` takes the candidate's
 *  detail (a localized ProviderError sentence) and never leaks as a placeholder. */
export function pickerBlockedReason(code: string, labels: PickerLabels, detail = ''): string {
  const template = labels.blocked[code] ?? labels.blockedGeneric.replace('{code}', code);
  return template.replace('{detail}', detail).replace(/\s+—\s*$/u, '').trim();
}

// ─── readline / line / pipe degradation ──────────────────────────────────────

/**
 * The same choices as deterministic numbered lines: title, `n) label  facts
 * [state]` rows, and the typed-argument hint. No cursor control, no required
 * key input (§8) — `resolvePickerArg` answers the typed `<n|id>`.
 */
export function pickerLinesFor(
  spec: PickerSpec,
  labels: PickerLabels,
  glyphs: PickerGlyphs,
  command: string,
  opts: { readonly width?: number; readonly typedHint?: boolean } = {},
): string[] {
  void glyphs;
  const lines: string[] = [labels.title[spec.kind].replace('{key}', spec.titleSubject ?? '')];
  const prefixCells = displayWidth(`  ${spec.candidates.length}) `);
  const rowWidth = opts.width !== undefined ? Math.max(8, opts.width - prefixCells) : Number.MAX_SAFE_INTEGER;
  spec.candidates.forEach((c, i) => {
    // TERMINAL-PICKER-007 — under a width budget the facts drop before the
    // state word wraps; the tag stays the short word (reason lines are for cards).
    const fit = fitPickerRow({ label: c.label, facts: c.facts.map((f) => f.value), state: opts.width !== undefined ? labels.states[c.state] : pickerStateWord(c, labels) }, rowWidth);
    lines.push(`  ${i + 1}) ${fit.line}`);
  });
  if (spec.candidates.length === 0) lines.push(`  ${labels.empty}`);
  if (opts.typedHint !== false) lines.push(labels.typedHint.replace('{command}', command));
  return lines;
}

export type PickerArgResolution =
  | { readonly kind: 'found'; readonly candidate: PickerCandidate }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'ambiguous'; readonly matches: readonly PickerCandidate[] };

/** Resolve a typed `<n|id>`: a 1-based number, else an exact id/label (case-insensitive). */
export function resolvePickerArg(arg: string, candidates: readonly PickerCandidate[]): PickerArgResolution {
  const trimmed = arg.trim();
  if (/^\d+$/.test(trimmed)) {
    const candidate = candidates[Number(trimmed) - 1];
    return candidate ? { kind: 'found', candidate } : { kind: 'not-found' };
  }
  const q = trimmed.toLowerCase();
  const byId = candidates.filter((c) => c.id.toLowerCase() === q);
  if (byId.length === 1) return { kind: 'found', candidate: byId[0]! };
  if (byId.length > 1) return { kind: 'ambiguous', matches: byId };
  const byLabel = candidates.filter((c) => c.label.toLowerCase() === q);
  if (byLabel.length === 1) return { kind: 'found', candidate: byLabel[0]! };
  if (byLabel.length > 1) return { kind: 'ambiguous', matches: byLabel };
  return { kind: 'not-found' };
}
