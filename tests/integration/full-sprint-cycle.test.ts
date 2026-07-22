/**
 * Full Sprint Cycle Integration Test
 *
 * Tests the complete sprint lifecycle: DIRECTIVES → plan → spawn → execute →
 * evaluate → fix → retro → decay → cleanup.
 *
 * Uses real filesystem (OS temp dirs), mocks only tmux and child_process.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  TaskStatus, TaskEvaluation, SprintPhase, SprintStatus, DebtPriority,
} from '../../src/core/types.js';
import type {
  Task, TaskResult, Sprint, SprintMetrics, DebtItem, ResolvedConfig,
} from '../../src/core/types.js';
import {
  BRAIN_DIR, TASKS_DIR, LOCKS_DIR, DECKENT_DIR,
  DIRECTIVES_FILE, DASHBOARD_FILE,
  MEMORY_FILE, DECISIONS_FILE, DEBT_FILE, PATTERNS_FILE, RETRO_FILE,
  SPRINTS_DIR, DEBT_TABLE_HEADER, MEMORY_DB_FILE,
} from '../../src/core/constants.js';

// ─── Mocks: ONLY tmux, child_process ───────────────────────────────

vi.mock('../../src/orchestra/tmux.js', () => ({
  ensureSession: vi.fn(),
  spawnWorker: vi.fn(),
  killWorker: vi.fn(),
  listWorkers: vi.fn().mockReturnValue([]),
  startAuditor: vi.fn(),
  attach: vi.fn(),
  destroy: vi.fn(),
  isSessionActive: vi.fn().mockReturnValue(false),
  sendKeys: vi.fn(),
  TmuxError: class TmuxError extends Error {
    command?: string;
    constructor(m: string, c?: string) { super(m); this.name = 'TmuxError'; this.command = c; }
  },
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn().mockReturnValue({
    status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
  }),
}));

// ── MemoryStore mock for DB-first code paths ─────────────────────
const mockMemStore = {
  getById: vi.fn().mockReturnValue(null),
  getByType: vi.fn().mockReturnValue([]),
  insert: vi.fn().mockImplementation((input) => ({ ...input, metadata: JSON.stringify(input.metadata ?? {}), tag_text: (input.tags ?? []).join(' '), status: input.status ?? 'active', priority: input.priority ?? 'normal', sprint_id: input.sprint_id ?? null, sprint_num: input.sprint_num ?? 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null })),
  upsert: vi.fn().mockImplementation((input) => ({ ...input, metadata: JSON.stringify(input.metadata ?? {}), tag_text: (input.tags ?? []).join(' '), status: input.status ?? 'active', priority: input.priority ?? 'normal' })),
  softDelete: vi.fn(), totalCount: vi.fn().mockReturnValue(0), countByType: vi.fn(),
  decay: vi.fn(), close: vi.fn(), getRawDb: vi.fn(),
  getRelationsFrom: vi.fn().mockReturnValue([]), getRelationsTo: vi.fn().mockReturnValue([]),
  getTagsForEntry: vi.fn().mockReturnValue([]), getByTags: vi.fn().mockReturnValue([]),
  getHistory: vi.fn().mockReturnValue([]), restore: vi.fn(), getSchemaVersion: vi.fn().mockReturnValue(1),
};
vi.mock('../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn().mockImplementation(() => mockMemStore),
}));


import { spawnSync } from 'node:child_process';
import { spawnWorker } from '../../src/orchestra/tmux.js';

// ─── Real Imports ──────────────────────────────────────────────────

import {
  readContext, evaluateResultSync, handleEvaluation, handleCrossDependencies,
  escalateDebt, planSprint, writeRetrospective, writeSprintLog,
  calculateMetrics, decay, cleanup, runDecay, resolveDebt,
} from '../../src/orchestra/brain.js';
import {
  acquireLock, releaseLock, releaseAllLocks, writeResult,
} from '../../src/agents/worker.js';

// ─── Helpers ───────────────────────────────────────────────────────

function setupProjectDir(root: string): void {
  mkdirSync(join(root, DECKENT_DIR), { recursive: true });
  mkdirSync(join(root, BRAIN_DIR, SPRINTS_DIR), { recursive: true });
  mkdirSync(join(root, TASKS_DIR), { recursive: true });
  mkdirSync(join(root, LOCKS_DIR), { recursive: true });
  mkdirSync(join(root, '.claude', 'rules'), { recursive: true });

  writeFileSync(join(root, DECKENT_DIR, 'config.json'), JSON.stringify({ mode: 'max_plan' }));
  writeFileSync(join(root, BRAIN_DIR, MEMORY_FILE), '# Learned Patterns\n');
  writeFileSync(join(root, BRAIN_DIR, DECISIONS_FILE), '# Architecture Decisions\n');
  writeFileSync(join(root, BRAIN_DIR, DEBT_FILE), `# Tech Debt\n\n${DEBT_TABLE_HEADER}\n`);
  writeFileSync(join(root, BRAIN_DIR, PATTERNS_FILE), '[]');
  writeFileSync(join(root, BRAIN_DIR, RETRO_FILE), '# Sprint Retrospective\n');
  // Create memory.db stub so getMemoryStore() finds it and uses MemoryStore mock
  writeFileSync(join(root, BRAIN_DIR, MEMORY_DB_FILE), '');
}

function makeTestTask(id: string, sprintId: string, overrides?: Partial<Task>): Task {
  return {
    id, title: `Task ${id}`, description: `Description for ${id}`,
    model: 'claude-sonnet-5', effort: 'normal', priority: 'NORMAL', reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [], goNogo: { goCriteria: 'Tests pass', noGoCriteria: 'Build fails', techDebtAcceptable: 'Minor' },
    status: TaskStatus.PENDING, sprintId, createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function writeTaskFile(root: string, task: Task): void {
  writeFileSync(join(root, TASKS_DIR, `task-${task.id}.json`), JSON.stringify(task, null, 2));
}

function makeTestResult(taskId: string, overrides?: Partial<TaskResult>): TaskResult {
  return {
    taskId, workerId: `w-${taskId}`,
    filesChanged: ['src/index.ts'], linesAdded: 50, linesRemoved: 10,
    testsPassed: true, coverage: 95, selfAssessment: 'DONE', notes: 'All good',
    completedAt: new Date().toISOString(), durationMs: 5000,
    ...overrides,
  };
}

function makeConfig(root: string): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 3, brain_model: 'claude-opus-4-8', default_model: 'claude-sonnet-5',
      haiku_allowed: true,
    },
    modes: {} as ResolvedConfig['modes'],
    language: 'en', projectName: 'test-project', projectRoot: root, version: '0.1.0',
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Full Sprint Cycle: DONE scenario
// ═══════════════════════════════════════════════════════════════════════

describe('Full sprint cycle — DONE scenario', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-full-done-'));
    setupProjectDir(root);
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('completes full cycle: plan → evaluate → retro → decay → cleanup', () => {
    const sprintId = 'sprint-001';

    // Step 1: Create tasks (simulating planSprint output)
    const task1 = makeTestTask('001-001', sprintId);
    const task2 = makeTestTask('001-002', sprintId);
    writeTaskFile(root, task1);
    writeTaskFile(root, task2);

    const sprint: Sprint = {
      id: sprintId, number: 1, status: SprintStatus.EVALUATING,
      phase: SprintPhase.EVALUATE, tasks: [task1, task2], workers: ['w-001-001', 'w-001-002'],
      startedAt: new Date().toISOString(),
    };

    // Step 2: Write result files (simulating worker output)
    writeResult(root, makeTestResult('001-001'));
    writeResult(root, makeTestResult('001-002'));

    // Step 3: Evaluate results
    const evaluations = new Map<string, TaskEvaluation>();
    const results: TaskResult[] = [];

    for (const task of sprint.tasks) {
      const resultPath = join(root, TASKS_DIR, `task-${task.id}.result`);
      const result = JSON.parse(readFileSync(resultPath, 'utf-8')) as TaskResult;
      results.push(result);
      const evaluation = evaluateResultSync(result, task);
      handleEvaluation(root, task, evaluation, result);
      evaluations.set(task.id, evaluation);
    }

    expect(evaluations.get('001-001')).toBe(TaskEvaluation.DONE);
    expect(evaluations.get('001-002')).toBe(TaskEvaluation.DONE);

    // Step 4: Write retrospective
    sprint.completedAt = new Date().toISOString();
    const metrics = calculateMetrics(sprint, evaluations, results);
    sprint.metrics = metrics;

    writeRetrospective(root, sprint, evaluations, metrics);
    writeSprintLog(root, sprint, metrics);

    // B8: writeRetrospective persists the retro + learnings to memory.db
    // (no .brain/RETRO.md / MEMORY.md files). DB persistence is covered by
    // tests/orchestra/write-retrospective.test.ts.

    // Verify sprint log
    expect(existsSync(join(root, BRAIN_DIR, SPRINTS_DIR, `${sprintId}.md`))).toBe(true);

    // Step 5: Decay (under budget, should be no-op)
    decay(root, sprintId);

    // Step 6: Cleanup
    cleanup(root, sprint);

    // Heartbeat files should be gone
    const hbFiles = readdirSync(join(root, TASKS_DIR)).filter(f => f.endsWith('.hb'));
    expect(hbFiles.length).toBe(0);

    // Verify metrics
    expect(metrics.totalTasks).toBe(2);
    expect(metrics.completedTasks).toBe(2);
    expect(metrics.noGoTasks).toBe(0);
    expect(metrics.techDebtTasks).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Full Sprint Cycle: NO_GO → fix task scenario
// ═══════════════════════════════════════════════════════════════════════

describe('Full sprint cycle — NO_GO scenario', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-full-nogo-'));
    setupProjectDir(root);
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('NO_GO creates fix task', () => {
    const sprintId = 'sprint-002';
    const task = makeTestTask('002-001', sprintId, { assignedWorker: 'w-002-001' });
    writeTaskFile(root, task);

    const result = makeTestResult('002-001', {
      testsPassed: false, selfAssessment: 'NO_GO', notes: 'Build failure',
    });
    writeResult(root, result);

    const evaluation = evaluateResultSync(result, task);
    expect(evaluation).toBe(TaskEvaluation.NO_GO);

    handleEvaluation(root, task, evaluation, result);

    // Fix task should be created
    const fixPath = join(root, TASKS_DIR, 'task-002-001-fix.json');
    expect(existsSync(fixPath)).toBe(true);
    const fixTask = JSON.parse(readFileSync(fixPath, 'utf-8')) as Task;
    expect(fixTask.isPriorityFix).toBe(true);
    expect(fixTask.fixForTaskId).toBe('002-001');
    expect(fixTask.priority).toBe('CRITICAL');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Full Sprint Cycle: GO_WITH_TECH_DEBT → debt management
// ═══════════════════════════════════════════════════════════════════════

describe('Full sprint cycle — GO_WITH_TECH_DEBT scenario', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-full-debt-'));
    setupProjectDir(root);
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('GO_WITH_TECH_DEBT inserts debt entry in DB', () => {
    const sprintId = 'sprint-003';
    const task = makeTestTask('003-001', sprintId, { assignedWorker: 'w-003-001' });
    writeTaskFile(root, task);

    const result = makeTestResult('003-001', {
      coverage: 80, selfAssessment: 'GO_WITH_TECH_DEBT', notes: 'Minor coverage gap',
    });
    writeResult(root, result);

    const evaluation = evaluateResultSync(result, task);
    expect(evaluation).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);

    handleEvaluation(root, task, evaluation, result);

    // DB should have insert call with debt entry
    expect(mockMemStore.insert).toHaveBeenCalledWith(expect.objectContaining({
      id: 'debt-003-001',
      type: 'debt',
      status: 'active',
      priority: 'normal',
    }));
  });

  it('debt escalation calls upsert with incremented sprintsOpen', () => {
    // Seed DB with active debt entry
    mockMemStore.getByType.mockReturnValue([{
      id: 'debt-003-001', type: 'debt', title: 'debt', content: '', source: 'brain',
      summary: null, status: 'active', priority: 'normal', sprint_id: 'sprint-003',
      sprint_num: 3, tag_text: '', metadata: JSON.stringify({ sprintsOpen: 0 }),
      created_at: '', updated_at: '', deleted_at: null,
    }]);

    escalateDebt(root);

    expect(mockMemStore.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ priority: expect.any(String) }),
      'brain',
    );
  });

  it('resolveDebt marks debt as resolved in DB', () => {
    // Seed DB with active debt entry
    mockMemStore.getById.mockReturnValue({
      id: 'debt-003-001', type: 'debt', title: 'debt', content: '', source: 'brain',
      summary: null, status: 'active', priority: 'high', sprint_id: 'sprint-003',
      sprint_num: 3, tag_text: '', metadata: JSON.stringify({ sprintsOpen: 2 }),
      created_at: '', updated_at: '', deleted_at: null,
    });

    const resolved = resolveDebt(root, 'debt-003-001', 'sprint-004');
    expect(resolved).toBe(true);

    expect(mockMemStore.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'resolved' }),
      'brain',
    );
  });

  it('calculateMetrics with debt counts resolved and open', () => {
    const sprint: Sprint = {
      id: 'sprint-004', number: 4, status: SprintStatus.COMPLETE,
      phase: SprintPhase.COMPLETE, tasks: [], workers: [],
      startedAt: new Date().toISOString(), completedAt: new Date().toISOString(),
    };
    const debt: DebtItem[] = [
      { id: 'debt-003-001', description: 'test', originTaskId: '003-001', originSprintId: 'sprint-003',
        priority: DebtPriority.HIGH, sprintsOpen: 2, resolved: true, resolvedInSprintId: 'sprint-004', createdAt: '' },
      { id: 'debt-003-002', description: 'open', originTaskId: '003-002', originSprintId: 'sprint-003',
        priority: DebtPriority.NORMAL, sprintsOpen: 1, resolved: false, createdAt: '' },
    ];
    const metrics = calculateMetrics(sprint, new Map(), [], debt);
    expect(metrics.resolvedDebtCount).toBe(1);
    expect(metrics.totalOpenDebt).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// runDecay integration with real files
// ═══════════════════════════════════════════════════════════════════════

describe('runDecay integration', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-decay-'));
    setupProjectDir(root);
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('force decay calls store.decay via DB', () => {
    mockMemStore.totalCount.mockReturnValueOnce(1000).mockReturnValueOnce(500);

    const result = runDecay(root, 'sprint-010', { force: true });
    expect(mockMemStore.decay).toHaveBeenCalled();
    expect(result.linesBefore).toBe(1000);
  });

  it('force decay returns result with linesBefore and linesAfter', () => {
    mockMemStore.totalCount.mockReturnValueOnce(800).mockReturnValueOnce(400);

    const result = runDecay(root, 'sprint-010', { force: true });
    expect(result.linesBefore).toBe(800);
    expect(result.linesAfter).toBe(400);
  });

  it('force decay always runs even when under budget', () => {
    mockMemStore.totalCount.mockReturnValueOnce(10).mockReturnValueOnce(10);

    const result = runDecay(root, 'sprint-010', { force: true });
    expect(mockMemStore.decay).toHaveBeenCalled();
    expect(result.linesBefore).toBe(10);
  });

  it('no-op when force=false and under budget', () => {
    const result = runDecay(root, 'sprint-010', { force: false });
    expect(result.linesBefore).toBe(result.linesAfter);
    expect(result.archivedSprints).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Cross-dependency scenario
// ═══════════════════════════════════════════════════════════════════════

describe('Cross-dependency integration', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-xdep-'));
    setupProjectDir(root);
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('handleCrossDependencies creates fix for dependency of NO_GO task', () => {
    const sprintId = 'sprint-005';
    const taskA = makeTestTask('005-001', sprintId, { dependencies: ['005-002'] });
    const taskB = makeTestTask('005-002', sprintId);
    writeTaskFile(root, taskA);
    writeTaskFile(root, taskB);

    const sprint: Sprint = {
      id: sprintId, number: 5, status: SprintStatus.EVALUATING,
      phase: SprintPhase.EVALUATE, tasks: [taskA, taskB], workers: [],
    };

    const evaluations = new Map<string, TaskEvaluation>([
      ['005-001', TaskEvaluation.NO_GO],
      ['005-002', TaskEvaluation.DONE],
    ]);

    handleCrossDependencies(root, sprint, evaluations);

    // B should get a cross-fix task since A (which depends on B) is NO_GO
    const xfixPath = join(root, TASKS_DIR, 'task-005-002-xfix.json');
    expect(existsSync(xfixPath)).toBe(true);
    const xfixTask = JSON.parse(readFileSync(xfixPath, 'utf-8')) as Task;
    expect(xfixTask.isPriorityFix).toBe(true);
  });
});
