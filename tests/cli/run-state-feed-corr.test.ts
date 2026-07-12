/**
 * TERM5-FEED (Sprint 427, Task 427-002) — hermetic tests for run-state-feed's
 * flowId-correlation: Task-1's (427-001) additive `completionRecord.flowId`
 * on `.deckent/runtime/jobs/<sprintId>.json`, matched against a caller-
 * watched `flowId` and surfaced as a typed `CorrelatedCompletionEvent`.
 *
 * Same in-memory fs-fake seam as the sibling tests/cli/run-state-feed.test.ts
 * (never real disk / tmpdir) — see that file for the base `computeLiveFooterState`
 * / `readLiveFooterState` coverage this file does not repeat.
 */

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import {
  computeLiveFooterState,
  readLiveFooterState,
  type StateFeedFs,
  type StateFeedInput,
} from '../../src/cli/helpers/run-state-feed.js';
import { JOBS_DIR } from '../../src/core/constants.js';

// ─── fake fs seam (mirrors tests/cli/run-state-feed.test.ts's makeFakeFs) ──

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

/** Wraps a fake fs and records every path passed to existsSync/readdirSync —
 *  used to PROVE the legacy (no-flowId) path never touches JOBS_DIR at all. */
function makeTrackingFs(inner: StateFeedFs): { fs: StateFeedFs; existsCalls: string[]; readdirCalls: string[] } {
  const existsCalls: string[] = [];
  const readdirCalls: string[] = [];
  return {
    fs: {
      existsSync: (path) => {
        existsCalls.push(path);
        return inner.existsSync(path);
      },
      readFileSync: (path) => inner.readFileSync(path),
      readdirSync: (path) => {
        readdirCalls.push(path);
        return inner.readdirSync(path);
      },
    },
    existsCalls,
    readdirCalls,
  };
}

const ROOT = '/project';
const JOBS = join(ROOT, JOBS_DIR);

function jobJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    jobId: 'sprint-427',
    sprintId: 'sprint-427',
    status: 'COMPLETE',
    completionRecord: {
      flowId: 'flow-abc',
      verdictSummary: { done: 2, techDebt: 1, noGo: 0 },
    },
    ...overrides,
  });
}

// ─── computeLiveFooterState — pure core ─────────────────────────────────────

describe('computeLiveFooterState — flowId correlation (pure core)', () => {
  const baseInput = (): StateFeedInput => ({
    sprintState: null,
    heartbeats: [],
    finishedTaskIds: new Set(),
    providerCache: null,
  });

  it('a matching completionRecord.flowId produces a typed, populated completion event', () => {
    const state = computeLiveFooterState({
      ...baseInput(),
      flowId: 'flow-abc',
      jobRecords: [
        {
          jobId: 'sprint-427',
          sprintId: 'sprint-427',
          status: 'COMPLETE',
          completionRecord: { flowId: 'flow-abc', verdictSummary: { done: 2, techDebt: 1, noGo: 0 } },
        },
      ],
    });
    expect(state.completion).toEqual({
      flowId: 'flow-abc',
      jobId: 'sprint-427',
      sprintId: 'sprint-427',
      status: 'COMPLETE',
      verdictSummary: { done: 2, techDebt: 1, noGo: 0 },
    });
  });

  it('no flowId supplied -> no completion event, even with matching-shaped jobRecords present (legacy-yol)', () => {
    const state = computeLiveFooterState({
      ...baseInput(),
      jobRecords: [
        { jobId: 'sprint-427', sprintId: 'sprint-427', status: 'COMPLETE', completionRecord: { flowId: 'flow-abc' } },
      ],
    });
    expect(state.completion).toBeUndefined();
  });

  it('flowId supplied but jobRecords omitted -> no completion event', () => {
    const state = computeLiveFooterState({ ...baseInput(), flowId: 'flow-abc' });
    expect(state.completion).toBeUndefined();
  });

  it('flowId supplied but no jobRecords entry matches -> no completion event', () => {
    const state = computeLiveFooterState({
      ...baseInput(),
      flowId: 'flow-abc',
      jobRecords: [
        { jobId: 'sprint-100', sprintId: 'sprint-100', status: 'COMPLETE', completionRecord: { flowId: 'flow-xyz' } },
        { jobId: 'sprint-101', sprintId: 'sprint-101', status: 'FAILED' },
      ],
    });
    expect(state.completion).toBeUndefined();
  });

  it('a legacy job record with no completionRecord at all never matches (legacy-yol, bit-eş)', () => {
    const state = computeLiveFooterState({
      ...baseInput(),
      flowId: 'flow-abc',
      jobRecords: [{ jobId: 'sprint-99', sprintId: 'sprint-99', status: 'COMPLETE' }],
    });
    expect(state.completion).toBeUndefined();
  });

  it('malformed verdictSummary is omitted from the event, but the event itself is still returned', () => {
    const state = computeLiveFooterState({
      ...baseInput(),
      flowId: 'flow-abc',
      jobRecords: [
        {
          jobId: 'sprint-427',
          sprintId: 'sprint-427',
          status: 'COMPLETE',
          completionRecord: { flowId: 'flow-abc', verdictSummary: { done: 'two' as unknown as number, techDebt: 1, noGo: 0 } },
        },
      ],
    });
    expect(state.completion).toEqual({ flowId: 'flow-abc', jobId: 'sprint-427', sprintId: 'sprint-427', status: 'COMPLETE' });
    expect(state.completion?.verdictSummary).toBeUndefined();
  });

  it('jobId falls back to sprintId, then to flowId, when job.jobId is missing/non-string', () => {
    const bySprintId = computeLiveFooterState({
      ...baseInput(),
      flowId: 'flow-abc',
      jobRecords: [{ sprintId: 'sprint-427', completionRecord: { flowId: 'flow-abc' } }],
    });
    expect(bySprintId.completion?.jobId).toBe('sprint-427');

    const byFlowId = computeLiveFooterState({
      ...baseInput(),
      flowId: 'flow-abc',
      jobRecords: [{ completionRecord: { flowId: 'flow-abc' } }],
    });
    expect(byFlowId.completion?.jobId).toBe('flow-abc');
  });

  it('a non-string completionRecord.flowId never matches a string flowId', () => {
    const state = computeLiveFooterState({
      ...baseInput(),
      flowId: 'flow-abc',
      jobRecords: [{ jobId: 'sprint-1', completionRecord: { flowId: 123 as unknown as string } }],
    });
    expect(state.completion).toBeUndefined();
  });
});

// ─── readLiveFooterState — fs-fake seam ─────────────────────────────────────

describe('readLiveFooterState — flowId correlation (fs-fake seam)', () => {
  it('flowId option triggers a JOBS_DIR scan and surfaces the matching correlated completion', () => {
    const fs = makeFakeFs({ [`${JOBS}/sprint-427.json`]: jobJson() }, { [JOBS]: ['sprint-427.json'] });
    const state = readLiveFooterState({ projectRoot: ROOT, fs, flowId: 'flow-abc' });
    expect(state.completion).toEqual({
      flowId: 'flow-abc',
      jobId: 'sprint-427',
      sprintId: 'sprint-427',
      status: 'COMPLETE',
      verdictSummary: { done: 2, techDebt: 1, noGo: 0 },
    });
  });

  it('flowId omitted -> JOBS_DIR is never touched at all (zero extra fs work, legacy-yol)', () => {
    const inner = makeFakeFs({ [`${JOBS}/sprint-427.json`]: jobJson() }, { [JOBS]: ['sprint-427.json'] });
    const { fs, existsCalls, readdirCalls } = makeTrackingFs(inner);

    const state = readLiveFooterState({ projectRoot: ROOT, fs });

    expect(state.completion).toBeUndefined();
    expect(existsCalls).not.toContain(JOBS);
    expect(readdirCalls).not.toContain(JOBS);
  });

  it('flowId supplied but no matching job on disk -> no completion, no throw', () => {
    const fs = makeFakeFs(
      { [`${JOBS}/sprint-1.json`]: jobJson({ completionRecord: { flowId: 'flow-other' } }) },
      { [JOBS]: ['sprint-1.json'] },
    );
    expect(() => readLiveFooterState({ projectRoot: ROOT, fs, flowId: 'flow-abc' })).not.toThrow();
    expect(readLiveFooterState({ projectRoot: ROOT, fs, flowId: 'flow-abc' }).completion).toBeUndefined();
  });

  it('a missing JOBS_DIR (flowId set) degrades to no completion, never throws', () => {
    const fs = makeFakeFs({}, {});
    expect(() => readLiveFooterState({ projectRoot: ROOT, fs, flowId: 'flow-abc' })).not.toThrow();
    expect(readLiveFooterState({ projectRoot: ROOT, fs, flowId: 'flow-abc' }).completion).toBeUndefined();
  });

  it('a malformed job file is skipped, a matching sibling is still found', () => {
    const fs = makeFakeFs(
      {
        [`${JOBS}/sprint-1.json`]: '{not valid json',
        [`${JOBS}/sprint-2.json`]: jobJson({ jobId: 'sprint-2', sprintId: 'sprint-2' }),
      },
      { [JOBS]: ['sprint-1.json', 'sprint-2.json'] },
    );
    const state = readLiveFooterState({ projectRoot: ROOT, fs, flowId: 'flow-abc' });
    expect(state.completion?.jobId).toBe('sprint-2');
  });

  it('a readdirSync throw on JOBS_DIR degrades to no completion, other feed fields unaffected', () => {
    const fs: StateFeedFs = {
      existsSync: (path) => path === JOBS,
      readFileSync: () => {
        throw new Error('should not read files here');
      },
      readdirSync: () => {
        throw new Error('EACCES');
      },
    };
    expect(() => readLiveFooterState({ projectRoot: ROOT, fs, flowId: 'flow-abc' })).not.toThrow();
    const state = readLiveFooterState({ projectRoot: ROOT, fs, flowId: 'flow-abc' });
    expect(state.completion).toBeUndefined();
    expect(state).toEqual({});
  });

  it('non-.json files under JOBS_DIR are ignored', () => {
    const fs = makeFakeFs(
      { [`${JOBS}/sprint-427.json`]: jobJson(), [`${JOBS}/README.md`]: '# not a job' },
      { [JOBS]: ['sprint-427.json', 'README.md'] },
    );
    const state = readLiveFooterState({ projectRoot: ROOT, fs, flowId: 'flow-abc' });
    expect(state.completion?.jobId).toBe('sprint-427');
  });
});
