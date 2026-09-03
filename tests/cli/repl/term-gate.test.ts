// tests/cli/repl/term-gate.test.ts
// ═══ TERMINAL-TOOLS-011 — Ask/Run/Control gate + `!` shell passthrough ══════
//
// Single-surface contract §10.2: the risk ladder existed as a state machine
// but no App path called checkActionAllowed, so Ask and Run granted the same
// authority as Control. Now every Terminal action is gated — slash-dispatched
// CLI-bridge tools, model-proposed tool confirmations and the new `!<cmd>`
// shell passthrough — and a `!` command's output rides ahead of the NEXT
// prompt (bounded), never as a fabricated transcript entry. Hermetic.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  riskForDispatch, gateAction, resolveShellLine, isDeniedShellOutput, pushShellNote, buildShellNotePrefix,
  renderTermGateDenied, SHELL_NOTE_MAX, SHELL_NOTE_OUTPUT_CAP,
} from '../../../src/cli/repl/term-gate.js';
import { initialTermModeState, applyModeTarget } from '../../../src/cli/repl/term-mode.js';
import { buildReplLabels } from '../../../src/cli/repl/run.js';
import { renderCommandRisk } from '../../../src/cli/helpers/risk-language.js';
import { getMessage, getMessageLanguages } from '../../../src/cli/helpers/messages.js';

const ROOT = join(__dirname, '..', '..', '..');
const ask = initialTermModeState('ask');
const run = applyModeTarget(ask, 'run').state;
const control = applyModeTarget(ask, 'control').state;

describe('riskForDispatch — one plain-risk class per action', () => {
  it('a declared registry tag wins; exec tools map by name; CLI-bridge tools derive from their confirm tier', () => {
    expect(riskForDispatch({ tool: 'deckent_sync', args: {}, declaredRisk: 'Otonom' })).toBe('Otonom');
    expect(riskForDispatch({ tool: 'deckent_bash', args: { cmd: 'ls' } })).toBe('Çalıştır');
    expect(riskForDispatch({ tool: 'deckent_write_file', args: {} })).toBe('Değiştir');
    expect(riskForDispatch({ tool: 'deckent_read_file', args: {} })).toBe('Oku');
    expect(riskForDispatch({ tool: 'deckent_usage', args: {} })).toBe('Oku');     // read tier
    expect(riskForDispatch({ tool: 'deckent_kill', args: {} })).toBe('Otonom');   // always-confirm tier
  });
});

describe('gateAction — the ladder decides per mode', () => {
  it('Ask allows only reads; Run allows up to execution; Control allows everything', () => {
    expect(gateAction(ask, { tool: 'deckent_read_file', args: {} })).toEqual({ kind: 'allow' });
    const deniedWrite = gateAction(ask, { tool: 'deckent_write_file', args: {} });
    expect(deniedWrite).toMatchObject({ kind: 'deny', risk: 'Değiştir', decision: { currentMode: 'ask', suggestedMode: 'run' } });
    expect(gateAction(run, { tool: 'deckent_bash', args: { cmd: 'ls' } })).toEqual({ kind: 'allow' });
    expect(gateAction(run, { tool: 'deckent_kill', args: {} })).toMatchObject({ kind: 'deny', risk: 'Otonom', decision: { suggestedMode: 'control' } });
    expect(gateAction(control, { tool: 'deckent_kill', args: {} })).toEqual({ kind: 'allow' });
  });
});

describe('`!` shell passthrough helpers', () => {
  it('resolveShellLine extracts the command; a bare `!` is not a shell line', () => {
    expect(resolveShellLine('!ls -la')).toBe('ls -la');
    expect(resolveShellLine('!  git status ')).toBe('git status');
    expect(resolveShellLine('!')).toBeNull();
    expect(resolveShellLine('!   ')).toBeNull();
    expect(resolveShellLine('hello!')).toBeNull();
  });

  it('isDeniedShellOutput recognizes the exec dispatcher denial marker', () => {
    expect(isDeniedShellOutput('[deckent-denied] deckent_bash')).toBe(true);
    expect(isDeniedShellOutput('hi\n')).toBe(false);
  });

  it('shell notes are bounded (count + output tail) and render as a prefix for the next prompt', () => {
    let notes = pushShellNote([], { cmd: 'echo a', output: 'a' });
    notes = pushShellNote(notes, { cmd: 'echo b', output: 'b' });
    notes = pushShellNote(notes, { cmd: 'echo c', output: 'c' });
    notes = pushShellNote(notes, { cmd: 'echo d', output: 'd' });
    expect(notes.map((n) => n.cmd)).toEqual(['echo b', 'echo c', 'echo d']);
    expect(notes).toHaveLength(SHELL_NOTE_MAX);
    const big = pushShellNote([], { cmd: 'cat big', output: 'x'.repeat(SHELL_NOTE_OUTPUT_CAP + 100) + 'TAIL' });
    expect(big[0]!.output.length).toBeLessThanOrEqual(SHELL_NOTE_OUTPUT_CAP + 8);
    expect(big[0]!.output.endsWith('TAIL')).toBe(true);
    expect(big[0]!.output.startsWith('[…]')).toBe(true);
    expect(buildShellNotePrefix([])).toBe('');
    expect(buildShellNotePrefix([{ cmd: 'echo a', output: 'a' }])).toBe('[shell] $ echo a\na\n\n');
  });
});

describe('renderTermGateDenied — catalog template, localized risk and mode names', () => {
  it('substitutes target, risk (risk-language), mode and the suggested mode in en and tr', () => {
    for (const lang of ['en', 'tr'] as const) {
      const labels = buildReplLabels((k) => getMessage(k, lang));
      const gate = gateAction(ask, { tool: 'deckent_bash', args: { cmd: 'ls' } });
      expect(gate.kind).toBe('deny');
      if (gate.kind !== 'deny') return;
      const line = renderTermGateDenied(gate, '!ls', {
        template: labels.termGateDenied,
        riskLabel: (risk) => renderCommandRisk(risk, lang).label,
        modeLabel: (mode) => (mode === 'ask' ? labels.modeAsk : mode === 'run' ? labels.modeRun : labels.modeControl),
      });
      expect(line).toContain('!ls');
      expect(line).toContain(renderCommandRisk('Çalıştır', lang).label);
      expect(line).toContain(labels.modeAsk);
      expect(line).toContain('/term run');
      expect(line).not.toContain('{');
    }
    expect(getMessageLanguages('tui.term_gate_denied')).toEqual(expect.arrayContaining(['en', 'tr']));
    expect(getMessageLanguages('tui.shortcuts.shell.action')).toEqual(expect.arrayContaining(['en', 'tr']));
  });
});

describe('wiring — every action path consults the gate', () => {
  const app = readFileSync(join(ROOT, 'src/cli/repl/app.tsx'), 'utf-8');
  const run = readFileSync(join(ROOT, 'src/cli/repl/run.tsx'), 'utf-8');

  it('app.tsx gates slash dispatches, the confirm trigger and the `!` shell line, and prepends shell notes at the submit boundary', () => {
    expect(app).toMatch(/gateAction\(termModeRef\.current, \{ tool: bridged\.tool/);
    expect(app).toMatch(/resolveShellLine\(trimmed\)/);
    expect(app).toMatch(/dispatcher\.dispatch\('deckent_bash', \{ cmd: shellCmd \}\)/);
    expect(app).toMatch(/buildShellNotePrefix\(/);
    expect(app).toMatch(/registerActionGate/);
  });

  it('run.tsx consults the registered action gate BEFORE the approval-mode shortcuts', () => {
    const askConfirmAt = run.indexOf('const askConfirm = async (summary: string, toolName: string');
    const gateAt = run.indexOf('actionGate', askConfirmAt);
    const fullAutoAt = run.indexOf("if (approvalMode === 'full-auto') return true;", askConfirmAt);
    expect(askConfirmAt).toBeGreaterThan(0);
    expect(gateAt).toBeGreaterThan(askConfirmAt);
    expect(gateAt).toBeLessThan(fullAutoAt);
    expect(run).toMatch(/registerActionGate=\{/);
  });
});
