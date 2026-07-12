// ─── TERM5-WATCH (Sprint 427, Task 427-003) — run-completion-watch flowId
// correlation: the watcher previously fired `onComplete` for EVERY terminal
// job under `jobsDir`, project-wide — a multi-session false-match risk (two
// live REPL sessions / detached runs against the same project). This suite
// proves the new opt-in `RunCompletionWatchOptions.flowId` filter: (1) a
// supplied flowId narrows `onComplete` to only the matching job, (2) a job
// with no `completionRecord.flowId` (every legacy job) never matches a
// filter, (3) omitting the option keeps the pre-427-003 behavior byte-exact
// (fires for every terminal job), and (4) the fs.watch+poll/dedup/baseline
// mechanics this filter sits on top of are completely untouched.
//
// Hermetic: real tmpdir + real job-file writes, injectable watch/poll seams
// — same style as the sibling tests/cli/bg-turns-producer.test.ts. No
// spawnSync, no reliance on real OS fs-event timing/latency.

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createRunCompletionWatch,
  parseRunCompletionRecord,
  type RunCompletionInfo,
  type RunCompletionWatchFsWatcher,
} from '../../src/cli/repl/run-completion-watch.js';

// ─── fixtures ────────────────────────────────────────────────────────────────

function writeJob(dir: string, fileName: string, content: unknown): void {
  writeFileSync(join(dir, fileName), JSON.stringify(content), 'utf-8');
}

/** Manual watch stub (mirrors bg-turns-producer.test.ts's own pattern) — a
 *  test controls exactly when a re-scan happens via `.fire()`. */
function makeManualWatch(): { watch: RunCompletionWatchFsWatcher; fire: () => void; close: ReturnType<typeof vi.fn> } {
  let onChange: (() => void) | undefined;
  const close = vi.fn();
  const watch: RunCompletionWatchFsWatcher = (_dir, cb) => {
    onChange = cb;
    return { close };
  };
  return { watch, fire: () => onChange?.(), close };
}

/** A watch stub that is wired but NEVER calls onChange — proves the poll
 *  timer alone (not fs.watch) is what caught a given change. */
function makeInertWatch(): { watch: RunCompletionWatchFsWatcher; close: ReturnType<typeof vi.fn> } {
  const close = vi.fn();
  const watch: RunCompletionWatchFsWatcher = () => ({ close });
  return { watch, close };
}

function withJobsDir<T>(fn: (jobsDir: string) => T): T {
  const jobsDir = mkdtempSync(join(tmpdir(), 'run-completion-watch-corr-'));
  try {
    return fn(jobsDir);
  } finally {
    rmSync(jobsDir, { recursive: true, force: true });
  }
}

// ─── parseRunCompletionRecord — flowId parsing ──────────────────────────────

describe('parseRunCompletionRecord — flowId (TERM5-WATCH, sprint-427 task 3)', () => {
  it('parses completionRecord.flowId when present (427-001 additive shape)', () => {
    const raw = JSON.stringify({
      status: 'COMPLETE',
      sprintId: 'sprint-427',
      metrics: { totalTasks: 1, done: 1, techDebt: 0, noGo: 0 },
      completionRecord: { flowId: 'flow-abc', verdictSummary: { done: 1, techDebt: 0, noGo: 0 } },
    });
    expect(parseRunCompletionRecord(raw, 'sprint-427')?.flowId).toBe('flow-abc');
  });

  it('a legacy record with no completionRecord parses flowId as undefined', () => {
    const raw = JSON.stringify({ status: 'COMPLETE', sprintId: 'sprint-1', metrics: { totalTasks: 1, done: 1, techDebt: 0, noGo: 0 } });
    expect(parseRunCompletionRecord(raw, 'sprint-1')?.flowId).toBeUndefined();
  });

  it('a non-string completionRecord.flowId parses as undefined, never throws', () => {
    const raw = JSON.stringify({ status: 'COMPLETE', sprintId: 'sprint-1', completionRecord: { flowId: 123 } });
    expect(() => parseRunCompletionRecord(raw, 'sprint-1')).not.toThrow();
    expect(parseRunCompletionRecord(raw, 'sprint-1')?.flowId).toBeUndefined();
  });

  it('pre-existing sprint-finalizer.ts / job-runner.ts shapes still parse identically (no flowId key added when absent)', () => {
    // Bit-eş guard for the two pre-427-003 fixture shapes already pinned in
    // bg-turns-producer.test.ts — toEqual treats an `undefined`-valued key
    // as equivalent to an absent one, so this must still hold.
    const finalizerShape = JSON.stringify({
      status: 'COMPLETE',
      sprintId: 'sprint-406',
      metrics: { totalTasks: 3, done: 3, techDebt: 0, noGo: 0 },
      evaluations: { '406-001': { evaluation: 'DONE' } },
    });
    expect(parseRunCompletionRecord(finalizerShape, 'sprint-406')).toEqual({
      jobId: 'sprint-406',
      sprintId: 'sprint-406',
      status: 'COMPLETE',
      totalTasks: 3,
      done: 3,
      techDebt: 0,
      noGo: 0,
      error: undefined,
      flowId: undefined,
    });

    const jobRunnerShape = JSON.stringify({
      jobId: 'job-1',
      status: 'FAILED',
      error: 'worker crashed',
    });
    expect(parseRunCompletionRecord(jobRunnerShape, 'job-1')).toEqual({
      jobId: 'job-1',
      sprintId: undefined,
      status: 'FAILED',
      totalTasks: undefined,
      done: undefined,
      techDebt: undefined,
      noGo: undefined,
      error: 'worker crashed',
      flowId: undefined,
    });
  });
});

// ─── createRunCompletionWatch — flowId filter ───────────────────────────────

describe('createRunCompletionWatch — flowId filter (TERM5-WATCH, sprint-427 task 3)', () => {
  it('flowId option: only the matching flow’s completion fires', () => {
    withJobsDir((jobsDir) => {
      const fired: RunCompletionInfo[] = [];
      const manual = makeManualWatch();

      const handle = createRunCompletionWatch(
        jobsDir,
        { onComplete: (i) => fired.push(i) },
        { watch: manual.watch, pollIntervalMs: 50_000, flowId: 'flow-abc' },
      );

      writeJob(jobsDir, 'sprint-1.json', {
        status: 'COMPLETE',
        sprintId: 'sprint-1',
        metrics: { totalTasks: 1, done: 1, techDebt: 0, noGo: 0 },
        completionRecord: { flowId: 'flow-abc' },
      });
      writeJob(jobsDir, 'sprint-2.json', {
        status: 'COMPLETE',
        sprintId: 'sprint-2',
        metrics: { totalTasks: 1, done: 1, techDebt: 0, noGo: 0 },
        completionRecord: { flowId: 'flow-other' },
      });
      manual.fire();

      expect(fired).toHaveLength(1);
      expect(fired[0]).toMatchObject({ jobId: 'sprint-1', flowId: 'flow-abc' });
      handle.dispose();
    });
  });

  it('a legacy job (no completionRecord at all) never fires when a flowId filter is set', () => {
    withJobsDir((jobsDir) => {
      const fired: RunCompletionInfo[] = [];
      const manual = makeManualWatch();

      const handle = createRunCompletionWatch(
        jobsDir,
        { onComplete: (i) => fired.push(i) },
        { watch: manual.watch, pollIntervalMs: 50_000, flowId: 'flow-abc' },
      );

      writeJob(jobsDir, 'sprint-3.json', { status: 'COMPLETE', sprintId: 'sprint-3', metrics: { totalTasks: 1, done: 1, techDebt: 0, noGo: 0 } });
      manual.fire();

      expect(fired).toEqual([]);
      handle.dispose();
    });
  });

  it('no flowId option supplied → fires for every terminal job regardless of flowId (filtresiz yol bit-eş)', () => {
    withJobsDir((jobsDir) => {
      const fired: string[] = [];
      const manual = makeManualWatch();

      const handle = createRunCompletionWatch(jobsDir, { onComplete: (i) => fired.push(i.jobId) }, { watch: manual.watch, pollIntervalMs: 50_000 });

      writeJob(jobsDir, 'sprint-4.json', {
        status: 'COMPLETE',
        sprintId: 'sprint-4',
        metrics: { totalTasks: 1, done: 1, techDebt: 0, noGo: 0 },
        completionRecord: { flowId: 'flow-abc' },
      });
      writeJob(jobsDir, 'sprint-5.json', { status: 'FAILED', sprintId: 'sprint-5', error: 'boom' });
      manual.fire();

      expect(fired.sort()).toEqual(['sprint-4', 'sprint-5']);
      handle.dispose();
    });
  });

  it('a job already-COMPLETE-with-matching-flowId at construction time still does not fire (baseline suppression unaffected by the filter)', () => {
    withJobsDir((jobsDir) => {
      writeJob(jobsDir, 'sprint-6.json', {
        status: 'COMPLETE',
        sprintId: 'sprint-6',
        metrics: { totalTasks: 1, done: 1, techDebt: 0, noGo: 0 },
        completionRecord: { flowId: 'flow-abc' },
      });
      const fired: RunCompletionInfo[] = [];
      const inert = makeInertWatch();

      const handle = createRunCompletionWatch(
        jobsDir,
        { onComplete: (i) => fired.push(i) },
        { watch: inert.watch, pollIntervalMs: 50_000, flowId: 'flow-abc' },
      );

      expect(fired).toEqual([]);
      handle.dispose();
    });
  });

  it('dedup is preserved under a flowId filter — fires exactly once across multiple scans', () => {
    withJobsDir((jobsDir) => {
      const fired: string[] = [];
      const manual = makeManualWatch();

      const handle = createRunCompletionWatch(
        jobsDir,
        { onComplete: (i) => fired.push(i.jobId) },
        { watch: manual.watch, pollIntervalMs: 50_000, flowId: 'flow-abc' },
      );

      writeJob(jobsDir, 'sprint-7.json', {
        status: 'COMPLETE',
        sprintId: 'sprint-7',
        metrics: { totalTasks: 1, done: 1, techDebt: 0, noGo: 0 },
        completionRecord: { flowId: 'flow-abc' },
      });
      manual.fire();
      manual.fire();
      manual.fire();

      expect(fired).toEqual(['sprint-7']);
      handle.dispose();
    });
  });

  it('the poll timer alone (fs.watch never firing) still delivers a matching-flowId completion — poll fallback untouched by the filter', () => {
    withJobsDir((jobsDir) => {
      vi.useFakeTimers();
      try {
        writeJob(jobsDir, 'sprint-8.json', { status: 'RUNNING', jobId: 'sprint-8' });
        const fired: string[] = [];
        const inert = makeInertWatch(); // wired, but onChange is NEVER invoked

        const handle = createRunCompletionWatch(
          jobsDir,
          { onComplete: (i) => fired.push(i.jobId) },
          { watch: inert.watch, pollIntervalMs: 1_000, flowId: 'flow-abc' },
        );
        expect(fired).toEqual([]);

        writeJob(jobsDir, 'sprint-8.json', {
          status: 'COMPLETE',
          sprintId: 'sprint-8',
          jobId: 'sprint-8',
          metrics: { totalTasks: 1, done: 1, techDebt: 0, noGo: 0 },
          completionRecord: { flowId: 'flow-abc' },
        });
        expect(fired).toEqual([]); // not yet — no scan has run since the write

        vi.advanceTimersByTime(1_000);
        expect(fired).toEqual(['sprint-8']);

        handle.dispose();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it('dispose() still clears the poll interval and closes fs.watch when a flowId filter is active', () => {
    withJobsDir((jobsDir) => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      const manual = makeManualWatch();

      const handle = createRunCompletionWatch(jobsDir, { onComplete: () => {} }, { watch: manual.watch, pollIntervalMs: 5_000, flowId: 'flow-abc' });
      handle.dispose();

      expect(clearIntervalSpy).toHaveBeenCalled();
      expect(manual.close).toHaveBeenCalledTimes(1);
      clearIntervalSpy.mockRestore();
    });
  });
});
