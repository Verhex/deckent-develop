/**
 * Sprint 169 W3.1 — C0c collision detection live-fire tests.
 *
 * Sprint 168 smoke evidence:
 *   - `detectScopeCollisions` wire layer fires via `BRAIN→SPAWN:BLOCKED` only
 *     when two tasks' `scope.filesWrite` entries match string-exact.
 *   - When tasks declare the same logical file under different path variants
 *     (`./src/foo.ts` vs `src/foo.ts`, `src//foo.ts`, `src/foo.ts/`), each
 *     variant accumulates a single writer and the >=2 collision threshold is
 *     never met. Tasks proceed to spawn → runtime contention.
 *
 * Sprint 169 fix introduces `normalizeScopeFiles` and applies it to pending
 * tasks before they reach `detectScopeCollisions`. These tests assert:
 *
 *   1. Baseline: identical paths still collide (regression guard).
 *   2. Leading `./` normalization: `./src/foo.ts` vs `src/foo.ts` collide.
 *   3. Double slash + trailing slash: `src//foo.ts` + `src/foo.ts/` collide
 *      against the canonical `src/foo.ts`.
 *
 * RC: see `docs/audits/sprint-169/W3.1-root-cause.md`.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  spawnWorkers,
  normalizeScopeFiles,
} from '../../src/orchestra/sprint-spawner.js';
import { readEvents, CHANNELS } from '../../src/orchestra/event-stream.js';
import { detectScopeCollisions } from '../../src/orchestra/conflict-resolver.js';
import { TaskStatus } from '../../src/core/types.js';
import type {
  Sprint, Task, ResolvedConfig, ModelType,
} from '../../src/core/types.js';
import type {
  SpawnBackend, SpawnBackendOptions,
} from '../../src/orchestra/spawn-backend.js';
import {
  TEST_MEASURED_LANDING_CAPABILITIES,
  TEST_REMOTE_EXECUTION_BUDGET,
  TEST_REMOTE_WORKER_BUDGET_POLICY,
} from '../helpers/budgeted-docker-execution-fixture.js';

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
    ...TEST_MEASURED_LANDING_CAPABILITIES,
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
    description: `W3.1 collision test ${id}`,
    model: 'claude-sonnet-5' as ModelType,
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'collision-live-fire-test',
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
    sprintId: 'sprint-169',
    assignedAgent: 'generic',
    assignedSkills: [],
    provider: 'claude',
    type: 'code-development',
    budget: TEST_REMOTE_EXECUTION_BUDGET,
    budgetPolicy: TEST_REMOTE_WORKER_BUDGET_POLICY,
  } as unknown as Task;
}

function makeConfig(): ResolvedConfig {
  return {
    dependency_pipeline_enabled: false,
    activeModeConfig: { max_workers: 4 },
  } as unknown as ResolvedConfig;
}

function makeSprint(id: string, tasks: Task[]): Sprint {
  return {
    id,
    number: 169,
    phase: 'SPAWN' as Sprint['phase'],
    status: 'ACTIVE' as Sprint['status'],
    tasks,
    startedAt: new Date().toISOString(),
  } as unknown as Sprint;
}

// ─── Pure normalizeScopeFiles tests ───────────────────────────────

describe('normalizeScopeFiles (Sprint 169 W3.1 helper)', () => {
  it('strips leading "./" prefix', () => {
    expect(normalizeScopeFiles(['./src/foo.ts'])).toEqual(['src/foo.ts']);
  });

  it('collapses repeated forward slashes', () => {
    expect(normalizeScopeFiles(['src//foo.ts'])).toEqual(['src/foo.ts']);
    expect(normalizeScopeFiles(['src///deep////file.ts'])).toEqual(['src/deep/file.ts']);
  });

  it('strips trailing slash', () => {
    expect(normalizeScopeFiles(['src/foo.ts/'])).toEqual(['src/foo.ts']);
  });

  it('composes leading-dot + double-slash + trailing-slash', () => {
    expect(normalizeScopeFiles(['./src//bar.ts/'])).toEqual(['src/bar.ts']);
  });

  it('drops empty / whitespace-only entries', () => {
    expect(normalizeScopeFiles(['', '   ', 'src/foo.ts'])).toEqual(['src/foo.ts']);
  });

  it('is idempotent (already-canonical paths pass through)', () => {
    const canon = ['src/a.ts', 'src/orchestra/sprint-spawner.ts', '.tasks/'];
    // .tasks/ trailing slash IS stripped — directory-vs-file is not the helper's
    // concern; equivalence is what matters. Caller must not rely on trailing
    // slash to distinguish directories.
    expect(normalizeScopeFiles(canon)).toEqual([
      'src/a.ts',
      'src/orchestra/sprint-spawner.ts',
      '.tasks',
    ]);
  });

  it('handles readonly input arrays (TypeScript variance)', () => {
    const ro: readonly string[] = ['./a/b'];
    expect(normalizeScopeFiles(ro)).toEqual(['a/b']);
  });
});

// ─── Pre-pass collision detection (logical equivalence) ───────────

describe('detectScopeCollisions via normalizeScopeFiles pre-pass (W3.1)', () => {
  it('paralel 2 task identical filesWrite → collision detected', () => {
    const taskA = createTask('W31-A', ['src/shared.ts']);
    const taskB = createTask('W31-B', ['src/shared.ts']);

    const normalizedTasks = [taskA, taskB].map(t => ({
      ...t,
      scope: { ...t.scope, filesWrite: normalizeScopeFiles(t.scope.filesWrite) },
    }));
    const result = detectScopeCollisions(normalizedTasks);

    expect(result.collisionCount).toBe(1);
    expect(result.collisions.get('src/shared.ts')).toEqual(
      expect.arrayContaining(['W31-A', 'W31-B']),
    );
  });

  it('scope normalize: ./src/foo vs src/foo recognized as same logical file', () => {
    const taskA = createTask('W31-C', ['./src/foo.ts']);
    const taskB = createTask('W31-D', ['src/foo.ts']);

    const normalizedTasks = [taskA, taskB].map(t => ({
      ...t,
      scope: { ...t.scope, filesWrite: normalizeScopeFiles(t.scope.filesWrite) },
    }));
    const result = detectScopeCollisions(normalizedTasks);

    expect(result.collisionCount).toBe(1);
    expect(result.collisions.get('src/foo.ts')).toEqual(
      expect.arrayContaining(['W31-C', 'W31-D']),
    );
    // The non-canonical key must NOT exist
    expect(result.collisions.has('./src/foo.ts')).toBe(false);
  });

  it('double slash + trailing slash collapse to canonical', () => {
    const taskA = createTask('W31-E', ['src//foo.ts']);
    const taskB = createTask('W31-F', ['./src/foo.ts/']);
    const taskC = createTask('W31-G', ['src/foo.ts']);

    const normalizedTasks = [taskA, taskB, taskC].map(t => ({
      ...t,
      scope: { ...t.scope, filesWrite: normalizeScopeFiles(t.scope.filesWrite) },
    }));
    const result = detectScopeCollisions(normalizedTasks);

    expect(result.collisionCount).toBe(1);
    const writers = result.collisions.get('src/foo.ts') ?? [];
    expect(writers).toEqual(expect.arrayContaining(['W31-E', 'W31-F', 'W31-G']));
  });
});

// ─── Live wire integration (spawnWorkers emits SPAWN_BLOCKED) ─────

describe('spawnWorkers C0c live wire (Sprint 169 W3.1)', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = mkdtempSync(join(tmpdir(), 'w31-live-fire-'));
    mkdirSync(join(testRoot, '.tasks'), { recursive: true });
    mkdirSync(join(testRoot, '.deckent'), { recursive: true });
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

  it('emits BRAIN→SPAWN:BLOCKED when path variants alias the same file', async () => {
    // This is the smoke-test scenario: pre-Sprint-169 this would silently spawn
    // both tasks because './src/x.ts' !== 'src/x.ts'.
    const t1 = createTask('W31-H', ['./src/aliased.ts']);
    const t2 = createTask('W31-I', ['src/aliased.ts']);
    persistTasks([t1, t2]);
    const sprint = makeSprint('sprint-169', [t1, t2]);
    const backend = makeMockBackend();

    const origCwd = process.cwd();
    process.chdir(testRoot);
    try {
      await spawnWorkers(testRoot, sprint, makeConfig(), { spawnBackend: backend });
    } finally {
      process.chdir(origCwd);
    }

    const events = readEvents(testRoot, 'sprint-169');
    const blockedEvents = events.filter(e => e.channel === CHANNELS.SPAWN_BLOCKED);

    expect(blockedEvents.length).toBeGreaterThanOrEqual(1);
    const blocked = blockedEvents[0]!;
    const payload = blocked.payload as { taskIds: string[]; winner?: string; serialized?: boolean; files: string[] };
    // FIX-3 (B-COLLISION-HANG — Sprint 319): the spawner now SERIALIZES colliding
    // writers instead of blocking all of them. The lowest-id writer (W31-H) is the
    // winner and dispatches; only the rest (W31-I) are deferred to a later tick.
    // This guarantees forward progress — block-all previously deadlocked the
    // sprint (sprint-319 hung 7h because neither colliding task ever completed).
    expect(payload.serialized).toBe(true);
    expect(payload.winner).toBe('W31-H');
    expect(payload.taskIds).toEqual(['W31-I']);
    expect(payload.taskIds).not.toContain('W31-H');
    // Canonical form must be in the emitted event
    expect(payload.files).toContain('src/aliased.ts');

    // The winner (lowest-id) IS spawned; only the deferred writer is held back.
    expect(backend.calls.map(c => c.taskId)).toContain('W31-H');
    expect(backend.calls.map(c => c.taskId)).not.toContain('W31-I');
  });

  it('does not spawn a later writer while the first writer is already EXECUTING', async () => {
    const first = createTask('slot-z', ['src/shared.ts']);
    first.status = TaskStatus.EXECUTING;
    const second = createTask('slot-a', ['./src/shared.ts']);
    const third = createTask('slot-m', ['SRC/SHARED.ts']);
    persistTasks([first, second, third]);
    const sprint = makeSprint('sprint-runtime-serialization', [first, second, third]);
    const backend = makeMockBackend();

    const origCwd = process.cwd();
    process.chdir(testRoot);
    try {
      await spawnWorkers(testRoot, sprint, makeConfig(), { spawnBackend: backend });
    } finally {
      process.chdir(origCwd);
    }

    expect(backend.calls).toEqual([]);
  });

  it('allows a FIX writer after its colliding original reached terminal NO_GO', async () => {
    const original = createTask('479-001', ['deneme/chain-01/example.ts']);
    original.status = TaskStatus.NO_GO;
    const fix = createTask('479-001-fix', ['deneme/chain-01/example.ts']);
    fix.isPriorityFix = true;
    fix.fixForTaskId = original.id;
    persistTasks([original, fix]);
    const sprint = makeSprint('sprint-479', [original, fix]);
    const backend = makeMockBackend();

    const origCwd = process.cwd();
    process.chdir(testRoot);
    try {
      await spawnWorkers(testRoot, sprint, makeConfig(), { spawnBackend: backend });
    } finally {
      process.chdir(origCwd);
    }

    expect(backend.calls.map(call => call.taskId)).toEqual([fix.id]);
    expect(fix.status).toBe(TaskStatus.EXECUTING);
  });
});
