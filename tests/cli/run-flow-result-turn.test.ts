// ═══ TERM5-UI (Sprint 427, Task 427-006) — REPL result-turn render + i18n ═══
//
// Covers the piece that connects Task-3's flowId-filterable
// `createRunCompletionWatch`, Task-4's `ChatTurnQueue.enqueueCorrelatedResult`,
// and Task-5's `RunFlowController.applyRunCompletion` to a LIVE REPL
// transcript:
//   1. run.tsx's `buildRunFlowResultEvent` — formats a flowId-correlated
//      `RunCompletionInfo` as a rich, localized `ChatTurnBgEvent`
//      (verdict-summary + flowId).
//   2. run.tsx's `buildRunFlowResultLabels` — real en/tr i18n pin (messages.ts).
//   3. run.tsx's `wireRunFlowResultWatch` — flag-off never invokes the watch
//      factory (byte-identical to pre-427-006, same pin style as
//      run-flow-mount.test.ts's own `wireRunFlowMount` coverage); flag-on
//      drives `applyRunCompletion` + `onResult` ONLY for a flowId match, and
//      is a silent no-op for every non-matching / flow-less event.
//   4. app.tsx's `drainRunFlowResultTurns` — the pure, Ink-free helper
//      (ink-testing-library is not a project dependency) that drains a
//      correlated event through the SAME `ChatTurnQueue` the generic
//      bg-turns path already uses: produces immediately while idle, buffers
//      (returns []) mid-turn — mirrors `bgPayloadsToTurnTexts`'s own coverage
//      in tests/cli/repl-surface-wire.test.tsx.

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildRunFlowResultEvent,
  buildRunFlowResultLabels,
  wireRunFlowResultWatch,
  formatTaskEvidenceLine,
  verdictIcon,
  MAX_EVIDENCE_TASKS,
  type RunFlowResultLabels,
} from '../../src/cli/repl/run.js';
import { drainRunFlowResultTurns } from '../../src/cli/repl/app.js';
import { createChatTurnQueue } from '../../src/cli/repl/chat-turn-queue.js';
import {
  createRunCompletionWatch,
  type RunCompletionInfo,
  type RunCompletionWatchFsWatcher,
} from '../../src/cli/repl/run-completion-watch.js';
import type { RunFlowController } from '../../src/cli/repl/run-flow-controller.js';
import type { RunFlowContext } from '../../src/core/run-flow-contract.js';
import { getMessage } from '../../src/cli/helpers/messages.js';

// ─── fixtures ────────────────────────────────────────────────────────────────

const LABELS: RunFlowResultLabels = {
  completed: 'Run {flowId} completed — {done}/{total} DONE · {techDebt} TECH_DEBT · {noGo} NO_GO',
  failed: 'Run {flowId} failed: {error}',
  evidenceFiles: ' — {files} files · +{added}/-{removed}',
  evidenceTests: ' · tests {mark}{coverage}',
  evidenceMore: '  … {n} more',
};

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

/** Fake RunFlowController — `getContext().flowId` is fixed for the test,
 *  `applyRunCompletion` is a spy so call-count/args are assertable. */
function fakeController(flowId: string | undefined): RunFlowController & { applyRunCompletion: ReturnType<typeof vi.fn> } {
  const ctx: RunFlowContext = flowId !== undefined ? { state: 'DETACHED_RUNNING', flowId } : { state: 'COLLECTING' };
  return {
    getContext: () => ctx,
    proposeRun: vi.fn(async () => ctx),
    approve: vi.fn(() => ctx),
    reject: vi.fn(() => ctx),
    applyRunCompletion: vi.fn(() => ctx),
  };
}

// ─── run.tsx: buildRunFlowResultEvent ───────────────────────────────────────

describe('buildRunFlowResultEvent', () => {
  it('formats a COMPLETE info as a rich, flowId-bearing verdict summary', () => {
    const info: RunCompletionInfo = {
      jobId: 'job-1', sprintId: 'sprint-1', status: 'COMPLETE', flowId: 'flow-1',
      totalTasks: 3, done: 2, techDebt: 1, noGo: 0,
    };
    expect(buildRunFlowResultEvent(info, LABELS)).toEqual({
      source: 'flow-1',
      summary: 'Run flow-1 completed — 2/3 DONE · 1 TECH_DEBT · 0 NO_GO',
    });
  });

  it('formats a FAILED info with an error message', () => {
    const info: RunCompletionInfo = { jobId: 'job-2', status: 'FAILED', flowId: 'flow-2', error: 'worker crashed' };
    expect(buildRunFlowResultEvent(info, LABELS)).toEqual({ source: 'flow-2', summary: 'Run flow-2 failed: worker crashed' });
  });

  it('a FAILED info with no error message falls back to the jobId', () => {
    const info: RunCompletionInfo = { jobId: 'job-3', status: 'FAILED', flowId: 'flow-3' };
    expect(buildRunFlowResultEvent(info, LABELS).summary).toBe('Run flow-3 failed: job-3');
  });

  it('missing metrics counts default to 0 rather than "undefined" in the summary', () => {
    const info: RunCompletionInfo = { jobId: 'job-4', status: 'COMPLETE', flowId: 'flow-4' };
    expect(buildRunFlowResultEvent(info, LABELS).summary).toBe('Run flow-4 completed — 0/0 DONE · 0 TECH_DEBT · 0 NO_GO');
  });

  it('honors a caller-supplied label override (i18n wiring, e.g. Turkish)', () => {
    const trLabels: RunFlowResultLabels = {
      completed: 'Run {flowId} tamamlandı — {done}/{total} DONE',
      failed: '{flowId} başarısız: {error}',
      evidenceFiles: ' — {files} dosya · +{added}/-{removed}',
      evidenceTests: ' · test {mark}{coverage}',
      evidenceMore: '  … {n} daha',
    };
    const info: RunCompletionInfo = { jobId: 'job-5', status: 'COMPLETE', flowId: 'flow-5', totalTasks: 1, done: 1, techDebt: 0, noGo: 0 };
    expect(buildRunFlowResultEvent(info, trLabels).summary).toBe('Run flow-5 tamamlandı — 1/1 DONE');
  });

  // ─── SURF-3 result-evidence — per-task evidence block ─────────────────────

  it('appends per-task evidence lines below the aggregate header', () => {
    const info: RunCompletionInfo = {
      jobId: 'job-e', status: 'COMPLETE', flowId: 'flow-e',
      totalTasks: 2, done: 1, techDebt: 1, noGo: 0,
      tasks: [
        { taskId: 't1', title: 'Add auth', evaluation: 'DONE', selfAssessment: 'DONE', filesChanged: 3, linesAdded: 45, linesRemoved: 12, testsPassed: true, coverage: 87 },
        { taskId: 't2', title: 'Refactor', evaluation: 'GO_WITH_TECH_DEBT', selfAssessment: 'GO_WITH_TECH_DEBT', filesChanged: 1, linesAdded: 8, linesRemoved: 3, testsPassed: true, coverage: 0 },
      ],
    };
    const out = buildRunFlowResultEvent(info, LABELS).summary.split('\n');
    expect(out[0]).toBe('Run flow-e completed — 1/2 DONE · 1 TECH_DEBT · 0 NO_GO');
    expect(out[1]).toBe('  ✅ t1 Add auth — 3 files · +45/-12 · tests ✓ 87%');
    expect(out[2]).toBe('  ⚠ t2 Refactor — 1 files · +8/-3 · tests ✓');
  });

  it('a bare NO_GO task with no files/tests stays a clean one-liner (no "0 files")', () => {
    const info: RunCompletionInfo = {
      jobId: 'job-n', status: 'COMPLETE', flowId: 'flow-n', totalTasks: 1, done: 0, techDebt: 0, noGo: 1,
      tasks: [{ taskId: 't9', title: 'Migrate', evaluation: 'NO_GO', selfAssessment: 'NO_GO', filesChanged: 0, linesAdded: 0, linesRemoved: 0, testsPassed: false, coverage: 0 }],
    };
    const out = buildRunFlowResultEvent(info, LABELS).summary.split('\n');
    expect(out[1]).toBe('  ❌ t9 Migrate');
  });

  it('caps the evidence block at MAX_EVIDENCE_TASKS and adds a "… N more" footer', () => {
    const tasks = Array.from({ length: MAX_EVIDENCE_TASKS + 3 }, (_, i) => ({
      taskId: `t${i}`, title: `Task ${i}`, evaluation: 'DONE', selfAssessment: 'DONE',
      filesChanged: 1, linesAdded: 1, linesRemoved: 0, testsPassed: false, coverage: 0,
    }));
    const info: RunCompletionInfo = { jobId: 'job-c', status: 'COMPLETE', flowId: 'flow-c', totalTasks: tasks.length, done: tasks.length, techDebt: 0, noGo: 0, tasks };
    const out = buildRunFlowResultEvent(info, LABELS).summary.split('\n');
    // header + MAX task lines + 1 footer
    expect(out).toHaveLength(1 + MAX_EVIDENCE_TASKS + 1);
    expect(out[out.length - 1]).toBe('  … 3 more');
  });

  it('a COMPLETE info with no tasks (legacy job) is header-only — byte-identical to pre-evidence', () => {
    const info: RunCompletionInfo = { jobId: 'job-l', status: 'COMPLETE', flowId: 'flow-l', totalTasks: 2, done: 2, techDebt: 0, noGo: 0 };
    expect(buildRunFlowResultEvent(info, LABELS).summary).toBe('Run flow-l completed — 2/2 DONE · 0 TECH_DEBT · 0 NO_GO');
  });

  it('a FAILED info stays single-line even if it somehow carried tasks', () => {
    const info: RunCompletionInfo = {
      jobId: 'job-f', status: 'FAILED', flowId: 'flow-f', error: 'boom',
      tasks: [{ taskId: 't1', title: 'x', evaluation: 'DONE', selfAssessment: 'DONE', filesChanged: 1, linesAdded: 1, linesRemoved: 0, testsPassed: true, coverage: 0 }],
    };
    expect(buildRunFlowResultEvent(info, LABELS).summary).toBe('Run flow-f failed: boom');
  });
});

describe('formatTaskEvidenceLine + verdictIcon (pure — SURF-3 result-evidence)', () => {
  it('maps each verdict to its icon', () => {
    expect(verdictIcon('DONE')).toBe('✅');
    expect(verdictIcon('GO_WITH_TECH_DEBT')).toBe('⚠');
    expect(verdictIcon('NO_GO')).toBe('❌');
    expect(verdictIcon('WHATEVER')).toBe('•');
  });

  it('omits coverage when zero but still shows the test mark', () => {
    const line = formatTaskEvidenceLine(
      { taskId: 't', title: 'T', evaluation: 'DONE', selfAssessment: 'DONE', filesChanged: 2, linesAdded: 5, linesRemoved: 1, testsPassed: true, coverage: 0 },
      LABELS,
    );
    expect(line).toBe('  ✅ t T — 2 files · +5/-1 · tests ✓');
  });

  it('shows a failing test mark', () => {
    const line = formatTaskEvidenceLine(
      { taskId: 't', title: '', evaluation: 'NO_GO', selfAssessment: 'NO_GO', filesChanged: 0, linesAdded: 0, linesRemoved: 0, testsPassed: false, coverage: 40 },
      LABELS,
    );
    // coverage>0 forces the test segment even when testsPassed is false.
    expect(line).toBe('  ❌ t · tests ✗ 40%');
  });
});

// ─── run.tsx: buildRunFlowResultLabels (i18n en/tr pin) ─────────────────────

describe('buildRunFlowResultLabels', () => {
  it('every label is a non-empty, genuinely-translated string (en !== tr)', () => {
    const en = buildRunFlowResultLabels((k) => getMessage(k, 'en'));
    const tr = buildRunFlowResultLabels((k) => getMessage(k, 'tr'));

    for (const key of ['completed', 'failed', 'evidenceFiles', 'evidenceTests', 'evidenceMore'] as const) {
      expect(en[key].length).toBeGreaterThan(0);
      expect(tr[key].length).toBeGreaterThan(0);
      expect(en[key]).not.toBe(tr[key]);
    }
  });
});

// ─── run.tsx: wireRunFlowResultWatch ────────────────────────────────────────

describe('wireRunFlowResultWatch — flag gate', () => {
  it('enabled=false: returns undefined without invoking the watch factory', () => {
    const factory = vi.fn(createRunCompletionWatch);
    const controller = fakeController('flow-1');
    const onResult = vi.fn();

    const handle = wireRunFlowResultWatch(false, '/mock/jobs', controller, LABELS, onResult, factory);

    expect(handle).toBeUndefined();
    expect(factory).not.toHaveBeenCalled();
    expect(controller.applyRunCompletion).not.toHaveBeenCalled();
    expect(onResult).not.toHaveBeenCalled();
  });
});

describe('wireRunFlowResultWatch — flowId correlation', () => {
  let jobsDir: string;

  function withJobsDir<T>(fn: (dir: string) => T): T {
    jobsDir = mkdtempSync(join(tmpdir(), 'run-flow-result-turn-'));
    try {
      return fn(jobsDir);
    } finally {
      rmSync(jobsDir, { recursive: true, force: true });
    }
  }

  it('matching flowId: drives applyRunCompletion AND feeds onResult a rich localized event', () => {
    withJobsDir((dir) => {
      const manual = makeManualWatch();
      const controller = fakeController('flow-1');
      const onResult = vi.fn();
      const factory = (d: string, handlers: { onComplete: (info: RunCompletionInfo) => void }) =>
        createRunCompletionWatch(d, handlers, { watch: manual.watch, pollIntervalMs: 999_000 });

      const handle = wireRunFlowResultWatch(true, dir, controller, LABELS, onResult, factory);
      expect(handle).toBeDefined();

      writeJob(dir, 'sprint-1.json', {
        status: 'COMPLETE', sprintId: 'sprint-1',
        metrics: { totalTasks: 2, done: 2, techDebt: 0, noGo: 0 },
        completionRecord: { flowId: 'flow-1' },
      });
      manual.fire();

      expect(controller.applyRunCompletion).toHaveBeenCalledTimes(1);
      expect(controller.applyRunCompletion).toHaveBeenCalledWith(expect.objectContaining({ flowId: 'flow-1', status: 'COMPLETE' }));
      expect(onResult).toHaveBeenCalledTimes(1);
      expect(onResult).toHaveBeenCalledWith({ source: 'flow-1', summary: 'Run flow-1 completed — 2/2 DONE · 0 TECH_DEBT · 0 NO_GO' });

      handle!.dispose();
    });
  });

  it('non-matching flowId: silently skipped — no applyRunCompletion call, no onResult call', () => {
    withJobsDir((dir) => {
      const manual = makeManualWatch();
      const controller = fakeController('flow-1');
      const onResult = vi.fn();
      const factory = (d: string, handlers: { onComplete: (info: RunCompletionInfo) => void }) =>
        createRunCompletionWatch(d, handlers, { watch: manual.watch, pollIntervalMs: 999_000 });

      const handle = wireRunFlowResultWatch(true, dir, controller, LABELS, onResult, factory);

      writeJob(dir, 'sprint-2.json', {
        status: 'COMPLETE', sprintId: 'sprint-2',
        metrics: { totalTasks: 1, done: 1, techDebt: 0, noGo: 0 },
        completionRecord: { flowId: 'flow-other' },
      });
      manual.fire();

      expect(controller.applyRunCompletion).not.toHaveBeenCalled();
      expect(onResult).not.toHaveBeenCalled();

      handle!.dispose();
    });
  });

  it('a legacy job with no completionRecord.flowId at all: silently skipped', () => {
    withJobsDir((dir) => {
      const manual = makeManualWatch();
      const controller = fakeController('flow-1');
      const onResult = vi.fn();
      const factory = (d: string, handlers: { onComplete: (info: RunCompletionInfo) => void }) =>
        createRunCompletionWatch(d, handlers, { watch: manual.watch, pollIntervalMs: 999_000 });

      const handle = wireRunFlowResultWatch(true, dir, controller, LABELS, onResult, factory);

      writeJob(dir, 'sprint-3.json', { status: 'FAILED', sprintId: 'sprint-3', error: 'boom' });
      manual.fire();

      expect(controller.applyRunCompletion).not.toHaveBeenCalled();
      expect(onResult).not.toHaveBeenCalled();

      handle!.dispose();
    });
  });

  it('controller has no active flow (flowId undefined): every completion is silently skipped', () => {
    withJobsDir((dir) => {
      const manual = makeManualWatch();
      const controller = fakeController(undefined);
      const onResult = vi.fn();
      const factory = (d: string, handlers: { onComplete: (info: RunCompletionInfo) => void }) =>
        createRunCompletionWatch(d, handlers, { watch: manual.watch, pollIntervalMs: 999_000 });

      const handle = wireRunFlowResultWatch(true, dir, controller, LABELS, onResult, factory);

      writeJob(dir, 'sprint-4.json', {
        status: 'COMPLETE', sprintId: 'sprint-4',
        metrics: { totalTasks: 1, done: 1, techDebt: 0, noGo: 0 },
        completionRecord: { flowId: 'flow-1' },
      });
      manual.fire();

      expect(controller.applyRunCompletion).not.toHaveBeenCalled();
      expect(onResult).not.toHaveBeenCalled();

      handle!.dispose();
    });
  });

  it('a FAILED matching-flow completion also drives applyRunCompletion + onResult', () => {
    withJobsDir((dir) => {
      const manual = makeManualWatch();
      const controller = fakeController('flow-9');
      const onResult = vi.fn();
      const factory = (d: string, handlers: { onComplete: (info: RunCompletionInfo) => void }) =>
        createRunCompletionWatch(d, handlers, { watch: manual.watch, pollIntervalMs: 999_000 });

      const handle = wireRunFlowResultWatch(true, dir, controller, LABELS, onResult, factory);

      writeJob(dir, 'sprint-5.json', {
        status: 'FAILED', sprintId: 'sprint-5', error: 'worker crashed',
        completionRecord: { flowId: 'flow-9' },
      });
      manual.fire();

      expect(controller.applyRunCompletion).toHaveBeenCalledTimes(1);
      expect(onResult).toHaveBeenCalledWith({ source: 'flow-9', summary: 'Run flow-9 failed: worker crashed' });

      handle!.dispose();
    });
  });

  it('uses the real createRunCompletionWatch as its default watchFactory when none is injected', () => {
    withJobsDir((dir) => {
      const controller = fakeController('flow-1');
      const onResult = vi.fn();
      const handle = wireRunFlowResultWatch(true, dir, controller, LABELS, onResult);
      expect(handle).toBeDefined();
      handle!.dispose();
    });
  });
});

// ─── app.tsx: drainRunFlowResultTurns ───────────────────────────────────────

describe('drainRunFlowResultTurns (427-006)', () => {
  it('idle: produces the turn text immediately (idle REPL "wakes")', () => {
    const q = createChatTurnQueue();
    expect(q.userTurnActive).toBe(false);

    const texts = drainRunFlowResultTurns(q, { source: 'flow-1', summary: 'Run flow-1 completed — 2/2 DONE · 0 TECH_DEBT · 0 NO_GO' });

    expect(texts).toEqual(['Run flow-1 completed — 2/2 DONE · 0 TECH_DEBT · 0 NO_GO']);
    expect(q.size()).toBe(0);
  });

  it('mid-turn: buffers only, returns [] — Hermes no-inject rule preserved', () => {
    const q = createChatTurnQueue();
    q.userTurnActive = true;

    const texts = drainRunFlowResultTurns(q, { source: 'flow-1', summary: 'Run flow-1 completed — 2/2 DONE · 0 TECH_DEBT · 0 NO_GO' });

    expect(texts).toEqual([]);
    expect(q.size()).toBe(1);
  });

  it('the mid-turn buffered event surfaces later via the queue\'s own drainAsTurns() at turn-end', () => {
    const q = createChatTurnQueue();
    q.userTurnActive = true;
    drainRunFlowResultTurns(q, { source: 'flow-1', summary: 'Run flow-1 completed — 2/2 DONE · 0 TECH_DEBT · 0 NO_GO' });

    q.userTurnActive = false;
    const drained = q.drainAsTurns();

    expect(drained).toEqual([{ source: 'flow-1', events: [{ source: 'flow-1', summary: 'Run flow-1 completed — 2/2 DONE · 0 TECH_DEBT · 0 NO_GO' }] }]);
  });
});
