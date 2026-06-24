/**
 * Tests: evaluateResultSync Coverage Entegrasyonu (Gorev 027-007)
 *
 * Covers:
 * - Coverage validated task returns DONE
 * - Coverage not validated (mismatch > 5%) returns GO_WITH_TECH_DEBT
 * - Doc task returns DONE without coverage validation
 * - Self-assessment NO_GO always returns NO_GO
 * - Self-assessment GO_WITH_TECH_DEBT always returns GO_WITH_TECH_DEBT
 * - testsPassed false returns NO_GO
 * - coverage < 90 without vitest output returns GO_WITH_TECH_DEBT
 * - vitest JSON with matching coverage returns DONE
 * - vitest JSON with mismatched coverage returns GO_WITH_TECH_DEBT
 * - unparseable vitest JSON returns GO_WITH_TECH_DEBT (cannot validate)
 * - empty vitest JSON string returns DONE (no validation possible, falls through to coverage check)
 */

import { describe, it, expect, vi } from 'vitest';
import { TaskStatus, TaskEvaluation } from '../../src/core/types.js';
import type { Task, TaskResult } from '../../src/core/types.js';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  unlinkSync: vi.fn(),
  statSync: vi.fn(),
  // Sprint 139 async I/O migration: sprint-finalizer and other modules use
  // `import { promises as fsPromises } from 'node:fs'`. Bind async impls via
  // `vi.fn(async () => ...)` so vi.clearAllMocks preserves them.
  promises: {
    readFile: vi.fn(async () => ''),
    writeFile: vi.fn(async () => undefined),
    mkdir: vi.fn(async () => undefined),
    appendFile: vi.fn(async () => undefined),
    access: vi.fn(async () => undefined),
    stat: vi.fn(async () => ({ size: 0 })),
  },
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

vi.mock('../../src/orchestra/tmux.js', () => ({
  ensureSession: vi.fn(),
  spawnWorker: vi.fn(),
  killWorker: vi.fn(),
  listWorkers: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/monitor/auditor.js', () => ({
  resetDashboard: vi.fn(),
  updateDashboard: vi.fn(),
  detectDeadlocks: vi.fn().mockReturnValue([]),
  startScanLoop: vi.fn().mockReturnValue(setInterval(() => {}, 99999)),
  writeScanToDashboard: vi.fn(),
}));

vi.mock('../../src/core/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/utils.js')>();
  return {
    ...actual,
    countBrainLines: vi.fn().mockReturnValue(100),
    getNextSprintId: vi.fn().mockReturnValue('sprint-001'),
    updateLastSprintId: vi.fn(),
    parseDebtTable: vi.fn().mockReturnValue([]),
  };
});

vi.mock('../../src/agents/worker.js', () => ({
  updateTaskStatus: vi.fn(),
  releaseAllLocks: vi.fn().mockReturnValue(0),
  createWorkerStateMachine: vi.fn(() => ({
    transition: vi.fn(),
    canTransition: vi.fn(() => true),
    getState: vi.fn(() => 'SPAWNING'),
    stop: vi.fn(),
  })),
  removeWorkerStateMachine: vi.fn(() => true),
  isWorkerStoppable: vi.fn(() => true),
}));

vi.mock('../../src/orchestra/planner.js', () => ({
  callBrainPlanner: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/core/system-profile.js', () => ({
  getSystemProfile: vi.fn().mockReturnValue({
    platform: 'linux',
    hasTmux: true,
    recommendedMaxWorkers: 4,
  }),
}));

vi.mock('../../src/orchestra/result-watcher.js', () => ({
  createResultWatcher: vi.fn().mockReturnValue({
    waitForChange: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
  }),
}));

vi.mock('../../src/orchestra/debt-manager.js', () => ({
  handleEvaluation: vi.fn(),
  handleCrossDependencies: vi.fn(),
  escalateDebt: vi.fn(),
  resolveDebt: vi.fn(),
  runDecay: vi.fn(),
  decay: vi.fn(),
}));

vi.mock('../../src/orchestra/sprint-reporter.js', () => ({
  writeRetrospective: vi.fn(),
  writeSprintLog: vi.fn(),
  calculateMetrics: vi.fn().mockReturnValue({
    totalTasks: 1,
    completedTasks: 1,
    techDebtTasks: 0,
    noGoTasks: 0,
    durationMs: 1000,
    coveragePercent: 95,
    noGoRate: 0,
    newDebtCount: 0,
    resolvedDebtCount: 0,
    totalOpenDebt: 0,
    boundaryViolations: 0,
    crossAssignments: 0,
    contextLinesUsed: 0,
  }),
  updateProjectDocs: vi.fn(),
  trimMemoryWithHeader: vi.fn(),
  compareWithPreviousSprint: vi.fn(),
  readPreviousSprintMetrics: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/agents/worker-ipc.js', () => {
  const mockRegistry = {
    register: vi.fn(),
    unregister: vi.fn(),
    get: vi.fn().mockReturnValue(null),
    list: vi.fn().mockReturnValue([]),
    broadcast: vi.fn(),
    closeAll: vi.fn(),
  };
  return {
    ChannelRegistry: vi.fn().mockImplementation(() => mockRegistry),
  };
});

// ─── Import after mocks ───────────────────────────────────────────────
import { evaluateResultSync, isDocTask } from '../../src/orchestra/brain.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '001-001',
    title: 'Test task',
    description: 'A test task',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'minor' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-001',
    createdAt: '2026-03-20T00:00:00.000Z',
    ...overrides,
  };
}

function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '001-001',
    workerId: 'w-001-001',
    filesChanged: ['src/test.ts'],
    linesAdded: 50,
    linesRemoved: 10,
    testsPassed: true,
    coverage: 95,
    selfAssessment: 'DONE',
    notes: 'All good',
    ...overrides,
  };
}

/**
 * Builds a vitest coverage JSON string where line coverage = pct.
 */
function makeVitestJson(linePct: number): string {
  return JSON.stringify({
    total: {
      lines: { pct: linePct, total: 100, covered: linePct },
      statements: { pct: linePct, total: 100, covered: linePct },
      functions: { pct: linePct, total: 100, covered: linePct },
      branches: { pct: linePct, total: 100, covered: linePct },
    },
  });
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('evaluateResultSync — basic evaluation (no vitest output)', () => {
  it('returns NO_GO when self-assessment is NO_GO', () => {
    const task = makeTask();
    const result = makeResult({ selfAssessment: 'NO_GO' });
    expect(evaluateResultSync(result, task)).toBe(TaskEvaluation.NO_GO);
  });

  it('returns GO_WITH_TECH_DEBT when self-assessment is GO_WITH_TECH_DEBT', () => {
    const task = makeTask();
    const result = makeResult({ selfAssessment: 'GO_WITH_TECH_DEBT' });
    expect(evaluateResultSync(result, task)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('returns NO_GO when testsPassed is false', () => {
    const task = makeTask();
    const result = makeResult({ testsPassed: false });
    expect(evaluateResultSync(result, task)).toBe(TaskEvaluation.NO_GO);
  });

  it('returns DONE for doc task regardless of coverage', () => {
    const task = makeTask({ scope: { directories: ['docs/'], filesRead: [], filesWrite: [] } });
    const result = makeResult({ coverage: 0, testsPassed: true });
    expect(evaluateResultSync(result, task)).toBe(TaskEvaluation.DONE);
  });

  it('returns DONE when coverage >= 90 (no vitest output)', () => {
    const task = makeTask();
    const result = makeResult({ coverage: 95 });
    expect(evaluateResultSync(result, task)).toBe(TaskEvaluation.DONE);
  });

  it('returns GO_WITH_TECH_DEBT when coverage < 90 (no vitest output)', () => {
    const task = makeTask();
    const result = makeResult({ coverage: 85 });
    expect(evaluateResultSync(result, task)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });
});

describe('evaluateResultSync — coverage validation with vitest JSON output', () => {
  it('returns DONE when reported coverage matches actual (within 5%)', () => {
    const task = makeTask();
    // reported: 95, actual: 94 — diff 1% — valid
    const result = makeResult({ coverage: 95 });
    const vitestJson = makeVitestJson(94);
    expect(evaluateResultSync(result, task, vitestJson)).toBe(TaskEvaluation.DONE);
  });

  it('returns DONE when reported coverage exactly matches actual', () => {
    const task = makeTask();
    const result = makeResult({ coverage: 92 });
    const vitestJson = makeVitestJson(92);
    expect(evaluateResultSync(result, task, vitestJson)).toBe(TaskEvaluation.DONE);
  });

  it('returns GO_WITH_TECH_DEBT when reported coverage differs from actual by > 5%', () => {
    const task = makeTask();
    // reported: 95, actual: 80 — diff 15% — WARNING
    const result = makeResult({ coverage: 95 });
    const vitestJson = makeVitestJson(80);
    expect(evaluateResultSync(result, task, vitestJson)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('returns GO_WITH_TECH_DEBT when worker over-reports coverage significantly', () => {
    const task = makeTask();
    // reported: 98, actual: 60 — diff 38% — WARNING
    const result = makeResult({ coverage: 98 });
    const vitestJson = makeVitestJson(60);
    expect(evaluateResultSync(result, task, vitestJson)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('returns GO_WITH_TECH_DEBT when vitest JSON cannot be parsed', () => {
    const task = makeTask();
    const result = makeResult({ coverage: 95 });
    // Invalid JSON — validateWorkerCoverage returns WARNING
    expect(evaluateResultSync(result, task, 'not-valid-json')).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('returns DONE for doc task even with mismatched vitest JSON (doc tasks skip validation)', () => {
    const task = makeTask({ scope: { directories: ['docs/'], filesRead: [], filesWrite: [] } });
    const result = makeResult({ coverage: 95, testsPassed: true });
    const vitestJson = makeVitestJson(10); // big mismatch, but doc task — irrelevant
    // Doc task check runs before coverage validation
    expect(evaluateResultSync(result, task, vitestJson)).toBe(TaskEvaluation.DONE);
  });

  it('returns DONE when vitest output is empty string (no validation, falls through to coverage check)', () => {
    const task = makeTask();
    // empty string → vitestJsonOutput is provided but empty → validateWorkerCoverage uses
    // no vitest output path → returns OK → falls through to coverage < 90 check
    const result = makeResult({ coverage: 95 });
    expect(evaluateResultSync(result, task, '')).toBe(TaskEvaluation.DONE);
  });

  it('returns GO_WITH_TECH_DEBT when coverage < 90 even when vitest matches (< 90 fallback)', () => {
    const task = makeTask();
    // reported: 85, actual: 85 — valid match, but 85 < 90 threshold
    const result = makeResult({ coverage: 85 });
    const vitestJson = makeVitestJson(85);
    expect(evaluateResultSync(result, task, vitestJson)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('returns NO_GO when self-assessment is NO_GO even with valid vitest JSON', () => {
    const task = makeTask();
    const result = makeResult({ selfAssessment: 'NO_GO', coverage: 95 });
    const vitestJson = makeVitestJson(95);
    expect(evaluateResultSync(result, task, vitestJson)).toBe(TaskEvaluation.NO_GO);
  });

  it('returns NO_GO when testsPassed false even with valid vitest JSON', () => {
    const task = makeTask();
    const result = makeResult({ testsPassed: false, coverage: 95 });
    const vitestJson = makeVitestJson(95);
    expect(evaluateResultSync(result, task, vitestJson)).toBe(TaskEvaluation.NO_GO);
  });

  it('validates coverage within 5% boundary — exactly 5% diff is still valid', () => {
    const task = makeTask();
    // reported: 90, actual: 95 — diff 5% (boundary) — valid
    const result = makeResult({ coverage: 90 });
    const vitestJson = makeVitestJson(95);
    expect(evaluateResultSync(result, task, vitestJson)).toBe(TaskEvaluation.DONE);
  });

  it('validates coverage with diff just over 5% — should be GO_WITH_TECH_DEBT', () => {
    const task = makeTask();
    // reported: 90, actual: 96 — diff 6% > 5% — WARNING
    const result = makeResult({ coverage: 90 });
    const vitestJson = makeVitestJson(96);
    expect(evaluateResultSync(result, task, vitestJson)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });
});

describe('isDocTask — integration', () => {
  it('returns true for docs-only scope', () => {
    const task = makeTask({ scope: { directories: ['docs/'], filesRead: [], filesWrite: [] } });
    expect(isDocTask(task)).toBe(true);
  });

  it('returns false for src scope', () => {
    const task = makeTask({ scope: { directories: ['src/'], filesRead: [], filesWrite: [] } });
    expect(isDocTask(task)).toBe(false);
  });
});
