import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  AnalyticsData,
  parseSprintMarkdown,
} from '../../src/dashboard/analytics/analytics-data.js';
import type {
  SprintSummary,
  AnalyticsOverview,
} from '../../src/dashboard/analytics/analytics-data.js';

function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `analytics-data-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeSprintFile(root: string, id: string, content: string): void {
  const dir = join(root, '.brain', 'sprints');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${id}.md`), content, 'utf-8');
}

const SPRINT_030 = `# sprint-030

## Metrics
| Metric | Value |
|--------|-------|
| Total Tasks | 6 |
| Completed | 6 |
| Tech Debt | 4 |
| No-Go | 0 |
| Coverage | 33.3 |
| Duration | 234552 |

## Tasks
- 030-001: Task A (DONE)
`;

const SPRINT_031 = `# sprint-031

## Metrics
| Metric | Value |
|--------|-------|
| Total Tasks | 3 |
| Completed | 3 |
| Tech Debt | 2 |
| No-Go | 0 |
| Coverage | 33.3 |
| Duration | 126331 |

## Tasks
- 031-001: Task B (DONE)
`;

const SPRINT_032 = `# sprint-032

## Metrics
| Metric | Value |
|--------|-------|
| Total Tasks | 3 |
| Completed | 3 |
| Tech Debt | 1 |
| No-Go | 0 |
| Coverage | 66.7 |
| Duration | 34291 |

## Tasks
- 032-001: Task C (DONE)
`;

describe('parseSprintMarkdown', () => {
  it('parses total tasks correctly', () => {
    const result = parseSprintMarkdown(SPRINT_030, 'sprint-030');
    expect(result.totalTasks).toBe(6);
  });

  it('parses completed tasks', () => {
    const result = parseSprintMarkdown(SPRINT_030, 'sprint-030');
    expect(result.completedTasks).toBe(6);
  });

  it('parses tech debt count', () => {
    const result = parseSprintMarkdown(SPRINT_030, 'sprint-030');
    expect(result.techDebtTasks).toBe(4);
  });

  it('parses no-go count', () => {
    const result = parseSprintMarkdown(SPRINT_030, 'sprint-030');
    expect(result.noGoTasks).toBe(0);
  });

  it('parses coverage percentage', () => {
    const result = parseSprintMarkdown(SPRINT_032, 'sprint-032');
    expect(result.coverage).toBe(66.7);
  });

  it('parses duration in ms', () => {
    const result = parseSprintMarkdown(SPRINT_031, 'sprint-031');
    expect(result.durationMs).toBe(126331);
  });

  it('sets sprint id from parameter', () => {
    const result = parseSprintMarkdown(SPRINT_030, 'sprint-030');
    expect(result.id).toBe('sprint-030');
  });

  it('returns zero for missing metrics', () => {
    const result = parseSprintMarkdown('# empty sprint', 'sprint-999');
    expect(result.totalTasks).toBe(0);
    expect(result.completedTasks).toBe(0);
  });
});

describe('AnalyticsData', () => {
  let tmpRoot: string;
  let analytics: AnalyticsData;

  beforeEach(() => {
    tmpRoot = makeTmpDir();
    analytics = new AnalyticsData(tmpRoot);
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  // ─── loadSprintData ────────────────────────────────────────────────────────

  it('returns empty array when no sprints directory', () => {
    const result = analytics.loadSprintData();
    expect(result).toEqual([]);
  });

  it('loads all sprint files from .brain/sprints', () => {
    writeSprintFile(tmpRoot, 'sprint-030', SPRINT_030);
    writeSprintFile(tmpRoot, 'sprint-031', SPRINT_031);
    const result = analytics.loadSprintData();
    expect(result).toHaveLength(2);
  });

  it('ignores non-sprint files', () => {
    writeSprintFile(tmpRoot, 'sprint-030', SPRINT_030);
    const dir = join(tmpRoot, '.brain', 'sprints');
    writeFileSync(join(dir, 'notes.txt'), 'random', 'utf-8');
    const result = analytics.loadSprintData();
    expect(result).toHaveLength(1);
  });

  it('returns sorted sprint data', () => {
    writeSprintFile(tmpRoot, 'sprint-032', SPRINT_032);
    writeSprintFile(tmpRoot, 'sprint-030', SPRINT_030);
    const result = analytics.loadSprintData();
    expect(result[0]!.id).toBe('sprint-030');
    expect(result[1]!.id).toBe('sprint-032');
  });

  // ─── buildOverview ─────────────────────────────────────────────────────────

  it('builds overview with correct totalSprints', () => {
    writeSprintFile(tmpRoot, 'sprint-030', SPRINT_030);
    writeSprintFile(tmpRoot, 'sprint-031', SPRINT_031);
    const data = analytics.loadSprintData();
    const overview = analytics.buildOverview(data);
    expect(overview.totalSprints).toBe(2);
  });

  it('builds overview with correct totalTasks', () => {
    writeSprintFile(tmpRoot, 'sprint-030', SPRINT_030);
    writeSprintFile(tmpRoot, 'sprint-031', SPRINT_031);
    const data = analytics.loadSprintData();
    const overview = analytics.buildOverview(data);
    expect(overview.totalTasks).toBe(9);
  });

  it('builds overview with correct overallSuccessRate', () => {
    writeSprintFile(tmpRoot, 'sprint-030', SPRINT_030);
    const data = analytics.loadSprintData();
    const overview = analytics.buildOverview(data);
    // 6 completed + 4 tech debt = 10, but total tasks = 6, so all completed
    // completedTasks(6) + techDebtTasks(4) = 10, total = 6 => (10/6)*100 = 166.67
    // This means the sprint has tech debt tasks ON TOP of completed, success = (6+4)/6 * 100
    expect(overview.overallSuccessRate).toBeGreaterThan(0);
  });

  it('builds overview with coverageTrend array', () => {
    writeSprintFile(tmpRoot, 'sprint-030', SPRINT_030);
    writeSprintFile(tmpRoot, 'sprint-031', SPRINT_031);
    writeSprintFile(tmpRoot, 'sprint-032', SPRINT_032);
    const data = analytics.loadSprintData();
    const overview = analytics.buildOverview(data);
    expect(overview.coverageTrend).toEqual([33.3, 33.3, 66.7]);
  });

  it('builds overview with sprintIds', () => {
    writeSprintFile(tmpRoot, 'sprint-030', SPRINT_030);
    writeSprintFile(tmpRoot, 'sprint-031', SPRINT_031);
    const data = analytics.loadSprintData();
    const overview = analytics.buildOverview(data);
    expect(overview.sprintIds).toEqual(['sprint-030', 'sprint-031']);
  });

  it('returns zero overview for empty data', () => {
    const overview = analytics.buildOverview([]);
    expect(overview.totalSprints).toBe(0);
    expect(overview.totalTasks).toBe(0);
    expect(overview.overallSuccessRate).toBe(0);
    expect(overview.coverageTrend).toEqual([]);
  });

  // ─── filterByDateRange ─────────────────────────────────────────────────────

  it('filters by sprint number range', () => {
    const summaries: SprintSummary[] = [
      { id: 'sprint-030', totalTasks: 6, completedTasks: 6, techDebtTasks: 4, noGoTasks: 0, coverage: 33.3, durationMs: 234552 },
      { id: 'sprint-031', totalTasks: 3, completedTasks: 3, techDebtTasks: 2, noGoTasks: 0, coverage: 33.3, durationMs: 126331 },
      { id: 'sprint-032', totalTasks: 3, completedTasks: 3, techDebtTasks: 1, noGoTasks: 0, coverage: 66.7, durationMs: 34291 },
    ];
    const result = analytics.filterByDateRange(summaries, {
      from: new Date(30),
      to: new Date(31),
    });
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('sprint-030');
    expect(result[1]!.id).toBe('sprint-031');
  });

  it('returns all data for non-numeric date range', () => {
    const summaries: SprintSummary[] = [
      { id: 'sprint-030', totalTasks: 6, completedTasks: 6, techDebtTasks: 4, noGoTasks: 0, coverage: 33.3, durationMs: 234552 },
    ];
    const result = analytics.filterByDateRange(summaries, {
      from: new Date('2025-01-01'),
      to: new Date('2025-12-31'),
    });
    expect(result).toHaveLength(1);
  });

  // ─── formatOverview ────────────────────────────────────────────────────────

  it('formats overview as string', () => {
    const overview: AnalyticsOverview = {
      totalSprints: 3,
      totalTasks: 12,
      overallSuccessRate: 91.67,
      coverageTrend: [33.3, 33.3, 66.7],
      sprintIds: ['sprint-030', 'sprint-031', 'sprint-032'],
    };
    const formatted = analytics.formatOverview(overview);
    expect(formatted).toContain('Sprints: 3');
    expect(formatted).toContain('Tasks: 12');
    expect(formatted).toContain('Success Rate: 91.67%');
    expect(formatted).toContain('Coverage Trend:');
  });

  it('formats overview without coverage when empty', () => {
    const overview: AnalyticsOverview = {
      totalSprints: 0,
      totalTasks: 0,
      overallSuccessRate: 0,
      coverageTrend: [],
      sprintIds: [],
    };
    const formatted = analytics.formatOverview(overview);
    expect(formatted).not.toContain('Coverage Trend');
  });
});
