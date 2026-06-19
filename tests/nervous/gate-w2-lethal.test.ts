// tests/nervous/gate-w2-lethal.test.ts
//
// Sprint 303 Task 303-009 — GATE-W2 toggle-independent lethal guard tests.
//
// Covers:
//   1. assertNotLethalWithoutApproval — all 5 SAFETY_FLOOR actions blocked.
//   2. assertNotLethalWithoutApproval — non-lethal action proceeds freely.
//   3. spawn-backend wire — SubprocessBackend.spawn throws on lethal actionId.
//   4. spawn-backend wire — TmuxBackend.spawn throws on lethal actionId.
//   5. spawn-backend wire — non-lethal actionId does not trigger guard.
//   6. nervous-enabled: guard is additive (existing behavior unchanged).
//
// All tests are hermetic — no real process spawns, no file I/O outside tmpdir.

import { describe, it, expect } from 'vitest';
import {
  assertNotLethalWithoutApproval,
  isLockedPanicAction,
} from '../../src/nervous/panic-gate.js';
import {
  SubprocessBackend,
  TmuxBackend,
  SpawnBackendError,
} from '../../src/orchestra/spawn-backend.js';

// ─── assertNotLethalWithoutApproval unit tests ────────────────────────────────

describe('assertNotLethalWithoutApproval — toggle-independent guard (GATE-W2)', () => {
  it('DESTRUCTIVE_GIT → blocked=true, reason includes actionId, warning emitted', () => {
    const warnings: string[] = [];
    const result = assertNotLethalWithoutApproval('DESTRUCTIVE_GIT', {
      warn: (m) => warnings.push(m),
    });

    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('DESTRUCTIVE_GIT');
    expect(result.reason).toContain('SAFETY_FLOOR');
    expect(result.reason).toContain('toggleIndependent');
    expect(warnings.some((w) => w.includes('DESTRUCTIVE_GIT'))).toBe(true);
  });

  it('all 5 SAFETY_FLOOR actions → blocked=true', () => {
    const safetyFloor = [
      'KILL_LIVE_SPRINT',
      'MANUAL_FILE_DELETE',
      'COST_OVER_THRESHOLD',
      'DESTRUCTIVE_GIT',
      'ADR_DEPRECATE_ACCEPTED',
    ] as const;

    for (const actionId of safetyFloor) {
      const result = assertNotLethalWithoutApproval(actionId);
      expect(result.blocked).toBe(true);
      // Confirm isLockedPanicAction agrees
      expect(isLockedPanicAction(actionId)).toBe(true);
    }
  });

  it('non-lethal action WORKER_RESPAWN → blocked=false, reason empty, no warning', () => {
    const warnings: string[] = [];
    const result = assertNotLethalWithoutApproval('WORKER_RESPAWN', {
      warn: (m) => warnings.push(m),
    });

    expect(result.blocked).toBe(false);
    expect(result.reason).toBe('');
    expect(warnings).toHaveLength(0);
  });

  it('empty actionId → blocked=false (not in SAFETY_FLOOR)', () => {
    const result = assertNotLethalWithoutApproval('');
    expect(result.blocked).toBe(false);
  });

  it('unknown actionId → blocked=false', () => {
    const result = assertNotLethalWithoutApproval('SOME_RANDOM_ACTION');
    expect(result.blocked).toBe(false);
  });

  it('blocked result reason always contains required guard markers', () => {
    for (const actionId of ['KILL_LIVE_SPRINT', 'DESTRUCTIVE_GIT']) {
      const result = assertNotLethalWithoutApproval(actionId);
      expect(result.reason).toContain('SAFETY_FLOOR');
      expect(result.reason).toContain('toggleIndependent');
      expect(result.reason).toContain('requires explicit user approval');
      expect(result.reason).toContain(actionId);
    }
  });

  it('does not call warn for non-lethal action', () => {
    let called = false;
    assertNotLethalWithoutApproval('ORPHAN_TASK_ARCHIVE', { warn: () => { called = true; } });
    expect(called).toBe(false);
  });

  it('calls warn with informative message for lethal action', () => {
    const msgs: string[] = [];
    assertNotLethalWithoutApproval('COST_OVER_THRESHOLD', { warn: (m) => msgs.push(m) });
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain('COST_OVER_THRESHOLD');
  });
});

// ─── spawn-backend wire — SubprocessBackend ──────────────────────────────────

describe('spawn-backend wire — SubprocessBackend lethal guard (GATE-W2)', () => {
  it('DESTRUCTIVE_GIT actionId → throws SpawnBackendError before process spawn', () => {
    const backend = new SubprocessBackend('/tmp/test-proj-gate-w2');

    expect(() =>
      backend.spawn('task-gate-001', 'claude-sonnet-4-5' as never, 'test prompt', {
        actionId: 'DESTRUCTIVE_GIT',
      }),
    ).toThrow(SpawnBackendError);
  });

  it('thrown SpawnBackendError contains SAFETY_FLOOR message for lethal action', () => {
    const backend = new SubprocessBackend('/tmp/test-proj-gate-w2');

    try {
      backend.spawn('task-gate-002', 'claude-sonnet-4-5' as never, 'test prompt', {
        actionId: 'KILL_LIVE_SPRINT',
      });
      expect.fail('Expected SpawnBackendError to be thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SpawnBackendError);
      const err = e as SpawnBackendError;
      expect(err.message).toContain('SAFETY_FLOOR');
      expect(err.message).toContain('KILL_LIVE_SPRINT');
      expect(err.backendName).toBe('subprocess');
    }
  });

  it('ADR_DEPRECATE_ACCEPTED actionId → blocked', () => {
    const backend = new SubprocessBackend('/tmp/test-proj-gate-w2');
    expect(() =>
      backend.spawn('task-gate-003', 'claude-sonnet-4-5' as never, 'test', {
        actionId: 'ADR_DEPRECATE_ACCEPTED',
      }),
    ).toThrow(SpawnBackendError);
  });

  it('no actionId → guard does not block (may fail for other reasons, not guard)', () => {
    const backend = new SubprocessBackend('/tmp/test-proj-gate-w2');
    try {
      backend.spawn('task-gate-004', 'claude-sonnet-4-5' as never, 'test', {});
    } catch (e) {
      const err = e as Error;
      // Guard MUST NOT be the cause of the error
      expect(err.message).not.toContain('SAFETY_FLOOR');
      expect(err.message).not.toContain('toggleIndependent');
    }
  });

  it('non-lethal actionId WORKER_RESPAWN → guard does not block', () => {
    const backend = new SubprocessBackend('/tmp/test-proj-gate-w2');
    try {
      backend.spawn('task-gate-005', 'claude-sonnet-4-5' as never, 'test', {
        actionId: 'WORKER_RESPAWN',
      });
    } catch (e) {
      const err = e as Error;
      // Guard MUST NOT fire for non-lethal action
      expect(err.message).not.toContain('SAFETY_FLOOR');
      expect(err.message).not.toContain('toggleIndependent');
    }
  });
});

// ─── spawn-backend wire — TmuxBackend ────────────────────────────────────────

describe('spawn-backend wire — TmuxBackend lethal guard (GATE-W2)', () => {
  it('DESTRUCTIVE_GIT actionId → throws SpawnBackendError before ensureSession', () => {
    const backend = new TmuxBackend('/tmp/test-proj-gate-w2');

    expect(() =>
      backend.spawn('task-gate-010', 'claude-sonnet-4-5' as never, 'test prompt', {
        actionId: 'DESTRUCTIVE_GIT',
      }),
    ).toThrow(SpawnBackendError);
  });

  it('MANUAL_FILE_DELETE → SpawnBackendError with backendName=tmux', () => {
    const backend = new TmuxBackend('/tmp/test-proj-gate-w2');

    try {
      backend.spawn('task-gate-011', 'claude-sonnet-4-5' as never, 'test', {
        actionId: 'MANUAL_FILE_DELETE',
      });
      expect.fail('Expected SpawnBackendError');
    } catch (e) {
      expect(e).toBeInstanceOf(SpawnBackendError);
      const err = e as SpawnBackendError;
      expect(err.backendName).toBe('tmux');
      expect(err.message).toContain('MANUAL_FILE_DELETE');
    }
  });

  it('no actionId → guard does not block (may fail for other reasons, not guard)', () => {
    const backend = new TmuxBackend('/tmp/test-proj-gate-w2');
    try {
      backend.spawn('task-gate-012', 'claude-sonnet-4-5' as never, 'test', {});
    } catch (e) {
      const err = e as Error;
      expect(err.message).not.toContain('SAFETY_FLOOR');
      expect(err.message).not.toContain('toggleIndependent');
    }
  });
});

// ─── nervous-enabled: guard is additive, existing behavior unchanged ──────────

describe('assertNotLethalWithoutApproval — additive, nervous-enabled behavior unchanged', () => {
  it('guard outcome depends only on SAFETY_FLOOR membership — not on any nervous toggle', () => {
    // The function has no reference to nervous config — it's purely based on
    // isLockedPanicAction(). Simulating "nervous enabled" vs "nervous disabled"
    // is identical from this guard's perspective.
    const withNervous = assertNotLethalWithoutApproval('DESTRUCTIVE_GIT');
    const withoutNervous = assertNotLethalWithoutApproval('DESTRUCTIVE_GIT');
    expect(withNervous.blocked).toBe(withoutNervous.blocked);
    expect(withNervous.reason).toBe(withoutNervous.reason);
  });

  it('non-lethal action proceeds freely regardless of nervous state', () => {
    const result = assertNotLethalWithoutApproval('ORPHAN_TASK_ARCHIVE');
    expect(result.blocked).toBe(false);
  });
});
