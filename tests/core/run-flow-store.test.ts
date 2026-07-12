// ═══ run-flow-store.test — TERM-FLOW-UNIFY Sprint-4 dilim (426-001), moved
// to tests/core/ alongside its source (born-671, sprint-427 task 427-020) ═══
//
// Hermetic — every fixture lives under os.tmpdir() (CUSTOM Test Hermeticity
// rule: no gitignored local state, no writes to the project root/HOME).
// Covers: round-trip save/load for both record kinds, append-only semantics
// (a second save never destroys the first line; load() returns the latest),
// atomic-write (no stray .tmp file survives a save), and project-scoping
// (two roots never share state).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  saveApprovedSnapshot,
  loadApprovedSnapshot,
  saveRunHandle,
  loadRunHandle,
  type StoredApprovedSnapshot,
  type StoredRunHandleRecord,
} from '../../src/core/run-flow-store.js';
import type { Sprint } from '../../src/core/types.js';
import { SprintPhase, SprintStatus } from '../../src/core/sprint-types.js';

function makeSprint(id = 'sprint-1'): Sprint {
  return {
    id,
    number: 1,
    status: SprintStatus.PLANNING,
    phase: SprintPhase.PLAN,
    tasks: [],
    workers: [],
  };
}

function makeSnapshot(overrides: Partial<StoredApprovedSnapshot> = {}): StoredApprovedSnapshot {
  return {
    flowId: 'flow-1',
    revision: 1,
    planDigest: 'digest-abc',
    approvedBy: { id: 'alperen' },
    approvedAt: '2026-07-12T00:00:00.000Z',
    sprint: makeSprint(),
    ...overrides,
  };
}

function makeHandleRecord(overrides: Partial<StoredRunHandleRecord> = {}): StoredRunHandleRecord {
  return {
    flowId: 'flow-1',
    revision: 1,
    planDigest: 'digest-abc',
    handle: { flowId: 'flow-1', jobId: 'job-1', logRef: 'log-1' },
    startedAt: '2026-07-12T00:01:00.000Z',
    ...overrides,
  };
}

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'run-flow-store-test-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('run-flow-store — approved snapshots', () => {
  it('round-trips a saved snapshot', () => {
    const snapshot = makeSnapshot();
    saveApprovedSnapshot(root, snapshot);
    expect(loadApprovedSnapshot(root, 'flow-1')).toEqual(snapshot);
  });

  it('returns undefined for a flowId that was never saved', () => {
    expect(loadApprovedSnapshot(root, 'never-saved')).toBeUndefined();
  });

  it('is append-only: a second save preserves the first line and load() returns the latest', () => {
    const first = makeSnapshot({ revision: 1, planDigest: 'digest-abc' });
    const second = makeSnapshot({ revision: 2, planDigest: 'digest-xyz' });
    saveApprovedSnapshot(root, first);
    saveApprovedSnapshot(root, second);

    expect(loadApprovedSnapshot(root, 'flow-1')).toEqual(second);

    const rawPath = join(root, '.deckent', 'runtime', 'run-flow-store', 'flow-1.snapshot.jsonl');
    const lines = readFileSync(rawPath, 'utf-8').split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toEqual(first);
    expect(JSON.parse(lines[1]!)).toEqual(second);
  });

  it('is atomic: no stray .tmp file survives a save', () => {
    saveApprovedSnapshot(root, makeSnapshot());
    const dir = join(root, '.deckent', 'runtime', 'run-flow-store');
    const files = readdirSync(dir);
    expect(files.some(f => f.endsWith('.tmp'))).toBe(false);
  });

  it('is project-scoped: two different roots do not share state', () => {
    const otherRoot = mkdtempSync(join(tmpdir(), 'run-flow-store-test-other-'));
    try {
      saveApprovedSnapshot(root, makeSnapshot());
      expect(loadApprovedSnapshot(otherRoot, 'flow-1')).toBeUndefined();
      expect(existsSync(join(otherRoot, '.deckent'))).toBe(false);
    } finally {
      rmSync(otherRoot, { recursive: true, force: true });
    }
  });
});

describe('run-flow-store — run handles', () => {
  it('round-trips a saved run handle', () => {
    const record = makeHandleRecord();
    saveRunHandle(root, record);
    expect(loadRunHandle(root, 'flow-1')).toEqual(record);
  });

  it('returns undefined for a flowId that was never started', () => {
    expect(loadRunHandle(root, 'never-started')).toBeUndefined();
  });

  it('is append-only and load() returns the latest start attempt', () => {
    const first = makeHandleRecord({ handle: { flowId: 'flow-1', jobId: 'job-1', logRef: 'log-1' } });
    const second = makeHandleRecord({ handle: { flowId: 'flow-1', jobId: 'job-2', logRef: 'log-2' } });
    saveRunHandle(root, first);
    saveRunHandle(root, second);
    expect(loadRunHandle(root, 'flow-1')).toEqual(second);

    const rawPath = join(root, '.deckent', 'runtime', 'run-flow-store', 'flow-1.handle.jsonl');
    const lines = readFileSync(rawPath, 'utf-8').split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
  });

  it('keeps snapshot and handle logs in separate files for the same flowId', () => {
    saveApprovedSnapshot(root, makeSnapshot());
    saveRunHandle(root, makeHandleRecord());
    const dir = join(root, '.deckent', 'runtime', 'run-flow-store');
    const files = readdirSync(dir).sort();
    expect(files).toEqual(['flow-1.handle.jsonl', 'flow-1.snapshot.jsonl']);
  });
});
