/**
 * Scheduler-Shadow Retention Tests — Task 430-002
 *
 * Covers:
 *  (a) 15-day-old file archived
 *  (b) 5-day-old file kept
 *  (c) exact 14-day boundary — documented as KEPT (strict `>` semantics)
 *  (d) custom retention_days override changes behavior
 *  (e) missing scheduler-shadow dir → no throw, empty result
 *  (f) archived file byte-content preserved (still JSON.parse-able)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  writeFileSync, existsSync, mkdirSync, rmSync, utimesSync, readFileSync,
} from 'node:fs';
import {
  archiveStaleSchedulerShadowJournals,
  DEFAULT_SCHEDULER_SHADOW_RETENTION_CONFIG,
} from '../../src/core/scheduler-shadow-retention.js';

// ─── Helpers ────────────────────────────────────────────────────────

const REFERENCE_NOW = new Date('2026-07-12T00:00:00.000Z');

function createTmpProject(suffix: string): string {
  const dir = join(tmpdir(), `deckent-sched-shadow-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(join(dir, '.deckent', 'runtime', 'scheduler-shadow'), { recursive: true });
  return dir;
}

function cleanupTmpProject(dir: string): void {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

/** Seed a journal file backdated by `ageDays` relative to REFERENCE_NOW. */
function seedJournal(root: string, filename: string, content: string, ageDays: number): void {
  const filePath = join(root, '.deckent', 'runtime', 'scheduler-shadow', filename);
  writeFileSync(filePath, content);
  const mtime = new Date(REFERENCE_NOW.getTime() - ageDays * 24 * 60 * 60 * 1000);
  utimesSync(filePath, mtime, mtime);
}

// ─── (a) + (b) Age-based archive vs keep ─────────────────────────────

describe('archiveStaleSchedulerShadowJournals — age threshold', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = createTmpProject('age'); });
  afterEach(() => cleanupTmpProject(tmpDir));

  it('(a) archives a journal older than retention_days (15 days, default 14)', () => {
    seedJournal(tmpDir, 'sprint-424.jsonl', '{"tick":1}\n', 15);

    const result = archiveStaleSchedulerShadowJournals(tmpDir, {}, REFERENCE_NOW);

    expect(result.archived.length).toBe(1);
    expect(result.archived[0]).toContain('sprint-424.jsonl');
    expect(result.kept).toEqual([]);
    expect(result.bytesFreed).toBeGreaterThan(0);
    expect(existsSync(join(tmpDir, '.deckent', 'runtime', 'scheduler-shadow', 'sprint-424.jsonl'))).toBe(false);
    expect(existsSync(join(
      tmpDir, '.deckent', 'archive', 'sprints', 'sprint-424', 'scheduler', 'sprint-424.jsonl',
    ))).toBe(true);
  });

  it('(b) keeps a journal newer than retention_days (5 days, default 14)', () => {
    seedJournal(tmpDir, 'sprint-425.jsonl', '{"tick":2}\n', 5);

    const result = archiveStaleSchedulerShadowJournals(tmpDir, {}, REFERENCE_NOW);

    expect(result.archived).toEqual([]);
    expect(result.kept).toEqual(['sprint-425.jsonl']);
    expect(result.bytesFreed).toBe(0);
    expect(existsSync(join(tmpDir, '.deckent', 'runtime', 'scheduler-shadow', 'sprint-425.jsonl'))).toBe(true);
  });
});

// ─── (c) Exact boundary ───────────────────────────────────────────────

describe('archiveStaleSchedulerShadowJournals — exact 14-day boundary', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = createTmpProject('boundary'); });
  afterEach(() => cleanupTmpProject(tmpDir));

  it('(c) a file exactly retention_days old is KEPT — archival requires strictly greater age', () => {
    // ageMs === retentionMs exactly → `ageMs > retentionMs` is false → kept.
    seedJournal(tmpDir, 'sprint-426.jsonl', '{"tick":3}\n', 14);

    const result = archiveStaleSchedulerShadowJournals(tmpDir, {}, REFERENCE_NOW);

    expect(result.kept).toEqual(['sprint-426.jsonl']);
    expect(result.archived).toEqual([]);
  });

  it('one millisecond past the boundary is archived', () => {
    const filePath = join(tmpDir, '.deckent', 'runtime', 'scheduler-shadow', 'sprint-427.jsonl');
    writeFileSync(filePath, '{"tick":4}\n');
    const retentionMs = DEFAULT_SCHEDULER_SHADOW_RETENTION_CONFIG.retention_days * 24 * 60 * 60 * 1000;
    const mtime = new Date(REFERENCE_NOW.getTime() - retentionMs - 1);
    utimesSync(filePath, mtime, mtime);

    const result = archiveStaleSchedulerShadowJournals(tmpDir, {}, REFERENCE_NOW);

    expect(result.archived.length).toBe(1);
    expect(result.kept).toEqual([]);
  });
});

// ─── (d) Custom retention_days override ───────────────────────────────

describe('archiveStaleSchedulerShadowJournals — custom retention_days', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = createTmpProject('custom'); });
  afterEach(() => cleanupTmpProject(tmpDir));

  it('(d) a 10-day-old file is kept under default (14d) but archived under override (7d)', () => {
    seedJournal(tmpDir, 'sprint-428.jsonl', '{"tick":5}\n', 10);

    const defaultResult = archiveStaleSchedulerShadowJournals(tmpDir, {}, REFERENCE_NOW);
    expect(defaultResult.kept).toEqual(['sprint-428.jsonl']);
    expect(defaultResult.archived).toEqual([]);

    const overrideResult = archiveStaleSchedulerShadowJournals(tmpDir, { retention_days: 7 }, REFERENCE_NOW);
    expect(overrideResult.archived.length).toBe(1);
    expect(overrideResult.archived[0]).toContain('sprint-428.jsonl');
    expect(overrideResult.kept).toEqual([]);
  });
});

// ─── (e) Missing directory ─────────────────────────────────────────────

describe('archiveStaleSchedulerShadowJournals — missing shadow directory', () => {
  it('(e) returns an empty result and never throws when the directory does not exist', () => {
    const emptyRoot = join(tmpdir(), `deckent-sched-shadow-missing-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);

    expect(() => archiveStaleSchedulerShadowJournals(emptyRoot, {}, REFERENCE_NOW)).not.toThrow();

    const result = archiveStaleSchedulerShadowJournals(emptyRoot, {}, REFERENCE_NOW);
    expect(result).toEqual({ archived: [], kept: [], bytesFreed: 0 });
  });
});

// ─── (f) Byte-content preservation ─────────────────────────────────────

describe('archiveStaleSchedulerShadowJournals — byte-content preservation', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = createTmpProject('content'); });
  afterEach(() => cleanupTmpProject(tmpDir));

  it('(f) archived file content is byte-identical and remains JSON.parse-able', () => {
    const record = { tick: 42, decision: 'spawn', observed: 'spawn', match: true };
    const line = `${JSON.stringify(record)}\n`;
    seedJournal(tmpDir, 'sprint-429.jsonl', line, 20);

    const result = archiveStaleSchedulerShadowJournals(tmpDir, {}, REFERENCE_NOW);

    expect(result.archived.length).toBe(1);
    const archivedPath = result.archived[0];
    expect(archivedPath).toBeDefined();
    const archivedContent = readFileSync(archivedPath as string, 'utf-8');
    expect(archivedContent).toBe(line);
    expect(JSON.parse(archivedContent.trim())).toEqual(record);
  });
});

// ─── Non-.jsonl files are ignored ───────────────────────────────────────

describe('archiveStaleSchedulerShadowJournals — non-jsonl files', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = createTmpProject('nonjsonl'); });
  afterEach(() => cleanupTmpProject(tmpDir));

  it('ignores files without a .jsonl extension regardless of age', () => {
    seedJournal(tmpDir, 'sprint-430.txt', 'not a journal', 30);

    const result = archiveStaleSchedulerShadowJournals(tmpDir, {}, REFERENCE_NOW);

    expect(result.archived).toEqual([]);
    expect(result.kept).toEqual([]);
    expect(existsSync(join(tmpDir, '.deckent', 'runtime', 'scheduler-shadow', 'sprint-430.txt'))).toBe(true);
  });
});
