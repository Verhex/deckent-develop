// ─── session-registry tests (Sprint 361, Task 361-015 — F7-MULTISESSION) ─────
// Hermetic tmpdir fixtures (no fs mocking). Liveness is always injected via
// `isAlive` (fake-pid-probe) so tests never touch real OS processes.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  registerSession,
  listActive,
  cleanupStale,
  SESSIONS_FILE,
  type ReplSession,
} from '../../src/cli/helpers/session-registry.js';

let tmpRoot: string;

afterEach(() => {
  if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
});

function makeRoot(): string {
  tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-session-registry-'));
  return tmpRoot;
}

const NOW = '2026-07-02T22:00:00.000Z';
const alwaysAlive = (): boolean => true;
const alwaysDead = (): boolean => false;

// ─── registerSession / listActive round-trip ─────────────────────────────────

describe('registerSession / listActive round-trip', () => {
  it('starts empty when no file exists yet', () => {
    const root = makeRoot();
    expect(listActive(root, { isAlive: alwaysAlive })).toEqual([]);
  });

  it('registers a session and lists it back (alive)', () => {
    const root = makeRoot();
    const session = registerSession(root, 4242, '/dev/pts/3', { now: () => NOW });
    expect(session).toEqual<ReplSession>({ pid: 4242, startedAt: NOW, tty: '/dev/pts/3' });
    expect(listActive(root, { isAlive: alwaysAlive })).toEqual([session]);
  });

  it('accepts a null tty', () => {
    const root = makeRoot();
    const session = registerSession(root, 1, null, { now: () => NOW });
    expect(session.tty).toBeNull();
  });

  it('writes to the default path under SETTINGS_DIR', () => {
    const root = makeRoot();
    registerSession(root, 1, null, { now: () => NOW });
    expect(existsSync(join(root, SESSIONS_FILE))).toBe(true);
  });

  it('re-registering the same pid replaces its entry, not duplicates it', () => {
    const root = makeRoot();
    registerSession(root, 99, '/dev/pts/1', { now: () => NOW });
    const refreshed = registerSession(root, 99, '/dev/pts/2', { now: () => '2026-07-02T23:00:00.000Z' });

    const all = listActive(root, { isAlive: alwaysAlive });
    expect(all).toHaveLength(1);
    expect(all[0]).toEqual(refreshed);
    expect(all[0]?.tty).toBe('/dev/pts/2');
  });

  it('multiple distinct pids all survive independent register calls (multi-writer atomicity)', () => {
    const root = makeRoot();
    // Each call simulates a separate REPL process: no shared in-memory state,
    // every call re-reads the current file before writing its own entry.
    registerSession(root, 100, '/dev/pts/0', { now: () => NOW });
    registerSession(root, 200, '/dev/pts/1', { now: () => NOW });
    registerSession(root, 300, null, { now: () => NOW });

    const all = listActive(root, { isAlive: alwaysAlive });
    expect(all.map((s) => s.pid).sort()).toEqual([100, 200, 300]);
  });
});

// ─── listActive filtering ─────────────────────────────────────────────────────

describe('listActive filtering', () => {
  it('filters out dead pids by default', () => {
    const root = makeRoot();
    registerSession(root, 1, null, { now: () => NOW });
    registerSession(root, 2, null, { now: () => NOW });

    const isAlive = (pid: number): boolean => pid === 1;
    expect(listActive(root, { isAlive }).map((s) => s.pid)).toEqual([1]);
  });

  it('includeDead:true bypasses the liveness filter', () => {
    const root = makeRoot();
    registerSession(root, 1, null, { now: () => NOW });
    registerSession(root, 2, null, { now: () => NOW });

    const all = listActive(root, { isAlive: alwaysDead, includeDead: true });
    expect(all.map((s) => s.pid).sort()).toEqual([1, 2]);
  });
});

// ─── cleanupStale ─────────────────────────────────────────────────────────────

describe('cleanupStale', () => {
  it('removes dead entries, persists the pruned set, and returns the removed entries', () => {
    const root = makeRoot();
    registerSession(root, 1, null, { now: () => NOW });
    registerSession(root, 2, null, { now: () => NOW });

    const isAlive = (pid: number): boolean => pid === 1;
    const removed = cleanupStale(root, { isAlive });

    expect(removed.map((s) => s.pid)).toEqual([2]);
    expect(listActive(root, { isAlive: alwaysAlive }).map((s) => s.pid)).toEqual([1]);
  });

  it('is a no-op (skips the write) when nothing is stale', () => {
    const root = makeRoot();
    registerSession(root, 1, null, { now: () => NOW });
    const filePath = join(root, SESSIONS_FILE);
    const before = readFileSync(filePath, 'utf-8');

    const removed = cleanupStale(root, { isAlive: alwaysAlive });

    expect(removed).toEqual([]);
    expect(readFileSync(filePath, 'utf-8')).toBe(before);
  });

  it('round-trips register -> cleanupStale -> listActive with a fake-pid-probe', () => {
    const root = makeRoot();
    registerSession(root, 111, '/dev/pts/0', { now: () => NOW });
    registerSession(root, 222, '/dev/pts/1', { now: () => NOW });
    registerSession(root, 333, '/dev/pts/2', { now: () => NOW });

    // Fake-pid-probe: only 222 is "alive" — no real OS process touched.
    const isAlive = (pid: number): boolean => pid === 222;

    const removed = cleanupStale(root, { isAlive });
    expect(removed.map((s) => s.pid).sort()).toEqual([111, 333]);

    const active = listActive(root, { isAlive });
    expect(active.map((s) => s.pid)).toEqual([222]);
  });
});

// ─── fail-soft loading ─────────────────────────────────────────────────────────

describe('fail-soft loading', () => {
  it('is fail-soft to an empty set when the file contains invalid JSON', () => {
    const root = makeRoot();
    const filePath = join(root, SESSIONS_FILE);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, '{ not valid json', 'utf-8');

    expect(listActive(root, { isAlive: alwaysAlive })).toEqual([]);
  });

  it('is fail-soft to an empty set when the top-level JSON is not an array', () => {
    const root = makeRoot();
    const filePath = join(root, SESSIONS_FILE);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify({ pid: 1 }), 'utf-8');

    expect(listActive(root, { isAlive: alwaysAlive })).toEqual([]);
  });

  it('drops malformed entries (missing pid/startedAt) but keeps valid ones', () => {
    const root = makeRoot();
    const filePath = join(root, SESSIONS_FILE);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(
      filePath,
      JSON.stringify([
        { pid: 1, startedAt: NOW, tty: null },
        { pid: 'not-a-number', startedAt: NOW },
        { startedAt: NOW },
        { pid: 2 },
        null,
        'garbage',
      ]),
      'utf-8',
    );

    expect(listActive(root, { isAlive: alwaysAlive })).toEqual([{ pid: 1, startedAt: NOW, tty: null }]);
  });

  it('coerces a non-string tty to null', () => {
    const root = makeRoot();
    const filePath = join(root, SESSIONS_FILE);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify([{ pid: 1, startedAt: NOW, tty: 12345 }]), 'utf-8');

    expect(listActive(root, { isAlive: alwaysAlive })).toEqual([{ pid: 1, startedAt: NOW, tty: null }]);
  });
});
