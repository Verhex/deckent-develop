// MidSprintAdapter — S3 re-aim: the reroute lane now rides ROUTING-V3
// (routeTasksV3ForPlan with fresh-eyes excludeAgentIds); this suite pins the
// adapter's own gates (verdict/limit/difference/confidence) over a mocked
// V3 probe, plus applyReroute's task mutation.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MidSprintAdapter } from '../../src/orchestra/mid-sprint-adapter.js';
import type { RerouteDecision } from '../../src/orchestra/mid-sprint-adapter.js';
import type { Task, TaskResult } from '../../src/core/task-types.js';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't-1',
    title: 'x',
    description: 'y',
    scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/x.ts'] },
    assignedAgent: 'implementer',
    assignedSkills: [],
    ...overrides,
  } as unknown as Task;
}

function makeResult(selfAssessment: TaskResult['selfAssessment']): TaskResult {
  return { taskId: 't-1', selfAssessment } as unknown as TaskResult;
}

function makeAdapter(): MidSprintAdapter {
  return new MidSprintAdapter(new Map(), new Map(), {} as never, null, undefined, '/tmp/nonexistent-r3');
}

describe('MidSprintAdapter (V3 reroute lane)', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('DONE task → no reroute', async () => {
    const adapter = makeAdapter();
    const r = await adapter.shouldReroute(makeTask(), makeResult('DONE'));
    expect(r.should).toBe(false);
  });

  it('GO_WITH_TECH_DEBT with reroute_on_tech_debt disabled → no reroute', async () => {
    const adapter = makeAdapter();
    const r = await adapter.shouldReroute(makeTask(), makeResult('GO_WITH_TECH_DEBT'));
    expect(r.should).toBe(false);
    expect(r.reason).toContain('tech debt');
  });

  it('max reroutes reached → no reroute', async () => {
    const adapter = makeAdapter();
    const spy = vi.spyOn(adapter, 'suggestReroute').mockResolvedValue({
      agentId: 'bug-fixer', skillIds: [], agentConfidence: 'high', skillConfidence: 'low',
    } satisfies RerouteDecision);
    for (let i = 0; i < 3; i++) {
      await adapter.shouldReroute(makeTask(), makeResult('NO_GO'));
    }
    const r = await adapter.shouldReroute(makeTask(), makeResult('NO_GO'));
    expect(r.should).toBe(false);
    expect(r.reason).toContain('Max reroutes');
    spy.mockRestore();
  });

  it('alternative identical to original → no reroute', async () => {
    const adapter = makeAdapter();
    vi.spyOn(adapter, 'suggestReroute').mockResolvedValue({
      agentId: 'implementer', skillIds: [], agentConfidence: 'high', skillConfidence: 'low',
    });
    const r = await adapter.shouldReroute(makeTask(), makeResult('NO_GO'));
    expect(r.should).toBe(false);
    expect(r.reason).toContain('same as original');
  });

  it('low-confidence alternative → no reroute (honest gate)', async () => {
    const adapter = makeAdapter();
    vi.spyOn(adapter, 'suggestReroute').mockResolvedValue({
      agentId: 'bug-fixer', skillIds: [], agentConfidence: 'low', skillConfidence: 'low',
    });
    const r = await adapter.shouldReroute(makeTask(), makeResult('NO_GO'));
    expect(r.should).toBe(false);
    expect(r.reason).toContain('confident');
  });

  it('confident different alternative → reroute with decision', async () => {
    const adapter = makeAdapter();
    vi.spyOn(adapter, 'suggestReroute').mockResolvedValue({
      agentId: 'bug-fixer', skillIds: ['secure-coding'], agentConfidence: 'high', skillConfidence: 'low',
    });
    const task = makeTask();
    const r = await adapter.shouldReroute(task, makeResult('NO_GO'));
    expect(r.should).toBe(true);
    expect(r.newDecision?.agentId).toBe('bug-fixer');
    expect(task.routingMeta?.rerouteCount).toBe(1);
  });

  it('applyReroute mutates agent/skills and stamps confidence tier', () => {
    const adapter = makeAdapter();
    const task = makeTask();
    adapter.applyReroute(task, {
      agentId: 'bug-fixer', skillIds: ['secure-coding'], agentConfidence: 'medium', skillConfidence: 'low',
    });
    expect(task.assignedAgent).toBe('bug-fixer');
    expect(task.assignedSkills).toEqual(['secure-coding']);
    expect(task.routingMeta?.confidence).toBe('medium');
  });

  it('suggestReroute on an empty project → null (no throw)', async () => {
    const adapter = makeAdapter();
    const r = await adapter.suggestReroute(makeTask());
    expect(r).toBeNull();
  });
});

// ═══ EVAL-NOCHANGE (GR-2026-08-08-EVAL-NOCHANGE-01) — zero-work goal-state ═══
import { reconcileNoChangeSatisfied, runStrictGoalStateProbe } from '../../src/orchestra/mid-sprint-adapter.js';

describe('EVAL-NOCHANGE — reconcileNoChangeSatisfied', () => {
  const task = () => ({
    id: '001-002-fix-fix',
    scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/greet.js'] },
  } as unknown as Task);
  // The exact CR5 shape: honest no-change NO_GO, no work, no HOLD.
  const noChangeResult = () => ({ taskId: '001-002-fix-fix', selfAssessment: 'NO_GO' } as unknown as TaskResult);

  const zeroDiff = () => ({ getGitDiffStats: () => ({ linesChanged: 0, filesChanged: [] as string[] }) });

  it('zero diff + strict probe GREEN (ran & all passed) → DONE', async () => {
    const r = await reconcileNoChangeSatisfied(noChangeResult(), task(), '/proj', {
      ...zeroDiff(),
      runStrictGoalStateProbe: () => ({ ran: true, allPassed: true }),
    });
    expect(r.decision).toBe('DONE');
    expect(r.reconciled).toBe(true);
  });

  it('zero diff + probe ran but NOT all passed → NO_GO stands (fail-closed)', async () => {
    const r = await reconcileNoChangeSatisfied(noChangeResult(), task(), '/proj', {
      ...zeroDiff(),
      runStrictGoalStateProbe: () => ({ ran: true, allPassed: false }),
    });
    expect(r.decision).toBe('NO_GO');
    expect(r.reconciled).toBe(false);
  });

  it('zero diff + NO tests actually ran → NO_GO stands (empty-match is not proof)', async () => {
    const r = await reconcileNoChangeSatisfied(noChangeResult(), task(), '/proj', {
      ...zeroDiff(),
      runStrictGoalStateProbe: () => ({ ran: false, allPassed: false }),
    });
    expect(r.decision).toBe('NO_GO');
  });

  it('HOLD attribution is NEVER routed around — stays NO_GO even with a green probe', async () => {
    const held = { taskId: '001-002-fix-fix', selfAssessment: 'NO_GO', workAttribution: { state: 'HOLD', reasonCode: 'CLAIM_OUTSIDE_WRITE_SCOPE' } } as unknown as TaskResult;
    const r = await reconcileNoChangeSatisfied(held, task(), '/proj', {
      ...zeroDiff(),
      runStrictGoalStateProbe: () => ({ ran: true, allPassed: true }),
    });
    expect(r.decision).toBe('NO_GO');
    expect(r.notes).toMatch(/HOLD/u);
  });

  it('NON-zero diff is not a no-change case — the probe is never consulted', async () => {
    let probeCalls = 0;
    const r = await reconcileNoChangeSatisfied(noChangeResult(), task(), '/proj', {
      getGitDiffStats: () => ({ linesChanged: 12, filesChanged: ['src/greet.js'] }),
      runStrictGoalStateProbe: () => { probeCalls += 1; return { ran: true, allPassed: true }; },
    });
    expect(r.decision).toBe('NO_GO');
    expect(probeCalls).toBe(0);
  });
});

describe('EVAL-NOCHANGE — runStrictGoalStateProbe (empty-match discipline)', () => {
  it('no scoped test surface → ran:false (never a silent pass, unlike the lenient probe)', async () => {
    const r = await runStrictGoalStateProbe('/proj', ['docs/']); // no src/ or tests/
    expect(r.ran).toBe(false);
    expect(r.allPassed).toBe(false);
  });

  it('all tests green + exit 0 → ran:true, allPassed:true', async () => {
    const runner = async () => ({ status: 0, stdout: JSON.stringify({ numPassedTests: 2, numTotalTests: 2 }), stderr: '', error: undefined });
    const r = await runStrictGoalStateProbe('/proj', ['tests/'], runner as never);
    expect(r).toMatchObject({ ran: true, allPassed: true, total: 2, passed: 2 });
  });

  it('partial pass → ran:true but allPassed:false (50% is not proof)', async () => {
    const runner = async () => ({ status: 1, stdout: JSON.stringify({ numPassedTests: 1, numTotalTests: 2 }), stderr: '', error: undefined });
    const r = await runStrictGoalStateProbe('/proj', ['tests/'], runner as never);
    expect(r.ran).toBe(true);
    expect(r.allPassed).toBe(false);
  });

  it('zero total tests → ran:false (an empty run is not proof)', async () => {
    const runner = async () => ({ status: 0, stdout: JSON.stringify({ numPassedTests: 0, numTotalTests: 0 }), stderr: '', error: undefined });
    const r = await runStrictGoalStateProbe('/proj', ['tests/'], runner as never);
    expect(r.ran).toBe(false);
  });
});
