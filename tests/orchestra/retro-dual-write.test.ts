// Sprint 168 Cluster C0a-3 — Step 5 retro Dual Write Invariant
//
// BUG-DD (Sprint 167 audit): Sprint 166 T6 shipped writeRetrospective DB
// upsert wire, ancak Sprint 167 finalize sonrasi memory.db'de
// `sprint-log-167`, `retro-sprint-167`, `mem-sprint-167` ID'leri yoktu.
// Forensic kanit: type='sprint' insert ID prefix'i `sprint-${num}` idi —
// canonical convention `sprint-log-${num}` olmaliydi (Sprint 143 plan
// L593, ADR-046 Section "Step 5", Sprint 168 plan L1384).
//
// BUG-EE (Sprint 167 audit): `.brain/RETRO.md` mtime Sprint 165 (2 sprint
// geride) — Step 5 file write hicbir zaman tetiklenmemis veya stale.
//
// Bu test "dual write invariant" sozlesmesini kilitler: writeRetrospective
// her cagrildiginda hem 3 DB row (sprint-log-NNN, retro-sprint-NNN,
// mem-sprint-NNN) hem de `.brain/RETRO.md` (current mtime) yazilmalidir.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryStore } from '../../src/core/memory-store.js';
import { writeRetrospective } from '../../src/orchestra/sprint-retro-writer.js';
import { TaskEvaluation } from '../../src/core/types.js';
import type { Sprint, SprintMetrics, Task } from '../../src/core/types.js';

let tmpDir: string;
let brainDir: string;
let dbPath: string;
let store: MemoryStore;

function makeMetrics(overrides: Partial<SprintMetrics> = {}): SprintMetrics {
  return {
    totalTasks: overrides.totalTasks ?? 3,
    completedTasks: overrides.completedTasks ?? 2,
    techDebtTasks: overrides.techDebtTasks ?? 0,
    noGoTasks: overrides.noGoTasks ?? 1,
    durationMs: overrides.durationMs ?? 60_000,
    coveragePercent: overrides.coveragePercent ?? 90,
    noGoRate: overrides.noGoRate ?? 33,
    newDebtCount: overrides.newDebtCount ?? 0,
    resolvedDebtCount: overrides.resolvedDebtCount ?? 0,
    totalOpenDebt: overrides.totalOpenDebt ?? 0,
    boundaryViolations: overrides.boundaryViolations ?? 0,
    crossAssignments: overrides.crossAssignments ?? 0,
    contextLinesUsed: overrides.contextLinesUsed ?? 0,
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
    startedAt: '2026-05-14T10:00:00Z',
    completedAt: '2026-05-14T11:00:00Z',
  };
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'retro-dual-write-'));
  brainDir = join(tmpDir, '.brain');
  mkdirSync(brainDir, { recursive: true });
  dbPath = join(brainDir, 'memory.db');
  store = new MemoryStore(dbPath);
});

afterEach(() => {
  try { store.close(); } catch { /* may already be closed */ }
  rmSync(tmpDir, { recursive: true, force: true });
});

// ═══ Dual Write Invariant ════════════════════════════════════════

describe('writeRetrospective — dual write invariant (BUG-DD + BUG-EE)', () => {
  it('writes 3 canonical DB rows (sprint-log-NNN, retro-sprint-NNN, mem-sprint-NNN)', () => {
    const sprint = makeSprint('sprint-168', 168);
    const evaluations = new Map<string, TaskEvaluation>([
      ['168-001', TaskEvaluation.DONE],
      ['168-002', TaskEvaluation.DONE],
    ]);

    // close our handle so writeRetrospective can open its own
    store.close();

    writeRetrospective(tmpDir, sprint, evaluations, sprint.metrics!);

    // Re-open the DB to verify writes — writeRetrospective uses its own
    // MemoryStore instance and closes it before returning.
    store = new MemoryStore(dbPath);

    // BUG-DD root cause: ID prefix `sprint-` should be `sprint-log-`
    // (canonical convention from Sprint 143 plan + Sprint 168 plan L1384).
    const logRow = store.getById('sprint-log-168');
    expect(logRow, 'sprint-log-168 entry must exist (BUG-DD canonical ID)').not.toBeNull();
    expect(logRow!.type).toBe('sprint');
    expect(logRow!.sprint_id).toBe('sprint-168');
    expect(logRow!.sprint_num).toBe(168);

    const retroRow = store.getById('retro-sprint-168');
    expect(retroRow, 'retro-sprint-168 entry must exist').not.toBeNull();
    expect(retroRow!.type).toBe('retro');

    const memRow = store.getById('mem-sprint-168');
    expect(memRow, 'mem-sprint-168 entry must exist').not.toBeNull();
    expect(memRow!.type).toBe('memory');
  });

  // B8 (Memory V2): the legacy `.brain/RETRO.md` file is no longer written —
  // the retro lives only in memory.db. The former BUG-EE mtime test (stale
  // RETRO.md file) is obsolete; DB-row freshness is covered by the canonical
  // 3-row test above and tests/orchestra/write-retrospective.test.ts.

  it('writeRetrospective emits all 3 canonical DB rows in a single call', () => {
    // Single writeRetrospective() invocation must produce all side-effects.
    // Sprint 167 regression: invocation happened but DB had zero entries —
    // this test pins the contract: any call site that invokes
    // writeRetrospective gets the sprint-log / retro / memory rows.
    const sprint = makeSprint('sprint-169', 169);
    const evaluations = new Map<string, TaskEvaluation>([
      ['169-001', TaskEvaluation.DONE],
    ]);

    store.close();

    writeRetrospective(tmpDir, sprint, evaluations, sprint.metrics!);

    // Re-open DB
    store = new MemoryStore(dbPath);

    expect(store.getById('sprint-log-169')).not.toBeNull();
    expect(store.getById('retro-sprint-169')).not.toBeNull();
    expect(store.getById('mem-sprint-169')).not.toBeNull();
  });
});
