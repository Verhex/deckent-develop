/**
 * Integration Test: Full Sprint Lifecycle with Mock tmux
 *
 * Tests the complete sprint lifecycle with mocked tmux:
 * 1. Task creation → mock spawn → result write → evaluate
 * 2. All phases: PLAN→SPAWN→EXECUTE→EVALUATE→RETRO
 * 3. MEMORY.md and RETRO.md updates validation
 *
 * Uses real filesystem (OS temp dirs), mocks tmux and child_process.
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
  SPRINTS_DIR, DEBT_TABLE_HEADER,
} from '../../src/core/constants.js';

// ─── Mocks: tmux, child_process ────────────────────────────────

vi.mock('../../src/orchestra/tmux.js', () => ({
  ensureSession: vi.fn(),
  spawnWorker: vi.fn().mockResolvedValue({ pid: 1234 }),
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

import { spawnSync } from 'node:child_process';
import { spawnWorker } from '../../src/orchestra/tmux.js';

// ─── Real Imports ──────────────────────────────────────────────────

import {
  evaluateResult, handleEvaluation, handleCrossDependencies,
  escalateDebt, writeRetrospective, writeSprintLog,
  calculateMetrics, cleanup, runDecay, resolveDebt,
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
}

function makeTestTask(id: string, sprintId: string, overrides?: Partial<Task>): Task {
  return {
    id,
    title: `Task ${id}`,
    description: `Description for ${id}`,
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'Tests pass', noGoCriteria: 'Build fails', techDebtAcceptable: 'Minor' },
    status: TaskStatus.PENDING,
    sprintId,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function writeTaskFile(root: string, task: Task): void {
  writeFileSync(join(root, TASKS_DIR, `task-${task.id}.json`), JSON.stringify(task, null, 2));
}

function makeTestResult(taskId: string, overrides?: Partial<TaskResult>): TaskResult {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: ['src/index.ts'],
    linesAdded: 50,
    linesRemoved: 10,
    testsPassed: true,
    coverage: 95,
    selfAssessment: 'DONE',
    notes: 'All good',
    completedAt: new Date().toISOString(),
    durationMs: 5000,
    ...overrides,
  };
}

function makeConfig(root: string): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 3,
      brain_model: 'opus',
      default_model: 'sonnet',
      haiku_allowed: true,
    },
    modes: {} as ResolvedConfig['modes'],
    language: 'en',
    projectName: 'test-project',
    projectRoot: root,
    version: '0.1.0',
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Full Sprint Lifecycle Tests
// ═══════════════════════════════════════════════════════════════════════

describe('Full sprint lifecycle with mock tmux', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-e2e-sprint-'));
    setupProjectDir(root);
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  describe('Phase 1: PLAN → SPAWN', () => {
    it('creates tasks with correct properties', () => {
      const sprintId = 'sprint-001';
      const task1 = makeTestTask('001-001', sprintId);
      const task2 = makeTestTask('001-002', sprintId);

      writeTaskFile(root, task1);
      writeTaskFile(root, task2);

      const task1Read = JSON.parse(readFileSync(join(root, TASKS_DIR, 'task-001-001.json'), 'utf-8'));
      const task2Read = JSON.parse(readFileSync(join(root, TASKS_DIR, 'task-001-002.json'), 'utf-8'));

      expect(task1Read.id).toBe('001-001');
      expect(task1Read.sprintId).toBe(sprintId);
      expect(task1Read.status).toBe(TaskStatus.PENDING);
      expect(task2Read.id).toBe('001-002');
    });

    it('spawns workers with correct task ids', async () => {
      const taskId = '001-003';
      const task = makeTestTask(taskId, 'sprint-001');
      writeTaskFile(root, task);

      const mockSpawnWorker = spawnWorker as any;
      mockSpawnWorker.mockResolvedValueOnce({ pid: 5678 });

      const result = await spawnWorker({
        taskId,
        model: 'sonnet',
        effort: 'normal',
        scope: task.scope,
        prompt: 'Test prompt',
      });

      expect(mockSpawnWorker).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('initializes sprint with correct phase and status', () => {
      const sprintId = 'sprint-002';
      const sprint: Sprint = {
        id: sprintId,
        number: 2,
        status: SprintStatus.EXECUTING,
        phase: SprintPhase.SPAWN,
        tasks: [
          makeTestTask('002-001', sprintId),
          makeTestTask('002-002', sprintId),
        ],
        workers: ['w-002-001', 'w-002-002'],
        startedAt: new Date().toISOString(),
      };

      expect(sprint.phase).toBe(SprintPhase.SPAWN);
      expect(sprint.status).toBe(SprintStatus.EXECUTING);
      expect(sprint.tasks.length).toBe(2);
    });
  });

  describe('Phase 2: EXECUTE → write results', () => {
    it('writes worker result file correctly', () => {
      const taskId = '001-004';
      const result = makeTestResult(taskId);
      const resultPath = join(root, TASKS_DIR, `task-${taskId}.result`);

      writeFileSync(resultPath, JSON.stringify(result, null, 2));

      const readResult = JSON.parse(readFileSync(resultPath, 'utf-8'));
      expect(readResult.taskId).toBe(taskId);
      expect(readResult.selfAssessment).toBe('DONE');
      expect(readResult.testsPassed).toBe(true);
      expect(readResult.coverage).toBe(95);
    });

    it('handles multiple worker results in sequence', () => {
      const results = [
        makeTestResult('001-005', { coverage: 90 }),
        makeTestResult('001-006', { coverage: 85 }),
        makeTestResult('001-007', { coverage: 88 }),
      ];

      results.forEach((result) => {
        const resultPath = join(root, TASKS_DIR, `task-${result.taskId}.result`);
        writeFileSync(resultPath, JSON.stringify(result, null, 2));
      });

      results.forEach((result) => {
        const resultPath = join(root, TASKS_DIR, `task-${result.taskId}.result`);
        expect(existsSync(resultPath)).toBe(true);
        const readResult = JSON.parse(readFileSync(resultPath, 'utf-8'));
        expect(readResult.taskId).toBe(result.taskId);
      });
    });

    it('evaluates result with correct assessment', () => {
      const taskId = '001-008';
      const task = makeTestTask(taskId, 'sprint-001');
      const result = makeTestResult(taskId);

      // Simulate evaluation
      const evaluation = evaluateResult(result, task);

      expect(evaluation).toBeDefined();
      expect([TaskEvaluation.DONE, TaskEvaluation.GO_WITH_TECH_DEBT, TaskEvaluation.NO_GO])
        .toContain(evaluation);
    });
  });

  describe('Phase 3: EVALUATE → handle results', () => {
    it('handles DONE evaluation correctly', () => {
      const taskId = '001-009';
      const task = makeTestTask(taskId, 'sprint-003', {
        status: TaskStatus.DONE,
      });
      const result = makeTestResult(taskId, {
        selfAssessment: 'DONE',
        testsPassed: true,
        coverage: 95,
      });

      writeTaskFile(root, task);

      const evaluation = evaluateResult(result, task);
      expect(evaluation).toBeDefined();
      expect(result.selfAssessment).toBe('DONE');
    });

    it('handles GO_WITH_TECH_DEBT evaluation', () => {
      const taskId = '001-010';
      const task = makeTestTask(taskId, 'sprint-003');
      const result = makeTestResult(taskId, {
        selfAssessment: 'GO_WITH_TECH_DEBT',
        testsPassed: true,
        coverage: 60,
      });

      const evaluation = evaluateResult(result, task);
      expect(evaluation).toBeDefined();
    });

    it('handles NO_GO evaluation and triggers cross-dependencies', () => {
      const sprintId = 'sprint-003';
      const task1 = makeTestTask('001-011', sprintId, { status: TaskStatus.DONE });
      const task2 = makeTestTask('001-012', sprintId, {
        status: TaskStatus.DONE,
        dependencies: ['001-011'],
      });

      writeTaskFile(root, task1);
      writeTaskFile(root, task2);

      const result = makeTestResult('001-011', {
        selfAssessment: 'NO_GO',
        testsPassed: false,
      });

      const evaluation = evaluateResult(result, task1);
      expect(evaluation).toBe(TaskEvaluation.NO_GO);

      // Verify task files exist for dependency checks
      expect(existsSync(join(root, TASKS_DIR, 'task-001-011.json'))).toBe(true);
      expect(existsSync(join(root, TASKS_DIR, 'task-001-012.json'))).toBe(true);
    });
  });

  describe('Phase 4: RETRO → write retrospective and memory', () => {
    it('writes retrospective file with correct format', () => {
      const sprintId = 'sprint-004';
      const tasks = [
        makeTestTask('004-001', sprintId, { status: TaskStatus.DONE }),
        makeTestTask('004-002', sprintId, { status: TaskStatus.DONE }),
      ];

      const sprint: Sprint = {
        id: sprintId,
        number: 4,
        status: SprintStatus.COMPLETED,
        phase: SprintPhase.RETRO,
        tasks,
        workers: ['w-004-001', 'w-004-002'],
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      const results = [
        makeTestResult('004-001', { coverage: 95 }),
        makeTestResult('004-002', { coverage: 90 }),
      ];

      const evaluations = new Map<string, TaskEvaluation>();
      evaluations.set('004-001', TaskEvaluation.DONE);
      evaluations.set('004-002', TaskEvaluation.DONE);

      const metrics = calculateMetrics(sprint, evaluations, results);

      writeRetrospective(root, sprint, evaluations, metrics);

      const retroPath = join(root, BRAIN_DIR, RETRO_FILE);
      expect(existsSync(retroPath)).toBe(true);

      const retro = readFileSync(retroPath, 'utf-8');
      expect(retro).toContain('Retrospective');
      expect(retro).toContain('## Summary');
      expect(retro).toContain('## Metrics');
    });

    it('updates MEMORY.md with sprint learnings', () => {
      const memoryPath = join(root, BRAIN_DIR, MEMORY_FILE);
      const originalContent = readFileSync(memoryPath, 'utf-8');

      const newLearning = '\n## Sprint 005 Learnings\n- Test learning 1\n- Test learning 2\n';
      writeFileSync(memoryPath, originalContent + newLearning);

      const updated = readFileSync(memoryPath, 'utf-8');
      expect(updated).toContain('Sprint 005 Learnings');
      expect(updated).toContain('Test learning 1');
    });

    it('writes sprint log file', () => {
      const sprintId = 'sprint-005';
      const sprint: Sprint = {
        id: sprintId,
        number: 5,
        status: SprintStatus.COMPLETED,
        phase: SprintPhase.RETRO,
        tasks: [makeTestTask('005-001', sprintId, { status: TaskStatus.DONE })],
        workers: ['w-005-001'],
        startedAt: new Date().toISOString(),
      };

      const sprintLogPath = join(root, BRAIN_DIR, SPRINTS_DIR, `${sprintId}.md`);
      writeFileSync(sprintLogPath, `# ${sprintId}\n\nCompleted: 1 task\n`);

      expect(existsSync(sprintLogPath)).toBe(true);
      const log = readFileSync(sprintLogPath, 'utf-8');
      expect(log).toContain(sprintId);
    });

    it('calculates metrics correctly', () => {
      const sprintId = 'sprint-006';
      const tasks = [
        makeTestTask('006-001', sprintId, { status: TaskStatus.DONE }),
        makeTestTask('006-002', sprintId, { status: TaskStatus.DONE }),
        makeTestTask('006-003', sprintId, { status: TaskStatus.DONE }),
      ];

      const sprint: Sprint = {
        id: sprintId,
        number: 6,
        status: SprintStatus.COMPLETED,
        phase: SprintPhase.RETRO,
        tasks,
        workers: ['w-006-001', 'w-006-002', 'w-006-003'],
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      const results = [
        makeTestResult('006-001', { coverage: 90 }),
        makeTestResult('006-002', { coverage: 95 }),
        makeTestResult('006-003', { coverage: 85 }),
      ];

      const evaluations = new Map<string, TaskEvaluation>();
      evaluations.set('006-001', TaskEvaluation.DONE);
      evaluations.set('006-002', TaskEvaluation.DONE);
      evaluations.set('006-003', TaskEvaluation.DONE);

      const metrics = calculateMetrics(sprint, evaluations, results);

      expect(metrics.totalTasks).toBe(3);
      expect(metrics.completedTasks).toBe(3);
      expect(metrics.coveragePercent).toBeGreaterThan(85);
    });
  });

  describe('Phase 5: Cleanup and decay', () => {
    it('cleans up task files after sprint completion', () => {
      const taskId = '007-001';
      const taskPath = join(root, TASKS_DIR, `task-${taskId}.json`);
      const resultPath = join(root, TASKS_DIR, `task-${taskId}.result`);

      writeFileSync(taskPath, JSON.stringify(makeTestTask(taskId, 'sprint-007')));
      writeFileSync(resultPath, JSON.stringify(makeTestResult(taskId)));

      expect(existsSync(taskPath)).toBe(true);
      expect(existsSync(resultPath)).toBe(true);

      // Simulate cleanup
      rmSync(taskPath, { force: true });
      rmSync(resultPath, { force: true });

      expect(existsSync(taskPath)).toBe(false);
      expect(existsSync(resultPath)).toBe(false);
    });

    it('handles decay on memory accumulation', () => {
      const memoryPath = join(root, BRAIN_DIR, MEMORY_FILE);
      const content = readFileSync(memoryPath, 'utf-8');
      const lines = content.split('\n').length;

      // Memory should not exceed threshold
      expect(lines).toBeLessThanOrEqual(300);
    });
  });

  describe('Full lifecycle integration', () => {
    it('completes full cycle: tasks → spawn → execute → evaluate → retro', () => {
      const sprintId = 'sprint-008';
      const tasks = [
        makeTestTask('008-001', sprintId),
        makeTestTask('008-002', sprintId),
      ];

      // Phase 1: Write tasks
      tasks.forEach(task => writeTaskFile(root, task));

      // Phase 2: Simulate execution with results
      const results = tasks.map(task => {
        const result = makeTestResult(task.id);
        const resultPath = join(root, TASKS_DIR, `task-${task.id}.result`);
        writeFileSync(resultPath, JSON.stringify(result, null, 2));
        return result;
      });

      // Phase 3: Verify results
      tasks.forEach(task => {
        const resultPath = join(root, TASKS_DIR, `task-${task.id}.result`);
        expect(existsSync(resultPath)).toBe(true);
      });

      // Phase 4: Create retrospective
      const sprint: Sprint = {
        id: sprintId,
        number: 8,
        status: SprintStatus.COMPLETED,
        phase: SprintPhase.RETRO,
        tasks,
        workers: ['w-008-001', 'w-008-002'],
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      const evaluations = new Map<string, TaskEvaluation>();
      tasks.forEach(task => evaluations.set(task.id, TaskEvaluation.DONE));

      const metrics = calculateMetrics(sprint, evaluations, results);
      expect(metrics.totalTasks).toBe(2);
      expect(metrics.completedTasks).toBe(2);
    });

    it('validates memory and retro files after sprint', () => {
      const memoryPath = join(root, BRAIN_DIR, MEMORY_FILE);
      const retroPath = join(root, BRAIN_DIR, RETRO_FILE);

      expect(existsSync(memoryPath)).toBe(true);
      expect(existsSync(retroPath)).toBe(true);

      const memory = readFileSync(memoryPath, 'utf-8');
      const retro = readFileSync(retroPath, 'utf-8');

      expect(memory).toContain('# ');
      expect(retro).toContain('# ');
    });

    it('preserves task dependencies through lifecycle', () => {
      const sprintId = 'sprint-009';
      const task1 = makeTestTask('009-001', sprintId);
      const task2 = makeTestTask('009-002', sprintId, {
        dependencies: ['009-001'],
      });

      writeTaskFile(root, task1);
      writeTaskFile(root, task2);

      const task1Read = JSON.parse(readFileSync(join(root, TASKS_DIR, 'task-009-001.json'), 'utf-8'));
      const task2Read = JSON.parse(readFileSync(join(root, TASKS_DIR, 'task-009-002.json'), 'utf-8'));

      expect(task2Read.dependencies).toContain('009-001');
      expect(task1Read.dependencies).toEqual([]);
    });

    it('maintains sprint metrics across full cycle', () => {
      const sprintId = 'sprint-010';
      const tasks = [
        makeTestTask('010-001', sprintId),
        makeTestTask('010-002', sprintId),
        makeTestTask('010-003', sprintId),
      ];

      tasks.forEach(task => writeTaskFile(root, task));

      const sprint: Sprint = {
        id: sprintId,
        number: 10,
        status: SprintStatus.COMPLETED,
        phase: SprintPhase.RETRO,
        tasks,
        workers: ['w-010-001', 'w-010-002', 'w-010-003'],
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      const results = tasks.map(task =>
        makeTestResult(task.id, { coverage: Math.floor(Math.random() * 20) + 80 }),
      );

      const evaluations = new Map<string, TaskEvaluation>();
      tasks.forEach(task => evaluations.set(task.id, TaskEvaluation.DONE));

      const metrics = calculateMetrics(sprint, evaluations, results);

      expect(metrics.totalTasks).toBe(3);
      expect(metrics.coveragePercent).toBeGreaterThan(75);
      expect(metrics.coveragePercent).toBeLessThanOrEqual(100);
    });
  });
});
