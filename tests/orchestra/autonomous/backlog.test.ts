import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadBacklog, validateBacklogEntry, queryDue, updateStatus } from '../../../src/orchestra/autonomous/backlog.js';
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
});
