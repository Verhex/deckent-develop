/**
 * tests/orchestra/dependency-pipeline-integration.test.ts
 *
 * ADR-045 / Sprint 164 Task 5: integration test suite that exercises
 * the dependency pipeline wire end-to-end across multiple waves.
 *
 * Unlike `dependency-pipeline-wire.test.ts` (focused on isolated wire
 * invariants), this suite replays the actual multi-tick interaction
 * pattern:
 *   collectResults → applyStatusMutation → respawnEligibleTasks
 * until all eligible tasks have been spawned (or fixpoint reached).
 *
 * 6 scenarios (S1..S6) cover the contractual surface promised by
 * ADR-045 + Sprint 161 stalled forensic replay.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TaskStatus, SprintStatus, SprintPhase,
} from '../../src/core/types.js';
import type { Task, Sprint, ResolvedConfig, TaskResult } from '../../src/core/types.js';

// ─── Mocks (mirror dependency-pipeline-wire.test.ts pattern) ─────────

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
  resolveEffectiveWorkers: vi.fn().mockReturnValue(8),
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
    // applyStatusMutation comes through `...actual` — we want the real impl
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

vi.mock('../../src/core/observability.js', () => ({
  metric: vi.fn(),
  initObservability: vi.fn(),
  structuredLog: vi.fn(),
  trace: vi.fn(async (_name, fn) => fn()),
}));

// ─── Imports (after mocks) ───────────────────────────────────────────

import {
  respawnEligibleTasks,
  validateTaskDependencies,
} from '../../src/orchestra/sprint-controller.js';

import {
  applyStatusMutation,
} from '../../src/orchestra/result-collector.js';

import { spawnWorker } from '../../src/orchestra/tmux.js';
import { writeEvent } from '../../src/orchestra/event-stream.js';
import { DependencyCycleError } from '../../src/orchestra/parallel-pipeline.js';

// ─── Helpers ──────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '164-001',
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
    sprintId: 'sprint-164',
    createdAt: new Date().toISOString(),
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
      max_workers: 8,
      default_model: 'opus',
      haiku_allowed: false,
      brain_planning: 'structured',
      brain_model: 'opus',
    },
    modes: {} as ResolvedConfig['modes'],
    ...overrides,
  } as ResolvedConfig;
}

function makeResult(
  taskId: string,
  selfAssessment: 'DONE' | 'NO_GO' | 'GO_WITH_TECH_DEBT',
): TaskResult {
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

/**
 * Drive the wire end-to-end: applyStatusMutation + respawnEligibleTasks
 * until no new tasks are spawned (fixpoint reached). Mirrors the loop
 * inside `waitForResults` minus the disk I/O.
 *
 * @returns Combined list of all task IDs spawned across all ticks
 */
async function driveToFixpoint(
  sprint: Sprint,
  config: ResolvedConfig,
  resultsByTaskId: Map<string, TaskResult>,
): Promise<{ spawnedAll: string[]; tickCount: number }> {
  const spawnedAll: string[] = [];
  let tickCount = 0;
  // First, apply pre-staged status mutations from results (collectResults sim)
  for (const [taskId, result] of resultsByTaskId) {
    const taskRef = sprint.tasks.find(t => t.id === taskId);
    if (taskRef) applyStatusMutation(taskRef, result);
  }

  for (let i = 0; i < 8; i++) {
    tickCount++;
    const newlySpawned = await respawnEligibleTasks('/tmp/test', sprint, config);
    if (newlySpawned.length === 0) break;
    spawnedAll.push(...newlySpawned);
  }
  return { spawnedAll, tickCount };
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('Dependency Pipeline Integration — ADR-045 / Sprint 164 Task 5', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ════════════════════════════════════════════════════════════════════
  // Scenario 1 — Sprint 161 forensic replay (5 tasks, 5/5 spawn)
  // ════════════════════════════════════════════════════════════════════
  describe('S1: Sprint 161 forensic replay — 5/5 spawn (forensic was 3/5)', () => {
    it('spawns Wave 2 (T4) and Wave 3 (T5) tasks across ticks; no ghosts', async () => {
      // Wave 1 (no deps): T1, T2, T3 — start EXECUTING (already spawned)
      const t1 = makeTask({ id: '164-001', dependencies: [], status: TaskStatus.EXECUTING });
      const t2 = makeTask({ id: '164-002', dependencies: [], status: TaskStatus.EXECUTING });
      const t3 = makeTask({ id: '164-003', dependencies: [], status: TaskStatus.EXECUTING });
      // Wave 2: T4 depends on T2 only
      const t4 = makeTask({ id: '164-004', dependencies: ['164-002'], status: TaskStatus.PENDING });
      // Wave 3: T5 depends on T1 + T2 + T4
      const t5 = makeTask({
        id: '164-005',
        dependencies: ['164-001', '164-002', '164-004'],
        status: TaskStatus.PENDING,
      });
      const sprint = makeSprint({ tasks: [t1, t2, t3, t4, t5] });
      const config = makeConfig({ dependency_pipeline_enabled: true });

      // Tick 1: T1+T2+T3 DONE arrives → T4 eligible (T5 still blocked on T4)
      const tick1Results = new Map<string, TaskResult>([
        ['164-001', makeResult('164-001', 'DONE')],
        ['164-002', makeResult('164-002', 'DONE')],
        ['164-003', makeResult('164-003', 'DONE')],
      ]);
      for (const [taskId, result] of tick1Results) {
        const taskRef = sprint.tasks.find(t => t.id === taskId)!;
        applyStatusMutation(taskRef, result);
      }
      const spawnedTick1 = await respawnEligibleTasks('/tmp/test', sprint, config);
      expect(spawnedTick1).toContain('164-004');
      expect(spawnedTick1).not.toContain('164-005'); // T5 still blocked on T4
      expect(t4.status).toBe(TaskStatus.EXECUTING);
      expect(t5.status).toBe(TaskStatus.PENDING);

      // Tick 2: T4 DONE arrives → T5 eligible
      applyStatusMutation(t4, makeResult('164-004', 'DONE'));
      const spawnedTick2 = await respawnEligibleTasks('/tmp/test', sprint, config);
      expect(spawnedTick2).toContain('164-005');
      expect(t5.status).toBe(TaskStatus.EXECUTING);

      // Forensic invariant: total spawned across ticks = 2 (Wave 2 + Wave 3)
      // combined with the 3 pre-spawned Wave 1 = 5/5 (no ghosts)
      const totalEverActiveOrDone = sprint.tasks.filter(
        t => t.status === TaskStatus.EXECUTING || t.status === TaskStatus.DONE,
      ).length;
      expect(totalEverActiveOrDone).toBe(5);

      // wave.respawn metric was emitted via event stream
      const writeEventCalls = vi.mocked(writeEvent).mock.calls;
      const metricEmittedEvents = writeEventCalls.filter(
        ([, , , , channel]) => channel === 'BRAIN→*:METRIC_EMITTED',
      );
      expect(metricEmittedEvents.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // Scenario 2 — Diamond dependency (A → B, A → C, B+C → D)
  // ════════════════════════════════════════════════════════════════════
  describe('S2: Diamond dependency — topological order (Kahn runtime)', () => {
    it('spawns B+C in the same tick after A DONE; D spawns only after both B+C DONE', async () => {
      const a = makeTask({ id: '164-A', dependencies: [], status: TaskStatus.EXECUTING });
      const b = makeTask({ id: '164-B', dependencies: ['164-A'], status: TaskStatus.PENDING });
      const c = makeTask({ id: '164-C', dependencies: ['164-A'], status: TaskStatus.PENDING });
      const d = makeTask({ id: '164-D', dependencies: ['164-B', '164-C'], status: TaskStatus.PENDING });
      const sprint = makeSprint({ tasks: [a, b, c, d] });
      const config = makeConfig({ dependency_pipeline_enabled: true });

      // Tick 1: A DONE → B+C eligible (parallel spawn — same tick)
      applyStatusMutation(a, makeResult('164-A', 'DONE'));
      const spawnedTick1 = await respawnEligibleTasks('/tmp/test', sprint, config);
      expect(spawnedTick1).toContain('164-B');
      expect(spawnedTick1).toContain('164-C');
      expect(spawnedTick1).not.toContain('164-D'); // D still blocked
      expect(b.status).toBe(TaskStatus.EXECUTING);
      expect(c.status).toBe(TaskStatus.EXECUTING);
      expect(d.status).toBe(TaskStatus.PENDING);

      // Tick 2: only B DONE → D still blocked (C still EXECUTING)
      applyStatusMutation(b, makeResult('164-B', 'DONE'));
      const spawnedTick2 = await respawnEligibleTasks('/tmp/test', sprint, config);
      expect(spawnedTick2).not.toContain('164-D');
      expect(d.status).toBe(TaskStatus.PENDING);

      // Tick 3: C DONE → D eligible
      applyStatusMutation(c, makeResult('164-C', 'DONE'));
      const spawnedTick3 = await respawnEligibleTasks('/tmp/test', sprint, config);
      expect(spawnedTick3).toContain('164-D');
      expect(d.status).toBe(TaskStatus.EXECUTING);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // Scenario 3 — NO_GO cascade (DEPENDENCY_BLOCKED event)
  // ════════════════════════════════════════════════════════════════════
  describe('S3: NO_GO cascade — DEPENDENCY_BLOCKED event emitted', () => {
    it('does not spawn dependent task when upstream is NO_GO; emits BRAIN→WORKER:DEPENDENCY_BLOCKED', async () => {
      const a = makeTask({ id: '164-A', dependencies: [], status: TaskStatus.EXECUTING });
      const b = makeTask({ id: '164-B', dependencies: ['164-A'], status: TaskStatus.PENDING });
      const sprint = makeSprint({ tasks: [a, b] });
      const config = makeConfig({ dependency_pipeline_enabled: true });

      // A → NO_GO
      applyStatusMutation(a, makeResult('164-A', 'NO_GO'));
      expect(a.status).toBe(TaskStatus.NO_GO);

      const spawned = await respawnEligibleTasks('/tmp/test', sprint, config);

      // B must remain PENDING (no spawn, no hang, no ghost)
      expect(spawned).not.toContain('164-B');
      expect(b.status).toBe(TaskStatus.PENDING);

      // BRAIN→WORKER:DEPENDENCY_BLOCKED event was emitted for B with A
      // listed in unresolvedDeps
      const writeEventCalls = vi.mocked(writeEvent).mock.calls;
      const blockedEvents = writeEventCalls.filter(
        ([, , , , channel]) => channel === 'BRAIN→WORKER:DEPENDENCY_BLOCKED',
      );
      expect(blockedEvents.length).toBeGreaterThanOrEqual(1);
      const blockedForB = blockedEvents.find(
        ([, , , , , payload]) => (payload as { taskId: string }).taskId === '164-B',
      );
      expect(blockedForB).toBeDefined();
      const payload = blockedForB![5] as { taskId: string; unresolvedDeps: string[] };
      expect(payload.unresolvedDeps).toContain('164-A');
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // Scenario 4 — GO_WITH_TECH_DEBT (debt-DONE counts as DONE)
  // ════════════════════════════════════════════════════════════════════
  describe('S4: GO_WITH_TECH_DEBT path — ADR-045 Consequences', () => {
    it('debt result mutates taskRef to TaskStatus.DONE; dependent task spawns', async () => {
      const a = makeTask({ id: '164-A', dependencies: [], status: TaskStatus.EXECUTING });
      const b = makeTask({ id: '164-B', dependencies: ['164-A'], status: TaskStatus.PENDING });
      const sprint = makeSprint({ tasks: [a, b] });
      const config = makeConfig({ dependency_pipeline_enabled: true });

      // A → GO_WITH_TECH_DEBT (debt-DONE)
      applyStatusMutation(a, makeResult('164-A', 'GO_WITH_TECH_DEBT'));
      // ADR-045 Consequence: debt-DONE status is TaskStatus.DONE for dep filter
      expect(a.status).toBe(TaskStatus.DONE);

      const spawned = await respawnEligibleTasks('/tmp/test', sprint, config);

      // B spawns — debt-DONE upstream counts as DONE
      expect(spawned).toContain('164-B');
      expect(b.status).toBe(TaskStatus.EXECUTING);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // Scenario 5 — Slot constraint (maxWorkers=2, 3 eligible)
  // ════════════════════════════════════════════════════════════════════
  describe('S5: Slot constraint — maxWorkers=2, 3 eligible → first 2 spawn, 3rd waits', () => {
    it('respects slotsAvailable; 3rd eligible stays PENDING until slot opens', async () => {
      const cfgMod = await import('../../src/core/config.js');
      vi.mocked(cfgMod.resolveEffectiveWorkers).mockReturnValue(2);

      const a = makeTask({ id: '164-A', dependencies: [], status: TaskStatus.DONE });
      const e1 = makeTask({ id: '164-E1', dependencies: ['164-A'], status: TaskStatus.PENDING });
      const e2 = makeTask({ id: '164-E2', dependencies: ['164-A'], status: TaskStatus.PENDING });
      const e3 = makeTask({ id: '164-E3', dependencies: ['164-A'], status: TaskStatus.PENDING });
      const sprint = makeSprint({ tasks: [a, e1, e2, e3] });
      const config = makeConfig({ dependency_pipeline_enabled: true });

      // Tick 1: maxWorkers=2, currentlyExecuting=0 → 2 spawn, 1 still PENDING
      const spawnedTick1 = await respawnEligibleTasks('/tmp/test', sprint, config);
      expect(spawnedTick1).toHaveLength(2);
      const stillPendingAfter1 = [e1, e2, e3].filter(t => t.status === TaskStatus.PENDING);
      expect(stillPendingAfter1).toHaveLength(1);
      // currentlyExecuting counted correctly: 2 spawned + 0 already executing = 2
      const executingAfter1 = sprint.tasks.filter(t => t.status === TaskStatus.EXECUTING);
      expect(executingAfter1).toHaveLength(2);

      // Tick 2: slots still saturated (both spawned are still EXECUTING) → no new spawn
      const spawnedTick2 = await respawnEligibleTasks('/tmp/test', sprint, config);
      expect(spawnedTick2).toEqual([]);
      expect(stillPendingAfter1[0]!.status).toBe(TaskStatus.PENDING);

      // Tick 3: one finished → slot opens → 3rd spawns
      const oneExecuting = executingAfter1[0]!;
      applyStatusMutation(oneExecuting, makeResult(oneExecuting.id, 'DONE'));
      const spawnedTick3 = await respawnEligibleTasks('/tmp/test', sprint, config);
      expect(spawnedTick3).toHaveLength(1);
      const finalPending = sprint.tasks.filter(t => t.status === TaskStatus.PENDING);
      expect(finalPending).toHaveLength(0);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // Scenario 6 — Cycle detection (DependencyCycleError DECKENT_E049)
  // ════════════════════════════════════════════════════════════════════
  describe('S6: Cycle detection — DependencyCycleError with code DECKENT_E049', () => {
    it('throws DependencyCycleError when A→B and B→A; error.code matches', async () => {
      const a = makeTask({ id: '164-A', dependencies: ['164-B'] });
      const b = makeTask({ id: '164-B', dependencies: ['164-A'] });

      expect(() => validateTaskDependencies([a, b])).toThrow(DependencyCycleError);
    });

    it('error message and code carry forensic information', async () => {
      const a = makeTask({ id: '164-A', dependencies: ['164-B'] });
      const b = makeTask({ id: '164-B', dependencies: ['164-A'] });

      try {
        validateTaskDependencies([a, b]);
        expect.fail('Should have thrown DependencyCycleError');
      } catch (e) {
        expect(e).toBeInstanceOf(DependencyCycleError);
        const err = e as DependencyCycleError;
        expect(err.code).toBe('DECKENT_E049');
        expect(err.taskIds).toContain('164-A');
        expect(err.taskIds).toContain('164-B');
        expect(err.message).toMatch(/Circular dependency detected/i);
      }
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // Cross-scenario sanity: spawnWorker mock invoked across spawn paths
  // ════════════════════════════════════════════════════════════════════
  describe('cross-cutting: real spawn paths exercised', () => {
    it('drives a 3-tier (S1 reduction) fixture to fixpoint via driveToFixpoint helper', async () => {
      const a = makeTask({ id: '164-A', dependencies: [], status: TaskStatus.EXECUTING });
      const b = makeTask({ id: '164-B', dependencies: ['164-A'], status: TaskStatus.PENDING });
      const c = makeTask({ id: '164-C', dependencies: ['164-B'], status: TaskStatus.PENDING });
      const sprint = makeSprint({ tasks: [a, b, c] });
      const config = makeConfig({ dependency_pipeline_enabled: true });

      // Stage A as DONE; then drive ticks to spawn B; then mutate B → DONE
      // again outside the helper to spawn C. driveToFixpoint shows that
      // a single batch with only A→DONE results in 1 spawn (B), not 2.
      const stagedResults = new Map<string, TaskResult>([
        ['164-A', makeResult('164-A', 'DONE')],
      ]);
      const { spawnedAll, tickCount } = await driveToFixpoint(sprint, config, stagedResults);
      expect(spawnedAll).toContain('164-B');
      expect(spawnedAll).not.toContain('164-C');
      expect(tickCount).toBeGreaterThanOrEqual(1);

      // tmux spawnWorker mock was invoked for at least one task
      expect(vi.mocked(spawnWorker).mock.calls.length).toBeGreaterThanOrEqual(1);
    });
  });
});
