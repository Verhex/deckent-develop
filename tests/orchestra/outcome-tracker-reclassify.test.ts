import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  OutcomeTracker,
  type RoutingOutcome,
  type ReclassifyAuditStore,
} from '../../src/orchestra/outcome-tracker.js';
import { createDefaultTaskDNA } from '../../src/core/routing-types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(tmpdir(), `outcome-reclassify-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeOutcome(overrides?: Partial<RoutingOutcome>): RoutingOutcome {
  const dna = createDefaultTaskDNA();
  dna.intent.primary = 'implementation';
  return {
    taskId: 'task-001',
    sprintId: 'sprint-190',
    taskDNA: dna,
    agentId: 'test-agent',
    skillIds: ['typescript-expert'],
    skillExposureIds: ['typescript-expert'],
    skillAttributionState: 'CREDITED',
    evaluation: 'DONE',
    coverage: 90,
    routingVersion: 'v2',
    ...overrides,
  };
}

interface RecordedAudit {
  id: string;
  type: string;
  title: string;
  content: string;
  sprint_id?: string;
  sprint_num?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
  changedBy: string;
}

function makeMockStore(): { store: ReclassifyAuditStore; calls: RecordedAudit[] } {
  const calls: RecordedAudit[] = [];
  const store: ReclassifyAuditStore = {
    upsert(input, changedBy) {
      calls.push({ ...input, changedBy });
    },
  };
  return { store, calls };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('OutcomeTracker.reclassifyTaskOutcome', () => {
  let projectRoot: string;
  let tracker: OutcomeTracker;

  beforeEach(() => {
    projectRoot = makeTempDir();
    tracker = new OutcomeTracker(projectRoot);
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('NO_GO → DONE reclassify updates agent + skill success rate (delta math)', () => {
    // Seed: 3 outcomes, 1 NO_GO + 2 DONE — success rate ~67%
    tracker.recordOutcome(makeOutcome({ taskId: 't1', evaluation: 'DONE' }));
    tracker.recordOutcome(makeOutcome({ taskId: 't2', evaluation: 'DONE' }));
    tracker.recordOutcome(makeOutcome({ taskId: 't3', evaluation: 'NO_GO' }));

    const before = tracker.getLearnings();
    expect(before.agentPerformance['test-agent']!.successRate).toBeCloseTo(2 / 3, 2);
    expect(before.skillPerformance['typescript-expert']!.successRate).toBeCloseTo(2 / 3, 2);

    const result = tracker.reclassifyTaskOutcome('sprint-190', 't3', 'DONE');

    expect(result.changed).toBe(true);
    expect(result.previous).toBe('NO_GO');
    expect(result.current).toBe('DONE');
    expect(result.agentId).toBe('test-agent');
    expect(result.skillIds).toEqual(['typescript-expert']);

    const after = tracker.getLearnings();
    expect(after.agentPerformance['test-agent']!.successCount).toBe(3);
    expect(after.agentPerformance['test-agent']!.failCount).toBe(0);
    expect(after.agentPerformance['test-agent']!.successRate).toBe(1);
    expect(after.skillPerformance['typescript-expert']!.successCount).toBe(3);
    expect(after.skillPerformance['typescript-expert']!.failCount).toBe(0);
    expect(after.skillPerformance['typescript-expert']!.successRate).toBe(1);
  });

  it('writes ADR-046 audit-trail retro entry to memory store when provided', () => {
    tracker.recordOutcome(makeOutcome({ taskId: 't1', evaluation: 'NO_GO' }));
    const { store, calls } = makeMockStore();

    const result = tracker.reclassifyTaskOutcome('sprint-190', 't1', 'DONE', {
      reason: 'Disk verification: file exists, tests pass — original NO_GO was spurious',
      memoryStore: store,
    });

    expect(result.changed).toBe(true);
    expect(result.auditTrailWritten).toBe(true);
    expect(calls).toHaveLength(1);
    const audit = calls[0]!;
    expect(audit.id).toBe('reclassify-sprint-190-t1');
    expect(audit.type).toBe('retro');
    expect(audit.sprint_id).toBe('sprint-190');
    expect(audit.sprint_num).toBe(190);
    expect(audit.tags).toEqual(expect.arrayContaining(['reclassify', 'audit-trail', 'adr-046']));
    expect(audit.content).toContain('NO_GO → DONE');
    expect(audit.content).toContain('Agent: test-agent');
    expect(audit.content).toContain('Skills: typescript-expert');
    expect(audit.content).toContain('Reason: Disk verification');
    expect(audit.changedBy).toBe('cli:agent-reclassify');
    expect(audit.metadata?.taskId).toBe('t1');
    expect(audit.metadata?.previous).toBe('NO_GO');
    expect(audit.metadata?.current).toBe('DONE');
  });

  it('duplicate reclassify is idempotent (no stat drift, no audit write)', () => {
    tracker.recordOutcome(makeOutcome({ taskId: 't1', evaluation: 'NO_GO' }));
    tracker.recordOutcome(makeOutcome({ taskId: 't2', evaluation: 'DONE' }));

    const { store, calls } = makeMockStore();

    // First call flips the bit.
    const first = tracker.reclassifyTaskOutcome('sprint-190', 't1', 'DONE', { memoryStore: store });
    expect(first.changed).toBe(true);
    expect(first.auditTrailWritten).toBe(true);
    const afterFirst = tracker.getLearnings();
    const rateAfterFirst = afterFirst.agentPerformance['test-agent']!.successRate;
    const successAfterFirst = afterFirst.agentPerformance['test-agent']!.successCount;

    // Second call is a no-op.
    const second = tracker.reclassifyTaskOutcome('sprint-190', 't1', 'DONE', { memoryStore: store });
    expect(second.changed).toBe(false);
    expect(second.previous).toBe('DONE');
    expect(second.current).toBe('DONE');
    expect(second.auditTrailWritten).toBe(false);

    const afterSecond = tracker.getLearnings();
    expect(afterSecond.agentPerformance['test-agent']!.successRate).toBe(rateAfterFirst);
    expect(afterSecond.agentPerformance['test-agent']!.successCount).toBe(successAfterFirst);
    // Only one audit entry was written.
    expect(calls).toHaveLength(1);
  });

  it('rewrites the sprint outcome file with the new evaluation', () => {
    tracker.recordOutcome(makeOutcome({ taskId: 't1', evaluation: 'NO_GO' }));
    const outcomesPath = join(projectRoot, '.deckent/routing/outcomes/sprint-190.json');
    const beforeOutcomes = JSON.parse(readFileSync(outcomesPath, 'utf-8')) as RoutingOutcome[];
    expect(beforeOutcomes[0]!.evaluation).toBe('NO_GO');

    tracker.reclassifyTaskOutcome('sprint-190', 't1', 'DONE');

    const afterOutcomes = JSON.parse(readFileSync(outcomesPath, 'utf-8')) as RoutingOutcome[];
    expect(afterOutcomes[0]!.evaluation).toBe('DONE');
    expect(afterOutcomes[0]!.taskId).toBe('t1');
  });

  it('updates skillSprintHistory + synergyMatrix delta in tandem', () => {
    // Three outcomes share the same agent + 2-skill combo, one is NO_GO.
    const twoSkills = ['typescript-expert', 'testing-expert'];
    tracker.recordOutcome(makeOutcome({ taskId: 't1', skillIds: twoSkills, evaluation: 'DONE' }));
    tracker.recordOutcome(makeOutcome({ taskId: 't2', skillIds: twoSkills, evaluation: 'DONE' }));
    tracker.recordOutcome(makeOutcome({ taskId: 't3', skillIds: twoSkills, evaluation: 'NO_GO' }));

    const synergyPair = ['typescript-expert', 'testing-expert'].sort().join('+');
    const before = tracker.getLearnings();
    const synergyBefore = before.synergyMatrix.find(e => e.pair === synergyPair)!;
    expect(synergyBefore.tasks).toBe(3);
    expect(synergyBefore.successRate).toBeCloseTo(2 / 3, 2);
    expect(before.skillSprintHistory['typescript-expert']!['sprint-190']!.failCount).toBe(1);

    tracker.reclassifyTaskOutcome('sprint-190', 't3', 'DONE');

    const after = tracker.getLearnings();
    const synergyAfter = after.synergyMatrix.find(e => e.pair === synergyPair)!;
    expect(synergyAfter.tasks).toBe(3); // totalTasks does NOT change
    expect(synergyAfter.successRate).toBe(1);
    expect(synergyAfter.verdict).toBe('synergy');
    expect(after.skillSprintHistory['typescript-expert']!['sprint-190']!.successCount).toBe(3);
    expect(after.skillSprintHistory['typescript-expert']!['sprint-190']!.failCount).toBe(0);
  });

  it('throws when sprint outcomes file is missing', () => {
    expect(() =>
      tracker.reclassifyTaskOutcome('sprint-999', 'unknown', 'DONE'),
    ).toThrow(/No outcomes recorded for sprint sprint-999/);
  });

  it('throws when task is not found in the sprint', () => {
    tracker.recordOutcome(makeOutcome({ taskId: 't1' }));
    expect(() =>
      tracker.reclassifyTaskOutcome('sprint-190', 'ghost-task', 'NO_GO'),
    ).toThrow(/ghost-task not found in sprint-190/);
  });

  it('honors the --no-audit path (no store) without throwing', () => {
    tracker.recordOutcome(makeOutcome({ taskId: 't1', evaluation: 'NO_GO' }));
    const result = tracker.reclassifyTaskOutcome('sprint-190', 't1', 'DONE');
    expect(result.changed).toBe(true);
    expect(result.auditTrailWritten).toBe(false);
  });

  it('DONE → NO_GO reclassify decreases success rate (reverse flip)', () => {
    tracker.recordOutcome(makeOutcome({ taskId: 't1', evaluation: 'DONE' }));
    tracker.recordOutcome(makeOutcome({ taskId: 't2', evaluation: 'DONE' }));
    expect(tracker.getLearnings().agentPerformance['test-agent']!.successRate).toBe(1);

    const result = tracker.reclassifyTaskOutcome('sprint-190', 't2', 'NO_GO');
    expect(result.changed).toBe(true);
    const after = tracker.getLearnings();
    expect(after.agentPerformance['test-agent']!.successCount).toBe(1);
    expect(after.agentPerformance['test-agent']!.failCount).toBe(1);
    expect(after.agentPerformance['test-agent']!.successRate).toBe(0.5);
  });

  it('GO_WITH_TECH_DEBT counts as success (no delta when switching DONE ↔ GO_WITH_TECH_DEBT)', () => {
    tracker.recordOutcome(makeOutcome({ taskId: 't1', evaluation: 'DONE' }));
    tracker.recordOutcome(makeOutcome({ taskId: 't2', evaluation: 'NO_GO' }));
    const beforeRate = tracker.getLearnings().agentPerformance['test-agent']!.successRate;

    const result = tracker.reclassifyTaskOutcome('sprint-190', 't1', 'GO_WITH_TECH_DEBT');
    expect(result.changed).toBe(true);

    const after = tracker.getLearnings();
    // Both DONE and GO_WITH_TECH_DEBT count as success → successRate unchanged
    expect(after.agentPerformance['test-agent']!.successRate).toBe(beforeRate);
    expect(after.agentPerformance['test-agent']!.successCount).toBe(1);
    expect(after.agentPerformance['test-agent']!.failCount).toBe(1);
  });
});
