/**
 * Wave 5 — Integration Tests
 *
 * Real filesystem (OS temp dirs), minimal mocking (tmux, child_process, readline only).
 * Tests cross-module interactions: config → worker → auditor → brain → CLI.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  TaskStatus, TaskEvaluation, SprintPhase, SprintStatus,
  AgentStatus, DebtPriority, AlertLevel,
} from '../../src/core/types.js';
import type {
  Task, TaskResult, TaskPlan, Sprint, SprintMetrics,
  DashboardState, ResolvedConfig, Heartbeat, LockInfo,
  BoundaryViolation,
} from '../../src/core/types.js';
import {
  DECKENT_DIR, BRAIN_DIR, TASKS_DIR, LOCKS_DIR,
  DASHBOARD_FILE, DIRECTIVES_FILE,
  MEMORY_FILE, DECISIONS_FILE, DEBT_FILE, PATTERNS_FILE, RETRO_FILE,
  SPRINTS_DIR, PROJECT_CONFIG_PATH, DEBT_TABLE_HEADER,
} from '../../src/core/constants.js';

// ─── Mocks: ONLY tmux, child_process, readline ─────────────────────

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

vi.mock('node:readline/promises', () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn(),
    close: vi.fn(),
  })),
}));

import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';

// ─── Real Imports (NOT mocked) ──────────────────────────────────────

import { loadConfig, validatePartialConfig, ConfigValidationError } from '../../src/core/config.js';
import {
  readTask, claimTask, writeTaskPlan, acquireLock, releaseLock,
  checkLock, releaseAllLocks, createHeartbeat, writeHeartbeat,
  writeResult, updateTaskStatus, LockError,
} from '../../src/agents/worker.js';
import {
  scanHeartbeats, checkStaleLocks, buildWorkerScopeMap,
  updateDashboard, detectPatterns,
} from '../../src/monitor/auditor.js';
import {
  readContext, evaluateResult, handleEvaluation, escalateDebt,
  planSprint, writeRetrospective, writeSprintLog, calculateMetrics,
  decay, cleanup,
} from '../../src/orchestra/brain.js';
import { providerRegistry } from '../../src/core/provider.js';
import type { ProviderAdapter } from '../../src/core/provider.js';

// ─── Helpers ────────────────────────────────────────────────────────

function setupProjectDir(root: string): void {
  mkdirSync(join(root, DECKENT_DIR), { recursive: true });
  mkdirSync(join(root, BRAIN_DIR, SPRINTS_DIR), { recursive: true });
  mkdirSync(join(root, TASKS_DIR), { recursive: true });
  mkdirSync(join(root, LOCKS_DIR), { recursive: true });
  mkdirSync(join(root, '.claude', 'rules'), { recursive: true });

  writeFileSync(join(root, DECKENT_DIR, 'config.json'), JSON.stringify({ mode: 'max_plan' }, null, 2));
  writeFileSync(join(root, DIRECTIVES_FILE), 'Implement feature A\nImplement feature B\n');
  writeFileSync(join(root, BRAIN_DIR, MEMORY_FILE), '# Learned Patterns\n');
  writeFileSync(join(root, BRAIN_DIR, DECISIONS_FILE), '# Architecture Decisions\n');
  writeFileSync(join(root, BRAIN_DIR, DEBT_FILE), `# Tech Debt\n\n${DEBT_TABLE_HEADER}\n`);
  writeFileSync(join(root, BRAIN_DIR, PATTERNS_FILE), '[]');
  writeFileSync(join(root, BRAIN_DIR, RETRO_FILE), '# Sprint Retrospective\n');
}

function makeTestTask(id: string, overrides?: Partial<Task>): Task {
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
    sprintId: 'sprint-001',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function writeTaskFile(root: string, task: Task): void {
  mkdirSync(join(root, TASKS_DIR), { recursive: true });
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

function makeTestConfig(root: string, overrides?: Partial<ResolvedConfig>): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 3, brain_model: 'opus', default_model: 'sonnet',
      haiku_allowed: true,
    },
    modes: {} as ResolvedConfig['modes'],
    language: 'en',
    projectName: 'test-project',
    projectRoot: root,
    version: '0.1.0',
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// GROUP 1: Config — Real File Read/Write
// ═══════════════════════════════════════════════════════════════════════

describe('Config integration', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-cfg-'));
    mkdirSync(join(root, DECKENT_DIR), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('loads default config when no project config exists', async () => {
    const config = await loadConfig(root);
    expect(config.mode).toBe('max_plan');
    expect(config.language).toBe('en');
    expect(config.activeModeConfig.max_workers).toBe(8);
  });

  it('loads and merges project config', async () => {
    writeFileSync(
      join(root, PROJECT_CONFIG_PATH),
      JSON.stringify({ mode: 'economic', language: 'tr' }),
    );
    const config = await loadConfig(root);
    // 'economic' is an alias → resolved to 'pro_plan' by loadConfig
    expect(config.mode).toBe('pro_plan');
    expect(config.language).toBe('tr');
    expect(config.activeModeConfig.max_workers).toBe(3);
  });

  it('deep merges mode overrides', async () => {
    writeFileSync(
      join(root, PROJECT_CONFIG_PATH),
      JSON.stringify({ modes: { max_plan: { max_workers: 6 } } }),
    );
    const config = await loadConfig(root);
    expect(config.activeModeConfig.max_workers).toBe(6);
    expect(config.activeModeConfig.brain_model).toBe('opus');
    expect(config.activeModeConfig.default_model).toBe('opus');
  });

  it('throws ConfigValidationError for invalid mode', async () => {
    writeFileSync(
      join(root, PROJECT_CONFIG_PATH),
      JSON.stringify({ mode: 'invalid_plan' }),
    );
    await expect(loadConfig(root)).rejects.toThrow(ConfigValidationError);
  });

  it('validatePartialConfig accepts valid partial', () => {
    expect(() => validatePartialConfig({ language: 'tr' })).not.toThrow();
    expect(() => validatePartialConfig({ mode: 'bad' as never })).toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// GROUP 2: Worker Lifecycle
// ═══════════════════════════════════════════════════════════════════════

describe('Worker lifecycle integration', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-wrk-'));
    setupProjectDir(root);
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('readTask reads real JSON file', () => {
    const task = makeTestTask('001');
    writeTaskFile(root, task);
    const result = readTask(root, '001');
    expect(result.id).toBe('001');
    expect(result.title).toBe('Task 001');
    expect(result.status).toBe(TaskStatus.PENDING);
  });

  it('readTask throws for missing task', () => {
    expect(() => readTask(root, '999')).toThrow('Task file not found');
  });

  it('claimTask transitions PENDING → CLAIMED with real file', () => {
    const task = makeTestTask('002');
    writeTaskFile(root, task);
    const claimed = claimTask(root, '002', 'w-002');
    expect(claimed.status).toBe('CLAIMED');
    expect(claimed.assignedWorker).toBe('w-002');
    // Verify persisted
    const reread = readTask(root, '002');
    expect(reread.status).toBe('CLAIMED');
    expect(reread.updatedAt).toBeDefined();
  });

  it('writeTaskPlan creates .plan file on disk', () => {
    const plan: TaskPlan = {
      taskId: '001', workerId: 'w-001',
      filesToCreate: ['src/new.ts'], filesToModify: [],
      executionSteps: ['step1'], testStrategy: 'unit', documentationPlan: 'none',
    };
    writeTaskPlan(root, plan);
    const raw = readFileSync(join(root, TASKS_DIR, 'task-001.plan'), 'utf-8');
    const parsed = JSON.parse(raw) as TaskPlan;
    expect(parsed.taskId).toBe('001');
    expect(parsed.filesToCreate).toContain('src/new.ts');
  });

  it('writeHeartbeat creates .hb file on disk', () => {
    const hb = createHeartbeat('w-001', '001', AgentStatus.CODING, 'editing', 'src/index.ts', 1);
    writeHeartbeat(root, hb);
    const raw = readFileSync(join(root, TASKS_DIR, 'task-001.hb'), 'utf-8');
    const parsed = JSON.parse(raw) as Heartbeat;
    expect(parsed.workerId).toBe('w-001');
    expect(parsed.status).toBe(AgentStatus.CODING);
  });

  it('writeResult creates .result and updates task status', () => {
    const task = makeTestTask('003', { status: TaskStatus.CLAIMED, assignedWorker: 'w-003' });
    writeTaskFile(root, task);
    const result = makeTestResult('003');
    writeResult(root, result);
    expect(existsSync(join(root, TASKS_DIR, 'task-003.result'))).toBe(true);
    const updated = readTask(root, '003');
    expect(updated.status).toBe('DONE');
  });

  it('updateTaskStatus persists change through file', () => {
    const task = makeTestTask('004');
    writeTaskFile(root, task);
    updateTaskStatus(root, '004', TaskStatus.EXECUTING);
    const reread = readTask(root, '004');
    expect(reread.status).toBe(TaskStatus.EXECUTING);
    expect(reread.updatedAt).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// GROUP 3: Lock System
// ═══════════════════════════════════════════════════════════════════════

describe('Lock system integration', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-lck-'));
    setupProjectDir(root);
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  beforeEach(() => {
    // Clean locks between tests
    const locksDir = join(root, LOCKS_DIR);
    if (existsSync(locksDir)) {
      for (const f of readdirSync(locksDir)) {
        rmSync(join(locksDir, f), { force: true });
      }
    }
  });

  it('acquireLock creates .lock file with correct content', () => {
    const lock = acquireLock(root, 'src/core/types.ts', 'w-001', '001');
    expect(lock.ownerWorkerId).toBe('w-001');
    const lockPath = join(root, LOCKS_DIR, 'src__core__types.ts.lock');
    expect(existsSync(lockPath)).toBe(true);
    const parsed = JSON.parse(readFileSync(lockPath, 'utf-8')) as LockInfo;
    expect(parsed.ownerWorkerId).toBe('w-001');
    expect(parsed.taskId).toBe('001');
  });

  it('checkLock returns LockInfo for locked file', () => {
    acquireLock(root, 'src/index.ts', 'w-001', '001');
    const info = checkLock(root, 'src/index.ts');
    expect(info).not.toBeNull();
    expect(info!.ownerWorkerId).toBe('w-001');
  });

  it('checkLock returns null for unlocked file', () => {
    expect(checkLock(root, 'src/nonexistent.ts')).toBeNull();
  });

  it('releaseLock deletes lock file from disk', () => {
    acquireLock(root, 'src/a.ts', 'w-001', '001');
    releaseLock(root, 'src/a.ts', 'w-001');
    expect(existsSync(join(root, LOCKS_DIR, 'src__a.ts.lock'))).toBe(false);
  });

  it('acquireLock throws LockError for different worker', () => {
    acquireLock(root, 'src/b.ts', 'w-001', '001');
    expect(() => acquireLock(root, 'src/b.ts', 'w-002', '002')).toThrow(LockError);
  });

  it('acquireLock is idempotent for same worker', () => {
    acquireLock(root, 'src/c.ts', 'w-001', '001');
    expect(() => acquireLock(root, 'src/c.ts', 'w-001', '001')).not.toThrow();
  });

  it('releaseAllLocks removes only owned locks', () => {
    acquireLock(root, 'src/x.ts', 'w-001', '001');
    acquireLock(root, 'src/y.ts', 'w-001', '001');
    acquireLock(root, 'src/z.ts', 'w-002', '002');
    const released = releaseAllLocks(root, 'w-001');
    expect(released).toBe(2);
    expect(checkLock(root, 'src/z.ts')).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// GROUP 4: Auditor Scan with Real Files
// ═══════════════════════════════════════════════════════════════════════

describe('Auditor scan integration', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-aud-'));
    setupProjectDir(root);
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  beforeEach(() => {
    // Clean heartbeats and locks
    for (const f of readdirSync(join(root, TASKS_DIR)).filter(f => f.endsWith('.hb'))) {
      rmSync(join(root, TASKS_DIR, f), { force: true });
    }
    for (const f of readdirSync(join(root, LOCKS_DIR))) {
      rmSync(join(root, LOCKS_DIR, f), { force: true });
    }
  });

  it('scanHeartbeats reads real .hb files', () => {
    const hb1 = createHeartbeat('w-001', '001', AgentStatus.CODING, 'editing');
    const hb2 = createHeartbeat('w-002', '002', AgentStatus.TESTING, 'running tests');
    writeHeartbeat(root, hb1);
    writeHeartbeat(root, hb2);

    const result = scanHeartbeats(root);
    expect(result.heartbeats.length).toBe(2);
    expect(result.staleAgents.length).toBe(0);
  });

  it('scanHeartbeats detects stale heartbeat', () => {
    const staleHb: Heartbeat = {
      workerId: 'w-stale', taskId: '099',
      status: AgentStatus.CODING, currentAction: 'stuck',
      timestamp: new Date(Date.now() - 200_000).toISOString(),
      filesChangedCount: 0, sequence: 0,
    };
    writeHeartbeat(root, { ...staleHb, taskId: '099' });

    const result = scanHeartbeats(root);
    expect(result.staleAgents.length).toBe(1);
    expect(result.staleAgents[0]!.type).toBe('stale_heartbeat');
    expect(result.alerts.length).toBeGreaterThan(0);
  });

  it('checkStaleLocks detects stale lock', () => {
    const staleLock: LockInfo = {
      filePath: 'src/old.ts',
      ownerWorkerId: 'w-old',
      acquiredAt: new Date(Date.now() - 400_000).toISOString(),
      taskId: '050',
    };
    mkdirSync(join(root, LOCKS_DIR), { recursive: true });
    writeFileSync(join(root, LOCKS_DIR, 'src__old.ts.lock'), JSON.stringify(staleLock, null, 2));

    const result = checkStaleLocks(root);
    expect(result.staleLocks.length).toBe(1);
    expect(result.staleLocks[0]!.type).toBe('stale_lock');
  });

  it('buildWorkerScopeMap reads tasks with assignedWorker', () => {
    writeTaskFile(root, makeTestTask('010', {
      assignedWorker: 'w-010',
      scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['README.md'] },
    }));
    writeTaskFile(root, makeTestTask('011', {
      assignedWorker: 'w-011',
      scope: { directories: ['src/cli/'], filesRead: [], filesWrite: [] },
    }));

    const map = buildWorkerScopeMap(root);
    expect(map.size).toBe(2);
    expect(map.get('w-010')!.directories).toContain('src/core/');
    expect(map.get('w-011')!.directories).toContain('src/cli/');
  });

  it('updateDashboard writes .dashboard file', () => {
    const state: DashboardState = {
      sprint: { id: 'sprint-001', number: 1, phase: SprintPhase.EXECUTE, status: SprintStatus.ACTIVE },
      agents: [],
      progress: { done: 0, active: 1, blocked: 0, total: 2 },
      alerts: [],
      updatedAt: new Date().toISOString(),
    };
    updateDashboard(root, state);
    const raw = readFileSync(join(root, DASHBOARD_FILE), 'utf-8');
    const parsed = JSON.parse(raw) as DashboardState;
    expect(parsed.sprint.id).toBe('sprint-001');
    expect(parsed.progress.total).toBe(2);
  });

  it('detectPatterns writes to PATTERNS.md', () => {
    const violations: BoundaryViolation[] = [{
      type: 'stale_heartbeat', agentId: 'w-001',
      detail: 'test', timestamp: new Date().toISOString(),
    }];
    detectPatterns(root, violations, 'sprint-001');
    const raw = readFileSync(join(root, BRAIN_DIR, PATTERNS_FILE), 'utf-8');
    const patterns = JSON.parse(raw) as Array<{ pattern: string }>;
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns[0]!.pattern).toBe('stale_heartbeat');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// GROUP 5: Brain Evaluation with Real Files
// ═══════════════════════════════════════════════════════════════════════

describe('Brain evaluation integration', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-eval-'));
    setupProjectDir(root);
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('evaluateResult returns DONE for passing result', () => {
    const result = makeTestResult('001');
    const task = makeTestTask('001');
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.DONE);
  });

  it('evaluateResult overrides DONE→NO_GO when testsPassed=false', () => {
    const result = makeTestResult('001', { testsPassed: false });
    const task = makeTestTask('001');
    expect(evaluateResult(result, task)).toBe(TaskEvaluation.NO_GO);
  });

  it('handleEvaluation DONE updates task and releases locks', () => {
    const task = makeTestTask('020', { assignedWorker: 'w-020', status: TaskStatus.CLAIMED });
    writeTaskFile(root, task);
    acquireLock(root, 'src/eval.ts', 'w-020', '020');

    handleEvaluation(root, task, TaskEvaluation.DONE, makeTestResult('020'));

    const updated = readTask(root, '020');
    expect(updated.status).toBe('DONE');
    expect(checkLock(root, 'src/eval.ts')).toBeNull();
  });

  it('handleEvaluation GO_WITH_TECH_DEBT writes DEBT.md', () => {
    const task = makeTestTask('021', { assignedWorker: 'w-021', status: TaskStatus.CLAIMED });
    writeTaskFile(root, task);

    handleEvaluation(root, task, TaskEvaluation.GO_WITH_TECH_DEBT, makeTestResult('021', {
      notes: 'Minor style issues',
    }));

    const debtContent = readFileSync(join(root, BRAIN_DIR, DEBT_FILE), 'utf-8');
    expect(debtContent).toContain('debt-021');
  });

  it('handleEvaluation NO_GO creates fix task file', () => {
    const task = makeTestTask('022', { assignedWorker: 'w-022', status: TaskStatus.CLAIMED });
    writeTaskFile(root, task);

    handleEvaluation(root, task, TaskEvaluation.NO_GO, makeTestResult('022', {
      selfAssessment: 'NO_GO', testsPassed: false, notes: 'Build failure',
    }));

    const fixPath = join(root, TASKS_DIR, 'task-022-fix.json');
    expect(existsSync(fixPath)).toBe(true);
    const fixTask = JSON.parse(readFileSync(fixPath, 'utf-8')) as Task;
    expect(fixTask.isPriorityFix).toBe(true);
    expect(fixTask.fixForTaskId).toBe('022');
  });

  it('escalateDebt increments sprintsOpen and priority', () => {
    // Write a debt table with one NORMAL item at sprintsOpen=1
    const debtContent = [
      DEBT_TABLE_HEADER,
      '|---|---|---|---|---|---|---|---|---|',
      '| debt-e01 | Test debt | task-e01 | sprint-001 | NORMAL | 1 | false |  | 2026-01-01 |',
    ].join('\n');
    writeFileSync(join(root, BRAIN_DIR, DEBT_FILE), debtContent);

    escalateDebt(root);

    const updated = readFileSync(join(root, BRAIN_DIR, DEBT_FILE), 'utf-8');
    expect(updated).toContain('HIGH');
    expect(updated).toContain('2'); // sprintsOpen incremented
  });
});

// ═══════════════════════════════════════════════════════════════════════
// GROUP 6: Sprint Mini-Cycle
// ═══════════════════════════════════════════════════════════════════════

describe('Sprint mini-cycle integration', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-sprint-'));
    setupProjectDir(root);

    // Register a mock provider so planSprint can resolve the default adapter
    providerRegistry.clear();
    const mockAdapter: ProviderAdapter = {
      name: 'claude',
      supportedModels: ['opus', 'sonnet', 'haiku'],
      spawn: () => {},
      kill: () => {},
      listWorkers: () => [],
      isAvailable: async () => true,
      buildCommand: (model: string) => `claude -p --model ${model}`,
      buildPlannerCommand: (prompt: string, model: string) => ({
        command: 'claude',
        args: ['-p', prompt, '--model', model, '--output-format', 'json'],
      }),
    };
    providerRegistry.registerProvider(mockAdapter, true);
  });

  afterAll(() => {
    providerRegistry.clear();
    rmSync(root, { recursive: true, force: true });
  });

  it('readContext reads all brain files from real FS', () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
    } as ReturnType<typeof spawnSync>);

    const context = readContext(root);
    expect(context.directives).toContain('Implement feature A');
    expect(context.memory).toContain('Learned Patterns');
    expect(context.decisions).toContain('Architecture Decisions');
  });

  it('planSprint creates task files on disk', async () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
    } as ReturnType<typeof spawnSync>);

    const config = makeTestConfig(root);
    const context = readContext(root);
    const recommendation = { size: 'full' as const, maxWorkers: 3, modelConstraint: null, reason: 'OK' };

    const sprint = await planSprint(root, config, context, recommendation);
    expect(sprint.tasks.length).toBeGreaterThan(0);

    // Verify task files exist on disk
    const taskFiles = readdirSync(join(root, TASKS_DIR)).filter(f => f.startsWith('task-') && f.endsWith('.json'));
    expect(taskFiles.length).toBeGreaterThanOrEqual(sprint.tasks.length);
  });

  it('planSprint auto-increments sprint number', async () => {
    // Write existing sprint logs
    writeFileSync(join(root, BRAIN_DIR, SPRINTS_DIR, 'sprint-001.md'), '# sprint-001\n');
    writeFileSync(join(root, BRAIN_DIR, SPRINTS_DIR, 'sprint-002.md'), '# sprint-002\n');

    vi.mocked(spawnSync).mockReturnValue({
      status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
    } as ReturnType<typeof spawnSync>);

    const config = makeTestConfig(root);
    const context = readContext(root);
    const recommendation = { size: 'full' as const, maxWorkers: 2, modelConstraint: null, reason: 'OK' };

    const sprint = await planSprint(root, config, context, recommendation);
    expect(sprint.number).toBe(3);
    expect(sprint.id).toBe('sprint-003');
  });

  it('writeRetrospective writes RETRO.md', () => {
    const sprint: Sprint = {
      id: 'sprint-001', number: 1, status: SprintStatus.COMPLETE,
      phase: SprintPhase.COMPLETE, tasks: [makeTestTask('r01')], workers: ['w-r01'],
      startedAt: new Date().toISOString(), completedAt: new Date().toISOString(),
    };
    const evals = new Map<string, TaskEvaluation>([['r01', TaskEvaluation.DONE]]);
    const metrics: SprintMetrics = {
      totalTasks: 1, completedTasks: 1, techDebtTasks: 0, noGoTasks: 0,
      durationMs: 5000, coveragePercent: 95, noGoRate: 0,
      newDebtCount: 0, resolvedDebtCount: 0, totalOpenDebt: 0,
      boundaryViolations: 0, crossAssignments: 0, contextLinesUsed: 0,
    };

    writeRetrospective(root, sprint, evals, metrics);

    const retro = readFileSync(join(root, BRAIN_DIR, RETRO_FILE), 'utf-8');
    expect(retro).toContain('sprint-001');
    expect(retro).toContain('Metrics');
  });

  it('writeSprintLog creates sprint-NNN.md', () => {
    const sprint: Sprint = {
      id: 'sprint-010', number: 10, status: SprintStatus.COMPLETE,
      phase: SprintPhase.COMPLETE, tasks: [makeTestTask('s01')], workers: ['w-s01'],
    };
    const metrics: SprintMetrics = {
      totalTasks: 1, completedTasks: 1, techDebtTasks: 0, noGoTasks: 0,
      durationMs: 3000, coveragePercent: 92, noGoRate: 0,
      newDebtCount: 0, resolvedDebtCount: 0, totalOpenDebt: 0,
      boundaryViolations: 0, crossAssignments: 0, contextLinesUsed: 0,
    };

    writeSprintLog(root, sprint, metrics);

    const logPath = join(root, BRAIN_DIR, SPRINTS_DIR, 'sprint-010.md');
    expect(existsSync(logPath)).toBe(true);
    const content = readFileSync(logPath, 'utf-8');
    expect(content).toContain('sprint-010');
    expect(content).toContain('92.0%');
  });

  it('cleanup removes task artifacts', () => {
    // Create some artifacts
    const task = makeTestTask('c01', { assignedWorker: 'w-c01' });
    writeTaskFile(root, task);
    writeHeartbeat(root, createHeartbeat('w-c01', 'c01', AgentStatus.DONE, 'done'));
    acquireLock(root, 'src/cleanup.ts', 'w-c01', 'c01');

    const sprint: Sprint = {
      id: 'sprint-cleanup', number: 99, status: SprintStatus.COMPLETE,
      phase: SprintPhase.COMPLETE, tasks: [task], workers: ['w-c01'],
    };

    cleanup(root, sprint);

    // Heartbeat files should be deleted
    const hbFiles = readdirSync(join(root, TASKS_DIR)).filter(f => f.endsWith('.hb'));
    expect(hbFiles.length).toBe(0);

    // Lock files should be deleted
    const lockFiles = readdirSync(join(root, LOCKS_DIR)).filter(f => f.endsWith('.lock'));
    expect(lockFiles.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// GROUP 7: CLI Doctor
// ═══════════════════════════════════════════════════════════════════════

describe('CLI doctor integration', () => {
  let stdoutData: string[];
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    stdoutData = [];
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((data) => {
      stdoutData.push(String(data));
      return true;
    });
    process.exitCode = undefined;
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    process.exitCode = undefined;
  });

  it('doctor passes when node+git return valid versions', async () => {
    vi.mocked(spawnSync).mockImplementation((cmd) => {
      const outputs: Record<string, string> = {
        node: 'v22.0.0', git: 'git version 2.44.0', tmux: 'tmux 3.4', claude: '1.0.0',
      };
      return { status: 0, stdout: outputs[cmd as string] ?? '', stderr: '', pid: 0, output: [], signal: null } as ReturnType<typeof spawnSync>;
    });

    const { Command } = await import('commander');
    const { registerDoctor } = await import('../../src/cli/commands/doctor.js');
    const program = new Command();
    program.exitOverride();
    registerDoctor(program);
    try { await program.parseAsync(['node', 'test', 'doctor']); } catch { /* commander exit */ }

    const output = stdoutData.join('');
    expect(output).toContain('OK');
    expect(output).toContain('Node.js');
  });

  it('doctor fails for old Node version', async () => {
    vi.mocked(spawnSync).mockImplementation((cmd) => {
      if (cmd === 'node') return { status: 0, stdout: 'v16.0.0', stderr: '', pid: 0, output: [], signal: null } as ReturnType<typeof spawnSync>;
      return { status: 0, stdout: 'ok', stderr: '', pid: 0, output: [], signal: null } as ReturnType<typeof spawnSync>;
    });

    const { Command } = await import('commander');
    const { registerDoctor } = await import('../../src/cli/commands/doctor.js');
    const program = new Command();
    program.exitOverride();
    registerDoctor(program);
    try { await program.parseAsync(['node', 'test', 'doctor']); } catch { /* */ }

    expect(process.exitCode).toBe(1);
  });

  it('doctor handles missing tools', async () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 1, stdout: '', stderr: '', pid: 0, output: [], signal: null,
    } as ReturnType<typeof spawnSync>);

    const { Command } = await import('commander');
    const { registerDoctor } = await import('../../src/cli/commands/doctor.js');
    const program = new Command();
    program.exitOverride();
    registerDoctor(program);
    try { await program.parseAsync(['node', 'test', 'doctor']); } catch { /* */ }

    const output = stdoutData.join('');
    expect(output).toContain('not found');
    expect(process.exitCode).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// GROUP 8: Init Wizard — Real Directory Creation
// ═══════════════════════════════════════════════════════════════════════

describe('Init wizard integration', () => {
  let root: string;
  let cwdSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    root = mkdtempSync(join(tmpdir(), 'deckent-init-'));
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(root);
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    process.exitCode = undefined;
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    rmSync(root, { recursive: true, force: true });
    process.exitCode = undefined;
  });

  function mockPrompts(answers: string[]): void {
    const mockQuestion = vi.fn();
    for (const answer of answers) {
      mockQuestion.mockResolvedValueOnce(answer);
    }
    vi.mocked(createInterface).mockReturnValue({
      question: mockQuestion,
      close: vi.fn(),
    } as unknown as ReturnType<typeof createInterface>);
  }

  it('init creates full directory scaffold on real filesystem', async () => {
    mockPrompts(['1', '1', 'test-project']); // max_plan, en, name

    const { Command } = await import('commander');
    const { registerInit } = await import('../../src/cli/commands/init.js');
    const program = new Command();
    program.exitOverride();
    registerInit(program);
    try { await program.parseAsync(['node', 'test', 'init']); } catch { /* */ }

    expect(existsSync(join(root, DECKENT_DIR))).toBe(true);
    expect(existsSync(join(root, BRAIN_DIR))).toBe(true);
    expect(existsSync(join(root, BRAIN_DIR, 'sprints'))).toBe(true);
    expect(existsSync(join(root, TASKS_DIR))).toBe(true);
    expect(existsSync(join(root, LOCKS_DIR))).toBe(true);
    expect(existsSync(join(root, '.claude', 'rules'))).toBe(true);
    expect(existsSync(join(root, DIRECTIVES_FILE))).toBe(true);
    expect(existsSync(join(root, BRAIN_DIR, MEMORY_FILE))).toBe(true);
    expect(existsSync(join(root, BRAIN_DIR, RETRO_FILE))).toBe(true);
  });

  it('init writes valid config with selected mode', async () => {
    mockPrompts(['2', '3', 'my-app']); // language-first: tr, economic, name

    const { Command } = await import('commander');
    const { registerInit } = await import('../../src/cli/commands/init.js');
    const program = new Command();
    program.exitOverride();
    registerInit(program);
    try { await program.parseAsync(['node', 'test', 'init']); } catch { /* */ }

    const configPath = join(root, DECKENT_DIR, 'config.json');
    expect(existsSync(configPath)).toBe(true);
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(config.mode).toBe('economic');
    expect(config.language).toBe('tr');
    expect(config.projectName).toBe('my-app');
  });

  it('init does not overwrite existing files', async () => {
    // Pre-create DIRECTIVES.md with custom content
    writeFileSync(join(root, DIRECTIVES_FILE), 'My custom directives');

    mockPrompts(['1', '1', 'proj']);

    const { Command } = await import('commander');
    const { registerInit } = await import('../../src/cli/commands/init.js');
    const program = new Command();
    program.exitOverride();
    registerInit(program);
    try { await program.parseAsync(['node', 'test', 'init']); } catch { /* */ }

    const content = readFileSync(join(root, DIRECTIVES_FILE), 'utf-8');
    expect(content).toBe('My custom directives');
  });

  it('init appends to .gitignore without duplicates', async () => {
    writeFileSync(join(root, '.gitignore'), 'node_modules/\n.deckent/\n');

    mockPrompts(['1', '1', 'proj']);

    const { Command } = await import('commander');
    const { registerInit } = await import('../../src/cli/commands/init.js');
    const program = new Command();
    program.exitOverride();
    registerInit(program);
    try { await program.parseAsync(['node', 'test', 'init']); } catch { /* */ }

    const gitignore = readFileSync(join(root, '.gitignore'), 'utf-8');
    const matches = gitignore.match(/\.deckent\//g);
    expect(matches?.length).toBe(1);
  });
});
