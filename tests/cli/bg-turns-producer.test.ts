// ═══ 408-001 BG-TURNS-PRODUCER (born-642) ════════════════════════════════════
//
// RED evidence this task closes: before this task, `ChatTurnQueue.enqueueBg`
// (chat-turn-queue.ts) had ZERO production callers — app.tsx's own
// `registerBgEventSink` effect only fires when run.tsx supplies the prop, and
// run.tsx never did. A detached run finishing on disk
// (`.deckent/runtime/jobs/*.json` RUNNING -> COMPLETE/FAILED) never reached a
// live REPL session. This suite proves: (1) run-completion-watch.ts's tolerant
// parser + baseline-never-fires + dedup + dispose semantics, (2) run.tsx's
// `buildBgTurnEvent` formatting, and (3) `wireBgTurnsProducer` — the
// composition-pin covering BOTH the run.tsx setup site and the enqueueBg feed
// site, mirroring `approval-xproc-wire.test.ts`'s coverage of
// `wireApprovalCrossProcess`.
//
// Hermetic: real tmpdir + real job-file writes (mirrors
// tests/core/approval-store-watch.test.ts's own style); fs.watch/poll timer
// are injectable seams so every test controls exactly which trigger path
// fires — no reliance on real OS fs-event timing/latency. No spawnSync.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createRunCompletionWatch,
  parseRunCompletionRecord,
  type RunCompletionInfo,
  type RunCompletionWatchFsWatcher,
} from '../../src/cli/repl/run-completion-watch.js';
import { buildBgTurnEvent, wireBgTurnsProducer } from '../../src/cli/repl/run.js';

// ─── fixtures ────────────────────────────────────────────────────────────────

function writeJob(dir: string, fileName: string, content: unknown): void {
  writeFileSync(join(dir, fileName), JSON.stringify(content), 'utf-8');
}

/** Manual watch stub (mirrors approval-store-watch.test.ts's own pattern) — a
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

let jobsDir: string;

beforeEach(() => {
  jobsDir = mkdtempSync(join(tmpdir(), 'bg-turns-producer-'));
});

afterEach(() => {
  rmSync(jobsDir, { recursive: true, force: true });
});

// ─── parseRunCompletionRecord — tolerant on-disk parsing ────────────────────

describe('parseRunCompletionRecord', () => {
  it('parses the sprint-finalizer.ts COMPLETE shape (evaluations{})', () => {
    const raw = JSON.stringify({
      status: 'COMPLETE',
      sprintId: 'sprint-406',
      summary: 'Sprint sprint-406 tamamlandı ...',
      metrics: { totalTasks: 3, done: 3, techDebt: 0, noGo: 0, duration: '17dk 32sn', durationMs: 1052844 },
      agentBreakdown: { 'doc-writer': 1 },
      evaluations: { '406-001': { evaluation: 'DONE' } },
    });
    expect(parseRunCompletionRecord(raw, 'sprint-406')).toEqual({
      jobId: 'sprint-406',
      sprintId: 'sprint-406',
      status: 'COMPLETE',
      totalTasks: 3,
      done: 3,
      techDebt: 0,
      noGo: 0,
      error: undefined,
    });
  });

  it('parses the job-runner.ts FAILED shape (tasks[], no metrics)', () => {
    const raw = JSON.stringify({
      jobId: 'job-1774426023008',
      status: 'FAILED',
      startedAt: '2026-07-11T00:00:00.000Z',
      completedAt: '2026-07-11T00:01:00.000Z',
      error: 'Sprint failed at phase EXECUTE: worker crashed',
    });
    const parsed = parseRunCompletionRecord(raw, 'job-1774426023008');
    expect(parsed).toEqual({
      jobId: 'job-1774426023008',
      sprintId: undefined,
      status: 'FAILED',
      totalTasks: undefined,
      done: undefined,
      techDebt: undefined,
      noGo: undefined,
      error: 'Sprint failed at phase EXECUTE: worker crashed',
    });
  });

  it('a RUNNING job returns null — nothing to report yet', () => {
    const raw = JSON.stringify({ jobId: 'job-running-1', status: 'RUNNING', startedAt: '2026-07-11T00:00:00.000Z' });
    expect(parseRunCompletionRecord(raw, 'job-running-1')).toBeNull();
  });

  it('corrupt JSON returns null, never throws', () => {
    expect(() => parseRunCompletionRecord('{"status": "COMPLETE",', 'x')).not.toThrow();
    expect(parseRunCompletionRecord('{"status": "COMPLETE",', 'x')).toBeNull();
  });

  it('an unknown status string returns null', () => {
    const raw = JSON.stringify({ jobId: 'x', status: 'PENDING' });
    expect(parseRunCompletionRecord(raw, 'x')).toBeNull();
  });

  it('falls back to the filename-derived id when jobId/sprintId are both absent', () => {
    const raw = JSON.stringify({ status: 'COMPLETE', metrics: { totalTasks: 1, done: 1, techDebt: 0, noGo: 0 } });
    const parsed = parseRunCompletionRecord(raw, 'sprint-999');
    expect(parsed?.jobId).toBe('sprint-999');
  });
});

// ─── createRunCompletionWatch — baseline never fires ────────────────────────

describe('createRunCompletionWatch — baseline (pre-existing history never resurfaces)', () => {
  it('a job ALREADY COMPLETE on disk at construction time does not fire onComplete', () => {
    writeJob(jobsDir, 'sprint-100.json', { status: 'COMPLETE', sprintId: 'sprint-100', metrics: { totalTasks: 1, done: 1, techDebt: 0, noGo: 0 } });
    const fired: RunCompletionInfo[] = [];
    const inert = makeInertWatch();

    const handle = createRunCompletionWatch(jobsDir, { onComplete: (i) => fired.push(i) }, { watch: inert.watch, pollIntervalMs: 50_000 });

    expect(fired).toEqual([]);
    handle.dispose();
  });

  it('a RUNNING job at construction time DOES fire once it later transitions to COMPLETE', () => {
    writeJob(jobsDir, 'sprint-101.json', { status: 'RUNNING', jobId: 'sprint-101', startedAt: '2026-07-11T00:00:00.000Z' });
    const fired: RunCompletionInfo[] = [];
    const manual = makeManualWatch();

    const handle = createRunCompletionWatch(jobsDir, { onComplete: (i) => fired.push(i) }, { watch: manual.watch, pollIntervalMs: 50_000 });
    expect(fired).toEqual([]); // still RUNNING — baseline saw nothing terminal

    // The SAME file is overwritten in place (real production behavior —
    // start.ts writes RUNNING, sprint-finalizer.ts/sprint-runner-entry.ts
    // later rewrite the identical filename to COMPLETE/FAILED).
    writeJob(jobsDir, 'sprint-101.json', { status: 'COMPLETE', sprintId: 'sprint-101', metrics: { totalTasks: 2, done: 2, techDebt: 0, noGo: 0 } });
    manual.fire();

    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatchObject({ jobId: 'sprint-101', sprintId: 'sprint-101', status: 'COMPLETE', done: 2, totalTasks: 2 });
    handle.dispose();
  });

  it('a brand-new job file appearing AFTER attach, already terminal, fires (live-session scenario)', () => {
    const fired: RunCompletionInfo[] = [];
    const manual = makeManualWatch();

    const handle = createRunCompletionWatch(jobsDir, { onComplete: (i) => fired.push(i) }, { watch: manual.watch, pollIntervalMs: 50_000 });
    expect(fired).toEqual([]); // nothing on disk yet at attach time

    writeJob(jobsDir, 'sprint-102.json', { status: 'FAILED', sprintId: 'sprint-102', error: 'boom' });
    manual.fire();

    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatchObject({ jobId: 'sprint-102', status: 'FAILED', error: 'boom' });
    handle.dispose();
  });
});

// ─── dedup ───────────────────────────────────────────────────────────────────

describe('createRunCompletionWatch — dedup', () => {
  it('onComplete fires exactly once across multiple scans for the same unchanged terminal record', () => {
    const fired: string[] = [];
    const manual = makeManualWatch();

    const handle = createRunCompletionWatch(jobsDir, { onComplete: (i) => fired.push(i.jobId) }, { watch: manual.watch, pollIntervalMs: 50_000 });

    writeJob(jobsDir, 'sprint-200.json', { status: 'COMPLETE', sprintId: 'sprint-200', metrics: { totalTasks: 1, done: 1, techDebt: 0, noGo: 0 } });
    manual.fire();
    manual.fire();
    manual.fire();

    expect(fired).toEqual(['sprint-200']);
    handle.dispose();
  });
});

// ─── poll fallback is mandatory ──────────────────────────────────────────────

describe('createRunCompletionWatch — poll fallback', () => {
  it('a transition is detected via the poll timer alone when fs.watch never fires', () => {
    vi.useFakeTimers();
    try {
      writeJob(jobsDir, 'sprint-300.json', { status: 'RUNNING', jobId: 'sprint-300' });
      const fired: string[] = [];
      const inert = makeInertWatch(); // wired, but onChange is NEVER invoked

      const handle = createRunCompletionWatch(jobsDir, { onComplete: (i) => fired.push(i.jobId) }, { watch: inert.watch, pollIntervalMs: 1_000 });
      expect(fired).toEqual([]);

      writeJob(jobsDir, 'sprint-300.json', { status: 'COMPLETE', sprintId: 'sprint-300', metrics: { totalTasks: 1, done: 1, techDebt: 0, noGo: 0 } });
      expect(fired).toEqual([]); // not yet — no scan has run since the write

      vi.advanceTimersByTime(1_000);
      expect(fired).toEqual(['sprint-300']);

      handle.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('the fs.watch path reacts independently of the poll timer', () => {
    vi.useFakeTimers();
    try {
      const fired: string[] = [];
      const manual = makeManualWatch();

      const handle = createRunCompletionWatch(jobsDir, { onComplete: (i) => fired.push(i.jobId) }, { watch: manual.watch, pollIntervalMs: 1_000_000_000 });

      writeJob(jobsDir, 'sprint-301.json', { status: 'COMPLETE', sprintId: 'sprint-301', metrics: { totalTasks: 1, done: 1, techDebt: 0, noGo: 0 } });
      manual.fire();

      expect(fired).toEqual(['sprint-301']);
      handle.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});

// ─── dispose() — MOAT-2: no lingering handle/timer, no late events ──────────

describe('createRunCompletionWatch — dispose()', () => {
  it('the poll interval is created unref\'d (never pins the host process alive)', () => {
    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    const inert = makeInertWatch();

    const handle = createRunCompletionWatch(jobsDir, { onComplete: () => {} }, { watch: inert.watch, pollIntervalMs: 5_000 });

    const result = setIntervalSpy.mock.results.at(-1);
    expect(result?.type).toBe('return');
    const timer = result!.value as NodeJS.Timeout;
    expect(timer.hasRef()).toBe(false);

    handle.dispose();
    setIntervalSpy.mockRestore();
  });

  it('dispose() clears the poll interval and closes the fs.watch handle', () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    const manual = makeManualWatch();

    const handle = createRunCompletionWatch(jobsDir, { onComplete: () => {} }, { watch: manual.watch, pollIntervalMs: 5_000 });
    handle.dispose();

    expect(clearIntervalSpy).toHaveBeenCalled();
    expect(manual.close).toHaveBeenCalledTimes(1);
    clearIntervalSpy.mockRestore();
  });

  it('dispose() is idempotent — calling it twice does not throw or double-close', () => {
    const manual = makeManualWatch();
    const handle = createRunCompletionWatch(jobsDir, { onComplete: () => {} }, { watch: manual.watch, pollIntervalMs: 5_000 });

    handle.dispose();
    expect(() => handle.dispose()).not.toThrow();
    expect(manual.close).toHaveBeenCalledTimes(1);
  });

  it('no handler fires for an event that arrives after dispose() (MOAT-2 linger)', () => {
    const fired: string[] = [];
    const manual = makeManualWatch();

    const handle = createRunCompletionWatch(jobsDir, { onComplete: (i) => fired.push(i.jobId) }, { watch: manual.watch, pollIntervalMs: 50_000 });
    handle.dispose();

    writeJob(jobsDir, 'sprint-400.json', { status: 'COMPLETE', sprintId: 'sprint-400', metrics: { totalTasks: 1, done: 1, techDebt: 0, noGo: 0 } });
    manual.fire(); // late fs.watch-style event, arriving after dispose()

    expect(fired).toEqual([]);
  });

  it('fs.watch construction failure degrades gracefully — poll fallback still works', () => {
    vi.useFakeTimers();
    try {
      const fired: string[] = [];
      const throwingWatch: RunCompletionWatchFsWatcher = () => {
        throw new Error('EMFILE: too many open files');
      };

      const handle = createRunCompletionWatch(jobsDir, { onComplete: (i) => fired.push(i.jobId) }, { watch: throwingWatch, pollIntervalMs: 1_000 });

      writeJob(jobsDir, 'sprint-401b.json', { status: 'COMPLETE', sprintId: 'sprint-401b', metrics: { totalTasks: 1, done: 1, techDebt: 0, noGo: 0 } });
      vi.advanceTimersByTime(1_000);

      expect(fired).toEqual(['sprint-401b']);
      expect(() => handle.dispose()).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });
});

// ─── real fs.watch — production seam, end-to-end sanity ─────────────────────

describe('createRunCompletionWatch — real fs.watch (default seam)', () => {
  it('detects an externally-written COMPLETE job without any injected watch/scan', async () => {
    const fired: string[] = [];
    const handle = createRunCompletionWatch(jobsDir, { onComplete: (i) => fired.push(i.jobId) }, { pollIntervalMs: 50 });

    writeJob(jobsDir, 'sprint-500.json', { status: 'COMPLETE', sprintId: 'sprint-500', metrics: { totalTasks: 1, done: 1, techDebt: 0, noGo: 0 } });

    await vi.waitFor(() => expect(fired).toContain('sprint-500'), { timeout: 3_000 });
    handle.dispose();
  });

  it('a missing jobsDir degrades to no-op (never throws at construction)', () => {
    const missing = join(jobsDir, 'does-not-exist');
    expect(() => {
      const handle = createRunCompletionWatch(missing, { onComplete: () => {} }, { pollIntervalMs: 50_000 });
      handle.dispose();
    }).not.toThrow();
  });
});

// ─── run.tsx: buildBgTurnEvent ───────────────────────────────────────────────

describe('buildBgTurnEvent', () => {
  it('formats a COMPLETE job as a compact, language-neutral summary', () => {
    const info: RunCompletionInfo = { jobId: 'sprint-406', sprintId: 'sprint-406', status: 'COMPLETE', totalTasks: 3, done: 3, techDebt: 0, noGo: 0 };
    expect(buildBgTurnEvent(info)).toEqual({ source: 'sprint-406', summary: 'sprint-406 — 3/3 DONE · 0 TECH_DEBT · 0 NO_GO' });
  });

  it('formats a FAILED job with an error message', () => {
    const info: RunCompletionInfo = { jobId: 'job-1', status: 'FAILED', error: 'worker crashed' };
    expect(buildBgTurnEvent(info)).toEqual({ source: 'job-1', summary: 'job-1 — FAILED: worker crashed' });
  });

  it('formats a FAILED job with no error message', () => {
    const info: RunCompletionInfo = { jobId: 'job-2', status: 'FAILED' };
    expect(buildBgTurnEvent(info)).toEqual({ source: 'job-2', summary: 'job-2 — FAILED' });
  });

  it('prefers sprintId over jobId as the event source when both are present', () => {
    const info: RunCompletionInfo = { jobId: 'job-3', sprintId: 'sprint-999', status: 'COMPLETE', totalTasks: 1, done: 1, techDebt: 0, noGo: 0 };
    expect(buildBgTurnEvent(info).source).toBe('sprint-999');
  });

  it('missing metrics counts default to 0 rather than "undefined" in the summary', () => {
    const info: RunCompletionInfo = { jobId: 'sprint-777', status: 'COMPLETE' };
    expect(buildBgTurnEvent(info).summary).toBe('sprint-777 — 0/0 DONE · 0 TECH_DEBT · 0 NO_GO');
  });
});

// ─── run.tsx: wireBgTurnsProducer — composition-pin ─────────────────────────
// Mirrors approval-xproc-wire.test.ts's coverage of wireApprovalCrossProcess:
// pins BOTH the run.tsx setup site (watchFactory invocation + jobsDir) AND
// the enqueueBg feed site (onComplete -> buildBgTurnEvent -> enqueueBg).

describe('wireBgTurnsProducer — flag gate', () => {
  it('enabled=false -> watchFactory is never called, returns undefined', () => {
    const factory = vi.fn(createRunCompletionWatch);
    const enqueueBg = vi.fn();

    const handle = wireBgTurnsProducer(false, jobsDir, enqueueBg, factory);

    expect(handle).toBeUndefined();
    expect(factory).not.toHaveBeenCalled();
    expect(enqueueBg).not.toHaveBeenCalled();
  });
});

describe('wireBgTurnsProducer — enabled: setup site + enqueueBg feed site', () => {
  it('constructs the watch against the supplied jobsDir and feeds a completed job into enqueueBg as a ChatTurnBgEvent', () => {
    const manual = makeManualWatch();
    const enqueueBg = vi.fn();
    const factory = (dir: string, handlers: { onComplete: (info: RunCompletionInfo) => void }) =>
      createRunCompletionWatch(dir, handlers, { watch: manual.watch, pollIntervalMs: 999_000 });

    const handle = wireBgTurnsProducer(true, jobsDir, enqueueBg, factory);
    expect(handle).toBeDefined();

    writeJob(jobsDir, 'sprint-600.json', { status: 'COMPLETE', sprintId: 'sprint-600', metrics: { totalTasks: 2, done: 1, techDebt: 1, noGo: 0 } });
    manual.fire();

    expect(enqueueBg).toHaveBeenCalledTimes(1);
    expect(enqueueBg).toHaveBeenCalledWith({ source: 'sprint-600', summary: 'sprint-600 — 1/2 DONE · 1 TECH_DEBT · 0 NO_GO' });

    handle!.dispose();
  });

  it('a FAILED job feeds a FAILED-shaped ChatTurnBgEvent through the same enqueueBg site', () => {
    const manual = makeManualWatch();
    const enqueueBg = vi.fn();
    const factory = (dir: string, handlers: { onComplete: (info: RunCompletionInfo) => void }) =>
      createRunCompletionWatch(dir, handlers, { watch: manual.watch, pollIntervalMs: 999_000 });

    const handle = wireBgTurnsProducer(true, jobsDir, enqueueBg, factory);

    writeJob(jobsDir, 'sprint-601.json', { status: 'FAILED', sprintId: 'sprint-601', error: 'boom' });
    manual.fire();

    expect(enqueueBg).toHaveBeenCalledWith({ source: 'sprint-601', summary: 'sprint-601 — FAILED: boom' });
    handle!.dispose();
  });

  it('uses the real createRunCompletionWatch as its default watchFactory when none is injected', () => {
    const enqueueBg = vi.fn();
    const handle = wireBgTurnsProducer(true, jobsDir, enqueueBg);
    expect(handle).toBeDefined();
    handle!.dispose();
  });
});
