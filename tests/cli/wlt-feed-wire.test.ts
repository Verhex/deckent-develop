/**
 * WLT-FEED-WIRE (Sprint 356, Task 356-005) — hermetic tests.
 *
 * Wires progress-reader.ts (WLT-READ, Sprint 355) into run-state-feed.ts's
 * `workers` detail field. Three fixtures per the task's goCriteria:
 *  a. progress file present -> progress-reader's currentAction wins
 *  b. no progress data, hb has currentAction -> hb fallback wins
 *  c. neither has data -> sentinel 'unknown'
 * Plus an fs-seam end-to-end test (readLiveFooterState wiring both seams)
 * and a backward-compat check that existing feed shapes stay untouched.
 */

import { describe, it, expect } from 'vitest';
import {
  computeLiveFooterState,
  readLiveFooterState,
  type StateFeedFs,
  type StateFeedInput,
} from '../../src/cli/helpers/run-state-feed.js';
import type { ProgressReaderFs, WorkerProgressSummary } from '../../src/cli/helpers/progress-reader.js';

// ─── fake fs seams ───────────────────────────────────────────────────────────

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

function makeFakeProgressFs(files: Record<string, string>, dirs: Record<string, string[]> = {}): ProgressReaderFs {
  const openFiles = new Map<number, Buffer>();
  let nextFd = 1;
  return {
    existsSync: (path) => path in files || path in dirs,
    readdirSync: (path) => {
      if (!(path in dirs)) throw new Error(`ENOENT: ${path}`);
      return dirs[path] as string[];
    },
    statSync: (path) => {
      if (!(path in files)) throw new Error(`ENOENT: ${path}`);
      return { size: Buffer.byteLength(files[path] as string, 'utf-8') };
    },
    openSync: (path) => {
      if (!(path in files)) throw new Error(`ENOENT: ${path}`);
      const fd = nextFd++;
      openFiles.set(fd, Buffer.from(files[path] as string, 'utf-8'));
      return fd;
    },
    readSync: (fd, buffer, offset, length, position) => {
      const content = openFiles.get(fd);
      if (!content) throw new Error(`EBADF: ${fd}`);
      const end = Math.min(position + length, content.length);
      const n = Math.max(0, end - position);
      content.copy(buffer, offset, position, end);
      return n;
    },
    closeSync: (fd) => {
      openFiles.delete(fd);
    },
  };
}

function progressLine(step: string, detail?: string): string {
  return JSON.stringify({ ts: '2026-07-02T00:00:00.000Z', step, detail });
}

const ROOT = '/project';
const TASKS = `${ROOT}/.tasks`;

// ─── pure core: computeLiveFooterState — three-fixture worker-detail ───────

describe('computeLiveFooterState — workers detail (WLT-FEED-WIRE)', () => {
  const baseInput = (): StateFeedInput => ({
    sprintState: null,
    heartbeats: [],
    finishedTaskIds: new Set(),
    providerCache: null,
  });

  it('fixture a: progress data present -> progress-reader currentAction wins', () => {
    const workerProgress: Record<string, WorkerProgressSummary> = {
      '356-001': {
        taskId: '356-001',
        recentSteps: [{ ts: 'T0', step: 'running tests' }],
        currentAction: 'running tests',
        corruptLineCount: 0,
      },
    };
    const state = computeLiveFooterState({
      ...baseInput(),
      heartbeats: [{ taskId: '356-001', currentAction: 'stale hb action' }],
      workerProgress,
    });
    expect(state.workers).toEqual({ '356-001': { currentAction: 'running tests' } });
  });

  it('fixture b: no progress data, hb.currentAction present -> hb fallback wins', () => {
    const state = computeLiveFooterState({
      ...baseInput(),
      heartbeats: [{ taskId: '356-002', currentAction: 'editing src/x.ts' }],
    });
    expect(state.workers).toEqual({ '356-002': { currentAction: 'editing src/x.ts' } });
  });

  it("fixture c: neither progress nor hb has data -> sentinel 'unknown'", () => {
    const state = computeLiveFooterState({
      ...baseInput(),
      heartbeats: [{ taskId: '356-003' }],
    });
    expect(state.workers).toEqual({ '356-003': { currentAction: 'unknown' } });
  });

  it('an empty progress currentAction (no valid steps yet) falls through to hb, not blank', () => {
    const workerProgress: Record<string, WorkerProgressSummary> = {
      '356-004': { taskId: '356-004', recentSteps: [], currentAction: '', corruptLineCount: 0 },
    };
    const state = computeLiveFooterState({
      ...baseInput(),
      heartbeats: [{ taskId: '356-004', currentAction: 'planning' }],
      workerProgress,
    });
    expect(state.workers).toEqual({ '356-004': { currentAction: 'planning' } });
  });

  it('a finished worker (has a .result, i.e. not in activeTaskIds) gets no workers entry', () => {
    const state = computeLiveFooterState({
      ...baseInput(),
      heartbeats: [{ taskId: '356-005', currentAction: 'writing result' }],
      finishedTaskIds: new Set(['356-005']),
    });
    expect(state.workers).toBeUndefined();
  });

  it('zero active workers -> workers field entirely omitted (backward-compat with toEqual({}))', () => {
    expect(computeLiveFooterState(baseInput())).toEqual({});
  });

  it('multiple active workers each resolve independently', () => {
    const workerProgress: Record<string, WorkerProgressSummary> = {
      '356-001': {
        taskId: '356-001',
        recentSteps: [{ ts: 'T0', step: 'from progress' }],
        currentAction: 'from progress',
        corruptLineCount: 0,
      },
    };
    const state = computeLiveFooterState({
      ...baseInput(),
      heartbeats: [
        { taskId: '356-001', currentAction: 'ignored (progress wins)' },
        { taskId: '356-002', currentAction: 'from hb' },
        { taskId: '356-003' },
      ],
      workerProgress,
    });
    expect(state.workers).toEqual({
      '356-001': { currentAction: 'from progress' },
      '356-002': { currentAction: 'from hb' },
      '356-003': { currentAction: 'unknown' },
    });
  });
});

// ─── fs-seam: readLiveFooterState wires progress-reader + heartbeats ───────

describe('readLiveFooterState — progress + hb fs seams wired together', () => {
  it('reads a real progress.jsonl fixture and prefers it over hb.currentAction', () => {
    const fs = makeFakeFs(
      {
        [`${TASKS}/task-356-001.hb`]: JSON.stringify({
          workerId: 'docker-356-001',
          taskId: '356-001',
          status: 'EXECUTING',
          currentAction: 'stale-hb-value',
        }),
      },
      { [TASKS]: ['task-356-001.hb', 'task-356-001.progress.jsonl'] },
    );
    const progressFs = makeFakeProgressFs(
      { [`${TASKS}/task-356-001.progress.jsonl`]: `${progressLine('editing', 'src/foo.ts')}\n` },
      { [TASKS]: ['task-356-001.hb', 'task-356-001.progress.jsonl'] },
    );

    const state = readLiveFooterState({ projectRoot: ROOT, fs, progressFs });
    expect(state.workers).toEqual({ '356-001': { currentAction: 'editing: src/foo.ts' } });
  });

  it('no progress file for a worker -> hb.currentAction fallback via the fs seam', () => {
    const fs = makeFakeFs(
      {
        [`${TASKS}/task-356-002.hb`]: JSON.stringify({
          workerId: 'docker-356-002',
          taskId: '356-002',
          status: 'EXECUTING',
          currentAction: 'running targeted tests',
        }),
      },
      { [TASKS]: ['task-356-002.hb'] },
    );
    const progressFs = makeFakeProgressFs({}, { [TASKS]: ['task-356-002.hb'] });

    const state = readLiveFooterState({ projectRoot: ROOT, fs, progressFs });
    expect(state.workers).toEqual({ '356-002': { currentAction: 'running targeted tests' } });
  });

  it("neither progress file nor hb.currentAction -> 'unknown', feed still returns cleanly", () => {
    const fs = makeFakeFs(
      { [`${TASKS}/task-356-003.hb`]: JSON.stringify({ workerId: 'docker-356-003', taskId: '356-003', status: 'EXECUTING' }) },
      { [TASKS]: ['task-356-003.hb'] },
    );
    const progressFs = makeFakeProgressFs({}, { [TASKS]: ['task-356-003.hb'] });

    const state = readLiveFooterState({ projectRoot: ROOT, fs, progressFs });
    expect(state.workers).toEqual({ '356-003': { currentAction: 'unknown' } });
  });

  it('missing .tasks dir entirely -> no workers, no thrown error (honest idle)', () => {
    const fs = makeFakeFs({}, {});
    expect(() => readLiveFooterState({ projectRoot: ROOT, fs })).not.toThrow();
    expect(readLiveFooterState({ projectRoot: ROOT, fs })).toEqual({});
  });
});
