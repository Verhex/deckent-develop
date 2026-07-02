// ─── ApprovalStoreWatch tests (APR-XPROC-CORE, task 358-001) ─────────────────
// Hermetic: real broker/store writes into a tmpdir (mirrors approval-store.test.ts),
// but fs.watch + the poll timer are injectable seams so every test controls exactly
// which trigger path fires — no reliance on real OS fs-event timing/latency.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createApprovalStoreWatch,
  type ApprovalStoreWatchFsWatcher,
} from '../../src/core/approval-store-watch.js';
import { ApprovalBroker } from '../../src/core/approval-broker.js';
import type { ApprovalRequestInput } from '../../src/core/approval-broker.js';
import type { ApprovalDecision, ApprovalRequest } from '../../src/core/approval-contract.js';

const FIXED_NOW = new Date('2026-07-02T12:00:00.000Z');

function buildRequest(id: string, overrides: Partial<ApprovalRequestInput> = {}): ApprovalRequestInput {
  return {
    id,
    requester: { role: 'worker', instanceId: 'w-358-001' },
    summary: `approval request ${id}`,
    details: { note: 'test' },
    scopeId: 'sprint-358',
    scope: 'shell-exec',
    risk: 'high',
    policy: 'require-approval',
    defaultAction: 'deny',
    tenantId: 'local',
    userId: 'alperen',
    createdAt: '2026-07-02T11:00:00.000Z',
    expiresAt: '2026-07-02T13:00:00.000Z',
    ...overrides,
  };
}

/** Injected watch stub that never fires on its own — a real caller triggers it via
 *  `.fire()`. Lets a test isolate "did the fs.watch path react" from "did the poll
 *  fallback react" by choosing which one to exercise. */
function makeManualWatch(): { watch: ApprovalStoreWatchFsWatcher; fire: () => void; close: ReturnType<typeof vi.fn> } {
  let onChange: (() => void) | undefined;
  const close = vi.fn();
  const watch: ApprovalStoreWatchFsWatcher = (_dir, cb) => {
    onChange = cb;
    return { close };
  };
  return { watch, fire: () => onChange?.(), close };
}

/** A watch stub that is wired but NEVER calls onChange — proves the poll timer
 *  alone (not fs.watch) is what caught a given change. */
function makeInertWatch(): { watch: ApprovalStoreWatchFsWatcher; close: ReturnType<typeof vi.fn> } {
  const close = vi.fn();
  const watch: ApprovalStoreWatchFsWatcher = () => ({ close });
  return { watch, close };
}

let projectRoot: string;
let storeDir: string;
let broker: ApprovalBroker;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'approval-store-watch-'));
  storeDir = join(projectRoot, 'approvals');
  broker = new ApprovalBroker(projectRoot, { storeDir });
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

// ─── store-replay on attach (the born-462 fix itself) ────────────────────────

describe('createApprovalStoreWatch — store-replay on attach', () => {
  it('reports a pending request already on disk BEFORE the watcher attached, exactly once', () => {
    const req = broker.submit(buildRequest('apr-replay-1'));
    const pending: ApprovalRequest[] = [];
    const inert = makeInertWatch();

    const handle = createApprovalStoreWatch(
      storeDir,
      { onPending: (r) => pending.push(r) },
      { watch: inert.watch, clock: () => FIXED_NOW, pollIntervalMs: 50_000 },
    );

    expect(pending.map((r) => r.id)).toEqual([req.id]);
    handle.dispose();
  });

  it('does not report an already-decided request via onPending', () => {
    const req = broker.submit(buildRequest('apr-replay-decided'));
    broker.decide(req.id, { decision: 'allow', decidedBy: 'a', channel: 'cli', decidedAt: FIXED_NOW.toISOString() });

    const pending: ApprovalRequest[] = [];
    const decided: Array<{ id: string; decision: ApprovalDecision }> = [];
    const inert = makeInertWatch();

    const handle = createApprovalStoreWatch(
      storeDir,
      { onPending: (r) => pending.push(r), onDecided: (id, decision) => decided.push({ id, decision }) },
      { watch: inert.watch, clock: () => FIXED_NOW, pollIntervalMs: 50_000 },
    );

    expect(pending).toEqual([]);
    expect(decided.map((d) => d.id)).toEqual([req.id]);
    handle.dispose();
  });
});

// ─── dedup by id+status ────────────────────────────────────────────────────────

describe('createApprovalStoreWatch — dedup', () => {
  it('onPending fires exactly once across multiple scans for the same unchanged record', () => {
    const req = broker.submit(buildRequest('apr-dedup-1'));
    const pending: ApprovalRequest[] = [];
    const manual = makeManualWatch();

    const handle = createApprovalStoreWatch(
      storeDir,
      { onPending: (r) => pending.push(r) },
      { watch: manual.watch, clock: () => FIXED_NOW, pollIntervalMs: 50_000 },
    );
    // Initial replay scan already fired once; fire the watch path repeatedly for
    // the SAME still-pending record.
    manual.fire();
    manual.fire();
    manual.fire();

    expect(pending.map((r) => r.id)).toEqual([req.id]);
    handle.dispose();
  });

  it('onDecided fires exactly once when a decision appears, even across repeated scans', () => {
    const req = broker.submit(buildRequest('apr-dedup-2'));
    const decided: Array<{ id: string; decision: ApprovalDecision }> = [];
    const manual = makeManualWatch();

    const handle = createApprovalStoreWatch(
      storeDir,
      { onDecided: (id, decision) => decided.push({ id, decision }) },
      { watch: manual.watch, clock: () => FIXED_NOW, pollIntervalMs: 50_000 },
    );

    broker.decide(req.id, { decision: 'allow', decidedBy: 'a', channel: 'cli', decidedAt: FIXED_NOW.toISOString() });
    manual.fire();
    manual.fire();

    expect(decided).toHaveLength(1);
    expect(decided[0]!.id).toBe(req.id);
    expect(decided[0]!.decision.decision).toBe('allow');
    handle.dispose();
  });
});

// ─── decided transition after attach ─────────────────────────────────────────

describe('createApprovalStoreWatch — pending → decided transition', () => {
  it('onPending fires on attach, then onDecided fires once the decision file appears', () => {
    const req = broker.submit(buildRequest('apr-transition-1'));
    const pending: string[] = [];
    const decided: string[] = [];
    const manual = makeManualWatch();

    const handle = createApprovalStoreWatch(
      storeDir,
      { onPending: (r) => pending.push(r.id), onDecided: (id) => decided.push(id) },
      { watch: manual.watch, clock: () => FIXED_NOW, pollIntervalMs: 50_000 },
    );
    expect(pending).toEqual([req.id]);
    expect(decided).toEqual([]);

    broker.decide(req.id, { decision: 'deny', decidedBy: 'a', channel: 'cli', decidedAt: FIXED_NOW.toISOString() });
    manual.fire();

    expect(decided).toEqual([req.id]);
    handle.dispose();
  });
});

// ─── corrupt / tmp files never emit ──────────────────────────────────────────

describe('createApprovalStoreWatch — corrupt/tmp files are never emitted', () => {
  it('a torn (invalid JSON) request file triggers no onPending', () => {
    writeFileSync(join(storeDir, 'apr-torn.request.json'), '{"id": "apr-torn",', 'utf-8');
    const pending: string[] = [];
    const inert = makeInertWatch();

    const handle = createApprovalStoreWatch(
      storeDir,
      { onPending: (r) => pending.push(r.id) },
      { watch: inert.watch, clock: () => FIXED_NOW, pollIntervalMs: 50_000 },
    );

    expect(pending).toEqual([]);
    handle.dispose();
  });

  it('an atomic-write tmp file (mid-rename artifact) triggers no handler at all', () => {
    const req = buildRequest('apr-tmp-artifact');
    writeFileSync(
      join(storeDir, `apr-tmp-artifact.request.json.11111111-1111-1111-1111-111111111111.tmp`),
      JSON.stringify(req),
      'utf-8',
    );
    const pending: string[] = [];
    const decided: string[] = [];
    const inert = makeInertWatch();

    const handle = createApprovalStoreWatch(
      storeDir,
      { onPending: (r) => pending.push(r.id), onDecided: (id) => decided.push(id) },
      { watch: inert.watch, clock: () => FIXED_NOW, pollIntervalMs: 50_000 },
    );

    expect(pending).toEqual([]);
    expect(decided).toEqual([]);
    handle.dispose();
  });

  it('a decision file with no matching request file triggers no onDecided', () => {
    const orphan: ApprovalDecision = {
      requestId: 'apr-orphan',
      decision: 'allow',
      decidedBy: 'x',
      channel: 'cli',
      decidedAt: FIXED_NOW.toISOString(),
      reason: '',
    };
    writeFileSync(join(storeDir, 'apr-orphan.decision.json'), JSON.stringify(orphan), 'utf-8');
    const decided: string[] = [];
    const inert = makeInertWatch();

    const handle = createApprovalStoreWatch(
      storeDir,
      { onDecided: (id) => decided.push(id) },
      { watch: inert.watch, clock: () => FIXED_NOW, pollIntervalMs: 50_000 },
    );

    expect(decided).toEqual([]);
    handle.dispose();
  });
});

// ─── poll fallback is mandatory (not merely fs.watch-on-failure) ────────────

describe('createApprovalStoreWatch — poll fallback', () => {
  it('a change is detected via the poll timer alone when fs.watch never fires', () => {
    vi.useFakeTimers();
    try {
      const pending: string[] = [];
      const inert = makeInertWatch(); // wired, but its onChange callback is NEVER invoked

      const handle = createApprovalStoreWatch(
        storeDir,
        { onPending: (r) => pending.push(r.id) },
        { watch: inert.watch, clock: () => FIXED_NOW, pollIntervalMs: 1_000 },
      );
      expect(pending).toEqual([]); // nothing on disk yet at attach time

      broker.submit(buildRequest('apr-poll-only'));
      expect(pending).toEqual([]); // not yet — no scan has run since the write

      vi.advanceTimersByTime(1_000);
      expect(pending).toEqual(['apr-poll-only']);

      handle.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('the fs.watch path reacts independently of the poll timer', () => {
    vi.useFakeTimers();
    try {
      const pending: string[] = [];
      const manual = makeManualWatch();

      const handle = createApprovalStoreWatch(
        storeDir,
        { onPending: (r) => pending.push(r.id) },
        { watch: manual.watch, clock: () => FIXED_NOW, pollIntervalMs: 1_000_000_000 }, // effectively never
      );

      broker.submit(buildRequest('apr-watch-only'));
      manual.fire();

      expect(pending).toEqual(['apr-watch-only']);
      handle.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});

// ─── dispose() — MOAT-2: no lingering handle/timer, no late events ──────────

describe('createApprovalStoreWatch — dispose()', () => {
  it('the poll interval is created unref\'d (never pins the host process alive)', () => {
    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    const inert = makeInertWatch();

    const handle = createApprovalStoreWatch(storeDir, {}, { watch: inert.watch, clock: () => FIXED_NOW, pollIntervalMs: 5_000 });

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

    const handle = createApprovalStoreWatch(storeDir, {}, { watch: manual.watch, clock: () => FIXED_NOW, pollIntervalMs: 5_000 });
    handle.dispose();

    expect(clearIntervalSpy).toHaveBeenCalled();
    expect(manual.close).toHaveBeenCalledTimes(1);
    clearIntervalSpy.mockRestore();
  });

  it('dispose() is idempotent — calling it twice does not throw or double-close', () => {
    const manual = makeManualWatch();
    const handle = createApprovalStoreWatch(storeDir, {}, { watch: manual.watch, clock: () => FIXED_NOW, pollIntervalMs: 5_000 });

    handle.dispose();
    expect(() => handle.dispose()).not.toThrow();
    expect(manual.close).toHaveBeenCalledTimes(1);
  });

  it('no handler fires for an event that arrives after dispose()', () => {
    const pending: string[] = [];
    const manual = makeManualWatch();

    const handle = createApprovalStoreWatch(
      storeDir,
      { onPending: (r) => pending.push(r.id) },
      { watch: manual.watch, clock: () => FIXED_NOW, pollIntervalMs: 50_000 },
    );
    handle.dispose();

    broker.submit(buildRequest('apr-post-dispose'));
    manual.fire(); // late fs.watch-style event, arriving after dispose()

    expect(pending).toEqual([]);
  });

  it('fs.watch construction failure degrades gracefully — poll fallback still works', () => {
    vi.useFakeTimers();
    try {
      const pending: string[] = [];
      const throwingWatch: ApprovalStoreWatchFsWatcher = () => {
        throw new Error('EMFILE: too many open files');
      };

      const handle = createApprovalStoreWatch(
        storeDir,
        { onPending: (r) => pending.push(r.id) },
        { watch: throwingWatch, clock: () => FIXED_NOW, pollIntervalMs: 1_000 },
      );

      broker.submit(buildRequest('apr-watch-throws'));
      vi.advanceTimersByTime(1_000);

      expect(pending).toEqual(['apr-watch-throws']);
      expect(() => handle.dispose()).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });
});

// ─── real fs.watch — production seam, end-to-end sanity ─────────────────────

describe('createApprovalStoreWatch — real fs.watch (default seam)', () => {
  it('detects an externally-written pending request without any injected watch/scan', async () => {
    const pending: string[] = [];
    const handle = createApprovalStoreWatch(storeDir, { onPending: (r) => pending.push(r.id) }, { pollIntervalMs: 50 });

    // No injected clock here (this test exercises the real `() => new Date()`
    // default) — expiresAt must stay in the future relative to the REAL wall
    // clock, not the fixed FIXED_NOW used by every other test in this file.
    broker.submit(buildRequest('apr-real-fswatch', { expiresAt: '2099-01-01T00:00:00.000Z' }));

    await vi.waitFor(() => expect(pending).toContain('apr-real-fswatch'), { timeout: 3_000 });
    handle.dispose();
  });
});
