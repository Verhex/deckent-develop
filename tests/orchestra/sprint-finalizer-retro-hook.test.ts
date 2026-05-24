// Sprint 191 Task 008 — Memory DB retro entry write hook closure
// [[project_sprint167_db_gap]] kronik kapanış testi.
//
// Forensic context:
//   Sprint 189 + 190 finalize sonrası memory.db'de retro/sprint-log/mem
//   entries YOK. Root cause: writeRetrospective() içindeki
//   `existsSync(dbPath)` koşulu DB henüz yokken silent skip ediyor;
//   chronic ADR-046 Step 5 contract ihlali.
//
// Bu test üç bağımsız invariant'ı pinler:
//   (a) writeRetrospective DB write hook'u finalize'dan tetiklenir
//       (sprint-log + retro + mem üçlüsü idempotent yazılır).
//   (b) Aynı sprint ID ile tekrar çağrı idempotent — duplicate row YOK.
//   (c) DB file mevcut değilse otomatik oluşturulur — silent skip
//       artık geri gelemez. dbAttempted=true her zaman.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryStore } from '../../src/core/memory-store.js';
import {
  writeRetrospective,
  backfillSprintRetro,
} from '../../src/orchestra/sprint-retro-writer.js';
import { TaskEvaluation } from '../../src/core/types.js';
import type { Sprint, SprintMetrics, Task } from '../../src/core/types.js';

let tmpDir: string;

function makeMetrics(overrides: Partial<SprintMetrics> = {}): SprintMetrics {
  return {
    totalTasks: 3,
    completedTasks: 2,
    techDebtTasks: 0,
    noGoTasks: 1,
    durationMs: 60_000,
    coveragePercent: 90,
    noGoRate: 33,
    newDebtCount: 0,
    resolvedDebtCount: 0,
    totalOpenDebt: 0,
    boundaryViolations: 0,
    crossAssignments: 0,
    contextLinesUsed: 0,
    ...overrides,
  };
}

function makeTask(id: string, title: string, sprintId: string): Task {
  return {
    id,
    title,
    description: title,
    model: 'sonnet' as Task['model'],
    effort: 'low' as Task['effort'],
    priority: 'NORMAL' as Task['priority'],
    reason: 'test',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: 'DONE' as Task['status'],
    sprintId,
    createdAt: new Date().toISOString(),
  };
}

function makeSprint(id: string, number: number): Sprint {
  return {
    id,
    number,
    status: 'COMPLETED' as Sprint['status'],
    phase: 'CLEANUP' as Sprint['phase'],
    tasks: [
      makeTask(`${number}-001`, 'Task A', id),
      makeTask(`${number}-002`, 'Task B', id),
    ],
    workers: [],
    metrics: makeMetrics(),
    startedAt: '2026-05-23T10:00:00Z',
    completedAt: '2026-05-23T11:00:00Z',
  };
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'retro-hook-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('writeRetrospective — DB hook (Sprint 191 Task 008)', () => {
  it('(a) writes sprint-log + retro + mem rows when invoked from finalize path', () => {
    // Pre-create .brain dir + DB to mimic existing project state.
    const brainDir = join(tmpDir, '.brain');
    mkdirSync(brainDir, { recursive: true });
    const dbPath = join(brainDir, 'memory.db');
    new MemoryStore(dbPath).close();

    const sprint = makeSprint('sprint-191', 191);
    const evaluations = new Map<string, TaskEvaluation>([
      ['191-001', TaskEvaluation.DONE],
      ['191-002', TaskEvaluation.NO_GO],
    ]);

    const result = writeRetrospective(tmpDir, sprint, evaluations, sprint.metrics!);

    expect(result.dbAttempted, 'DB write must be attempted from finalize path').toBe(true);
    expect(result.dbError, 'DB write must not surface an error').toBeNull();
    expect(result.sprintLogWritten).toBe(true);
    expect(result.retroWritten).toBe(true);
    expect(result.memoryWritten).toBe(true);

    const store = new MemoryStore(dbPath);
    try {
      const sprintLog = store.getById('sprint-log-191');
      const retro = store.getById('retro-sprint-191');
      const mem = store.getById('mem-sprint-191');

      expect(sprintLog, 'sprint-log-191 must exist (ADR-046 Step 5 contract)').not.toBeNull();
      expect(sprintLog!.type).toBe('sprint');
      expect(sprintLog!.sprint_num).toBe(191);

      expect(retro, 'retro-sprint-191 must exist ([[project_sprint167_db_gap]] closure)').not.toBeNull();
      expect(retro!.type).toBe('retro');

      expect(mem, 'mem-sprint-191 must exist').not.toBeNull();
      expect(mem!.type).toBe('memory');
    } finally {
      store.close();
    }
  });

  it('(b) is idempotent — re-running for the same sprint upserts without duplicates', () => {
    const brainDir = join(tmpDir, '.brain');
    mkdirSync(brainDir, { recursive: true });
    const dbPath = join(brainDir, 'memory.db');
    new MemoryStore(dbPath).close();

    const sprint = makeSprint('sprint-191', 191);
    const evaluations = new Map<string, TaskEvaluation>([
      ['191-001', TaskEvaluation.DONE],
    ]);

    const first = writeRetrospective(tmpDir, sprint, evaluations, sprint.metrics!);
    const second = writeRetrospective(tmpDir, sprint, evaluations, sprint.metrics!);

    expect(first.dbError).toBeNull();
    expect(second.dbError, 'second call must remain error-free (idempotent)').toBeNull();
    expect(second.sprintLogWritten).toBe(true);
    expect(second.retroWritten).toBe(true);
    expect(second.memoryWritten).toBe(true);

    const store = new MemoryStore(dbPath);
    try {
      const retroEntries = store.getByType('retro').filter(e => e.sprint_id === 'sprint-191');
      const sprintLogEntries = store.getByType('sprint').filter(e => e.sprint_id === 'sprint-191');
      const memEntries = store.getByType('memory').filter(e => e.sprint_id === 'sprint-191');

      expect(retroEntries, 'idempotent — exactly 1 retro row per sprint').toHaveLength(1);
      expect(sprintLogEntries, 'idempotent — exactly 1 sprint-log row per sprint').toHaveLength(1);
      expect(memEntries, 'idempotent — exactly 1 memory row per sprint').toHaveLength(1);
    } finally {
      store.close();
    }
  });

  it('(c) auto-creates memory.db when caller passes createIfMissing — chronic gap closure', () => {
    // .brain dir AND DB file BOTH absent — reproduces the chronic gap path
    // where Sprint 189/190 finalize ran without ever materializing the DB.
    // sprint-finalizer.ts uses `createIfMissing: true` so the retro row
    // always lands. Default behavior (no option) still respects the legacy
    // clean-skip contract used by sprint-retro-writer.test.ts.
    const brainDir = join(tmpDir, '.brain');
    expect(existsSync(brainDir), 'precondition: .brain must not exist').toBe(false);

    const sprint = makeSprint('sprint-189', 189);
    const evaluations = new Map<string, TaskEvaluation>([
      ['189-001', TaskEvaluation.DONE],
    ]);

    // Default path — clean skip preserved (back-compat).
    const skipResult = writeRetrospective(tmpDir, sprint, evaluations, sprint.metrics!);
    expect(skipResult.dbAttempted, 'default option preserves clean skip').toBe(false);

    // Opt-in path — used by sprint-finalizer to close the chronic gap.
    const result = writeRetrospective(
      tmpDir,
      sprint,
      evaluations,
      sprint.metrics!,
      undefined,
      undefined,
      undefined,
      { createIfMissing: true },
    );

    expect(result.dbAttempted, 'opt-in must always attempt write').toBe(true);
    expect(result.dbError, 'auto-create must not throw').toBeNull();
    expect(result.retroWritten, 'retro row must land on first finalize').toBe(true);

    const dbPath = join(brainDir, 'memory.db');
    expect(existsSync(dbPath), 'memory.db must be created automatically').toBe(true);
    expect(statSync(dbPath).size).toBeGreaterThan(0);

    const store = new MemoryStore(dbPath);
    try {
      expect(store.getById('retro-sprint-189')).not.toBeNull();
    } finally {
      store.close();
    }
  });
});

describe('backfillSprintRetro — manual closure for chronic gaps', () => {
  it('lands canonical sprint-log + retro + mem rows when finalize never ran', () => {
    // Replicates Sprint 189/190 backfill: finalize hook never persisted
    // any DB rows. backfillSprintRetro should land all 3 canonical IDs.
    const result = backfillSprintRetro(tmpDir, {
      sprintId: 'sprint-190',
      retroContent: '# Sprint sprint-190 Retrospective\n\n## Summary\nBackfilled.',
    });

    expect(result.dbAttempted).toBe(true);
    expect(result.dbError).toBeNull();
    expect(result.sprintLogWritten).toBe(true);
    expect(result.retroWritten).toBe(true);
    expect(result.memoryWritten).toBe(true);

    const dbPath = join(tmpDir, '.brain', 'memory.db');
    const store = new MemoryStore(dbPath);
    try {
      const retro = store.getById('retro-sprint-190');
      expect(retro).not.toBeNull();
      expect(retro!.type).toBe('retro');
      expect(retro!.content).toContain('Backfilled');

      const sprintLog = store.getById('sprint-log-190');
      expect(sprintLog).not.toBeNull();
      expect(sprintLog!.sprint_num).toBe(190);

      const mem = store.getById('mem-sprint-190');
      expect(mem).not.toBeNull();
    } finally {
      store.close();
    }
  });

  it('is idempotent — second backfill upserts existing rows', () => {
    backfillSprintRetro(tmpDir, {
      sprintId: 'sprint-189',
      retroContent: '# First retro body',
    });
    const second = backfillSprintRetro(tmpDir, {
      sprintId: 'sprint-189',
      retroContent: '# Second retro body — overwritten',
    });

    expect(second.dbError).toBeNull();

    const dbPath = join(tmpDir, '.brain', 'memory.db');
    const store = new MemoryStore(dbPath);
    try {
      const retroEntries = store.getByType('retro').filter(e => e.sprint_id === 'sprint-189');
      expect(retroEntries).toHaveLength(1);
      expect(retroEntries[0].content).toContain('Second retro body');
    } finally {
      store.close();
    }
  });
});
