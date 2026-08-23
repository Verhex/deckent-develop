/**
 * Sprint 168 W2.5 — Spawn-Spawner C0c wire integration test.
 *
 * C0c shipped two pure helpers (sprint-controller.ts):
 *   - readTaskJsonFresh(projectRoot, taskId): Task    — always disk-read
 *   - consultCollisionDecision(root, sprintId, payload): SpawnDecision
 *
 * BUT the spawn pipeline (sprint-spawner.ts:189 spawnWorkers) did not consult
 * them — only emitted SCOPE_COLLISION_DETECTED and continued spawning. This
 * test asserts the live wire:
 *
 *   1. When two PENDING tasks scope-collide on the same filesWrite,
 *      spawnWorkers consults the decision (action='block') and emits
 *      BRAIN→SPAWN:BLOCKED with the offending taskIds + files.
 *   2. The blocked tasks DO NOT emit TASK_ASSIGN.
 *   3. The blocked tasks DO NOT invoke backend.spawn(...).
 *   4. Non-colliding tasks proceed normally (TASK_ASSIGN emitted, spawn called).
 *
 * The integration is contract-only: `consultCollisionDecision` is the C0c
 * RC2 wire layer and writes the BLOCKED event itself; sprint-spawner just
 * checks the returned `action === 'block'` and short-circuits.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnWorkers, resetCollisionDebounce } from '../../src/orchestra/sprint-spawner.js';
import { readEvents, CHANNELS } from '../../src/orchestra/event-stream.js';
import { TaskStatus } from '../../src/core/types.js';
import type { Sprint, Task, ResolvedConfig, ModelType } from '../../src/core/types.js';
import type { SpawnBackend, SpawnBackendOptions } from '../../src/orchestra/spawn-backend.js';
import { runSpawnPhase } from '../../src/orchestra/sprint-phases.js';
import { ProviderExecutionIngressHoldError } from '../../src/core/provider-execution-ingress-authority.js';

// ─── Mock SpawnBackend ────────────────────────────────────────────

interface SpawnCall {
  taskId: string;
  model: ModelType;
  prompt: string;
  opts?: SpawnBackendOptions;
}

function makeMockBackend(): SpawnBackend & { calls: SpawnCall[] } {
  const calls: SpawnCall[] = [];
  return {
    name: 'mock',
    liveUsageBudgetSupport: 'measured-stream' as const,
    executionLandingCapability: 'cooperative-landing' as const,
    spawn(taskId, model, prompt, opts) {
      calls.push({ taskId, model, prompt, opts });
    },
    kill() { /* no-op */ },
    list() { return calls.map(c => c.taskId); },
    isAvailable() { return Promise.resolve(true); },
    calls,
  };
}

// ─── Task Factory ─────────────────────────────────────────────────

function createTask(id: string, filesWrite: string[]): Task {
  return {
    id,
    title: `Task ${id}`,
    description: `Wire test task ${id}`,
    model: 'claude-sonnet-5' as ModelType,
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'wire-integration-test',
    scope: {
      directories: [],
      filesRead: [],
      filesWrite,
    },
    dependencies: [],
    goNogo: {
      goCriteria: 'no test',
      noGoCriteria: 'no test',
      techDebtAcceptable: 'none',
    },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-168',
    assignedAgent: 'generic',
    assignedSkills: [],
    provider: 'claude',
    budget: { maxTurns: 1 },
    budgetPolicy: {
      state: 'allow',
      role: 'worker',
      resolvedProvider: 'claude',
      executionCostClass: 'remote',
      profileRef: 'tests.orchestra.spawn-spawner-wire',
      policyDigest: 'a'.repeat(64),
      admissionMode: 'unattended',
      landingPolicy: { reserve_ratio: 0.25 },
    },
  } as unknown as Task;
}

function makeConfig(): ResolvedConfig {
  return {
    dependency_pipeline_enabled: false,
    activeModeConfig: {
      max_workers: 4,
    },
  } as unknown as ResolvedConfig;
}

function makeSprint(id: string, tasks: Task[]): Sprint {
  return {
    id,
    number: 168,
    phase: 'SPAWN' as Sprint['phase'],
    status: 'ACTIVE' as Sprint['status'],
    tasks,
    startedAt: new Date().toISOString(),
  } as unknown as Sprint;
}

// ─── Tests ────────────────────────────────────────────────────────

describe('spawnWorkers — C0c wire (Sprint 168 W2.5)', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = mkdtempSync(join(tmpdir(), 'w25-spawn-wire-'));
    mkdirSync(join(testRoot, '.tasks'), { recursive: true });
    mkdirSync(join(testRoot, '.deckent'), { recursive: true });
    // sprint-state.json absent — getCurrentSprintId returns null and code
    // falls back to sprint.id ('sprint-168') passed in the Sprint fixture.
    resetCollisionDebounce(); // FIX-5: hermetic — clear cross-test debounce state
  });

  afterEach(() => {
    if (existsSync(testRoot)) {
      rmSync(testRoot, { recursive: true, force: true });
    }
  });

  function persistTasks(tasks: Task[]): void {
    for (const t of tasks) {
      writeFileSync(
        join(testRoot, '.tasks', `task-${t.id}.json`),
        JSON.stringify(t, null, 2),
        'utf-8',
      );
    }
  }

  it('blocks initial sprint dispatch when attended authority is only a raw reference', async () => {
    const task = createTask('168-ATTENDED-RAW', []);
    task.budgetPolicy = {
      ...task.budgetPolicy!,
      admissionMode: 'attended',
      landingPolicy: { reserve_ratio: 0.25, attended_unsupported: 'allow-hard-stop' },
      approvalEvidenceRef: 'approval://raw-reference-is-not-authority',
    };
    persistTasks([task]);
    const sprint = makeSprint('sprint-168', [task]);
    const backend = makeMockBackend();
    Object.defineProperty(backend, 'executionLandingCapability', { value: 'unsupported' });

    const origCwd = process.cwd();
    process.chdir(testRoot);
    try {
      await expect(spawnWorkers(testRoot, sprint, makeConfig(), { spawnBackend: backend }))
        .rejects.toThrow('exact final dispatch binding');
    } finally {
      process.chdir(origCwd);
    }
    expect(backend.calls).toHaveLength(0);
  });

  it('routes an owner-authorized final-only Codex budget through Docker containment', async () => {
    const task = createTask('469-FINAL-ONLY', []);
    task.model = 'gpt-5.6-sol';
    task.provider = 'codex';
    task.budgetPolicy = {
      ...task.budgetPolicy!,
      resolvedProvider: 'codex',
      finalOnlyUsage: {
        maxWallClockSeconds: 600,
        profileRef: 'execution_budget.final_only_usage',
        policyDigest: 'a'.repeat(64),
      },
    };
    persistTasks([task]);
    const backend = makeMockBackend();
    Object.defineProperties(backend, {
      name: { value: 'docker' },
      liveUsageBudgetSupport: { value: 'measured-stream' },
    });

    const origCwd = process.cwd();
    process.chdir(testRoot);
    try {
      await spawnWorkers(
        testRoot,
        makeSprint('sprint-469', [task]),
        { ...makeConfig(), spawn_backend: 'docker' } as ResolvedConfig,
        { spawnBackend: backend },
      );
    } finally {
      process.chdir(origCwd);
    }

    expect(backend.calls).toHaveLength(1);
    expect(backend.calls[0]?.opts?.finalOnlyUsageContainment).toEqual(
      task.budgetPolicy.finalOnlyUsage,
    );
  });

  it('blocks a final-only Docker dispatch when the task-stamped grant is missing', async () => {
    const task = createTask('469-FINAL-ONLY-MISSING', []);
    task.model = 'gpt-5.6-sol';
    task.provider = 'codex';
    task.budgetPolicy = {
      ...task.budgetPolicy!,
      resolvedProvider: 'codex',
    };
    persistTasks([task]);
    const backend = makeMockBackend();
    Object.defineProperties(backend, {
      name: { value: 'docker' },
      liveUsageBudgetSupport: { value: 'measured-stream' },
    });

    const origCwd = process.cwd();
    process.chdir(testRoot);
    try {
      await expect(spawnWorkers(
        testRoot,
        makeSprint('sprint-168-final-only-missing', [task]),
        { ...makeConfig(), spawn_backend: 'docker' } as ResolvedConfig,
        { spawnBackend: backend },
      )).rejects.toThrow();
    } finally {
      process.chdir(origCwd);
    }
    expect(backend.calls).toHaveLength(0);
  });

  it('does not retry a provider-authority composition HOLD and never reaches prompt/task assignment/backend', async () => {
    const task = createTask('168-PROVIDER-AUTH-HOLD', []);
    persistTasks([task]);
    const sprint = makeSprint('sprint-168-provider-authority', [task]);
    const backend = makeMockBackend();
    // Front-door contract: only a broken authority COMPOSITION (keyring,
    // custody, policy layer) holds the spawn; a healthy composition passes
    // and the candidate-bound admission runs at the exact-candidate stage.
    const authority = {
      state: 'hold',
      reasonCode: 'authority_unavailable',
      authorityEvidenceRef: `provider-authority:${'a'.repeat(64)}`,
      retryable: false,
      close: vi.fn(),
    } as never;

    const caught = await runSpawnPhase(
      testRoot,
      sprint,
      makeConfig(),
      { providerAuthority: authority },
      backend,
    ).catch(error => error);

    expect(caught).toBeInstanceOf(ProviderExecutionIngressHoldError);
    expect(caught).toMatchObject({
      reasonCode: 'authority_unavailable',
      durableEvidenceWritten: true,
      request: {
        role: 'worker',
        purpose: 'worker-execution',
        taskId: task.id,
        provider: 'claude',
        model: 'claude-sonnet-5',
        configuredBackend: 'mock',
        unattended: true,
      },
    });
    expect(backend.calls).toHaveLength(0);
    expect(task.status).toBe(TaskStatus.PENDING);
    expect(readEvents(testRoot, sprint.id).filter(
      event => event.channel === CHANNELS.TASK_ASSIGN,
    )).toHaveLength(0);
  });

  it('emits BRAIN→SPAWN:BLOCKED when two tasks collide on filesWrite', async () => {
    const t1 = createTask('168-W25-A', ['src/shared.ts']);
    const t2 = createTask('168-W25-B', ['src/shared.ts']);
    persistTasks([t1, t2]);
    const sprint = makeSprint('sprint-168', [t1, t2]);
    const backend = makeMockBackend();

    // Cast away the chdir requirement — spawnWorkers reads projectRoot directly
    const origCwd = process.cwd();
    process.chdir(testRoot);
    try {
      await spawnWorkers(testRoot, sprint, makeConfig(), { spawnBackend: backend });
    } finally {
      process.chdir(origCwd);
    }

    const events = readEvents(testRoot, 'sprint-168');
    const blockedEvents = events.filter(e => e.channel === CHANNELS.SPAWN_BLOCKED);

    expect(blockedEvents.length).toBeGreaterThanOrEqual(1);
    const blocked = blockedEvents[0]!;
    expect(blocked.source).toBe('brain');
    const payload = blocked.payload as { taskIds: string[]; winner?: string; serialized?: boolean; files: string[]; reason: string };
    // FIX-3 (B-COLLISION-HANG — Sprint 319): serialize, not block-all. The
    // lowest-id writer (168-W25-A) is the winner and dispatches; only the rest
    // (168-W25-B) are deferred — guaranteeing forward progress (block-all
    // deadlocked the sprint, 319 hung 7h).
    expect(payload.serialized).toBe(true);
    expect(payload.winner).toBe('168-W25-A');
    expect(payload.taskIds).toEqual(['168-W25-B']);
    expect(payload.files).toContain('src/shared.ts');
    expect(payload.reason).toContain('src/shared.ts');
  });

  it('does NOT emit TASK_ASSIGN for the deferred colliding task (winner proceeds)', async () => {
    const t1 = createTask('168-W25-C', ['src/clash.ts']);
    const t2 = createTask('168-W25-D', ['src/clash.ts']);
    persistTasks([t1, t2]);
    const sprint = makeSprint('sprint-168', [t1, t2]);
    const backend = makeMockBackend();

    const origCwd = process.cwd();
    process.chdir(testRoot);
    try {
      await spawnWorkers(testRoot, sprint, makeConfig(), { spawnBackend: backend });
    } finally {
      process.chdir(origCwd);
    }

    const events = readEvents(testRoot, 'sprint-168');
    const assignEvents = events.filter(e => e.channel === CHANNELS.TASK_ASSIGN);
    const assignedTaskIds = assignEvents.map(e => (e.payload as { taskId: string }).taskId);

    // FIX-3 (B-COLLISION-HANG — Sprint 319): serialize — the winner (lowest-id,
    // 168-W25-C) dispatches; only the deferred collider (168-W25-D) is held back.
    expect(assignedTaskIds).toContain('168-W25-C');
    expect(assignedTaskIds).not.toContain('168-W25-D');
    // The winner IS spawned; the deferred collider is not.
    expect(backend.calls.map(c => c.taskId)).toContain('168-W25-C');
    expect(backend.calls.map(c => c.taskId)).not.toContain('168-W25-D');
  });

  it('TASK_ASSIGN payload uses readTaskJsonFresh disk read (not stale in-memory)', async () => {
    const t1 = createTask('168-W25-E', ['src/solo.ts']);
    persistTasks([t1]);
    const sprint = makeSprint('sprint-168', [t1]);
    const backend = makeMockBackend();

    // PLAN-time in-memory task lists 'src/solo.ts' but disk has been patched
    // between PLAN and SPAWN (operator manual recovery). The disk state must win.
    const patched = { ...t1, scope: { ...t1.scope!, filesWrite: ['src/patched.ts'] } };
    writeFileSync(
      join(testRoot, '.tasks', `task-${t1.id}.json`),
      JSON.stringify(patched, null, 2),
      'utf-8',
    );

    const origCwd = process.cwd();
    process.chdir(testRoot);
    try {
      await spawnWorkers(testRoot, sprint, makeConfig(), { spawnBackend: backend });
    } finally {
      process.chdir(origCwd);
    }

    const events = readEvents(testRoot, 'sprint-168');
    const assignEvents = events.filter(e => e.channel === CHANNELS.TASK_ASSIGN);
    expect(assignEvents.length).toBe(1);
    const payload = assignEvents[0]!.payload as { scope: { filesWrite: string[] } };
    // The TASK_ASSIGN must reflect the disk-patched scope, not the stale in-memory one
    expect(payload.scope.filesWrite).toContain('src/patched.ts');
    expect(payload.scope.filesWrite).not.toContain('src/solo.ts');
  });

  // TOOL-AUTHORITY-001 T1 (GR-2026-08-08-TOOLAUTH-T1-01): the assignment event
  // carries the runtime tool-scope enforcement TRUTH — the wiring proof that a
  // codex/gemini write-scope with no allowedToolsFlag is typed + auditable,
  // never a silent full surface.
  it('TASK_ASSIGN carries toolScope enforcement truth (codex write-scope → UNENFORCED)', async () => {
    const codexTask = { ...createTask('168-W25-TS', ['src/scoped.ts']), provider: 'codex' } as Task;
    persistTasks([codexTask]);
    const sprint = makeSprint('sprint-168', [codexTask]);
    const backend = makeMockBackend();
    const origCwd = process.cwd();
    process.chdir(testRoot);
    try {
      // codex is a host-adapter provider; its downstream budget admission may
      // throw, but TASK_ASSIGN is emitted BEFORE any spawn attempt — the event
      // is durable regardless (a stronger proof: the truth is recorded even on
      // a spawn that never proceeds).
      await spawnWorkers(testRoot, sprint, makeConfig(), { spawnBackend: backend }).catch(() => undefined);
    } finally {
      process.chdir(origCwd);
    }
    const assign = readEvents(testRoot, 'sprint-168')
      .filter(e => e.channel === CHANNELS.TASK_ASSIGN);
    expect(assign.length).toBe(1);
    const payload = assign[0]!.payload as { toolScope?: { flagEnforced: boolean; reasonCode: string } };
    expect(payload.toolScope).toBeDefined();
    expect(payload.toolScope!.flagEnforced).toBe(false);
    expect(payload.toolScope!.reasonCode).toBe('RUNTIME_TOOL_SCOPE_UNENFORCED');
  });

  it('TASK_ASSIGN toolScope for a claude write-scope is flag-enforced', async () => {
    const claudeTask = createTask('168-W25-TC', ['src/claude-scoped.ts']);
    persistTasks([claudeTask]);
    const sprint = makeSprint('sprint-168', [claudeTask]);
    const backend = makeMockBackend();
    const origCwd = process.cwd();
    process.chdir(testRoot);
    try {
      await spawnWorkers(testRoot, sprint, makeConfig(), { spawnBackend: backend });
    } finally {
      process.chdir(origCwd);
    }
    const assign = readEvents(testRoot, 'sprint-168')
      .filter(e => e.channel === CHANNELS.TASK_ASSIGN);
    const payload = assign[0]!.payload as { toolScope?: { flagEnforced: boolean; reasonCode: string } };
    expect(payload.toolScope!.flagEnforced).toBe(true);
    expect(payload.toolScope!.reasonCode).toBe('ENFORCED_FLAG_PRESENT');
  });

  // TOOL-AUTHORITY-001 filesystem-write-guard: a write-scoped worker's grant
  // path-scopes Write/Edit but co-grants unscoped Bash — TASK_ASSIGN carries
  // that escape truth so ADR-G-020's write-scope is not silently advisory.
  it('TASK_ASSIGN carries writeScopeShellEscape (scoped Write + unscoped Bash → DEFEATED_BY_SHELL)', async () => {
    const scopedTask = createTask('168-W25-WG', ['src/guarded.ts']);
    persistTasks([scopedTask]);
    const sprint = makeSprint('sprint-168', [scopedTask]);
    const backend = makeMockBackend();
    const origCwd = process.cwd();
    process.chdir(testRoot);
    try {
      await spawnWorkers(testRoot, sprint, makeConfig(), { spawnBackend: backend });
    } finally {
      process.chdir(origCwd);
    }
    const assign = readEvents(testRoot, 'sprint-168')
      .filter(e => e.channel === CHANNELS.TASK_ASSIGN);
    const payload = assign[0]!.payload as {
      writeScopeShellEscape?: { escaped: boolean; reasonCode: string; shellTools: string[]; declaredScope: boolean };
    };
    expect(payload.writeScopeShellEscape).toBeDefined();
    expect(payload.writeScopeShellEscape!.escaped).toBe(true);
    expect(payload.writeScopeShellEscape!.reasonCode).toBe('WRITE_SCOPE_DEFEATED_BY_SHELL');
    expect(payload.writeScopeShellEscape!.shellTools).toEqual(['Bash']);
    expect(payload.writeScopeShellEscape!.declaredScope).toBe(true);
  });

  it('non-colliding tasks proceed normally after a collision blocks others', async () => {
    const colliderA = createTask('168-W25-F', ['src/collide.ts']);
    const colliderB = createTask('168-W25-G', ['src/collide.ts']);
    const solo = createTask('168-W25-H', ['src/independent.ts']);
    persistTasks([colliderA, colliderB, solo]);
    const sprint = makeSprint('sprint-168', [colliderA, colliderB, solo]);
    const backend = makeMockBackend();

    const origCwd = process.cwd();
    process.chdir(testRoot);
    try {
      await spawnWorkers(testRoot, sprint, makeConfig(), { spawnBackend: backend });
    } finally {
      process.chdir(origCwd);
    }

    const events = readEvents(testRoot, 'sprint-168');
    const assignEvents = events.filter(e => e.channel === CHANNELS.TASK_ASSIGN);
    const assignedIds = assignEvents.map(e => (e.payload as { taskId: string }).taskId);

    // FIX-3 (B-COLLISION-HANG — Sprint 319): serialize, not block-all. The solo
    // task and the collision WINNER (lowest-id, 168-W25-F) both proceed; only the
    // deferred collider (168-W25-G) is held back this tick.
    expect(assignedIds).toContain('168-W25-H');             // solo proceeds
    expect(assignedIds).toContain('168-W25-F');             // collision winner proceeds
    expect(assignedIds).not.toContain('168-W25-G');         // deferred collider held back

    const spawnedIds = backend.calls.map(c => c.taskId);
    expect(spawnedIds).toContain('168-W25-H');
    expect(spawnedIds).toContain('168-W25-F');
    expect(spawnedIds).not.toContain('168-W25-G');
  });

  // FIX-5 (B-COLLISION-HANG re-notify debounce): a persisting collision is
  // re-detected on every dispatch tick, but SCOPE_COLLISION_DETECTED (which
  // triggers a nervous proposal) must fire only ONCE per collision-state — not on
  // every tick. Sprint-319 re-emitted it every ~5 min → a fresh Telegram "scope
  // collision" proposal each time (notification spam).
  it('debounces SCOPE_COLLISION_DETECTED across repeated ticks of the same collision (FIX-5)', async () => {
    const mkPair = (): Task[] => [
      createTask('168-W25-J', ['src/dup.ts']),
      createTask('168-W25-K', ['src/dup.ts']),
    ];
    persistTasks(mkPair());
    const backend = makeMockBackend();

    const origCwd = process.cwd();
    process.chdir(testRoot);
    try {
      // Two dispatch ticks with the SAME unresolved collision (fresh PENDING
      // fixtures each tick so the collision genuinely persists tick-to-tick).
      await spawnWorkers(testRoot, makeSprint('sprint-168', mkPair()), makeConfig(), { spawnBackend: backend });
      await spawnWorkers(testRoot, makeSprint('sprint-168', mkPair()), makeConfig(), { spawnBackend: backend });
    } finally {
      process.chdir(origCwd);
    }

    const events = readEvents(testRoot, 'sprint-168');
    const collisionEvents = events.filter(e => e.channel === CHANNELS.SCOPE_COLLISION_DETECTED);
    // Pre-fix: 2 (one per tick). Post-fix: 1 (debounced to the collision-state).
    expect(collisionEvents.length).toBe(1);
  });
});
