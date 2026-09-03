/**
 * 413-004 SCHED3 — canonical spawn executor tests.
 *
 * docs/analysis/scheduler-unify-design-2026-07-11.md (Sprint-3 slice): before
 * this task, two divergent spawn executors existed — the heavyweight
 * dependency-respawn path (sprint-spawner.ts respawnEligibleTasks) applied
 * fix-task routing-lineage inheritance and persisted task-<id>.json; the
 * local queue-driven path (result-collector.ts spawnIfNotAssigned, shared by
 * processQueue / forceRescanIfIdle / dispatchReadyTasks) did neither. A
 * task's routing fate depended on which trigger happened to spawn it.
 *
 * This suite pins:
 *   1. `executeSpawnTask` (scheduler-effects.ts) applies fix-routing-lineage
 *      inheritance BEFORE prompt/provider/backend/effort resolution, and
 *      preserves an explicit fix-task override instead of clobbering it.
 *   2. `executeSpawnTask` returns an honest `routing-lineage-missing`
 *      disposition (spawn blocked, no persistence) instead of the prior
 *      fail-soft no-op when the original task cannot be read.
 *   3. `executeSpawnTask` persists task-<id>.json exactly once, on every
 *      caller.
 *   4. Resolution parity: the SAME fix-task fixture resolves to the SAME
 *      forceModel/provider/backend/modelEffort regardless of whether it is
 *      invoked with "local path"-shaped deps (processQueue / forceRescanIfIdle
 *      / dispatchReadyTasks — all three share ONE spawnIfNotAssigned closure,
 *      so one representative deps shape covers all three trigger call sites)
 *      or "heavyweight respawn"-shaped deps (respawnEligibleTasks).
 *   5. Two CONSCIOUS behavior changes, each independently pinned via a live
 *      `waitForResults` integration test that exercises the real wiring (not
 *      just the executor in isolation):
 *        (a) the local/queue path now applies fix-task routing inheritance
 *            (queue-completion trigger, i.e. processQueue).
 *        (b) the local/queue path now persists task-<id>.json after spawn
 *            (dep-ready trigger, i.e. dispatchReadyTasks).
 *      The third live trigger (forceRescanIfIdle / idle-rescan) shares the
 *      identical `spawnIfNotAssigned` closure reference as the two triggers
 *      above (see result-collector.ts — processQueue/forceRescanIfIdle/
 *      dispatchReadyTasks/drainNervousRespawns all call `spawnIfNotAssigned`)
 *      and is gated by a real 5-minute idle clock with no injectable override,
 *      so its parity is established structurally (same function reference,
 *      same deps-construction code) rather than independently live-tested.
 */
import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';
import {
  mkdirSync, writeFileSync, readFileSync, existsSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

vi.mock('../../src/orchestra/task-builder.js', () => ({
  // Plain functions (not vi.fn) so beforeEach resetAllMocks cannot strip the
  // implementation the spawner depends on (skillDelivery.deliveredSkillIds).
  writeSkillDeliveryEvidence: () => {},
  applySkillDirectiveAuthority: (task: { assignedSkills?: string[] }) => task?.assignedSkills ?? [],
  buildSkillDeliveryEvidence: (task: { id?: string; assignedSkills?: string[]; forceSkills?: string[] }, delivered?: readonly string[]) => ({
    version: 1, taskId: task?.id ?? '', source: 'worker-prompt',
    deliveredSkillIds: [...(delivered ?? [])],
    assignedSkillIds: [...(task?.assignedSkills ?? [])],
    forcedSkillIds: [...(task?.forceSkills ?? [])],
    undeliveredForcedSkillIds: (task?.forceSkills ?? []).filter((id) => !(delivered ?? []).includes(id)),
  }),
  buildWorkerPrompt: vi.fn((...args: unknown[]) => {
    const options = args[8] as {
      sink?: { artifact?: unknown; receipt?: unknown };
    } | undefined;
    if (options?.sink) {
      options.sink.artifact = {
        planId: `prompt-compile-plan:sha256:${'1'.repeat(64)}`,
        prompt: 'mock-prompt',
        compilePlan: { rolePolicyIdentity: 'worker:generic' },
        segments: [{ tier: 'T0', kind: 'worker-contract', content: 'mock-prompt' }],
        metadata: { estimatedTokens: 3 },
      };
      options.sink.receipt = {
        version: 2,
        taskId: (args[0] as { id: string }).id,
        source: 'worker-prompt',
        promptSha256: '1'.repeat(64),
        promptCompilePlanId: `prompt-compile-plan:sha256:${'1'.repeat(64)}`,
        rolePolicyIdentity: 'worker:generic',
        assignedAgentId: 'generic',
        deliveredAgentId: null,
        personaSegmentSha256: null,
        assignedSkillIds: [],
        deliveredSkillIds: [],
        forcedSkillIds: [],
        undeliveredForcedSkillIds: [],
      };
    }
    return 'mock-prompt';
  }),
}));

vi.mock('../../src/orchestra/tmux.js', () => ({
  spawnWorker: vi.fn(),
  killWorker: vi.fn(),
}));

vi.mock('../../src/orchestra/result-watcher.js', () => ({
  createResultWatcher: vi.fn(() => ({
    waitForChange: vi.fn(() => Promise.resolve()),
    close: vi.fn(),
  })),
}));

import {
  TaskStatus,
  SprintPhase,
  SprintStatus,
  deriveProductionWiringApplicability,
} from '../../src/core/types.js';
import type { Task, ResolvedConfig, Sprint } from '../../src/core/types.js';
import type { SpawnBackend, SpawnBackendOptions } from '../../src/orchestra/spawn-backend.js';
import {
  createExactNormalDockerExecutionRegistry,
  executeSpawnTask,
  type SpawnTaskDeps,
} from '../../src/orchestra/scheduler-effects.js';
import { spawnWorker } from '../../src/orchestra/tmux.js';
import { waitForResults } from '../../src/orchestra/result-collector.js';
import { buildWorkerPrompt } from '../../src/orchestra/task-builder.js';
import { ProviderExecutionIngressHoldError } from '../../src/core/provider-execution-ingress-authority.js';
import { providerRegistry } from '../../src/core/provider.js';
import { createTaskResultSettlementV2Fixture } from '../helpers/task-result-settlement-v2-fixture.js';
import type { ProviderAdapter } from '../../src/core/provider.js';
import { CHANNELS, readEvents } from '../../src/orchestra/event-stream.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTmpDir(prefix: string): string {
  const dir = join(tmpdir(), `${prefix}-${randomBytes(4).toString('hex')}`);
  mkdirSync(join(dir, '.tasks'), { recursive: true });
  mkdirSync(join(dir, '.deckent'), { recursive: true });
  writeFileSync(
    join(dir, '.deckent', 'cost-config.json'),
    readFileSync(join(process.cwd(), 'src', 'core', 'pricing-data-baseline.json'), 'utf-8'),
    'utf-8',
  );
  return dir;
}

function makeTask(id: string, overrides?: Partial<Task>): Task {
  return {
    id,
    title: `Task ${id}`,
    description: `desc ${id}`,
    model: 'claude-sonnet-5',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'no' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-sched3',
    createdAt: new Date().toISOString(),
    assignedAgent: 'generic',
    assignedSkills: [],
    budget: { maxTurns: 1 },
    budgetPolicy: {
      state: 'allow',
      role: 'worker',
      taskKind: 'code-development',
      resolvedProvider: 'claude',
      executionCostClass: 'remote',
      profileRef: 'tests.orchestra.scheduler-spawn-executor',
      policyDigest: '9'.repeat(64),
      admissionMode: 'unattended',
      landingPolicy: { reserve_ratio: 0.25 },
    },
    ...overrides,
  } as Task;
}

interface MockSpawnCall {
  taskId: string;
  model: string;
  prompt: string;
  opts?: SpawnBackendOptions;
}

function makeMockBackend(): SpawnBackend & { calls: MockSpawnCall[] } {
  const calls: MockSpawnCall[] = [];
  return {
    name: 'mock-backend',
    liveUsageBudgetSupport: 'measured-stream',
    executionLandingCapability: 'cooperative-landing',
    spawn(taskId, model, prompt, opts) {
      calls.push({ taskId, model: model as unknown as string, prompt, opts });
    },
    kill: vi.fn(),
    list() { return calls.map(c => c.taskId); },
    isAvailable() { return Promise.resolve(true); },
    calls,
  };
}

function baseDeps(projectRoot: string, overrides?: Partial<SpawnTaskDeps>): SpawnTaskDeps {
  return {
    projectRoot,
    sprintFallbackId: 'sprint-sched3',
    config: undefined,
    resolveAgentPrompt: async () => undefined,
    resolveSkillPrompts: async () => [],
    buildWriteTargets: () => ['.tasks/'],
    ...overrides,
  };
}

function writeOriginalTask(root: string, task: Task): void {
  writeFileSync(join(root, '.tasks', `task-${task.id}.json`), JSON.stringify(task, null, 2), 'utf-8');
}

describe('executeSpawnTask — provider-authority ingress', () => {
  let root: string;

  beforeEach(() => { root = makeTmpDir('sched3-provider-authority'); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); vi.clearAllMocks(); });

  it('holds before prompt construction or backend dispatch and preserves explicit attendance', async () => {
    const task = makeTask('700-AUTH-HOLD', {
      provider: 'claude',
      budgetPolicy: {
        ...makeTask('budget-template').budgetPolicy!,
        admissionMode: 'attended',
      },
    });
    const backend = makeMockBackend();
    const authority = {
      state: 'hold',
      reasonCode: 'keyring_unavailable',
      authorityEvidenceRef: `provider-authority:${'a'.repeat(64)}`,
      retryable: false,
      close: vi.fn(),
    } as const;
    const config = {
      spawn_backend: 'docker',
      worker_provider: 'claude',
      provider_fallback: { worker: ['codex', 'gemini'] },
    } as unknown as ResolvedConfig;

    const caught = await executeSpawnTask(
      { task },
      baseDeps(root, {
        backend,
        config,
        spawnOpts: { providerAuthority: authority },
      }),
    ).catch(error => error);

    expect(caught).toBeInstanceOf(ProviderExecutionIngressHoldError);
    expect(caught).toMatchObject({
      reasonCode: 'keyring_unavailable',
      durableEvidenceWritten: true,
      request: {
        role: 'worker',
        purpose: 'worker-execution',
        runId: 'sprint-sched3',
        taskId: '700-AUTH-HOLD',
        provider: 'claude',
        model: 'claude-sonnet-5',
        configuredBackend: 'mock-backend',
        unattended: false,
      },
    });
    expect((caught as ProviderExecutionIngressHoldError).request.fallbackProviders)
      .toEqual(['codex', 'gemini']);
    expect(buildWorkerPrompt).not.toHaveBeenCalled();
    expect(backend.calls).toHaveLength(0);
    expect(task.status).toBe(TaskStatus.PENDING);
  });

  it('binds final-only adapter admission to Docker rather than the ordinary host adapter', async () => {
    const task = makeTask('700-AUTH-FINAL-ONLY', {
      model: 'gpt-5.6-sol',
      provider: 'codex',
      budgetPolicy: {
        ...makeTask('final-only-authority-template').budgetPolicy!,
        resolvedProvider: 'codex',
        finalOnlyUsage: {
          maxWallClockSeconds: 600,
          profileRef: 'execution_budget.final_only_usage',
          policyDigest: '9'.repeat(64),
        },
      },
    });
    const backend = makeMockBackend();
    Object.defineProperty(backend, 'name', { value: 'docker' });
    const authority = {
      state: 'hold',
      reasonCode: 'keyring_unavailable',
      authorityEvidenceRef: `provider-authority:${'b'.repeat(64)}`,
      retryable: false,
      close: vi.fn(),
    } as const;

    const caught = await executeSpawnTask(
      { task },
      baseDeps(root, {
        backend,
        config: {
          spawn_backend: 'docker',
          worker_provider: 'codex',
        } as unknown as ResolvedConfig,
        spawnOpts: { providerAuthority: authority },
      }),
    ).catch(error => error);

    expect(caught).toBeInstanceOf(ProviderExecutionIngressHoldError);
    expect(caught).toMatchObject({
      request: {
        taskId: task.id,
        provider: 'codex',
        configuredBackend: 'docker',
      },
    });
    expect(buildWorkerPrompt).not.toHaveBeenCalled();
    expect(backend.calls).toHaveLength(0);
  });

  it('preserves the existing executor behavior when provider authority is not configured', async () => {
    const task = makeTask('700-AUTH-ABSENT', { provider: 'claude' });
    const backend = makeMockBackend();

    await expect(executeSpawnTask(
      { task },
      baseDeps(root, { backend }),
    )).resolves.toMatchObject({ kind: 'spawned', taskId: task.id });

    expect(buildWorkerPrompt).toHaveBeenCalledOnce();
    expect(backend.calls).toHaveLength(1);
  });
});

describe('executeSpawnTask — resolved host-adapter precedence', () => {
  let root: string;
  let priorOllama: ProviderAdapter | null;
  let adapterSpawn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    root = makeTmpDir('sched3-host-adapter-precedence');
    priorOllama = providerRegistry.hasProvider('ollama')
      ? providerRegistry.getProvider('ollama')
      : null;
    adapterSpawn = vi.fn();
    providerRegistry.registerProvider({
      name: 'ollama',
      supportedModels: ['qwen3.8:27b' as Task['model']],
      executionCostClass: 'local',
      spawn: adapterSpawn,
      kill: vi.fn(),
      listWorkers: () => [],
      isAvailable: async () => true,
      buildCommand: () => 'ollama',
    });
  });

  afterEach(() => {
    if (priorOllama) providerRegistry.registerProvider(priorOllama);
    else providerRegistry.unregisterProvider('ollama');
    rmSync(root, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('routes an adapter provider to its host adapter even when config resolved Docker', async () => {
    const task = makeTask('700-HOST-PRECEDENCE', {
      provider: 'ollama',
      model: 'qwen3.8:27b' as Task['model'],
      budget: undefined,
      budgetPolicy: undefined,
    });
    const backend = makeMockBackend();
    Object.defineProperty(backend, 'name', { value: 'docker' });
    const registry = createExactNormalDockerExecutionRegistry(root);

    const disposition = await executeSpawnTask(
      { task },
      baseDeps(root, {
        backend,
        config: { spawn_backend: 'docker' } as ResolvedConfig,
        exactDockerRegistry: registry,
      }),
    );

    expect(disposition).toMatchObject({
      kind: 'spawned',
      taskId: task.id,
      executionMode: 'legacy-non-docker',
      executionBackend: 'host-adapter',
      provider: 'ollama',
    });
    expect(adapterSpawn).toHaveBeenCalledOnce();
    expect(backend.calls).toHaveLength(0);
    expect(registry.isExactTask(task.id)).toBe(false);
    expect(registry.resolveLifecycleOwner(task.id)?.name).toBe('ollama');
  });

  it('keeps an explicit task-level Docker override on the exact route', async () => {
    const task = makeTask('700-EXPLICIT-DOCKER', {
      provider: 'ollama',
      model: 'qwen3.8:27b' as Task['model'],
      backend: 'docker',
      budget: undefined,
      budgetPolicy: undefined,
    });
    const backend = makeMockBackend();
    Object.defineProperty(backend, 'name', { value: 'docker' });

    const disposition = await executeSpawnTask(
      { task },
      baseDeps(root, {
        backend,
        config: { spawn_backend: 'docker' } as ResolvedConfig,
        exactDockerRegistry: createExactNormalDockerExecutionRegistry(root),
      }),
    );

    expect(disposition).toMatchObject({
      kind: 'ambiguous',
      taskId: task.id,
      reasonCode: 'EXACT_DOCKER_PORT_SET_UNAVAILABLE',
      executionMode: 'normal-docker-exact',
      executionBackend: 'docker',
    });
    expect(adapterSpawn).not.toHaveBeenCalled();
    expect(backend.calls).toHaveLength(0);
  });
});

describe('executeSpawnTask — exact normal-Docker publication order', () => {
  let root: string;

  beforeEach(() => { root = makeTmpDir('sched3-exact-order'); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); vi.clearAllMocks(); });

  it('snapshots every exact non-terminal entry as typed HOLD instead of dropping to legacy', () => {
    const registry = createExactNormalDockerExecutionRegistry(root);
    registry.registerNotDispatched('exact-zero-work');
    registry.registerHold('exact-authority-hold', 'EXACT_FIXTURE_HOLD');

    expect([...registry.snapshotExactTerminalAuthorities()]).toEqual([
      ['exact-zero-work', { state: 'hold', reasonCode: 'exact-not-dispatched' }],
      ['exact-authority-hold', { state: 'hold', reasonCode: 'EXACT_FIXTURE_HOLD' }],
    ]);
    expect(registry.isExactTask('exact-zero-work')).toBe(true);
    expect(registry.isExactTask('exact-authority-hold')).toBe(true);
  });

  it('CAS-fences exact terminal replay instead of overwriting attempt authority', () => {
    const backend = makeMockBackend();
    backend.awaitExactDockerAcceptedResult = vi.fn(() => new Promise(() => undefined));
    const query = { custodyRef: { identity: { taskId: 'exact-cas' } } } as never;

    const acceptedRace = createExactNormalDockerExecutionRegistry(root);
    acceptedRace.registerReleased('exact-cas', backend, query);
    acceptedRace.registerNotDispatched('exact-cas', backend);
    expect(acceptedRace.readTaskResultAuthority('exact-cas')).toMatchObject({
      state: 'authority-hold',
      holdReason: 'EXACT_NOT_DISPATCHED_REGISTRY_REPLAY_MISMATCH',
    });

    const retryRace = createExactNormalDockerExecutionRegistry(root);
    retryRace.registerNotDispatched('exact-cas', backend);
    retryRace.registerReleased('exact-cas', backend, query);
    expect(retryRace.readTaskResultAuthority('exact-cas')).toMatchObject({
      state: 'authority-hold',
      holdReason: 'EXACT_DISPATCH_REGISTRY_REPLAY_MISMATCH',
    });
  });

  it('rehydrates durable exact NOT_DISPATCHED and scans one project owner across backend instances', async () => {
    const registry = createExactNormalDockerExecutionRegistry(root);
    const first = makeMockBackend();
    const second = makeMockBackend();
    Object.defineProperty(first, 'name', { value: 'docker' });
    Object.defineProperty(second, 'name', { value: 'docker' });
    const recoveryDigest = `sha256:${'a'.repeat(64)}` as const;
    const notDispatched = (taskId: string) => ({
      kind: 'not-dispatched' as const,
      taskId,
      authority: {
        state: 'NOT_DISPATCHED',
        admissionRef: {
          dispatchRequestId: `dreq-${'b'.repeat(64)}`,
          identity: {
            schemaVersion: 2,
            backend: 'docker',
            projectRootSha256: 'c'.repeat(64),
            projectId: 'project-test',
            taskId,
            attemptId: `attempt-${taskId}`,
            generation: 1,
          },
          admissionReceiptDigest: recoveryDigest,
          refDigest: recoveryDigest,
        },
        receiptDigest: recoveryDigest,
        noEffectEvidence: { evidenceDigest: recoveryDigest },
      } as never,
    });
    const report = {
      adopted: [],
      closedNotDispatched: ['exact-cold-a', 'exact-cold-b'],
      closedAbsentAfterExit: [],
      retiredLanded: [],
      resumedContinuations: [],
      held: [],
      exactEntries: [notDispatched('exact-cold-a'), notDispatched('exact-cold-b')],
    };
    first.reconcilePendingAttempts = vi.fn(async () => report);
    second.reconcilePendingAttempts = vi.fn(async () => {
      throw new Error('second project-wide adoption scan must not run');
    });
    registry.registerNotDispatched('exact-cold-a', first);
    registry.registerNotDispatched('exact-cold-b', second);

    await expect(registry.reconcileExactLifecycle('resume')).resolves.toEqual([report]);
    expect(first.reconcilePendingAttempts).toHaveBeenCalledOnce();
    expect(second.reconcilePendingAttempts).not.toHaveBeenCalled();
    for (const taskId of ['exact-cold-a', 'exact-cold-b']) {
      expect(registry.isExactTask(taskId)).toBe(true);
      expect(registry.readTaskResultAuthority(taskId)).toMatchObject({
        state: 'not-dispatched',
        attemptCount: 0,
      });
      expect(registry.readExactTerminalAuthority(taskId)).toEqual({
        state: 'hold',
        reasonCode: 'exact-not-dispatched',
      });
    }

    registry.rehydrateRecovery({
      ...report,
      exactEntries: [{
        kind: 'not-dispatched',
        taskId: 'exact-corrupt',
        authority: { state: 'NOT_DISPATCHED' } as never,
      }],
    }, first);
    expect(registry.readTaskResultAuthority('exact-corrupt')).toMatchObject({
      state: 'authority-hold',
      holdReason: 'EXACT_RECOVERY_NOT_DISPATCHED_MISMATCH',
    });
  });

  it('preserves and freshly revalidates a current terminal across accepted recovery ownership transfer', async () => {
    const registry = createExactNormalDockerExecutionRegistry(root);
    const taskId = 'exact-recovered-terminal';
    const digest = `sha256:${'a'.repeat(64)}` as const;
    const identity = {
      schemaVersion: 2 as const,
      backend: 'docker' as const,
      projectRootSha256: 'b'.repeat(64),
      projectId: 'project-test',
      taskId,
      attemptId: 'attempt-recovered-terminal',
      generation: 1,
    };
    const query = {
      custodyRef: {
        identity,
        admissionReceiptDigest: digest,
      },
    } as never;
    const initialReader = Object.freeze({});
    const recoveredReader = Object.freeze({});
    const acceptedFixture = createTaskResultSettlementV2Fixture({
      terminal: 'accepted-only',
      tailArtifactKey: 'scheduler-recovered-terminal',
    });
    const accepted = {
      kind: 'accepted-result' as const,
      reader: initialReader,
      result: { ...acceptedFixture.result, taskId },
      acceptedResultRef: {
        schemaVersion: 2,
        kind: 'task-accepted-result-v2-ref',
        identity,
        artifactKey: 'primary',
        artifactReceiptDigest: digest,
      },
      acceptedResultChainDigest: digest,
      resultDigest: digest,
    } as never;
    const initial = makeMockBackend();
    Object.defineProperty(initial, 'name', { value: 'docker' });
    initial.awaitExactDockerAcceptedResult = vi.fn(async () => accepted);
    const readBefore = registry.readTaskResultAuthority.bind(registry);
    registry.registerReleased(taskId, initial, query);
    await registry.awaitTaskResultAuthority(taskId);
    const acceptedRead = readBefore(taskId);
    if (acceptedRead.state !== 'exact-accepted' || !acceptedRead.exactAcceptedAuthority) {
      throw new Error('fixture exact accepted authority unavailable');
    }
    const terminalAuthority = {
      schemaVersion: 2,
      kind: 'exact-accepted-result-terminal-authority-v2',
      acceptedAuthority: acceptedRead.exactAcceptedAuthority,
      terminalResultAuthority: {},
      terminalDecisionAuthority: {},
    } as never;
    const currentRead = {
      state: 'current' as const,
      terminalAuthority,
      terminalResultAuthority: {},
      evaluationReceipt: {},
      finalizerReceipt: {},
      result: accepted.result,
      projectedResult: accepted.result,
    } as never;
    initial.settleExactDockerAcceptedResult = vi.fn(async () => ({
      state: 'settled' as const,
      authority: terminalAuthority,
    }));
    initial.readExactDockerAcceptedTaskTerminalAuthority = vi.fn(() => currentRead);
    await expect(registry.settleExactAcceptedResult({
      acceptedAuthority: acceptedRead.exactAcceptedAuthority,
    })).resolves.toMatchObject({ state: 'settled' });

    const recoveredAccepted = Object.freeze({ ...accepted, reader: recoveredReader });
    const recovery = makeMockBackend();
    Object.defineProperty(recovery, 'name', { value: 'docker' });
    recovery.readExactDockerAcceptedResult = vi.fn(() => recoveredAccepted);
    recovery.readExactDockerAcceptedTaskTerminalAuthority = vi.fn(() => currentRead);
    registry.rehydrateRecovery({
      adopted: [],
      closedNotDispatched: [],
      closedAbsentAfterExit: [taskId],
      retiredLanded: [],
      resumedContinuations: [],
      held: [],
      exactEntries: [{
        kind: 'accepted',
        taskId,
        query,
        accepted: recoveredAccepted,
      }],
    }, recovery);

    expect(registry.readExactTerminalAuthority(taskId)).toBe(currentRead);
    expect(recovery.readExactDockerAcceptedTaskTerminalAuthority)
      .toHaveBeenCalledWith(expect.objectContaining({
        reader: recoveredReader,
        expectedAcceptedAuthority: acceptedRead.exactAcceptedAuthority,
        expectedTerminalAuthority: terminalAuthority,
      }));
  });

  it('keeps public task/receipt absent through prepare+dispatch and publishes only after RELEASED', async () => {
    const task = makeTask('700-EXACT', {
      provider: 'claude',
      productionWiringApplicability: deriveProductionWiringApplicability({
        directories: [],
        filesRead: [],
        filesWrite: [],
      }),
    });
    const taskPath = join(root, '.tasks', `task-${task.id}.json`);
    const receiptPath = join(root, '.tasks', `task-${task.id}.skill-delivery.json`);
    const observations: string[] = [];
    const digest = `sha256:${'a'.repeat(64)}` as const;
    const identity = {
      schemaVersion: 2 as const,
      backend: 'docker' as const,
      projectRootSha256: 'b'.repeat(64),
      projectId: 'project-test',
      taskId: task.id,
      attemptId: 'attempt-exact-1',
      generation: 1,
    };
    const custodyRef = {
      dispatchRequestId: `dreq-${'c'.repeat(64)}`,
      identity,
      admissionReceiptDigest: digest,
      admissionRefDigest: digest,
      providerStartReceipt: { ref: digest, digest },
    };
    const preparationRef = {
      schemaVersion: 2 as const,
      kind: 'execution-landing-preparation-ref' as const,
      dispatchRequestId: custodyRef.dispatchRequestId,
      dispatchRequestMaterialDigest: digest,
      privateIdentity: identity,
      admissionReceiptDigest: digest,
      admissionRefDigest: digest,
      admittedAt: '2026-09-01T00:00:00.000Z',
      policyDigest: digest,
      taskSnapshotDigest: digest,
      providerInvocationDigest: digest,
      preparationRefDigest: digest,
    };
    const backend = {
      name: 'docker',
      liveUsageBudgetSupport: 'measured-stream',
      executionLandingCapability: 'cooperative-landing',
      spawn: vi.fn(),
      kill: vi.fn(),
      list: () => [],
      isAvailable: async () => true,
      prepareExactDockerCustody: vi.fn(async () => {
        observations.push(`prepare:${existsSync(taskPath)}:${existsSync(receiptPath)}`);
        return {
          kind: 'exact-docker-custody-prepared' as const,
          dispatchEnvelope: {} as never,
          admissionRef: {
            dispatchRequestId: custodyRef.dispatchRequestId,
            dispatchRequestMaterialDigest: digest,
            admissionRefDigest: digest,
          },
          preparationRef,
        };
      }),
      dispatchExactDockerCustody: vi.fn(async () => {
        observations.push(`dispatch:${existsSync(taskPath)}:${existsSync(receiptPath)}`);
        return {
          kind: 'released' as const,
          settlementRef: {} as never,
          admissionRef: {
            dispatchRequestId: custodyRef.dispatchRequestId,
            dispatchRequestMaterialDigest: digest,
            admissionRefDigest: digest,
          },
          preparationRef,
          custodyRef,
          providerExecutionAttempt: {} as never,
          backendExecutionId: 'container-exact-1',
          mountReceiptDigest: digest,
          dispatchReceipt: { ref: digest, digest },
          releaseReceipt: { ref: digest, digest },
          providerStartReceipt: { ref: digest, digest },
          projectionFence: digest,
          releasedAt: '2026-09-01T00:00:00.000Z',
          providerStartAcceptedAt: '2026-09-01T00:00:00.000Z',
        };
      }),
      awaitExactDockerAcceptedResult: vi.fn(async () => ({
        kind: 'capture-hold' as const,
        reasonCode: 'EFFECT_PUBLICATION_HOLD' as const,
        custodyRef,
        releaseReceipt: { ref: digest, digest },
        projectionFence: digest,
      })),
    } satisfies SpawnBackend;
    const config = {
      spawn_backend: 'docker',
      docker_timeout: 60,
      auth_mode: 'subscription',
      prompt: { worker_core_system_prompt: false },
    } as unknown as ResolvedConfig;
    const registry = createExactNormalDockerExecutionRegistry(root);

    const disposition = await executeSpawnTask(
      { task, taskTimeoutSeconds: 60 },
      baseDeps(root, {
        backend,
        config,
        exactDockerRegistry: registry,
        exactTaskProjectionAdmission: {
          taskIds: [task.id],
          existingContentDigests: {},
        },
      }),
    );

    expect(disposition).toMatchObject({
      kind: 'spawned',
      taskId: task.id,
      executionMode: 'normal-docker-exact',
      executionBackend: 'docker',
      exactDispatchOutcome: {
        kind: 'released',
        projectionFence: digest,
        releaseReceipt: { ref: digest, digest },
      },
    });
    expect(observations).toEqual(['prepare:false:false', 'dispatch:false:false']);
    expect(backend.spawn).not.toHaveBeenCalled();
    expect(existsSync(taskPath)).toBe(true);
    expect(existsSync(receiptPath)).toBe(true);
    expect(JSON.parse(readFileSync(taskPath, 'utf-8'))).toMatchObject({
      id: task.id,
      status: TaskStatus.EXECUTING,
      assignedWorker: `w-${task.id}`,
    });
    expect(readEvents(root, 'sprint-sched3', { channel: CHANNELS.TASK_ASSIGN }))
      .toHaveLength(1);
    await expect(registry.awaitTaskResultAuthority(task.id)).resolves.toMatchObject({
      state: 'authority-hold',
      holdReason: 'EFFECT_PUBLICATION_HOLD',
    });

    const zeroWorkTask = makeTask('700-EXACT-ZERO', {
      provider: 'claude',
      productionWiringApplicability: deriveProductionWiringApplicability({
        directories: [],
        filesRead: [],
        filesWrite: [],
      }),
    });
    const zeroIdentityV1 = {
      ...identity,
      taskId: zeroWorkTask.id,
      attemptId: 'attempt-exact-zero',
      generation: 1,
    };
    const zeroAdmissionDigestV1 = `sha256:${'d'.repeat(64)}` as const;
    const zeroAdmissionRefDigestV1 = `sha256:${'e'.repeat(64)}` as const;
    const zeroCustodyRefV1 = {
      dispatchRequestId: `dreq-${'d'.repeat(64)}`,
      identity: zeroIdentityV1,
      admissionReceiptDigest: zeroAdmissionDigestV1,
      admissionRefDigest: zeroAdmissionRefDigestV1,
    };
    const zeroPreparationRefV1 = {
      ...preparationRef,
      dispatchRequestId: zeroCustodyRefV1.dispatchRequestId,
      privateIdentity: zeroIdentityV1,
      admissionReceiptDigest: zeroAdmissionDigestV1,
      admissionRefDigest: zeroAdmissionRefDigestV1,
      preparationRefDigest: zeroAdmissionRefDigestV1,
    };
    const zeroWorkOutcome = {
      kind: 'not-dispatched' as const,
      admissionRef: {
        dispatchRequestId: zeroCustodyRefV1.dispatchRequestId,
        dispatchRequestMaterialDigest: digest,
        admissionRefDigest: zeroAdmissionRefDigestV1,
      },
      custodyRef: zeroCustodyRefV1,
      providerAttemptCount: 0 as const,
      providerExecutionAttempt: null,
      reasonCode: 'PRE_MOUNT_ABORTED' as const,
      zeroWorkReceipt: { ref: digest, digest },
      projectionFence: digest,
    };
    backend.prepareExactDockerCustody.mockResolvedValueOnce({
      kind: 'exact-docker-custody-prepared' as const,
      dispatchEnvelope: {} as never,
      admissionRef: zeroWorkOutcome.admissionRef,
      preparationRef: zeroPreparationRefV1,
    });
    backend.dispatchExactDockerCustody.mockResolvedValueOnce(zeroWorkOutcome as never);
    const zeroWorkDisposition = await executeSpawnTask(
      { task: zeroWorkTask, taskTimeoutSeconds: 60 },
      baseDeps(root, {
        backend,
        config,
        exactDockerRegistry: registry,
        exactTaskProjectionAdmission: {
          taskIds: [zeroWorkTask.id],
          existingContentDigests: {},
        },
      }),
    );
    expect(zeroWorkDisposition).toMatchObject({
      kind: 'not-dispatched',
      taskId: zeroWorkTask.id,
      executionMode: 'normal-docker-exact',
      executionBackend: 'docker',
      exactDispatchOutcome: zeroWorkOutcome,
    });
    expect(zeroWorkDisposition.kind).toBe('not-dispatched');
    if (zeroWorkDisposition.kind !== 'not-dispatched') throw new Error('expected exact zero work');
    expect(zeroWorkDisposition.exactDispatchOutcome).toBe(zeroWorkOutcome);
    expect(existsSync(join(root, '.tasks', `task-${zeroWorkTask.id}.json`))).toBe(false);
    const exactDispatchCount = backend.dispatchExactDockerCustody.mock.calls.length;
    backend.prepareExactDockerCustody.mockResolvedValueOnce({
      kind: 'exact-docker-custody-prepared' as const,
      dispatchEnvelope: {} as never,
      admissionRef: zeroWorkOutcome.admissionRef,
      preparationRef: zeroPreparationRefV1,
    });
    const staleRetry = await executeSpawnTask(
      { task: zeroWorkTask, taskTimeoutSeconds: 60 },
      baseDeps(root, {
        backend,
        config,
        exactDockerRegistry: registry,
        exactTaskProjectionAdmission: {
          taskIds: [zeroWorkTask.id],
          existingContentDigests: {},
        },
      }),
    );
    expect(staleRetry).toMatchObject({
      kind: 'ambiguous',
      taskId: zeroWorkTask.id,
      reasonCode: 'EXACT_REDISPATCH_GENERATION_MISMATCH',
    });
    expect(backend.dispatchExactDockerCustody).toHaveBeenCalledTimes(exactDispatchCount);
    expect(backend.prepareExactDockerCustody.mock.calls.at(-1)?.[0]).toMatchObject({
      predecessor: null,
      zeroWorkPredecessor: {
        identity: zeroIdentityV1,
        admissionReceiptDigest: zeroAdmissionDigestV1,
        admissionRefDigest: zeroAdmissionRefDigestV1,
        zeroWorkReceipt: zeroWorkOutcome.zeroWorkReceipt,
      },
    });

    const zeroIdentityV2 = { ...zeroIdentityV1, generation: 2 };
    const zeroAdmissionDigestV2 = `sha256:${'f'.repeat(64)}` as const;
    const zeroAdmissionRefDigestV2 = `sha256:${'c'.repeat(64)}` as const;
    const zeroCustodyRefV2 = {
      dispatchRequestId: `dreq-${'e'.repeat(64)}`,
      identity: zeroIdentityV2,
      admissionReceiptDigest: zeroAdmissionDigestV2,
      admissionRefDigest: zeroAdmissionRefDigestV2,
      providerStartReceipt: { ref: zeroAdmissionDigestV2, digest: zeroAdmissionDigestV2 },
    };
    const zeroPreparationRefV2 = {
      ...preparationRef,
      dispatchRequestId: zeroCustodyRefV2.dispatchRequestId,
      privateIdentity: zeroIdentityV2,
      admissionReceiptDigest: zeroAdmissionDigestV2,
      admissionRefDigest: zeroAdmissionRefDigestV2,
      preparationRefDigest: zeroAdmissionRefDigestV2,
    };
    const zeroReleasedV2 = {
      kind: 'released' as const,
      settlementRef: {} as never,
      admissionRef: {
        dispatchRequestId: zeroCustodyRefV2.dispatchRequestId,
        dispatchRequestMaterialDigest: digest,
        admissionRefDigest: zeroAdmissionRefDigestV2,
      },
      preparationRef: zeroPreparationRefV2,
      custodyRef: zeroCustodyRefV2,
      providerExecutionAttempt: {} as never,
      backendExecutionId: 'container-exact-zero-v2',
      mountReceiptDigest: digest,
      dispatchReceipt: { ref: digest, digest },
      releaseReceipt: { ref: digest, digest },
      providerStartReceipt: zeroCustodyRefV2.providerStartReceipt,
      projectionFence: digest,
      releasedAt: '2026-09-01T00:00:01.000Z',
      providerStartAcceptedAt: '2026-09-01T00:00:01.000Z',
    };
    backend.prepareExactDockerCustody.mockResolvedValueOnce({
      kind: 'exact-docker-custody-prepared' as const,
      dispatchEnvelope: {} as never,
      admissionRef: zeroReleasedV2.admissionRef,
      preparationRef: zeroPreparationRefV2,
    });
    backend.dispatchExactDockerCustody.mockResolvedValueOnce(zeroReleasedV2 as never);
    const validRetry = await executeSpawnTask(
      { task: zeroWorkTask, taskTimeoutSeconds: 60 },
      baseDeps(root, {
        backend,
        config,
        exactDockerRegistry: registry,
        exactTaskProjectionAdmission: {
          taskIds: [zeroWorkTask.id],
          existingContentDigests: {},
        },
      }),
    );
    expect(validRetry).toMatchObject({
      kind: 'spawned',
      taskId: zeroWorkTask.id,
      exactDispatchOutcome: { custodyRef: { identity: zeroIdentityV2 } },
    });
    expect(backend.dispatchExactDockerCustody).toHaveBeenCalledTimes(exactDispatchCount + 1);

    const ambiguousTask = makeTask('700-EXACT-AMBIGUOUS', {
      provider: 'claude',
      productionWiringApplicability: deriveProductionWiringApplicability({
        directories: [],
        filesRead: [],
        filesWrite: [],
      }),
    });
    const ambiguousIdentity = {
      ...identity,
      taskId: ambiguousTask.id,
      attemptId: 'attempt-exact-ambiguous',
    };
    const ambiguousCustodyRef = {
      ...custodyRef,
      dispatchRequestId: `dreq-${'f'.repeat(64)}`,
      identity: ambiguousIdentity,
    };
    const ambiguousPreparationRef = {
      ...preparationRef,
      dispatchRequestId: ambiguousCustodyRef.dispatchRequestId,
      privateIdentity: ambiguousIdentity,
    };
    const ambiguousOutcome = {
      kind: 'ambiguous' as const,
      admissionRef: {
        ...zeroWorkOutcome.admissionRef,
        dispatchRequestId: ambiguousCustodyRef.dispatchRequestId,
        admissionRefDigest: ambiguousCustodyRef.admissionRefDigest,
      },
      custodyRef: ambiguousCustodyRef,
      reasonCode: 'MOUNT_RECONCILIATION_REQUIRED' as const,
      reconciliationReceipt: { ref: digest, digest },
      projectionFence: digest,
    };
    backend.prepareExactDockerCustody.mockResolvedValueOnce({
      kind: 'exact-docker-custody-prepared' as const,
      dispatchEnvelope: {} as never,
      admissionRef: ambiguousOutcome.admissionRef,
      preparationRef: ambiguousPreparationRef,
    });
    backend.dispatchExactDockerCustody.mockResolvedValueOnce(ambiguousOutcome as never);
    const ambiguousDisposition = await executeSpawnTask(
      { task: ambiguousTask, taskTimeoutSeconds: 60 },
      baseDeps(root, {
        backend,
        config,
        exactDockerRegistry: registry,
        exactTaskProjectionAdmission: {
          taskIds: [ambiguousTask.id],
          existingContentDigests: {},
        },
      }),
    );
    expect(ambiguousDisposition).toMatchObject({
      kind: 'ambiguous',
      taskId: ambiguousTask.id,
      executionMode: 'normal-docker-exact',
      executionBackend: 'docker',
      exactDispatchOutcome: ambiguousOutcome,
    });
    expect(ambiguousDisposition.kind).toBe('ambiguous');
    if (ambiguousDisposition.kind !== 'ambiguous') throw new Error('expected exact ambiguity');
    expect(ambiguousDisposition.exactDispatchOutcome).toBe(ambiguousOutcome);
    expect(existsSync(join(root, '.tasks', `task-${ambiguousTask.id}.json`))).toBe(false);
  });

  it('keeps a task-level legacy route readable without treating it as exact pending work', async () => {
    const task = makeTask('700-MIXED-LEGACY', { provider: 'claude' });
    const taskPath = join(root, '.tasks', `task-${task.id}.json`);
    const backend = makeMockBackend();
    const registry = createExactNormalDockerExecutionRegistry(root);

    const disposition = await executeSpawnTask(
      { task },
      baseDeps(root, {
        backend,
        config: { spawn_backend: 'docker' } as ResolvedConfig,
        exactDockerRegistry: registry,
      }),
    );

    expect(disposition).toMatchObject({ kind: 'spawned', taskId: task.id });
    expect(registry.isExactTask(task.id)).toBe(false);
    expect(registry.resolveLifecycleOwner(task.id)).toBe(backend);
    expect(backend.calls).toHaveLength(1);
    expect(existsSync(taskPath)).toBe(true);
    expect(registry.readTaskResultAuthority(task.id).state).not.toBe('pending-settlement');
  });

  it('turns missing exact dependency authority into a durable registry HOLD', async () => {
    const task = makeTask('700-EXACT-DEPENDENT', {
      provider: 'claude',
      dependencies: ['700-EXACT-MISSING'],
    });
    const backend = makeMockBackend();
    Object.defineProperties(backend, {
      name: { value: 'docker' },
      prepareExactDockerCustody: { value: vi.fn() },
      dispatchExactDockerCustody: { value: vi.fn() },
      awaitExactDockerAcceptedResult: { value: vi.fn() },
    });
    const registry = createExactNormalDockerExecutionRegistry(root);

    const disposition = await executeSpawnTask(
      { task, taskTimeoutSeconds: 60 },
      baseDeps(root, {
        backend,
        config: {
          spawn_backend: 'docker',
          auth_mode: 'subscription',
        } as ResolvedConfig,
        exactDockerRegistry: registry,
      }),
    );

    expect(disposition).toEqual({
      executionMode: 'normal-docker-exact',
      executionBackend: 'docker',
      kind: 'exact-dependency-authority-hold',
      taskId: task.id,
    });
    expect(registry.readTaskResultAuthority(task.id)).toMatchObject({
      state: 'authority-hold',
      holdReason: 'EXACT_DEPENDENCY_TERMINAL_AUTHORITY_UNAVAILABLE',
    });
  });
});

describe('executeSpawnTask — canonical write collision admission', () => {
  let root: string;

  beforeEach(() => { root = makeTmpDir('sched3-collision'); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); vi.clearAllMocks(); });

  it('holds before prompt construction and backend dispatch for every trigger path', async () => {
    const candidate = makeTask('700-COLLISION-CANDIDATE', {
      scope: { directories: [], filesRead: [], filesWrite: ['src/shared.ts'] },
    });
    const active = makeTask('700-COLLISION-ACTIVE', {
      status: TaskStatus.EXECUTING,
      scope: { directories: [], filesRead: [], filesWrite: ['SRC\\shared.ts'] },
    });
    const backend = makeMockBackend();
    const resolveAgentPrompt = vi.fn(async () => undefined);

    const disposition = await executeSpawnTask(
      { task: candidate },
      baseDeps(root, {
        backend,
        resolveAgentPrompt,
        collisionAuthority: { tasks: [candidate, active], collectedIds: new Set() },
      }),
    );

    expect(disposition).toEqual({
      executionMode: 'legacy-non-docker',
      executionBackend: 'mock-backend',
      kind: 'collision-held',
      taskId: candidate.id,
      blockerTaskIds: [active.id],
    });
    expect(resolveAgentPrompt).not.toHaveBeenCalled();
    expect(backend.calls).toHaveLength(0);
  });
});

// ─── executeSpawnTask — fix-routing lineage inheritance ──────────────────────

describe('executeSpawnTask — fix-task routing-lineage inheritance', () => {
  let root: string;

  beforeEach(() => { root = makeTmpDir('sched3-inherit'); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); vi.clearAllMocks(); });

  it('inherits forceModel/provider/modelEffort from the original when the fix-task left them unset (behavior a)', async () => {
    const original = makeTask('700-001', {
      forceModel: 'claude-opus-4-8',
      provider: 'claude',
      modelEffort: 'high',
      type: 'code-development',
    });
    writeOriginalTask(root, original);

    const fixTask = makeTask('700-001-fix', { isPriorityFix: true, fixForTaskId: '700-001' });
    const backend = makeMockBackend();

    const disposition = await executeSpawnTask({ task: fixTask }, baseDeps(root, { backend }));

    expect(disposition.kind).toBe('spawned');
    expect(fixTask.forceModel).toBe('claude-opus-4-8');
    expect(fixTask.provider).toBe('claude');
    expect(fixTask.modelEffort).toBe('high');
    expect(fixTask.type).toBe('code-development');
    // reasoning-effort resolution runs AFTER inheritance, so the inherited
    // modelEffort ('high') must be what's actually sent to the backend.
    expect(backend.calls).toHaveLength(1);
    expect(backend.calls[0]!.opts?.reasoningEffort).toBe('high');
  });

  it('preserves an explicit fix-task override instead of clobbering it with the original value', async () => {
    const original = makeTask('700-002', { modelEffort: 'high', provider: 'claude' });
    writeOriginalTask(root, original);

    const fixTask = makeTask('700-002-fix', {
      isPriorityFix: true,
      fixForTaskId: '700-002',
      modelEffort: 'low', // conscious override — must survive untouched
      provider: 'claude',
    });
    const backend = makeMockBackend();

    await executeSpawnTask({ task: fixTask }, baseDeps(root, { backend }));

    expect(fixTask.modelEffort).toBe('low');
    expect(backend.calls[0]!.opts?.reasoningEffort).toBe('low');
  });

  it('inherits the backend field; when the inherited value matches config.spawn_backend the injected backend is reused (no real backend-factory spawn)', async () => {
    const original = makeTask('700-003', { backend: 'docker' });
    writeOriginalTask(root, original);

    const fixTask = makeTask('700-003-fix', { isPriorityFix: true, fixForTaskId: '700-003' });
    const backend = makeMockBackend();
    const config = { spawn_backend: 'docker' } as unknown as ResolvedConfig;

    const disposition = await executeSpawnTask({ task: fixTask }, baseDeps(root, { backend, config }));

    expect(disposition.kind).toBe('spawned');
    expect(fixTask.backend).toBe('docker');
    expect(backend.calls).toHaveLength(1);
  });

  it('persists task-<id>.json with status EXECUTING and the inherited fields after a successful spawn (behavior b)', async () => {
    const original = makeTask('700-004', { modelEffort: 'high' });
    writeOriginalTask(root, original);

    const fixTask = makeTask('700-004-fix', { isPriorityFix: true, fixForTaskId: '700-004' });
    const backend = makeMockBackend();

    await executeSpawnTask({ task: fixTask }, baseDeps(root, { backend }));

    const persistedPath = join(root, '.tasks', 'task-700-004-fix.json');
    expect(existsSync(persistedPath)).toBe(true);
    const persisted = JSON.parse(readFileSync(persistedPath, 'utf-8'));
    expect(persisted.status).toBe(TaskStatus.EXECUTING);
    expect(persisted.modelEffort).toBe('high');
  });

  it('publishes one canonical TASK_ASSIGN event for a dynamically dispatched task', async () => {
    const task = makeTask('700-EVENT');
    const backend = makeMockBackend();

    await executeSpawnTask({ task }, baseDeps(root, { backend }));

    const assignments = readEvents(root, 'sprint-sched3', {
      channel: CHANNELS.TASK_ASSIGN,
    });
    expect(assignments).toHaveLength(1);
    expect(assignments[0]).toMatchObject({
      source: 'brain',
      target: 'worker',
      payload: {
        taskId: '700-EVENT',
        workerId: 'w-700-EVENT',
        model: 'claude-sonnet-5',
        provider: 'claude',
      },
    });
  });

  it('returns routing-lineage-missing and blocks the spawn when the original task file cannot be read', async () => {
    const fixTask = makeTask('700-005-fix', { isPriorityFix: true, fixForTaskId: 'does-not-exist' });
    const backend = makeMockBackend();

    const disposition = await executeSpawnTask({ task: fixTask }, baseDeps(root, { backend }));

    expect(disposition.kind).toBe('routing-lineage-missing');
    if (disposition.kind === 'routing-lineage-missing') {
      expect(disposition.fixForTaskId).toBe('does-not-exist');
    }
    expect(backend.calls).toHaveLength(0);
    expect(existsSync(join(root, '.tasks', 'task-700-005-fix.json'))).toBe(false);
  });

  it('returns routing-lineage-missing when the original task file is corrupt JSON', async () => {
    writeFileSync(join(root, '.tasks', 'task-700-006.json'), '{ not valid json', 'utf-8');
    const fixTask = makeTask('700-006-fix', { isPriorityFix: true, fixForTaskId: '700-006' });
    const backend = makeMockBackend();

    const disposition = await executeSpawnTask({ task: fixTask }, baseDeps(root, { backend }));

    expect(disposition.kind).toBe('routing-lineage-missing');
    expect(backend.calls).toHaveLength(0);
  });

  it('is a no-op for a non-fix task (no lineage lookup, spawns normally)', async () => {
    const task = makeTask('700-007');
    const backend = makeMockBackend();

    const disposition = await executeSpawnTask({ task }, baseDeps(root, { backend }));

    expect(disposition.kind).toBe('spawned');
    expect(backend.calls).toHaveLength(1);
  });

  it('preserves final-only Codex containment on dependency-triggered Docker dispatch', async () => {
    const task = makeTask('700-FINAL-ONLY', {
      model: 'gpt-5.6-sol',
      provider: 'codex',
      budgetPolicy: {
        ...makeTask('final-only-template').budgetPolicy!,
        resolvedProvider: 'codex',
        finalOnlyUsage: {
          maxWallClockSeconds: 600,
          profileRef: 'execution_budget.final_only_usage',
          policyDigest: '9'.repeat(64),
        },
      },
    });
    const backend = makeMockBackend();
    Object.defineProperties(backend, {
      name: { value: 'docker' },
      liveUsageBudgetSupport: { value: 'measured-stream' },
    });

    const disposition = await executeSpawnTask(
      { task },
      baseDeps(root, {
        backend,
        config: { spawn_backend: 'docker' } as ResolvedConfig,
      }),
    );

    expect(disposition.kind).toBe('spawned');
    expect(backend.calls).toHaveLength(1);
    expect(backend.calls[0]?.opts?.finalOnlyUsageContainment).toEqual(
      task.budgetPolicy?.finalOnlyUsage,
    );
  });

  it('blocks a continuation Docker dispatch when the task-stamped grant is missing', async () => {
    const task = makeTask('700-FINAL-ONLY-MISSING', {
      model: 'gpt-5.6-sol',
      provider: 'codex',
      budgetPolicy: {
        ...makeTask('final-only-missing-template').budgetPolicy!,
        resolvedProvider: 'codex',
      },
    });
    const backend = makeMockBackend();
    Object.defineProperties(backend, {
      name: { value: 'docker' },
      liveUsageBudgetSupport: { value: 'measured-stream' },
    });

    await expect(executeSpawnTask(
      { task },
      baseDeps(root, { backend, config: { spawn_backend: 'docker' } as ResolvedConfig }),
    )).rejects.toThrow();
    expect(backend.calls).toHaveLength(0);
  });

  it('blocks queued/respawn dispatch when attended authority is only a raw reference', async () => {
    const task = makeTask('700-008', {
      budgetPolicy: {
        ...makeTask('template').budgetPolicy!,
        admissionMode: 'attended',
        landingPolicy: { reserve_ratio: 0.25, attended_unsupported: 'allow-hard-stop' },
        approvalEvidenceRef: 'approval://raw-reference-is-not-authority',
      },
    });
    const backend = makeMockBackend();
    Object.defineProperty(backend, 'executionLandingCapability', { value: 'unsupported' });

    await expect(executeSpawnTask({ task }, baseDeps(root, { backend })))
      .rejects.toThrow('exact final dispatch binding');
    expect(backend.calls).toHaveLength(0);
    expect(existsSync(join(root, '.tasks', 'task-700-008.json'))).toBe(false);
  });
});

// ─── executeSpawnTask — resolution parity across trigger-shaped deps ────────

describe('executeSpawnTask — resolution parity across caller-shaped deps (three-trigger parity)', () => {
  let root: string;

  beforeEach(() => { root = makeTmpDir('sched3-parity'); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); vi.clearAllMocks(); });

  it('resolves identical forceModel/provider/modelEffort for the same fix-task fixture whether invoked with local-path-shaped or heavyweight-respawn-shaped deps', async () => {
    const original = makeTask('701-001', { forceModel: 'claude-opus-4-8', provider: 'claude', modelEffort: 'high' });
    writeOriginalTask(root, original);

    // "local" deps — represents processQueue / forceRescanIfIdle /
    // dispatchReadyTasks, which all delegate to the SAME spawnIfNotAssigned
    // closure in result-collector.ts (queue-completion / idle-rescan /
    // dep-ready are three call sites of one function, not three divergent
    // implementations). config-less mirrors processQueue's own legacy
    // signature (waitForResults' config param is optional).
    const localBackend = makeMockBackend();
    const localFixTask = makeTask('701-001-fix-local', { isPriorityFix: true, fixForTaskId: '701-001' });
    const localDisposition = await executeSpawnTask(
      { task: localFixTask },
      baseDeps(root, { backend: localBackend, config: undefined }),
    );

    // "heavyweight" deps — represents respawnEligibleTasks, which always has
    // a full ResolvedConfig.
    const heavyBackend = makeMockBackend();
    const heavyFixTask = makeTask('701-001-fix-heavy', { isPriorityFix: true, fixForTaskId: '701-001' });
    const fullConfig = {
      spawn_backend: undefined,
      activeModeConfig: { max_workers: 3, brain_model: 'claude-opus-4-8', default_model: 'claude-sonnet-5', haiku_allowed: true },
    } as unknown as ResolvedConfig;
    const heavyDisposition = await executeSpawnTask(
      { task: heavyFixTask },
      baseDeps(root, { backend: heavyBackend, config: fullConfig }),
    );

    expect(localDisposition.kind).toBe('spawned');
    expect(heavyDisposition.kind).toBe('spawned');
    expect(localFixTask.forceModel).toBe(heavyFixTask.forceModel);
    expect(localFixTask.provider).toBe(heavyFixTask.provider);
    expect(localFixTask.modelEffort).toBe(heavyFixTask.modelEffort);
    expect(localBackend.calls[0]!.opts?.reasoningEffort)
      .toBe(heavyBackend.calls[0]!.opts?.reasoningEffort);

    // Both callers persisted — persistence is no longer heavyweight-only.
    expect(existsSync(join(root, '.tasks', 'task-701-001-fix-local.json'))).toBe(true);
    expect(existsSync(join(root, '.tasks', 'task-701-001-fix-heavy.json'))).toBe(true);
  });
});

// ─── Live wiring — queue-completion trigger (processQueue) ──────────────────

describe('waitForResults — queue-completion trigger (processQueue) delegates to executeSpawnTask', () => {
  let root: string;

  beforeEach(() => { root = makeTmpDir('sched3-queue'); vi.clearAllMocks(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('spawns the queued fix-task with inherited routing fields and persists task-<id>.json (behavior a + b, live wiring)', async () => {
    const original = makeTask('702-001', { modelEffort: 'high', provider: 'claude' });
    writeOriginalTask(root, original);

    const active = makeTask('702-000', { status: TaskStatus.EXECUTING, budget: undefined });
    const fixTask = makeTask('702-001-fix', { isPriorityFix: true, fixForTaskId: '702-001' });

    const sprint: Sprint = {
      id: 'sprint-sched3',
      number: 1,
      tasks: [active, fixTask],
      workers: ['w-702-000', 'w-702-001-fix'],
      phase: SprintPhase.EXECUTE,
      status: SprintStatus.ACTIVE,
      planningMode: 'structured',
    } as Sprint;

    // The active task's result is already on disk — processQueue picks the
    // fix-task off the FIFO queue in the very first dispatch tick.
    writeFileSync(
      join(root, '.tasks', 'task-702-000.result'),
      JSON.stringify({
        taskId: '702-000', workerId: 'w-702-000', filesChanged: [], linesAdded: 0, linesRemoved: 0,
        testsPassed: true, coverage: 100, selfAssessment: 'DONE', notes: 'ok',
        tokenUsage: {
          inputTokens: 10,
          outputTokens: 2,
          cacheReadTokens: 0,
          source: 'provider-adapter',
          provider: 'claude',
          model: 'claude-sonnet-5',
        },
        cost: { usd: 0.01, currency: 'USD', pricingSource: 'provider-envelope', isLocal: false },
      }),
    );

    const backend = makeMockBackend();
    const completedTaskOwner = makeMockBackend();
    const registry = createExactNormalDockerExecutionRegistry(root);
    registry.registerLegacy(active.id, completedTaskOwner);
    await waitForResults(root, sprint, 300, [fixTask], {
      spawnBackend: backend,
      ipcExecutionMode: 'legacy-non-docker',
      exactDockerRegistry: registry,
    });

    expect(backend.calls.map(call => call.taskId)).toContain('702-001-fix');
    expect(completedTaskOwner.kill).toHaveBeenCalledWith(active.id);
    expect(backend.kill).not.toHaveBeenCalledWith(active.id);
    expect(registry.resolveLifecycleOwner(fixTask.id)).toBe(backend);
    expect(vi.mocked(spawnWorker)).not.toHaveBeenCalled();
    expect(fixTask.provider).toBe('claude');
    expect(fixTask.modelEffort).toBe('high');

    const persisted = JSON.parse(readFileSync(join(root, '.tasks', 'task-702-001-fix.json'), 'utf-8'));
    expect(persisted.status).toBe(TaskStatus.EXECUTING);
    expect(persisted.modelEffort).toBe('high');
  });

  it('propagates one provider-authority HOLD instead of retrying a queued task', async () => {
    const active = makeTask('702-AUTH-ACTIVE', {
      status: TaskStatus.EXECUTING,
      budget: undefined,
    });
    const queued = makeTask('702-AUTH-QUEUED', { provider: 'claude' });
    const sprint = {
      id: 'sprint-sched3',
      number: 1,
      tasks: [active, queued],
      workers: [`w-${active.id}`, `w-${queued.id}`],
      phase: SprintPhase.EXECUTE,
      status: SprintStatus.ACTIVE,
      planningMode: 'structured',
    } as Sprint;
    writeFileSync(
      join(root, '.tasks', `task-${active.id}.result`),
      JSON.stringify({
        taskId: active.id,
        workerId: `w-${active.id}`,
        filesChanged: [],
        linesAdded: 0,
        linesRemoved: 0,
        testsPassed: true,
        coverage: 100,
        selfAssessment: 'DONE',
        notes: 'ok',
        tokenUsage: {
          inputTokens: 10,
          outputTokens: 2,
          cacheReadTokens: 0,
          source: 'provider-adapter',
          provider: 'claude',
          model: 'claude-sonnet-5',
        },
        cost: {
          usd: 0.01,
          currency: 'USD',
          pricingSource: 'provider-envelope',
          isLocal: false,
        },
      }),
    );
    // The provider-authority front door is composition-health-only now: it never
    // runs role admission itself. A HOLD is injected by an UNHEALTHY authority
    // composition (state: 'hold'); the candidate-bound admission seam
    // (scheduler-effects → preflightProviderExecutionIngress) propagates it as a
    // typed ProviderExecutionIngressHoldError. The retired roleAdmissionRuntime
    // .admit path must NOT be consulted at this seam.
    const admit = vi.fn();
    const authority = {
      state: 'hold',
      reasonCode: 'authority_unavailable',
      tenantId: 'local',
      projectId: 'project-sched3',
      authorityEvidenceRef: `provider-authority:${'a'.repeat(64)}`,
      service: { roleAdmissionRuntime: { admit } },
      close: vi.fn(),
    } as never;
    const backend = makeMockBackend();
    const config = {
      dependency_pipeline_enabled: false,
      auth_mode: 'api',
      worker_provider: 'claude',
      provider_fallback: { worker: ['codex'] },
      activeModeConfig: { max_workers: 1 },
    } as unknown as ResolvedConfig;

    let caught: unknown;
    try {
      await waitForResults(
        root,
        sprint,
        300,
        [queued],
        { spawnBackend: backend, providerAuthority: authority },
        undefined,
        config,
      );
    } catch (e) {
      caught = e;
    }

    // HOLD propagates as the typed error, carrying the composition reasonCode faithfully.
    expect(caught).toBeInstanceOf(ProviderExecutionIngressHoldError);
    expect((caught as ProviderExecutionIngressHoldError).reasonCode).toBe('authority_unavailable');
    // The retired front-door role-admission path is not consulted at this seam.
    expect(admit).not.toHaveBeenCalled();
    // Fail-closed safety preserved: a HOLD never becomes a spawn/dispatch, and the
    // queued task is not fail-open retried.
    expect(backend.calls).toHaveLength(0);
    expect(buildWorkerPrompt).not.toHaveBeenCalled();
    expect(queued.status).toBe(TaskStatus.PENDING);
  });
});

// ─── Live wiring — dep-ready trigger (dispatchReadyTasks) ───────────────────

describe('waitForResults — dep-ready trigger (dispatchReadyTasks) delegates to executeSpawnTask', () => {
  let root: string;

  beforeEach(() => { root = makeTmpDir('sched3-depready'); vi.clearAllMocks(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('spawns a dependency-ready fix-task with inherited routing fields and persists task-<id>.json (behavior a + b, live wiring)', async () => {
    const original = makeTask('703-001', { modelEffort: 'high', provider: 'claude' });
    writeOriginalTask(root, original);

    const dep = makeTask('703-000', { status: TaskStatus.DONE });
    const fixTask = makeTask('703-001-fix', {
      isPriorityFix: true,
      fixForTaskId: '703-001',
      dependencies: ['703-000'],
    });

    const sprint: Sprint = {
      id: 'sprint-sched3',
      number: 1,
      tasks: [dep, fixTask],
      workers: ['w-703-000', 'w-703-001-fix'],
      phase: SprintPhase.EXECUTE,
      status: SprintStatus.ACTIVE,
      planningMode: 'structured',
    } as Sprint;

    const config = {
      dependency_pipeline_enabled: false,
      activeModeConfig: { max_workers: 3, brain_model: 'claude-opus-4-8', default_model: 'claude-sonnet-5', haiku_allowed: true },
    } as unknown as ResolvedConfig;

    const backend = makeMockBackend();
    await waitForResults(
      root,
      sprint,
      300,
      undefined,
      { spawnBackend: backend, ipcExecutionMode: 'legacy-non-docker' },
      undefined,
      config,
    );

    expect(backend.calls.map(call => call.taskId)).toContain('703-001-fix');
    expect(vi.mocked(spawnWorker)).not.toHaveBeenCalled();
    expect(fixTask.provider).toBe('claude');
    expect(fixTask.modelEffort).toBe('high');

    const persisted = JSON.parse(readFileSync(join(root, '.tasks', 'task-703-001-fix.json'), 'utf-8'));
    expect(persisted.status).toBe(TaskStatus.EXECUTING);
  });
});
