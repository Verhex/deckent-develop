/**
 * tests/orchestra/dependency-pipeline.test.ts
 *
 * Tests for the Task Dependency Pipeline (Sprint 134 Task 1):
 *   1. parseDependenciesDirective — parse "- Dependencies: 134-005, 134-007"
 *   2. spawnWorkers spawn guard — deps not DONE → task not spawned
 *   3. respawnEligibleTasks — dep DONE → spawn newly eligible tasks
 *   4. DependencyCycleError — circular T1↔T2 → error
 *   5. Fallback — dependency_pipeline_enabled=false → legacy behavior
 *   6. wave.transition metric callback
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TaskStatus, SprintStatus, SprintPhase,
} from '../../src/core/types.js';
import type { Task, Sprint, ResolvedConfig } from '../../src/core/types.js';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  unlinkSync: vi.fn(),
  statSync: vi.fn(),
  appendFileSync: vi.fn(),
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
    getNextSprintId: vi.fn().mockReturnValue('sprint-134'),
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

vi.mock('../../src/core/skill-selector.js', () => ({
  selectSkills: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/core/agent-selector.js', () => ({
  selectAgent: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/core/routing-engine.js', () => ({
  routeTaskV2: vi.fn(),
}));

vi.mock('../../src/core/stack-detector.js', () => ({
  detectProjectStack: vi.fn().mockReturnValue({ language: 'typescript' }),
}));

vi.mock('../../src/agents/worker.js', () => ({
  releaseAllLocks: vi.fn(),
}));

vi.mock('../../src/core/provider.js', () => ({
  providerRegistry: {
    listProviders: vi.fn().mockReturnValue(['claude']),
    get: vi.fn().mockReturnValue(null),
  },
}));

vi.mock('../../src/core/multi-ide.js', () => ({
  acquireSprintLock: vi.fn().mockReturnValue(true),
  releaseSprintLock: vi.fn(),
}));

vi.mock('../../src/core/plugin-hooks.js', () => ({
  loadPluginHooks: vi.fn(),
  runHooks: vi.fn(),
  clearHooks: vi.fn(),
}));

vi.mock('../../src/cli/helpers/sprint-summary-rich.js', () => ({
  formatRichSprintSummary: vi.fn().mockReturnValue(''),
}));

vi.mock('../../src/orchestra/result-collector.js', () => ({
  waitForResults: vi.fn().mockResolvedValue([]),
  resolveAgentPrompt: vi.fn().mockReturnValue(undefined),
  resolveSkillPrompts: vi.fn().mockReturnValue([]),
  buildResultsMap: vi.fn().mockReturnValue(new Map()),
}));

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
    writeSprintState: vi.fn(),
    readSprintState: vi.fn().mockReturnValue(null),
    clearSprintState: vi.fn(),
    detectOrphanWorkers: vi.fn().mockReturnValue([]),
    buildSpawnRetryHint: vi.fn().mockReturnValue(''),
    extractGoNogoCriteria: actual.extractGoNogoCriteria,
    PAUSE_STATE_FILE: '.deckent/pause-state.json',
    resolveDefaultUsageCli: vi.fn().mockReturnValue('claude'),
    isDocTask: vi.fn().mockReturnValue(false),
    isStaleTaskFile: vi.fn().mockReturnValue(false),
    getSubprocessWorkerLogPath: vi.fn().mockReturnValue(''),
    readSubprocessWorkerLog: vi.fn().mockReturnValue(''),
    hasSubprocessWorkerLog: vi.fn().mockReturnValue(false),
  };
});

vi.mock('../../src/orchestra/model-selector.js', () => ({
  resolveTaskModel: vi.fn().mockReturnValue('opus'),
  parsePatterns: vi.fn().mockReturnValue([]),
  deduplicatePatterns: vi.fn().mockReturnValue([]),
  calculateModelScore: vi.fn().mockReturnValue(3),
}));

vi.mock('../../src/orchestra/debt-manager.js', () => ({
  runDecay: vi.fn(),
}));

vi.mock('../../src/orchestra/sprint-reporter.js', () => ({
  writeRetrospective: vi.fn(),
  writeSprintLog: vi.fn(),
  calculateMetrics: vi.fn().mockReturnValue({}),
  updateProjectDocs: vi.fn(),
  updateProjectIdentity: vi.fn(),
  buildAgentPerformance: vi.fn().mockReturnValue({}),
  archiveDirectives: vi.fn(),
}));

vi.mock('../../src/orchestra/result-evaluator.js', () => ({
  getRecentSprintStats: vi.fn().mockReturnValue({ avgCoverage: 85, avgNoGoRate: 0 }),
}));

vi.mock('../../src/orchestra/coverage-validator.js', () => ({
  validateWorkerCoverage: vi.fn().mockReturnValue(true),
}));

vi.mock('../../src/orchestra/task-router.js', () => ({
  routeTask: vi.fn().mockReturnValue({ provider: 'claude', agent: 'generic', skills: [] }),
}));

vi.mock('../../src/agents/worker-ipc.js', () => {
  const channels = new Map();
  return {
    ChannelRegistry: vi.fn().mockImplementation(() => ({
      get: vi.fn(() => null),
      set: vi.fn(),
      clear: vi.fn(() => channels.clear()),
    })),
    WorkerChannel: vi.fn(),
  };
});

vi.mock('../../src/orchestra/sprint-phases.js', () => ({
  runPlanPhase: vi.fn(),
  runSpawnPhase: vi.fn(),
  runEvaluatePhase: vi.fn(),
  runRollbackCheck: vi.fn(),
  runFixPhase: vi.fn(),
  runRetroPhase: vi.fn(),
  runCleanupPhase: vi.fn(),
}));

// ─── Imports (after mocks) ───────────────────────────────────────────

import { writeFileSync } from 'node:fs';
import { spawnWorker } from '../../src/orchestra/tmux.js';

import {
  parseDependenciesDirective,
  parseStructuredDirectives,
} from '../../src/orchestra/task-builder.js';

import {
  spawnWorkers,
  respawnEligibleTasks,
  validateTaskDependencies,
} from '../../src/orchestra/sprint-controller.js';

import {
  ParallelPipelineManager,
  DependencyCycleError,
} from '../../src/orchestra/parallel-pipeline.js';

// ─── Helpers ──────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '134-001',
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
    sprintId: 'sprint-134',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeSprint(overrides: Partial<Sprint> = {}): Sprint {
  const tasks = overrides.tasks ?? [makeTask()];
  return {
    id: 'sprint-134',
    number: 134,
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

// ─── Tests ────────────────────────────────────────────────────────────

describe('Dependency Pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ═══ Test 1: parseDependenciesDirective ═══════════════════════════

  describe('parseDependenciesDirective', () => {
    it('parses "- Dependencies: 134-005" into ["134-005"]', () => {
      const result = parseDependenciesDirective('- Dependencies: 134-005');
      expect(result).toEqual(['134-005']);
    });

    it('parses comma-separated dependencies', () => {
      const result = parseDependenciesDirective('- Dependencies: 134-005, 134-007');
      expect(result).toEqual(['134-005', '134-007']);
    });

    it('returns undefined for no line', () => {
      expect(parseDependenciesDirective(undefined)).toBeUndefined();
    });

    it('returns undefined for "none"', () => {
      expect(parseDependenciesDirective('- Dependencies: none')).toBeUndefined();
    });

    it('returns undefined for empty value', () => {
      expect(parseDependenciesDirective('- Dependencies: ')).toBeUndefined();
    });

    it('trims whitespace from IDs', () => {
      const result = parseDependenciesDirective('Dependencies:  134-005 ,  134-007 ');
      expect(result).toEqual(['134-005', '134-007']);
    });
  });

  // ═══ Test 1b: parseStructuredDirectives integrates dependencies ═══

  describe('parseStructuredDirectives — dependencies', () => {
    it('parses Dependencies line from DIRECTIVES block', () => {
      const content = `# DIRECTIVES — Sprint 134

## Goal: Test sprint

---

## Task 1: Dependency Test
- Model: sonnet
- Effort: normal
- Dependencies: 134-005, 134-007
- Files: src/core/config.ts
- Scope: src/core/

### Description
Test task with dependencies.
`;
      const tasks = parseStructuredDirectives(content);
      expect(tasks).toHaveLength(1);
      expect(tasks[0]!.dependencies).toEqual(['134-005', '134-007']);
    });

    it('returns undefined dependencies when no Dependencies line', () => {
      const content = `# DIRECTIVES — Sprint 134

## Goal: Test

---

## Task 1: No Deps Task
- Model: sonnet
- Effort: normal
- Files: src/core/config.ts
- Scope: src/core/

### Description
Task without dependencies.
`;
      const tasks = parseStructuredDirectives(content);
      expect(tasks).toHaveLength(1);
      expect(tasks[0]!.dependencies).toBeUndefined();
    });
  });

  // ═══ Test 2: Spawn guard — deps not DONE → task not spawned ════════

  describe('spawnWorkers — dependency guard', () => {
    it('does not spawn task with unresolved dependencies when pipeline enabled', () => {
      const t1 = makeTask({ id: '134-001', dependencies: ['134-002'], status: TaskStatus.PENDING });
      const t2 = makeTask({ id: '134-002', dependencies: [], status: TaskStatus.PENDING });
      const sprint = makeSprint({ tasks: [t1, t2] });
      const config = makeConfig({ dependency_pipeline_enabled: true });

      spawnWorkers('/tmp/test', sprint, config);

      // t2 has no deps → should be spawned (EXECUTING)
      // t1 depends on t2 which is PENDING → should NOT be spawned
      expect(t2.status).toBe(TaskStatus.EXECUTING);
      expect(t1.status).toBe(TaskStatus.PENDING);
    });

    it('spawns task when all dependencies are DONE', () => {
      const t1 = makeTask({ id: '134-001', dependencies: ['134-002'], status: TaskStatus.PENDING });
      const t2 = makeTask({ id: '134-002', dependencies: [], status: TaskStatus.DONE });
      const sprint = makeSprint({ tasks: [t1, t2] });
      const config = makeConfig({ dependency_pipeline_enabled: true });

      spawnWorkers('/tmp/test', sprint, config);

      // t1's dep (t2) is DONE → t1 should be spawned
      expect(t1.status).toBe(TaskStatus.EXECUTING);
    });
  });

  // ═══ Test 3: respawnEligibleTasks ═════════════════════════════════

  describe('respawnEligibleTasks', () => {
    it('spawns newly eligible tasks after dependency completes', () => {
      const t1 = makeTask({ id: '134-001', dependencies: ['134-002'], status: TaskStatus.PENDING });
      const t2 = makeTask({ id: '134-002', dependencies: [], status: TaskStatus.DONE });
      const sprint = makeSprint({ tasks: [t1, t2] });
      const config = makeConfig({ dependency_pipeline_enabled: true });

      const spawned = respawnEligibleTasks('/tmp/test', sprint, config);

      expect(spawned).toContain('134-001');
      expect(t1.status).toBe(TaskStatus.EXECUTING);
    });

    it('returns empty when pipeline disabled', () => {
      const t1 = makeTask({ id: '134-001', dependencies: ['134-002'], status: TaskStatus.PENDING });
      const t2 = makeTask({ id: '134-002', dependencies: [], status: TaskStatus.DONE });
      const sprint = makeSprint({ tasks: [t1, t2] });
      const config = makeConfig({ dependency_pipeline_enabled: false });

      const spawned = respawnEligibleTasks('/tmp/test', sprint, config);

      expect(spawned).toEqual([]);
    });

    it('does not spawn tasks with still-pending deps', () => {
      const t1 = makeTask({ id: '134-001', dependencies: ['134-002', '134-003'], status: TaskStatus.PENDING });
      const t2 = makeTask({ id: '134-002', dependencies: [], status: TaskStatus.DONE });
      const t3 = makeTask({ id: '134-003', dependencies: [], status: TaskStatus.PENDING });
      const sprint = makeSprint({ tasks: [t1, t2, t3] });
      const config = makeConfig({ dependency_pipeline_enabled: true });

      const spawned = respawnEligibleTasks('/tmp/test', sprint, config);

      // t1 depends on both t2 and t3; t3 is still PENDING
      expect(spawned).toEqual([]);
      expect(t1.status).toBe(TaskStatus.PENDING);
    });
  });

  // ═══ Test 4: DependencyCycleError ═════════════════════════════════

  describe('DependencyCycleError', () => {
    it('throws DependencyCycleError for circular T1↔T2', () => {
      const t1 = makeTask({ id: '134-001', dependencies: ['134-002'] });
      const t2 = makeTask({ id: '134-002', dependencies: ['134-001'] });

      expect(() => validateTaskDependencies([t1, t2])).toThrow(DependencyCycleError);
    });

    it('DependencyCycleError includes task IDs', () => {
      const t1 = makeTask({ id: '134-001', dependencies: ['134-002'] });
      const t2 = makeTask({ id: '134-002', dependencies: ['134-001'] });

      try {
        validateTaskDependencies([t1, t2]);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(DependencyCycleError);
        expect((e as DependencyCycleError).taskIds).toContain('134-001');
        expect((e as DependencyCycleError).taskIds).toContain('134-002');
      }
    });

    it('validates clean dependency graph without throwing', () => {
      const t1 = makeTask({ id: '134-001', dependencies: [] });
      const t2 = makeTask({ id: '134-002', dependencies: ['134-001'] });

      const waves = validateTaskDependencies([t1, t2]);
      expect(waves).toHaveLength(2);
      expect(waves[0]!.taskIds).toEqual(['134-001']);
      expect(waves[1]!.taskIds).toEqual(['134-002']);
    });
  });

  // ═══ Test 5: Fallback — legacy behavior when flag=false ═══════════

  describe('spawnWorkers — fallback (pipeline disabled)', () => {
    it('spawns all PENDING tasks regardless of deps when pipeline disabled', () => {
      const t1 = makeTask({ id: '134-001', dependencies: ['134-002'], status: TaskStatus.PENDING });
      const t2 = makeTask({ id: '134-002', dependencies: [], status: TaskStatus.PENDING });
      const sprint = makeSprint({ tasks: [t1, t2] });
      const config = makeConfig({ dependency_pipeline_enabled: false });

      spawnWorkers('/tmp/test', sprint, config);

      // Both should be spawned — legacy behavior ignores dependencies
      expect(t1.status).toBe(TaskStatus.EXECUTING);
      expect(t2.status).toBe(TaskStatus.EXECUTING);
    });

    it('spawns all tasks when pipeline not configured (undefined)', () => {
      const t1 = makeTask({ id: '134-001', dependencies: ['134-002'], status: TaskStatus.PENDING });
      const t2 = makeTask({ id: '134-002', dependencies: [], status: TaskStatus.PENDING });
      const sprint = makeSprint({ tasks: [t1, t2] });
      const config = makeConfig(); // no dependency_pipeline_enabled

      spawnWorkers('/tmp/test', sprint, config);

      expect(t1.status).toBe(TaskStatus.EXECUTING);
      expect(t2.status).toBe(TaskStatus.EXECUTING);
    });
  });

  // ═══ Test 6: wave.transition metric callback ═════════════════════

  describe('respawnEligibleTasks — wave.transition callback', () => {
    it('calls onWaveTransition with duration when tasks are respawned', () => {
      const t1 = makeTask({ id: '134-001', dependencies: ['134-002'], status: TaskStatus.PENDING });
      const t2 = makeTask({ id: '134-002', dependencies: [], status: TaskStatus.DONE });
      const sprint = makeSprint({ tasks: [t1, t2] });
      const config = makeConfig({ dependency_pipeline_enabled: true });

      const onWave = vi.fn();
      respawnEligibleTasks('/tmp/test', sprint, config, undefined, onWave);

      expect(onWave).toHaveBeenCalledTimes(1);
      expect(onWave).toHaveBeenCalledWith(
        expect.any(Number),
        'dep-wait',
        expect.stringContaining('wave-'),
      );
    });

    it('does not call onWaveTransition when no tasks spawned', () => {
      const t1 = makeTask({ id: '134-001', dependencies: ['134-002'], status: TaskStatus.PENDING });
      const t2 = makeTask({ id: '134-002', dependencies: [], status: TaskStatus.PENDING });
      const sprint = makeSprint({ tasks: [t1, t2] });
      const config = makeConfig({ dependency_pipeline_enabled: true });

      const onWave = vi.fn();
      respawnEligibleTasks('/tmp/test', sprint, config, undefined, onWave);

      expect(onWave).not.toHaveBeenCalled();
    });
  });
});
