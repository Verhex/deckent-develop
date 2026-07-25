/**
 * tests/orchestra/dependency-pipeline-wire.test.ts
 *
 * ADR-045 / Sprint 164 Task 4: respawnEligibleTasks Runtime Wire +
 * task.status Inline Sync.
 *
 * Reproduces the Sprint 161 stalled forensic — multi-wave execution
 * where Wave 2/3 tasks remained ghosts because:
 *   (1) `respawnEligibleTasks` had no call-site (Sprint 134→164 dormant)
 *   (2) `task.status` was never mutated inline; it stayed EXECUTING so
 *       the dep filter `t.status === TaskStatus.DONE` always returned empty.
 *
 * 8 wire tests (a..h):
 *   (a) `enabled: false` → legacy FIFO preserved, `respawnEligibleTasks` returns []
 *   (b) `enabled: true` + Wave 1 (3 tasks) DONE → Wave 2 spawned, status EXECUTING
 *   (c) Chained 3-wave: Wave 2 done → Wave 3 spawn (full coverage)
 *   (d) NO_GO in Wave 1 → Wave 2 dep stays PENDING (no spawn)
 *   (e) Slot saturation (maxWorkers=2, 3 eligible) → first 2 spawn, 3rd waits
 *   (f) GO_WITH_TECH_DEBT in Wave 1 → debt-DONE status, Wave 2 spawn (ADR-045 Consequences)
 *   (g) Inline status mutation (applyStatusMutation) reflects in respawn doneTasks set
 *   (h) currentlyExecuting === maxWorkers → no double-spawn (idempotent)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TaskStatus, SprintStatus, SprintPhase,
} from '../../src/core/types.js';
import type { Task, Sprint, ResolvedConfig, TaskResult } from '../../src/core/types.js';

// ─── Mocks (mirror dependency-pipeline.test.ts pattern) ─────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  unlinkSync: vi.fn(),
  statSync: vi.fn(),
  appendFileSync: vi.fn(),
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

vi.mock('../../src/orchestra/spawn-backend.js', () => ({
  TmuxBackend: vi.fn(),
  SubprocessBackend: vi.fn(),
  SpawnBackendFactory: { create: vi.fn() },
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
    getNextSprintId: vi.fn().mockReturnValue('sprint-164'),
    updateLastSprintId: vi.fn(),
    readJsonSafe: vi.fn().mockReturnValue(null),
    debugLog: vi.fn(),
  };
});

vi.mock('../../src/core/config.js', () => ({
  resolveBrainModel: () => 'claude-sonnet-5',  // sprint-431 (431-003) compiler-cagri-zinciri okur
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  resolveEffectiveWorkers: vi.fn().mockReturnValue(4),
  loadConfig: vi.fn().mockReturnValue({}),
}));

vi.mock('../../src/core/system-profile.js', () => ({
  getSystemProfile: vi.fn().mockReturnValue({ cpuCount: 4, memoryGB: 16, os: 'linux' }),
}));

vi.mock('../../src/core/agent-pool.js', () => ({
  AgentPoolManager: vi.fn().mockImplementation(() => ({
    getAgent: vi.fn(),
    listAgents: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock('../../src/core/skill-pool.js', () => ({
  SkillPoolManager: vi.fn().mockImplementation(() => ({
    getSkill: vi.fn(),
    listSkills: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock('../../src/orchestra/result-collector.js', async (importOriginal) => {
  // Use actual applyStatusMutation export — wire intent test (g) verifies it
  const actual = await importOriginal<typeof import('../../src/orchestra/result-collector.js')>();
  return {
    ...actual,
    waitForResults: vi.fn().mockResolvedValue([]),
    resolveAgentPrompt: vi.fn().mockResolvedValue(undefined),
    resolveSkillPrompts: vi.fn().mockResolvedValue([]),
    buildResultsMap: vi.fn().mockReturnValue(new Map()),
  };
});

vi.mock('../../src/orchestra/sprint-utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/sprint-utils.js')>();
  return {
    ...actual,
    readFileSafe: vi.fn().mockReturnValue(''),
    now: vi.fn().mockReturnValue(new Date().toISOString()),
    isTmuxProvider: vi.fn().mockReturnValue(false),
    resolveTaskProvider: vi.fn().mockReturnValue('claude'),
    getProviderAdapterForTask: vi.fn().mockReturnValue({
      name: 'measured-claude-test',
      liveUsageBudgetSupport: 'measured-stream',
      executionLandingCapability: 'cooperative-landing',
      spawn: vi.fn(),
    }),
    getDefaultProvider: vi.fn().mockReturnValue(null),
  };
});

vi.mock('../../src/agents/worker.js', () => ({
  releaseAllLocks: vi.fn(),
  createWorkerStateMachine: vi.fn(() => ({
    transition: vi.fn(),
    canTransition: vi.fn(() => true),
    getState: vi.fn(() => 'SPAWNING'),
    state: 'SPAWNING',
    stop: vi.fn(),
  })),
  getWorkerStateMachine: vi.fn(() => ({
    transition: vi.fn(),
    canTransition: vi.fn(() => true),
    state: 'EXECUTING',
  })),
  getAllWorkerStates: vi.fn(() => new Map()),
  removeWorkerStateMachine: vi.fn(() => true),
  isWorkerStoppable: vi.fn(() => true),
}));

vi.mock('../../src/orchestra/task-router.js', () => ({
  routeTask: vi.fn().mockReturnValue({ provider: 'claude', agent: 'generic', skills: [] }),
}));

vi.mock('../../src/orchestra/event-stream.js', () => ({
  writeEvent: vi.fn(),
  getCurrentSprintId: vi.fn().mockReturnValue('sprint-164'),
  readSequence: vi.fn().mockReturnValue(0),
  CHANNELS: {
    SCOPE_COLLISION_DETECTED: 'AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED',
    TASK_ASSIGN: 'BRAIN→WORKER:TASK_ASSIGN',
    HEARTBEAT: 'WORKER→BRAIN:HEARTBEAT',
    METRIC_EMITTED: 'BRAIN→*:METRIC_EMITTED',
    FIX_REQUEST: 'BRAIN→BRAIN:FIX_REQUEST',
  },
}));

vi.mock('../../src/orchestra/sprint-checkpoint.js', () => ({
  writeCheckpoint: vi.fn(),
}));

vi.mock('../../src/orchestra/conflict-resolver.js', () => ({
  detectScopeCollisions: vi.fn().mockReturnValue({
    collisionCount: 0,
    collisions: new Map(),
    collidingPairs: [],
  }),
  buildCollisionAwareWaves: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/orchestra/parallel-pipeline.js', () => ({
  ParallelPipelineManager: vi.fn().mockImplementation(() => ({
    createPipeline: vi.fn().mockReturnValue([]),
  })),
  DependencyCycleError: class extends Error {
    taskIds: string[];
    constructor(message: string, taskIds: string[]) {
      super(message);
      this.taskIds = taskIds;
    }
  },
}));

vi.mock('../../src/core/observability.js', () => ({
  metric: vi.fn(),
  initObservability: vi.fn(),
  structuredLog: vi.fn(),
  trace: vi.fn(async (_name, fn) => fn()),
}));

// ─── Imports (after mocks) ───────────────────────────────────────────

import {
  spawnWorkers,
  respawnEligibleTasks,
} from '../../src/orchestra/sprint-controller.js';

import { applyStatusMutation } from '../../src/orchestra/result-collector.js';

import { spawnWorker } from '../../src/orchestra/tmux.js';

// ─── Helpers ──────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '164-001',
    title: 'Test task',
    description: 'desc',
    model: 'claude-opus-4-8',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-164',
    createdAt: new Date().toISOString(),
    budget: { maxTurns: 1 },
    budgetPolicy: {
      state: 'allow',
      role: 'worker',
      taskKind: 'code-development',
      resolvedProvider: 'claude',
      executionCostClass: 'remote',
      profileRef: 'tests.orchestra.dependency-pipeline-wire',
      policyDigest: '9'.repeat(64),
      admissionMode: 'unattended',
      landingPolicy: { reserve_ratio: 0.25 },
    },
    ...overrides,
  };
}

function makeSprint(overrides: Partial<Sprint> = {}): Sprint {
  const tasks = overrides.tasks ?? [makeTask()];
  return {
    id: 'sprint-164',
    number: 164,
    status: SprintStatus.ACTIVE,
    phase: SprintPhase.EXECUTE,
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
    ...overrides,
  };
}

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    projectName: 'test',
    mode: 'performance',
    projectRoot: '/tmp/test',
    language: 'en',
    version: '1.0.0',
    activeModeConfig: {
      max_workers: 4,
      default_model: 'claude-opus-4-8',
      haiku_allowed: false,
      brain_planning: 'structured',
      brain_model: 'claude-opus-4-8',
    },
    modes: {} as ResolvedConfig['modes'],
    ...overrides,
  } as ResolvedConfig;
}

function makeResult(taskId: string, selfAssessment: 'DONE' | 'NO_GO' | 'GO_WITH_TECH_DEBT'): TaskResult {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: selfAssessment === 'DONE',
    coverage: 0,
    selfAssessment,
    notes: 'test',
  };
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('Dependency Pipeline Wire — ADR-045 / Sprint 164 Task 4', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ═══ Test (a) — enabled: false → legacy FIFO preserved ════════════

  describe('(a) enabled: false — legacy FIFO behavior preserved', () => {
    it('respawnEligibleTasks returns [] when pipeline disabled (no wire activation)', async () => {
      const t1 = makeTask({ id: '164-001', dependencies: [], status: TaskStatus.DONE });
      const t2 = makeTask({ id: '164-002', dependencies: ['164-001'], status: TaskStatus.PENDING });
      const sprint = makeSprint({ tasks: [t1, t2] });
      const config = makeConfig({ dependency_pipeline_enabled: false });

      const spawned = await respawnEligibleTasks('/tmp/test', sprint, config);

      // Legacy mode: wire branch must not activate
      expect(spawned).toEqual([]);
      // Pending task stays PENDING — no spawn side-effect
      expect(t2.status).toBe(TaskStatus.PENDING);
      // No worker spawn invoked
      expect(vi.mocked(spawnWorker)).not.toHaveBeenCalled();
    });
  });

  // ═══ Test (b) — Wave 1 (3 tasks) DONE → Wave 2 spawn ══════════════

  describe('(b) enabled: true + Wave 1 (3 tasks) DONE → Wave 2 spawn', () => {
    it('spawns Wave 2 task when all Wave 1 deps marked DONE; status → EXECUTING', async () => {
      const w1a = makeTask({ id: '164-001', dependencies: [], status: TaskStatus.DONE });
      const w1b = makeTask({ id: '164-002', dependencies: [], status: TaskStatus.DONE });
      const w1c = makeTask({ id: '164-003', dependencies: [], status: TaskStatus.DONE });
      const w2 = makeTask({
        id: '164-004',
        dependencies: ['164-001', '164-002', '164-003'],
        status: TaskStatus.PENDING,
      });
      const sprint = makeSprint({ tasks: [w1a, w1b, w1c, w2] });
      const config = makeConfig({ dependency_pipeline_enabled: true });

      const spawned = await respawnEligibleTasks('/tmp/test', sprint, config);

      expect(spawned).toContain('164-004');
      expect(w2.status).toBe(TaskStatus.EXECUTING);
    });
  });

  // ═══ Test (c) — Wave 2 done → Wave 3 spawn (3-wave chain) ═════════

  describe('(c) Chained 3-wave: Wave 2 done → Wave 3 spawn', () => {
    it('spawns Wave 3 task when Wave 1 + Wave 2 all DONE', async () => {
      const w1 = makeTask({ id: '164-001', dependencies: [], status: TaskStatus.DONE });
      const w2 = makeTask({ id: '164-002', dependencies: ['164-001'], status: TaskStatus.DONE });
      const w3 = makeTask({
        id: '164-003',
        dependencies: ['164-001', '164-002'],
        status: TaskStatus.PENDING,
      });
      const sprint = makeSprint({ tasks: [w1, w2, w3] });
      const config = makeConfig({ dependency_pipeline_enabled: true });

      const spawned = await respawnEligibleTasks('/tmp/test', sprint, config);

      // Wave 3 (depth-2 dep chain) eligible after both prior waves done
      expect(spawned).toContain('164-003');
      expect(w3.status).toBe(TaskStatus.EXECUTING);
    });
  });

  // ═══ Test (d) — NO_GO in Wave 1 → Wave 2 stays PENDING ════════════

  describe('(d) NO_GO in Wave 1 → Wave 2 dep stays PENDING (no spawn)', () => {
    it('does not spawn Wave 2 task whose dep is NO_GO', async () => {
      const w1 = makeTask({ id: '164-001', dependencies: [], status: TaskStatus.NO_GO });
      const w2 = makeTask({ id: '164-002', dependencies: ['164-001'], status: TaskStatus.PENDING });
      const sprint = makeSprint({ tasks: [w1, w2] });
      const config = makeConfig({ dependency_pipeline_enabled: true });

      const spawned = await respawnEligibleTasks('/tmp/test', sprint, config);

      // NO_GO status is not DONE → dep filter rejects w2 → no spawn
      expect(spawned).not.toContain('164-002');
      expect(w2.status).toBe(TaskStatus.PENDING);
    });
  });

  // ═══ Test (e) — Slot saturation: 2 spawn, 3rd waits ═══════════════

  describe('(e) Slot saturation — maxWorkers=2, 3 Wave 2 eligible → first 2 spawn', () => {
    it('spawns only as many as slotsAvailable allows', async () => {
      const cfgMod = await import('../../src/core/config.js');
      vi.mocked(cfgMod.resolveEffectiveWorkers).mockReturnValueOnce(2);

      const w1 = makeTask({ id: '164-001', dependencies: [], status: TaskStatus.DONE });
      const e1 = makeTask({ id: '164-002', dependencies: ['164-001'], status: TaskStatus.PENDING });
      const e2 = makeTask({ id: '164-003', dependencies: ['164-001'], status: TaskStatus.PENDING });
      const e3 = makeTask({ id: '164-004', dependencies: ['164-001'], status: TaskStatus.PENDING });
      const sprint = makeSprint({ tasks: [w1, e1, e2, e3] });
      const config = makeConfig({ dependency_pipeline_enabled: true });

      const spawned = await respawnEligibleTasks('/tmp/test', sprint, config);

      // maxWorkers=2, currentlyExecuting=0 → slotsAvailable=2 → only 2 spawn
      expect(spawned).toHaveLength(2);
      const stillPending = [e1, e2, e3].filter(t => t.status === TaskStatus.PENDING);
      expect(stillPending).toHaveLength(1);
    });
  });

  // ═══ Test (f) — GO_WITH_TECH_DEBT → debt-DONE → Wave 2 spawn ══════

  describe('(f) GO_WITH_TECH_DEBT in Wave 1 → debt-DONE status → Wave 2 spawn', () => {
    it('applyStatusMutation maps GO_WITH_TECH_DEBT → DONE so Wave 2 dep filter passes', async () => {
      // ADR-045 Consequences: debt-DONE counts as DONE for dep filter
      const w1 = makeTask({ id: '164-001', dependencies: [], status: TaskStatus.EXECUTING });
      const w2 = makeTask({ id: '164-002', dependencies: ['164-001'], status: TaskStatus.PENDING });
      const sprint = makeSprint({ tasks: [w1, w2] });

      // Simulate collectResults inline mutation with a debt result
      applyStatusMutation(w1, makeResult('164-001', 'GO_WITH_TECH_DEBT'));
      expect(w1.status).toBe(TaskStatus.DONE);

      const config = makeConfig({ dependency_pipeline_enabled: true });
      const spawned = await respawnEligibleTasks('/tmp/test', sprint, config);

      expect(spawned).toContain('164-002');
      expect(w2.status).toBe(TaskStatus.EXECUTING);
    });
  });

  // ═══ Test (g) — Inline status mutation visible to respawn ═════════

  describe('(g) Inline status mutation reflects in respawn doneTasks set (same tick)', () => {
    it('applyStatusMutation + respawnEligibleTasks in sequence yields eligible spawn', async () => {
      const w1 = makeTask({ id: '164-001', dependencies: [], status: TaskStatus.EXECUTING });
      const w2 = makeTask({ id: '164-002', dependencies: ['164-001'], status: TaskStatus.PENDING });
      const sprint = makeSprint({ tasks: [w1, w2] });
      const config = makeConfig({ dependency_pipeline_enabled: true });

      // Before mutation — Wave 2 must NOT be eligible (status not DONE)
      const beforeSpawn = await respawnEligibleTasks('/tmp/test', sprint, config);
      expect(beforeSpawn).not.toContain('164-002');
      expect(w2.status).toBe(TaskStatus.PENDING);

      // Inline mutation (simulating collectResults seeing a DONE .result)
      applyStatusMutation(w1, makeResult('164-001', 'DONE'));
      expect(w1.status).toBe(TaskStatus.DONE);

      // Now respawn sees the in-memory DONE and spawns Wave 2
      const afterSpawn = await respawnEligibleTasks('/tmp/test', sprint, config);
      expect(afterSpawn).toContain('164-002');
      expect(w2.status).toBe(TaskStatus.EXECUTING);
    });

    it('applyStatusMutation maps NO_GO selfAssessment → TaskStatus.NO_GO', () => {
      const t = makeTask({ id: '164-001', status: TaskStatus.EXECUTING });
      applyStatusMutation(t, makeResult('164-001', 'NO_GO'));
      expect(t.status).toBe(TaskStatus.NO_GO);
    });
  });

  // ═══ Test (h) — Idempotency: no double-spawn when slots full ══════

  describe('(h) currentlyExecuting === maxWorkers → no double-spawn', () => {
    it('respawnEligibleTasks is idempotent when slots are saturated', async () => {
      const cfgMod = await import('../../src/core/config.js');
      vi.mocked(cfgMod.resolveEffectiveWorkers).mockReturnValueOnce(1);

      // 1 task already EXECUTING + 1 eligible PENDING; only 1 slot → 0 new spawn
      const w1 = makeTask({ id: '164-001', dependencies: [], status: TaskStatus.DONE });
      const inFlight = makeTask({ id: '164-002', dependencies: [], status: TaskStatus.EXECUTING });
      const eligible = makeTask({ id: '164-003', dependencies: ['164-001'], status: TaskStatus.PENDING });
      const sprint = makeSprint({ tasks: [w1, inFlight, eligible] });
      const config = makeConfig({ dependency_pipeline_enabled: true });

      const spawned = await respawnEligibleTasks('/tmp/test', sprint, config);

      // slotsAvailable = max(0, 1 - 1) = 0 → no spawn
      expect(spawned).toEqual([]);
      expect(eligible.status).toBe(TaskStatus.PENDING);
    });
  });
});
