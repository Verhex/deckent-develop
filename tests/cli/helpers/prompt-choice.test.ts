// tests/cli/helpers/prompt-choice.test.ts
// ═══ CLI-INTERACTIVE-001 — the CLI numbered choice primitive ═══
//
// The plain CLI reuses the Terminal picker's data + line renderer: the rows
// printed are pickerLinesFor's rows, the question is the catalog's
// choicePrompt, and a number / id / label resolves through resolvePickerArg.
// Enter cancels (zero side effects); a blocked row is never "chosen". Hermetic.

import { describe, it, expect } from 'vitest';
import { chooseFromSpec } from '../../../src/cli/helpers/prompt-choice.js';
import { buildPickerLabels } from '../../../src/cli/repl/picker-labels.js';
import { getMessage } from '../../../src/cli/helpers/messages.js';
import type { PickerSpec } from '../../../src/cli/repl/picker.js';

const EN = buildPickerLabels((k) => getMessage(k, 'en'));
const SPEC: PickerSpec = {
  kind: 'model', initialId: 'a', scopes: ['apply'],
  candidates: [
    { id: 'a', label: 'a', facts: [{ key: 'provider', value: 'claude' }], state: 'current' },
    { id: 'b-model', label: 'b-model', facts: [], state: 'ok' },
    { id: 'c', label: 'c', facts: [], state: 'blocked', blockedCode: 'MODEL_INACTIVE' },
  ],
};

function run(answer: string) {
  const out: string[] = [];
  const prompts: string[] = [];
  const outcome = chooseFromSpec(SPEC, EN, 'deckent models activate', (l) => out.push(l), async (p) => { prompts.push(p); return answer; });
  return { out, prompts, outcome };
}

describe('chooseFromSpec', () => {
  it('prints the numbered rows with the typed hint and asks the localized choice question', async () => {
    const { out, prompts } = run('');
    await Promise.resolve();
    expect(out.join('\n')).toContain('1) a');
    expect(out.join('\n')).toContain('2) b-model');
    expect(out.join('\n')).toContain(EN.typedHint.replace('{command}', 'deckent models activate'));
    expect(prompts).toEqual([EN.choicePrompt.replace('{n}', '3')]);
  });
  it('a number, an id or a label chooses; Enter cancels; unknown is not-found; blocked is reported', async () => {
    expect(await run('2').outcome).toMatchObject({ kind: 'chosen', candidate: { id: 'b-model' } });
    expect(await run('b-model').outcome).toMatchObject({ kind: 'chosen', candidate: { id: 'b-model' } });
    expect(await run('').outcome).toEqual({ kind: 'cancelled' });
    expect(await run('zzz').outcome).toEqual({ kind: 'not-found', arg: 'zzz' });
    expect(await run('3').outcome).toMatchObject({ kind: 'blocked', candidate: { id: 'c' } });
  });
});
