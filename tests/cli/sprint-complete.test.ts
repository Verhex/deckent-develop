import { describe, it, expect } from 'vitest';
import {
  formatHumanSprintComplete,
  formatDuration,
  buildWhatWentWell,
  buildWhatNeedsAttention,
  calculateSelfHealingRate,
  countFirstTryTasks,
  countSelfHealedTasks,
} from '../../src/orchestra/sprint-reporter.js';
import type { Sprint, SprintMetrics, TaskResult, Task } from '../../src/core/types.js';
import { SprintPhase, SprintStatus, TaskStatus } from '../../src/core/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────

function makeMetrics(overrides: Partial<SprintMetrics> = {}): SprintMetrics {
  return {
    totalTasks: 12,
    completedTasks: 11,
    techDebtTasks: 0,
    noGoTasks: 1,
    durationMs: 2100000, // 35 min
    coveragePercent: 85,
    noGoRate: 8.3,
    newDebtCount: 0,
    resolvedDebtCount: 0,
    totalOpenDebt: 2,
    boundaryViolations: 0,
    crossAssignments: 0,
    contextLinesUsed: 100,
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '040-001',
    title: 'Test Task',
    description: 'A test task',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'testing',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: TaskStatus.DONE,
    ...overrides,
  };
}

function makeSprint(overrides: Partial<Sprint> = {}): Sprint {
  return {
    id: 'sprint-040',
    number: 40,
    status: SprintStatus.COMPLETE,
    phase: SprintPhase.COMPLETE,
    tasks: [
      makeTask({ id: '040-001', title: 'Worker tsc verify' }),
      makeTask({ id: '040-002', title: 'Worker test verify' }),
      makeTask({ id: '040-003', title: 'Feedback metrics' }),
    ],
    workers: ['w-1', 'w-2'],
    metrics: makeMetrics({ totalTasks: 3, completedTasks: 3, noGoTasks: 0 }),
    ...overrides,
  };
}

function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '040-001',
    workerId: 'w-1',
    filesChanged: ['src/test.ts'],
    linesAdded: 100,
    linesRemoved: 20,
    testsPassed: true,
    coverage: 85,
    selfAssessment: 'DONE',
    notes: 'All good',
    ...overrides,
  };
}

// ─── formatHumanSprintComplete ────────────────────────────────────────

describe('formatHumanSprintComplete', () => {
  it('shows sprint number in title with zero-padded format', () => {
    const output = formatHumanSprintComplete({ sprint: makeSprint() });
    expect(output).toContain('Sprint 040 Complete!');
  });

  it('shows success/failure count clearly', () => {
    const sprint = makeSprint({
      metrics: makeMetrics({ totalTasks: 12, completedTasks: 11, noGoTasks: 1 }),
    });
    const output = formatHumanSprintComplete({ sprint });
    expect(output).toContain('11/12 tasks succeeded');
    expect(output).toContain('1 needs attention');
  });

  it('does not show "needs attention" when no failures', () => {
    const sprint = makeSprint({
      metrics: makeMetrics({ totalTasks: 5, completedTasks: 5, noGoTasks: 0 }),
    });
    const output = formatHumanSprintComplete({ sprint });
    expect(output).toContain('5/5 tasks succeeded');
    expect(output).not.toContain('needs attention');
  });

  it('shows time duration in human-friendly format', () => {
    const sprint = makeSprint({
      metrics: makeMetrics({ durationMs: 2100000 }), // 35 min
    });
    const output = formatHumanSprintComplete({ sprint });
    expect(output).toContain('35 minutes total');
  });

  it('shows code stats when results are provided', () => {
    const results = [
      makeResult({ linesAdded: 500, linesRemoved: 100 }),
      makeResult({ taskId: '040-002', linesAdded: 745, linesRemoved: 280 }),
    ];
    const output = formatHumanSprintComplete({ sprint: makeSprint(), results });
    expect(output).toContain('+1245 lines added');
    expect(output).toContain('-380 removed');
  });

  it('shows "What went well" section', () => {
    const output = formatHumanSprintComplete({ sprint: makeSprint() });
    expect(output).toContain('What went well:');
  });

  it('shows no boundary violations in "What went well"', () => {
    const sprint = makeSprint({
      metrics: makeMetrics({ boundaryViolations: 0 }),
    });
    const output = formatHumanSprintComplete({ sprint });
    expect(output).toContain('No boundary violations');
  });

  it('shows first-try task count in "What went well"', () => {
    const results = [
      makeResult({ selfAssessment: 'DONE' }),
      makeResult({ taskId: '040-002', selfAssessment: 'DONE' }),
    ];
    const output = formatHumanSprintComplete({ sprint: makeSprint(), results });
    expect(output).toContain('2 tasks completed on first try');
  });

  it('shows self-healed tasks in "What went well"', () => {
    const results = [
      makeResult({
        selfAssessment: 'DONE',
        feedbackLoop: { tscAttempts: 2, testAttempts: 1, tscErrorsFixed: 1, testFailuresFixed: 0, totalRetryTimeMs: 5000 },
      }),
    ];
    const output = formatHumanSprintComplete({ sprint: makeSprint(), results });
    expect(output).toContain('1 task self-healed');
  });

  it('shows "What needs attention" for NO_GO tasks', () => {
    const sprint = makeSprint({
      tasks: [
        makeTask({ id: '040-009', title: 'Dashboard chart', status: TaskStatus.NO_GO }),
      ],
      metrics: makeMetrics({ totalTasks: 1, completedTasks: 0, noGoTasks: 1 }),
    });
    const results = [
      makeResult({ taskId: '040-009', selfAssessment: 'NO_GO', notes: 'vitest timeout' }),
    ];
    const output = formatHumanSprintComplete({ sprint, results });
    expect(output).toContain('What needs attention:');
    expect(output).toContain('040-009');
    expect(output).toContain('Dashboard chart');
    expect(output).toContain('NO_GO');
    expect(output).toContain('vitest timeout');
  });

  it('shows self-healing rate when retries occurred', () => {
    const results = [
      makeResult({
        selfAssessment: 'DONE',
        feedbackLoop: { tscAttempts: 2, testAttempts: 1, tscErrorsFixed: 1, testFailuresFixed: 0, totalRetryTimeMs: 3000 },
      }),
      makeResult({
        taskId: '040-002',
        selfAssessment: 'DONE',
        feedbackLoop: { tscAttempts: 1, testAttempts: 3, tscErrorsFixed: 0, testFailuresFixed: 2, totalRetryTimeMs: 8000 },
      }),
      makeResult({
        taskId: '040-003',
        selfAssessment: 'NO_GO',
        feedbackLoop: { tscAttempts: 3, testAttempts: 1, tscErrorsFixed: 0, testFailuresFixed: 0, totalRetryTimeMs: 10000 },
      }),
    ];
    const output = formatHumanSprintComplete({ sprint: makeSprint(), results });
    expect(output).toContain('Self-healing rate: 67%');
    expect(output).toContain('2/3 retries succeeded');
  });

  it('does not show self-healing rate when no retries', () => {
    const results = [
      makeResult({ selfAssessment: 'DONE' }),
    ];
    const output = formatHumanSprintComplete({ sprint: makeSprint(), results });
    expect(output).not.toContain('Self-healing rate');
  });

  it('shows next steps with actionable commands', () => {
    const output = formatHumanSprintComplete({ sprint: makeSprint() });
    expect(output).toContain('Next steps:');
    expect(output).toContain('deckent retro');
    expect(output).toContain('Ready for next sprint');
  });

  it('shows debt command in next steps when open debt exists', () => {
    const sprint = makeSprint({
      metrics: makeMetrics({ totalOpenDebt: 3 }),
    });
    const output = formatHumanSprintComplete({ sprint });
    expect(output).toContain('deckent status --debt');
  });

  it('omits debt command when no open debt', () => {
    const sprint = makeSprint({
      metrics: makeMetrics({ totalOpenDebt: 0 }),
    });
    const output = formatHumanSprintComplete({ sprint });
    expect(output).not.toContain('deckent status --debt');
  });

  it('shows task count when no metrics', () => {
    const sprint = makeSprint({ metrics: undefined });
    const output = formatHumanSprintComplete({ sprint });
    expect(output).toContain('3 tasks');
  });
});

// ─── formatDuration ─────────────────────────────────────────────────

describe('formatDuration', () => {
  it('returns empty string for undefined', () => {
    expect(formatDuration(undefined)).toBe('');
  });

  it('returns empty string for zero', () => {
    expect(formatDuration(0)).toBe('');
  });

  it('formats seconds', () => {
    expect(formatDuration(45000)).toBe('45 seconds total');
  });

  it('formats minutes', () => {
    expect(formatDuration(300000)).toBe('5 minutes total');
  });

  it('formats minutes with seconds', () => {
    expect(formatDuration(125000)).toBe('2 minutes 5s total');
  });

  it('formats hours', () => {
    expect(formatDuration(5400000)).toBe('1h 30m total');
  });

  it('singular minute', () => {
    expect(formatDuration(60000)).toBe('1 minute total');
  });
});

// ─── buildWhatWentWell ──────────────────────────────────────────────

describe('buildWhatWentWell', () => {
  it('includes first-try count', () => {
    const results = [makeResult(), makeResult({ taskId: '040-002' })];
    const items = buildWhatWentWell(makeSprint(), results);
    expect(items).toContain('2 tasks completed on first try');
  });

  it('includes self-healed count', () => {
    const results = [
      makeResult({
        feedbackLoop: { tscAttempts: 2, testAttempts: 1, tscErrorsFixed: 1, testFailuresFixed: 0, totalRetryTimeMs: 5000 },
      }),
    ];
    const items = buildWhatWentWell(makeSprint(), results);
    expect(items.some(i => i.includes('self-healed'))).toBe(true);
  });

  it('includes no boundary violations', () => {
    const sprint = makeSprint({ metrics: makeMetrics({ boundaryViolations: 0 }) });
    const items = buildWhatWentWell(sprint);
    expect(items).toContain('No boundary violations');
  });

  it('does not include no boundary violations when there were violations', () => {
    const sprint = makeSprint({ metrics: makeMetrics({ boundaryViolations: 2 }) });
    const items = buildWhatWentWell(sprint);
    expect(items).not.toContain('No boundary violations');
  });
});

// ─── buildWhatNeedsAttention ────────────────────────────────────────

describe('buildWhatNeedsAttention', () => {
  it('lists NO_GO tasks', () => {
    const sprint = makeSprint({
      tasks: [makeTask({ id: '040-009', title: 'Dashboard', status: TaskStatus.NO_GO })],
    });
    const items = buildWhatNeedsAttention(sprint);
    expect(items.length).toBe(1);
    expect(items[0]).toContain('040-009');
    expect(items[0]).toContain('Dashboard');
    expect(items[0]).toContain('NO_GO');
  });

  it('includes result notes for NO_GO tasks', () => {
    const sprint = makeSprint({
      tasks: [makeTask({ id: '040-009', title: 'Dashboard', status: TaskStatus.NO_GO })],
    });
    const results = [makeResult({ taskId: '040-009', selfAssessment: 'NO_GO', notes: 'vitest timeout error' })];
    const items = buildWhatNeedsAttention(sprint, results);
    expect(items[0]).toContain('vitest timeout error');
  });

  it('flags tasks with many retries', () => {
    const sprint = makeSprint();
    const results = [
      makeResult({
        selfAssessment: 'DONE',
        feedbackLoop: { tscAttempts: 3, testAttempts: 1, tscErrorsFixed: 2, testFailuresFixed: 0, totalRetryTimeMs: 10000 },
      }),
    ];
    const items = buildWhatNeedsAttention(sprint, results);
    expect(items.some(i => i.includes('retries'))).toBe(true);
  });

  it('returns empty for clean sprint', () => {
    const items = buildWhatNeedsAttention(makeSprint());
    expect(items).toEqual([]);
  });
});

// ─── calculateSelfHealingRate ───────────────────────────────────────

describe('calculateSelfHealingRate', () => {
  it('returns null when no results', () => {
    expect(calculateSelfHealingRate(undefined)).toBeNull();
    expect(calculateSelfHealingRate([])).toBeNull();
  });

  it('returns null when no retries occurred', () => {
    const results = [makeResult()];
    expect(calculateSelfHealingRate(results)).toBeNull();
  });

  it('calculates 100% when all retries succeeded', () => {
    const results = [
      makeResult({
        selfAssessment: 'DONE',
        feedbackLoop: { tscAttempts: 2, testAttempts: 1, tscErrorsFixed: 1, testFailuresFixed: 0, totalRetryTimeMs: 3000 },
      }),
    ];
    const rate = calculateSelfHealingRate(results);
    expect(rate).toEqual({ percent: 100, healed: 1, attempted: 1 });
  });

  it('calculates partial rate correctly', () => {
    const results = [
      makeResult({
        selfAssessment: 'DONE',
        feedbackLoop: { tscAttempts: 2, testAttempts: 1, tscErrorsFixed: 1, testFailuresFixed: 0, totalRetryTimeMs: 3000 },
      }),
      makeResult({
        taskId: '040-002',
        selfAssessment: 'NO_GO',
        feedbackLoop: { tscAttempts: 3, testAttempts: 1, tscErrorsFixed: 0, testFailuresFixed: 0, totalRetryTimeMs: 10000 },
      }),
    ];
    const rate = calculateSelfHealingRate(results);
    expect(rate).toEqual({ percent: 50, healed: 1, attempted: 2 });
  });

  it('counts GO_WITH_TECH_DEBT as healed', () => {
    const results = [
      makeResult({
        selfAssessment: 'GO_WITH_TECH_DEBT',
        feedbackLoop: { tscAttempts: 1, testAttempts: 2, tscErrorsFixed: 0, testFailuresFixed: 1, totalRetryTimeMs: 5000 },
      }),
    ];
    const rate = calculateSelfHealingRate(results);
    expect(rate).toEqual({ percent: 100, healed: 1, attempted: 1 });
  });
});

// ─── countFirstTryTasks ─────────────────────────────────────────────

describe('countFirstTryTasks', () => {
  it('returns 0 for undefined', () => {
    expect(countFirstTryTasks(undefined)).toBe(0);
  });

  it('counts tasks with no feedbackLoop as first-try', () => {
    const results = [makeResult(), makeResult({ taskId: '040-002' })];
    expect(countFirstTryTasks(results)).toBe(2);
  });

  it('excludes NO_GO tasks', () => {
    const results = [makeResult({ selfAssessment: 'NO_GO' })];
    expect(countFirstTryTasks(results)).toBe(0);
  });

  it('excludes tasks with retries', () => {
    const results = [
      makeResult({
        feedbackLoop: { tscAttempts: 2, testAttempts: 1, tscErrorsFixed: 1, testFailuresFixed: 0, totalRetryTimeMs: 3000 },
      }),
    ];
    expect(countFirstTryTasks(results)).toBe(0);
  });

  it('counts tasks with feedbackLoop but no retries as first-try', () => {
    const results = [
      makeResult({
        feedbackLoop: { tscAttempts: 1, testAttempts: 1, tscErrorsFixed: 0, testFailuresFixed: 0, totalRetryTimeMs: 0 },
      }),
    ];
    expect(countFirstTryTasks(results)).toBe(1);
  });
});

// ─── countSelfHealedTasks ───────────────────────────────────────────

describe('countSelfHealedTasks', () => {
  it('returns 0 for undefined', () => {
    expect(countSelfHealedTasks(undefined)).toBe(0);
  });

  it('counts tasks that had retries and succeeded', () => {
    const results = [
      makeResult({
        selfAssessment: 'DONE',
        feedbackLoop: { tscAttempts: 2, testAttempts: 1, tscErrorsFixed: 1, testFailuresFixed: 0, totalRetryTimeMs: 3000 },
      }),
    ];
    expect(countSelfHealedTasks(results)).toBe(1);
  });

  it('excludes NO_GO tasks even with retries', () => {
    const results = [
      makeResult({
        selfAssessment: 'NO_GO',
        feedbackLoop: { tscAttempts: 3, testAttempts: 1, tscErrorsFixed: 0, testFailuresFixed: 0, totalRetryTimeMs: 10000 },
      }),
    ];
    expect(countSelfHealedTasks(results)).toBe(0);
  });

  it('excludes tasks with no retries', () => {
    const results = [makeResult()];
    expect(countSelfHealedTasks(results)).toBe(0);
  });
});
