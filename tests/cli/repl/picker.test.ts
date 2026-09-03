// tests/cli/repl/picker.test.ts
// ═══ TERMINAL-PICKER-001 (P15a) — the pure picker core ═══════════════════════
//
// One project-owned selection primitive for every "choose a value" surface
// (/model, /provider, /approve, /term, /resume, /config). This file pins the
// React-free, string-free core: key map, navigation reducer (stable identity,
// never row index), type-to-filter, scroll window, display-cell row fitting,
// ASCII glyph fallback and the readline/line degradation (numbered lines +
// typed-argument resolution). Hermetic.

import { describe, it, expect } from 'vitest';
import {
  mapPickerKey, initialPickerNav, filterPickerCandidates, realignPickerSelection, reducePicker,
  resolveMenuWindow, fitPickerRow, resolvePickerGlyphs, pickerLinesFor, resolvePickerArg, pickerBlockedReason, pickerStateWord,
  type PickerCandidate, type PickerSpec, type PickerNav,
} from '../../../src/cli/repl/picker.js';
import { buildPickerLabels, assertPickerLabels } from '../../../src/cli/repl/picker-labels.js';
import { InjectedLabelMissingError } from '../../../src/cli/helpers/injected-label.js';
import { getMessage } from '../../../src/cli/helpers/messages.js';

const EN = buildPickerLabels((k) => getMessage(k, 'en'));

const c = (id: string, state: PickerCandidate['state'] = 'ok', extra: Partial<PickerCandidate> = {}): PickerCandidate => ({
  id, label: id, facts: [], state, ...extra,
});
const CANDS: PickerCandidate[] = [
  c('claude-fable-5-1', 'current', { facts: [{ key: 'provider', value: 'claude' }, { key: 'tier', value: 'premium' }] }),
  c('claude-sonnet-5', 'ok', { facts: [{ key: 'provider', value: 'claude' }, { key: 'tier', value: 'standard' }] }),
  c('gpt-5.6-sol', 'blocked', { blockedCode: 'MODEL_INACTIVE', facts: [{ key: 'provider', value: 'openai' }] }),
  c('qwen3:8b', 'ok', { facts: [{ key: 'provider', value: 'ollama' }] }),
];
const SPEC: PickerSpec = { kind: 'model', candidates: CANDS, initialId: 'claude-fable-5-1', scopes: ['session', 'default'] };
const ONE_SCOPE: PickerSpec = { kind: 'term', candidates: [c('ask', 'current'), c('run'), c('control')], initialId: 'ask', scopes: ['apply'] };

describe('mapPickerKey — documented keys only, never an implicit decision', () => {
  const pick = { queryEmpty: true, stage: 'pick' as const };
  it('arrows/page/home/end move; Enter selects; Esc closes; Ctrl-C interrupts', () => {
    expect(mapPickerKey('', { upArrow: true }, pick)).toEqual({ kind: 'move', by: -1 });
    expect(mapPickerKey('', { downArrow: true }, pick)).toEqual({ kind: 'move', by: 1 });
    expect(mapPickerKey('', { pageUp: true }, pick)).toEqual({ kind: 'page', by: -1 });
    expect(mapPickerKey('', { pageDown: true }, pick)).toEqual({ kind: 'page', by: 1 });
    expect(mapPickerKey('', { home: true }, pick)).toEqual({ kind: 'edge', to: 'first' });
    expect(mapPickerKey('', { end: true }, pick)).toEqual({ kind: 'edge', to: 'last' });
    expect(mapPickerKey('', { return: true }, pick)).toEqual({ kind: 'select' });
    expect(mapPickerKey('', { escape: true }, pick)).toEqual({ kind: 'close' });
    expect(mapPickerKey('c', { ctrl: true }, pick)).toEqual({ kind: 'interrupt' });
  });
  it('j/k and 1-9 navigate ONLY while the filter is empty; otherwise they type', () => {
    expect(mapPickerKey('j', {}, pick)).toEqual({ kind: 'move', by: 1 });
    expect(mapPickerKey('k', {}, pick)).toEqual({ kind: 'move', by: -1 });
    expect(mapPickerKey('3', {}, pick)).toEqual({ kind: 'jump', index: 3 });
    const typing = { queryEmpty: false, stage: 'pick' as const };
    expect(mapPickerKey('j', {}, typing)).toEqual({ kind: 'type', ch: 'j' });
    expect(mapPickerKey('3', {}, typing)).toEqual({ kind: 'type', ch: '3' });
    expect(mapPickerKey('a', {}, pick)).toEqual({ kind: 'type', ch: 'a' });
    expect(mapPickerKey('son', {}, pick)).toEqual({ kind: 'type', ch: 'son' });   // pasted chunk types as a whole
    expect(mapPickerKey(String.fromCharCode(1), {}, pick)).toBeNull();     // control characters never type
    expect(mapPickerKey('', { backspace: true }, typing)).toEqual({ kind: 'backspace' });
    expect(mapPickerKey('', { delete: true }, typing)).toEqual({ kind: 'backspace' });
  });
  it('Tab / ←→ change the scope only in the scope stage; other keys are ignored', () => {
    const scope = { queryEmpty: true, stage: 'scope' as const };
    expect(mapPickerKey('', { tab: true }, scope)).toEqual({ kind: 'scope', by: 1 });
    expect(mapPickerKey('', { tab: true, shift: true }, scope)).toEqual({ kind: 'scope', by: -1 });
    expect(mapPickerKey('', { rightArrow: true }, scope)).toEqual({ kind: 'scope', by: 1 });
    expect(mapPickerKey('', { leftArrow: true }, scope)).toEqual({ kind: 'scope', by: -1 });
    expect(mapPickerKey('', { tab: true }, pick)).toBeNull();
    expect(mapPickerKey('x', { meta: true }, pick)).toBeNull();
    expect(mapPickerKey('', { leftArrow: true }, pick)).toBeNull();
  });
});

describe('navigation state — stable identity, filter, window', () => {
  it('initial nav focuses initialId (or the first row) with an empty filter', () => {
    expect(initialPickerNav(SPEC)).toEqual({ selectedId: 'claude-fable-5-1', query: '', stage: 'pick', scopeIdx: 0 });
    expect(initialPickerNav({ ...SPEC, initialId: null }).selectedId).toBe('claude-fable-5-1');
    expect(initialPickerNav({ ...SPEC, candidates: [], initialId: null }).selectedId).toBeNull();
  });
  it('filter is a case-insensitive substring over id, label and fact values', () => {
    expect(filterPickerCandidates(CANDS, 'SONNET').map((x) => x.id)).toEqual(['claude-sonnet-5']);
    expect(filterPickerCandidates(CANDS, 'ollama').map((x) => x.id)).toEqual(['qwen3:8b']);
    expect(filterPickerCandidates(CANDS, '')).toHaveLength(4);
  });
  it('realign keeps the selection when present, else falls to the first row', () => {
    expect(realignPickerSelection('gpt-5.6-sol', CANDS)).toBe('gpt-5.6-sol');
    expect(realignPickerSelection('missing', CANDS)).toBe('claude-fable-5-1');
    expect(realignPickerSelection('x', [])).toBeNull();
  });
  it('resolveMenuWindow keeps the selected row visible (input-bar precedent)', () => {
    expect(resolveMenuWindow(4, 0, 8)).toEqual({ lo: 0, hi: 4 });
    expect(resolveMenuWindow(20, 10, 8)).toEqual({ lo: 6, hi: 14 });
    expect(resolveMenuWindow(20, 19, 8)).toEqual({ lo: 12, hi: 20 });
  });
});

describe('reducePicker — moves wrap, pages clamp, select is two-stage, Esc peels', () => {
  const nav = (over: Partial<PickerNav> = {}): PickerNav => ({ ...initialPickerNav(SPEC), ...over });
  it('move wraps over the FILTERED rows and never uses an index as identity', () => {
    const r1 = reducePicker(nav(), { kind: 'move', by: -1 }, SPEC, 8);
    expect(r1.nav.selectedId).toBe('qwen3:8b');
    const r2 = reducePicker(nav({ query: 'claude', selectedId: 'claude-sonnet-5' }), { kind: 'move', by: 1 }, SPEC, 8);
    expect(r2.nav.selectedId).toBe('claude-fable-5-1');
  });
  it('page clamps at the edges; edge jumps; jump targets the visible window', () => {
    expect(reducePicker(nav(), { kind: 'page', by: 1 }, SPEC, 2).nav.selectedId).toBe('gpt-5.6-sol');
    expect(reducePicker(nav(), { kind: 'page', by: -1 }, SPEC, 2).nav.selectedId).toBe('claude-fable-5-1');
    expect(reducePicker(nav(), { kind: 'edge', to: 'last' }, SPEC, 8).nav.selectedId).toBe('qwen3:8b');
    expect(reducePicker(nav({ selectedId: 'qwen3:8b' }), { kind: 'jump', index: 2 }, SPEC, 8).nav.selectedId).toBe('claude-sonnet-5');
    expect(reducePicker(nav(), { kind: 'jump', index: 9 }, SPEC, 8).nav.selectedId).toBe('claude-fable-5-1'); // out of window → no-op
  });
  it('typing narrows and realigns; backspace widens; Esc clears the filter before closing', () => {
    const typed = reducePicker(nav(), { kind: 'type', ch: 'q' }, SPEC, 8);
    expect(typed.nav).toMatchObject({ query: 'q', selectedId: 'qwen3:8b' });
    const back = reducePicker(typed.nav, { kind: 'backspace' }, SPEC, 8);
    expect(back.nav.query).toBe('');
    const esc1 = reducePicker(typed.nav, { kind: 'close' }, SPEC, 8);
    expect(esc1).toEqual({ nav: { ...typed.nav, query: '' }, effect: null });
    const esc2 = reducePicker(nav(), { kind: 'close' }, SPEC, 8);
    expect(esc2.effect).toEqual({ kind: 'close' });
  });
  it('select on a blocked row reports the typed code and commits nothing', () => {
    const r = reducePicker(nav({ selectedId: 'gpt-5.6-sol' }), { kind: 'select' }, SPEC, 8);
    expect(r.effect).toEqual({ kind: 'blocked', id: 'gpt-5.6-sol', code: 'MODEL_INACTIVE' });
    expect(r.nav.stage).toBe('pick');
  });
  it('select with two scopes enters the scope stage; Enter there commits the chosen scope; cancel closes', () => {
    const s = reducePicker(nav({ selectedId: 'claude-sonnet-5' }), { kind: 'select' }, SPEC, 8);
    expect(s.nav).toMatchObject({ stage: 'scope', scopeIdx: 0 });
    expect(s.effect).toBeNull();
    const moved = reducePicker(s.nav, { kind: 'scope', by: 1 }, SPEC, 8);
    expect(moved.nav.scopeIdx).toBe(1);
    const committed = reducePicker(moved.nav, { kind: 'select' }, SPEC, 8);
    expect(committed.effect).toEqual({ kind: 'commit', id: 'claude-sonnet-5', scope: 'default' });
    const back = reducePicker(s.nav, { kind: 'close' }, SPEC, 8);
    expect(back.nav.stage).toBe('pick');
    expect(back.effect).toBeNull();
    const withCancel: PickerSpec = { ...SPEC, scopes: ['apply', 'cancel'] };
    const s2 = reducePicker(nav({ selectedId: 'claude-sonnet-5' }), { kind: 'select' }, withCancel, 8);
    const cancelled = reducePicker({ ...s2.nav, scopeIdx: 1 }, { kind: 'select' }, withCancel, 8);
    expect(cancelled.effect).toEqual({ kind: 'close' });
  });
  it('select with one scope commits immediately; interrupt surfaces as an effect', () => {
    const r = reducePicker(initialPickerNav(ONE_SCOPE), { kind: 'select' }, ONE_SCOPE, 8);
    expect(r.effect).toEqual({ kind: 'commit', id: 'ask', scope: 'apply' });
    expect(reducePicker(nav(), { kind: 'interrupt' }, SPEC, 8).effect).toEqual({ kind: 'interrupt' });
  });
});

describe('row fitting + glyphs — display cells, facts drop before the label truncates', () => {
  it('fits within columns by dropping trailing facts first, then truncating the label', () => {
    const full = fitPickerRow({ label: 'claude-fable-5-1', facts: ['claude', 'premium', '200k ctx', 'ga'], state: 'current' }, 80);
    expect(full).toEqual({ line: 'claude-fable-5-1  claude · premium · 200k ctx · ga  [current]', dropped: 0, truncated: false });
    const narrow = fitPickerRow({ label: 'claude-fable-5-1', facts: ['claude', 'premium', '200k ctx', 'ga'], state: 'current' }, 40);
    expect(narrow.dropped).toBeGreaterThan(0);
    expect(narrow.line.length).toBeLessThanOrEqual(40);
    expect(narrow.line.endsWith('[current]')).toBe(true);
    const tiny = fitPickerRow({ label: 'a-very-long-model-identifier-that-overflows', facts: [], state: 'ok' }, 20);
    expect(tiny.truncated).toBe(true);
    expect(tiny.line).toContain('…');
    expect(tiny.line.endsWith('[ok]')).toBe(true);
  });
  it('glyphs degrade to ASCII on request', () => {
    expect(resolvePickerGlyphs(false)).toEqual({ cursor: '❯', up: '↑', down: '↓', reveal: '↳', on: '◉', off: '○' });
    expect(resolvePickerGlyphs(true)).toEqual({ cursor: '>', up: '^', down: 'v', reveal: '->', on: '(x)', off: '( )' });
  });
});

describe('readline / line degradation — numbered lines and typed-argument resolution', () => {
  it('pickerLinesFor renders title, numbered rows with facts and state, and the typed hint', () => {
    const lines = pickerLinesFor(SPEC, EN, resolvePickerGlyphs(true), '/model');
    expect(lines[0]).toBe(EN.title.model);
    expect(lines[1]).toBe('  1) claude-fable-5-1  claude · premium  [current]');
    expect(lines[3]).toBe(`  3) gpt-5.6-sol  openai  [blocked: ${EN.blocked['MODEL_INACTIVE']}]`);
    expect(lines[lines.length - 1]).toBe(EN.typedHint.replace('{command}', '/model'));
  });
  it('resolvePickerArg accepts a 1-based number or an exact id/label (case-insensitive)', () => {
    expect(resolvePickerArg('2', CANDS)).toEqual({ kind: 'found', candidate: CANDS[1] });
    expect(resolvePickerArg('QWEN3:8B', CANDS)).toEqual({ kind: 'found', candidate: CANDS[3] });
    expect(resolvePickerArg('9', CANDS)).toEqual({ kind: 'not-found' });
    expect(resolvePickerArg('nope', CANDS)).toEqual({ kind: 'not-found' });
    const dup = [c('a', 'ok', { label: 'same' }), c('b', 'ok', { label: 'same' })];
    expect(resolvePickerArg('same', dup)).toMatchObject({ kind: 'ambiguous' });
  });
});

describe('blocked reasons — {detail} substitution', () => {
  it('pickerBlockedReason fills {detail} from the candidate detail and never leaks the placeholder', () => {
    const withDetail = pickerBlockedReason('MISSING_CREDENTIAL', EN, 'claude needs an API key');
    expect(withDetail).toContain('claude needs an API key');
    expect(withDetail).not.toContain('{detail}');
    expect(pickerBlockedReason('MISSING_CREDENTIAL', EN)).not.toContain('{detail}');
    const row = c('claude-x', 'blocked', { blockedCode: 'MISSING_CREDENTIAL', detail: 'no key' });
    expect(pickerStateWord(row, EN)).toBe(`${EN.states.blocked}: ${EN.blocked['MISSING_CREDENTIAL']!.replace('{detail}', 'no key')}`);
  });
});

describe('labels — required, en/tr, guarded', () => {
  it('buildPickerLabels resolves every field in en and tr; the guard throws on a missing one', () => {
    const tr = buildPickerLabels((k) => getMessage(k, 'tr'));
    expect(EN.title.model).not.toBe(tr.title.model);
    expect(EN.scopes.session.length).toBeGreaterThan(0);
    expect(EN.blocked['MODEL_INACTIVE']).toContain('inactive');
    expect(() => assertPickerLabels({ ...EN, hintPick: '' })).toThrow(InjectedLabelMissingError);
    expect(() => assertPickerLabels(EN)).not.toThrow();
  });
});
