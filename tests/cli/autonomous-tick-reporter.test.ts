// APPROVE-002 (MASTER-PLAN §4G) — autonomous loop live feedback (onTick).
//
// The running `autonomous start` loop was silent between the start banner and
// the final summary: a parked approval produced no terminal output and no
// notification, so the operator never knew a decision was waiting. makeTickReporter
// is the per-cycle observer wired into runAutonomousLoop's onTick hook: it prints
// a feedback line on outcome change and fires ONE notification the first time a
// trigger parks (de-dupe — not every cycle), re-arming if it later resolves.
//
// Pure + injectable (print/notify) so the dedupe logic is unit-testable.

import { describe, it, expect } from 'vitest';
import { makeTickReporter } from '../../src/cli/commands/autonomous.js';
import type {
  AutonomousCycleResult,
  AutonomousTrigger,
} from '../../src/orchestra/autonomous-runtime.js';

const trig = (id: string): AutonomousTrigger => ({
  id,
  source: 'scheduled-flow',
  action: 'start',
  requestedBy: 'system',
});

function result(
  outcome: AutonomousCycleResult['outcome'],
  id: string | null,
  reason = 'r',
): AutonomousCycleResult {
  return {
    outcome,
    reason,
    trigger: id ? trig(id) : null,
    authority: null,
    approval: null,
    action: null,
    audit: null,
  };
}

interface Note {
  event: string;
  summary: string;
}

function harness() {
  const prints: string[] = [];
  const notes: Note[] = [];
  const tick = makeTickReporter('en', {
    print: (s: string) => prints.push(s),
    notify: (event, _sprintId, _title, summary) => notes.push({ event, summary }),
  });
  return { tick, prints, notes };
}

describe('makeTickReporter — autonomous live feedback (APPROVE-002)', () => {
  it('notifies ONCE per parked trigger across repeated pending cycles', () => {
    const { tick, notes } = harness();
    tick(result('pending', 't1'));
    tick(result('pending', 't1'));
    tick(result('pending', 't1'));
    expect(notes).toHaveLength(1);
    expect(notes[0]?.event).toBe('human-checkpoint-required');
    expect(notes[0]?.summary).toContain('t1');
  });

  it('suppresses idle no_trigger ticks (no print, no notify)', () => {
    const { tick, prints, notes } = harness();
    tick(result('no_trigger', null));
    expect(prints).toHaveLength(0);
    expect(notes).toHaveLength(0);
  });

  it('prints a feedback line when a trigger parks', () => {
    const { tick, prints } = harness();
    tick(result('pending', 't1'));
    expect(prints).toHaveLength(1);
    expect(prints[0]).toContain('t1');
  });

  it('re-notifies if the same trigger parks again after resolving', () => {
    const { tick, notes } = harness();
    tick(result('pending', 't1')); // notify #1
    tick(result('executed', 't1')); // resolved → re-arm
    tick(result('pending', 't1')); // notify #2
    expect(notes).toHaveLength(2);
  });
});
