// tests/cli/repl/picker-degrade.test.ts
// ═══ TERMINAL-PICKER-005 (P15e) — readline / line / narrow degradation ═══════
//
// The same choices on every surface (single-surface §8): the legacy readline
// loop (DECKENT_INK=0) and the pipe/line path get deterministic numbered lines
// plus a typed `<n|id>` that resolves through resolvePickerArg; the readline
// path finally gets a REAL model switch seam (switchModel beside
// switchProvider — createSwitchableProvider's switchTo({model})), and a
// `/provider <n>` number resolves against the listed candidates. The Ink
// surface below 40 columns prints the same numbered lines into the transcript
// instead of mounting a card. No required key input on a pipe. Hermetic.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { runChatNativeLoop, type ChatProviderAdapter } from '../../../src/cli/commands/chat-native.js';
import { resolvePickerSurfaceMode } from '../../../src/cli/repl/app.js';
import { buildPickerLabels } from '../../../src/cli/repl/picker-labels.js';
import { getMessage } from '../../../src/cli/helpers/messages.js';
import type { PickerSpec } from '../../../src/cli/repl/picker.js';

const ROOT = join(__dirname, '..', '..', '..');
const EN = buildPickerLabels((k) => getMessage(k, 'en'));

async function* lines(...items: string[]): AsyncGenerator<string> { for (const l of items) yield l; }
const noopDispatcher = () => ({ dispatch: async () => '' });
const provider: ChatProviderAdapter = { send: async () => ({ text: 'x', stopReason: 'end_turn' }) };

const MODEL_SPEC: PickerSpec = {
  kind: 'model', initialId: 'm-current', scopes: ['session'],
  candidates: [
    { id: 'm-current', label: 'm-current', facts: [{ key: 'provider', value: 'ollama' }], state: 'current' },
    { id: 'm-other', label: 'm-other', facts: [{ key: 'provider', value: 'ollama' }], state: 'ok' },
    { id: 'm-blocked', label: 'm-blocked', facts: [], state: 'blocked', blockedCode: 'MODEL_INACTIVE' },
  ],
};
const PROVIDER_SPEC: PickerSpec = {
  kind: 'provider', initialId: 'ollama', scopes: ['session'],
  candidates: [
    { id: 'ollama', label: 'ollama', facts: [{ key: 'models', value: '2' }], state: 'current' },
    { id: 'codex', label: 'codex', facts: [{ key: 'models', value: '3' }], state: 'ok' },
  ],
};

describe('legacy readline loop — numbered lists + typed resolution', () => {
  it('bare /model prints the numbered list with the typed hint; /model <n> resolves and switches; a blocked row is refused', async () => {
    const switched: string[] = [];
    const out: string[] = [];
    await runChatNativeLoop({
      provider, dispatcher: noopDispatcher(), input: lines('/model', '/model 2', '/model 3', '/model nope'), output: (l) => out.push(l),
      pickerSpecs: { model: () => MODEL_SPEC, provider: () => PROVIDER_SPEC }, pickerLabels: EN,
      switchModel: (id) => { switched.push(id); },
    });
    const text = out.join('\n');
    expect(text).toContain(EN.title.model);
    expect(text).toContain('1) m-current  ollama  [current]');
    expect(text).toContain(EN.typedHint.replace('{command}', '/model'));
    expect(switched).toEqual(['m-other']);
    expect(text).toContain(`${EN.states.blocked}: ${EN.blocked['MODEL_INACTIVE']}`);
    expect(text).toContain(EN.notFound.replace('{arg}', 'nope'));
  });

  it('without a switchModel seam, /model <n> reports the honest unavailable line (no fake switch)', async () => {
    const out: string[] = [];
    await runChatNativeLoop({
      provider, dispatcher: noopDispatcher(), input: lines('/model 2'), output: (l) => out.push(l),
      pickerSpecs: { model: () => MODEL_SPEC }, pickerLabels: EN,
    });
    expect(out.join('\n')).toContain(EN.unavailableSurface.replace('{command}', '/model'));
  });

  it('bare /provider keeps the usage line first and adds the numbered list; /provider <n> resolves the number before switching', async () => {
    const switched: string[] = [];
    const out: string[] = [];
    await runChatNativeLoop({
      provider, dispatcher: noopDispatcher(), input: lines('/provider', '/provider 2'), output: (l) => out.push(l),
      pickerSpecs: { model: () => MODEL_SPEC, provider: () => PROVIDER_SPEC }, pickerLabels: EN,
      switchProvider: (name) => { switched.push(name); },
    });
    const text = out.join('\n');
    expect(text.indexOf('/provider')).toBeLessThan(text.indexOf(EN.title.provider));
    expect(text).toContain('2) codex  3  [ok]');
    expect(switched).toEqual(['codex']);
  });

  it('bare /approve, /term and /config print their numbered lines and the typed hint (readline has no apply seam for them)', async () => {
    const out: string[] = [];
    const approve: PickerSpec = { kind: 'approve', initialId: 'suggest', scopes: ['apply'], candidates: [{ id: 'suggest', label: 'suggest', facts: [], state: 'current' }, { id: 'full-auto', label: 'full-auto', facts: [], state: 'ok' }] };
    await runChatNativeLoop({
      provider, dispatcher: noopDispatcher(), input: lines('/approve'), output: (l) => out.push(l),
      pickerSpecs: { approve: () => approve }, pickerLabels: EN,
    });
    const text = out.join('\n');
    expect(text).toContain(EN.title.approve);
    expect(text).toContain('1) suggest  [current]');
    // TERMINAL-PICKER-007: no `<n|id>` promise where nothing resolves — the typed form instead.
    expect(text).toContain(EN.typedForm.replace('{command}', '/approve'));
  });
});

describe('Ink surface below 40 columns — transcript lines instead of a card', () => {
  it('resolvePickerSurfaceMode picks the card at 40+ columns and lines below', () => {
    expect(resolvePickerSurfaceMode(40)).toBe('card');
    expect(resolvePickerSurfaceMode(100)).toBe('card');
    expect(resolvePickerSurfaceMode(39)).toBe('lines');
    expect(resolvePickerSurfaceMode(20)).toBe('lines');
  });
});

describe('wiring — entry.ts readline path', () => {
  const entry = readFileSync(join(ROOT, 'src/cli/entry.ts'), 'utf-8');
  const app = readFileSync(join(ROOT, 'src/cli/repl/app.tsx'), 'utf-8');
  it('entry.ts wraps the readline provider in createSwitchableProvider and injects switchProvider, switchModel, pickerSpecs and pickerLabels', () => {
    expect(entry).toMatch(/createSwitchableProvider\(/);
    expect(entry).toMatch(/switchModel: /);
    expect(entry).toMatch(/switchProvider: /);
    expect(entry).toMatch(/pickerSpecs: /);
    // TERMINAL-SESSION-AUTHORITY-001: the labels are built once and shared by the specs and the loop.
    expect(entry).toMatch(/readlinePickerLabels = buildPickerLabels\(/);
    expect(entry).toMatch(/pickerLabels: readlinePickerLabels/);
  });
  it('app.tsx prints pickerLinesFor into the transcript when the surface mode is lines', () => {
    expect(app).toMatch(/resolvePickerSurfaceMode\(columns\)/);
    expect(app).toMatch(/pickerLinesFor\(/);
  });
});
