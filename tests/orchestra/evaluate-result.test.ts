import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskEvaluation, TaskStatus } from '../../src/core/types.js';
import type { Task, TaskResult } from '../../src/core/types.js';

// ─── Mocks (required for brain.ts imports) ──────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

vi.mock('../../src/orchestra/tmux.js', () => ({
  ensureSession: vi.fn(),
  spawnWorker: vi.fn(),
  killWorker: vi.fn(),
  listWorkers: vi.fn().mockReturnValue([]),
  startAuditor: vi.fn(),
}));

vi.mock('../../src/monitor/auditor.js', () => ({
  updateDashboard: vi.fn(),
  detectDeadlocks: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/agents/worker.js', () => ({
  updateTaskStatus: vi.fn().mockImplementation((_root: string, _id: string, _status: string) => ({})),
  releaseAllLocks: vi.fn().mockReturnValue(0),
}));

import { evaluateResult, isDocTask } from '../../src/orchestra/brain.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeTask(directories: string[]): Task {
  return {
    id: '001-001',
    title: 'Test task',
    description: 'desc',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories, filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
  };
}

function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '001-001',
    workerId: 'w-001',
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 95,
    selfAssessment: 'DONE',
    notes: '',
    ...overrides,
  };
}

// ─── isDocTask() ─────────────────────────────────────────────────────

describe('isDocTask', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns true for docs/ directory', () => {
    expect(isDocTask(makeTask(['docs']))).toBe(true);
  });

  it('returns true for docs/subdirectory', () => {
    expect(isDocTask(makeTask(['docs/guides']))).toBe(true);
  });

  it('returns true when all directories are under docs/', () => {
    expect(isDocTask(makeTask(['docs/api', 'docs/guides']))).toBe(true);
  });

  it('returns false for src/ directory', () => {
    expect(isDocTask(makeTask(['src/orchestra']))).toBe(false);
  });

  it('returns false for mixed scope (docs/ + src/)', () => {
    expect(isDocTask(makeTask(['docs', 'src/orchestra']))).toBe(false);
  });

  it('returns false for empty directories', () => {
    expect(isDocTask(makeTask([]))).toBe(false);
  });
});

// ─── evaluateResult() ────────────────────────────────────────────────

describe('evaluateResult', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // ── doc task branch ──────────────────────────────────────────────

  it('doc task with testsPassed=true → DONE (skips coverage check)', () => {
    const task = makeTask(['docs']);
    const result = makeResult({ testsPassed: true, coverage: 0, selfAssessment: 'DONE' });
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.DONE);
  });

  it('doc task with coverage=0 still → DONE', () => {
    const task = makeTask(['docs/guides']);
    const result = makeResult({ coverage: 0, selfAssessment: 'DONE' });
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.DONE);
  });

  it('doc task with testsPassed=false → NO_GO', () => {
    const task = makeTask(['docs']);
    const result = makeResult({ testsPassed: false, selfAssessment: 'DONE' });
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.NO_GO);
  });

  it('doc task selfAssessment=NO_GO → NO_GO', () => {
    const task = makeTask(['docs']);
    const result = makeResult({ selfAssessment: 'NO_GO' });
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.NO_GO);
  });

  it('doc task selfAssessment=GO_WITH_TECH_DEBT → GO_WITH_TECH_DEBT', () => {
    const task = makeTask(['docs']);
    const result = makeResult({ selfAssessment: 'GO_WITH_TECH_DEBT' });
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  // ── normal task branch ──────────────────────────────────────────

  it('normal task with coverage >= 90 → DONE', () => {
    const task = makeTask(['src/orchestra']);
    const result = makeResult({ testsPassed: true, coverage: 95 });
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.DONE);
  });

  it('normal task with coverage < 90 → GO_WITH_TECH_DEBT', () => {
    const task = makeTask(['src/orchestra']);
    const result = makeResult({ testsPassed: true, coverage: 80 });
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('normal task with testsPassed=false → NO_GO', () => {
    const task = makeTask(['src/orchestra']);
    const result = makeResult({ testsPassed: false });
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.NO_GO);
  });

  it('normal task selfAssessment=NO_GO → NO_GO regardless of coverage', () => {
    const task = makeTask(['src/orchestra']);
    const result = makeResult({ selfAssessment: 'NO_GO', coverage: 99 });
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.NO_GO);
  });

  // ── mixed scope (docs/ + src/) uses normal evaluation ───────────

  it('mixed scope with low coverage → GO_WITH_TECH_DEBT (not treated as doc task)', () => {
    const task = makeTask(['docs', 'src/orchestra']);
    const result = makeResult({ testsPassed: true, coverage: 50 });
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('mixed scope with high coverage → DONE', () => {
    const task = makeTask(['docs', 'src/orchestra']);
    const result = makeResult({ testsPassed: true, coverage: 95 });
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.DONE);
  });
});
