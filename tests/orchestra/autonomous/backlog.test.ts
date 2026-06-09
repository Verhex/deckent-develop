import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadBacklog, validateBacklogEntry, queryDue, updateStatus, purgeCompletedBacklog, cleanupAutonomousArtifacts, reenqueueRecurring } from '../../../src/orchestra/autonomous/backlog.js';
import type { BacklogEntry } from '../../../src/orchestra/autonomous/backlog-types.js';

function entry(over: Partial<BacklogEntry> = {}): BacklogEntry {
  return {
    id: 'e1', title: 'demo', kind: 'task',
    spec: { description: 'do x', scopeDir: '.' },
    policy: 'auto', trigger: { type: 'one-off' },
    status: 'pending', lastRun: null, lastResult: null, ...over,
  };
}

describe('backlog store', () => {
  let dir: string;
  let path: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'backlog-')); path = join(dir, 'backlog.json'); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('loads a valid backlog file', () => {
    writeFileSync(path, JSON.stringify({ _version: '1.0', entries: [entry()] }));
    const bl = loadBacklog(path);
    expect(bl.entries).toHaveLength(1);
    expect(bl.entries[0]!.id).toBe('e1');
  });

  it('returns empty backlog when file absent (fresh project)', () => {
    const bl = loadBacklog(join(dir, 'missing.json'));
    expect(bl.entries).toEqual([]);
  });

  it('rejects an entry with an invalid policy', () => {
    const bad = { ...entry(), policy: 'bogus' };
    expect(validateBacklogEntry(bad)).toMatch(/policy/);
  });

  it('accepts a fully valid entry', () => {
    expect(validateBacklogEntry(entry())).toBeNull();
  });

  it('queryDue returns pending one-off entries', () => {
    const bl = { _version: '1.0', entries: [entry({ id: 'a' }), entry({ id: 'b', status: 'done' as const })] };
    const due = queryDue(bl, new Date('2026-06-07T00:00:00Z'));
    expect(due.map(e => e.id)).toEqual(['a']);
  });

  it('updateStatus persists atomically and re-loads', () => {
    writeFileSync(path, JSON.stringify({ _version: '1.0', entries: [entry({ id: 'a' })] }));
    const bl = loadBacklog(path);
    updateStatus(path, bl, 'a', 'running', null);
    const reloaded = loadBacklog(path);
    expect(reloaded.entries[0]!.status).toBe('running');
  });

  // I3: loadBacklog throws when entries is not an array
  it('throws when entries is not an array', () => {
    writeFileSync(path, JSON.stringify({ _version: '1.0', entries: { bad: true } }));
    expect(() => loadBacklog(path)).toThrow(/entries must be an array/);
  });

  // I4: loadBacklog throws on a stored entry with an invalid kind
  it('throws on loadBacklog when a stored entry has an invalid kind', () => {
    writeFileSync(path, JSON.stringify({ _version: '1.0', entries: [{ ...entry(), kind: 'bogus' }] }));
    expect(() => loadBacklog(path)).toThrow(/Invalid backlog entry/);
  });

  // M1: updateStatus writes lastResult and lastRun when result provided
  it('updateStatus writes lastResult and lastRun when result provided', () => {
    writeFileSync(path, JSON.stringify({ _version: '1.0', entries: [entry({ id: 'a' })] }));
    const bl = loadBacklog(path);
    updateStatus(path, bl, 'a', 'done', { ok: true, reason: 'ok' });
    const reloaded = loadBacklog(path);
    expect(reloaded.entries[0]!.lastResult?.ok).toBe(true);
    expect(reloaded.entries[0]!.lastRun).toBeTruthy();
  });

  // M2: updateStatus throws on unknown id
  it('updateStatus throws on unknown id', () => {
    writeFileSync(path, JSON.stringify({ _version: '1.0', entries: [entry({ id: 'a' })] }));
    const bl = loadBacklog(path);
    expect(() => updateStatus(path, bl, 'ghost', 'done', null)).toThrow(/not found/);
  });

  // I2 coverage: empty title and array-spec validation
  it('rejects an entry with an empty title', () => {
    expect(validateBacklogEntry({ ...entry(), title: '' })).toMatch(/title/);
  });

  it('rejects an entry with an array spec', () => {
    expect(validateBacklogEntry({ ...entry(), spec: [] })).toMatch(/spec/);
  });

  it('queryDue also surfaces pending reactive entries', () => {
    const bl = { _version: '1.0', entries: [
      { id: 'r', title: 't', kind: 'task' as const, spec: {}, policy: 'auto' as const, trigger: { type: 'reactive' as const, detector: 'x' }, status: 'pending' as const, lastRun: null, lastResult: null },
    ]};
    expect(queryDue(bl, new Date()).map(e => e.id)).toEqual(['r']);
  });

  // ── purgeCompletedBacklog ──────────────────────────────────────────────────

  it('purgeCompletedBacklog removes done/failed entries beyond keepRuns', () => {
    const entries = [
      entry({ id: 'a', status: 'done', lastRun: '2026-01-01T00:00:00Z' }),
      entry({ id: 'b', status: 'failed', lastRun: '2026-01-02T00:00:00Z' }),
      entry({ id: 'c', status: 'done', lastRun: '2026-01-03T00:00:00Z' }),
    ];
    writeFileSync(path, JSON.stringify({ _version: '1.0', entries }));
    const bl = loadBacklog(path);
    purgeCompletedBacklog(path, bl, 2);
    const reloaded = loadBacklog(path);
    // Should keep the 2 most recent (c, b) and drop the oldest (a)
    expect(reloaded.entries.map(e => e.id).sort()).toEqual(['b', 'c']);
  });

  it('purgeCompletedBacklog never removes active (pending/running/parked) entries', () => {
    const entries = [
      entry({ id: 'p', status: 'pending' }),
      entry({ id: 'r', status: 'running' }),
      entry({ id: 'd', status: 'done', lastRun: '2026-01-01T00:00:00Z' }),
    ];
    writeFileSync(path, JSON.stringify({ _version: '1.0', entries }));
    const bl = loadBacklog(path);
    purgeCompletedBacklog(path, bl, 0); // keep zero completed entries
    const reloaded = loadBacklog(path);
    expect(reloaded.entries.map(e => e.id).sort()).toEqual(['p', 'r']);
  });

  it('purgeCompletedBacklog keeps all completed entries when count <= keepRuns', () => {
    const entries = [
      entry({ id: 'a', status: 'done', lastRun: '2026-01-01T00:00:00Z' }),
      entry({ id: 'b', status: 'failed', lastRun: '2026-01-02T00:00:00Z' }),
    ];
    writeFileSync(path, JSON.stringify({ _version: '1.0', entries }));
    const bl = loadBacklog(path);
    purgeCompletedBacklog(path, bl, 5);
    const reloaded = loadBacklog(path);
    expect(reloaded.entries).toHaveLength(2);
  });

  it('purgeCompletedBacklog persists atomically (re-load confirms)', () => {
    const entries = [
      entry({ id: 'x', status: 'done', lastRun: '2026-01-01T00:00:00Z' }),
      entry({ id: 'y', status: 'pending' }),
    ];
    writeFileSync(path, JSON.stringify({ _version: '1.0', entries }));
    const bl = loadBacklog(path);
    purgeCompletedBacklog(path, bl, 0);
    const reloaded = loadBacklog(path);
    expect(reloaded.entries.map(e => e.id)).toEqual(['y']);
    expect(reloaded._version).toBe('1.0');
  });

  // ── cleanupAutonomousArtifacts ─────────────────────────────────────────────

  it('cleanupAutonomousArtifacts removes task-run-* files', () => {
    const tasksDir = join(dir, '.tasks');
    mkdirSync(tasksDir);
    writeFileSync(join(tasksDir, 'task-run-1234567890-0.json'), '{}');
    writeFileSync(join(tasksDir, 'task-run-1234567890-0.hb'), '{}');
    cleanupAutonomousArtifacts(dir, '.tasks');
    expect(existsSync(join(tasksDir, 'task-run-1234567890-0.json'))).toBe(false);
    expect(existsSync(join(tasksDir, 'task-run-1234567890-0.hb'))).toBe(false);
  });

  it('cleanupAutonomousArtifacts removes _*.pid files', () => {
    const tasksDir = join(dir, '.tasks');
    mkdirSync(tasksDir);
    writeFileSync(join(tasksDir, '_run-abc.pid'), '12345');
    cleanupAutonomousArtifacts(dir, '.tasks');
    expect(existsSync(join(tasksDir, '_run-abc.pid'))).toBe(false);
  });

  it('cleanupAutonomousArtifacts leaves unrelated task files intact', () => {
    const tasksDir = join(dir, '.tasks');
    mkdirSync(tasksDir);
    writeFileSync(join(tasksDir, 'task-001-001.json'), '{}');
    writeFileSync(join(tasksDir, 'task-run-1234567890-0.json'), '{}');
    cleanupAutonomousArtifacts(dir, '.tasks');
    expect(existsSync(join(tasksDir, 'task-001-001.json'))).toBe(true);
    expect(existsSync(join(tasksDir, 'task-run-1234567890-0.json'))).toBe(false);
  });

  it('cleanupAutonomousArtifacts is a no-op when tasks directory is absent', () => {
    expect(() => cleanupAutonomousArtifacts(dir, '.nonexistent')).not.toThrow();
  });

  // ── reenqueueRecurring ────────────────────────────────────────────────────

  it('reenqueueRecurring resets a recurring done entry to pending when next-due has passed', () => {
    // lastRun at 10:00, cron = every hour, now = 11:30 → nextRun(cron, 10:00) = 11:00 ≤ 11:30
    const bl = { _version: '1.0', entries: [
      entry({ id: 'rec', status: 'done', trigger: { type: 'recurring' as const, cron: '0 * * * *' }, lastRun: '2026-06-09T10:00:00Z' }),
    ]};
    const result = reenqueueRecurring(bl, new Date('2026-06-09T11:30:00Z'));
    expect(result.entries[0]!.status).toBe('pending');
    // lastRun is preserved — updateStatus sets it on completion, not reenqueue
    expect(result.entries[0]!.lastRun).toBe('2026-06-09T10:00:00Z');
  });

  it('reenqueueRecurring leaves a recurring done entry done when next-due is still in the future', () => {
    // lastRun at 10:00, cron = every hour, now = 10:30 → nextRun(cron, 10:00) = 11:00 > 10:30
    const bl = { _version: '1.0', entries: [
      entry({ id: 'rec', status: 'done', trigger: { type: 'recurring' as const, cron: '0 * * * *' }, lastRun: '2026-06-09T10:00:00Z' }),
    ]};
    const result = reenqueueRecurring(bl, new Date('2026-06-09T10:30:00Z'));
    expect(result.entries[0]!.status).toBe('done');
  });

  it('reenqueueRecurring leaves a one-off done entry untouched', () => {
    const bl = { _version: '1.0', entries: [
      entry({ id: 'once', status: 'done', trigger: { type: 'one-off' as const }, lastRun: '2026-06-09T10:00:00Z' }),
    ]};
    const result = reenqueueRecurring(bl, new Date('2026-06-09T23:00:00Z'));
    expect(result.entries[0]!.status).toBe('done');
  });

  it('reenqueueRecurring leaves a recurring done entry done when cron is malformed (fail-safe, no throw)', () => {
    const bl = { _version: '1.0', entries: [
      entry({ id: 'bad', status: 'done', trigger: { type: 'recurring' as const, cron: 'NOT_A_CRON' }, lastRun: '2026-06-09T10:00:00Z' }),
    ]};
    expect(() => reenqueueRecurring(bl, new Date('2026-06-09T23:00:00Z'))).not.toThrow();
    const result = reenqueueRecurring(bl, new Date('2026-06-09T23:00:00Z'));
    expect(result.entries[0]!.status).toBe('done');
  });
});
