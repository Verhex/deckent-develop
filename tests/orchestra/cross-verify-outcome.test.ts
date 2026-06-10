// tests/orchestra/cross-verify-outcome.test.ts
//
// Hermetic tests for Task 276-008: recordCrossVerifyVerdict feeds cross-verify advisory
// verdicts back into OutcomeTracker as ROUTE-1 learning signals.
//
// All file I/O is in tmpdir. No gitignored state read. No spawnSync. CI-hermetic.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { OutcomeTracker, type RoutingOutcome } from '../../src/orchestra/outcome-tracker.js';
import type { TaskDNA } from '../../src/core/routing-types.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

let root: string;
let tracker: OutcomeTracker;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'deckent-xv-outcome-'));
  tracker = new OutcomeTracker(root);
});

afterEach(() => {
  try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
});

function makeTaskDNA(intent = 'implementation' as const): TaskDNA {
  return {
    intent: { primary: intent, secondary: [] },
    complexity: 'medium',
    riskLevel: 'normal',
    hasTests: true,
    hasDocs: false,
    scope: { directories: ['src/'], filesWrite: [], filesRead: [] },
  } as unknown as TaskDNA;
}

function makeOutcome(overrides: Partial<RoutingOutcome> = {}): RoutingOutcome {
  return {
    taskId: '276-001',
    sprintId: 'sprint-276',
    taskDNA: makeTaskDNA(),
    agentId: 'bug-fixer',
    skillIds: ['typescript-expert'],
    evaluation: 'DONE',
    coverage: 90,
    routingVersion: 'v2',
    ...overrides,
  };
}

// ─── Tests: REFUTED verdict ──────────────────────────────────────────────────

describe('recordCrossVerifyVerdict — REFUTED', () => {
  it('REFUTED → failCount incremented and successRate reduced for agent', () => {
    // Establish a baseline: record one DONE outcome so the agent exists.
    tracker.recordOutcome(makeOutcome());
    // Snapshot values (not the reference — the live object is mutated in place).
    const { failCount: beforeFail, successRate: beforeRate, totalTasks: beforeTotal } =
      tracker.getLearnings().agentPerformance['bug-fixer']!;

    tracker.recordCrossVerifyVerdict('bug-fixer', ['typescript-expert'], 'refuted', 'implementation');

    const after = tracker.getLearnings().agentPerformance['bug-fixer']!;
    expect(after.failCount).toBeGreaterThan(beforeFail);
    expect(after.successRate).toBeLessThan(beforeRate);
    // totalTasks is bumped (the verdict is a new data point)
    expect(after.totalTasks).toBeGreaterThan(beforeTotal);
  });

  it('REFUTED → failCount incremented for skill performance', () => {
    tracker.recordOutcome(makeOutcome());
    const { failCount: beforeFail } = tracker.getLearnings().skillPerformance['typescript-expert']!;

    tracker.recordCrossVerifyVerdict('bug-fixer', ['typescript-expert'], 'refuted', 'implementation');

    const after = tracker.getLearnings().skillPerformance['typescript-expert']!;
    expect(after.failCount).toBeGreaterThan(beforeFail);
  });

  it('REFUTED → synergy entry for agent+skill pair gets isSuccess=false signal', () => {
    tracker.recordOutcome(makeOutcome());
    // After one DONE outcome the synergy entry exists with successRate=1.0.
    const pairKey = 'bug-fixer+typescript-expert';

    tracker.recordCrossVerifyVerdict('bug-fixer', ['typescript-expert'], 'refuted', 'implementation');

    const synergy = tracker.getSynergyMatrix().find(e => e.pair === pairKey);
    expect(synergy).toBeDefined();
    // With 1 success + 1 refuted signal: tasks=2, successRate=0.5 → no longer 1.0.
    expect(synergy!.successRate).toBeLessThan(1);
  });
});

// ─── Tests: CONFIRMED verdict ────────────────────────────────────────────────

describe('recordCrossVerifyVerdict — CONFIRMED', () => {
  it('CONFIRMED → successCount incremented for agent performance', () => {
    // Establish a DONE outcome first.
    tracker.recordOutcome(makeOutcome());
    const { successCount: beforeSuccess, successRate: beforeRate } =
      tracker.getLearnings().agentPerformance['bug-fixer']!;

    tracker.recordCrossVerifyVerdict('bug-fixer', ['typescript-expert'], 'confirmed', 'implementation');

    const after = tracker.getLearnings().agentPerformance['bug-fixer']!;
    expect(after.successCount).toBeGreaterThan(beforeSuccess);
    expect(after.successRate).toBeGreaterThanOrEqual(beforeRate);
  });

  it('CONFIRMED → successCount incremented for skill performance', () => {
    tracker.recordOutcome(makeOutcome());
    const { successCount: beforeSuccess } = tracker.getLearnings().skillPerformance['typescript-expert']!;

    tracker.recordCrossVerifyVerdict('bug-fixer', ['typescript-expert'], 'confirmed', 'implementation');

    const after = tracker.getLearnings().skillPerformance['typescript-expert']!;
    expect(after.successCount).toBeGreaterThan(beforeSuccess);
  });
});

// ─── Tests: unclear verdict ───────────────────────────────────────────────────

describe('recordCrossVerifyVerdict — unclear (no-op)', () => {
  it('unclear verdict → learnings completely unchanged', () => {
    tracker.recordOutcome(makeOutcome());
    const before = JSON.stringify(tracker.getLearnings());

    tracker.recordCrossVerifyVerdict('bug-fixer', ['typescript-expert'], 'unclear', 'implementation');

    // updatedAt may differ — compare only performance fields.
    const after = tracker.getLearnings();
    const beforeParsed = JSON.parse(before) as ReturnType<typeof tracker.getLearnings>;
    expect(after.agentPerformance).toEqual(beforeParsed.agentPerformance);
    expect(after.skillPerformance).toEqual(beforeParsed.skillPerformance);
    expect(after.synergyMatrix).toEqual(beforeParsed.synergyMatrix);
    expect(after.totalOutcomes).toEqual(beforeParsed.totalOutcomes);
  });
});

// ─── Tests: no crossVerify call — recordOutcome unchanged ────────────────────

describe('recordCrossVerifyVerdict — xverify disabled / not called', () => {
  it('recordOutcome without cross-verify call → behavior byte-for-byte as before', () => {
    const outcome = makeOutcome();
    tracker.recordOutcome(outcome);

    const learnings = tracker.getLearnings();
    expect(learnings.totalOutcomes).toBe(1);
    expect(learnings.agentPerformance['bug-fixer']!.successCount).toBe(1);
    expect(learnings.agentPerformance['bug-fixer']!.failCount).toBe(0);
    // No cross-verify method called → no additional signals.
    expect(learnings.agentPerformance['bug-fixer']!.totalTasks).toBe(1);
  });
});

// ─── Tests: null agentId ─────────────────────────────────────────────────────

describe('recordCrossVerifyVerdict — null agentId', () => {
  it('null agentId → only skillPerformance updated, agentPerformance untouched', () => {
    // Record an outcome with a named agent first.
    tracker.recordOutcome(makeOutcome());
    const agentBefore = { ...tracker.getLearnings().agentPerformance['bug-fixer']! };

    tracker.recordCrossVerifyVerdict(null, ['typescript-expert'], 'refuted', 'implementation');

    // Agent performance must be unchanged.
    expect(tracker.getLearnings().agentPerformance['bug-fixer']).toEqual(agentBefore);
    // Skill must have received the refuted signal.
    const skill = tracker.getLearnings().skillPerformance['typescript-expert']!;
    expect(skill.failCount).toBeGreaterThan(0);
  });
});
