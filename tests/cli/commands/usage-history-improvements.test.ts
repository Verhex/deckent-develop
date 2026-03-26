/**
 * Tests for usage + history improvements (Sprint 063-008):
 * A) Live usage (5hr/weekly) display in buildUsageOutput
 * B) Subscription mode rate limit percentage
 * C) History trend analysis (buildTrendAnalysis)
 * D) Parse ↔ Write format consistency (successRate field)
 * E) Sprint log error details (writeSprintLog NO_GO error section)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  copyFileSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
  spawnSync: vi.fn(() => ({ status: 0, stdout: '', stderr: '' })),
}));

vi.mock('../../../src/orchestra/doc-updaters/registry.js', () => ({
  runAllUpdaters: vi.fn(() => []),
}));

vi.mock('../../../src/orchestra/doc-updaters/index.js', () => ({}));

vi.mock('../../../src/core/ci-learning.js', () => ({
  analyzeCiLearnings: vi.fn(() => ({})),
  buildCiLearningsSection: vi.fn(() => ''),
  writeCiLearnings: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
  formatTable: vi.fn((headers: string[]) => headers.join(' | ') + '\n------'),
}));

vi.mock('../../../src/core/usage-tracker.js', () => ({
  UsageTracker: vi.fn(),
  DEFAULT_TOKEN_COSTS: { opus: 0.015, sonnet: 0.003, haiku: 0.00025 },
}));

vi.mock('../../../src/core/config.js', () => ({
  readAuthMode: vi.fn(async () => 'subscription'),
  loadConfig: vi.fn(async () => ({ mode: 'max_plan' })),
}));

vi.mock('../../../src/core/provider.js', () => ({
  bootstrapProviders: vi.fn(async () => {}),
}));

vi.mock('../../../src/orchestra/brain.js', () => ({
  checkUsageWithProvider: vi.fn(async () => ({ fiveHourPercent: 35.5, weeklyPercent: 22.1, measuredAt: '' })),
  getDefaultProvider: vi.fn(() => ({ name: 'mock', checkUsage: vi.fn() })),
}));

import { buildUsageOutput } from '../../../src/cli/commands/usage.js';
import { buildTrendAnalysis, parseSprintLog } from '../../../src/cli/commands/history.js';
import { writeSprintLog } from '../../../src/orchestra/sprint-reporter.js';
import { writeFileSync } from 'node:fs';
import { TaskEvaluation } from '../../../src/core/types.js';
import type { UsageTracker } from '../../../src/core/usage-tracker.js';
import type { Sprint, SprintMetrics, TaskResult } from '../../../src/core/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTracker(totalCalls = 10, totalTokens = 5000, sprints = ['sprint-001']): UsageTracker {
  return {
    getTotalUsage: vi.fn(() => ({
      totalCalls,
      totalTokens,
      sprintCount: sprints.length,
      modelBreakdown: [{ model: 'sonnet', calls: totalCalls, tokens: totalTokens }],
    })),
    listSprints: vi.fn(() => sprints),
    listSprintsFiltered: vi.fn(() => sprints),
    getSprintUsage: vi.fn((id: string) => ({
      sprintId: id,
      entries: [],
      totalCalls,
      totalTokens,
      modelBreakdown: [{ model: 'sonnet', calls: totalCalls, tokens: totalTokens }],
      providerBreakdown: [],
      taskBreakdown: [],
    })),
  } as unknown as UsageTracker;
}

function makeRecord(sprint: string, completed: number, total: number, coverage: string) {
  const noGoRate = total > 0 ? `${Math.round((0 / total) * 100)}%` : '0%';
  const successRate = total > 0 ? `${Math.round((completed / total) * 100)}%` : '0%';
  return {
    sprint, tasks: String(total), completed: String(completed),
    techDebt: '0', noGo: '0', noGoRate, successRate, coverage,
    duration: '30s', agents: '-', skills: '-', tokens: '-', calls: '-', filesChanged: '-',
  };
}

function makeSprint(tasks: { id: string; title: string }[]): Sprint {
  return {
    id: 'sprint-test',
    number: 1,
    tasks: tasks.map(t => ({
      id: t.id, title: t.title, description: '', model: 'sonnet', effort: 'normal',
      priority: 'NORMAL', reason: '', scope: { directories: [], filesRead: [], filesWrite: [] },
      dependencies: [], goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
      status: 'DONE' as const, sprintId: 'sprint-test',
      createdAt: new Date().toISOString(), assignedAgent: 'generic',
      assignedSkills: [], provider: 'claude',
    })),
    createdAt: new Date().toISOString(),
  } as unknown as Sprint;
}

const baseMetrics: SprintMetrics = {
  totalTasks: 2, completedTasks: 1, techDebtTasks: 0, noGoTasks: 1,
  durationMs: 60000, coveragePercent: 85, noGoRate: 50,
  newDebtCount: 0, resolvedDebtCount: 0, totalOpenDebt: 0,
  boundaryViolations: 0, crossAssignments: 0, contextLinesUsed: 0,
};

// ─── A) Live Usage Display ────────────────────────────────────────────────────

describe('buildUsageOutput — live usage display (A)', () => {
  it('shows 5hr and weekly percentages in subscription mode when liveUsage provided', () => {
    const tracker = makeTracker();
    const { text } = buildUsageOutput(tracker, {
      isApiMode: false,
      liveUsage: { fiveHourPercent: 42.5, weeklyPercent: 18.3 },
    });
    expect(text).toContain('5hr 42.5%');
    expect(text).toContain('weekly 18.3%');
  });

  it('does not show Live Usage line when no liveUsage provided', () => {
    const tracker = makeTracker();
    const { text } = buildUsageOutput(tracker, { isApiMode: false });
    expect(text).not.toContain('Live Usage');
  });

  it('shows Live Usage section in sprint view', () => {
    const tracker = {
      getTotalUsage: vi.fn(() => ({ totalCalls: 0, totalTokens: 0, sprintCount: 0, modelBreakdown: [] })),
      listSprints: vi.fn(() => []),
      getSprintUsage: vi.fn(() => ({
        sprintId: 'sprint-001', entries: [], totalCalls: 5, totalTokens: 1000,
        modelBreakdown: [{ model: 'sonnet', calls: 5, tokens: 1000 }],
        providerBreakdown: [], taskBreakdown: [],
      })),
    } as unknown as UsageTracker;

    const { text } = buildUsageOutput(tracker, {
      sprint: 'sprint-001',
      isApiMode: false,
      liveUsage: { fiveHourPercent: 60.0, weeklyPercent: 40.0 },
    });
    expect(text).toContain('60.0%');
    expect(text).toContain('40.0%');
  });
});

// ─── B) Subscription Rate Limit Percentage ───────────────────────────────────

describe('buildUsageOutput — subscription rate limit (B)', () => {
  it('shows subscription fallback message when no liveUsage in subscription mode', () => {
    const tracker = makeTracker();
    const { text } = buildUsageOutput(tracker, { isApiMode: false });
    expect(text).toContain('Subscription');
    expect(text).toContain('rate limit based');
  });

  it('replaces "rate limit based" message with percentages when liveUsage present', () => {
    const tracker = makeTracker();
    const { text } = buildUsageOutput(tracker, {
      isApiMode: false,
      liveUsage: { fiveHourPercent: 25.0, weeklyPercent: 10.0 },
    });
    // The live usage message should be shown instead
    expect(text).toContain('Live Usage');
    expect(text).not.toContain('rate limit based');
  });

  it('does not show live usage line in API mode when liveUsage provided', () => {
    const tracker = makeTracker();
    const { text } = buildUsageOutput(tracker, {
      isApiMode: true,
      liveUsage: { fiveHourPercent: 55.0, weeklyPercent: 30.0 },
    });
    // API mode shows cost, not rate limit info
    expect(text).toContain('Est. Cost');
    expect(text).not.toContain('Live Usage');
  });
});

// ─── C) History Trend Analysis ────────────────────────────────────────────────

describe('buildTrendAnalysis (C)', () => {
  it('returns empty string when fewer than 2 records', () => {
    const records = [makeRecord('sprint-001', 5, 5, '90%')];
    expect(buildTrendAnalysis(records)).toBe('');
  });

  it('returns empty string for empty array', () => {
    expect(buildTrendAnalysis([])).toBe('');
  });

  it('shows trend label with sprint count', () => {
    const records = [
      makeRecord('sprint-001', 4, 5, '88%'),
      makeRecord('sprint-002', 5, 5, '92%'),
    ];
    const trend = buildTrendAnalysis(records);
    expect(trend).toContain('Trend (last 2 sprints)');
  });

  it('shows ↑ when success rate improved', () => {
    const records = [
      makeRecord('sprint-001', 3, 5, '80%'),
      makeRecord('sprint-002', 5, 5, '85%'),
    ];
    const trend = buildTrendAnalysis(records);
    // success 60% → 100% = ↑40%
    expect(trend).toContain('↑');
    expect(trend).toContain('40%');
  });

  it('shows ↓ when coverage dropped', () => {
    const records = [
      makeRecord('sprint-001', 5, 5, '95%'),
      makeRecord('sprint-002', 5, 5, '80%'),
    ];
    const trend = buildTrendAnalysis(records);
    expect(trend).toContain('↓');
    expect(trend).toContain('15.0%');
  });

  it('shows → when no change in either metric', () => {
    const records = [
      makeRecord('sprint-001', 5, 5, '90%'),
      makeRecord('sprint-002', 5, 5, '90%'),
    ];
    const trend = buildTrendAnalysis(records);
    // both →
    const arrows = (trend.match(/[↑↓→]/g) ?? []);
    expect(arrows.every(a => a === '→')).toBe(true);
  });

  it('uses only the last 5 records (window=5)', () => {
    const records = Array.from({ length: 8 }, (_, i) =>
      makeRecord(`sprint-00${i + 1}`, 5, 5, '90%'),
    );
    const trend = buildTrendAnalysis(records);
    expect(trend).toContain('last 5 sprints');
  });

  it('includes both Success Rate and Coverage lines', () => {
    const records = [
      makeRecord('sprint-001', 4, 5, '88%'),
      makeRecord('sprint-002', 5, 5, '92%'),
    ];
    const trend = buildTrendAnalysis(records);
    expect(trend).toContain('Success Rate');
    expect(trend).toContain('Coverage');
  });
});

// ─── D) Parse ↔ Write Format Consistency (successRate) ───────────────────────

describe('parseSprintLog — successRate field (D)', () => {
  it('computes successRate from Completed/Total Tasks', () => {
    const content = '# sprint-005\n| Total Tasks | 8 |\n| Completed | 6 |\n| No-Go | 1 |';
    const record = parseSprintLog(content);
    expect(record.successRate).toBe('75%');
  });

  it('returns 0% when total tasks is 0', () => {
    const content = '# sprint-x\n| Total Tasks | 0 |\n| Completed | 0 |';
    const record = parseSprintLog(content);
    expect(record.successRate).toBe('0%');
  });

  it('returns dash when neither Total Tasks nor Completed is found', () => {
    const record = parseSprintLog('# Sprint X\nsome content without metrics');
    expect(record.successRate).toBe('-');
  });

  it('returns 100% when all tasks completed', () => {
    const content = '# sprint-010\n| Total Tasks | 5 |\n| Completed | 5 |';
    const record = parseSprintLog(content);
    expect(record.successRate).toBe('100%');
  });

  it('successRate field is present in returned record', () => {
    const record = parseSprintLog('# sprint-001\n| Total Tasks | 3 |\n| Completed | 2 |');
    expect(record).toHaveProperty('successRate');
  });
});

// ─── E) Sprint Log Error Details ─────────────────────────────────────────────

describe('writeSprintLog — error details section (E)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes ## Errors section when NO_GO tasks exist with results', () => {
    const sprint = makeSprint([
      { id: '001', title: 'Good Task' },
      { id: '002', title: 'Failed Task' },
    ]);
    const evaluations = new Map([
      ['001', TaskEvaluation.DONE],
      ['002', TaskEvaluation.NO_GO],
    ]);
    const results: TaskResult[] = [
      { taskId: '001', filesChanged: ['src/a.ts'], linesAdded: 10, linesRemoved: 0, testsPassed: true, coverage: 90, selfAssessment: 'DONE' },
      { taskId: '002', filesChanged: [], linesAdded: 0, linesRemoved: 0, testsPassed: false, coverage: 0, selfAssessment: 'NO_GO', notes: 'tsc failed: 3 type errors' },
    ];

    writeSprintLog('/mock', sprint, baseMetrics, evaluations, results);

    const written = vi.mocked(writeFileSync).mock.calls[0]?.[1] as string;
    expect(written).toContain('## Errors');
    expect(written).toContain('002 (Failed Task)');
    expect(written).toContain('tsc failed');
  });

  it('does not write ## Errors section when no NO_GO tasks', () => {
    const sprint = makeSprint([{ id: '001', title: 'Good Task' }]);
    const evaluations = new Map([['001', TaskEvaluation.DONE]]);
    const results: TaskResult[] = [
      { taskId: '001', filesChanged: ['src/b.ts'], linesAdded: 5, linesRemoved: 0, testsPassed: true, coverage: 95, selfAssessment: 'DONE' },
    ];
    const metrics = { ...baseMetrics, noGoTasks: 0, completedTasks: 1, totalTasks: 1 };

    writeSprintLog('/mock', sprint, metrics, evaluations, results);

    const written = vi.mocked(writeFileSync).mock.calls[0]?.[1] as string;
    expect(written).not.toContain('## Errors');
  });

  it('writes files changed count in metrics table', () => {
    const sprint = makeSprint([{ id: '001', title: 'Task A' }]);
    const evaluations = new Map([['001', TaskEvaluation.DONE]]);
    const results: TaskResult[] = [
      { taskId: '001', filesChanged: ['a.ts', 'b.ts', 'c.ts'], linesAdded: 30, linesRemoved: 5, testsPassed: true, coverage: 90, selfAssessment: 'DONE' },
    ];

    writeSprintLog('/mock', sprint, baseMetrics, evaluations, results);

    const written = vi.mocked(writeFileSync).mock.calls[0]?.[1] as string;
    expect(written).toContain('Files Changed');
    expect(written).toContain('3');
  });

  it('truncates long error notes to 200 chars', () => {
    const sprint = makeSprint([{ id: '001', title: 'Big Fail' }]);
    const evaluations = new Map([['001', TaskEvaluation.NO_GO]]);
    const longNote = 'A'.repeat(300);
    const results: TaskResult[] = [
      { taskId: '001', filesChanged: [], linesAdded: 0, linesRemoved: 0, testsPassed: false, coverage: 0, selfAssessment: 'NO_GO', notes: longNote },
    ];

    writeSprintLog('/mock', sprint, baseMetrics, evaluations, results);

    const written = vi.mocked(writeFileSync).mock.calls[0]?.[1] as string;
    // The note should be truncated to 200 chars max
    const errorLine = written.split('\n').find(l => l.startsWith('- 001'));
    expect(errorLine).toBeDefined();
    // The truncated note should not exceed 200 chars for the notes portion
    const noteStart = errorLine!.indexOf(': ');
    const noteContent = noteStart >= 0 ? errorLine!.slice(noteStart + 2) : '';
    expect(noteContent.length).toBeLessThanOrEqual(200);
  });
});
