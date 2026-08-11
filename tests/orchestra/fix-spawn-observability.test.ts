/**
 * Row 3309 — a queued FIX task spawns observably, or says why it did not.
 *
 * Measured gap (sprint-507 disk evidence): `507-002-fix` sat Queued while the
 * scheduler-shadow journal recorded 92 consecutive watcher decisions with an
 * empty `spawnedTaskIds`. The FIX worker's heartbeat, pid and log never came
 * into existence and nothing anywhere said why. Sprints 508+ DID spawn their
 * FIX workers, so the gap is conditional, not constant — which is exactly why
 * it has to be diagnosable from disk rather than reproduced by hand.
 *
 * Contract pinned here: a scheduler pass that declines to spawn a queued,
 * spawnable FIX task publishes a TYPED reason into the existing scheduler
 * journal (`.deckent/runtime/scheduler-shadow/<sprintId>.jsonl`, additive
 * `recordKind: 'spawn-skip'` record). Never a silent empty pass.
 *
 * This slice makes skips VISIBLE, not different — every assertion below also
 * checks that the admission outcome itself is unchanged (the task is still not
 * spawned when admission refuses it).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { respawnEligibleTasks } from '../../src/orchestra/sprint-spawner.js';
import {
  executeSchedulerDecision,
  publishSchedulerSpawnSkips,
  resetSchedulerSpawnSkipDebounce,
  describeSpawnSkip,
  spawnSkipFromDisposition,
  type SchedulerSpawnSkipRecord,
} from '../../src/orchestra/scheduler-effects.js';
import { schedulerShadowJournalPath } from '../../src/orchestra/scheduler-journal.js';
import { TaskStatus } from '../../src/core/types.js';
import type { Sprint, Task, ResolvedConfig, ModelType } from '../../src/core/types.js';
import type { SpawnBackend, SpawnBackendOptions } from '../../src/orchestra/spawn-backend.js';
import type { SchedulerDecision } from '../../src/orchestra/scheduler-reducer.js';
import {
  TEST_MEASURED_LANDING_CAPABILITIES,
  TEST_REMOTE_EXECUTION_BUDGET,
  TEST_REMOTE_WORKER_BUDGET_POLICY,
} from '../helpers/budgeted-docker-execution-fixture.js';

const SPRINT_ID = 'sprint-3309';

function makeBackend(): SpawnBackend & { spawned: string[] } {
  const spawned: string[] = [];
  return {
    name: 'mock-3309',
    ...TEST_MEASURED_LANDING_CAPABILITIES,
    spawn(taskId: string, _m: ModelType, _p: string, _o?: SpawnBackendOptions) { spawned.push(taskId); },
    kill() { /* no-op */ },
    list() { return spawned; },
    isAvailable() { return Promise.resolve(true); },
    spawned,
  };
}

function task(
  id: string,
  status: TaskStatus,
  overrides: Partial<Task> = {},
): Task {
  return {
    id,
    title: `Task ${id}`,
    description: `row-3309 ${id}`,
    model: 'claude-sonnet-5' as ModelType,
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'row-3309-test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [`src/row3309-${id}.ts`] },
    dependencies: [],
    goNogo: { goCriteria: 'x', noGoCriteria: 'x', techDebtAcceptable: 'none' },
    status,
    sprintId: SPRINT_ID,
    assignedAgent: 'generic',
    assignedSkills: [],
    provider: 'claude',
    budget: TEST_REMOTE_EXECUTION_BUDGET,
    budgetPolicy: TEST_REMOTE_WORKER_BUDGET_POLICY,
    ...overrides,
  } as unknown as Task;
}

/** A FIX task exactly as the FIX phase mints one: priority fix, bound to its origin. */
function fixTask(id: string, fixForTaskId: string, dependencies: string[] = []): Task {
  return task(id, TaskStatus.PENDING, {
    isPriorityFix: true,
    fixForTaskId,
    dependencies,
  } as Partial<Task>);
}

function makeConfig(overrides: Record<string, unknown> = {}): ResolvedConfig {
  return {
    spawn_backend: 'docker',
    dependency_pipeline_enabled: true,
    activeModeConfig: { max_workers: 1 },
    token_throttle_ms: 0,
    docker_timeout: 1200,
    timeout: {
      docker_min_timeout: 300, docker_max_timeout: 86400,
      tmux_min_timeout: 300, tmux_max_timeout: 86400,
      subprocess_min_timeout: 300, subprocess_max_timeout: 86400,
      effort_base: { low: 600, normal: 1200, high: 2400 },
      loc_scaling_enabled: false, history_scaling_enabled: false,
      runtime_extension_enabled: false, adaptive_multiplier: 1.0, runtime_extension_max: 0,
    },
    ...overrides,
  } as unknown as ResolvedConfig;
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: SPRINT_ID,
    number: 3309,
    phase: 'EXECUTE' as Sprint['phase'],
    status: 'ACTIVE' as Sprint['status'],
    tasks,
    startedAt: new Date().toISOString(),
  } as unknown as Sprint;
}

describe('row 3309 — a queued FIX task spawns observably or publishes a typed reason', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'fix-spawn-obs-'));
    mkdirSync(join(root, '.tasks'), { recursive: true });
    mkdirSync(join(root, '.deckent'), { recursive: true });
    resetSchedulerSpawnSkipDebounce();
  });

  afterEach(() => {
    resetSchedulerSpawnSkipDebounce();
    if (existsSync(root)) rmSync(root, { recursive: true, force: true });
  });

  function persist(tasks: Task[]): void {
    for (const t of tasks) {
      writeFileSync(join(root, '.tasks', `task-${t.id}.json`), JSON.stringify(t, null, 2), 'utf-8');
    }
  }

  /**
   * Read back the skip records this pass appended to the EXISTING scheduler
   * journal. Tick records written by `appendSchedulerShadowRecord` carry no
   * `recordKind` at all — dual-read, never inferred — so filtering on the
   * discriminator is also the proof that no new file family was introduced.
   */
  function readSkipRecords(): SchedulerSpawnSkipRecord[] {
    const path = schedulerShadowJournalPath(root, SPRINT_ID);
    if (!existsSync(path)) return [];
    return readFileSync(path, 'utf-8')
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => JSON.parse(line) as { recordKind?: string })
      .filter((record): record is SchedulerSpawnSkipRecord => record.recordKind === 'spawn-skip');
  }

  async function runRespawn(sprint: Sprint, config: ResolvedConfig, backend: SpawnBackend): Promise<string[]> {
    const orig = process.cwd();
    process.chdir(root);
    try {
      return await respawnEligibleTasks(root, sprint, config, { spawnBackend: backend });
    } finally {
      process.chdir(orig);
    }
  }

  it('S6: a queued FIX task held back by an exhausted worker pool publishes worker-slot-exhausted — never a silent empty pass', async () => {
    // One slot, already occupied by a live worker. The FIX task is dependency-
    // clear and genuinely spawnable — this is the measured 507-002-fix shape.
    const running = task('3309-001', TaskStatus.EXECUTING);
    const queuedFix = fixTask('3309-002-fix', '3309-002');
    persist([running, queuedFix]);
    const backend = makeBackend();

    const spawnedIds = await runRespawn(makeSprint([running, queuedFix]), makeConfig(), backend);

    // Admission semantics unchanged: still not spawned.
    expect(spawnedIds).toEqual([]);
    expect(backend.spawned).not.toContain('3309-002-fix');

    // ...but no longer silent.
    const records = readSkipRecords();
    expect(records.length).toBeGreaterThan(0);
    const skips = records.flatMap(record => record.skips);
    const fixSkip = skips.find(skip => skip.taskId === '3309-002-fix');
    expect(fixSkip).toBeDefined();
    expect(fixSkip!.reasonCode).toBe('worker-slot-exhausted');
    expect(fixSkip!.isPriorityFix).toBe(true);
    expect(fixSkip!.detail).toContain('1');
    expect(records[0]!.pass).toBe('respawn-wave');
    expect(records[0]!.spawnedTaskIds).toEqual([]);
  });

  it('S5: dependency_pipeline_enabled=false returns early — the queued FIX task is named with dependency-pipeline-disabled', async () => {
    const queuedFix = fixTask('3309-003-fix', '3309-003');
    persist([queuedFix]);
    const backend = makeBackend();

    const spawnedIds = await runRespawn(
      makeSprint([queuedFix]),
      makeConfig({ dependency_pipeline_enabled: false }),
      backend,
    );

    expect(spawnedIds).toEqual([]);
    const skips = readSkipRecords().flatMap(record => record.skips);
    expect(skips.map(skip => skip.taskId)).toContain('3309-003-fix');
    expect(skips[0]!.reasonCode).toBe('dependency-pipeline-disabled');
  });

  it('S8: an unsatisfied dependency is published as dependency-unsatisfied naming the blocking dependency', async () => {
    const upstream = task('3309-004', TaskStatus.PENDING);
    const queuedFix = fixTask('3309-005-fix', '3309-005', ['3309-004']);
    persist([upstream, queuedFix]);
    const backend = makeBackend();

    await runRespawn(makeSprint([upstream, queuedFix]), makeConfig({
      activeModeConfig: { max_workers: 8 },
    }), backend);

    const skips = readSkipRecords().flatMap(record => record.skips);
    const fixSkip = skips.find(skip => skip.taskId === '3309-005-fix');
    expect(fixSkip).toBeDefined();
    expect(fixSkip!.reasonCode).toBe('dependency-unsatisfied');
    expect(fixSkip!.detail).toContain('3309-004');
  });

  it('a pass that DOES spawn the FIX task publishes a spawn, and adds no skip for it', async () => {
    // The origin task must exist on disk: the canonical executor inherits the
    // fix-task's routing lineage from it before dispatch.
    const origin = task('3309-006', TaskStatus.DONE);
    const queuedFix = fixTask('3309-006-fix', '3309-006', ['3309-006']);
    persist([origin, queuedFix]);
    const backend = makeBackend();

    const spawnedIds = await runRespawn(makeSprint([origin, queuedFix]), makeConfig({
      activeModeConfig: { max_workers: 8 },
    }), backend);

    expect(spawnedIds).toContain('3309-006-fix');
    expect(backend.spawned).toContain('3309-006-fix');
    const skips = readSkipRecords().flatMap(record => record.skips);
    expect(skips.some(skip => skip.taskId === '3309-006-fix')).toBe(false);
  });

  it('reducer tick: a SpawnTask effect the executor declines is journaled with its typed reason', async () => {
    const queuedFix = fixTask('3309-008-fix', '3309-008');
    persist([queuedFix]);
    const decision: SchedulerDecision = {
      orderedEffects: [
        { kind: 'SpawnTask', taskId: '3309-008-fix', idempotencyKey: 'spawn:3309-008-fix' },
        { kind: 'SpawnTask', taskId: '3309-ghost', idempotencyKey: 'spawn:3309-ghost' },
      ],
    } as unknown as SchedulerDecision;

    const result = await executeSchedulerDecision(decision, {
      projectRoot: root,
      sprintFallbackId: SPRINT_ID,
      config: undefined,
      taskMap: new Map([['3309-008-fix', queuedFix]]),
      // Pre-seeded: a spawn for the fix task is already in flight, so the
      // idempotency guard declines it — the exact silent `continue` before.
      assignedTaskIds: new Set(['3309-008-fix']),
      killWorker: () => { /* no-op */ },
      resolveAgentPrompt: async () => undefined,
      resolveSkillPrompts: async () => [],
      buildWriteTargets: () => [],
    });

    expect(result.spawnedTaskIds).toEqual([]);
    expect(result.spawnSkips.map(skip => skip.reasonCode).sort())
      .toEqual(['already-assigned', 'task-not-found']);

    const records = readSkipRecords();
    expect(records.some(record => record.pass === 'reducer-tick')).toBe(true);
    const journaled = records.flatMap(record => record.skips);
    expect(journaled.find(skip => skip.taskId === '3309-008-fix')?.reasonCode).toBe('already-assigned');
    expect(journaled.find(skip => skip.taskId === '3309-ghost')?.reasonCode).toBe('task-not-found');
  });

  it('every non-spawned disposition maps to a typed reason; a real spawn maps to none', () => {
    const subject = fixTask('3309-009-fix', '3309-009');

    expect(spawnSkipFromDisposition({ kind: 'spawned', taskId: subject.id }, subject)).toBeNull();
    expect(spawnSkipFromDisposition(
      { kind: 'collision-held', taskId: subject.id, blockerTaskIds: ['3309-010'] },
      subject,
    )?.reasonCode).toBe('collision-held');
    expect(spawnSkipFromDisposition(
      { kind: 'provider-unavailable', taskId: subject.id, provider: 'codex' },
      subject,
    )?.reasonCode).toBe('provider-unavailable');
    expect(spawnSkipFromDisposition(
      { kind: 'routing-lineage-missing', taskId: subject.id, fixForTaskId: '3309-009', detail: 'unreadable' },
      subject,
    )?.reasonCode).toBe('routing-lineage-missing');
  });

  it('a persisting stall costs ONE journal line, not one per pass, until the reason changes', () => {
    const subject = fixTask('3309-011-fix', '3309-011');
    const skip = describeSpawnSkip(subject, 'worker-slot-exhausted', 'no free worker slot');

    expect(publishSchedulerSpawnSkips(root, SPRINT_ID, 'respawn-wave', [], [skip])).not.toBeNull();
    // Same signature re-observed on the next 91 passes — suppressed.
    for (let pass = 0; pass < 91; pass += 1) {
      expect(publishSchedulerSpawnSkips(root, SPRINT_ID, 'respawn-wave', [], [skip])).toBeNull();
    }
    expect(readSkipRecords()).toHaveLength(1);

    // A genuinely different reason is a new fact and is always published.
    const changed = describeSpawnSkip(subject, 'dependency-unsatisfied', 'waiting on 3309-011');
    expect(publishSchedulerSpawnSkips(root, SPRINT_ID, 'respawn-wave', [], [changed])).not.toBeNull();
    expect(readSkipRecords()).toHaveLength(2);

    // Nothing skipped → nothing written; a healthy pass stays quiet.
    expect(publishSchedulerSpawnSkips(root, SPRINT_ID, 'respawn-wave', ['3309-011-fix'], [])).toBeNull();
    expect(readSkipRecords()).toHaveLength(2);
  });

  it('skip records share the existing journal file — no new file family', () => {
    const subject = fixTask('3309-012-fix', '3309-012');
    publishSchedulerSpawnSkips(root, SPRINT_ID, 'initial-wave', [], [
      describeSpawnSkip(subject, 'queued-not-dispatched', 'left in the wave overflow queue'),
    ]);

    const journalPath = schedulerShadowJournalPath(root, SPRINT_ID);
    expect(existsSync(journalPath)).toBe(true);
    expect(journalPath).toContain(join('.deckent', 'runtime', 'scheduler-shadow'));
    // Discriminated, so a reader dual-reads tick records vs skip records.
    const parsed = JSON.parse(readFileSync(journalPath, 'utf-8').trim()) as SchedulerSpawnSkipRecord;
    expect(parsed.recordKind).toBe('spawn-skip');
    expect(parsed.pass).toBe('initial-wave');
    expect(parsed.skips[0]!.taskId).toBe('3309-012-fix');
  });
});
