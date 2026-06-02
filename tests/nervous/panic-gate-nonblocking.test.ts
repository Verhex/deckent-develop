// tests/nervous/panic-gate-nonblocking.test.ts
//
// Sprint 223 Task 223-006 — Panic-gate NON-BLOCKING hermetic tests.
//
// Covers:
//   1. advisory mode → returns PROCEED immediately, spawn never waits.
//   2. timeout → auto-proceed within the configured deadline.
//   3. safety_floor locked action → NOT auto-proceeded (REJECTED, no bypass).
//   4. marker-yok (no IPC marker) → advisory flow proceeds normally.
//   5. resolved marker present → APPROVED before deadline.
//
// All tests use tmpdir + fake timers — no real spawn, no real network.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  evaluatePanicGate,
  awaitPanicGateApproval,
  isLockedPanicAction,
} from '../../src/nervous/panic-gate.js';

let testRoot: string;
let warnings: string[];
const captureWarn = (msg: string): void => {
  warnings.push(msg);
};

beforeEach(() => {
  warnings = [];
  testRoot = join(
    tmpdir(),
    `deckent-panic-gate-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
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

describe('panic-gate non-blocking — evaluatePanicGate (sync)', () => {
  it('advisory mode returns PROCEED immediately for non-locked action (spawn does not wait)', () => {
    const start = Date.now();
    const decision = evaluatePanicGate({
      actionId: 'WORKER_RESPAWN',
      mode: 'advisory',
      warn: captureWarn,
    });
    const elapsed = Date.now() - start;

    expect(decision).toBe('PROCEED');
    // Synchronous + non-blocking — must return well under any meaningful wait.
    expect(elapsed).toBeLessThan(50);
    // Visible warning emitted (no silent bypass).
    expect(warnings.some((w) => w.includes('advisory'))).toBe(true);
    expect(warnings.some((w) => w.includes('WORKER_RESPAWN'))).toBe(true);
  });

  it('safety_floor action rejected synchronously — advisory does NOT bypass locked actions', () => {
    const decision = evaluatePanicGate({
      actionId: 'KILL_LIVE_SPRINT',
      mode: 'advisory',
      warn: captureWarn,
    });

    expect(decision).toBe('REJECTED');
    expect(isLockedPanicAction('KILL_LIVE_SPRINT')).toBe(true);
    expect(warnings.some((w) => w.includes('safety_floor'))).toBe(true);
  });
});

describe('panic-gate non-blocking — awaitPanicGateApproval (async)', () => {
  it('TIMEOUT_AUTO_PROCEED when no marker arrives — never silent infinite wait', async () => {
    vi.useFakeTimers();
    const pending = awaitPanicGateApproval({
      actionId: 'WORKER_RESPAWN',
      taskId: 'task-001',
      projectRoot: testRoot,
      timeoutMs: 10_000,
      pollIntervalMs: 250,
      warn: captureWarn,
    });

    // Advance past the hard timeout — auto-proceed must fire.
    await vi.advanceTimersByTimeAsync(10_001);

    const decision = await pending;
    expect(decision).toBe('TIMEOUT_AUTO_PROCEED');
    expect(warnings.some((w) => w.includes('timeout'))).toBe(true);
    expect(warnings.some((w) => w.includes('auto-proceeding'))).toBe(true);
  });

  it('safety_floor locked action does NOT auto-proceed on timeout — resolves REJECTED', async () => {
    vi.useFakeTimers();
    const pending = awaitPanicGateApproval({
      actionId: 'KILL_LIVE_SPRINT',
      taskId: 'task-002',
      projectRoot: testRoot,
      timeoutMs: 5_000,
      pollIntervalMs: 250,
      warn: captureWarn,
    });

    await vi.advanceTimersByTimeAsync(5_001);

    const decision = await pending;
    // Locked actions cannot be auto-proceeded.
    expect(decision).toBe('REJECTED');
    expect(warnings.some((w) => w.includes('safety_floor'))).toBe(true);
    expect(warnings.some((w) => w.includes('no auto-proceed'))).toBe(true);
  });

  it('resolved marker present → APPROVED before deadline', async () => {
    vi.useFakeTimers();
    const resolvedDir = join(testRoot, '.deckent', 'panic-ipc', 'resolved');
    mkdirSync(resolvedDir, { recursive: true });
    writeFileSync(
      join(resolvedDir, 'task-003.json'),
      JSON.stringify({ taskId: 'task-003', acceptedAt: '2026-06-02T00:00:00.000Z' }),
      'utf-8',
    );

    const pending = awaitPanicGateApproval({
      actionId: 'WORKER_RESPAWN',
      taskId: 'task-003',
      projectRoot: testRoot,
      timeoutMs: 10_000,
      pollIntervalMs: 250,
      warn: captureWarn,
    });

    // Allow the initial poll tick to fire.
    await vi.advanceTimersByTimeAsync(300);

    const decision = await pending;
    expect(decision).toBe('APPROVED');
    // No timeout warning should have fired — approval beat the deadline.
    expect(warnings.some((w) => w.includes('timeout'))).toBe(false);
  });

  it('marker-yok (no marker) → polling proceeds without crashing, eventually auto-proceeds', async () => {
    vi.useFakeTimers();
    const pending = awaitPanicGateApproval({
      actionId: 'ORPHAN_TASK_ARCHIVE',
      taskId: 'task-004',
      projectRoot: testRoot,
      // Never created a marker directory at all — tests fallback path.
      timeoutMs: 2_000,
      pollIntervalMs: 250,
      warn: captureWarn,
    });

    // Advance through several poll cycles before the deadline.
    await vi.advanceTimersByTimeAsync(1_000);
    // Then trip the deadline.
    await vi.advanceTimersByTimeAsync(1_001);

    const decision = await pending;
    expect(decision).toBe('TIMEOUT_AUTO_PROCEED');
  });
});
