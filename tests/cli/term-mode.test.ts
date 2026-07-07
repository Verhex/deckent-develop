import { describe, it, expect } from 'vitest';
import {
  initialTermModeState,
  parseTermCommand,
  applyModeTarget,
  checkActionAllowed,
  ALLOWED_RISKS_BY_MODE,
  TERM_MODE_COMMAND,
  TERM_MODES,
  type TermMode,
} from '../../src/cli/repl/term-mode.js';
import { COMMAND_REGISTRY, type CommandRisk } from '../../src/cli/command-registry.js';

describe('term-mode — initial state', () => {
  it('starts in ask (read-only, safe default)', () => {
    expect(initialTermModeState()).toEqual({ mode: 'ask' });
  });
});

describe('term-mode — parseTermCommand (/term dispatch parser)', () => {
  it('exports /term as the single transition command', () => {
    expect(TERM_MODE_COMMAND).toBe('/term');
  });

  it('non-/term lines → none (fall through to chat / other dispatch)', () => {
    for (const line of ['hello', '/nope', '/ask', '/run', '/control', '/terminal', '', '   ']) {
      expect(parseTermCommand(line)).toEqual({ kind: 'none' });
    }
  });

  it('bare /term → status (case-insensitive, whitespace-tolerant)', () => {
    expect(parseTermCommand('/term')).toEqual({ kind: 'status' });
    expect(parseTermCommand('  /TERM  ')).toEqual({ kind: 'status' });
  });

  for (const mode of TERM_MODES) {
    it(`/term ${mode} → switch:${mode} (case-insensitive)`, () => {
      expect(parseTermCommand(`/term ${mode}`)).toEqual({ kind: 'switch', target: mode });
      expect(parseTermCommand(`/term   ${mode.toUpperCase()} `)).toEqual({ kind: 'switch', target: mode });
    });
  }

  it('unrecognized or extra arguments → usage (never a silent no-op)', () => {
    expect(parseTermCommand('/term yolo')).toEqual({ kind: 'usage' });
    expect(parseTermCommand('/term run extra')).toEqual({ kind: 'usage' });
  });
});

describe('term-mode — applyModeTarget transition matrix (geçiş-matrisi)', () => {
  for (const from of TERM_MODES) {
    for (const target of TERM_MODES) {
      const expectChanged = target !== from;
      it(`${from} + /term ${target} → ${target} (changed:${expectChanged})`, () => {
        const state = { mode: from };
        const result = applyModeTarget(state, target);
        expect(result.state.mode).toBe(target);
        expect(result.changed).toBe(expectChanged);
        if (!expectChanged) expect(result.state).toBe(state); // self-transition: same object
      });
    }
  }
});

describe('term-mode — Ask rejects Değiştir/Çalıştır/Otonom risk (reddet+öner)', () => {
  const state = initialTermModeState();

  it('Oku is allowed in ask', () => {
    expect(checkActionAllowed(state, 'Oku')).toEqual({ allowed: true });
  });

  for (const risk of ['Değiştir', 'Çalıştır', 'Otonom'] as const) {
    it(`${risk} is rejected in ask, with a suggestion that actually allows it`, () => {
      const decision = checkActionAllowed(state, risk);
      expect(decision.allowed).toBe(false);
      if (decision.allowed) return; // narrow for TS
      expect(decision.deniedRisk).toBe(risk);
      expect(decision.currentMode).toBe('ask');
      expect(ALLOWED_RISKS_BY_MODE[decision.suggestedMode].has(risk)).toBe(true);
    });
  }
});

describe('term-mode — Run allows read/mutate/execute, rejects Otonom', () => {
  const state: { mode: TermMode } = { mode: 'run' };

  for (const risk of ['Oku', 'Değiştir', 'Çalıştır'] as const) {
    it(`${risk} is allowed in run`, () => {
      expect(checkActionAllowed(state, risk)).toEqual({ allowed: true });
    });
  }

  it('Otonom is rejected in run, suggesting control', () => {
    const decision = checkActionAllowed(state, 'Otonom');
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.suggestedMode).toBe('control');
  });
});

describe('term-mode — Control allows every risk (full yönetim ladder)', () => {
  const state: { mode: TermMode } = { mode: 'control' };

  for (const risk of ['Oku', 'Değiştir', 'Çalıştır', 'Otonom'] as const) {
    it(`${risk} is allowed in control`, () => {
      expect(checkActionAllowed(state, risk)).toEqual({ allowed: true });
    });
  }
});

describe('term-mode — registry risk-enum consistency (disk-verify)', () => {
  it('every risk value actually used in the live COMMAND_REGISTRY is covered by control mode', () => {
    const usedRisks = new Set<CommandRisk>(COMMAND_REGISTRY.map((e) => e.risk));
    expect(usedRisks.size).toBeGreaterThan(0);
    for (const risk of usedRisks) {
      expect(ALLOWED_RISKS_BY_MODE.control.has(risk)).toBe(true);
    }
  });

  it('mode ladder is strictly cumulative (ask ⊆ run ⊆ control)', () => {
    for (const risk of ALLOWED_RISKS_BY_MODE.ask) {
      expect(ALLOWED_RISKS_BY_MODE.run.has(risk)).toBe(true);
    }
    for (const risk of ALLOWED_RISKS_BY_MODE.run) {
      expect(ALLOWED_RISKS_BY_MODE.control.has(risk)).toBe(true);
    }
  });
});
