/**
 * STATE-FEED (Sprint 354, Task 354-014) — hermetic tests.
 *
 * Two layers under test:
 *  1. computeLiveFooterState() — fully pure core, plain-object fixtures, zero I/O.
 *  2. readLiveFooterState()/createRunStateFeed() — fs-fake seam (an in-memory
 *     fake StateFeedFs, never real disk / tmpdir) proving the reader degrades
 *     honestly on missing/corrupt files and never imports a live probe.
 */

import { describe, it, expect } from 'vitest';
import {
  computeLiveFooterState,
  readLiveFooterState,
  createRunStateFeed,
  PROVIDER_HEALTH_CACHE_FILE,
  type StateFeedFs,
  type StateFeedInput,
} from '../../src/cli/helpers/run-state-feed.js';

// ─── fake fs seam ────────────────────────────────────────────────────────────

function makeFakeFs(files: Record<string, string>, dirs: Record<string, string[]> = {}): StateFeedFs {
  return {
    existsSync: (path) => path in files || path in dirs,
    readFileSync: (path) => {
      if (!(path in files)) throw new Error(`ENOENT: ${path}`);
      return files[path] as string;
    },
    readdirSync: (path) => {
      if (!(path in dirs)) throw new Error(`ENOENT: ${path}`);
      return dirs[path] as string[];
    },
  };
}

const ROOT = '/project';
const TASKS = `${ROOT}/.tasks`;
const SPRINT_STATE = `${ROOT}/.deckent/sprint-state.json`;
const PROVIDER_CACHE = `${ROOT}/${PROVIDER_HEALTH_CACHE_FILE}`;

function sprintStateJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    sprintId: 'sprint-354',
    phase: 'EXECUTE',
    status: 'ACTIVE',
    startedAt: '2026-07-01T23:05:46.765Z',
    updatedAt: '2026-07-01T23:06:26.108Z',
    taskIds: ['354-001', '354-002', '354-003'],
    ...overrides,
  });
}

// ─── computeLiveFooterState — pure core ─────────────────────────────────────

describe('computeLiveFooterState — pure core', () => {
  const baseInput = (): StateFeedInput => ({
    sprintState: null,
    heartbeats: [],
    finishedTaskIds: new Set(),
    providerCache: null,
  });

  it('returns an entirely empty state when nothing is known (idle collapse upstream)', () => {
    expect(computeLiveFooterState(baseInput())).toEqual({});
  });

  it('one active worker -> "<taskId> · <phase>"', () => {
    const state = computeLiveFooterState({
      ...baseInput(),
      sprintState: { sprintId: 'sprint-354', phase: 'EXECUTE', startedAt: 'T0', taskIds: ['354-001'] },
      heartbeats: [{ taskId: '354-001' }],
    });
    expect(state.running).toBe('354-001 · EXECUTE');
    expect(state.startedAt).toBe('T0');
  });

  it('multiple active workers -> "<N> tasks · <phase>"', () => {
    const state = computeLiveFooterState({
      ...baseInput(),
      sprintState: { sprintId: 'sprint-354', phase: 'EXECUTE', taskIds: [] },
      heartbeats: [{ taskId: '354-001' }, { taskId: '354-002' }],
    });
    expect(state.running).toBe('2 tasks · EXECUTE');
  });

  it('a heartbeat with a matching .result is finished, not active', () => {
    const state = computeLiveFooterState({
      ...baseInput(),
      sprintState: { sprintId: 'sprint-354', phase: 'EXECUTE', taskIds: [] },
      heartbeats: [{ taskId: '354-001' }, { taskId: '354-002' }],
      finishedTaskIds: new Set(['354-002']),
    });
    expect(state.running).toBe('354-001 · EXECUTE');
  });

  it('sprint active with zero active workers -> "<sprintId> · <phase>"', () => {
    const state = computeLiveFooterState({
      ...baseInput(),
      sprintState: { sprintId: 'sprint-354', phase: 'PLAN', taskIds: [] },
    });
    expect(state.running).toBe('sprint-354 · PLAN');
  });

  it('next = first taskIds[] entry with neither .hb nor .result', () => {
    const state = computeLiveFooterState({
      ...baseInput(),
      sprintState: { sprintId: 'sprint-354', phase: 'EXECUTE', taskIds: ['354-001', '354-002', '354-003'] },
      heartbeats: [{ taskId: '354-001' }],
      finishedTaskIds: new Set(['354-002']),
    });
    expect(state.next).toBe('354-003');
  });

  it('next is omitted when every taskId is started or finished', () => {
    const state = computeLiveFooterState({
      ...baseInput(),
      sprintState: { sprintId: 'sprint-354', phase: 'EXECUTE', taskIds: ['354-001', '354-002'] },
      heartbeats: [{ taskId: '354-001' }],
      finishedTaskIds: new Set(['354-002']),
    });
    expect(state.next).toBeUndefined();
  });

  it('provider/auth pass through only when the cache is well-formed', () => {
    const state = computeLiveFooterState({
      ...baseInput(),
      providerCache: { provider: { name: 'claude', healthy: true }, auth: 'logged-in' },
    });
    expect(state.provider).toEqual({ name: 'claude', healthy: true });
    expect(state.auth).toBe('logged-in');
  });

  it('malformed provider cache entries are omitted, not fabricated', () => {
    const state = computeLiveFooterState({
      ...baseInput(),
      providerCache: { provider: { name: 123, healthy: true }, auth: 'sideways' },
    });
    expect(state.provider).toBeUndefined();
    expect(state.auth).toBeUndefined();
  });

  it('provider.healthy normalizes any non-boolean to "unknown"', () => {
    const state = computeLiveFooterState({
      ...baseInput(),
      providerCache: { provider: { name: 'codex', healthy: 'weird' } },
    });
    expect(state.provider).toEqual({ name: 'codex', healthy: 'unknown' });
  });

  it('heartbeats with a non-string taskId are ignored', () => {
    const state = computeLiveFooterState({
      ...baseInput(),
      sprintState: { sprintId: 'sprint-354', phase: 'EXECUTE', taskIds: [] },
      heartbeats: [{ taskId: 42 as unknown as string }],
    });
    expect(state.running).toBe('sprint-354 · EXECUTE');
  });
});

// ─── readLiveFooterState / createRunStateFeed — fs-fake seam ────────────────

describe('readLiveFooterState — fs-fake seam', () => {
  it('missing sprint-state.json + missing .tasks dir -> entirely empty (idle upstream)', () => {
    const fs = makeFakeFs({}, {});
    expect(readLiveFooterState({ projectRoot: ROOT, fs })).toEqual({});
  });

  it('reads a real hb+state fixture into the correct footer-state', () => {
    const fs = makeFakeFs(
      {
        [SPRINT_STATE]: sprintStateJson(),
        [`${TASKS}/task-354-001.hb`]: JSON.stringify({ workerId: 'docker-354-001', taskId: '354-001', status: 'EXECUTING' }),
        [`${TASKS}/task-354-002.result`]: JSON.stringify({ taskId: '354-002', selfAssessment: 'DONE' }),
      },
      { [TASKS]: ['task-354-001.hb', 'task-354-002.result'] },
    );
    const state = readLiveFooterState({ projectRoot: ROOT, fs });
    expect(state.running).toBe('354-001 · EXECUTE');
    expect(state.startedAt).toBe('2026-07-01T23:05:46.765Z');
    expect(state.next).toBe('354-003');
    expect(state.provider).toBeUndefined();
    expect(state.auth).toBeUndefined();
  });

  it('a corrupt sprint-state.json degrades to absent, not a thrown error', () => {
    const fs = makeFakeFs({ [SPRINT_STATE]: '{not valid json' }, {});
    expect(() => readLiveFooterState({ projectRoot: ROOT, fs })).not.toThrow();
    expect(readLiveFooterState({ projectRoot: ROOT, fs })).toEqual({});
  });

  it('a malformed individual .hb file is skipped, siblings still read', () => {
    const fs = makeFakeFs(
      {
        [SPRINT_STATE]: sprintStateJson({ taskIds: [] }),
        [`${TASKS}/task-354-001.hb`]: '{broken',
        [`${TASKS}/task-354-002.hb`]: JSON.stringify({ taskId: '354-002' }),
      },
      { [TASKS]: ['task-354-001.hb', 'task-354-002.hb'] },
    );
    const state = readLiveFooterState({ projectRoot: ROOT, fs });
    expect(state.running).toBe('354-002 · EXECUTE');
  });

  it('a readdirSync throw on an existing-looking .tasks path degrades to no heartbeats', () => {
    const fs: StateFeedFs = {
      existsSync: (path) => path === TASKS || path === SPRINT_STATE,
      readFileSync: (path) => {
        if (path === SPRINT_STATE) return sprintStateJson({ taskIds: [] });
        throw new Error('should not read files here');
      },
      readdirSync: () => {
        throw new Error('EACCES');
      },
    };
    expect(() => readLiveFooterState({ projectRoot: ROOT, fs })).not.toThrow();
    const state = readLiveFooterState({ projectRoot: ROOT, fs });
    expect(state.running).toBe('sprint-354 · EXECUTE');
  });

  it('provider-health cache populates provider/auth only when present + well-formed', () => {
    const fs = makeFakeFs({
      [PROVIDER_CACHE]: JSON.stringify({ provider: { name: 'claude', healthy: true }, auth: 'logged-in' }),
    });
    const state = readLiveFooterState({ projectRoot: ROOT, fs });
    expect(state.provider).toEqual({ name: 'claude', healthy: true });
    expect(state.auth).toBe('logged-in');
  });

  it('never reads or requires the provider-health cache to be present (probe-tetiklemez)', () => {
    const fs = makeFakeFs({ [SPRINT_STATE]: sprintStateJson({ taskIds: [] }) }, { [TASKS]: [] });
    const state = readLiveFooterState({ projectRoot: ROOT, fs });
    expect(state.provider).toBeUndefined();
    expect(state.auth).toBeUndefined();
  });
});

describe('createRunStateFeed', () => {
  it('returns a () => LiveFooterState that re-reads the seam on every call', () => {
    const files: Record<string, string> = { [SPRINT_STATE]: sprintStateJson({ phase: 'PLAN', taskIds: [] }) };
    const fs = makeFakeFs(files, {});
    const feed = createRunStateFeed({ projectRoot: ROOT, fs });

    expect(feed()).toEqual({ running: 'sprint-354 · PLAN', startedAt: '2026-07-01T23:05:46.765Z' });

    files[SPRINT_STATE] = sprintStateJson({ phase: 'EVALUATE', taskIds: [] });
    expect(feed()).toEqual({ running: 'sprint-354 · EVALUATE', startedAt: '2026-07-01T23:05:46.765Z' });
  });
});
