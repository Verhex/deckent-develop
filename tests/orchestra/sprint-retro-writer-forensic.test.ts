// Sprint 166 Task 6 — Bug U regression test (sprint type insert).
//
// Forensic: Sprint 140+ retros stopped emitting `type='sprint'` rows in
// memory.db (only 4 sprint rows existed for sprint-136..139). After fix,
// `writeRetrospective` upserts a sprint metadata entry per sprint.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
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

function metrics(overrides: Partial<SprintMetrics> = {}): SprintMetrics {
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

function makeTask(id: string, title: string): Task {
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
    sprintId: 'sprint-166',
    createdAt: new Date().toISOString(),
  };
}

function makeSprint(overrides: Partial<Sprint> = {}): Sprint {
  return {
    id: overrides.id ?? 'sprint-166',
    number: overrides.number ?? 166,
    status: overrides.status ?? ('COMPLETED' as Sprint['status']),
    phase: overrides.phase ?? ('CLEANUP' as Sprint['phase']),
    tasks: overrides.tasks ?? [makeTask('166-001', 'Task A'), makeTask('166-002', 'Task B')],
    workers: overrides.workers ?? [],
    metrics: overrides.metrics ?? metrics(),
    startedAt: overrides.startedAt ?? '2026-05-13T10:00:00Z',
    completedAt: overrides.completedAt ?? '2026-05-13T10:30:00Z',
  };
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'sprint-forensic-'));
  brainDir = join(tmpDir, '.brain');
  mkdirSync(brainDir, { recursive: true });
  dbPath = join(brainDir, 'memory.db');
  store = new MemoryStore(dbPath);
});

afterEach(() => {
  try { store.close(); } catch { /* may already be closed */ }
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('Bug U fix — writeRetrospective sprint type insert', () => {
  it('inserts a type=sprint row when writeRetrospective runs', () => {
    const sprint = makeSprint({ id: 'sprint-166', number: 166 });
    const evaluations = new Map<string, TaskEvaluation>([
      ['166-001', TaskEvaluation.DONE],
      ['166-002', TaskEvaluation.DONE],
    ]);

    writeRetrospective(tmpDir, sprint, evaluations, sprint.metrics!);

    // Re-open DB — writeRetrospective uses its own MemoryStore instance
    store.close();
    store = new MemoryStore(dbPath);

    const sprintRows = store.getByType('sprint');
    expect(sprintRows.length).toBeGreaterThanOrEqual(1);

    const row = sprintRows.find((r) => r.sprint_num === 166);
    expect(row).toBeDefined();
    expect(row!.type).toBe('sprint');
    expect(row!.sprint_id).toBe('sprint-166');
    expect(row!.sprint_num).toBe(166);
    expect(row!.source).toBe('brain');
    expect(row!.content).toContain('Total tasks: 3');
    expect(row!.content).toContain('166-001');
  });

  it('is idempotent — multiple calls upsert a single sprint row', () => {
    const sprint = makeSprint({ id: 'sprint-167', number: 167 });
    const evaluations = new Map<string, TaskEvaluation>();

    writeRetrospective(tmpDir, sprint, evaluations, sprint.metrics!);
    writeRetrospective(tmpDir, sprint, evaluations, sprint.metrics!);

    store.close();
    store = new MemoryStore(dbPath);

    const matches = store.getByType('sprint').filter((r) => r.sprint_num === 167);
    expect(matches.length).toBe(1);
  });
});
