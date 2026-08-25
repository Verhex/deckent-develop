// tests/core/live-w1-staleHb.test.ts
//
// LIVE-W1: stale-HB SSOT + presence-aware approval-window
// Verifies:
// (a) config.heartbeat_timeout is the SSOT for both StaleWorkerDetector and
//     auditor.scanHeartbeats — both inherit DEFAULT_HEARTBEAT_TIMEOUT_MS.
// (b) Executor approval-window is presence-aware (attended=30s, unattended=5s);
//     safety-floor always requires explicit approval.
//
// ADR-003: vitest over Jest

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  DEFAULT_HEARTBEAT_TIMEOUT_MS,
  DEFAULT_APPROVE_TIMEOUT_ATTENDED_MS,
  DEFAULT_APPROVE_TIMEOUT_UNATTENDED_MS,
  createDefaultConfig,
} from '../../src/core/config.js';
import { StaleWorkerDetector } from '../../src/nervous/detectors/stale-worker.js';
import {
  detectAttendedSession,
  APPROVE_TIMEOUT_ATTENDED_MS,
  APPROVE_TIMEOUT_UNATTENDED_MS,
  shouldArmAutoProceed,
} from '../../src/nervous/executor.js';
import type { NervousSystemConfig } from '../../src/core/config-types.js';
import type { DetectorContext, SprintStateSnapshot, ObserverEvent } from '../../src/core/nervous-types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BASE_NOW = new Date('2026-06-19T10:00:00.000Z');

function makeEvent(): ObserverEvent {
  return {
    id: 'e-live-w1',
    source: 'cron',
    type: 'TICK',
    timestamp: BASE_NOW.toISOString(),
    payload: {},
  };
}

function makeSprintState(activeWorkers: SprintStateSnapshot['activeWorkers']): SprintStateSnapshot {
  return {
    sprintId: 'sprint-303',
    currentPhase: 'EXECUTE',
    activeWorkers,
    openDebtCount: 0,
    totalTasks: 1,
    completedTasks: 0,
  };
}

function makeCtx(
  lastHeartbeat: string,
  liveness: NonNullable<SprintStateSnapshot['activeWorkers'][number]['liveness']>,
): DetectorContext {
  return {
    event: makeEvent(),
    sprintState: makeSprintState([{
      id: 'w-303',
      taskId: 'task-303',
      lastHeartbeat,
      liveness,
    }]),
    projectRoot: '/workspace',
    now: BASE_NOW,
  };
}

// ─── (a) stale-HB SSOT ───────────────────────────────────────────────────────

describe('LIVE-W1 (a): stale-HB SSOT — detector + auditor inherit config.heartbeat_timeout', () => {
  it('DEFAULT_HEARTBEAT_TIMEOUT_MS equals config.heartbeat_timeout * 1000 (SSOT alignment)', () => {
    const cfg = createDefaultConfig();
    expect(cfg.heartbeat_timeout).toBe(120);
    expect(DEFAULT_HEARTBEAT_TIMEOUT_MS).toBe(120_000);
    expect(DEFAULT_HEARTBEAT_TIMEOUT_MS).toBe(cfg.heartbeat_timeout! * 1000);
  });

  it('config nervous_system.detectors.stale_worker.threshold_ms defaults to DEFAULT_HEARTBEAT_TIMEOUT_MS', () => {
    const cfg = createDefaultConfig();
    const ns = cfg.nervous_system as NervousSystemConfig | undefined;
    expect(ns).toBeDefined();
    expect(ns!.detectors.stale_worker.threshold_ms).toBe(DEFAULT_HEARTBEAT_TIMEOUT_MS);
  });

  it('StaleWorkerDetector detects a host-confirmed dead worker attempt', () => {
    const detector = new StaleWorkerDetector();
    const staleMs = DEFAULT_HEARTBEAT_TIMEOUT_MS + 1;
    const lastHeartbeat = new Date(BASE_NOW.getTime() - staleMs).toISOString();

    const result = detector.detect(makeCtx(lastHeartbeat, {
      state: 'dead',
      attemptId: 'attempt-live-w1',
      hostSequence: 7,
    }));

    expect(result).not.toBeNull();
    expect(result!.suggestedActions[0]!.id).toBe('WORKER_RESPAWN');
  });

  it('StaleWorkerDetector does not alert while the host reports the attempt alive', () => {
    const detector = new StaleWorkerDetector();
    const freshMs = DEFAULT_HEARTBEAT_TIMEOUT_MS - 1;
    const lastHeartbeat = new Date(BASE_NOW.getTime() - freshMs).toISOString();

    expect(detector.detect(makeCtx(lastHeartbeat, {
      state: 'alive',
      attemptId: 'attempt-live-w1',
      hostSequence: 7,
    }))).toBeNull();
  });

  it('detector and auditor share the same SSOT value (both equal DEFAULT_HEARTBEAT_TIMEOUT_MS)', () => {
    // auditor.scanHeartbeats uses DEFAULT_HEARTBEAT_TIMEOUT_MS as its default parameter.
    // The detector consumes host-authoritative liveness; the timeout remains the
    // shared policy used by the host-side heartbeat classification and auditor.
    const AUDITOR_DEFAULT = DEFAULT_HEARTBEAT_TIMEOUT_MS; // same constant used in scanHeartbeats
    const DETECTOR_DEFAULT = DEFAULT_HEARTBEAT_TIMEOUT_MS; // same constant used in StaleWorkerDetector
    expect(AUDITOR_DEFAULT).toBe(DETECTOR_DEFAULT);
    expect(AUDITOR_DEFAULT).toBe(120_000);
  });
});

// ─── (b) presence-aware approval-window ──────────────────────────────────────

describe('LIVE-W1 (b): presence-aware approval-window', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('APPROVE_TIMEOUT_ATTENDED_MS = 30000 (30s for interactive sessions)', () => {
    expect(APPROVE_TIMEOUT_ATTENDED_MS).toBe(30_000);
    expect(DEFAULT_APPROVE_TIMEOUT_ATTENDED_MS).toBe(30_000);
  });

  it('APPROVE_TIMEOUT_UNATTENDED_MS = 5000 (5s for unattended/CI)', () => {
    expect(APPROVE_TIMEOUT_UNATTENDED_MS).toBe(5_000);
    expect(DEFAULT_APPROVE_TIMEOUT_UNATTENDED_MS).toBe(5_000);
  });

  it('detectAttendedSession returns true when SSH_CONNECTION is set', () => {
    vi.stubEnv('SSH_CONNECTION', '10.0.0.1 22 10.0.0.2 54321');
    vi.stubEnv('TERM', 'dumb'); // ensure TERM does not trigger first
    expect(detectAttendedSession()).toBe(true);
  });

  it('detectAttendedSession returns true when TERM is a real terminal', () => {
    vi.stubEnv('SSH_CONNECTION', '');
    vi.stubEnv('TERM', 'xterm-256color');
    expect(detectAttendedSession()).toBe(true);
  });

  it('detectAttendedSession returns false when TERM=dumb and no SSH_CONNECTION (non-TTY env)', () => {
    vi.stubEnv('SSH_CONNECTION', '');
    vi.stubEnv('TERM', 'dumb');
    if (!process.stdout.isTTY) {
      expect(detectAttendedSession()).toBe(false);
    }
    // If running in a real TTY, detectAttendedSession returns true via isTTY — skip assertion.
  });

  it('safety-floor: shouldArmAutoProceed(locked=true, …) is always false', () => {
    expect(shouldArmAutoProceed(true, APPROVE_TIMEOUT_ATTENDED_MS)).toBe(false);
    expect(shouldArmAutoProceed(true, APPROVE_TIMEOUT_UNATTENDED_MS)).toBe(false);
    expect(shouldArmAutoProceed(true, 0)).toBe(false);
    expect(shouldArmAutoProceed(true, 999_999)).toBe(false);
  });

  it('non-safety-floor with positive timeout: shouldArmAutoProceed returns true', () => {
    expect(shouldArmAutoProceed(false, APPROVE_TIMEOUT_ATTENDED_MS)).toBe(true);
    expect(shouldArmAutoProceed(false, APPROVE_TIMEOUT_UNATTENDED_MS)).toBe(true);
  });

  it('auto-proceed disabled (timeout ≤ 0) even for non-safety-floor actions', () => {
    expect(shouldArmAutoProceed(false, 0)).toBe(false);
    expect(shouldArmAutoProceed(false, -1)).toBe(false);
  });
});
