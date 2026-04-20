import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryStore } from '../../src/core/memory-store.js';
import { writeRetrospective } from '../../src/orchestra/sprint-retro-writer.js';
import type { Sprint, SprintMetrics, TaskEvaluation } from '../../src/core/types.js';

// ─── Helpers ──────────────────────────────────────────────────────

let tmpDir: string;
let brainDir: string;
let store: MemoryStore;
let dbPath: string;

function makeMinimalSprint(overrides: Partial<Sprint> = {}): Sprint {
  return {
    id: overrides.id ?? 'sprint-144',
    number: overrides.number ?? 144,
    status: overrides.status ?? ('COMPLETED' as Sprint['status']),
    phase: overrides.phase ?? ('CLEANUP' as Sprint['phase']),
    tasks: overrides.tasks ?? [],
    workers: overrides.workers ?? [],
    metrics: overrides.metrics ?? makeMetrics(),
    startedAt: overrides.startedAt ?? '2026-04-17T10:00:00Z',
    completedAt: overrides.completedAt ?? '2026-04-17T12:00:00Z',
  };
}

function makeMetrics(overrides: Partial<SprintMetrics> = {}): SprintMetrics {
  return {
    totalTasks: overrides.totalTasks ?? 5,
    completedTasks: overrides.completedTasks ?? 4,
    techDebtTasks: overrides.techDebtTasks ?? 1,
    noGoTasks: overrides.noGoTasks ?? 0,
    durationMs: overrides.durationMs ?? 7200000,
    coveragePercent: overrides.coveragePercent ?? 85,
    noGoRate: overrides.noGoRate ?? 0,
    newDebtCount: overrides.newDebtCount ?? 0,
    resolvedDebtCount: overrides.resolvedDebtCount ?? 0,
    totalOpenDebt: overrides.totalOpenDebt ?? 0,
    boundaryViolations: overrides.boundaryViolations ?? 0,
    crossAssignments: overrides.crossAssignments ?? 0,
    contextLinesUsed: overrides.contextLinesUsed ?? 0,
  };
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'retro-writer-test-'));
  brainDir = join(tmpDir, '.brain');
  mkdirSync(brainDir, { recursive: true });
  dbPath = join(brainDir, 'memory.db');
  store = new MemoryStore(dbPath);
});

afterEach(() => {
  store.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

// ─── Canonical retro-sprint-NNN ID ───────────────────────────────

describe('writeRetrospective — canonical retro ID', () => {
  it('writes retro entry with canonical retro-sprint-NNN id', () => {
    const sprint = makeMinimalSprint({ id: 'sprint-144', number: 144 });
    const evaluations = new Map<string, TaskEvaluation>();

    writeRetrospective(tmpDir, sprint, evaluations, makeMetrics());

    // Re-open DB to verify (writeRetrospective opens its own store)
    store.close();
    store = new MemoryStore(dbPath);

    const entry = store.getById('retro-sprint-144');
    expect(entry).not.toBeNull();
    expect(entry!.type).toBe('retro');
    expect(entry!.sprint_id).toBe('sprint-144');
    expect(entry!.sprint_num).toBe(144);
    expect(entry!.title).toContain('Sprint sprint-144');
  });

  it('does not create retro-latest entry', () => {
    const sprint = makeMinimalSprint();
    const evaluations = new Map<string, TaskEvaluation>();

    writeRetrospective(tmpDir, sprint, evaluations, makeMetrics());

    store.close();
    store = new MemoryStore(dbPath);

    const latest = store.getById('retro-latest');
    expect(latest).toBeNull();
  });
});

// ─── migrateRetroLatest ──────────────────────────────────────────

describe.skip('migrateRetroLatest (not yet implemented)', () => {
  it('soft-deletes legacy retro-latest entry when it exists', () => {
    // Simulate legacy migration script creating retro-latest
    store.insert({
      id: 'retro-latest',
      type: 'retro',
      title: 'Latest Retrospective',
      content: '# Sprint sprint-141 Retrospective\nSome old content',
      source: 'brain',
    });

    expect(store.getById('retro-latest')).not.toBeNull();

    migrateRetroLatest(store, 'sprint-144', 144);

    // Should be soft-deleted (not visible without includeDeleted)
    expect(store.getById('retro-latest')).toBeNull();
    // But still exists as deleted
    expect(store.getById('retro-latest', { includeDeleted: true })).not.toBeNull();
  });

  it('is a no-op when retro-latest does not exist', () => {
    // Should not throw
    expect(() => migrateRetroLatest(store, 'sprint-144', 144)).not.toThrow();
  });

  it('does not affect sprint-specific retro entries', () => {
    // Insert a canonical retro entry
    store.insert({
      id: 'retro-sprint-143',
      type: 'retro',
      title: 'Sprint sprint-143 Retrospective',
      content: 'Sprint 143 retro content',
      source: 'brain',
      sprint_id: 'sprint-143',
      sprint_num: 143,
    });

    // Also insert legacy
    store.insert({
      id: 'retro-latest',
      type: 'retro',
      title: 'Latest Retrospective',
      content: 'old content',
      source: 'brain',
    });

    migrateRetroLatest(store, 'sprint-144', 144);

    // Canonical entry is untouched
    expect(store.getById('retro-sprint-143')).not.toBeNull();
    // Legacy is soft-deleted
    expect(store.getById('retro-latest')).toBeNull();
  });
});

// ─── getLatestRetro ──────────────────────────────────────────────

describe.skip('MemoryStore.getLatestRetro (not yet implemented)', () => {
  it('returns the retro with the highest sprint_num', () => {
    store.insert({
      id: 'retro-sprint-141',
      type: 'retro',
      title: 'Sprint sprint-141 Retrospective',
      content: 'retro 141',
      source: 'brain',
      sprint_id: 'sprint-141',
      sprint_num: 141,
    });
    store.insert({
      id: 'retro-sprint-143',
      type: 'retro',
      title: 'Sprint sprint-143 Retrospective',
      content: 'retro 143',
      source: 'brain',
      sprint_id: 'sprint-143',
      sprint_num: 143,
    });
    store.insert({
      id: 'retro-sprint-142',
      type: 'retro',
      title: 'Sprint sprint-142 Retrospective',
      content: 'retro 142',
      source: 'brain',
      sprint_id: 'sprint-142',
      sprint_num: 142,
    });

    const latest = store.getLatestRetro();
    expect(latest).not.toBeNull();
    expect(latest!.id).toBe('retro-sprint-143');
    expect(latest!.sprint_num).toBe(143);
  });

  it('returns null when no retro entries exist', () => {
    const latest = store.getLatestRetro();
    expect(latest).toBeNull();
  });

  it('excludes soft-deleted retro entries', () => {
    store.insert({
      id: 'retro-sprint-141',
      type: 'retro',
      title: 'Sprint sprint-141 Retrospective',
      content: 'retro 141',
      source: 'brain',
      sprint_id: 'sprint-141',
      sprint_num: 141,
    });

    store.softDelete('retro-sprint-141', 'test');

    const latest = store.getLatestRetro();
    expect(latest).toBeNull();
  });
});
