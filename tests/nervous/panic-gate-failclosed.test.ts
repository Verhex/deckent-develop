// tests/nervous/panic-gate-failclosed.test.ts
//
// Sprint 387 Task 387-006 — born-564 P1 fix regression tests.
//
// Bug: `readDecisionFromMarker` (src/nervous/panic-gate.ts) treated any
// parseable resolved marker WITHOUT an explicit reject decision as an
// approval — including the dashboard's real reject-marker shape
// (`{ taskId, rejectedVia, at }`, src/api/nervous-endpoint.ts), which has
// no `decision` field. That silently turned a user's dashboard reject into
// a fail-OPEN auto-accept.
//
// Fix: a marker only resolves APPROVED when it carries an unambiguous
// approve signal (explicit `decision` value, or the real accept-marker
// shape from `acceptPanicGuard`: `acceptedAt`/`acceptedBy`). Everything
// else — including the dashboard reject shape and any genuinely ambiguous
// content — resolves REJECTED (fail-closed, safe side).
//
// Covers:
//   1. dashboard-shaped reject marker (rejectedVia, no decision) → REJECTED
//   2. ambiguous marker ({}) → REJECTED (fail-closed default)
//   3. unrecognized decision value → REJECTED (fail-closed default)
//   4. explicit decision: 'reject' → REJECTED (legitimate reject path intact)
//   5. accept-shaped marker (acceptedAt/acceptedBy, no decision) → APPROVED
//      (acceptPanicGuard's real shape — legitimate open path must not break)
//   6. explicit decision: 'approve' → APPROVED (legitimate open path intact)
//   7. SAFETY_FLOOR locked action + ambiguous marker → still REJECTED
//
// All tests use tmpdir + fake timers — no real spawn, no real network.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { awaitPanicGateApproval } from '../../src/nervous/panic-gate.js';

let testRoot: string;
let resolvedDir: string;
let warnings: string[];
const captureWarn = (msg: string): void => {
  warnings.push(msg);
};

function writeResolvedMarker(taskId: string, content: unknown): void {
  mkdirSync(resolvedDir, { recursive: true });
  writeFileSync(join(resolvedDir, `${taskId}.json`), JSON.stringify(content), 'utf-8');
}

beforeEach(() => {
  warnings = [];
  testRoot = join(
    tmpdir(),
    `deckent-panic-gate-failclosed-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  resolvedDir = join(testRoot, '.deckent', 'nervous', 'panic-ipc', 'resolved');
  mkdirSync(testRoot, { recursive: true });
});

afterEach(() => {
  vi.useRealTimers();
  try {
    rmSync(testRoot, { recursive: true, force: true });
  } catch {
    // ignore — tmpdir cleanup best-effort
  }
});

describe('panic-gate fail-closed — readDecisionFromMarker via awaitPanicGateApproval', () => {
  it('dashboard reject marker shape (rejectedVia, no decision field) resolves REJECTED — regression for the fail-OPEN bug', async () => {
    vi.useFakeTimers();
    writeResolvedMarker('task-reject-dashboard', {
      taskId: 'task-reject-dashboard',
      rejectedVia: 'dashboard',
      at: '2026-07-08T00:00:00.000Z',
    });

    const pending = awaitPanicGateApproval({
      actionId: 'WORKER_RESPAWN',
      taskId: 'task-reject-dashboard',
      projectRoot: testRoot,
      timeoutMs: 10_000,
      pollIntervalMs: 250,
      warn: captureWarn,
    });

    await vi.advanceTimersByTimeAsync(300);

    const decision = await pending;
    expect(decision).toBe('REJECTED');
  });

  it('ambiguous marker ({}) resolves REJECTED — fail-closed default, not silent approval', async () => {
    vi.useFakeTimers();
    writeResolvedMarker('task-ambiguous', {});

    const pending = awaitPanicGateApproval({
      actionId: 'WORKER_RESPAWN',
      taskId: 'task-ambiguous',
      projectRoot: testRoot,
      timeoutMs: 10_000,
      pollIntervalMs: 250,
      warn: captureWarn,
    });

    await vi.advanceTimersByTimeAsync(300);

    const decision = await pending;
    expect(decision).toBe('REJECTED');
  });

  it('unrecognized decision value resolves REJECTED — fail-closed default', async () => {
    vi.useFakeTimers();
    writeResolvedMarker('task-unknown-decision', {
      taskId: 'task-unknown-decision',
      decision: 'defer',
    });

    const pending = awaitPanicGateApproval({
      actionId: 'WORKER_RESPAWN',
      taskId: 'task-unknown-decision',
      projectRoot: testRoot,
      timeoutMs: 10_000,
      pollIntervalMs: 250,
      warn: captureWarn,
    });

    await vi.advanceTimersByTimeAsync(300);

    const decision = await pending;
    expect(decision).toBe('REJECTED');
  });

  it('explicit decision: "reject" resolves REJECTED — legitimate reject path intact', async () => {
    vi.useFakeTimers();
    writeResolvedMarker('task-explicit-reject', {
      taskId: 'task-explicit-reject',
      decision: 'reject',
    });

    const pending = awaitPanicGateApproval({
      actionId: 'WORKER_RESPAWN',
      taskId: 'task-explicit-reject',
      projectRoot: testRoot,
      timeoutMs: 10_000,
      pollIntervalMs: 250,
      warn: captureWarn,
    });

    await vi.advanceTimersByTimeAsync(300);

    const decision = await pending;
    expect(decision).toBe('REJECTED');
  });

  it('acceptPanicGuard-shaped marker (acceptedAt/acceptedBy, no decision field) resolves APPROVED — legitimate open path must not break', async () => {
    vi.useFakeTimers();
    writeResolvedMarker('task-accept-shape', {
      taskId: 'task-accept-shape',
      acceptedAt: '2026-07-08T00:00:00.000Z',
      acceptedBy: 'user-cli',
    });

    const pending = awaitPanicGateApproval({
      actionId: 'WORKER_RESPAWN',
      taskId: 'task-accept-shape',
      projectRoot: testRoot,
      timeoutMs: 10_000,
      pollIntervalMs: 250,
      warn: captureWarn,
    });

    await vi.advanceTimersByTimeAsync(300);

    const decision = await pending;
    expect(decision).toBe('APPROVED');
  });

  it('explicit decision: "approve" resolves APPROVED — legitimate open path intact', async () => {
    vi.useFakeTimers();
    writeResolvedMarker('task-explicit-approve', {
      taskId: 'task-explicit-approve',
      decision: 'approve',
    });

    const pending = awaitPanicGateApproval({
      actionId: 'WORKER_RESPAWN',
      taskId: 'task-explicit-approve',
      projectRoot: testRoot,
      timeoutMs: 10_000,
      pollIntervalMs: 250,
      warn: captureWarn,
    });

    await vi.advanceTimersByTimeAsync(300);

    const decision = await pending;
    expect(decision).toBe('APPROVED');
  });

  it('SAFETY_FLOOR locked action with an ambiguous marker still resolves REJECTED', async () => {
    vi.useFakeTimers();
    writeResolvedMarker('task-locked-ambiguous', {
      taskId: 'task-locked-ambiguous',
      someUnrelatedField: true,
    });

    const pending = awaitPanicGateApproval({
      actionId: 'KILL_LIVE_SPRINT',
      taskId: 'task-locked-ambiguous',
      projectRoot: testRoot,
      timeoutMs: 10_000,
      pollIntervalMs: 250,
      warn: captureWarn,
    });

    await vi.advanceTimersByTimeAsync(300);

    const decision = await pending;
    expect(decision).toBe('REJECTED');
  });
});
