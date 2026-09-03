// tests/cli/repl/readline-authority.test.ts
// ═══ TERMINAL-SESSION-AUTHORITY-001 — /term, /approve, /config APPLY on the readline surface ═══
//
// Owner decision (2026-09-03): the readline loop (DECKENT_INK=0, restricted
// consoles, SSH) only LISTED these choices. With the shared session authority
// injected, `/term <n|mode>` and `/approve <n|mode>` apply through the same
// transitions the Ink App uses, `/config <n|key> <m|value>` writes through the
// injected config seam, a bare listing on a TTY asks a numbered "Choice"
// question through the injected prompt seam (Enter cancels, zero side
// effects), and the chat mode follows the authority's posture per turn.
// Hermetic (fakes; no I/O).

import { describe, it, expect } from 'vitest';
import { runChatNativeLoop, type ChatProviderAdapter } from '../../../src/cli/commands/chat-native.js';
import { createSessionAuthority } from '../../../src/cli/repl/session-authority.js';
import { buildPickerLabels } from '../../../src/cli/repl/picker-labels.js';
import { buildTermPickerSpec, buildApprovalPickerSpec, buildConfigKeyPickerSpec, buildConfigValuePickerSpec } from '../../../src/cli/repl/picker-specs.js';
import { TERM_MODES } from '../../../src/cli/repl/term-mode.js';
import { APPROVAL_MODES } from '../../../src/agent/permission-types.js';
import { getMessage } from '../../../src/cli/helpers/messages.js';

const EN = buildPickerLabels((k) => getMessage(k, 'en'));
async function* lines(...items: string[]): AsyncGenerator<string> { for (const l of items) yield l; }
const noopDispatcher = () => ({ dispatch: async () => '' });
const provider: ChatProviderAdapter = { send: async () => ({ text: 'x', stopReason: 'end_turn' }) };

function harness(input: string[], extra: Record<string, unknown> = {}) {
  const authority = createSessionAuthority({ posture: 'ask' });
  const out: string[] = [];
  const writes: Array<[string, string]> = [];
  const entries = [
    { key: 'language', category: 'Core', type: "'en' | 'tr'", options: ['en', 'tr'], defaultValue: 'en', current: 'en' },
    { key: 'mode', category: 'Sprint', type: 'string', options: ['performance', 'balanced'], defaultValue: 'balanced', current: undefined },
  ];
  const run = runChatNativeLoop({
    provider, dispatcher: noopDispatcher(), input: lines(...input), output: (l) => out.push(l),
    pickerLabels: EN,
    authority,
    pickerSpecs: {
      term: () => buildTermPickerSpec(TERM_MODES, authority.posture(), () => 'risks', (m) => m),
      approve: () => buildApprovalPickerSpec(APPROVAL_MODES, authority.approval(), (m) => EN.approveFacts[m]),
      'config-key': () => buildConfigKeyPickerSpec(entries, (e) => [e.category]),
    },
    configValueSpec: (key: string) => {
      const e = entries.find((x) => x.key === key);
      return e?.options ? buildConfigValuePickerSpec(key, e.options, e.current) : null;
    },
    applyConfig: (key: string, value: string) => { writes.push([key, value]); return { ok: true as const }; },
    ...extra,
  });
  return { authority, out, writes, run };
}

describe('/term on readline', () => {
  it('bare /term prints the status line and the numbered postures; a number applies through the authority', async () => {
    const h = harness(['/term', '/term 2']);
    await h.run;
    const text = h.out.join('\n');
    expect(text).toContain(getMessage('tui.term_status', 'en', { mode: getMessage('tui.mode_ask', 'en'), approval: 'suggest' }));
    expect(text).toContain('1) ask');
    expect(text).toContain(getMessage('tui.term_switched', 'en', { mode: getMessage('tui.mode_run', 'en') }));
    expect(h.authority.posture()).toBe('run');
  });
  it('/term <mode> applies by name; an unknown word gets the usage line and changes nothing', async () => {
    const h = harness(['/term control', '/term bogus']);
    await h.run;
    expect(h.authority.posture()).toBe('control');
    expect(h.out.join('\n')).toContain(getMessage('tui.term_usage', 'en'));
  });
});

describe('/approve on readline', () => {
  it('applies by number or name through the authority and reports the set mode', async () => {
    const h = harness(['/approve 3', '/approve auto-edit']);
    await h.run;
    expect(h.authority.approval()).toBe('auto-edit');
    const text = h.out.join('\n');
    expect(text).toContain(`${getMessage('tui.approval_set', 'en')}: full-auto`);
    expect(text).toContain(`${getMessage('tui.approval_set', 'en')}: auto-edit`);
  });
});

describe('/config on readline', () => {
  it('lists keys, then values for a chosen key, then writes through the config seam', async () => {
    const h = harness(['/config', '/config 1', '/config 1 2', '/config mode balanced']);
    await h.run;
    const text = h.out.join('\n');
    expect(text).toContain('1) language');
    expect(text).toContain('1) en');
    expect(h.writes).toEqual([['language', 'tr'], ['mode', 'balanced']]);
    expect(text).toContain(EN.committed.config.replace('{key}', 'language').replace('{value}', 'tr'));
  });
  it('a value outside the key\'s options is refused with the not-found line', async () => {
    const h = harness(['/config language xx']);
    await h.run;
    expect(h.writes).toEqual([]);
    expect(h.out.join('\n')).toContain(EN.notFound.replace('{arg}', 'xx'));
  });
});

describe('numbered choice prompt on a TTY', () => {
  it('a bare listing asks through askChoice; a number applies, Enter cancels with zero side effects', async () => {
    const answers = ['3', ''];
    const prompts: string[] = [];
    const h = harness(['/term', '/approve'], { askChoice: async (prompt: string) => { prompts.push(prompt); return answers.shift() ?? ''; } });
    await h.run;
    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toBe(EN.choicePrompt.replace('{n}', '3'));
    expect(h.authority.posture()).toBe('control');
    expect(h.authority.approval()).toBe('suggest');
  });
});

describe('chat mode follows the authority posture', () => {
  it('/help hides the enterprise group in Ask and lists it after /term control', async () => {
    const h = harness(['/help', '/term control', '/help']);
    await h.run;
    const switched = h.out.findIndex((l) => l.includes(getMessage('tui.term_switched', 'en', { mode: getMessage('tui.mode_control', 'en') })));
    expect(switched).toBeGreaterThan(0);
    const before = h.out.slice(0, switched).join('\n');
    const after = h.out.slice(switched + 1).join('\n');
    expect(before).not.toContain('/audit');
    expect(after).toContain('/audit');
  });
});
