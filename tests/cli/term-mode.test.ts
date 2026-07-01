import { describe, it, expect } from 'vitest';
import {
  initialTermModeState,
  applyModeCommand,
  checkActionAllowed,
  ALLOWED_RISKS_BY_MODE,
  MODE_TRANSITION_COMMANDS,
  TERM_MODES,
  type TermMode,
} from '../../src/cli/repl/term-mode.js';
import { COMMAND_REGISTRY, type CommandRisk } from '../../src/cli/command-registry.js';

describe('term-mode — initial state', () => {
  it('starts in ask (read-only, safe default)', () => {
    expect(initialTermModeState()).toEqual({ mode: 'ask' });
  });
});

describe('term-mode — transition matrix (geçiş-matrisi)', () => {
  const commands = Object.keys(MODE_TRANSITION_COMMANDS);

  for (const from of TERM_MODES) {
    for (const command of commands) {
      const target = MODE_TRANSITION_COMMANDS[command] as TermMode;
      const expectChanged = target !== from;
      it(`${from} + ${command} → ${target} (changed:${expectChanged})`, () => {
        const result = applyModeCommand({ mode: from }, command);
        expect(result.state.mode).toBe(target);
        expect(result.changed).toBe(expectChanged);
      });
    }

    it(`${from} + unrecognized command → unchanged`, () => {
      const state = { mode: from };
      const result = applyModeCommand(state, '/nope');
      expect(result.state).toBe(state);
      expect(result.changed).toBe(false);
    });
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
