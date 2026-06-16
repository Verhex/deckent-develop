// tests/nervous/maintenance-ops.test.ts
//
// Real maintenance operations behind the nervous low-risk action handlers
// (LOG_ROTATION / CACHE_INVALIDATE / IPC_DIR_CLEANUP / DEAD_EVENT_STREAM_CLEANUP /
// DEBT_TRENDING_REPORT). Each is projectRoot-scoped + standalone. Hermetic: tmpdir
// project root, cleaned in afterEach.

import { describe, it, expect, afterEach } from 'vitest';
import {
  mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, utimesSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  rotateSprintLogs,
  invalidateDocCache,
  cleanIpcDirs,
  pruneDeadEventStream,
  generateDebtTrendReport,
} from '../../src/nervous/maintenance-ops.js';

let root: string;

function makeRoot(): string {
  root = mkdtempSync(join(tmpdir(), 'deckent-maint-'));
  return root;
}

afterEach(() => {
  if (root && existsSync(root)) rmSync(root, { recursive: true, force: true });
  root = undefined as unknown as string;
});

describe('rotateSprintLogs', () => {
  it('archives sprint logs beyond the keep-count, newest retained', () => {
    const r = makeRoot();
    const sprintsDir = join(r, '.brain', 'sprints');
    mkdirSync(sprintsDir, { recursive: true });
    for (const n of [1, 2, 3, 4, 5]) {
      writeFileSync(join(sprintsDir, `sprint-00${n}.md`), `log ${n}`, 'utf-8');
    }
    const moved = rotateSprintLogs(r, 2); // keep 2 newest (004, 005)
    expect(moved).toBe(3);
    expect(readdirSync(sprintsDir).filter(f => f.endsWith('.md')).sort()).toEqual(['sprint-004.md', 'sprint-005.md']);
    const archived = readdirSync(join(sprintsDir, 'archive')).sort();
    expect(archived).toEqual(['sprint-001.md', 'sprint-002.md', 'sprint-003.md']);
  });

  it('is a no-op (0) when at or under the keep-count, and when dir absent', () => {
    const r = makeRoot();
    expect(rotateSprintLogs(r, 20)).toBe(0); // no .brain/sprints
    const sprintsDir = join(r, '.brain', 'sprints');
    mkdirSync(sprintsDir, { recursive: true });
    writeFileSync(join(sprintsDir, 'sprint-001.md'), 'x', 'utf-8');
    expect(rotateSprintLogs(r, 20)).toBe(0);
  });
});

describe('invalidateDocCache', () => {
  it("clears managed-docs cache entries for cacheType 'all' / 'docs' (preserves the file)", () => {
    const r = makeRoot();
    const cachePath = join(r, '.deckent', 'cache', 'managed-docs-cache.json');
    mkdirSync(join(r, '.deckent', 'cache'), { recursive: true });
    writeFileSync(cachePath, JSON.stringify({ _meta: { adr: 'ADR-031' }, 'some-doc': { hash: 'abc' } }), 'utf-8');
    invalidateDocCache(r, 'all');
    expect(existsSync(cachePath)).toBe(true);          // canonical clear preserves the file
    expect(readFileSync(cachePath, 'utf-8')).not.toContain('some-doc'); // entries gone
  });

  it('leaves the cache untouched for a non-doc cacheType (no such persisted cache)', () => {
    const r = makeRoot();
    const cachePath = join(r, '.deckent', 'cache', 'managed-docs-cache.json');
    mkdirSync(join(r, '.deckent', 'cache'), { recursive: true });
    writeFileSync(cachePath, JSON.stringify({ _meta: {}, 'some-doc': { hash: 'abc' } }), 'utf-8');
    invalidateDocCache(r, 'routing');
    expect(readFileSync(cachePath, 'utf-8')).toContain('some-doc'); // untouched
  });
});

describe('cleanIpcDirs', () => {
  it('removes IPC files older than the cutoff, keeps fresh ones', () => {
    const r = makeRoot();
    const resolved = join(r, '.deckent', 'nervous', 'panic-ipc', 'resolved');
    mkdirSync(resolved, { recursive: true });
    const oldFile = join(resolved, 'old.json');
    const freshFile = join(resolved, 'fresh.json');
    writeFileSync(oldFile, '{}', 'utf-8');
    writeFileSync(freshFile, '{}', 'utf-8');
    // backdate oldFile 2h
    const twoHoursAgo = Date.now() / 1000 - 2 * 3600;
    utimesSync(oldFile, twoHoursAgo, twoHoursAgo);

    const removed = cleanIpcDirs(r, 3600_000); // 1h cutoff
    expect(removed).toBe(1);
    expect(existsSync(oldFile)).toBe(false);
    expect(existsSync(freshFile)).toBe(true);
  });

  it('returns 0 when no IPC dirs exist', () => {
    const r = makeRoot();
    expect(cleanIpcDirs(r, 3600_000)).toBe(0);
  });
});

describe('pruneDeadEventStream', () => {
  it('drops corrupt lines and rewrites, keeping valid JSON events', () => {
    const r = makeRoot();
    mkdirSync(join(r, '.deckent', 'recently-works'), { recursive: true });
    const path = join(r, '.deckent', 'recently-works', 'sprint-001-events.jsonl');
    writeFileSync(path, '{"seq":1}\nNOT-JSON\n{"seq":2}\n{bad\n', 'utf-8');
    const dropped = pruneDeadEventStream(r, 'sprint-001');
    expect(dropped).toBe(2);
    const lines = readFileSync(path, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).seq).toBe(1);
    expect(JSON.parse(lines[1]).seq).toBe(2);
  });

  it('returns 0 for an absent or already-clean stream', () => {
    const r = makeRoot();
    expect(pruneDeadEventStream(r, 'sprint-404')).toBe(0);
    mkdirSync(join(r, '.deckent'), { recursive: true });
    const path = join(r, '.deckent', 'sprint-002-events.jsonl');
    writeFileSync(path, '{"seq":1}\n{"seq":2}\n', 'utf-8');
    expect(pruneDeadEventStream(r, 'sprint-002')).toBe(0);
  });
});

describe('generateDebtTrendReport', () => {
  it('appends a snapshot and writes a markdown trend report', () => {
    const r = makeRoot();
    mkdirSync(join(r, '.brain', 'exports'), { recursive: true });
    writeFileSync(join(r, '.brain', 'exports', 'debt.md'),
      '# Debt\n\n| ID | Title |\n|----|-------|\n| D-1 | x |\n| D-2 | y |\n', 'utf-8');

    const reportPath = generateDebtTrendReport(r);
    expect(existsSync(reportPath)).toBe(true);
    expect(reportPath).toContain('debt-trend.md');

    const jsonl = join(r, '.deckent', 'reports', 'debt-trend.jsonl');
    expect(existsSync(jsonl)).toBe(true);
    const snap = JSON.parse(readFileSync(jsonl, 'utf-8').trim());
    expect(snap.openCount).toBe(2);

    const md = readFileSync(reportPath, 'utf-8');
    expect(md).toMatch(/debt/i);
    expect(md).toContain('2');
  });

  it('records openCount 0 when debt export says none / is absent', () => {
    const r = makeRoot();
    mkdirSync(join(r, '.brain', 'exports'), { recursive: true });
    writeFileSync(join(r, '.brain', 'exports', 'debt.md'), '# Debt\n\n_No active technical debt._\n', 'utf-8');
    const reportPath = generateDebtTrendReport(r);
    const snap = JSON.parse(readFileSync(join(r, '.deckent', 'reports', 'debt-trend.jsonl'), 'utf-8').trim());
    expect(snap.openCount).toBe(0);
    expect(existsSync(reportPath)).toBe(true);
  });

  it('accumulates multiple snapshots (a real time series)', () => {
    const r = makeRoot();
    mkdirSync(join(r, '.brain', 'exports'), { recursive: true });
    writeFileSync(join(r, '.brain', 'exports', 'debt.md'), '_No active technical debt._\n', 'utf-8');
    generateDebtTrendReport(r);
    generateDebtTrendReport(r);
    const jsonl = readFileSync(join(r, '.deckent', 'reports', 'debt-trend.jsonl'), 'utf-8').trim().split('\n');
    expect(jsonl).toHaveLength(2);
  });
});
