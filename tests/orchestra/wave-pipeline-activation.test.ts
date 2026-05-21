/**
 * tests/orchestra/wave-pipeline-activation.test.ts
 *
 * Sprint 182 — Task 182-004 (W2-1): ADR-045 Wave-Based Execution
 * altyapı doğrulaması.
 *
 * Sprint 181 W3 verify (181-003 ci-guardian) sistem bulgusu:
 * "W1 tamamlanmadan W2 spawn izlenimi" — root cause
 * `dependency_pipeline_enabled: false` + Dependencies field yok →
 * ADR-045 wave-based execution inactive.
 *
 * Sprint 182'de config flip ETMİYORUZ (deckent-dev policy ADR-047 +
 * Sprint 183 hazırlık); ama altyapı `dependency_pipeline_enabled: true`
 * durumunda doğru çalışıyor mu test seviyesinde doğrula.
 *
 * 3 wave activation case:
 *   1. Wave inşa (Kahn TopSort): Dependencies field dolu task seti →
 *      ParallelPipelineManager.createPipeline doğru wave seviyelerini
 *      üretir; döngü → DependencyCycleError.
 *   2. Sequential dispatch: `dependency_pipeline_enabled: true` ile
 *      respawnEligibleTasks W1 hepsi DONE olmadan W2 dispatch ETMEZ;
 *      `dependency_pipeline_enabled: false` ile dep filter atlanır.
 *   3. Collision-aware wave merge: scope.filesWrite çakışan task'lar
 *      buildCollisionAwareWaves tarafından sentetik dep edge'i ile
 *      ayrı wave'lere yerleştirilir; bağımsız task aynı wave'de kalır.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TaskStatus, SprintStatus, SprintPhase,
} from '../../src/core/types.js';
import type { Task, Sprint, ResolvedConfig } from '../../src/core/types.js';

// ─── Mocks (mirror dependency-pipeline-wire.test.ts pattern) ────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  unlinkSync: vi.fn(),
  renameSync: vi.fn(),
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
    getNextSprintId: vi.fn().mockReturnValue('sprint-182'),
    updateLastSprintId: vi.fn(),
    readJsonSafe: vi.fn().mockReturnValue(null),
    debugLog: vi.fn(),
  };
});

vi.mock('../../src/core/config.js', () => ({
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
    isTmuxProvider: vi.fn().mockReturnValue(true),
    resolveTaskProvider: vi.fn().mockReturnValue('claude'),
    getProviderAdapterForTask: vi.fn().mockReturnValue(null),
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
  getCurrentSprintId: vi.fn().mockReturnValue('sprint-182'),
  readSequence: vi.fn().mockReturnValue(0),
  CHANNELS: {
    SCOPE_COLLISION_DETECTED: 'AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED',
    TASK_ASSIGN: 'BRAIN→WORKER:TASK_ASSIGN',
    HEARTBEAT: 'WORKER→BRAIN:HEARTBEAT',
    METRIC_EMITTED: 'BRAIN→*:METRIC_EMITTED',
    FIX_REQUEST: 'BRAIN→BRAIN:FIX_REQUEST',
    SPAWN_BLOCKED: 'BRAIN→WORKER:SPAWN_BLOCKED',
  },
}));

vi.mock('../../src/orchestra/sprint-checkpoint.js', () => ({
  writeCheckpoint: vi.fn(),
}));

vi.mock('../../src/core/observability.js', () => ({
  metric: vi.fn(),
  initObservability: vi.fn(),
  structuredLog: vi.fn(),
  trace: vi.fn(async (_name, fn) => fn()),
}));

// ─── Imports (after mocks) ──────────────────────────────────────────

import {
  validateTaskDependencies,
  respawnEligibleTasks,
} from '../../src/orchestra/sprint-controller.js';

import {
  detectScopeCollisions,
  buildCollisionAwareWaves,
} from '../../src/orchestra/conflict-resolver.js';

import { DependencyCycleError } from '../../src/orchestra/parallel-pipeline.js';

import { spawnWorker } from '../../src/orchestra/tmux.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '182-001',
    title: 'Test task',
    description: 'desc',
    model: 'opus',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-182',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeSprint(overrides: Partial<Sprint> = {}): Sprint {
  const tasks = overrides.tasks ?? [makeTask()];
  return {
    id: 'sprint-182',
    number: 182,
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
      default_model: 'opus',
      haiku_allowed: false,
      brain_planning: 'structured',
      brain_model: 'opus',
    },
    modes: {} as ResolvedConfig['modes'],
    ...overrides,
  } as ResolvedConfig;
}

// ═══ Tests ════════════════════════════════════════════════════════════

describe('ADR-045 Wave Pipeline Activation — Sprint 182 W2-1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────
  // Test 1: Kahn TopSort wave inşa
  // ───────────────────────────────────────────────────────────────────

  describe('Test 1 — Kahn TopSort wave inşa (validateTaskDependencies)', () => {
    it('builds correct wave levels from Dependencies field; cycle → DependencyCycleError', () => {
      // Wave layout (Sprint 182 W1→W2→W3 mock):
      //   W1: 182-001, 182-002 (no deps)
      //   W2: 182-003 (deps: 182-001), 182-004 (deps: 182-001, 182-002)
      //   W3: 182-005 (deps: 182-003)
      const tasks: Task[] = [
        makeTask({ id: '182-001', dependencies: [] }),
        makeTask({ id: '182-002', dependencies: [] }),
        makeTask({ id: '182-003', dependencies: ['182-001'] }),
        makeTask({ id: '182-004', dependencies: ['182-001', '182-002'] }),
        makeTask({ id: '182-005', dependencies: ['182-003'] }),
      ];

      const waves = validateTaskDependencies(tasks);

      // Three execution waves
      expect(waves).toHaveLength(3);

      // Wave 0 contains both root tasks
      expect(waves[0]!.taskIds.sort()).toEqual(['182-001', '182-002']);
      // Wave 1 contains tasks whose deps resolve in Wave 0
      expect(waves[1]!.taskIds.sort()).toEqual(['182-003', '182-004']);
      // Wave 2 contains the depth-2 dependent
      expect(waves[2]!.taskIds).toEqual(['182-005']);

      // ADR-045 contract: cycle detection throws DependencyCycleError
      const cyclic: Task[] = [
        makeTask({ id: 'C-1', dependencies: ['C-2'] }),
        makeTask({ id: 'C-2', dependencies: ['C-1'] }),
      ];
      expect(() => validateTaskDependencies(cyclic)).toThrow(DependencyCycleError);
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // Test 2: Sequential dispatch — dependency_pipeline_enabled: true
  // ───────────────────────────────────────────────────────────────────

  describe('Test 2 — Sequential dispatch: W1 hepsi DONE olmadan W2 dispatch ETMEZ', () => {
    it('respects dep gate when dependency_pipeline_enabled: true; passes through when false', async () => {
      // W1: 182-001, 182-002 (no deps) — başlangıçta DONE değil
      // W2: 182-010 (deps: 182-001, 182-002) — bekliyor
      const w1a = makeTask({ id: '182-001', dependencies: [], status: TaskStatus.EXECUTING });
      const w1b = makeTask({ id: '182-002', dependencies: [], status: TaskStatus.EXECUTING });
      const w2 = makeTask({
        id: '182-010',
        dependencies: ['182-001', '182-002'],
        status: TaskStatus.PENDING,
      });
      const sprint = makeSprint({ tasks: [w1a, w1b, w2] });
      const config = makeConfig({ dependency_pipeline_enabled: true });

      // Phase A — Wave 1 yarı tamamlandı (yalnız 182-001 DONE) → W2 spawn YASAK
      w1a.status = TaskStatus.DONE;
      const halfwaySpawned = await respawnEligibleTasks('/tmp/test', sprint, config);
      expect(halfwaySpawned).not.toContain('182-010');
      expect(w2.status).toBe(TaskStatus.PENDING);

      // Phase B — Wave 1 tüm task'lar DONE → W2 spawn HONORED
      w1b.status = TaskStatus.DONE;
      const fullSpawned = await respawnEligibleTasks('/tmp/test', sprint, config);
      expect(fullSpawned).toContain('182-010');
      expect(w2.status).toBe(TaskStatus.EXECUTING);

      // Phase C — Baseline: `dependency_pipeline_enabled: false` no-op
      const disabledSprint = makeSprint({
        tasks: [
          makeTask({ id: '182-020', dependencies: [], status: TaskStatus.EXECUTING }),
          makeTask({ id: '182-021', dependencies: ['182-020'], status: TaskStatus.PENDING }),
        ],
      });
      const disabledConfig = makeConfig({ dependency_pipeline_enabled: false });
      const disabledSpawn = await respawnEligibleTasks('/tmp/test', disabledSprint, disabledConfig);
      // Legacy mode: respawnEligibleTasks returns [] early — no wire activation
      expect(disabledSpawn).toEqual([]);
      // PENDING task remains PENDING — no side effect
      const dependent = disabledSprint.tasks.find(t => t.id === '182-021')!;
      expect(dependent.status).toBe(TaskStatus.PENDING);
      // No tmux worker spawned in baseline path
      expect(vi.mocked(spawnWorker)).not.toHaveBeenCalledWith(
        '182-021',
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // Test 3: Collision-aware wave merge
  // ───────────────────────────────────────────────────────────────────

  describe('Test 3 — Collision-aware wave merge (buildCollisionAwareWaves)', () => {
    it('serializes tasks sharing a write target; independent task stays in early wave', () => {
      // A and B both write src/foo.ts → collision.
      // C writes src/bar.ts → independent.
      // Expectation: A and B end up in different waves (synthetic dep edge
      // lower-ID → higher-ID), C is parallel with A in wave 0.
      const a = makeTask({
        id: '182-100',
        dependencies: [],
        scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/foo.ts'] },
      });
      const b = makeTask({
        id: '182-101',
        dependencies: [],
        scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/foo.ts'] },
      });
      const c = makeTask({
        id: '182-102',
        dependencies: [],
        scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/bar.ts'] },
      });

      // Sanity: collision detector finds the shared writer pair
      const collisionResult = detectScopeCollisions([a, b, c]);
      expect(collisionResult.collisionCount).toBe(1);
      expect(collisionResult.collisions.get('src/foo.ts')?.sort()).toEqual(['182-100', '182-101']);
      expect(collisionResult.collidingPairs).toHaveLength(1);

      // Wave merge with maxWorkers=4 (no wave-size split)
      const waves = buildCollisionAwareWaves([a, b, c], 4);

      // Two waves: {A, C} then {B}  (lower-ID A runs first; B depends on A)
      expect(waves).toHaveLength(2);
      expect(waves[0]!.taskIds.sort()).toEqual(['182-100', '182-102']);
      expect(waves[1]!.taskIds).toEqual(['182-101']);

      // No collisions → no synthetic edges → single wave with all three
      const noCollisionWaves = buildCollisionAwareWaves(
        [
          makeTask({ id: 'X-1', scope: { directories: [], filesRead: [], filesWrite: ['a.ts'] } }),
          makeTask({ id: 'X-2', scope: { directories: [], filesRead: [], filesWrite: ['b.ts'] } }),
          makeTask({ id: 'X-3', scope: { directories: [], filesRead: [], filesWrite: ['c.ts'] } }),
        ],
        4,
      );
      expect(noCollisionWaves).toHaveLength(1);
      expect(noCollisionWaves[0]!.taskIds.sort()).toEqual(['X-1', 'X-2', 'X-3']);
    });
  });
});
