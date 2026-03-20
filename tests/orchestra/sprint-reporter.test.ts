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
} from '../../src/orchestra/sprint-reporter.js';
import { TaskEvaluation, SprintPhase, SprintStatus, DebtPriority } from '../../src/core/types.js';
import type { Sprint, Task, TaskResult, SprintMetrics, DebtItem, SprintResult, ResolvedConfig } from '../../src/core/types.js';

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
    const metrics = makeMetrics({ totalTasks: 10, completedTasks: 8, noGoRate: 10.5 });
    writeRetrospective(tmpDir, sprint, evals, metrics);
    const content = readFileSync(join(tmpDir, '.brain', 'RETRO.md'), 'utf-8');
    expect(content).toContain('## Metrics');
    expect(content).toContain('Tasks: 10 total, 8 done');
    expect(content).toContain('No-Go Rate: 10.5%');
  });

  it('RETRO.md includes task results section', () => {
    const task = makeTask({ id: '001', title: 'My Task' });
    const sprint = makeSprint({ tasks: [task] });
    const evals = new Map([['001', TaskEvaluation.GO_WITH_TECH_DEBT]]);
    const metrics = makeMetrics();
    writeRetrospective(tmpDir, sprint, evals, metrics);
    const content = readFileSync(join(tmpDir, '.brain', 'RETRO.md'), 'utf-8');
    expect(content).toContain('## Results');
    expect(content).toContain('001: My Task -> GO_WITH_TECH_DEBT');
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
    // Fill with 100 lines
    const bigContent = Array.from({ length: 100 }, (_, i) => `line-${i}`).join('\n');
    writeFileSync(memPath, bigContent, 'utf-8');
    const sprint = makeSprint();
    const evals = new Map([[sprint.tasks[0].id, TaskEvaluation.NO_GO]]);
    writeRetrospective(tmpDir, sprint, evals, makeMetrics());
    const content = readFileSync(memPath, 'utf-8');
    const lineCount = content.split('\n').length;
    expect(lineCount).toBeLessThanOrEqual(100);
  });

  it('handles sprint with no tasks', () => {
    const sprint = makeSprint({ tasks: [] });
    const evals = new Map<string, TaskEvaluation>();
    expect(() => writeRetrospective(tmpDir, sprint, evals, makeMetrics())).not.toThrow();
    const content = readFileSync(join(tmpDir, '.brain', 'RETRO.md'), 'utf-8');
    expect(content).toContain('# Sprint sprint-001 Retrospective');
  });

  it('shows UNKNOWN for tasks missing from evaluations map', () => {
    const task = makeTask({ id: '999', title: 'Unknown Task' });
    const sprint = makeSprint({ tasks: [task] });
    const evals = new Map<string, TaskEvaluation>(); // empty
    writeRetrospective(tmpDir, sprint, evals, makeMetrics());
    const content = readFileSync(join(tmpDir, '.brain', 'RETRO.md'), 'utf-8');
    expect(content).toContain('999: Unknown Task -> UNKNOWN');
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

  it('truncates output to SPRINT_LOG_MAX_LINES (50 lines)', () => {
    // Create a sprint with many tasks so output would exceed 50 lines
    const tasks = Array.from({ length: 60 }, (_, i) => makeTask({ id: `${i + 1}`.padStart(3, '0'), title: `Task ${i + 1}` }));
    const sprint = makeSprint({ tasks });
    writeSprintLog(tmpDir, sprint, makeMetrics());
    const content = readFileSync(join(tmpDir, '.brain', 'sprints', 'sprint-001.md'), 'utf-8');
    const lineCount = content.split('\n').length;
    expect(lineCount).toBeLessThanOrEqual(50);
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

  it('includes comparison section when previous sprint exists', () => {
    // Write sprint-001 log first
    const sprint001 = makeSprint({ id: 'sprint-001' });
    writeSprintLog(tmpDir, sprint001, makeMetrics({ durationMs: 3600000, noGoRate: 20 }));

    // Write retrospective for sprint-002
    const sprint002 = makeSprint({ id: 'sprint-002' });
    const evals = new Map([[sprint002.tasks[0].id, TaskEvaluation.DONE]]);
    writeRetrospective(tmpDir, sprint002, evals, makeMetrics({ durationMs: 7200000, noGoRate: 10 }));

    const content = readFileSync(join(tmpDir, '.brain', 'RETRO.md'), 'utf-8');
    expect(content).toContain('## Comparison with Previous Sprint');
    expect(content).toContain('Duration:');
    expect(content).toContain('No-Go Rate:');
  });

  it('omits comparison section when no previous sprint exists', () => {
    const sprint = makeSprint({ id: 'sprint-001' });
    const evals = new Map([[sprint.tasks[0].id, TaskEvaluation.DONE]]);
    writeRetrospective(tmpDir, sprint, evals, makeMetrics());

    const content = readFileSync(join(tmpDir, '.brain', 'RETRO.md'), 'utf-8');
    expect(content).not.toContain('## Comparison with Previous Sprint');
  });
});
