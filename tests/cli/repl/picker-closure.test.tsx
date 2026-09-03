// tests/cli/repl/picker-closure.test.tsx
// ═══ TERMINAL-PICKER-007 (P15g) — design-critic closure for 001…005 ═══════════
//
// BLOCKS: (1) Ctrl-C with a picker open exited on ONE press — the card's own
// Ctrl-C mapping called handleInterrupt AND the app-level hook (active while
// the input bar is not the owner) handled the same keypress; the card now only
// closes and the app hook arms the two-press policy as for any other card.
// (2) The readline/legacy path marked every provider `[ok]` with no
// reachability evidence (RECONCILIATION L204) — it now says `unknown`.
// (3) An object-valued setting rendered "[object Object]" in the /config key
// facts — values are formatted (compact JSON, bounded).
// SHOULD-FIX closed here: digit jumps removed (rows carry no numbers), label
// column aligned, contextual Esc hint under a filter, blocked reason shown
// once, value-picker title names the key, "{n} models" fact, providers with
// zero models blocked, term rows carry the localized posture label, narrow
// lines drop facts, readline hints promise only what resolves.

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { PickerCard } from '../../../src/cli/repl/picker-card.js';
import { mapPickerKey, fitPickerRow, pickerLinesFor, resolvePickerGlyphs, type PickerSpec } from '../../../src/cli/repl/picker.js';
import { buildPickerLabels } from '../../../src/cli/repl/picker-labels.js';
import { buildModelPickerSpec, buildProviderPickerSpec, buildTermPickerSpec, buildConfigValuePickerSpec, formatConfigValue, type PickerSpecContext } from '../../../src/cli/repl/picker-specs.js';
import { buildLegacyPickerSpecs } from '../../../src/cli/repl/picker-legacy.js';
import { runChatNativeLoop, type ChatProviderAdapter } from '../../../src/cli/commands/chat-native.js';
import { getMessage } from '../../../src/cli/helpers/messages.js';

const ROOT = join(__dirname, '..', '..', '..');
const EN = buildPickerLabels((k) => getMessage(k, 'en'));
const TR = buildPickerLabels((k) => getMessage(k, 'tr'));
const ESC = String.fromCharCode(27);
const DOWN = '\x1b[B';
const ENTER = '\r';
const tick = (ms = 20): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('keys — no silent digit jumps; j/k documented', () => {
  it('a digit types into the filter instead of jumping to an unnumbered row', () => {
    expect(mapPickerKey('4', {}, { queryEmpty: true, stage: 'pick' })).toEqual({ kind: 'type', ch: '4' });
    expect(EN.hintPick).toMatch(/j\s*k|j\/k/);
  });
});

describe('row fitting — aligned state column, narrow lines drop facts', () => {
  it('fitPickerRow pads the label to labelWidth so the facts/state column lines up', () => {
    const a = fitPickerRow({ label: 'ask', facts: ['Read'], state: 'ok' }, 80, { labelWidth: 8 });
    const b = fitPickerRow({ label: 'control', facts: ['Read'], state: 'ok' }, 80, { labelWidth: 8 });
    expect(a.line.indexOf('Read')).toBe(b.line.indexOf('Read'));
    expect(a.line.startsWith('ask     ')).toBe(true);
  });
  it('pickerLinesFor drops facts under a width budget and can omit the typed hint', () => {
    const spec: PickerSpec = { kind: 'model', initialId: null, scopes: ['apply'], candidates: [{ id: 'a-very-long-model-id-name', label: 'a-very-long-model-id-name', facts: [{ key: 'p', value: 'provider' }, { key: 't', value: 'premium_plus' }, { key: 'c', value: '1000k' }], state: 'ok' }] };
    const wide = pickerLinesFor(spec, EN, resolvePickerGlyphs(true), '/model');
    const narrow = pickerLinesFor(spec, EN, resolvePickerGlyphs(true), '/model', { width: 38, typedHint: false });
    expect(wide[1]).toContain('1000k');
    expect(narrow[1]!.length).toBeLessThanOrEqual(38);
    expect(narrow[1]).toContain('[ok]');
    expect(narrow[narrow.length - 1]).not.toBe(EN.typedHint.replace('{command}', '/model'));
  });
});

describe('specs — evidence-honest states and localized facts', () => {
  const base = (over: Partial<PickerSpecContext> = {}): PickerSpecContext => ({
    providers: ['ollama', 'local-llm'],
    candidatesFor: (p) => (p === 'ollama' ? [{ provider: 'ollama', id: 'q', definition: null }] : []),
    policy: { isExecutable: () => true, providerMode: () => 'implicit-active' },
    current: { provider: 'ollama', model: 'q' },
    availability: () => ({ ok: true }),
    ...over,
  });
  it("an availability of 'unknown' yields state unknown (never a false ok); the legacy path uses it", () => {
    const spec = buildModelPickerSpec(base({ availability: () => ({ ok: 'unknown' }), current: { provider: 'x', model: null } }));
    expect(spec.candidates[0]!.state).toBe('unknown');
    const legacy = buildLegacyPickerSpecs(() => ({ provider: 'nope', model: null }), () => process.cwd());
    const rows = legacy.model!().candidates;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((c) => c.state === 'unknown' || c.state === 'blocked')).toBe(true);
  });
  it('a provider with zero listed models is blocked NO_MODELS_LISTED and the models fact is localized', () => {
    const spec = buildProviderPickerSpec(base({ modelsFact: (n) => EN.factModels.replace('{n}', String(n)) }));
    expect(spec.candidates.find((c) => c.id === 'local-llm')).toMatchObject({ state: 'blocked', blockedCode: 'NO_MODELS_LISTED' });
    expect(spec.candidates[0]!.facts[0]!.value).toBe(EN.factModels.replace('{n}', '1'));
    expect(EN.blocked['NO_MODELS_LISTED']!.length).toBeGreaterThan(0);
  });
  it('term rows carry the localized posture label while the id stays the token', () => {
    const spec = buildTermPickerSpec(['ask', 'run'] as const, 'ask', () => 'Read', (m) => (m === 'ask' ? 'Sor' : 'Çalıştır'));
    expect(spec.candidates.map((c) => [c.id, c.label])).toEqual([['ask', 'Sor'], ['run', 'Çalıştır']]);
  });
  it('the value picker names its key in the title subject', () => {
    expect(buildConfigValuePickerSpec('output_mode', ['a'], 'a').titleSubject).toBe('output_mode');
    expect(EN.title['config-value']).toContain('{key}');
  });
  it('formatConfigValue never yields [object Object] and bounds long values', () => {
    expect(formatConfigValue({ approvals: true })).toBe('{"approvals":true}');
    expect(formatConfigValue(['a', 'b'])).toBe('["a","b"]');
    expect(formatConfigValue(undefined)).toBe('-');
    expect(formatConfigValue(null)).toBe('-');
    expect(formatConfigValue(true)).toBe('true');
    expect(formatConfigValue('x'.repeat(80)).length).toBeLessThanOrEqual(41);
    expect(formatConfigValue({ a: 1 })).not.toContain('[object');
  });
});

describe('card — contextual hint, single blocked reason, title subject', () => {
  const SPEC: PickerSpec = {
    kind: 'config-value', initialId: 'normal', scopes: ['apply', 'cancel'], titleSubject: 'output_mode',
    candidates: [
      { id: 'quiet', label: 'quiet', facts: [], state: 'ok' },
      { id: 'normal', label: 'normal', facts: [], state: 'current' },
      { id: 'blocked-x', label: 'blocked-x', facts: [], state: 'blocked', blockedCode: 'NOT_ENUMERABLE' },
    ],
  };
  const card = (extra: Record<string, unknown> = {}): React.ReactElement => (
    <PickerCard spec={SPEC} labels={EN} glyphs={resolvePickerGlyphs(false)} columns={100} rows={40} onCommit={() => {}} onClose={() => {}} onInterrupt={() => {}} {...extra} />
  );
  it('renders the title with the key, swaps the hint while a filter is active, and shows a blocked reason once on Enter', async () => {
    const { lastFrame, stdin } = render(card());
    await tick();
    let frame = lastFrame() ?? '';
    expect(frame).toContain(EN.title['config-value'].replace('{key}', 'output_mode'));
    expect(frame).toContain(EN.hintPick);
    stdin.write('blo'); await tick(40);
    frame = lastFrame() ?? '';
    expect(frame).toContain(EN.hintFilterEsc);
    expect(frame).not.toContain(EN.hintPick);
    stdin.write(ENTER); await tick(40);
    frame = lastFrame() ?? '';
    const reason = EN.blocked['NOT_ENUMERABLE']!;
    expect(frame.split(reason).length - 1).toBe(1);
  });
  it('Ctrl-C only asks the app to close (the app hook arms the two-press exit)', async () => {
    const onInterrupt = vi.fn();
    const { stdin } = render(card({ onInterrupt }));
    await tick();
    stdin.write('\x03'); await tick(40);
    expect(onInterrupt).toHaveBeenCalledTimes(1);
  });
  void DOWN; void ESC; void TR;
});

describe('readline — hints promise only what resolves; /provider usage names the current selection', () => {
  async function* lines(...items: string[]): AsyncGenerator<string> { for (const l of items) yield l; }
  const provider: ChatProviderAdapter = { send: async () => ({ text: 'x', stopReason: 'end_turn' }) };
  it('bare /approve lists without the <n|id> hint and names the typed form; bare /provider appends the current provider', async () => {
    const out: string[] = [];
    const approve: PickerSpec = { kind: 'approve', initialId: 'suggest', scopes: ['apply'], candidates: [{ id: 'suggest', label: 'suggest', facts: [], state: 'current' }] };
    const prov: PickerSpec = { kind: 'provider', initialId: 'ollama', scopes: ['session'], candidates: [{ id: 'ollama', label: 'ollama', facts: [{ key: 'models', value: '2 models' }], state: 'current' }] };
    await runChatNativeLoop({
      provider, dispatcher: { dispatch: async () => '' }, input: lines('/approve', '/provider'), output: (l) => out.push(l),
      pickerSpecs: { approve: () => approve, provider: () => prov }, pickerLabels: EN,
    });
    const text = out.join('\n');
    const approveText = out[0] ?? '';
    expect(approveText).not.toContain(EN.typedHint.replace('{command}', '/approve'));
    expect(approveText).toContain(EN.typedForm.replace('{command}', '/approve'));
    expect(approveText).not.toContain('<n|id>');           // no resolver on this surface → no promise
    const usageAt = text.indexOf(getMessage('tui.switch_usage', 'en'));
    expect(usageAt).toBeGreaterThanOrEqual(0);
    expect(text.slice(usageAt).split('\n')[0]).toContain('ollama');
  });
});

describe('wiring — app.tsx closure', () => {
  const app = readFileSync(join(ROOT, 'src/cli/repl/app.tsx'), 'utf-8');
  it('the picker Ctrl-C path only closes the card, the card is keyed per opening, and config facts use formatConfigValue', () => {
    expect(app).toMatch(/onInterrupt=\{\(\) => setPicker\(null\)\}/);
    expect(app).not.toMatch(/onInterrupt=\{\(\) => \{ setPicker\(null\); handleInterrupt/);
    expect(app).toMatch(/<PickerCard\s+key=\{/);
    expect(app).toMatch(/formatConfigValue\(e\.current\)/);
    expect(app).toMatch(/pickerLabels\.readOnlyBusy/);
  });
});
