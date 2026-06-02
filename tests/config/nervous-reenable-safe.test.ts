import { describe, it, expect } from 'vitest';
import { evaluatePanicGate, isLockedPanicAction } from '../../src/nervous/panic-gate.js';

// Hermetic fixture — never reads live .deckent/config.json
const NERVOUS_FIXTURE = {
  nervous_system: {
    enabled: true,
    mode: 'balanced',
    safety_floor: {
      locked_actions: [
        'KILL_LIVE_SPRINT',
        'MANUAL_FILE_DELETE',
        'COST_OVER_THRESHOLD',
        'DESTRUCTIVE_GIT',
        'ADR_DEPRECATE_ACCEPTED',
      ],
      cost_threshold_usd: 110,
      bypass_allowed: false,
    },
  },
};

describe('nervous re-enable safe — hermetic fixture tests', () => {
  it('config enabled: nervous_system.enabled is true after re-enable', () => {
    expect(NERVOUS_FIXTURE.nervous_system.enabled).toBe(true);
  });

  it('advisory-mode: evaluatePanicGate returns PROCEED immediately for non-locked action (non-blocking)', () => {
    const warnings: string[] = [];
    const decision = evaluatePanicGate({
      actionId: 'SPAWN_WORKER',
      mode: 'advisory',
      warn: (msg) => warnings.push(msg),
    });
    expect(decision).toBe('PROCEED');
    // Warns visibly — no silent bypass
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('safety_floor preserved: bypass_allowed is false and locked actions are intact', () => {
    const { safety_floor } = NERVOUS_FIXTURE.nervous_system;
    expect(safety_floor.bypass_allowed).toBe(false);
    expect(safety_floor.locked_actions).toContain('KILL_LIVE_SPRINT');
    expect(safety_floor.locked_actions).toContain('DESTRUCTIVE_GIT');
    expect(safety_floor.locked_actions).toContain('ADR_DEPRECATE_ACCEPTED');
  });

  it('safety_floor preserved: evaluatePanicGate returns REJECTED for locked action (never bypassed)', () => {
    const warnings: string[] = [];
    const decision = evaluatePanicGate({
      actionId: 'KILL_LIVE_SPRINT',
      mode: 'advisory',
      warn: (msg) => warnings.push(msg),
    });
    expect(decision).toBe('REJECTED');
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('isLockedPanicAction correctly identifies locked actions', () => {
    expect(isLockedPanicAction('KILL_LIVE_SPRINT')).toBe(true);
    expect(isLockedPanicAction('DESTRUCTIVE_GIT')).toBe(true);
    expect(isLockedPanicAction('SPAWN_WORKER')).toBe(false);
    expect(isLockedPanicAction('REPLAN_SPRINT')).toBe(false);
  });
});
