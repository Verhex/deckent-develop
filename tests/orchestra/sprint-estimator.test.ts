import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Task } from '../../src/core/types.js';
import { TaskStatus } from '../../src/core/types.js';
import {
  scoreTaskComplexity,
  calculateParallelismFactor,
  parseSprintDurationFromLog,
  readHistoricalDurations,
  average,
  estimateSprintDuration,
  estimateSprintFull,
  writeEstimateToDashboard,
} from '../../src/orchestra/sprint-estimator.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PREMIUM_MODEL = 'claude-opus-4-8';
const STANDARD_MODEL = 'claude-sonnet-5';
const ECONOMY_MODEL = 'claude-haiku-4-5-20251001';
const CROSS_PROVIDER_PREMIUM_MODEL = 'gpt-5.5';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-001',
    title: 'Test Task',
    description: 'A test task',
    model: STANDARD_MODEL,
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'testing',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    ...overrides,
  };
}

function makeTmpDir(): string {
  const dir = join(tmpdir(), `deckent-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ─── scoreTaskComplexity ──────────────────────────────────────────────────────

describe('scoreTaskComplexity', () => {
  it('uses correct base minutes for a premium model', () => {
    const task = makeTask({ model: PREMIUM_MODEL });
    const score = scoreTaskComplexity(task);
    expect(score.baseMin).toBe(30);
  });

  it('uses correct base minutes for a standard model', () => {
    const task = makeTask({ model: STANDARD_MODEL });
    const score = scoreTaskComplexity(task);
    expect(score.baseMin).toBe(20);
  });

  it('uses correct base minutes for an economy model', () => {
    const task = makeTask({ model: ECONOMY_MODEL });
    const score = scoreTaskComplexity(task);
    expect(score.baseMin).toBe(10);
  });

  it('derives base minutes from registry TIER for a canonical model id', () => {
    // claude-opus-4-8 is premium tier → 30 (same as the opus alias), proving the
    // score keys off registry tier metadata, not an alias string.
    const score = scoreTaskComplexity(makeTask({ model: 'claude-opus-4-8' }));
    expect(score.baseMin).toBe(30);
  });

  it('scores an economy-tier canonical model at the economy baseline', () => {
    // gemini-2.0-flash is economy tier in the registry → 10 (no alias keyword match).
    const score = scoreTaskComplexity(makeTask({ model: 'gemini-2.0-flash' }));
    expect(score.baseMin).toBe(10);
  });

  it('uses the same base minutes for the same tier across providers', () => {
    const claudeScore = scoreTaskComplexity(makeTask({ model: PREMIUM_MODEL }));
    const codexScore = scoreTaskComplexity(makeTask({ model: CROSS_PROVIDER_PREMIUM_MODEL }));
    expect(codexScore.baseMin).toBe(claudeScore.baseMin);
  });

  it('fails loudly for an unregistered model instead of assuming a standard tier', () => {
    expect(() => scoreTaskComplexity(makeTask({ model: 'unregistered-model-v1' })))
      .toThrow(expect.objectContaining({ name: 'DeckentError', code: 'E_UNKNOWN_MODEL' }));
  });

  it('applies low effort multiplier (0.6)', () => {
    const task = makeTask({ model: STANDARD_MODEL, effort: 'low' });
    const score = scoreTaskComplexity(task);
    expect(score.effortMin).toBeCloseTo(20 * 0.6);
  });

  it('applies normal effort multiplier (1.0)', () => {
    const task = makeTask({ model: STANDARD_MODEL, effort: 'normal' });
    const score = scoreTaskComplexity(task);
    expect(score.effortMin).toBeCloseTo(20 * 1.0);
  });

  it('applies high effort multiplier (1.6)', () => {
    const task = makeTask({ model: STANDARD_MODEL, effort: 'high' });
    const score = scoreTaskComplexity(task);
    expect(score.effortMin).toBeCloseTo(20 * 1.6);
  });

  it('adds scope time based on directories and filesWrite', () => {
    const task = makeTask({
      scope: { directories: ['src/', 'tests/'], filesRead: [], filesWrite: ['out.ts'] },
    });
    const score = scoreTaskComplexity(task);
    // 2 directories + 1 filesWrite = 3 items × 2 min
    expect(score.scopeMin).toBe(6);
  });

  it('caps scope items at 10', () => {
    const task = makeTask({
      scope: {
        directories: Array.from({ length: 8 }, (_, i) => `dir${i}/`),
        filesRead: [],
        filesWrite: Array.from({ length: 6 }, (_, i) => `file${i}.ts`),
      },
    });
    const score = scoreTaskComplexity(task);
    // capped at 10 items × 2 min = 20
    expect(score.scopeMin).toBe(20);
  });

  it('returns correct taskId', () => {
    const task = makeTask({ id: 'abc-123' });
    const score = scoreTaskComplexity(task);
    expect(score.taskId).toBe('abc-123');
  });

  it('total equals effortMin + scopeMin', () => {
    const task = makeTask({ model: PREMIUM_MODEL, effort: 'high' });
    const score = scoreTaskComplexity(task);
    expect(score.totalMin).toBeCloseTo(score.effortMin + score.scopeMin);
  });

  it('handles empty scope gracefully', () => {
    const task = makeTask({
      scope: { directories: [], filesRead: [], filesWrite: [] },
    });
    const score = scoreTaskComplexity(task);
    expect(score.scopeMin).toBe(0);
  });
});

// ─── calculateParallelismFactor ───────────────────────────────────────────────

describe('calculateParallelismFactor', () => {
  it('returns 1.0 for 1 worker', () => {
    expect(calculateParallelismFactor(1)).toBe(1.0);
  });

  it('returns 1.0 for 0 workers', () => {
    expect(calculateParallelismFactor(0)).toBe(1.0);
  });

  it('returns less than 1.0 for 2 workers', () => {
    const factor = calculateParallelismFactor(2);
    expect(factor).toBeLessThan(1.0);
    expect(factor).toBeCloseTo(1 / Math.sqrt(2));
  });

  it('returns less than 1.0 for 4 workers', () => {
    const factor = calculateParallelismFactor(4);
    expect(factor).toBeCloseTo(0.5);
  });

  it('clamps to minimum 0.2 for very large worker counts', () => {
    const factor = calculateParallelismFactor(1000);
    expect(factor).toBe(0.2);
  });

  it('returns value between 0.2 and 1.0 for 3 workers', () => {
    const factor = calculateParallelismFactor(3);
    expect(factor).toBeGreaterThanOrEqual(0.2);
    expect(factor).toBeLessThanOrEqual(1.0);
  });

  it('factor decreases as worker count increases', () => {
    const f2 = calculateParallelismFactor(2);
    const f4 = calculateParallelismFactor(4);
    const f8 = calculateParallelismFactor(8);
    expect(f2).toBeGreaterThan(f4);
    expect(f4).toBeGreaterThan(f8);
  });
});

// ─── parseSprintDurationFromLog ───────────────────────────────────────────────

describe('parseSprintDurationFromLog', () => {
  it('parses duration from sprint log format', () => {
    const content = '| Duration | 3600000ms |\n';
    const min = parseSprintDurationFromLog(content);
    expect(min).toBe(60);
  });

  it('returns null for missing duration line', () => {
    const content = '# sprint-001\n\n## Metrics\n| Total Tasks | 5 |\n';
    expect(parseSprintDurationFromLog(content)).toBeNull();
  });

  it('returns null for zero duration', () => {
    const content = '| Duration | 0ms |\n';
    expect(parseSprintDurationFromLog(content)).toBeNull();
  });

  it('parses 30-minute sprint correctly', () => {
    const content = '## Metrics\n| Metric | Value |\n|--------|-------|\n| Duration | 1800000ms |\n';
    const min = parseSprintDurationFromLog(content);
    expect(min).toBeCloseTo(30);
  });

  it('handles extra whitespace around values', () => {
    const content = '|  Duration  |  7200000ms  |\n';
    const min = parseSprintDurationFromLog(content);
    expect(min).toBe(120);
  });

  it('returns null for non-numeric value', () => {
    const content = '| Duration | Xms |\n';
    expect(parseSprintDurationFromLog(content)).toBeNull();
  });
});

// ─── average ──────────────────────────────────────────────────────────────────

describe('average', () => {
  it('returns 0 for empty array', () => {
    expect(average([])).toBe(0);
  });

  it('returns the single value for one-element array', () => {
    expect(average([42])).toBe(42);
  });

  it('calculates average of multiple values', () => {
    expect(average([10, 20, 30])).toBe(20);
  });

  it('handles floating-point values', () => {
    expect(average([1.5, 2.5])).toBeCloseTo(2.0);
  });
});

// ─── readHistoricalDurations ──────────────────────────────────────────────────

describe('readHistoricalDurations', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    const sprintsDir = join(tmpDir, '.brain', 'sprints');
    mkdirSync(sprintsDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty array when sprints directory does not exist', () => {
    const nonExistent = join(tmpDir, 'no-such-dir');
    expect(readHistoricalDurations(nonExistent, 3)).toEqual([]);
  });

  it('returns empty array when no sprint files exist', () => {
    expect(readHistoricalDurations(tmpDir, 3)).toEqual([]);
  });

  it('reads duration from a single sprint file', () => {
    const sprintsDir = join(tmpDir, '.brain', 'sprints');
    writeFileSync(join(sprintsDir, 'sprint-001.md'), '| Duration | 1800000ms |\n', 'utf-8');
    const durations = readHistoricalDurations(tmpDir, 3);
    expect(durations).toHaveLength(1);
    expect(durations[0]).toBeCloseTo(30);
  });

  it('reads multiple sprint files and respects limit', () => {
    const sprintsDir = join(tmpDir, '.brain', 'sprints');
    writeFileSync(join(sprintsDir, 'sprint-001.md'), '| Duration | 1800000ms |\n', 'utf-8');
    writeFileSync(join(sprintsDir, 'sprint-002.md'), '| Duration | 3600000ms |\n', 'utf-8');
    writeFileSync(join(sprintsDir, 'sprint-003.md'), '| Duration | 7200000ms |\n', 'utf-8');
    writeFileSync(join(sprintsDir, 'sprint-004.md'), '| Duration | 9000000ms |\n', 'utf-8');
    const durations = readHistoricalDurations(tmpDir, 3);
    expect(durations).toHaveLength(3);
  });

  it('skips files without parseable duration', () => {
    const sprintsDir = join(tmpDir, '.brain', 'sprints');
    writeFileSync(join(sprintsDir, 'sprint-001.md'), '# sprint-001\nno duration here\n', 'utf-8');
    writeFileSync(join(sprintsDir, 'sprint-002.md'), '| Duration | 3600000ms |\n', 'utf-8');
    const durations = readHistoricalDurations(tmpDir, 3);
    expect(durations).toHaveLength(1);
    expect(durations[0]).toBeCloseTo(60);
  });

  it('returns most recent sprints first', () => {
    const sprintsDir = join(tmpDir, '.brain', 'sprints');
    writeFileSync(join(sprintsDir, 'sprint-001.md'), '| Duration | 600000ms |\n', 'utf-8');
    writeFileSync(join(sprintsDir, 'sprint-002.md'), '| Duration | 1200000ms |\n', 'utf-8');
    writeFileSync(join(sprintsDir, 'sprint-003.md'), '| Duration | 1800000ms |\n', 'utf-8');
    const durations = readHistoricalDurations(tmpDir, 3);
    // sprint-003 (most recent) should be first = 30 min
    expect(durations[0]).toBeCloseTo(30);
    expect(durations[1]).toBeCloseTo(20);
    expect(durations[2]).toBeCloseTo(10);
  });
});

// ─── estimateSprintDuration ───────────────────────────────────────────────────

describe('estimateSprintDuration', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns 0 for empty task list', () => {
    const result = estimateSprintDuration([], 3, tmpDir);
    expect(result).toBe(0);
  });

  it('returns positive number for non-empty task list', () => {
    const tasks = [makeTask({ model: STANDARD_MODEL, effort: 'normal' })];
    const result = estimateSprintDuration(tasks, 1, tmpDir);
    expect(result).toBeGreaterThan(0);
  });

  it('returns lower estimate for more workers (parallelism)', () => {
    const tasks = Array.from({ length: 5 }, () => makeTask({ model: STANDARD_MODEL, effort: 'normal' }));
    const single = estimateSprintDuration(tasks, 1, tmpDir);
    const multi = estimateSprintDuration(tasks, 4, tmpDir);
    expect(multi).toBeLessThan(single);
  });

  it('uses historical data when available', () => {
    const sprintsDir = join(tmpDir, '.brain', 'sprints');
    mkdirSync(sprintsDir, { recursive: true });
    // Write 3 historical sprints, each 60 minutes = 3600000ms
    for (let i = 1; i <= 3; i++) {
      writeFileSync(join(sprintsDir, `sprint-00${i}.md`), '| Duration | 3600000ms |\n', 'utf-8');
    }
    const tasks = [makeTask({ model: STANDARD_MODEL, effort: 'normal' })];
    const withHistory = estimateSprintDuration(tasks, 1, tmpDir);
    // Should blend heuristic with 60-min historical average
    expect(withHistory).toBeGreaterThan(0);
  });

  it('returns at least 1 minute', () => {
    const tasks = [makeTask({ model: ECONOMY_MODEL, effort: 'low', scope: { directories: [], filesRead: [], filesWrite: [] } })];
    const result = estimateSprintDuration(tasks, 100, tmpDir);
    expect(result).toBeGreaterThanOrEqual(1);
  });

  it('returns integer (rounded) value', () => {
    const tasks = [makeTask()];
    const result = estimateSprintDuration(tasks, 2, tmpDir);
    expect(Number.isInteger(result)).toBe(true);
  });
});

// ─── estimateSprintFull ───────────────────────────────────────────────────────

describe('estimateSprintFull', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns zero estimate for empty tasks', () => {
    const result = estimateSprintFull([], 2, tmpDir);
    expect(result.estimatedMin).toBe(0);
    expect(result.taskScores).toHaveLength(0);
    expect(result.serialTotalMin).toBe(0);
    expect(result.historicalSprintCount).toBe(0);
  });

  it('includes task scores in result', () => {
    const tasks = [makeTask({ id: 't1' }), makeTask({ id: 't2' })];
    const result = estimateSprintFull(tasks, 1, tmpDir);
    expect(result.taskScores).toHaveLength(2);
    expect(result.taskScores.map((s) => s.taskId)).toContain('t1');
    expect(result.taskScores.map((s) => s.taskId)).toContain('t2');
  });

  it('serialTotalMin is sum of individual task scores', () => {
    const tasks = [makeTask({ model: STANDARD_MODEL, effort: 'normal' }), makeTask({ model: PREMIUM_MODEL, effort: 'high' })];
    const result = estimateSprintFull(tasks, 1, tmpDir);
    const expectedSerial = result.taskScores.reduce((s, t) => s + t.totalMin, 0);
    expect(result.serialTotalMin).toBeCloseTo(expectedSerial);
  });

  it('reports correct worker count', () => {
    const tasks = [makeTask()];
    const result = estimateSprintFull(tasks, 5, tmpDir);
    expect(result.workers).toBe(5);
  });

  it('reports historicalSprintCount when history is available', () => {
    const sprintsDir = join(tmpDir, '.brain', 'sprints');
    mkdirSync(sprintsDir, { recursive: true });
    writeFileSync(join(sprintsDir, 'sprint-001.md'), '| Duration | 3600000ms |\n', 'utf-8');
    writeFileSync(join(sprintsDir, 'sprint-002.md'), '| Duration | 1800000ms |\n', 'utf-8');
    const tasks = [makeTask()];
    const result = estimateSprintFull(tasks, 1, tmpDir);
    expect(result.historicalSprintCount).toBe(2);
    expect(result.historicalAvgMin).toBeCloseTo(45);
  });

  it('blends estimate 70/30 with history', () => {
    const sprintsDir = join(tmpDir, '.brain', 'sprints');
    mkdirSync(sprintsDir, { recursive: true });
    // Historical average of 120 minutes
    writeFileSync(join(sprintsDir, 'sprint-001.md'), '| Duration | 7200000ms |\n', 'utf-8');
    const task = makeTask({ model: STANDARD_MODEL, effort: 'normal', scope: { directories: [], filesRead: [], filesWrite: [] } });
    const result = estimateSprintFull([task], 1, tmpDir);
    const heuristic = result.serialTotalMin * result.parallelismFactor;
    const expected = Math.max(1, Math.round(heuristic * 0.7 + 120 * 0.3));
    expect(result.estimatedMin).toBe(expected);
  });

  it('uses only heuristic when no history', () => {
    const task = makeTask({ model: STANDARD_MODEL, effort: 'normal', scope: { directories: [], filesRead: [], filesWrite: [] } });
    const result = estimateSprintFull([task], 1, tmpDir);
    expect(result.historicalSprintCount).toBe(0);
    const expected = Math.max(1, Math.round(result.serialTotalMin * result.parallelismFactor));
    expect(result.estimatedMin).toBe(expected);
  });
});

// ─── writeEstimateToDashboard ─────────────────────────────────────────────────

describe('writeEstimateToDashboard', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeDashboard(dir: string, state: Record<string, unknown>): void {
    writeFileSync(join(dir, '.dashboard'), JSON.stringify(state, null, 2), 'utf-8');
  }

  function readDashboard(dir: string): Record<string, unknown> {
    const raw = require('node:fs').readFileSync(join(dir, '.dashboard'), 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
  }

  it('does nothing when dashboard does not exist', () => {
    const estimate = {
      estimatedMin: 30,
      taskScores: [],
      serialTotalMin: 30,
      parallelismFactor: 1.0,
      historicalAvgMin: 0,
      historicalSprintCount: 0,
      workers: 1,
    };
    expect(() => writeEstimateToDashboard(tmpDir, estimate)).not.toThrow();
  });

  it('writes estimatedDurationMin to dashboard', () => {
    writeDashboard(tmpDir, { sprint: { id: 'sprint-001' } });
    const estimate = {
      estimatedMin: 45,
      taskScores: [],
      serialTotalMin: 45,
      parallelismFactor: 1.0,
      historicalAvgMin: 0,
      historicalSprintCount: 0,
      workers: 2,
    };
    writeEstimateToDashboard(tmpDir, estimate);
    const dash = readDashboard(tmpDir);
    expect(dash.estimatedDurationMin).toBe(45);
  });

  it('preserves existing dashboard fields', () => {
    writeDashboard(tmpDir, { sprint: { id: 'sprint-001' }, agents: [] });
    const estimate = {
      estimatedMin: 60,
      taskScores: [],
      serialTotalMin: 60,
      parallelismFactor: 0.7,
      historicalAvgMin: 0,
      historicalSprintCount: 0,
      workers: 2,
    };
    writeEstimateToDashboard(tmpDir, estimate);
    const dash = readDashboard(tmpDir);
    expect(dash.sprint).toBeDefined();
    expect((dash.sprint as Record<string, unknown>).id).toBe('sprint-001');
    expect(dash.agents).toBeDefined();
  });

  it('writes estimationDetails to dashboard', () => {
    writeDashboard(tmpDir, { sprint: {} });
    const estimate = {
      estimatedMin: 30,
      taskScores: [{ taskId: 't1', baseMin: 20, effortMin: 20, scopeMin: 4, totalMin: 24 }],
      serialTotalMin: 24,
      parallelismFactor: 0.7,
      historicalAvgMin: 45,
      historicalSprintCount: 2,
      workers: 2,
    };
    writeEstimateToDashboard(tmpDir, estimate);
    const dash = readDashboard(tmpDir);
    expect(dash.estimationDetails).toBeDefined();
    const details = dash.estimationDetails as Record<string, unknown>;
    expect(details.workers).toBe(2);
    expect(details.historicalSprintCount).toBe(2);
    expect(details.taskCount).toBe(1);
  });

  it('handles malformed dashboard JSON gracefully', () => {
    writeFileSync(join(tmpDir, '.dashboard'), 'NOT JSON', 'utf-8');
    const estimate = {
      estimatedMin: 30,
      taskScores: [],
      serialTotalMin: 30,
      parallelismFactor: 1.0,
      historicalAvgMin: 0,
      historicalSprintCount: 0,
      workers: 1,
    };
    expect(() => writeEstimateToDashboard(tmpDir, estimate)).not.toThrow();
  });
});
