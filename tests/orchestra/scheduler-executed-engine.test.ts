/**
 * 429-005 (L676, born-676, SCHED-8 önkoşulu) — proves the two additive
 * building blocks born-676 asks for, both scoped to scheduler-driver.ts +
 * scheduler-journal.ts (result-collector.ts wiring is SCHED-8's job, out of
 * this task's write scope):
 *
 *   (a) a loud, one-line, sprint-start announcement of which engine
 *       `createSchedulerDriver` actually executes — fired once per driver
 *       construction, never per tick, and honest about the defense-in-depth
 *       fallback-to-legacy case (missing config).
 *   (b) an additive, optional `executedEngine` field on the scheduler-shadow
 *       journal record (`SchedulerShadowRecord`), correctly round-tripped by
 *       `finalizeShadowSchedulerTick`, and tallied by
 *       `summarizeSchedulerShadowCoverage` — with dual-read: a record that
 *       predates this field (the current, unmodified 4-arg call shape) must
 *       still parse and bucket as 'unknown', never be misread as 'legacy'.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TaskStatus } from '../../src/core/types.js';
import type { Task, Sprint, ResolvedConfig } from '../../src/core/types.js';
import {
  captureShadowSchedulerSnapshot,
  finalizeShadowSchedulerTick,
  createSchedulerDriver,
} from '../../src/orchestra/scheduler-driver.js';
import type { SchedulerDriverDeps } from '../../src/orchestra/scheduler-driver.js';
import {
  schedulerShadowJournalPath,
  summarizeSchedulerShadowCoverage,
} from '../../src/orchestra/scheduler-journal.js';
import type { SchedulerShadowRecord } from '../../src/orchestra/scheduler-journal.js';

// ─── Fixtures (mirrors scheduler-shadow-coverage.test.ts's helpers) ───────

const NOW_MS = 1_752_000_000_000;

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    description: `l676 ${id}`,
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'l676-test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [`src/l676-${id}.ts`] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-l676',
    ...overrides,
  } as Task;
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-l676',
    number: 429,
    status: 'executing' as Sprint['status'],
    phase: 'EXECUTE' as Sprint['phase'],
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
    planningMode: 'structured',
  };
}

function readJournalRecords(root: string, sprintId: string): SchedulerShadowRecord[] {
  const path = schedulerShadowJournalPath(root, sprintId);
  return readFileSync(path, 'utf-8')
    .trim()
    .split('\n')
    .map(line => JSON.parse(line) as SchedulerShadowRecord);
}

function baseDriverDeps(sprint: Sprint, config: ResolvedConfig | undefined): SchedulerDriverDeps {
  return {
    sprint,
    config,
    remainingQueue: [],
    assignedTaskIds: new Set(),
    collectedIds: new Set(),
    getSlotBudget: () => 5,
    getCostStop: () => false,
    spawnDeps: {
      projectRoot: '/tmp/unused',
      sprintFallbackId: sprint.id,
      config,
      resolveAgentPrompt: async () => undefined,
      resolveSkillPrompts: async () => [],
      buildWriteTargets: () => ['.tasks/'],
    },
    killWorker: vi.fn(),
  };
}

// ─── (a) loud-log: sprint-start, once, honest ─────────────────────────────

describe('createSchedulerDriver — born-676 loud-log', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
  });

  it('logs "scheduler engine: legacy" exactly once at driver construction, never again per tick', async () => {
    const sprint = makeSprint([makeTask('t1')]);
    const driver = createSchedulerDriver('legacy', baseDriverDeps(sprint, undefined));

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith('[deckent] scheduler engine: legacy');

    // Ticking the driver repeatedly must NOT re-announce — one line per
    // sprint-start (driver construction), not per tick.
    await driver({ trigger: 'initial', completedTaskIds: [], runLegacyTick: async () => {} });
    await driver({ trigger: 'watcher', completedTaskIds: [], runLegacyTick: async () => {} });
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it('logs "scheduler engine: reducer" exactly once when engine="reducer" with a real config', () => {
    const sprint = makeSprint([makeTask('t2')]);
    const config = { dependency_pipeline_enabled: true } as ResolvedConfig;
    createSchedulerDriver('reducer', baseDriverDeps(sprint, config));

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith('[deckent] scheduler engine: reducer');
  });

  it('is honest about the defense-in-depth fallback: engine="reducer" but no config logs "legacy", not a false "reducer" claim', () => {
    const sprint = makeSprint([makeTask('t3')]);
    createSchedulerDriver('reducer', baseDriverDeps(sprint, undefined));

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith('[deckent] scheduler engine: legacy');
  });
});

// ─── (b) journal executedEngine field — additive, correct, dual-read ─────

describe('finalizeShadowSchedulerTick — born-676 additive executedEngine field', () => {
  let root: string;
  const SPRINT_ID = 'sprint-l676';

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'l676-executed-engine-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('round-trips executedEngine="reducer" onto the journal record when supplied', async () => {
    const q1 = makeTask('q1');
    const sprint = makeSprint([q1]);

    const snapshot = captureShadowSchedulerSnapshot({
      trigger: { kind: 'initial', sequence: 1 },
      strategy: 'continuous',
      nowMs: NOW_MS,
      costStop: false,
      slotBudget: 5,
      dependencyPipelineEnabled: true,
      sprint,
      remainingQueue: [q1],
      assignedTaskIds: new Set(),
      collectedIds: new Set(),
      completedTaskIds: [],
    });

    await finalizeShadowSchedulerTick(
      root, SPRINT_ID, snapshot,
      { assignedTaskIdsAfter: new Set(['q1']), collectedIdsAfter: new Set() },
      'reducer',
    );

    const [record] = readJournalRecords(root, SPRINT_ID);
    expect(record!.executedEngine).toBe('reducer');
  });

  it('dual-read: an old-style 4-arg call (no executedEngine) still produces a valid record with the field absent, not defaulted to "legacy"', async () => {
    const q2 = makeTask('q2');
    const sprint = makeSprint([q2]);

    const snapshot = captureShadowSchedulerSnapshot({
      trigger: { kind: 'initial', sequence: 1 },
      strategy: 'continuous',
      nowMs: NOW_MS,
      costStop: false,
      slotBudget: 5,
      dependencyPipelineEnabled: true,
      sprint,
      remainingQueue: [q2],
      assignedTaskIds: new Set(),
      collectedIds: new Set(),
      completedTaskIds: [],
    });

    // Exactly the shape of the one real (out-of-scope) production call site
    // today — no 5th argument at all.
    await finalizeShadowSchedulerTick(
      root, SPRINT_ID, snapshot,
      { assignedTaskIdsAfter: new Set(['q2']), collectedIdsAfter: new Set() },
    );

    const [record] = readJournalRecords(root, SPRINT_ID);
    expect(record!.executedEngine).toBeUndefined();
    expect(record!.legacyDecision.spawnedTaskIds).toEqual(['q2']); // pre-existing fields untouched
  });
});

// ─── Coverage tally — executedEngineCounts, including 'unknown' bucket ────

describe('summarizeSchedulerShadowCoverage — born-676 executedEngineCounts tally', () => {
  function record(overrides: Partial<SchedulerShadowRecord>): SchedulerShadowRecord {
    return {
      seq: 1,
      trigger: 'watcher',
      ts: new Date(NOW_MS).toISOString(),
      legacyDecision: { mode: 'continuous', spawnedTaskIds: [], cascadeSkippedTaskIds: [] },
      reducerDecision: { mode: 'continuous', spawnedTaskIds: [], cascadeSkippedTaskIds: [], blockedTaskIds: [] },
      divergence: [],
      ...overrides,
    };
  }

  it('buckets legacy/reducer/unknown correctly, treating a missing field as unknown (dual-read), never legacy', () => {
    const records: SchedulerShadowRecord[] = [
      record({ executedEngine: 'reducer' }),
      record({ executedEngine: 'reducer' }),
      record({ executedEngine: 'legacy' }),
      record({}), // pre-existing journal line predating this field
    ];

    const summary = summarizeSchedulerShadowCoverage(records);
    expect(summary.executedEngineCounts).toEqual({ legacy: 1, reducer: 2, unknown: 1 });
  });

  it('is all-zero (including executedEngineCounts) for empty input', () => {
    const summary = summarizeSchedulerShadowCoverage([]);
    expect(summary.executedEngineCounts).toEqual({ legacy: 0, reducer: 0, unknown: 0 });
  });
});
