/**
 * SCHED5K (425-002) — closing the KOŞULLU-GO scope-gaps named in
 * docs/analysis/scheduler-shadow-divergence-2026-07-12.md §4.2/§5.1, via
 * synthetic shadow-fixtures run through the ACTUAL driver+journal path
 * (`captureShadowSchedulerSnapshot` + `finalizeShadowSchedulerTick`, then a
 * parsed-journal `expect()` — not `scheduler-shadow-equivalence.test.ts`'s
 * direct `reduceSchedulerTick`/`planDispatch` comparison). This file never
 * touches the live spawn/kill path — every "observed" (legacy) outcome below
 * is hand-supplied to the driver, mirroring the convention already used by
 * scheduler-shadow-equivalence.test.ts's flag-contract/fail-soft sections.
 *
 * Report §4.2 named exactly 3 scope-gaps (9-sprint, 2671-tick real dataset):
 *   1. legacy-fifo mode: 0/2671 real ticks.
 *   2. cascade-skip path: 0/2671 real ticks (legacy AND reducer).
 *   3. dependency-driven mid-sprint spawn: only 1/2671 real ticks
 *      (sprint-415 seq=144) — closing this gap folds in the task's separately
 *      required "415-vakası fixture'la pinlenir" (§4.1's verdict).
 *
 * Coverage-summary proof (§5.1 goal: "gelecek dogfood'un kapsamı ölçülebilir
 * olsun") lives in the last describe block, exercising the new
 * `summarizeSchedulerShadowCoverage` (scheduler-journal.ts) against the
 * journal records these fixtures actually produced.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TaskStatus } from '../../src/core/types.js';
import type { Task, Sprint } from '../../src/core/types.js';
import {
  captureShadowSchedulerSnapshot,
  finalizeShadowSchedulerTick,
} from '../../src/orchestra/scheduler-driver.js';
import {
  schedulerShadowJournalPath,
  summarizeSchedulerShadowCoverage,
} from '../../src/orchestra/scheduler-journal.js';
import type { SchedulerShadowRecord } from '../../src/orchestra/scheduler-journal.js';

// ─── Fixtures (mirrors scheduler-shadow-equivalence.test.ts's helpers) ────

const NOW_MS = 1_752_000_000_000;

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    description: `sched5k ${id}`,
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'sched5k-test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [`src/sched5k-${id}.ts`] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-sched5k',
    ...overrides,
  } as Task;
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-sched5k',
    number: 425,
    status: 'executing' as Sprint['status'],
    phase: 'EXECUTE' as Sprint['phase'],
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
    planningMode: 'structured',
  };
}

/** Reads + full-parses a journal .jsonl the same way the divergence report's
 *  §7 methodology note describes ("tam JSON.parse taraması, örnekleme yok"). */
function readJournalRecords(root: string, sprintId: string): SchedulerShadowRecord[] {
  const path = schedulerShadowJournalPath(root, sprintId);
  return readFileSync(path, 'utf-8')
    .trim()
    .split('\n')
    .map(line => JSON.parse(line) as SchedulerShadowRecord);
}

let root: string;
const SPRINT_ID = 'sprint-sched5k';

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sched5k-coverage-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ─── Gap 1: legacy-fifo mode (0/2671 real ticks) ──────────────────────────

describe('scope-gap: legacy-fifo mode — synthetic driver+journal fixture', () => {
  it('equivalence case: an unblocked queue head is drained identically by legacy(observed) and reducer', async () => {
    const q1 = makeTask('q1');
    const q2 = makeTask('q2');
    const sprint = makeSprint([q1, q2]);

    const snapshot = captureShadowSchedulerSnapshot({
      trigger: { kind: 'initial', sequence: 1 },
      strategy: 'legacy-fifo',
      nowMs: NOW_MS,
      costStop: false,
      slotBudget: 5,
      dependencyPipelineEnabled: true,
      sprint,
      remainingQueue: [q1, q2],
      assignedTaskIds: new Set(),
      collectedIds: new Set(),
      completedTaskIds: ['done-worker-1'],
    });

    // "observed" = what the real live popEligibleFromQueue actually does for
    // an unblocked head: pop it and spawn it — no divergence expected here.
    await finalizeShadowSchedulerTick(root, SPRINT_ID, snapshot, {
      assignedTaskIdsAfter: new Set(['q1']),
      collectedIdsAfter: new Set(),
    });

    const [record] = readJournalRecords(root, SPRINT_ID);
    expect(record!.legacyDecision.mode).toBe('legacy-fifo');
    expect(record!.legacyDecision.spawnedTaskIds).toEqual(['q1']);
    expect(record!.reducerDecision.spawnedTaskIds).toEqual(['q1']);
    expect(record!.divergence).toEqual([]); // never exercised in the real 9-sprint dataset; here proven to agree
  });

  it('EXPECTED divergence — FIFO-dep-deliği class: legacy(observed) spawns a dependency-blocked head; reducer marks it Blocked', async () => {
    // Design-doc-named gap ("FIFO head blocked ise destructive shift
    // yapılmamalı") — the live popEligibleFromQueue has NO dependency check
    // (result-collector.ts), so it pops+spawns the head unconditionally.
    // This fixture reproduces that through the driver+journal path (the
    // existing scheduler-shadow-equivalence.test.ts pins the SAME class but
    // via direct planDispatch/reduceSchedulerTick calls, not the driver).
    const blockedHead = makeTask('qb', { dependencies: ['upstream'] });
    const upstream = makeTask('upstream'); // PENDING — never satisfies qb's dependency
    const sprint = makeSprint([blockedHead, upstream]);

    const snapshot = captureShadowSchedulerSnapshot({
      trigger: { kind: 'watcher', sequence: 2 },
      strategy: 'legacy-fifo',
      nowMs: NOW_MS,
      costStop: false,
      slotBudget: 5,
      dependencyPipelineEnabled: true,
      sprint,
      remainingQueue: [blockedHead],
      assignedTaskIds: new Set(),
      collectedIds: new Set(),
      completedTaskIds: ['done-worker-2'],
    });

    // "observed" = real legacy popEligibleFromQueue spawning the blocked head anyway.
    await finalizeShadowSchedulerTick(root, SPRINT_ID, snapshot, {
      assignedTaskIdsAfter: new Set(['qb']),
      collectedIdsAfter: new Set(),
    });

    const records = readJournalRecords(root, SPRINT_ID);
    const record = records.find(r => r.seq === 2)!;
    expect(record.legacyDecision.spawnedTaskIds).toEqual(['qb']);
    expect(record.reducerDecision.spawnedTaskIds).toEqual([]);
    expect(record.reducerDecision.blockedTaskIds).toEqual(['qb']);
    // EXPECTED-divergence — FIFO-dep-deliği: legacy-spawn / reducer-Blocked, exactly one entry:
    expect(record.divergence).toEqual([{ kind: 'spawn-only-in-legacy', taskId: 'qb' }]);
  });
});

// ─── Gap 2: cascade-skip path (0/2671 real ticks, legacy AND reducer) ─────

describe('scope-gap: cascade-skip path — synthetic driver+journal fixture', () => {
  it('equivalence case: a NO_GO-upstream dependent is cascade-skipped identically by legacy(observed) and reducer', async () => {
    // Live-side reality (design-doc): cascadeSkipDeadBlocked is a separate
    // closure that writes a .result for the dependent WITHOUT ever assigning
    // it — the "observed" outcome below mirrors exactly that: collected
    // gains the id, assigned never does. diffCascadeSkipped() is what turns
    // that into legacyDecision.cascadeSkippedTaskIds (scheduler-driver.ts).
    const upstream = makeTask('u1', { status: TaskStatus.NO_GO });
    const dependent = makeTask('dep1', { dependencies: ['u1'] });
    const sprint = makeSprint([upstream, dependent]);

    const snapshot = captureShadowSchedulerSnapshot({
      trigger: { kind: 'watcher', sequence: 3 },
      strategy: 'continuous',
      nowMs: NOW_MS,
      costStop: false,
      slotBudget: 5,
      dependencyPipelineEnabled: true,
      sprint,
      remainingQueue: [],
      assignedTaskIds: new Set(),
      collectedIds: new Set(),
      completedTaskIds: [],
    });

    await finalizeShadowSchedulerTick(root, SPRINT_ID, snapshot, {
      assignedTaskIdsAfter: new Set(), // dep1 never assigned
      collectedIdsAfter: new Set(['dep1']), // dep1 collected via cascadeSkipDeadBlocked's synthetic result
    });

    const records = readJournalRecords(root, SPRINT_ID);
    const record = records.find(r => r.seq === 3)!;
    expect(record.legacyDecision.cascadeSkippedTaskIds).toEqual(['dep1']);
    expect(record.reducerDecision.cascadeSkippedTaskIds).toEqual(['dep1']);
    expect(record.divergence).toEqual([]); // never exercised in the real 9-sprint dataset; here proven to agree
  });
});

// ─── Gap 3 + 415-pin: dependency-driven mid-sprint spawn ──────────────────

describe('scope-gap + 415-pin: dependency-driven mid-sprint spawn (report §4.1/§5.2 reproduce-fixture)', () => {
  it('tick "144": observation-window artifact reproduced — reducer correctly spawns B early; legacy(observed) trails by one tick (EXPECTED, NOT a reducer bug)', async () => {
    // Reproduces §5.2's recipe verbatim: task-B depends on task-A; A is
    // already DONE/collected in THIS snapshot (the reducer, a pure function
    // over the immutable snapshot, immediately sees B as eligible) but the
    // "observed" (legacy) after-read is hand-set to STILL lag — modeling the
    // real async gap between wave.respawn's decision instant and the
    // assignedTaskIds.add() mutation landing, exactly as report §4.1 traces
    // via sprint-415-events.jsonl (1ms-apart cross-validation).
    const taskA = makeTask('A', { status: TaskStatus.DONE });
    const taskB = makeTask('B', { dependencies: ['A'] });
    const sprint = makeSprint([taskA, taskB]);

    const snapshotTick144 = captureShadowSchedulerSnapshot({
      trigger: { kind: 'watcher', sequence: 144 },
      strategy: 'continuous',
      nowMs: NOW_MS,
      costStop: false,
      slotBudget: 5,
      dependencyPipelineEnabled: true,
      sprint,
      remainingQueue: [],
      assignedTaskIds: new Set(), // B not yet assigned per THIS snapshot
      collectedIds: new Set(['A']),
      completedTaskIds: [],
    });

    // "observed" deliberately UNCHANGED — models the before/after read window
    // missing the real mutation, per §4.1's root-cause analysis.
    await finalizeShadowSchedulerTick(root, SPRINT_ID, snapshotTick144, {
      assignedTaskIdsAfter: new Set(),
      collectedIdsAfter: new Set(['A']),
    });

    const records = readJournalRecords(root, SPRINT_ID);
    const record144 = records.find(r => r.seq === 144)!;
    expect(record144.legacyDecision.spawnedTaskIds).toEqual([]);
    expect(record144.reducerDecision.spawnedTaskIds).toEqual(['B']);
    // EXPECTED-divergence — gözlem-penceresi artefaktı (§4.1's NEW class, not
    // one of the 4 mechanical `kind`s but surfaces mechanically as this):
    // reducer is CORRECT (matches what real prod does 1ms later per
    // sprint-415-events.jsonl:12) — this is NOT a reducer-hatası.
    expect(record144.divergence).toEqual([{ kind: 'spawn-only-in-reducer', taskId: 'B' }]);
  });

  it('tick "145": the async mutation has landed — both engines agree (no divergence), pinning §4.1\'s "reducer-haklı" verdict', async () => {
    // One tick later, B is now reflected as assigned+claimed in BOTH the
    // live system and this snapshot — matching sprint-415.jsonl:145's
    // spawnedTaskIds:[] on both sides. This is the self-resolving half of
    // the artifact: it is NOT a persistent reducer/legacy conflict.
    const taskA = makeTask('A', { status: TaskStatus.DONE });
    const taskB = makeTask('B', { status: TaskStatus.CLAIMED, dependencies: ['A'] });
    const sprint = makeSprint([taskA, taskB]);

    const snapshotTick145 = captureShadowSchedulerSnapshot({
      trigger: { kind: 'watcher', sequence: 145 },
      strategy: 'continuous',
      nowMs: NOW_MS + 5_000,
      costStop: false,
      slotBudget: 5,
      dependencyPipelineEnabled: true,
      sprint,
      remainingQueue: [],
      assignedTaskIds: new Set(['B']), // now visible as assigned
      collectedIds: new Set(['A']),
      completedTaskIds: [],
    });

    await finalizeShadowSchedulerTick(root, SPRINT_ID, snapshotTick145, {
      assignedTaskIdsAfter: new Set(['B']), // unchanged this tick -> no new spawn
      collectedIdsAfter: new Set(['A']),
    });

    const records = readJournalRecords(root, SPRINT_ID);
    const record145 = records.find(r => r.seq === 145)!;
    expect(record145.legacyDecision.spawnedTaskIds).toEqual([]);
    expect(record145.reducerDecision.spawnedTaskIds).toEqual([]);
    expect(record145.divergence).toEqual([]); // pinned: the artifact resolves, not a standing reducer disagreement
  });
});

// ─── Coverage-summary proof (§5.1: "gelecek dogfood'un kapsamı ölçülebilir olsun") ─

describe('summarizeSchedulerShadowCoverage — coverage-özeti proof over this file\'s own fixtures', () => {
  it('tallies trigger/mode/spawn/cascade-skip/divergence coverage across all 5 scope-gap-closing ticks above', async () => {
    // Re-run all 5 fixture ticks against ONE shared journal so the summary
    // reflects exactly the scope this file closes — the numeric expectations
    // below are hand-derived from each fixture's own decision above (no
    // magic numbers: every count traces to one of the 5 `it()` blocks).
    const q1 = makeTask('q1');
    const q2 = makeTask('q2');
    const legacyFifoSprint1 = makeSprint([q1, q2]);
    await finalizeShadowSchedulerTick(
      root, SPRINT_ID,
      captureShadowSchedulerSnapshot({
        trigger: { kind: 'initial', sequence: 1 }, strategy: 'legacy-fifo', nowMs: NOW_MS,
        costStop: false, slotBudget: 5, dependencyPipelineEnabled: true, sprint: legacyFifoSprint1,
        remainingQueue: [q1, q2], assignedTaskIds: new Set(), collectedIds: new Set(),
        completedTaskIds: ['done-worker-1'],
      }),
      { assignedTaskIdsAfter: new Set(['q1']), collectedIdsAfter: new Set() },
    );

    const blockedHead = makeTask('qb', { dependencies: ['upstream'] });
    const upstream = makeTask('upstream');
    const legacyFifoSprint2 = makeSprint([blockedHead, upstream]);
    await finalizeShadowSchedulerTick(
      root, SPRINT_ID,
      captureShadowSchedulerSnapshot({
        trigger: { kind: 'watcher', sequence: 2 }, strategy: 'legacy-fifo', nowMs: NOW_MS,
        costStop: false, slotBudget: 5, dependencyPipelineEnabled: true, sprint: legacyFifoSprint2,
        remainingQueue: [blockedHead], assignedTaskIds: new Set(), collectedIds: new Set(),
        completedTaskIds: ['done-worker-2'],
      }),
      { assignedTaskIdsAfter: new Set(['qb']), collectedIdsAfter: new Set() },
    );

    const u1 = makeTask('u1', { status: TaskStatus.NO_GO });
    const dep1 = makeTask('dep1', { dependencies: ['u1'] });
    const cascadeSprint = makeSprint([u1, dep1]);
    await finalizeShadowSchedulerTick(
      root, SPRINT_ID,
      captureShadowSchedulerSnapshot({
        trigger: { kind: 'watcher', sequence: 3 }, strategy: 'continuous', nowMs: NOW_MS,
        costStop: false, slotBudget: 5, dependencyPipelineEnabled: true, sprint: cascadeSprint,
        remainingQueue: [], assignedTaskIds: new Set(), collectedIds: new Set(), completedTaskIds: [],
      }),
      { assignedTaskIdsAfter: new Set(), collectedIdsAfter: new Set(['dep1']) },
    );

    const taskA144 = makeTask('A', { status: TaskStatus.DONE });
    const taskB144 = makeTask('B', { dependencies: ['A'] });
    const depSpawnSprint144 = makeSprint([taskA144, taskB144]);
    await finalizeShadowSchedulerTick(
      root, SPRINT_ID,
      captureShadowSchedulerSnapshot({
        trigger: { kind: 'watcher', sequence: 144 }, strategy: 'continuous', nowMs: NOW_MS,
        costStop: false, slotBudget: 5, dependencyPipelineEnabled: true, sprint: depSpawnSprint144,
        remainingQueue: [], assignedTaskIds: new Set(), collectedIds: new Set(['A']), completedTaskIds: [],
      }),
      { assignedTaskIdsAfter: new Set(), collectedIdsAfter: new Set(['A']) },
    );

    const taskA145 = makeTask('A', { status: TaskStatus.DONE });
    const taskB145 = makeTask('B', { status: TaskStatus.CLAIMED, dependencies: ['A'] });
    const depSpawnSprint145 = makeSprint([taskA145, taskB145]);
    await finalizeShadowSchedulerTick(
      root, SPRINT_ID,
      captureShadowSchedulerSnapshot({
        trigger: { kind: 'watcher', sequence: 145 }, strategy: 'continuous', nowMs: NOW_MS + 5_000,
        costStop: false, slotBudget: 5, dependencyPipelineEnabled: true, sprint: depSpawnSprint145,
        remainingQueue: [], assignedTaskIds: new Set(['B']), collectedIds: new Set(['A']), completedTaskIds: [],
      }),
      { assignedTaskIdsAfter: new Set(['B']), collectedIdsAfter: new Set(['A']) },
    );

    const records = readJournalRecords(root, SPRINT_ID);
    expect(records).toHaveLength(5);

    const summary = summarizeSchedulerShadowCoverage(records);

    expect(summary.totalTicks).toBe(5);
    expect(summary.triggerCounts).toEqual({ initial: 1, watcher: 4 });
    expect([...summary.modesObserved].sort()).toEqual(['continuous', 'legacy-fifo']);

    // legacy(observed) spawned something on: seq1 (q1), seq2 (qb) -> 2
    expect(summary.legacySpawnTicks).toBe(2);
    // reducer spawned something on: seq1 (q1), seq144 (B) -> 2
    expect(summary.reducerSpawnTicks).toBe(2);
    // cascade-skip exercised on exactly seq3, by both engines
    expect(summary.legacyCascadeSkipTicks).toBe(1);
    expect(summary.reducerCascadeSkipTicks).toBe(1);
    // reducer marked a task Blocked on exactly seq2 (qb)
    expect(summary.dependencyBlockTicks).toBe(1);

    expect(summary.divergenceCountByKind).toEqual({
      'spawn-only-in-legacy': 1, // seq2: FIFO-dep-deliği
      'spawn-only-in-reducer': 1, // seq144: gözlem-penceresi artefaktı (415-pin)
      'cascade-skip-only-in-legacy': 0,
      'cascade-skip-only-in-reducer': 0,
    });
    expect(summary.totalDivergenceCount).toBe(2);
  });

  it('is a pure tally with no fs/live-path involvement — empty input yields an all-zero summary', () => {
    const summary = summarizeSchedulerShadowCoverage([]);
    expect(summary.totalTicks).toBe(0);
    expect(summary.triggerCounts).toEqual({ initial: 0, watcher: 0 });
    expect(summary.modesObserved).toEqual([]);
    expect(summary.totalDivergenceCount).toBe(0);
  });
});
