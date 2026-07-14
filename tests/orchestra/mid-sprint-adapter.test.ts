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
