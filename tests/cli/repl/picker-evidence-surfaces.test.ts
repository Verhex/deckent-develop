// tests/cli/repl/picker-evidence-surfaces.test.ts
// ═══ TERMINAL-PROVIDER-EVIDENCE-001 — the evidence store reaches both surfaces ═══
//
// readline: a bare `/model` / `/provider` waits (bounded) for the shared
// evidence refresh before printing, so the numbered rows say ok / blocked
// instead of a permanent [unknown]; a refresh that overruns the bound never
// blocks the surface. Legacy specs take the store's availability. The Ink App
// subscribes and rebuilds an open picker when evidence lands. Typed blocked
// codes NOT_LOGGED_IN / UNREACHABLE have catalog rows in both languages.
// Hermetic (fakes, source scans).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { runChatNativeLoop, type ChatProviderAdapter } from '../../../src/cli/commands/chat-native.js';
import { buildLegacyPickerSpecs } from '../../../src/cli/repl/picker-legacy.js';
import { buildPickerLabels } from '../../../src/cli/repl/picker-labels.js';
import { getMessage, getMessageLanguages } from '../../../src/cli/helpers/messages.js';
import { CLI_TERMINAL_PICKER_MESSAGES } from '../../../src/cli/helpers/message-catalog/cli-terminal-picker.js';
import { modelRegistry } from '../../../src/core/model-registry.js';
import type { PickerSpec } from '../../../src/cli/repl/picker.js';
import type { ProviderAvailability } from '../../../src/cli/repl/picker-specs.js';

const ROOT = join(__dirname, '..', '..', '..');
const EN = buildPickerLabels((k) => getMessage(k, 'en'));

async function* lines(...items: string[]): AsyncGenerator<string> { for (const l of items) yield l; }
const noopDispatcher = () => ({ dispatch: async () => '' });
const provider: ChatProviderAdapter = { send: async () => ({ text: 'x', stopReason: 'end_turn' }) };

function specWith(state: 'ok' | 'unknown'): PickerSpec {
  return {
    kind: 'model', initialId: 'm-current', scopes: ['session'],
    candidates: [
      { id: 'm-current', label: 'm-current', facts: [], state: 'current' },
      { id: 'm-other', label: 'm-other', facts: [], state },
    ],
  };
}

describe('readline — bare /model waits (bounded) for the shared evidence refresh', () => {
  it('prints ok rows once the refresh resolved', async () => {
    let refreshed = false;
    const out: string[] = [];
    await runChatNativeLoop({
      provider, dispatcher: noopDispatcher(), input: lines('/model'), output: (l) => out.push(l),
      pickerSpecs: { model: () => specWith(refreshed ? 'ok' : 'unknown') }, pickerLabels: EN,
      pickerEvidence: { refresh: async () => { refreshed = true; }, subscribe: () => () => {} },
    });
    expect(out.join('\n')).toContain(`[${EN.states.ok}]`);
    expect(out.join('\n')).not.toContain(`[${EN.states.unknown}]`);
  });

  it('a refresh that overruns the bound leaves [unknown] rows and never blocks the surface', async () => {
    const out: string[] = [];
    await runChatNativeLoop({
      provider, dispatcher: noopDispatcher(), input: lines('/model'), output: (l) => out.push(l),
      pickerSpecs: { model: () => specWith('unknown') }, pickerLabels: EN,
      pickerEvidence: { refresh: () => new Promise(() => { /* never */ }), subscribe: () => () => {}, refreshTimeoutMs: 20 },
    });
    expect(out.join('\n')).toContain(`[${EN.states.unknown}]`);
  });
});

describe('legacy specs take the store availability', () => {
  it('rows are ok / typed blocked / unknown from the injected availability', () => {
    const providers = modelRegistry.getAllProviders();
    const [first, second] = providers;
    const availability = (p: string): ProviderAvailability =>
      p === first ? { ok: true } : p === second ? { ok: false, code: 'NOT_LOGGED_IN', detail: 'no session' } : { ok: 'unknown' };
    const specs = buildLegacyPickerSpecs(() => ({ provider: 'nobody', model: null }), () => ROOT, undefined, undefined, availability);
    const spec = specs.provider!();
    const row = (id: string) => spec.candidates.find((c) => c.id === id)!;
    expect(row(first!).state).toBe('ok');
    expect(row(second!)).toMatchObject({ state: 'blocked', blockedCode: 'NOT_LOGGED_IN', detail: 'no session' });
    if (providers.length > 2) expect(row(providers[2]!).state).toBe('unknown');
  });
  it('without a store every row stays unknown (never a false ok)', () => {
    const spec = buildLegacyPickerSpecs(() => ({ provider: 'nobody', model: null }), () => ROOT).provider!();
    expect(spec.candidates.every((c) => c.state === 'unknown' || c.state === 'blocked')).toBe(true);
  });
});

describe('typed blocked codes have catalog rows and label entries', () => {
  it('NOT_LOGGED_IN and UNREACHABLE exist in every language and reach PickerLabels.blocked', () => {
    for (const code of ['NOT_LOGGED_IN', 'UNREACHABLE']) {
      const key = `tui.picker.blocked.${code}`;
      const row = CLI_TERMINAL_PICKER_MESSAGES[key];
      expect(row, code).toBeDefined();
      const langs = getMessageLanguages(key);
      expect(langs, code).toEqual(expect.arrayContaining(['en', 'tr']));
      for (const lang of langs) expect((row as Record<string, string>)[lang]?.length ?? 0, `${code}/${lang}`).toBeGreaterThan(0);
      expect(EN.blocked[code]?.length ?? 0).toBeGreaterThan(0);
    }
    expect(EN.blocked['UNREACHABLE']).toContain('{detail}');
  });
});

describe('wiring (source scan)', () => {
  it('run.tsx and entry.ts create the store; app.tsx subscribes; chat-native awaits it', () => {
    const run = readFileSync(join(ROOT, 'src/cli/repl/run.tsx'), 'utf-8');
    const entry = readFileSync(join(ROOT, 'src/cli/entry.ts'), 'utf-8');
    const app = readFileSync(join(ROOT, 'src/cli/repl/app.tsx'), 'utf-8');
    const loop = readFileSync(join(ROOT, 'src/cli/commands/chat-native.ts'), 'utf-8');
    expect(run).toMatch(/createProviderEvidence\(/);
    expect(run).toMatch(/pickerEvidence=\{/);
    expect(entry).toMatch(/createProviderEvidence\(/);
    expect(entry).toMatch(/pickerEvidence:/);
    expect(app).toMatch(/pickerEvidence\.subscribe\(/);
    expect(loop).toMatch(/awaitEvidence\(opts\.pickerEvidence\)/);
    expect(loop).toMatch(/evidence\.refresh\(\)/);
  });
});
