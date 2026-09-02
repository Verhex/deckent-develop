// tests/cli/repl/shell-confirm-once.test.tsx
// ═══ TERMINAL-TOOLS-013 — design-critic closure for 011/012 ═══════════════════
//
// BLOCKS finding: a `!<cmd>` line was confirmed by the legacy modal whose
// `a = always allow` called perms.allow('deckent_bash') — the operator thought
// they were approving THEIR OWN shell line, the effect was a session-wide grant
// for every MODEL-proposed bash call. §4: "A longer grant is a separate governed
// flow." A user-shell confirm is now one-time: the card hides `a`, the key
// mapper ignores it, and the queue never cascades it. Also: the composer's
// "ready · your turn" line yields to an explicit "input paused" carrier while a
// card owns stdin, and a denied `!` no longer prints the raw denial marker.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { confirmKeyToAnswer, createConfirmQueue } from '../../../src/cli/repl/app.js';
import { buildReplLabels } from '../../../src/cli/repl/run.js';
import { getMessage, getMessageLanguages } from '../../../src/cli/helpers/messages.js';

const ROOT = join(__dirname, '..', '..', '..');

describe('confirmKeyToAnswer — one-time cards have no "always"', () => {
  it('ignores a/A for a one-time card and still decides y/n', () => {
    expect(confirmKeyToAnswer('a', {}, { oneTime: true })).toBeNull();
    expect(confirmKeyToAnswer('A', {}, { oneTime: true })).toBeNull();
    expect(confirmKeyToAnswer('y', {}, { oneTime: true })).toBe('y');
    expect(confirmKeyToAnswer('n', {}, { oneTime: true })).toBe('n');
    expect(confirmKeyToAnswer('a', {})).toBe('a');            // model-proposed cards keep it
  });
});

describe('createConfirmQueue — a one-time head never grants or cascades', () => {
  it('resolves "a" as "y" for a one-time request and leaves same-tool siblings pending', () => {
    const q = createConfirmQueue(() => {});
    const answers: string[] = [];
    q.enqueue({ summary: 'shell', toolName: 'deckent_bash', oneTime: true, resolve: (a) => answers.push(`shell:${a}`) });
    q.enqueue({ summary: 'model', toolName: 'deckent_bash', resolve: (a) => answers.push(`model:${a}`) });
    expect(q.head()).toMatchObject({ summary: 'shell', oneTime: true });
    q.answer('a');
    expect(answers).toEqual(['shell:y']);
    expect(q.size()).toBe(1);                                  // the model card is still waiting
    expect(q.head()).toMatchObject({ summary: 'model', oneTime: false });
  });
});

describe('labels + catalog', () => {
  it('confirmHintOnce and inputPaused exist in en and tr and the once-hint carries no "a"', () => {
    for (const lang of ['en', 'tr'] as const) {
      const labels = buildReplLabels((k) => getMessage(k, lang));
      expect(labels.confirmHintOnce).not.toMatch(/\ba\s*=/);
      expect(labels.confirmHintOnce).toMatch(/y\s*=/);
      expect(labels.inputPaused.length).toBeGreaterThan(0);
    }
    expect(getMessageLanguages('tui.confirm_hint_once')).toEqual(expect.arrayContaining(['en', 'tr']));
    expect(getMessageLanguages('tui.input_paused')).toEqual(expect.arrayContaining(['en', 'tr']));
  });
});

describe('wiring — app.tsx', () => {
  const app = readFileSync(join(ROOT, 'src/cli/repl/app.tsx'), 'utf-8');
  it('marks the `!` dispatch window, enqueues its confirm as one-time, hides the raw denial marker and shows the paused carrier', () => {
    expect(app).toMatch(/shellConfirmRef\.current = true/);
    expect(app).toMatch(/oneTime: shellConfirmRef\.current && toolName === 'deckent_bash'/);
    expect(app).toMatch(/confirm\.oneTime \? labels\.confirmHintOnce : labels\.confirmHint/);
    expect(app).toMatch(/confirmKeyToAnswer\(input, key, \{ oneTime: /);
    expect(app).toMatch(/if \(!isDeniedShellOutput\(out\)\) \{/);
    expect(app).toMatch(/labels\.inputPaused/);
  });
});
