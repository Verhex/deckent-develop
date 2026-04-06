import { describe, it, expect } from 'vitest';
import {
  formatElapsed,
  estimateRemaining,
  findIssues,
  formatHumanStatus,
  type HumanStatusInput,
} from '../../../src/cli/helpers/output.js';
import { AgentStatus, SprintPhase, SprintStatus, TaskStatus } from '../../../src/core/types.js';
import type { DashboardState, AgentInfo, Task } from '../../../src/core/types.js';

// ─── Factories ──────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '001',
    title: 'Test task',
    description: 'desc',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'tests pass', noGoCriteria: 'tests fail', techDebtAcceptable: 'minor' },
    status: TaskStatus.PENDING,
    ...overrides,
  };
}

function makeAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id: 'w-001',
    role: 'worker',
    status: AgentStatus.EXECUTING,
    model: 'sonnet',
    tmuxWindow: 'w-001',
    spawnedAt: '2026-03-23T10:00:00Z',
    ...overrides,
  };
}

function makeDashboard(overrides: Partial<DashboardState> = {}): DashboardState {
  return {
    sprint: { id: 'sprint-040', number: 40, phase: SprintPhase.EXECUTE, status: SprintStatus.ACTIVE },
    agents: [],
    progress: { done: 3, active: 2, blocked: 0, total: 10 },
    alerts: [],
    updatedAt: '2026-03-23T10:00:00Z',
    ...overrides,
  };
}

function makeInput(overrides: Partial<HumanStatusInput> = {}): HumanStatusInput {
  return {
    dashboard: makeDashboard(),
    tasks: [],
    nowMs: new Date('2026-03-23T10:12:00Z').getTime(),
    ...overrides,
  };
}

// ─── formatElapsed ──────────────────────────────────────────────────

describe('formatElapsed', () => {
  it('returns "0 sec" for negative values', () => {
    expect(formatElapsed(-1000)).toBe('0 sec');
  });

  it('returns seconds for < 60s', () => {
    expect(formatElapsed(45000)).toBe('45 sec');
  });

  it('returns minutes for < 60 min', () => {
    expect(formatElapsed(12 * 60 * 1000)).toBe('12 min');
  });

  it('returns hours and minutes', () => {
    expect(formatElapsed(65 * 60 * 1000)).toBe('1 hr 5 min');
  });

  it('returns hours only when exact', () => {
    expect(formatElapsed(2 * 60 * 60 * 1000)).toBe('2 hr');
  });

  it('returns 0 sec for 0ms', () => {
    expect(formatElapsed(0)).toBe('0 sec');
  });
});

// ─── estimateRemaining ──────────────────────────────────────────────

describe('estimateRemaining', () => {
  it('returns null when no tasks done', () => {
    expect(estimateRemaining(0, 10, 5000)).toBeNull();
  });

  it('returns null when all tasks done', () => {
    expect(estimateRemaining(10, 10, 60000)).toBeNull();
  });

  it('estimates remaining time proportionally', () => {
    // 5 done in 10 min, 5 remaining → ~10 min
    const result = estimateRemaining(5, 10, 10 * 60 * 1000);
    expect(result).toBe('~10 min');
  });

  it('returns estimate with tilde prefix', () => {
    const result = estimateRemaining(3, 10, 6 * 60 * 1000);
    expect(result).toMatch(/^~/);
  });
});

// ─── findIssues ─────────────────────────────────────────────────────

describe('findIssues', () => {
  it('returns empty for healthy state', () => {
    const tasks = [makeTask({ status: TaskStatus.DONE })];
    const agents = [makeAgent({ status: AgentStatus.DONE })];
    expect(findIssues(tasks, agents)).toEqual([]);
  });

  it('flags agent errors', () => {
    const agents = [makeAgent({ id: 'w-003', status: AgentStatus.ERROR, taskId: '003' })];
    const tasks = [makeTask({ id: '003', title: 'Broken task' })];
    const issues = findIssues(tasks, agents);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('error detected');
    expect(issues[0]).toContain('Task 003');
  });

  it('flags NO_GO tasks', () => {
    const tasks = [makeTask({ id: '005', title: 'Failed task', status: TaskStatus.NO_GO })];
    const issues = findIssues(tasks, []);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('NO_GO');
  });

  it('reports agent error even without matching task', () => {
    const agents = [makeAgent({ id: 'w-orphan', status: AgentStatus.ERROR, taskId: 'missing' })];
    const issues = findIssues([], agents);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('Agent w-orphan');
  });
});

// ─── formatHumanStatus ──────────────────────────────────────────────

describe('formatHumanStatus', () => {
  it('shows sprint number in header', () => {
    const output = formatHumanStatus(makeInput());
    expect(output).toContain('Sprint 040');
  });

  it('shows sprint title when provided', () => {
    const output = formatHumanStatus(makeInput({ sprintTitle: 'Worker Feedback Loop' }));
    expect(output).toContain('Sprint 040 — Worker Feedback Loop');
  });

  it('shows progress as fraction and percentage', () => {
    const output = formatHumanStatus(makeInput());
    expect(output).toContain('3/10 tasks done (30%)');
  });

  it('shows active worker count', () => {
    const output = formatHumanStatus(makeInput());
    expect(output).toContain('Active: 2 workers running');
  });

  it('uses singular "worker" for count of 1', () => {
    const input = makeInput({
      dashboard: makeDashboard({ progress: { done: 1, active: 1, blocked: 0, total: 5 } }),
    });
    const output = formatHumanStatus(input);
    expect(output).toContain('Active: 1 worker running');
  });

  it('shows elapsed time when sprintStartedAt provided', () => {
    const input = makeInput({
      sprintStartedAt: '2026-03-23T10:00:00Z',
      nowMs: new Date('2026-03-23T10:12:00Z').getTime(),
    });
    const output = formatHumanStatus(input);
    expect(output).toContain('Time: 12 min elapsed');
  });

  it('shows ETA when tasks in progress', () => {
    const input = makeInput({
      sprintStartedAt: '2026-03-23T10:00:00Z',
      nowMs: new Date('2026-03-23T10:12:00Z').getTime(),
      dashboard: makeDashboard({ progress: { done: 3, active: 2, blocked: 0, total: 10 } }),
    });
    const output = formatHumanStatus(input);
    expect(output).toContain('remaining');
  });

  it('does not show time when sprintStartedAt is absent', () => {
    const input = makeInput({ sprintStartedAt: undefined });
    const output = formatHumanStatus(input);
    expect(output).not.toContain('Time:');
  });

  it('includes "What\'s happening:" section', () => {
    const output = formatHumanStatus(makeInput());
    expect(output).toContain("What's happening:");
  });

  it('shows done tasks with checkmark', () => {
    const input = makeInput({
      tasks: [makeTask({ id: '001', title: 'TSC verify loop', status: TaskStatus.DONE })],
    });
    const output = formatHumanStatus(input);
    expect(output).toContain('✓');
    expect(output).toContain('Task 001');
    expect(output).toContain('TSC verify loop');
    expect(output).toContain('Done');
  });

  it('shows active tasks with arrow', () => {
    const input = makeInput({
      tasks: [makeTask({ id: '005', title: 'CLI output', status: TaskStatus.EXECUTING })],
    });
    const output = formatHumanStatus(input);
    expect(output).toContain('▶');
    expect(output).toContain('Task 005');
  });

  it('shows agent current action for active tasks', () => {
    const input = makeInput({
      tasks: [makeTask({ id: '006', title: 'MCP output', status: TaskStatus.EXECUTING })],
      dashboard: makeDashboard({
        agents: [makeAgent({ taskId: '006', currentAction: 'Running tests, attempt 2/3' })],
      }),
    });
    const output = formatHumanStatus(input);
    expect(output).toContain('Running tests, attempt 2/3');
  });

  it('shows NO_GO tasks with X mark', () => {
    const input = makeInput({
      tasks: [makeTask({ id: '009', title: 'Dashboard chart', status: TaskStatus.NO_GO })],
    });
    const output = formatHumanStatus(input);
    expect(output).toContain('✗');
    expect(output).toContain('Failed');
  });

  it('shows waiting tasks with dependencies', () => {
    const input = makeInput({
      tasks: [makeTask({
        id: '008',
        title: 'Retro format',
        status: TaskStatus.PENDING,
        dependencies: ['007'],
      })],
    });
    const output = formatHumanStatus(input);
    expect(output).toContain('Waiting for 007');
  });

  it('collapses waiting tasks when > 3', () => {
    const tasks = Array.from({ length: 5 }, (_, i) =>
      makeTask({ id: `0${i + 10}`, title: `Task ${i + 10}`, status: TaskStatus.PENDING }),
    );
    const input = makeInput({
      tasks,
      dashboard: makeDashboard({ progress: { done: 0, active: 0, blocked: 0, total: 5 } }),
    });
    const output = formatHumanStatus(input);
    // First 2 shown individually, rest collapsed
    expect(output).toContain('Task 010');
    expect(output).toContain('Task 011');
    expect(output).toContain('Queued');
  });

  it('shows issues section for NO_GO tasks', () => {
    const input = makeInput({
      tasks: [makeTask({ id: '003', title: 'Bad task', status: TaskStatus.NO_GO })],
    });
    const output = formatHumanStatus(input);
    expect(output).toContain('Issues:');
    expect(output).toContain('⚠');
  });

  it('shows issues section for agent errors', () => {
    const input = makeInput({
      tasks: [makeTask({ id: '003', title: 'Error task' })],
      dashboard: makeDashboard({
        agents: [makeAgent({ status: AgentStatus.ERROR, taskId: '003' })],
      }),
    });
    const output = formatHumanStatus(input);
    expect(output).toContain('Issues:');
    expect(output).toContain('error detected');
  });

  it('shows blocked count when > 0', () => {
    const input = makeInput({
      dashboard: makeDashboard({ progress: { done: 3, active: 2, blocked: 2, total: 10 } }),
    });
    const output = formatHumanStatus(input);
    expect(output).toContain('Blocked: 2 tasks blocked by dependencies');
  });

  it('does not show blocked section when 0', () => {
    const input = makeInput({
      dashboard: makeDashboard({ progress: { done: 3, active: 2, blocked: 0, total: 10 } }),
    });
    const output = formatHumanStatus(input);
    expect(output).not.toContain('Blocked:');
  });

  it('shows "Next" section for queued tasks', () => {
    const input = makeInput({
      tasks: [makeTask({ id: '010', status: TaskStatus.PENDING })],
    });
    const output = formatHumanStatus(input);
    expect(output).toContain('Next:');
    expect(output).toContain('will start as workers free up');
  });

  it('does not show "Next" when no waiting tasks', () => {
    const input = makeInput({
      tasks: [makeTask({ status: TaskStatus.DONE })],
    });
    const output = formatHumanStatus(input);
    expect(output).not.toContain('Next:');
  });

  it('handles empty task list gracefully', () => {
    const output = formatHumanStatus(makeInput({ tasks: [] }));
    expect(output).toContain('Sprint 040');
    expect(output).toContain("What's happening:");
  });

  it('truncates long task titles', () => {
    const input = makeInput({
      tasks: [makeTask({
        id: '001',
        title: 'A very long task title that exceeds the maximum length for display',
        status: TaskStatus.EXECUTING,
      })],
    });
    const output = formatHumanStatus(input);
    expect(output).toContain('…');
  });

  it('full integration: mixed status tasks produce coherent output', () => {
    const tasks = [
      makeTask({ id: '001', title: 'TSC verify loop', status: TaskStatus.DONE }),
      makeTask({ id: '002', title: 'Test verify loop', status: TaskStatus.DONE }),
      makeTask({ id: '005', title: 'CLI output', status: TaskStatus.EXECUTING }),
      makeTask({ id: '006', title: 'MCP output', status: TaskStatus.TESTING }),
      makeTask({ id: '008', title: 'Retro format', status: TaskStatus.PENDING, dependencies: ['007'] }),
      makeTask({ id: '009', title: 'Doctor friendly', status: TaskStatus.PENDING }),
    ];
    const agents: AgentInfo[] = [
      makeAgent({ taskId: '005', currentAction: 'Writing code (2 min)', status: AgentStatus.CODING }),
      makeAgent({ id: 'w-002', taskId: '006', currentAction: 'Running tests, attempt 2/3', status: AgentStatus.TESTING }),
    ];
    const input: HumanStatusInput = {
      dashboard: makeDashboard({
        agents,
        progress: { done: 2, active: 2, blocked: 0, total: 6 },
      }),
      tasks,
      sprintTitle: 'Worker Feedback Loop',
      sprintStartedAt: '2026-03-23T10:00:00Z',
      nowMs: new Date('2026-03-23T10:12:00Z').getTime(),
    };

    const output = formatHumanStatus(input);

    // Header
    expect(output).toContain('Sprint 040 — Worker Feedback Loop');
    // Progress
    expect(output).toContain('2/6 tasks done (33%)');
    // Active workers
    expect(output).toContain('Active: 2 workers running');
    // Time
    expect(output).toContain('12 min elapsed');
    expect(output).toContain('remaining');
    // Done tasks
    expect(output).toContain('TSC verify loop');
    expect(output).toContain('Test verify loop');
    // Active tasks with actions
    expect(output).toContain('Writing code (2 min)');
    expect(output).toContain('Running tests, attempt 2/3');
    // Waiting
    expect(output).toContain('Waiting for 007');
    expect(output).toContain('Queued');
    // Next section
    expect(output).toContain('Next: 2 tasks will start as workers free up');
  });

  it('shows paused tasks correctly', () => {
    const input = makeInput({
      tasks: [makeTask({ id: '004', title: 'Paused work', status: TaskStatus.PAUSED })],
    });
    const output = formatHumanStatus(input);
    expect(output).toContain('⏸');
    expect(output).toContain('Paused');
  });

  it('100% progress when all done', () => {
    const input = makeInput({
      dashboard: makeDashboard({ progress: { done: 5, active: 0, blocked: 0, total: 5 } }),
      tasks: Array.from({ length: 5 }, (_, i) =>
        makeTask({ id: `00${i + 1}`, status: TaskStatus.DONE }),
      ),
    });
    const output = formatHumanStatus(input);
    expect(output).toContain('5/5 tasks done (100%)');
    expect(output).toContain('Active: 0 workers running');
  });

  it('0% progress at start', () => {
    const input = makeInput({
      dashboard: makeDashboard({ progress: { done: 0, active: 0, blocked: 0, total: 10 } }),
    });
    const output = formatHumanStatus(input);
    expect(output).toContain('0/10 tasks done (0%)');
  });
});
