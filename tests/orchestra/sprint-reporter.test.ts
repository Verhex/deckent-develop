import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  trimMemoryWithHeader,
  writeRetrospective,
  writeSprintLog,
  calculateMetrics,
  updateProjectDocs,
  compareWithPreviousSprint,
  readPreviousSprintMetrics,
  formatHumanRetro,
  buildRetroHighlights,
  buildRetroIssues,
  buildRetroLearnings,
  formatDuration,
  calculateSelfHealingRate,
  countFirstTryTasks,
  countSelfHealedTasks,
  countNewTestFiles,
  buildWhatWentWell,
  buildWhatNeedsAttention,
  formatHumanSprintComplete,
  updateProjectIdentity,
  countProjectTestCases,
  parseCoverageFromClover,
  extractSprintNumber,
} from '../../src/orchestra/sprint-reporter.js';
import { TaskEvaluation, SprintPhase, SprintStatus, DebtPriority } from '../../src/core/types.js';
import type { Sprint, Task, TaskResult, SprintMetrics, DebtItem, SprintResult, ResolvedConfig, PatternEntry } from '../../src/core/types.js';

// ─── Test Helpers ────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(tmpdir(), `sprint-reporter-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '001',
    title: 'Test Task',
    description: 'A test task',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'Test reason',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: 'DONE',
    ...overrides,
  };
}

function makeSprint(overrides: Partial<Sprint> = {}): Sprint {
  return {
    id: 'sprint-001',
    number: 1,
    status: SprintStatus.COMPLETE,
    phase: SprintPhase.RETRO,
    tasks: [makeTask()],
    workers: ['w-001'],
    startedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    completedAt: new Date('2026-01-01T01:00:00.000Z').toISOString(),
    ...overrides,
  };
}

function makeMetrics(overrides: Partial<SprintMetrics> = {}): SprintMetrics {
  return {
    totalTasks: 5,
    completedTasks: 4,
    techDebtTasks: 1,
    noGoTasks: 1,
    durationMs: 3600000,
    coveragePercent: 85.5,
    noGoRate: 20,
    newDebtCount: 1,
    resolvedDebtCount: 0,
    totalOpenDebt: 2,
    boundaryViolations: 0,
    crossAssignments: 0,
    contextLinesUsed: 0,
    ...overrides,
  };
}

function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '001',
    workerId: 'w-001',
    filesChanged: ['src/foo.ts'],
    linesAdded: 50,
    linesRemoved: 10,
    testsPassed: true,
    coverage: 90,
    selfAssessment: 'DONE',
    notes: 'Done',
    ...overrides,
  };
}

function makeResolvedConfig(projectRoot: string): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 4,
      brain_model: 'opus',
      default_model: 'sonnet',
      haiku_allowed: false,
      usage_thresholds: { '5hr': 0.8, weekly: 0.6 },
      brain_planning: 'auto',
    },
    modes: {} as ResolvedConfig['modes'],
    language: 'en',
    projectName: 'test-project',
    projectRoot,
    version: '1.0.0',
    auto_docs: { tier1: true, tier2: true, tier3: false },
  };
}

// ─── trimMemoryWithHeader ─────────────────────────────────────────────

describe('trimMemoryWithHeader', () => {
  it('returns all lines joined when under maxLines', () => {
    const lines = ['line1', 'line2', 'line3'];
    expect(trimMemoryWithHeader(lines, 10)).toBe('line1\nline2\nline3');
  });

  it('returns all lines joined when exactly at maxLines', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line-${i}`);
    expect(trimMemoryWithHeader(lines, 20)).toBe(lines.join('\n'));
  });

  it('preserves first 10 header lines and trims middle when over max', () => {
    // 30 lines, max 20 → keep first 10 (header) + last 10 (tail)
    const lines = Array.from({ length: 30 }, (_, i) => `line-${i}`);
    const result = trimMemoryWithHeader(lines, 20);
    const resultLines = result.split('\n');
    expect(resultLines).toHaveLength(20);
    for (let i = 0; i < 10; i++) expect(resultLines[i]).toBe(`line-${i}`);
    for (let i = 0; i < 10; i++) expect(resultLines[10 + i]).toBe(`line-${20 + i}`);
    expect(result).not.toContain('line-10');
    expect(result).not.toContain('line-19');
  });

  it('handles empty array', () => {
    expect(trimMemoryWithHeader([], 10)).toBe('');
  });

  it('handles maxLines of 0', () => {
    // headerEnd = min(10, 0) = 0, keepFromEnd = 0 → empty
    expect(trimMemoryWithHeader(['a', 'b', 'c'], 0)).toBe('');
  });

  it('handles maxLines smaller than header size (5 < 10)', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line-${i}`);
    const result = trimMemoryWithHeader(lines, 5);
    const resultLines = result.split('\n');
    expect(resultLines).toHaveLength(5);
    for (let i = 0; i < 5; i++) expect(resultLines[i]).toBe(`line-${i}`);
  });

  it('preserves header with real MEMORY.md format', () => {
    const lines = [
      '# Memory Index', '',
      '- [feedback.md](feedback.md) — notes',
      '- [lang.md](lang.md) — language',
      '', '# currentDate', 'Today is 2026-01-01.',
      '', '## Sprint 20 Learnings', '- Learning A',
      '- Old B', '- Old C', '- Old D', '- Old E', '- Old F',
      '## Sprint 21 Learnings',
      '- Recent G', '- Recent H', '- Recent I', '- Recent J',
    ];
    const result = trimMemoryWithHeader(lines, 15);
    const resultLines = result.split('\n');
    expect(resultLines).toHaveLength(15);
    expect(resultLines[0]).toBe('# Memory Index');
    expect(resultLines[9]).toBe('- Learning A');
    expect(resultLines[14]).toBe('- Recent J');
    expect(result).not.toContain('Old B');
  });

  it('handles single-line array under maxLines', () => {
    expect(trimMemoryWithHeader(['only'], 5)).toBe('only');
  });

  it('maxLines equal to header size keeps only first 10 lines', () => {
    const lines = Array.from({ length: 25 }, (_, i) => `line-${i}`);
    const result = trimMemoryWithHeader(lines, 10);
    const resultLines = result.split('\n');
    expect(resultLines).toHaveLength(10);
    for (let i = 0; i < 10; i++) expect(resultLines[i]).toBe(`line-${i}`);
  });

  it('large excess: trims correctly, keeps header + tail only', () => {
    // 100 lines, max 15 → first 10 + last 5
    const lines = Array.from({ length: 100 }, (_, i) => `l-${i}`);
    const result = trimMemoryWithHeader(lines, 15);
    const resultLines = result.split('\n');
    expect(resultLines).toHaveLength(15);
    expect(resultLines[0]).toBe('l-0');
    expect(resultLines[14]).toBe('l-99');
  });
});

// ─── writeRetrospective ──────────────────────────────────────────────

describe('writeRetrospective', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates .brain/ directory if missing', () => {
    const sprint = makeSprint();
    const evals = new Map([[sprint.tasks[0].id, TaskEvaluation.DONE]]);
    const metrics = makeMetrics();
    writeRetrospective(tmpDir, sprint, evals, metrics);
    expect(existsSync(join(tmpDir, '.brain'))).toBe(true);
  });

  it('writes RETRO.md with sprint header', () => {
    const sprint = makeSprint({ id: 'sprint-007' });
    const evals = new Map([[sprint.tasks[0].id, TaskEvaluation.DONE]]);
    const metrics = makeMetrics();
    writeRetrospective(tmpDir, sprint, evals, metrics);
    const content = readFileSync(join(tmpDir, '.brain', 'RETRO.md'), 'utf-8');
    expect(content).toContain('# Sprint sprint-007 Retrospective');
  });

  it('RETRO.md includes metrics section', () => {
    const sprint = makeSprint();
    const evals = new Map([[sprint.tasks[0].id, TaskEvaluation.DONE]]);
    const metrics = makeMetrics({ totalTasks: 10, completedTasks: 8, noGoRate: 10.5, noGoTasks: 1 });
    writeRetrospective(tmpDir, sprint, evals, metrics);
    const content = readFileSync(join(tmpDir, '.brain', 'RETRO.md'), 'utf-8');
    expect(content).toContain('## Metrics');
    expect(content).toContain('Tasks completed | 8/10');
    expect(content).toContain('NO_GO rate | 11%');
  });

  it('RETRO.md includes learnings for tech debt tasks', () => {
    const task = makeTask({ id: '001', title: 'My Task' });
    const sprint = makeSprint({ tasks: [task] });
    const evals = new Map([['001', TaskEvaluation.GO_WITH_TECH_DEBT]]);
    const metrics = makeMetrics();
    writeRetrospective(tmpDir, sprint, evals, metrics);
    const content = readFileSync(join(tmpDir, '.brain', 'RETRO.md'), 'utf-8');
    expect(content).toContain('## Learnings');
    expect(content).toContain('My Task: completed with tech debt');
  });

  it('RETRO.md is overwritten on second call', () => {
    const sprint = makeSprint({ id: 'sprint-001' });
    const evals = new Map([[sprint.tasks[0].id, TaskEvaluation.DONE]]);
    const metrics = makeMetrics();
    writeRetrospective(tmpDir, sprint, evals, metrics);
    const sprint2 = makeSprint({ id: 'sprint-002' });
    const evals2 = new Map([[sprint2.tasks[0].id, TaskEvaluation.DONE]]);
    writeRetrospective(tmpDir, sprint2, evals2, metrics);
    const content = readFileSync(join(tmpDir, '.brain', 'RETRO.md'), 'utf-8');
    expect(content).toContain('sprint-002');
    expect(content).not.toContain('sprint-001');
  });

  it('appends learnings to MEMORY.md', () => {
    const task = makeTask({ id: '001', title: 'Debt Task' });
    const sprint = makeSprint({ id: 'sprint-005', tasks: [task] });
    const evals = new Map([['001', TaskEvaluation.GO_WITH_TECH_DEBT]]);
    const metrics = makeMetrics();
    writeRetrospective(tmpDir, sprint, evals, metrics);
    const content = readFileSync(join(tmpDir, '.brain', 'MEMORY.md'), 'utf-8');
    expect(content).toContain('## Sprint sprint-005 Learnings');
    expect(content).toContain('Debt Task: GO_WITH_TECH_DEBT');
  });

  it('only NO_GO and GO_WITH_TECH_DEBT tasks appear in MEMORY.md learnings', () => {
    const t1 = makeTask({ id: '001', title: 'Done Task' });
    const t2 = makeTask({ id: '002', title: 'NoGo Task' });
    const sprint = makeSprint({ tasks: [t1, t2] });
    const evals = new Map<string, TaskEvaluation>([
      ['001', TaskEvaluation.DONE],
      ['002', TaskEvaluation.NO_GO],
    ]);
    writeRetrospective(tmpDir, sprint, evals, makeMetrics());
    const content = readFileSync(join(tmpDir, '.brain', 'MEMORY.md'), 'utf-8');
    expect(content).not.toContain('Done Task');
    expect(content).toContain('NoGo Task: NO_GO');
  });

  it('appends to existing MEMORY.md content', () => {
    const memPath = join(tmpDir, '.brain', 'MEMORY.md');
    mkdirSync(join(tmpDir, '.brain'), { recursive: true });
    writeFileSync(memPath, '# Existing Memory\n- Previous content', 'utf-8');
    const sprint = makeSprint({ id: 'sprint-010' });
    const evals = new Map([[sprint.tasks[0].id, TaskEvaluation.DONE]]);
    writeRetrospective(tmpDir, sprint, evals, makeMetrics());
    const content = readFileSync(memPath, 'utf-8');
    expect(content).toContain('# Existing Memory');
    expect(content).toContain('Previous content');
    expect(content).toContain('## Sprint sprint-010 Learnings');
  });

  it('trims MEMORY.md when it exceeds MEMORY_MAX_LINES', () => {
    const memPath = join(tmpDir, '.brain', 'MEMORY.md');
    mkdirSync(join(tmpDir, '.brain'), { recursive: true });
    // Fill with 200 lines (MEMORY_MAX_LINES)
    const bigContent = Array.from({ length: 200 }, (_, i) => `line-${i}`).join('\n');
    writeFileSync(memPath, bigContent, 'utf-8');
    const sprint = makeSprint();
    const evals = new Map([[sprint.tasks[0].id, TaskEvaluation.NO_GO]]);
    writeRetrospective(tmpDir, sprint, evals, makeMetrics());
    const content = readFileSync(memPath, 'utf-8');
    const lineCount = content.split('\n').length;
    expect(lineCount).toBeLessThanOrEqual(200);
  });

  it('handles sprint with no tasks', () => {
    const sprint = makeSprint({ tasks: [] });
    const evals = new Map<string, TaskEvaluation>();
    expect(() => writeRetrospective(tmpDir, sprint, evals, makeMetrics())).not.toThrow();
    const content = readFileSync(join(tmpDir, '.brain', 'RETRO.md'), 'utf-8');
    expect(content).toContain('# Sprint sprint-001 Retrospective');
  });

  it('writes RETRO.md even for tasks missing from evaluations map', () => {
    const task = makeTask({ id: '999', title: 'Unknown Task' });
    const sprint = makeSprint({ tasks: [task] });
    const evals = new Map<string, TaskEvaluation>(); // empty
    writeRetrospective(tmpDir, sprint, evals, makeMetrics());
    const content = readFileSync(join(tmpDir, '.brain', 'RETRO.md'), 'utf-8');
    expect(content).toContain('## Summary');
    expect(content).toContain('## Metrics');
  });
});

// ─── writeSprintLog ──────────────────────────────────────────────────

describe('writeSprintLog', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates .brain/sprints/ directory if missing', () => {
    writeSprintLog(tmpDir, makeSprint(), makeMetrics());
    expect(existsSync(join(tmpDir, '.brain', 'sprints'))).toBe(true);
  });

  it('writes sprint log file named <sprint-id>.md', () => {
    const sprint = makeSprint({ id: 'sprint-042' });
    writeSprintLog(tmpDir, sprint, makeMetrics());
    expect(existsSync(join(tmpDir, '.brain', 'sprints', 'sprint-042.md'))).toBe(true);
  });

  it('sprint log contains sprint ID header', () => {
    const sprint = makeSprint({ id: 'sprint-007' });
    writeSprintLog(tmpDir, sprint, makeMetrics());
    const content = readFileSync(join(tmpDir, '.brain', 'sprints', 'sprint-007.md'), 'utf-8');
    expect(content).toContain('# sprint-007');
  });

  it('sprint log includes metrics table', () => {
    const metrics = makeMetrics({ totalTasks: 7, completedTasks: 5, techDebtTasks: 1, noGoTasks: 1, coveragePercent: 92.3, durationMs: 7200000 });
    writeSprintLog(tmpDir, makeSprint(), metrics);
    const content = readFileSync(join(tmpDir, '.brain', 'sprints', 'sprint-001.md'), 'utf-8');
    expect(content).toContain('## Metrics');
    expect(content).toContain('| Total Tasks | 7 |');
    expect(content).toContain('| Completed | 5 |');
    expect(content).toContain('| Coverage | 92.3% |');
    expect(content).toContain('| Duration | 7200000ms |');
  });

  it('sprint log includes tasks section with task statuses', () => {
    const tasks = [
      makeTask({ id: '001', title: 'Task One', status: 'DONE' }),
      makeTask({ id: '002', title: 'Task Two', status: 'NO_GO' }),
    ];
    const sprint = makeSprint({ tasks });
    const evals = new Map<string, TaskEvaluation>([
      ['001', TaskEvaluation.DONE],
      ['002', TaskEvaluation.NO_GO],
    ]);
    writeSprintLog(tmpDir, sprint, makeMetrics(), evals);
    const content = readFileSync(join(tmpDir, '.brain', 'sprints', 'sprint-001.md'), 'utf-8');
    expect(content).toContain('## Tasks');
    expect(content).toContain('- 001: Task One (DONE)');
    expect(content).toContain('- 002: Task Two (NO_GO)');
  });

  it('uses task.status when evaluations map not provided', () => {
    const task = makeTask({ id: '001', title: 'Solo Task', status: 'DONE' });
    const sprint = makeSprint({ tasks: [task] });
    writeSprintLog(tmpDir, sprint, makeMetrics()); // no evals
    const content = readFileSync(join(tmpDir, '.brain', 'sprints', 'sprint-001.md'), 'utf-8');
    expect(content).toContain('- 001: Solo Task (DONE)');
  });

  it('truncates output to SPRINT_LOG_MAX_LINES (80 lines)', () => {
    // Create a sprint with many tasks so output would exceed 80 lines
    const tasks = Array.from({ length: 100 }, (_, i) => makeTask({ id: `${i + 1}`.padStart(3, '0'), title: `Task ${i + 1}` }));
    const sprint = makeSprint({ tasks });
    writeSprintLog(tmpDir, sprint, makeMetrics());
    const content = readFileSync(join(tmpDir, '.brain', 'sprints', 'sprint-001.md'), 'utf-8');
    const lineCount = content.split('\n').length;
    expect(lineCount).toBeLessThanOrEqual(80);
  });

  it('handles sprint with no tasks gracefully', () => {
    const sprint = makeSprint({ tasks: [] });
    expect(() => writeSprintLog(tmpDir, sprint, makeMetrics())).not.toThrow();
    const content = readFileSync(join(tmpDir, '.brain', 'sprints', 'sprint-001.md'), 'utf-8');
    expect(content).toContain('## Tasks');
  });

  it('overwrites previous sprint log file on second write', () => {
    const sprint = makeSprint({ id: 'sprint-001' });
    writeSprintLog(tmpDir, sprint, makeMetrics({ totalTasks: 3 }));
    writeSprintLog(tmpDir, sprint, makeMetrics({ totalTasks: 5 }));
    const content = readFileSync(join(tmpDir, '.brain', 'sprints', 'sprint-001.md'), 'utf-8');
    expect(content).toContain('| Total Tasks | 5 |');
    expect(content).not.toContain('| Total Tasks | 3 |');
  });
});

// ─── calculateMetrics ────────────────────────────────────────────────

describe('calculateMetrics', () => {
  it('counts DONE evaluations correctly', () => {
    const sprint = makeSprint({ tasks: [makeTask({ id: '1' }), makeTask({ id: '2' }), makeTask({ id: '3' })] });
    const evals = new Map<string, TaskEvaluation>([
      ['1', TaskEvaluation.DONE],
      ['2', TaskEvaluation.DONE],
      ['3', TaskEvaluation.NO_GO],
    ]);
    const metrics = calculateMetrics(sprint, evals, []);
    expect(metrics.completedTasks).toBe(2);
    expect(metrics.noGoTasks).toBe(1);
    expect(metrics.techDebtTasks).toBe(0);
  });

  it('counts GO_WITH_TECH_DEBT as both completed and techDebt', () => {
    const sprint = makeSprint({ tasks: [makeTask({ id: '1' }), makeTask({ id: '2' })] });
    const evals = new Map<string, TaskEvaluation>([
      ['1', TaskEvaluation.GO_WITH_TECH_DEBT],
      ['2', TaskEvaluation.DONE],
    ]);
    const metrics = calculateMetrics(sprint, evals, []);
    expect(metrics.completedTasks).toBe(2); // both DONE and GO_WITH_TECH_DEBT count as completed
    expect(metrics.techDebtTasks).toBe(1);
    expect(metrics.noGoTasks).toBe(0);
  });

  it('calculates totalTasks from evaluations map size', () => {
    const sprint = makeSprint({ tasks: [makeTask({ id: '1' }), makeTask({ id: '2' }), makeTask({ id: '3' })] });
    const evals = new Map<string, TaskEvaluation>([
      ['1', TaskEvaluation.DONE],
      ['2', TaskEvaluation.DONE],
      ['3', TaskEvaluation.DONE],
    ]);
    const metrics = calculateMetrics(sprint, evals, []);
    expect(metrics.totalTasks).toBe(3);
  });

  it('calculates average coverage from results', () => {
    const sprint = makeSprint();
    const evals = new Map<string, TaskEvaluation>();
    const results = [
      makeResult({ coverage: 80 }),
      makeResult({ coverage: 90 }),
      makeResult({ coverage: 100 }),
    ];
    const metrics = calculateMetrics(sprint, evals, results);
    expect(metrics.coveragePercent).toBeCloseTo(90, 5);
  });

  it('returns 0 coverage when no results', () => {
    const sprint = makeSprint();
    const evals = new Map<string, TaskEvaluation>();
    const metrics = calculateMetrics(sprint, evals, []);
    expect(metrics.coveragePercent).toBe(0);
  });

  it('calculates noGoRate as percentage', () => {
    const sprint = makeSprint({ tasks: [makeTask({ id: '1' }), makeTask({ id: '2' }), makeTask({ id: '3' }), makeTask({ id: '4' })] });
    const evals = new Map<string, TaskEvaluation>([
      ['1', TaskEvaluation.NO_GO],
      ['2', TaskEvaluation.DONE],
      ['3', TaskEvaluation.DONE],
      ['4', TaskEvaluation.DONE],
    ]);
    const metrics = calculateMetrics(sprint, evals, []);
    expect(metrics.noGoRate).toBeCloseTo(25, 5); // 1/4 = 25%
  });

  it('returns 0 noGoRate when no evaluations', () => {
    const sprint = makeSprint();
    const metrics = calculateMetrics(sprint, new Map(), []);
    expect(metrics.noGoRate).toBe(0);
  });

  it('calculates durationMs from sprint startedAt and completedAt', () => {
    const sprint = makeSprint({
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T02:00:00.000Z',
    });
    const metrics = calculateMetrics(sprint, new Map(), []);
    expect(metrics.durationMs).toBe(2 * 60 * 60 * 1000); // 2 hours
  });

  it('uses Date.now() when startedAt/completedAt are missing', () => {
    const sprint = makeSprint({ startedAt: undefined, completedAt: undefined });
    const metrics = calculateMetrics(sprint, new Map(), []);
    expect(metrics.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('counts resolvedDebtCount from matching sprint debt items', () => {
    const debt: DebtItem[] = [
      { id: 'd1', description: 'D1', originTaskId: '001', originSprintId: 'sprint-000', priority: DebtPriority.NORMAL, sprintsOpen: 2, resolved: true, resolvedInSprintId: 'sprint-001', createdAt: '' },
      { id: 'd2', description: 'D2', originTaskId: '002', originSprintId: 'sprint-000', priority: DebtPriority.NORMAL, sprintsOpen: 1, resolved: false, createdAt: '' },
    ];
    const sprint = makeSprint({ id: 'sprint-001' });
    const metrics = calculateMetrics(sprint, new Map(), [], debt);
    expect(metrics.resolvedDebtCount).toBe(1);
    expect(metrics.totalOpenDebt).toBe(1);
  });

  it('returns 0 resolvedDebtCount when no debt provided', () => {
    const sprint = makeSprint();
    const metrics = calculateMetrics(sprint, new Map(), []);
    expect(metrics.resolvedDebtCount).toBe(0);
    expect(metrics.totalOpenDebt).toBe(0);
  });

  it('newDebtCount equals techDebtTasks', () => {
    const sprint = makeSprint({ tasks: [makeTask({ id: '1' }), makeTask({ id: '2' })] });
    const evals = new Map<string, TaskEvaluation>([
      ['1', TaskEvaluation.GO_WITH_TECH_DEBT],
      ['2', TaskEvaluation.GO_WITH_TECH_DEBT],
    ]);
    const metrics = calculateMetrics(sprint, evals, []);
    expect(metrics.newDebtCount).toBe(2);
    expect(metrics.techDebtTasks).toBe(2);
  });

  it('boundaryViolations, crossAssignments, contextLinesUsed default to 0', () => {
    const metrics = calculateMetrics(makeSprint(), new Map(), []);
    expect(metrics.boundaryViolations).toBe(0);
    expect(metrics.crossAssignments).toBe(0);
    expect(metrics.contextLinesUsed).toBe(0);
  });

  it('handles all tasks as NO_GO', () => {
    const tasks = [makeTask({ id: '1' }), makeTask({ id: '2' })];
    const sprint = makeSprint({ tasks });
    const evals = new Map<string, TaskEvaluation>([
      ['1', TaskEvaluation.NO_GO],
      ['2', TaskEvaluation.NO_GO],
    ]);
    const metrics = calculateMetrics(sprint, evals, []);
    expect(metrics.noGoTasks).toBe(2);
    expect(metrics.completedTasks).toBe(0);
    expect(metrics.noGoRate).toBe(100);
  });

  it('handles single result coverage', () => {
    const metrics = calculateMetrics(makeSprint(), new Map(), [makeResult({ coverage: 75 })]);
    expect(metrics.coveragePercent).toBe(75);
  });
});

// ─── updateProjectDocs ───────────────────────────────────────────────

describe('updateProjectDocs', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeSprintResult(): SprintResult {
    const sprint = makeSprint();
    const evals = new Map<string, TaskEvaluation>([[sprint.tasks[0].id, TaskEvaluation.DONE]]);
    const metrics = makeMetrics();
    return { sprint, evaluations: evals, metrics };
  }

  it('returns an array of DocUpdateResult objects', () => {
    const sprintResult = makeSprintResult();
    const results = updateProjectDocs(tmpDir, sprintResult);
    expect(Array.isArray(results)).toBe(true);
  });

  it('works without providing a config (uses default)', () => {
    const sprintResult = makeSprintResult();
    expect(() => updateProjectDocs(tmpDir, sprintResult)).not.toThrow();
  });

  it('works with an explicit config', () => {
    const config = makeResolvedConfig(tmpDir);
    const sprintResult = makeSprintResult();
    expect(() => updateProjectDocs(tmpDir, sprintResult, config)).not.toThrow();
  });

  it('detects isInternalProject when DECKENT-MASTER-BLUEPRINT.md exists', () => {
    writeFileSync(join(tmpDir, 'DECKENT-MASTER-BLUEPRINT.md'), '# Blueprint', 'utf-8');
    const sprintResult = makeSprintResult();
    // When isInternalProject=true, internal updaters may also run
    const results = updateProjectDocs(tmpDir, sprintResult);
    expect(Array.isArray(results)).toBe(true);
  });

  it('does not throw when projectRoot has no special files', () => {
    const sprintResult = makeSprintResult();
    expect(() => updateProjectDocs(tmpDir, sprintResult)).not.toThrow();
  });

  it('each result has file and updated fields', () => {
    const sprintResult = makeSprintResult();
    const results = updateProjectDocs(tmpDir, sprintResult);
    for (const r of results) {
      expect(r).toHaveProperty('file');
      expect(r).toHaveProperty('updated');
    }
  });
});

// ─── Edge Cases ──────────────────────────────────────────────────────

describe('Edge Cases', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writeRetrospective handles malformed startedAt/completedAt gracefully in metrics display', () => {
    const sprint = makeSprint({ startedAt: 'invalid', completedAt: 'invalid' });
    const evals = new Map([[sprint.tasks[0].id, TaskEvaluation.DONE]]);
    expect(() => writeRetrospective(tmpDir, sprint, evals, makeMetrics())).not.toThrow();
  });

  it('calculateMetrics with empty evals and results returns zeroed metrics', () => {
    const sprint = makeSprint({ tasks: [] });
    const metrics = calculateMetrics(sprint, new Map(), []);
    expect(metrics.totalTasks).toBe(0);
    expect(metrics.completedTasks).toBe(0);
    expect(metrics.noGoTasks).toBe(0);
    expect(metrics.coveragePercent).toBe(0);
    expect(metrics.noGoRate).toBe(0);
  });

  it('writeRetrospective and writeSprintLog can be called together without conflicts', () => {
    const sprint = makeSprint({ id: 'sprint-099' });
    const evals = new Map([[sprint.tasks[0].id, TaskEvaluation.DONE]]);
    const metrics = makeMetrics();
    expect(() => {
      writeRetrospective(tmpDir, sprint, evals, metrics);
      writeSprintLog(tmpDir, sprint, metrics, evals);
    }).not.toThrow();
    expect(existsSync(join(tmpDir, '.brain', 'RETRO.md'))).toBe(true);
    expect(existsSync(join(tmpDir, '.brain', 'sprints', 'sprint-099.md'))).toBe(true);
  });

  it('trimMemoryWithHeader with exactly MEMORY_HEADER_LINES (10) lines and maxLines > 10', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line-${i}`);
    // Under maxLines, returns all
    const result = trimMemoryWithHeader(lines, 15);
    expect(result.split('\n')).toHaveLength(10);
  });

  it('calculateMetrics coverage average with many results', () => {
    const results = Array.from({ length: 10 }, (_, i) => makeResult({ coverage: (i + 1) * 10 }));
    const metrics = calculateMetrics(makeSprint(), new Map(), results);
    // Average of 10, 20, ..., 100 = 55
    expect(metrics.coveragePercent).toBeCloseTo(55, 5);
  });
});

// ─── compareWithPreviousSprint ────────────────────────────────────────

describe('compareWithPreviousSprint', () => {
  it('calculates positive durationChangePct when current is slower', () => {
    const current = makeMetrics({ durationMs: 7200000 });   // 2h
    const previous = makeMetrics({ durationMs: 3600000 });  // 1h
    const cmp = compareWithPreviousSprint(current, previous);
    expect(cmp.durationChangePct).toBeCloseTo(100, 5);
  });

  it('calculates negative durationChangePct when current is faster', () => {
    const current = makeMetrics({ durationMs: 1800000 });   // 30m
    const previous = makeMetrics({ durationMs: 3600000 });  // 1h
    const cmp = compareWithPreviousSprint(current, previous);
    expect(cmp.durationChangePct).toBeCloseTo(-50, 5);
  });

  it('returns 0 durationChangePct when previous duration is 0', () => {
    const current = makeMetrics({ durationMs: 3600000 });
    const previous = makeMetrics({ durationMs: 0 });
    const cmp = compareWithPreviousSprint(current, previous);
    expect(cmp.durationChangePct).toBe(0);
  });

  it('calculates noGoRateChange as signed difference', () => {
    const current = makeMetrics({ noGoRate: 30 });
    const previous = makeMetrics({ noGoRate: 20 });
    const cmp = compareWithPreviousSprint(current, previous);
    expect(cmp.noGoRateChange).toBeCloseTo(10, 5);
  });

  it('calculates negative noGoRateChange when improved', () => {
    const current = makeMetrics({ noGoRate: 5 });
    const previous = makeMetrics({ noGoRate: 25 });
    const cmp = compareWithPreviousSprint(current, previous);
    expect(cmp.noGoRateChange).toBeCloseTo(-20, 5);
  });

  it('calculates testCountDelta as difference in totalTasks', () => {
    const current = makeMetrics({ totalTasks: 10 });
    const previous = makeMetrics({ totalTasks: 7 });
    const cmp = compareWithPreviousSprint(current, previous);
    expect(cmp.testCountDelta).toBe(3);
  });

  it('calculates coverageDelta as signed percentage difference', () => {
    const current = makeMetrics({ coveragePercent: 90 });
    const previous = makeMetrics({ coveragePercent: 75 });
    const cmp = compareWithPreviousSprint(current, previous);
    expect(cmp.coverageDelta).toBeCloseTo(15, 5);
  });

  it('calculates completedTasksDelta', () => {
    const current = makeMetrics({ completedTasks: 8 });
    const previous = makeMetrics({ completedTasks: 5 });
    const cmp = compareWithPreviousSprint(current, previous);
    expect(cmp.completedTasksDelta).toBe(3);
  });

  it('calculates techDebtTasksDelta', () => {
    const current = makeMetrics({ techDebtTasks: 3 });
    const previous = makeMetrics({ techDebtTasks: 1 });
    const cmp = compareWithPreviousSprint(current, previous);
    expect(cmp.techDebtTasksDelta).toBe(2);
  });

  it('returns all zeros when metrics are identical', () => {
    const m = makeMetrics();
    const cmp = compareWithPreviousSprint(m, m);
    expect(cmp.noGoRateChange).toBe(0);
    expect(cmp.testCountDelta).toBe(0);
    expect(cmp.coverageDelta).toBe(0);
    expect(cmp.completedTasksDelta).toBe(0);
    expect(cmp.techDebtTasksDelta).toBe(0);
  });

  it('returns 0 durationChangePct when both durations are equal and nonzero', () => {
    const current = makeMetrics({ durationMs: 3600000 });
    const previous = makeMetrics({ durationMs: 3600000 });
    const cmp = compareWithPreviousSprint(current, previous);
    expect(cmp.durationChangePct).toBe(0);
  });

  it('handles negative completedTasksDelta when fewer tasks completed', () => {
    const current = makeMetrics({ completedTasks: 3 });
    const previous = makeMetrics({ completedTasks: 8 });
    const cmp = compareWithPreviousSprint(current, previous);
    expect(cmp.completedTasksDelta).toBe(-5);
  });

  it('handles negative techDebtTasksDelta when less debt', () => {
    const current = makeMetrics({ techDebtTasks: 0 });
    const previous = makeMetrics({ techDebtTasks: 4 });
    const cmp = compareWithPreviousSprint(current, previous);
    expect(cmp.techDebtTasksDelta).toBe(-4);
  });

  it('handles negative testCountDelta when fewer total tasks', () => {
    const current = makeMetrics({ totalTasks: 3 });
    const previous = makeMetrics({ totalTasks: 10 });
    const cmp = compareWithPreviousSprint(current, previous);
    expect(cmp.testCountDelta).toBe(-7);
  });

  it('handles large positive durationChangePct (10x slower)', () => {
    const current = makeMetrics({ durationMs: 36000000 });
    const previous = makeMetrics({ durationMs: 3600000 });
    const cmp = compareWithPreviousSprint(current, previous);
    expect(cmp.durationChangePct).toBeCloseTo(900, 5);
  });

  it('returns structured object with all required comparison fields', () => {
    const cmp = compareWithPreviousSprint(makeMetrics(), makeMetrics());
    expect(cmp).toHaveProperty('durationChangePct');
    expect(cmp).toHaveProperty('noGoRateChange');
    expect(cmp).toHaveProperty('testCountDelta');
    expect(cmp).toHaveProperty('coverageDelta');
    expect(cmp).toHaveProperty('completedTasksDelta');
    expect(cmp).toHaveProperty('techDebtTasksDelta');
  });
});

// ─── readPreviousSprintMetrics ────────────────────────────────────────

describe('readPreviousSprintMetrics', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null when sprints directory does not exist', () => {
    const result = readPreviousSprintMetrics(tmpDir, 'sprint-002');
    expect(result).toBeNull();
  });

  it('returns null when no sprint files exist', () => {
    mkdirSync(join(tmpDir, '.brain', 'sprints'), { recursive: true });
    const result = readPreviousSprintMetrics(tmpDir, 'sprint-002');
    expect(result).toBeNull();
  });

  it('returns null when only current sprint file exists', () => {
    const sprintsDir = join(tmpDir, '.brain', 'sprints');
    mkdirSync(sprintsDir, { recursive: true });
    writeFileSync(join(sprintsDir, 'sprint-002.md'), '# sprint-002', 'utf-8');
    const result = readPreviousSprintMetrics(tmpDir, 'sprint-002');
    expect(result).toBeNull();
  });

  it('reads metrics from previous sprint log', () => {
    const sprintsDir = join(tmpDir, '.brain', 'sprints');
    mkdirSync(sprintsDir, { recursive: true });

    // Write a valid sprint log for sprint-001
    const sprint001 = makeSprint({ id: 'sprint-001' });
    const metrics001 = makeMetrics({ totalTasks: 4, completedTasks: 3, techDebtTasks: 1, noGoTasks: 1, coveragePercent: 88.5, durationMs: 1800000 });
    writeSprintLog(tmpDir, sprint001, metrics001);

    const result = readPreviousSprintMetrics(tmpDir, 'sprint-002');
    expect(result).not.toBeNull();
    expect(result!.totalTasks).toBe(4);
    expect(result!.completedTasks).toBe(3);
    expect(result!.techDebtTasks).toBe(1);
    expect(result!.noGoTasks).toBe(1);
    expect(result!.coveragePercent).toBeCloseTo(88.5, 1);
    expect(result!.durationMs).toBe(1800000);
  });

  it('picks the most recent previous sprint by sort order', () => {
    const sprintsDir = join(tmpDir, '.brain', 'sprints');
    mkdirSync(sprintsDir, { recursive: true });

    const s001 = makeSprint({ id: 'sprint-001' });
    const s002 = makeSprint({ id: 'sprint-002' });
    writeSprintLog(tmpDir, s001, makeMetrics({ totalTasks: 2 }));
    writeSprintLog(tmpDir, s002, makeMetrics({ totalTasks: 6 }));

    const result = readPreviousSprintMetrics(tmpDir, 'sprint-003');
    expect(result).not.toBeNull();
    expect(result!.totalTasks).toBe(6);
  });

  it('returns null for malformed sprint log content', () => {
    const sprintsDir = join(tmpDir, '.brain', 'sprints');
    mkdirSync(sprintsDir, { recursive: true });
    writeFileSync(join(sprintsDir, 'sprint-001.md'), 'no metrics here', 'utf-8');
    const result = readPreviousSprintMetrics(tmpDir, 'sprint-002');
    expect(result).toBeNull();
  });

  it('returns null for sprint log with only the header row and no data', () => {
    const sprintsDir = join(tmpDir, '.brain', 'sprints');
    mkdirSync(sprintsDir, { recursive: true });
    writeFileSync(join(sprintsDir, 'sprint-001.md'), '| Metric | Value |\n|--------|-------|', 'utf-8');
    const result = readPreviousSprintMetrics(tmpDir, 'sprint-002');
    expect(result).toBeNull();
  });

  it('excludes current sprint even when it sorts last alphabetically', () => {
    const sprintsDir = join(tmpDir, '.brain', 'sprints');
    mkdirSync(sprintsDir, { recursive: true });
    writeSprintLog(tmpDir, makeSprint({ id: 'sprint-001' }), makeMetrics({ totalTasks: 3 }));
    writeSprintLog(tmpDir, makeSprint({ id: 'sprint-003' }), makeMetrics({ totalTasks: 9 }));
    // Current is sprint-003; previous should be sprint-001
    const result = readPreviousSprintMetrics(tmpDir, 'sprint-003');
    expect(result).not.toBeNull();
    expect(result!.totalTasks).toBe(3);
  });

  it('correctly derives noGoRate from parsed noGoTasks and totalTasks', () => {
    const sprintsDir = join(tmpDir, '.brain', 'sprints');
    mkdirSync(sprintsDir, { recursive: true });
    const sprint001 = makeSprint({ id: 'sprint-001' });
    // 2 no-go out of 4 total → noGoRate should be 50%
    const metrics001 = makeMetrics({ totalTasks: 4, noGoTasks: 2 });
    writeSprintLog(tmpDir, sprint001, metrics001);
    const result = readPreviousSprintMetrics(tmpDir, 'sprint-002');
    expect(result).not.toBeNull();
    expect(result!.noGoRate).toBeCloseTo(50, 5);
  });
});

// ─── writeRetrospective with comparison ──────────────────────────────

describe('writeRetrospective comparison section', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('includes improvement highlight when previous sprint exists with worse NO_GO rate', () => {
    // Write sprint-001 log first
    const sprint001 = makeSprint({ id: 'sprint-001' });
    writeSprintLog(tmpDir, sprint001, makeMetrics({ durationMs: 3600000, noGoRate: 20 }));

    // Write retrospective for sprint-002 with improved NO_GO rate
    const sprint002 = makeSprint({ id: 'sprint-002', metrics: makeMetrics({ noGoRate: 10 }) });
    const evals = new Map([[sprint002.tasks[0].id, TaskEvaluation.DONE]]);
    writeRetrospective(tmpDir, sprint002, evals, makeMetrics({ durationMs: 7200000, noGoRate: 10 }));

    const content = readFileSync(join(tmpDir, '.brain', 'RETRO.md'), 'utf-8');
    expect(content).toContain('## Highlights');
    expect(content).toContain('NO_GO rate improved');
  });

  it('omits comparison section when no previous sprint exists', () => {
    const sprint = makeSprint({ id: 'sprint-001' });
    const evals = new Map([[sprint.tasks[0].id, TaskEvaluation.DONE]]);
    writeRetrospective(tmpDir, sprint, evals, makeMetrics());

    const content = readFileSync(join(tmpDir, '.brain', 'RETRO.md'), 'utf-8');
    expect(content).not.toContain('## Comparison with Previous Sprint');
  });
});

// ─── formatHumanRetro ─────────────────────────────────────────────────

describe('formatHumanRetro', () => {
  it('summary includes task count and time', () => {
    const sprint = makeSprint({ id: 'sprint-040' });
    const evals = new Map([['001', TaskEvaluation.DONE]]);
    const metrics = makeMetrics({ totalTasks: 12, completedTasks: 11, durationMs: 2100000 });
    const result = formatHumanRetro({ sprint, evaluations: evals, metrics });
    expect(result).toContain('## Summary');
    expect(result).toContain('Completed 11/12 tasks');
    expect(result).toContain('35 minutes');
  });

  it('summary shows self-healing rate when results have feedbackLoop', () => {
    const sprint = makeSprint({ id: 'sprint-040' });
    const evals = new Map([['001', TaskEvaluation.DONE]]);
    const metrics = makeMetrics();
    const results: TaskResult[] = [
      makeResult({ taskId: '001', feedbackLoop: { tscAttempts: 2, testAttempts: 1, tscErrorsFixed: 1, testFailuresFixed: 0, totalRetryTimeMs: 5000 } }),
      makeResult({ taskId: '002', feedbackLoop: { tscAttempts: 1, testAttempts: 1, tscErrorsFixed: 0, testFailuresFixed: 0, totalRetryTimeMs: 0 } }),
    ];
    const output = formatHumanRetro({ sprint, evaluations: evals, metrics, results });
    expect(output).toContain('Self-healing rate: 100%');
  });

  it('includes Highlights section when tasks complete on first try', () => {
    const sprint = makeSprint({ id: 'sprint-040' });
    const evals = new Map([['001', TaskEvaluation.DONE]]);
    const metrics = makeMetrics();
    const results: TaskResult[] = [
      makeResult({ taskId: '001', feedbackLoop: { tscAttempts: 1, testAttempts: 1, tscErrorsFixed: 0, testFailuresFixed: 0, totalRetryTimeMs: 0 } }),
    ];
    const output = formatHumanRetro({ sprint, evaluations: evals, metrics, results });
    expect(output).toContain('## Highlights');
    expect(output).toContain('1 task completed on first try');
  });

  it('includes Issues section for NO_GO tasks', () => {
    const noGoTask = makeTask({ id: '002', title: 'Broken Task', status: 'NO_GO' as any });
    const sprint = makeSprint({ id: 'sprint-040', tasks: [makeTask(), noGoTask] });
    const evals = new Map([['001', TaskEvaluation.DONE], ['002', TaskEvaluation.NO_GO]]);
    const metrics = makeMetrics({ noGoTasks: 1, noGoRate: 50 });
    const output = formatHumanRetro({ sprint, evaluations: evals, metrics });
    expect(output).toContain('## Issues');
    expect(output).toContain('Broken Task');
    expect(output).toContain('failed');
  });

  it('includes readable Metrics table', () => {
    const sprint = makeSprint({ id: 'sprint-040' });
    const evals = new Map([['001', TaskEvaluation.DONE]]);
    const metrics = makeMetrics({ totalTasks: 12, completedTasks: 11, noGoTasks: 1, noGoRate: 8.3, coveragePercent: 85.5 });
    const output = formatHumanRetro({ sprint, evaluations: evals, metrics });
    expect(output).toContain('| What | Value |');
    expect(output).toContain('Tasks completed | 11/12');
    expect(output).toContain('NO_GO rate | 8%');
    expect(output).toContain('Coverage | 85.5%');
  });

  it('includes Learnings section for NO_GO and tech debt tasks', () => {
    const debtTask = makeTask({ id: '002', title: 'Debt Task' });
    const sprint = makeSprint({ id: 'sprint-040', tasks: [makeTask(), debtTask] });
    const evals = new Map([['001', TaskEvaluation.DONE], ['002', TaskEvaluation.GO_WITH_TECH_DEBT]]);
    const metrics = makeMetrics();
    const output = formatHumanRetro({ sprint, evaluations: evals, metrics });
    expect(output).toContain('## Learnings');
    expect(output).toContain('Debt Task: completed with tech debt');
  });

  it('includes code change stats when results provided', () => {
    const sprint = makeSprint({ id: 'sprint-040' });
    const evals = new Map([['001', TaskEvaluation.DONE]]);
    const metrics = makeMetrics();
    const results = [makeResult({ linesAdded: 1245, linesRemoved: 380 })];
    const output = formatHumanRetro({ sprint, evaluations: evals, metrics, results });
    expect(output).toContain('+1245 / -380');
  });

  it('shows sprint time in human format', () => {
    const sprint = makeSprint({ id: 'sprint-040' });
    const evals = new Map([['001', TaskEvaluation.DONE]]);
    const metrics = makeMetrics({ durationMs: 720000 }); // 12 minutes
    const output = formatHumanRetro({ sprint, evaluations: evals, metrics });
    expect(output).toContain('12 minutes');
  });

  it('omits Highlights section when nothing went well', () => {
    const sprint = makeSprint({ id: 'sprint-040', metrics: { ...makeMetrics(), boundaryViolations: 2 } });
    const evals = new Map([['001', TaskEvaluation.NO_GO]]);
    const metrics = makeMetrics({ completedTasks: 0, noGoTasks: 1 });
    const output = formatHumanRetro({ sprint, evaluations: evals, metrics, results: [] });
    expect(output).not.toContain('## Highlights');
  });

  it('omits Issues section when no issues', () => {
    const sprint = makeSprint({ id: 'sprint-040' });
    const evals = new Map([['001', TaskEvaluation.DONE]]);
    const metrics = makeMetrics({ noGoTasks: 0 });
    const output = formatHumanRetro({ sprint, evaluations: evals, metrics });
    expect(output).not.toContain('## Issues');
  });

  it('omits Learnings section when all tasks DONE', () => {
    const sprint = makeSprint({ id: 'sprint-040' });
    const evals = new Map([['001', TaskEvaluation.DONE]]);
    const metrics = makeMetrics();
    const output = formatHumanRetro({ sprint, evaluations: evals, metrics });
    expect(output).not.toContain('## Learnings');
  });

  it('title contains sprint ID', () => {
    const sprint = makeSprint({ id: 'sprint-040' });
    const evals = new Map([['001', TaskEvaluation.DONE]]);
    const metrics = makeMetrics();
    const output = formatHumanRetro({ sprint, evaluations: evals, metrics });
    expect(output).toMatch(/^# Sprint sprint-040 Retrospective/);
  });

  it('includes agent performance when agentRows provided', () => {
    const sprint = makeSprint({ id: 'sprint-040' });
    const evals = new Map([['001', TaskEvaluation.DONE]]);
    const metrics = makeMetrics();
    const agentRows = [{ agent: 'security-agent', tasks: 3, done: 2, debt: 1, noGo: 0, avgCoverage: 90 }];
    const output = formatHumanRetro({ sprint, evaluations: evals, metrics, agentRows });
    expect(output).toContain('## Agent Performance');
    expect(output).toContain('security-agent');
  });

  it('includes skill performance when skillRows provided', () => {
    const sprint = makeSprint({ id: 'sprint-040' });
    const evals = new Map([['001', TaskEvaluation.DONE]]);
    const metrics = makeMetrics();
    const skillRows = [{ skill: 'test-writer', tasks: 5, done: 4, debt: 1, noGo: 0 }];
    const output = formatHumanRetro({ sprint, evaluations: evals, metrics, skillRows });
    expect(output).toContain('## Skill Performance');
    expect(output).toContain('test-writer');
  });
});

// ─── buildRetroHighlights ────────────────────────────────────────────

describe('buildRetroHighlights', () => {
  it('reports first-try tasks', () => {
    const sprint = makeSprint();
    const evals = new Map([['001', TaskEvaluation.DONE]]);
    const results = [makeResult({ feedbackLoop: { tscAttempts: 1, testAttempts: 1, tscErrorsFixed: 0, testFailuresFixed: 0, totalRetryTimeMs: 0 } })];
    const highlights = buildRetroHighlights(sprint, evals, results);
    expect(highlights).toContainEqual(expect.stringContaining('completed on first try'));
  });

  it('reports self-healed tasks', () => {
    const sprint = makeSprint();
    const evals = new Map([['001', TaskEvaluation.DONE]]);
    const results = [makeResult({ feedbackLoop: { tscAttempts: 2, testAttempts: 1, tscErrorsFixed: 1, testFailuresFixed: 0, totalRetryTimeMs: 3000 } })];
    const highlights = buildRetroHighlights(sprint, evals, results);
    expect(highlights).toContainEqual(expect.stringContaining('self-healed'));
  });

  it('reports no boundary violations', () => {
    const sprint = makeSprint({ metrics: makeMetrics({ boundaryViolations: 0 }) });
    const evals = new Map([['001', TaskEvaluation.DONE]]);
    const highlights = buildRetroHighlights(sprint, evals);
    expect(highlights).toContainEqual(expect.stringContaining('No boundary violations'));
  });

  it('reports NO_GO rate improvement vs previous sprint', () => {
    const sprint = makeSprint({ metrics: makeMetrics({ noGoRate: 5 }) });
    const evals = new Map([['001', TaskEvaluation.DONE]]);
    const previous = makeMetrics({ noGoRate: 20 });
    const highlights = buildRetroHighlights(sprint, evals, undefined, previous);
    expect(highlights).toContainEqual(expect.stringContaining('NO_GO rate improved'));
  });
});

// ─── buildRetroIssues ─────────────────────────────────────────────────

describe('buildRetroIssues', () => {
  it('lists NO_GO tasks', () => {
    const noGoTask = makeTask({ id: '002', title: 'Broken' });
    const sprint = makeSprint({ tasks: [makeTask(), noGoTask] });
    const evals = new Map([['001', TaskEvaluation.DONE], ['002', TaskEvaluation.NO_GO]]);
    const issues = buildRetroIssues(sprint, evals);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('Broken');
    expect(issues[0]).toContain('failed');
  });

  it('includes notes from result in issue description', () => {
    const noGoTask = makeTask({ id: '002', title: 'Broken' });
    const sprint = makeSprint({ tasks: [noGoTask] });
    const evals = new Map([['002', TaskEvaluation.NO_GO]]);
    const results = [makeResult({ taskId: '002', selfAssessment: 'NO_GO', notes: 'vitest timeout on large component' })];
    const issues = buildRetroIssues(sprint, evals, results);
    expect(issues[0]).toContain('vitest timeout');
  });

  it('reports tasks with many retries', () => {
    const sprint = makeSprint();
    const evals = new Map([['001', TaskEvaluation.DONE]]);
    const results = [makeResult({ taskId: '001', feedbackLoop: { tscAttempts: 3, testAttempts: 1, tscErrorsFixed: 2, testFailuresFixed: 0, totalRetryTimeMs: 10000 } })];
    const issues = buildRetroIssues(sprint, evals, results);
    expect(issues).toContainEqual(expect.stringContaining('multiple retries'));
  });

  it('reports boundary violations', () => {
    const sprint = makeSprint({ metrics: makeMetrics({ boundaryViolations: 2 }) });
    const evals = new Map([['001', TaskEvaluation.DONE]]);
    const issues = buildRetroIssues(sprint, evals);
    expect(issues).toContainEqual(expect.stringContaining('2 boundary violations'));
  });

  it('returns empty when no issues', () => {
    const sprint = makeSprint({ metrics: makeMetrics({ boundaryViolations: 0 }) });
    const evals = new Map([['001', TaskEvaluation.DONE]]);
    expect(buildRetroIssues(sprint, evals)).toHaveLength(0);
  });
});

// ─── buildRetroLearnings ──────────────────────────────────────────────

describe('buildRetroLearnings', () => {
  it('generates learning for NO_GO task', () => {
    const sprint = makeSprint();
    const evals = new Map([['001', TaskEvaluation.NO_GO]]);
    const learnings = buildRetroLearnings(sprint, evals);
    expect(learnings).toContainEqual(expect.stringContaining('failed'));
    expect(learnings).toContainEqual(expect.stringContaining('investigate root cause'));
  });

  it('generates learning for tech debt task', () => {
    const sprint = makeSprint();
    const evals = new Map([['001', TaskEvaluation.GO_WITH_TECH_DEBT]]);
    const learnings = buildRetroLearnings(sprint, evals);
    expect(learnings).toContainEqual(expect.stringContaining('tech debt'));
    expect(learnings).toContainEqual(expect.stringContaining('schedule cleanup'));
  });

  it('adds low self-healing insight when rate < 50%', () => {
    const sprint = makeSprint();
    const evals = new Map([['001', TaskEvaluation.NO_GO]]);
    const results = [
      makeResult({ taskId: '001', selfAssessment: 'NO_GO', feedbackLoop: { tscAttempts: 3, testAttempts: 1, tscErrorsFixed: 0, testFailuresFixed: 0, totalRetryTimeMs: 10000 } }),
    ];
    const learnings = buildRetroLearnings(sprint, evals, results);
    expect(learnings).toContainEqual(expect.stringContaining('Low self-healing rate'));
  });

  it('returns empty when all tasks DONE', () => {
    const sprint = makeSprint();
    const evals = new Map([['001', TaskEvaluation.DONE]]);
    expect(buildRetroLearnings(sprint, evals)).toHaveLength(0);
  });

  it('limits learnings to 10 items max', () => {
    const tasks = Array.from({ length: 15 }, (_, i) => makeTask({ id: `${i + 1}`.padStart(3, '0'), title: `Task ${i + 1}` }));
    const sprint = makeSprint({ tasks });
    const evals = new Map(tasks.map(t => [t.id, TaskEvaluation.NO_GO] as const));
    const learnings = buildRetroLearnings(sprint, evals);
    expect(learnings.length).toBeLessThanOrEqual(11); // 10 from tasks + possible self-healing insight
  });
});

// ─── writeRetrospective human-friendly output ─────────────────────────

describe('writeRetrospective human-friendly', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = makeTempDir(); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('writes RETRO.md with human-friendly Summary section', () => {
    const sprint = makeSprint({ id: 'sprint-040' });
    const evals = new Map([['001', TaskEvaluation.DONE]]);
    writeRetrospective(tmpDir, sprint, evals, makeMetrics());
    const content = readFileSync(join(tmpDir, '.brain', 'RETRO.md'), 'utf-8');
    expect(content).toContain('## Summary');
    expect(content).toContain('Completed');
  });

  it('writes RETRO.md with Metrics table', () => {
    const sprint = makeSprint({ id: 'sprint-040' });
    const evals = new Map([['001', TaskEvaluation.DONE]]);
    writeRetrospective(tmpDir, sprint, evals, makeMetrics());
    const content = readFileSync(join(tmpDir, '.brain', 'RETRO.md'), 'utf-8');
    expect(content).toContain('## Metrics');
    expect(content).toContain('| What | Value |');
    expect(content).toContain('Tasks completed');
  });

  it('writes RETRO.md with results data when results passed', () => {
    const sprint = makeSprint({ id: 'sprint-040' });
    const evals = new Map([['001', TaskEvaluation.DONE]]);
    const results = [makeResult({ linesAdded: 200, linesRemoved: 50 })];
    writeRetrospective(tmpDir, sprint, evals, makeMetrics(), undefined, undefined, undefined, results);
    const content = readFileSync(join(tmpDir, '.brain', 'RETRO.md'), 'utf-8');
    expect(content).toContain('+200 / -50');
  });

  it('writes RETRO.md with self-healing metrics when feedbackLoop results passed', () => {
    const sprint = makeSprint({ id: 'sprint-040' });
    const evals = new Map([['001', TaskEvaluation.DONE]]);
    const results = [makeResult({
      feedbackLoop: { tscAttempts: 2, testAttempts: 1, tscErrorsFixed: 1, testFailuresFixed: 0, totalRetryTimeMs: 5000 },
    })];
    writeRetrospective(tmpDir, sprint, evals, makeMetrics(), undefined, undefined, undefined, results);
    const content = readFileSync(join(tmpDir, '.brain', 'RETRO.md'), 'utf-8');
    expect(content).toContain('Self-healing rate');
  });

  it('RETRO.md includes Highlights section with first-try tasks', () => {
    const tasks = [makeTask({ id: '001' }), makeTask({ id: '002' })];
    const sprint = makeSprint({ id: 'sprint-040', tasks });
    const evals = new Map([['001', TaskEvaluation.DONE], ['002', TaskEvaluation.DONE]]);
    const results = [
      makeResult({ taskId: '001', feedbackLoop: { tscAttempts: 1, testAttempts: 1, tscErrorsFixed: 0, testFailuresFixed: 0, totalRetryTimeMs: 0 } }),
      makeResult({ taskId: '002', feedbackLoop: { tscAttempts: 1, testAttempts: 1, tscErrorsFixed: 0, testFailuresFixed: 0, totalRetryTimeMs: 0 } }),
    ];
    writeRetrospective(tmpDir, sprint, evals, makeMetrics(), undefined, undefined, undefined, results);
    const content = readFileSync(join(tmpDir, '.brain', 'RETRO.md'), 'utf-8');
    expect(content).toContain('## Highlights');
    expect(content).toContain('completed on first try');
  });

  it('RETRO.md includes Issues section for NO_GO tasks', () => {
    const tasks = [makeTask({ id: '001', title: 'Broken Feature' })];
    const sprint = makeSprint({ id: 'sprint-040', tasks });
    const evals = new Map([['001', TaskEvaluation.NO_GO]]);
    const results = [makeResult({ taskId: '001', selfAssessment: 'NO_GO', notes: 'Timeout' })];
    writeRetrospective(tmpDir, sprint, evals, makeMetrics({ noGoTasks: 1 }), undefined, undefined, undefined, results);
    const content = readFileSync(join(tmpDir, '.brain', 'RETRO.md'), 'utf-8');
    expect(content).toContain('## Issues');
    expect(content).toContain('Broken Feature');
  });

  it('RETRO.md includes Learnings section', () => {
    const tasks = [makeTask({ id: '001', title: 'Flaky Task' })];
    const sprint = makeSprint({ id: 'sprint-040', tasks });
    const evals = new Map([['001', TaskEvaluation.NO_GO]]);
    writeRetrospective(tmpDir, sprint, evals, makeMetrics({ noGoTasks: 1 }));
    const content = readFileSync(join(tmpDir, '.brain', 'RETRO.md'), 'utf-8');
    expect(content).toContain('## Learnings');
    expect(content).toContain('Flaky Task');
    expect(content).toContain('investigate root cause');
  });

  it('RETRO.md includes coverage when > 0', () => {
    const sprint = makeSprint({ id: 'sprint-040' });
    const evals = new Map([['001', TaskEvaluation.DONE]]);
    writeRetrospective(tmpDir, sprint, evals, makeMetrics({ coveragePercent: 92.3 }));
    const content = readFileSync(join(tmpDir, '.brain', 'RETRO.md'), 'utf-8');
    expect(content).toContain('92.3%');
  });

  it('RETRO.md NO_GO rate shown as percentage', () => {
    const tasks = [makeTask({ id: '001' }), makeTask({ id: '002' })];
    const sprint = makeSprint({ id: 'sprint-040', tasks });
    const evals = new Map([['001', TaskEvaluation.DONE], ['002', TaskEvaluation.NO_GO]]);
    writeRetrospective(tmpDir, sprint, evals, makeMetrics({ noGoRate: 50, noGoTasks: 1, totalTasks: 2 }));
    const content = readFileSync(join(tmpDir, '.brain', 'RETRO.md'), 'utf-8');
    expect(content).toContain('NO_GO rate');
    expect(content).toContain('50%');
  });
});

// ─── formatDuration ──────────────────────────────────────────────────

describe('formatDuration', () => {
  it('returns empty string for undefined', () => {
    expect(formatDuration(undefined)).toBe('');
  });

  it('returns empty string for 0', () => {
    expect(formatDuration(0)).toBe('');
  });

  it('returns seconds for < 60s', () => {
    expect(formatDuration(30000)).toBe('30 seconds total');
  });

  it('returns minutes for < 60min', () => {
    expect(formatDuration(120000)).toBe('2 minutes total');
  });

  it('returns minutes with seconds when not exact', () => {
    expect(formatDuration(90000)).toBe('1 minute 30s total');
  });

  it('returns hours and minutes for >= 60min', () => {
    expect(formatDuration(5400000)).toBe('1h 30m total');
  });
});

// ─── calculateSelfHealingRate ────────────────────────────────────────

describe('calculateSelfHealingRate', () => {
  it('returns null for empty results', () => {
    expect(calculateSelfHealingRate([])).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(calculateSelfHealingRate(undefined)).toBeNull();
  });

  it('returns null when no results have feedbackLoop', () => {
    expect(calculateSelfHealingRate([makeResult()])).toBeNull();
  });

  it('returns null when no retries attempted', () => {
    const result = makeResult({
      feedbackLoop: { tscAttempts: 1, testAttempts: 1, tscErrorsFixed: 0, testFailuresFixed: 0, totalRetryTimeMs: 0 },
    });
    expect(calculateSelfHealingRate([result])).toBeNull();
  });

  it('calculates 100% when all retries succeeded', () => {
    const result = makeResult({
      selfAssessment: 'DONE',
      feedbackLoop: { tscAttempts: 2, testAttempts: 1, tscErrorsFixed: 1, testFailuresFixed: 0, totalRetryTimeMs: 5000 },
    });
    const rate = calculateSelfHealingRate([result]);
    expect(rate).toEqual({ percent: 100, healed: 1, attempted: 1 });
  });

  it('calculates 0% when all retries failed', () => {
    const result = makeResult({
      selfAssessment: 'NO_GO',
      feedbackLoop: { tscAttempts: 3, testAttempts: 1, tscErrorsFixed: 0, testFailuresFixed: 0, totalRetryTimeMs: 10000 },
    });
    const rate = calculateSelfHealingRate([result]);
    expect(rate).toEqual({ percent: 0, healed: 0, attempted: 1 });
  });

  it('calculates partial rate correctly', () => {
    const results = [
      makeResult({ taskId: '001', selfAssessment: 'DONE', feedbackLoop: { tscAttempts: 2, testAttempts: 1, tscErrorsFixed: 1, testFailuresFixed: 0, totalRetryTimeMs: 3000 } }),
      makeResult({ taskId: '002', selfAssessment: 'NO_GO', feedbackLoop: { tscAttempts: 3, testAttempts: 3, tscErrorsFixed: 0, testFailuresFixed: 0, totalRetryTimeMs: 15000 } }),
    ];
    const rate = calculateSelfHealingRate(results);
    expect(rate).toEqual({ percent: 50, healed: 1, attempted: 2 });
  });

  it('counts GO_WITH_TECH_DEBT as healed', () => {
    const result = makeResult({
      selfAssessment: 'GO_WITH_TECH_DEBT',
      feedbackLoop: { tscAttempts: 2, testAttempts: 2, tscErrorsFixed: 1, testFailuresFixed: 1, totalRetryTimeMs: 8000 },
    });
    const rate = calculateSelfHealingRate([result]);
    expect(rate).toEqual({ percent: 100, healed: 1, attempted: 1 });
  });
});

// ─── countFirstTryTasks / countSelfHealedTasks ───────────────────────

describe('countFirstTryTasks', () => {
  it('returns 0 for undefined', () => {
    expect(countFirstTryTasks(undefined)).toBe(0);
  });

  it('counts tasks with no retries as first-try', () => {
    const results = [
      makeResult({ feedbackLoop: { tscAttempts: 1, testAttempts: 1, tscErrorsFixed: 0, testFailuresFixed: 0, totalRetryTimeMs: 0 } }),
    ];
    expect(countFirstTryTasks(results)).toBe(1);
  });

  it('excludes NO_GO tasks', () => {
    const results = [
      makeResult({ selfAssessment: 'NO_GO', feedbackLoop: { tscAttempts: 1, testAttempts: 1, tscErrorsFixed: 0, testFailuresFixed: 0, totalRetryTimeMs: 0 } }),
    ];
    expect(countFirstTryTasks(results)).toBe(0);
  });

  it('excludes tasks with retries', () => {
    const results = [
      makeResult({ feedbackLoop: { tscAttempts: 2, testAttempts: 1, tscErrorsFixed: 1, testFailuresFixed: 0, totalRetryTimeMs: 3000 } }),
    ];
    expect(countFirstTryTasks(results)).toBe(0);
  });

  it('counts DONE tasks without feedbackLoop as first-try', () => {
    expect(countFirstTryTasks([makeResult()])).toBe(1);
  });
});

describe('countSelfHealedTasks', () => {
  it('returns 0 for undefined', () => {
    expect(countSelfHealedTasks(undefined)).toBe(0);
  });

  it('counts tasks that had retries but succeeded', () => {
    const results = [
      makeResult({ feedbackLoop: { tscAttempts: 2, testAttempts: 1, tscErrorsFixed: 1, testFailuresFixed: 0, totalRetryTimeMs: 3000 } }),
    ];
    expect(countSelfHealedTasks(results)).toBe(1);
  });

  it('excludes NO_GO tasks', () => {
    const results = [
      makeResult({ selfAssessment: 'NO_GO', feedbackLoop: { tscAttempts: 3, testAttempts: 3, tscErrorsFixed: 0, testFailuresFixed: 0, totalRetryTimeMs: 10000 } }),
    ];
    expect(countSelfHealedTasks(results)).toBe(0);
  });

  it('excludes tasks without feedbackLoop', () => {
    expect(countSelfHealedTasks([makeResult()])).toBe(0);
  });
});

// ─── buildWhatWentWell / buildWhatNeedsAttention ────────────────────

describe('buildWhatWentWell', () => {
  it('reports first-try tasks', () => {
    const sprint = makeSprint();
    const results = [makeResult({ feedbackLoop: { tscAttempts: 1, testAttempts: 1, tscErrorsFixed: 0, testFailuresFixed: 0, totalRetryTimeMs: 0 } })];
    const items = buildWhatWentWell(sprint, results);
    expect(items.some(i => i.includes('first try'))).toBe(true);
  });

  it('reports self-healed tasks', () => {
    const sprint = makeSprint();
    const results = [makeResult({ feedbackLoop: { tscAttempts: 2, testAttempts: 1, tscErrorsFixed: 1, testFailuresFixed: 0, totalRetryTimeMs: 3000 } })];
    const items = buildWhatWentWell(sprint, results);
    expect(items.some(i => i.includes('self-healed'))).toBe(true);
  });

  it('reports no boundary violations', () => {
    const sprint = makeSprint({ metrics: makeMetrics({ boundaryViolations: 0 }) });
    const items = buildWhatWentWell(sprint);
    expect(items.some(i => i.includes('boundary violations'))).toBe(true);
  });
});

describe('buildWhatNeedsAttention', () => {
  it('reports NO_GO tasks', () => {
    const sprint = makeSprint({ tasks: [makeTask({ id: '001', title: 'Broken', status: 'NO_GO' })] });
    const items = buildWhatNeedsAttention(sprint);
    expect(items.some(i => i.includes('NO_GO'))).toBe(true);
  });

  it('reports tasks with many retries', () => {
    const sprint = makeSprint();
    const results = [makeResult({
      feedbackLoop: { tscAttempts: 3, testAttempts: 1, tscErrorsFixed: 2, testFailuresFixed: 0, totalRetryTimeMs: 10000 },
    })];
    const items = buildWhatNeedsAttention(sprint, results);
    expect(items.some(i => i.includes('retries'))).toBe(true);
  });

  it('includes notes from NO_GO result', () => {
    const sprint = makeSprint({ tasks: [makeTask({ id: '001', title: 'Task A', status: 'NO_GO' })] });
    const results = [makeResult({ taskId: '001', selfAssessment: 'NO_GO', notes: 'vitest timeout error' })];
    const items = buildWhatNeedsAttention(sprint, results);
    expect(items.some(i => i.includes('vitest timeout'))).toBe(true);
  });
});

// ─── formatHumanSprintComplete ──────────────────────────────────────

describe('formatHumanSprintComplete', () => {
  it('includes sprint number in title', () => {
    const sprint = makeSprint({ number: 40 });
    const output = formatHumanSprintComplete({ sprint });
    expect(output).toContain('Sprint 040 Complete!');
  });

  it('shows results with succeeded count', () => {
    const sprint = makeSprint({ number: 40, metrics: makeMetrics({ completedTasks: 11, totalTasks: 12, noGoTasks: 1 }) });
    const output = formatHumanSprintComplete({ sprint });
    expect(output).toContain('11/12 tasks succeeded');
    expect(output).toContain('1 needs attention');
  });

  it('shows time duration', () => {
    const sprint = makeSprint({ metrics: makeMetrics({ durationMs: 2100000 }) });
    const output = formatHumanSprintComplete({ sprint });
    expect(output).toContain('35 minutes total');
  });

  it('shows code stats from results', () => {
    const sprint = makeSprint();
    const results = [makeResult({ linesAdded: 1245, linesRemoved: 380 })];
    const output = formatHumanSprintComplete({ sprint, results });
    expect(output).toContain('+1245 lines added');
    expect(output).toContain('-380 removed');
  });

  it('shows What went well section', () => {
    const sprint = makeSprint({ metrics: makeMetrics({ boundaryViolations: 0 }) });
    const results = [makeResult({ feedbackLoop: { tscAttempts: 1, testAttempts: 1, tscErrorsFixed: 0, testFailuresFixed: 0, totalRetryTimeMs: 0 } })];
    const output = formatHumanSprintComplete({ sprint, results });
    expect(output).toContain('What went well:');
  });

  it('shows What needs attention for NO_GO tasks', () => {
    const sprint = makeSprint({ tasks: [makeTask({ id: '001', title: 'Bad Task', status: 'NO_GO' })] });
    const output = formatHumanSprintComplete({ sprint });
    expect(output).toContain('What needs attention:');
  });

  it('shows self-healing rate', () => {
    const sprint = makeSprint();
    const results = [makeResult({
      selfAssessment: 'DONE',
      feedbackLoop: { tscAttempts: 2, testAttempts: 1, tscErrorsFixed: 1, testFailuresFixed: 0, totalRetryTimeMs: 5000 },
    })];
    const output = formatHumanSprintComplete({ sprint, results });
    expect(output).toContain('Self-healing rate: 100%');
  });

  it('shows Next steps section', () => {
    const sprint = makeSprint();
    const output = formatHumanSprintComplete({ sprint });
    expect(output).toContain('Next steps:');
    expect(output).toContain('deckent retro');
    expect(output).toContain('Ready for next sprint');
  });

  it('shows debt status link when open debt exists', () => {
    const sprint = makeSprint({ metrics: makeMetrics({ totalOpenDebt: 3 }) });
    const output = formatHumanSprintComplete({ sprint });
    expect(output).toContain('deckent status --debt');
  });
});

// ═══ Task 041-005: Enhanced RETRO — new tests, patterns, debt ═════════

describe('countNewTestFiles', () => {
  it('returns 0 for undefined', () => {
    expect(countNewTestFiles(undefined)).toBe(0);
  });

  it('returns 0 for empty results', () => {
    expect(countNewTestFiles([])).toBe(0);
  });

  it('counts .test.ts files', () => {
    const results = [makeResult({ filesChanged: ['src/foo.ts', 'tests/foo.test.ts'] })];
    expect(countNewTestFiles(results)).toBe(1);
  });

  it('counts .spec.ts files', () => {
    const results = [makeResult({ filesChanged: ['src/bar.spec.ts'] })];
    expect(countNewTestFiles(results)).toBe(1);
  });

  it('counts .test.tsx and .test.js files', () => {
    const results = [makeResult({ filesChanged: ['a.test.tsx', 'b.test.js', 'c.test.jsx'] })];
    expect(countNewTestFiles(results)).toBe(3);
  });

  it('deduplicates test files across results', () => {
    const results = [
      makeResult({ taskId: '001', filesChanged: ['tests/foo.test.ts'] }),
      makeResult({ taskId: '002', filesChanged: ['tests/foo.test.ts', 'tests/bar.test.ts'] }),
    ];
    expect(countNewTestFiles(results)).toBe(2);
  });

  it('excludes non-test files', () => {
    const results = [makeResult({ filesChanged: ['src/foo.ts', 'README.md'] })];
    expect(countNewTestFiles(results)).toBe(0);
  });
});

describe('formatHumanRetro — new test files metric', () => {
  it('includes new test files row when test files present', () => {
    const results = [makeResult({ filesChanged: ['src/foo.ts', 'tests/foo.test.ts', 'tests/bar.test.ts'] })];
    const output = formatHumanRetro({
      sprint: makeSprint(),
      evaluations: new Map([['001', TaskEvaluation.DONE]]),
      metrics: makeMetrics(),
      results,
    });
    expect(output).toContain('| New test files | 2 |');
  });

  it('omits new test files row when no test files', () => {
    const results = [makeResult({ filesChanged: ['src/foo.ts'] })];
    const output = formatHumanRetro({
      sprint: makeSprint(),
      evaluations: new Map([['001', TaskEvaluation.DONE]]),
      metrics: makeMetrics(),
      results,
    });
    expect(output).not.toContain('New test files');
  });
});

describe('buildRetroLearnings — patterns and debt', () => {
  it('includes recurring pattern when occurrences >= 2', () => {
    const patterns: PatternEntry[] = [{
      pattern: 'Worker timeout in tmux',
      occurrences: 3,
      firstDetectedInSprint: 'sprint-038',
      lastDetectedInSprint: 'sprint-040',
      resolved: false,
    }];
    const items = buildRetroLearnings(
      makeSprint({ tasks: [] }),
      new Map(),
      undefined,
      patterns,
    );
    expect(items).toContainEqual(expect.stringContaining('Recurring pattern (3x)'));
    expect(items).toContainEqual(expect.stringContaining('Worker timeout in tmux'));
  });

  it('excludes resolved patterns', () => {
    const patterns: PatternEntry[] = [{
      pattern: 'Old issue',
      occurrences: 5,
      firstDetectedInSprint: 'sprint-030',
      lastDetectedInSprint: 'sprint-035',
      resolved: true,
    }];
    const items = buildRetroLearnings(
      makeSprint({ tasks: [] }),
      new Map(),
      undefined,
      patterns,
    );
    expect(items).not.toContainEqual(expect.stringContaining('Old issue'));
  });

  it('excludes patterns with only 1 occurrence', () => {
    const patterns: PatternEntry[] = [{
      pattern: 'One-off issue',
      occurrences: 1,
      firstDetectedInSprint: 'sprint-040',
      lastDetectedInSprint: 'sprint-040',
      resolved: false,
    }];
    const items = buildRetroLearnings(
      makeSprint({ tasks: [] }),
      new Map(),
      undefined,
      patterns,
    );
    expect(items).not.toContainEqual(expect.stringContaining('One-off issue'));
  });

  it('includes open HIGH priority debt', () => {
    const debt: DebtItem[] = [{
      id: 'debt-001',
      description: 'Missing error handling in planner',
      originTaskId: '039-002',
      originSprintId: 'sprint-039',
      priority: 'HIGH' as any,
      sprintsOpen: 2,
      resolved: false,
      createdAt: '2026-03-20T00:00:00Z',
    }];
    const items = buildRetroLearnings(
      makeSprint({ tasks: [] }),
      new Map(),
      undefined,
      undefined,
      debt,
    );
    expect(items).toContainEqual(expect.stringContaining('Open HIGH debt'));
    expect(items).toContainEqual(expect.stringContaining('Missing error handling in planner'));
  });

  it('includes open CRITICAL priority debt', () => {
    const debt: DebtItem[] = [{
      id: 'debt-002',
      description: 'Security vulnerability in auth',
      originTaskId: '038-001',
      originSprintId: 'sprint-038',
      priority: 'CRITICAL' as any,
      sprintsOpen: 3,
      resolved: false,
      createdAt: '2026-03-18T00:00:00Z',
    }];
    const items = buildRetroLearnings(
      makeSprint({ tasks: [] }),
      new Map(),
      undefined,
      undefined,
      debt,
    );
    expect(items).toContainEqual(expect.stringContaining('Open CRITICAL debt'));
  });

  it('excludes resolved debt', () => {
    const debt: DebtItem[] = [{
      id: 'debt-003',
      description: 'Resolved issue',
      originTaskId: '037-001',
      originSprintId: 'sprint-037',
      priority: 'HIGH' as any,
      sprintsOpen: 1,
      resolved: true,
      resolvedInSprintId: 'sprint-040',
      createdAt: '2026-03-15T00:00:00Z',
    }];
    const items = buildRetroLearnings(
      makeSprint({ tasks: [] }),
      new Map(),
      undefined,
      undefined,
      debt,
    );
    expect(items).not.toContainEqual(expect.stringContaining('Resolved issue'));
  });

  it('excludes NORMAL/LOW priority debt', () => {
    const debt: DebtItem[] = [{
      id: 'debt-004',
      description: 'Low priority thing',
      originTaskId: '036-001',
      originSprintId: 'sprint-036',
      priority: 'NORMAL' as any,
      sprintsOpen: 1,
      resolved: false,
      createdAt: '2026-03-14T00:00:00Z',
    }];
    const items = buildRetroLearnings(
      makeSprint({ tasks: [] }),
      new Map(),
      undefined,
      undefined,
      debt,
    );
    expect(items).not.toContainEqual(expect.stringContaining('Low priority thing'));
  });

  it('limits patterns to 3 max', () => {
    const patterns: PatternEntry[] = Array.from({ length: 5 }, (_, i) => ({
      pattern: `Pattern ${i}`,
      occurrences: 2 + i,
      firstDetectedInSprint: 'sprint-035',
      lastDetectedInSprint: 'sprint-040',
      resolved: false,
    }));
    const items = buildRetroLearnings(
      makeSprint({ tasks: [] }),
      new Map(),
      undefined,
      patterns,
    );
    const patternItems = items.filter(i => i.includes('Recurring pattern'));
    expect(patternItems.length).toBeLessThanOrEqual(3);
  });
});

describe('writeRetrospective reads patterns and debt', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('includes pattern learnings in RETRO.md when PATTERNS.md has recurring patterns', () => {
    const brainDir = join(tempDir, '.brain');
    mkdirSync(brainDir, { recursive: true });
    writeFileSync(join(brainDir, 'PATTERNS.md'), JSON.stringify([
      { pattern: 'Worker crash on large files', occurrences: 4, firstDetectedInSprint: 'sprint-038', lastDetectedInSprint: 'sprint-040', resolved: false },
    ]));
    const sprint = makeSprint();
    const evals = new Map([['001', TaskEvaluation.DONE]]);
    const metrics = makeMetrics();
    writeRetrospective(tempDir, sprint, evals, metrics, undefined, undefined, undefined, [makeResult()]);
    const retro = readFileSync(join(brainDir, 'RETRO.md'), 'utf-8');
    expect(retro).toContain('Worker crash on large files');
  });

  it('includes debt learnings in RETRO.md when DEBT.md has open high debt', () => {
    const brainDir = join(tempDir, '.brain');
    mkdirSync(brainDir, { recursive: true });
    writeFileSync(join(brainDir, 'DEBT.md'), JSON.stringify([
      { id: 'd1', description: 'Unhandled edge case in planner', originTaskId: '039-001', originSprintId: 'sprint-039', priority: 'HIGH', sprintsOpen: 2, resolved: false, createdAt: '2026-03-20T00:00:00Z' },
    ]));
    const sprint = makeSprint();
    const evals = new Map([['001', TaskEvaluation.DONE]]);
    const metrics = makeMetrics();
    writeRetrospective(tempDir, sprint, evals, metrics, undefined, undefined, undefined, [makeResult()]);
    const retro = readFileSync(join(brainDir, 'RETRO.md'), 'utf-8');
    expect(retro).toContain('Unhandled edge case in planner');
  });
});

// ═══ countProjectTestCases ═══════════════════════════════════════════

describe('countProjectTestCases', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });
  afterEach(() => rmSync(tempDir, { recursive: true, force: true }));

  it('returns 0 when tests/ directory does not exist', () => {
    expect(countProjectTestCases(tempDir)).toBe(0);
  });

  it('counts it() calls in test files', () => {
    const testsDir = join(tempDir, 'tests');
    mkdirSync(testsDir, { recursive: true });
    writeFileSync(join(testsDir, 'foo.test.ts'), `
      describe('foo', () => {
        it('does A', () => {});
        it('does B', () => {});
        it('does C', () => {});
      });
    `);
    expect(countProjectTestCases(tempDir)).toBe(3);
  });

  it('counts test() calls in test files', () => {
    const testsDir = join(tempDir, 'tests');
    mkdirSync(testsDir, { recursive: true });
    writeFileSync(join(testsDir, 'bar.test.ts'), `
      test('alpha', () => {});
      test('beta', () => {});
    `);
    expect(countProjectTestCases(tempDir)).toBe(2);
  });

  it('counts mixed it() and test() calls', () => {
    const testsDir = join(tempDir, 'tests');
    mkdirSync(testsDir, { recursive: true });
    writeFileSync(join(testsDir, 'mix.test.ts'), `
      it('one', () => {});
      test('two', () => {});
      it('three', () => {});
    `);
    expect(countProjectTestCases(tempDir)).toBe(3);
  });

  it('scans nested directories', () => {
    const nested = join(tempDir, 'tests', 'sub', 'deep');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, 'deep.test.ts'), `
      it('nested test', () => {});
    `);
    expect(countProjectTestCases(tempDir)).toBe(1);
  });

  it('ignores non-test files', () => {
    const testsDir = join(tempDir, 'tests');
    mkdirSync(testsDir, { recursive: true });
    writeFileSync(join(testsDir, 'helper.ts'), `
      it('this should not be counted', () => {});
    `);
    writeFileSync(join(testsDir, 'actual.test.ts'), `
      it('counted', () => {});
    `);
    expect(countProjectTestCases(tempDir)).toBe(1);
  });

  it('handles .spec.ts files', () => {
    const testsDir = join(tempDir, 'tests');
    mkdirSync(testsDir, { recursive: true });
    writeFileSync(join(testsDir, 'foo.spec.ts'), `
      it('spec test', () => {});
      it('another spec', () => {});
    `);
    expect(countProjectTestCases(tempDir)).toBe(2);
  });
});

// ═══ parseCoverageFromClover ═════════════════════════════════════════

describe('parseCoverageFromClover', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });
  afterEach(() => rmSync(tempDir, { recursive: true, force: true }));

  it('returns null when coverage/clover.xml does not exist', () => {
    expect(parseCoverageFromClover(tempDir)).toBeNull();
  });

  it('parses statement coverage from clover.xml', () => {
    const covDir = join(tempDir, 'coverage');
    mkdirSync(covDir, { recursive: true });
    writeFileSync(join(covDir, 'clover.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<coverage generated="123" clover="3.2.0">
  <project timestamp="123" name="All files">
    <metrics statements="100" coveredstatements="75" conditionals="10" coveredconditionals="5" methods="20" coveredmethods="15" elements="130" coveredelements="95" complexity="0" loc="100" ncloc="100" packages="1" files="5" classes="5"/>
  </project>
</coverage>`);
    const result = parseCoverageFromClover(tempDir);
    expect(result).toBeCloseTo(75.0, 1);
  });

  it('returns 0 when statements is 0', () => {
    const covDir = join(tempDir, 'coverage');
    mkdirSync(covDir, { recursive: true });
    writeFileSync(join(covDir, 'clover.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<coverage generated="123" clover="3.2.0">
  <project timestamp="123" name="All files">
    <metrics statements="0" coveredstatements="0" conditionals="0" coveredconditionals="0" methods="0" coveredmethods="0" elements="0" coveredelements="0"/>
  </project>
</coverage>`);
    expect(parseCoverageFromClover(tempDir)).toBe(0);
  });

  it('returns null for malformed XML', () => {
    const covDir = join(tempDir, 'coverage');
    mkdirSync(covDir, { recursive: true });
    writeFileSync(join(covDir, 'clover.xml'), 'not xml at all');
    expect(parseCoverageFromClover(tempDir)).toBeNull();
  });
});

// ═══ extractSprintNumber ═════════════════════════════════════════════

describe('extractSprintNumber', () => {
  it('extracts number from sprint-042', () => {
    expect(extractSprintNumber('sprint-042')).toBe(42);
  });

  it('extracts number from sprint-001', () => {
    expect(extractSprintNumber('sprint-001')).toBe(1);
  });

  it('extracts number from sprint-100', () => {
    expect(extractSprintNumber('sprint-100')).toBe(100);
  });

  it('returns null for invalid sprint ID', () => {
    expect(extractSprintNumber('invalid')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractSprintNumber('')).toBeNull();
  });
});

// ═══ updateProjectIdentity ═══════════════════════════════════════════

describe('updateProjectIdentity', () => {
  let tempDir: string;
  let brainDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    brainDir = join(tempDir, '.brain');
    mkdirSync(brainDir, { recursive: true });
  });
  afterEach(() => rmSync(tempDir, { recursive: true, force: true }));

  it('creates PROJECT-IDENTITY.md when it does not exist', () => {
    const metrics = makeMetrics();
    updateProjectIdentity(tempDir, 'sprint-005', metrics, 5);
    const filePath = join(brainDir, 'PROJECT-IDENTITY.md');
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('## Current State');
    expect(content).toContain('- Last Sprint: sprint-005');
  });

  it('uses real test count from test files, not metrics.totalTasks', () => {
    // Create test files in tests/ directory
    const testsDir = join(tempDir, 'tests');
    mkdirSync(testsDir, { recursive: true });
    writeFileSync(join(testsDir, 'a.test.ts'), `
      it('test1', () => {});
      it('test2', () => {});
      it('test3', () => {});
      test('test4', () => {});
      test('test5', () => {});
    `);

    // Create existing identity file
    writeFileSync(join(brainDir, 'PROJECT-IDENTITY.md'), [
      '# Project Identity', '', '## Current State',
      '- Test Count: 0', '- Last Sprint: sprint-001', '',
    ].join('\n'));

    const metrics = makeMetrics({ totalTasks: 8 }); // 8 tasks, NOT 8 tests
    updateProjectIdentity(tempDir, 'sprint-010', metrics);

    const content = readFileSync(join(brainDir, 'PROJECT-IDENTITY.md'), 'utf-8');
    // Should show 5 (real test count), not 8 (totalTasks)
    expect(content).toContain('- Test Count: 5');
    expect(content).not.toContain('- Test Count: 8');
  });

  it('extracts total sprints from sprint ID number', () => {
    writeFileSync(join(brainDir, 'PROJECT-IDENTITY.md'), [
      '# Project Identity', '', '## Current State',
      '- Test Count: 0', '- Last Sprint: sprint-001', '',
    ].join('\n'));

    const metrics = makeMetrics();
    updateProjectIdentity(tempDir, 'sprint-042', metrics);

    const content = readFileSync(join(brainDir, 'PROJECT-IDENTITY.md'), 'utf-8');
    expect(content).toContain('- Total Sprints: 42');
  });

  it('accumulates completed tasks across sprints', () => {
    writeFileSync(join(brainDir, 'PROJECT-IDENTITY.md'), [
      '# Project Identity', '', '## Current State',
      '- Test Count: 100', '- Completed Tasks: 50', '- Last Sprint: sprint-010', '',
    ].join('\n'));

    const metrics = makeMetrics({ completedTasks: 7 });
    updateProjectIdentity(tempDir, 'sprint-011', metrics);

    const content = readFileSync(join(brainDir, 'PROJECT-IDENTITY.md'), 'utf-8');
    // 50 previous + 7 current = 57
    expect(content).toContain('- Completed Tasks: 57');
  });

  it('reads coverage from clover.xml when available', () => {
    // Create clover.xml
    const covDir = join(tempDir, 'coverage');
    mkdirSync(covDir, { recursive: true });
    writeFileSync(join(covDir, 'clover.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<coverage generated="123" clover="3.2.0">
  <project timestamp="123" name="All files">
    <metrics statements="200" coveredstatements="188" conditionals="10" coveredconditionals="5" methods="20" coveredmethods="15" elements="230" coveredelements="208"/>
  </project>
</coverage>`);

    writeFileSync(join(brainDir, 'PROJECT-IDENTITY.md'), [
      '# Project Identity', '', '## Current State',
      '- Test Count: 0', '- Coverage: 0.0%', '- Last Sprint: sprint-001', '',
    ].join('\n'));

    const metrics = makeMetrics({ coveragePercent: 0 }); // metrics says 0
    updateProjectIdentity(tempDir, 'sprint-005', metrics);

    const content = readFileSync(join(brainDir, 'PROJECT-IDENTITY.md'), 'utf-8');
    // 188/200 = 94.0%
    expect(content).toContain('- Coverage: 94.0%');
  });

  it('falls back to metrics coverage when clover.xml is missing', () => {
    writeFileSync(join(brainDir, 'PROJECT-IDENTITY.md'), [
      '# Project Identity', '', '## Current State',
      '- Test Count: 0', '- Coverage: 0.0%', '- Last Sprint: sprint-001', '',
    ].join('\n'));

    const metrics = makeMetrics({ coveragePercent: 85.5 });
    updateProjectIdentity(tempDir, 'sprint-005', metrics);

    const content = readFileSync(join(brainDir, 'PROJECT-IDENTITY.md'), 'utf-8');
    expect(content).toContain('- Coverage: 85.5%');
  });

  it('appends Current State section when it does not exist in file', () => {
    writeFileSync(join(brainDir, 'PROJECT-IDENTITY.md'), [
      '# Project Identity', '', '## Architecture', '- Language: TypeScript', '',
    ].join('\n'));

    const metrics = makeMetrics();
    updateProjectIdentity(tempDir, 'sprint-003', metrics);

    const content = readFileSync(join(brainDir, 'PROJECT-IDENTITY.md'), 'utf-8');
    expect(content).toContain('## Current State');
    expect(content).toContain('- Last Sprint: sprint-003');
    expect(content).toContain('## Architecture');
  });

  it('preserves other sections when updating Current State', () => {
    writeFileSync(join(brainDir, 'PROJECT-IDENTITY.md'), [
      '# Project Identity', '',
      '## What Is This Project', '- Name: myapp', '',
      '## Current State', '- Test Count: 0', '- Last Sprint: sprint-001', '',
      '## Architecture', '- Language: TypeScript', '',
    ].join('\n'));

    const metrics = makeMetrics();
    updateProjectIdentity(tempDir, 'sprint-002', metrics);

    const content = readFileSync(join(brainDir, 'PROJECT-IDENTITY.md'), 'utf-8');
    expect(content).toContain('## What Is This Project');
    expect(content).toContain('- Name: myapp');
    expect(content).toContain('## Architecture');
    expect(content).toContain('- Language: TypeScript');
    expect(content).toContain('- Last Sprint: sprint-002');
  });
});
