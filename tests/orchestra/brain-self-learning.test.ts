import { describe, it, expect } from 'vitest';
import {
  generateConfigSuggestions,
  detectRecurringFileErrors,
  buildBrainInsights,
} from '../../src/orchestra/sprint-reporter.js';
import { TaskEvaluation } from '../../src/core/types.js';
import type { SprintResult, SprintMetrics, Sprint } from '../../src/core/types.js';
import { TaskStatus } from '../../src/core/types.js';

function makeMetrics(overrides: Partial<SprintMetrics> = {}): SprintMetrics {
  return {
    totalTasks: 4,
    completedTasks: 2,
    techDebtTasks: 0,
    noGoTasks: 2,
    durationMs: 1_800_000,
    coveragePercent: 60,
    noGoRate: 0.5,
    newDebtCount: 0,
    resolvedDebtCount: 0,
    totalOpenDebt: 0,
    boundaryViolations: 0,
    crossAssignments: 0,
    contextLinesUsed: 0,
    ...overrides,
  };
}

function makeSprint(id: string, tasks: Sprint['tasks'] = []): Sprint {
  return {
    id,
    number: parseInt(id.replace('sprint-', ''), 10) || 1,
    status: 'DONE' as any,
    phase: 'EVALUATE' as any,
    tasks,
    workers: [],
  };
}

function makeTask(id: string, filesWrite: string[] = [], directories: string[] = []): Sprint['tasks'][0] {
  return {
    id,
    title: `Task ${id}`,
    description: '',
    model: 'opus' as any,
    effort: 'normal' as any,
    priority: 'NORMAL' as any,
    reason: '',
    scope: { directories, filesRead: [], filesWrite },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: TaskStatus.DONE,
  };
}

function makeSprintResult(
  sprintId: string,
  noGoTaskIds: string[],
  filesWrite: string[] = [],
  directories: string[] = [],
  metricsOverrides: Partial<SprintMetrics> = {},
): SprintResult {
  const allTaskIds = [...new Set([...noGoTaskIds, 'ok-1', 'ok-2'])];
  const tasks = allTaskIds.map(id => makeTask(id, filesWrite, directories));
  const evals = new Map<string, TaskEvaluation>();
  for (const id of allTaskIds) {
    evals.set(id, noGoTaskIds.includes(id) ? TaskEvaluation.NO_GO : TaskEvaluation.DONE);
  }
  return {
    sprint: makeSprint(sprintId, tasks),
    evaluations: evals,
    metrics: makeMetrics(metricsOverrides),
  };
}

// ═══ generateConfigSuggestions ═══

describe('generateConfigSuggestions', () => {
  it('suggests planning mode change when NO_GO rate > 50%', () => {
    const result = generateConfigSuggestions(
      makeSprintResult('sprint-1', ['t1', 't2', 't3'], [], [], { noGoRate: 0.75 }),
    );
    expect(result.some(s => s.field === 'brain_planning')).toBe(true);
  });

  it('suggests testing skill when coverage < 40%', () => {
    const result = generateConfigSuggestions(
      makeSprintResult('sprint-1', [], [], [], { coveragePercent: 30, noGoRate: 0.1 }),
    );
    expect(result.some(s => s.field === 'active_skills')).toBe(true);
  });

  it('suggests max_workers increase when duration > 1 hour', () => {
    const result = generateConfigSuggestions(
      makeSprintResult('sprint-1', [], [], [], { durationMs: 4_000_000, noGoRate: 0.1 }),
    );
    expect(result.some(s => s.field === 'max_workers')).toBe(true);
  });

  it('returns empty array for healthy sprint', () => {
    const result = generateConfigSuggestions(
      makeSprintResult('sprint-1', [], [], [], { noGoRate: 0.1, coveragePercent: 80, durationMs: 600_000 }),
    );
    expect(result).toEqual([]);
  });
});

// ═══ detectRecurringFileErrors ═══

describe('detectRecurringFileErrors', () => {
  it('detects files that appear in NO_GO tasks across 3 sprints', () => {
    const badFile = 'src/broken.ts';
    const results = [
      makeSprintResult('sprint-1', ['t1'], [badFile]),
      makeSprintResult('sprint-2', ['t2'], [badFile]),
      makeSprintResult('sprint-3', ['t3'], [badFile]),
    ];
    const recurring = detectRecurringFileErrors('/tmp/test', results);
    expect(recurring).toContain(badFile);
  });

  it('returns empty for files in < 3 sprints', () => {
    const results = [
      makeSprintResult('sprint-1', ['t1'], ['src/a.ts']),
      makeSprintResult('sprint-2', ['t2'], ['src/b.ts']),
      makeSprintResult('sprint-3', ['t3'], ['src/c.ts']),
    ];
    expect(detectRecurringFileErrors('/tmp/test', results)).toEqual([]);
  });

  it('returns empty when fewer than 3 sprints provided', () => {
    const results = [
      makeSprintResult('sprint-1', ['t1'], ['src/a.ts']),
      makeSprintResult('sprint-2', ['t2'], ['src/a.ts']),
    ];
    expect(detectRecurringFileErrors('/tmp/test', results)).toEqual([]);
  });

  it('only considers last 3 sprints', () => {
    const results = [
      makeSprintResult('sprint-1', ['t1'], ['src/old.ts']),
      makeSprintResult('sprint-2', ['t2'], ['src/new.ts']),
      makeSprintResult('sprint-3', ['t3'], ['src/new.ts']),
      makeSprintResult('sprint-4', ['t4'], ['src/new.ts']),
    ];
    const recurring = detectRecurringFileErrors('/tmp/test', results);
    expect(recurring).toContain('src/new.ts');
    expect(recurring).not.toContain('src/old.ts');
  });
});

// ═══ buildBrainInsights ═══

describe('buildBrainInsights', () => {
  it('produces markdown with sprint score', () => {
    const sr = makeSprintResult('sprint-1', [], [], [], { totalTasks: 5, completedTasks: 4, noGoRate: 0.2, coveragePercent: 75, durationMs: 600_000 });
    const text = buildBrainInsights(sr, [], []);
    expect(text).toContain('### Brain Insights');
    expect(text).toContain('4/5');
  });

  it('includes config suggestions when present', () => {
    const sr = makeSprintResult('sprint-1', [], [], [], { noGoRate: 0.8 });
    const suggestions = [{ field: 'brain_planning', currentValue: 'structured', suggestedValue: 'ai', reason: 'test reason' }];
    const text = buildBrainInsights(sr, suggestions, []);
    expect(text).toContain('Config Suggestions');
    expect(text).toContain('test reason');
  });

  it('includes recurring files when present', () => {
    const sr = makeSprintResult('sprint-1', []);
    const text = buildBrainInsights(sr, [], ['src/bad.ts']);
    expect(text).toContain('Recurring Problem Files');
    expect(text).toContain('src/bad.ts');
  });
});
