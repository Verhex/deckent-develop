// Sprint 198 198-002 — backfill-sprint-log-rows.mjs unit + integration.
//
// Targets the script that reconstructs missing `sprint-log-<num>` rows
// from on-disk archives (Sprint 194/196 finalize-crash recovery).
// Exercises:
//   1. Single `--sprint sprint-NNN` path via archive (task .result +
//      metrics.jsonl) → DB row materialized with correct totals.
//   2. `--all-missing` discovery + write covering multiple sprints.
//   3. Idempotent re-run does not duplicate or error.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { MemoryStore } from '../../src/core/memory-store.js';
import {
  parseArgs,
  discoverArchivedSprints,
  readTaskOutcomes,
  summarizeMetrics,
  buildSprintLogContent,
  planSprintLogPayload,
  applyBackfill,
  runBackfill,
  listExistingSprintLogs,
} from '../../scripts/backfill-sprint-log-rows.mjs';

let tmpDir: string;
let dbPath: string;
let brainArchive: string;
let deckentArchive: string;

function seedDb(): void {
  // Touch MemoryStore once to materialize the schema (FTS5 + tables).
  const store = new MemoryStore(dbPath);
  store.close();
}

function seedTaskResult(
  sprintId: string,
  taskId: string,
  selfAssessment: 'DONE' | 'NO_GO' | 'GO_WITH_TECH_DEBT',
): void {
  const num = parseInt(sprintId.replace(/\D/g, ''), 10);
  const dir = join(brainArchive, `sprint-${num}-tasks`);
  mkdirSync(dir, { recursive: true });
  const payload = {
    taskId,
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: selfAssessment === 'DONE',
    coverage: 0,
    selfAssessment,
    notes: 'fixture',
  };
  writeFileSync(join(dir, `task-${taskId}.result`), JSON.stringify(payload), 'utf-8');
}

function seedMetrics(sprintId: string, lines: object[]): void {
  const dir = join(deckentArchive, sprintId);
  mkdirSync(dir, { recursive: true });
  const text = lines.map((l) => JSON.stringify(l)).join('\n');
  writeFileSync(join(dir, 'metrics.jsonl'), text, 'utf-8');
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'backfill-log-'));
  dbPath = join(tmpDir, 'memory.db');
  brainArchive = join(tmpDir, 'brain-archive');
  deckentArchive = join(tmpDir, 'deckent-archive');
  mkdirSync(brainArchive, { recursive: true });
  mkdirSync(deckentArchive, { recursive: true });
  seedDb();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('parseArgs', () => {
  it('parses --flag values and bare booleans', () => {
    const opts = parseArgs(['--sprint', 'sprint-194', '--dry-run']);
    expect(opts.sprint).toBe('sprint-194');
    expect(opts['dry-run']).toBe(true);
  });
});

describe('readTaskOutcomes', () => {
  it('builds taskId → selfAssessment map from .result files', () => {
    seedTaskResult('sprint-196', '196-001', 'DONE');
    seedTaskResult('sprint-196', '196-002', 'NO_GO');
    const map = readTaskOutcomes(brainArchive, 'sprint-196');
    expect(map.get('196-001')).toBe('DONE');
    expect(map.get('196-002')).toBe('NO_GO');
    expect(map.size).toBe(2);
  });
});

describe('summarizeMetrics', () => {
  it('returns trace durationMs when present', () => {
    seedMetrics('sprint-196', [
      { type: 'metric', name: 'collision.detected', value: 1, timestamp: '2026-05-26T15:50:09.487Z' },
      { type: 'trace', operation: 'wait_results', durationMs: 601_755.52, timestamp: '2026-05-26T16:29:52.232Z' },
    ]);
    const summary = summarizeMetrics(deckentArchive, 'sprint-196');
    expect(summary.durationMs).toBe(601_756);
    expect(summary.eventCount).toBe(2);
  });

  it('falls back to first/last timestamp delta when no trace event', () => {
    seedMetrics('sprint-194', [
      { type: 'metric', name: 'wave.start', value: 0, timestamp: '2026-05-26T09:12:28.115Z' },
      { type: 'metric', name: 'result.collected', value: 1, timestamp: '2026-05-26T09:26:27.980Z' },
    ]);
    const summary = summarizeMetrics(deckentArchive, 'sprint-194');
    expect(summary.durationMs).toBeGreaterThan(800_000);
    expect(summary.durationMs).toBeLessThan(900_000);
  });
});

describe('buildSprintLogContent', () => {
  it('emits Task Outcomes section + counters', () => {
    const outcomes = new Map<string, string>([
      ['196-001', 'DONE'],
      ['196-002', 'NO_GO'],
      ['196-003', 'GO_WITH_TECH_DEBT'],
    ]);
    const content = buildSprintLogContent({
      sprintId: 'sprint-196',
      outcomes,
      metrics: { durationMs: 90_000 },
    });
    expect(content).toContain('# sprint-196');
    expect(content).toContain('- Total tasks: 3');
    expect(content).toContain('- Completed: 1');
    expect(content).toContain('- NO_GO: 1');
    expect(content).toContain('- GO_WITH_TECH_DEBT: 1');
    expect(content).toContain('- Duration: 90000ms');
    expect(content).toContain('## Task Outcomes');
    expect(content).toContain('- 196-001: DONE');
    expect(content).toContain('- 196-002: NO_GO');
  });
});

describe('discoverArchivedSprints', () => {
  it('returns canonical sprint ids from both archive roots, sorted', () => {
    seedTaskResult('sprint-196', '196-001', 'DONE');
    seedMetrics('sprint-194', [
      { type: 'trace', operation: 'wait_results', durationMs: 100, timestamp: '2026-05-26T09:12:28.115Z' },
    ]);
    const ids = discoverArchivedSprints(brainArchive, deckentArchive);
    expect(ids).toEqual(['sprint-194', 'sprint-196']);
  });
});

describe('runBackfill', () => {
  it('--sprint sprint-194 reconstructs row from events.jsonl/metrics.jsonl', () => {
    seedMetrics('sprint-194', [
      { type: 'trace', operation: 'wait_results', durationMs: 750_000, timestamp: '2026-05-26T09:26:27.980Z' },
    ]);
    seedTaskResult('sprint-194', '194-001', 'DONE');
    seedTaskResult('sprint-194', '194-002', 'NO_GO');

    const result = runBackfill({
      dbPath,
      sprintIds: ['sprint-194'],
      brainArchive,
      deckentArchive,
    });
    expect(result.written.length).toBe(1);
    expect(result.written[0]?.id).toBe('sprint-log-194');
    expect(result.written[0]?.totalTasks).toBe(2);

    const db = new Database(dbPath, { readonly: true });
    try {
      const row = db
        .prepare(`SELECT id, sprint_id, sprint_num, content FROM entries WHERE id = 'sprint-log-194'`)
        .get() as { id: string; sprint_id: string; sprint_num: number; content: string } | undefined;
      expect(row).toBeDefined();
      expect(row?.sprint_num).toBe(194);
      expect(row?.content).toContain('- 194-001: DONE');
    } finally {
      db.close();
    }
  });

  it('--all-missing detects multiple missing sprints and writes them', () => {
    seedMetrics('sprint-194', [
      { type: 'trace', operation: 'wait_results', durationMs: 100, timestamp: '2026-05-26T09:26:27.980Z' },
    ]);
    seedTaskResult('sprint-194', '194-001', 'DONE');

    seedMetrics('sprint-196', [
      { type: 'trace', operation: 'wait_results', durationMs: 500, timestamp: '2026-05-26T16:29:52.232Z' },
    ]);
    seedTaskResult('sprint-196', '196-001', 'NO_GO');
    seedTaskResult('sprint-196', '196-002', 'DONE');

    // Pre-seed sprint-log-195 so the discovery filter sees it as already-present.
    const store = new MemoryStore(dbPath);
    try {
      store.upsertSprintLog('sprint-195', { totalTasks: 1 });
    } finally {
      store.close();
    }

    const dbRO = new Database(dbPath, { readonly: true });
    let existing: Set<string>;
    try {
      existing = listExistingSprintLogs(dbRO);
    } finally {
      dbRO.close();
    }
    expect(existing.has('sprint-195')).toBe(true);

    const archived = discoverArchivedSprints(brainArchive, deckentArchive);
    const missing = archived.filter((id) => !existing.has(id));
    const result = runBackfill({
      dbPath,
      sprintIds: missing,
      brainArchive,
      deckentArchive,
    });
    const writtenIds = result.written.map((r) => r.sprintId).sort();
    expect(writtenIds).toEqual(['sprint-194', 'sprint-196']);

    const db = new Database(dbPath, { readonly: true });
    try {
      const rows = db
        .prepare(`SELECT id FROM entries WHERE type = 'sprint' ORDER BY sprint_num`)
        .all() as Array<{ id: string }>;
      const ids = rows.map((r) => r.id);
      expect(ids).toContain('sprint-log-194');
      expect(ids).toContain('sprint-log-195');
      expect(ids).toContain('sprint-log-196');
    } finally {
      db.close();
    }
  });

  it('idempotent re-run — no duplicate row, no error', () => {
    seedMetrics('sprint-196', [
      { type: 'trace', operation: 'wait_results', durationMs: 250, timestamp: '2026-05-26T16:29:52.232Z' },
    ]);
    seedTaskResult('sprint-196', '196-001', 'DONE');

    runBackfill({
      dbPath,
      sprintIds: ['sprint-196'],
      brainArchive,
      deckentArchive,
    });
    runBackfill({
      dbPath,
      sprintIds: ['sprint-196'],
      brainArchive,
      deckentArchive,
    });

    const db = new Database(dbPath, { readonly: true });
    try {
      const rows = db
        .prepare(`SELECT id FROM entries WHERE id = 'sprint-log-196'`)
        .all() as Array<{ id: string }>;
      expect(rows.length).toBe(1);
    } finally {
      db.close();
    }
  });

  it('skips sprints with no on-disk evidence', () => {
    const result = runBackfill({
      dbPath,
      sprintIds: ['sprint-999'],
      brainArchive,
      deckentArchive,
    });
    expect(result.written.length).toBe(0);
    expect(result.skipped.length).toBe(1);
    expect(result.skipped[0]?.reason).toBe('no-archive-evidence');
  });
});

describe('planSprintLogPayload + applyBackfill', () => {
  it('pure planner returns canonical payload usable by applyBackfill', () => {
    seedTaskResult('sprint-200', '200-001', 'DONE');
    seedMetrics('sprint-200', [
      { type: 'trace', operation: 'wait_results', durationMs: 1234, timestamp: '2026-06-01T00:00:00.000Z' },
    ]);
    const payload = planSprintLogPayload('sprint-200', brainArchive, deckentArchive);
    expect(payload.sprintNum).toBe(200);
    expect(payload.totalTasks).toBe(1);
    expect(payload.durationMs).toBe(1234);
    expect(payload.content).toContain('- 200-001: DONE');

    const db = new Database(dbPath);
    try {
      const id = applyBackfill(db, payload);
      expect(id).toBe('sprint-log-200');
      const row = db
        .prepare(`SELECT id, sprint_num FROM entries WHERE id = 'sprint-log-200'`)
        .get();
      expect(row).toBeDefined();
    } finally {
      db.close();
    }
  });
});
