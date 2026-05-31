// ═══ pid-liveness — portable isPidAlive() ═══════════════════════════
// Sprint 178 Task 4 (worker 178-006): CI flake fix — single shared
// helper supersedes the 7 ad-hoc copies of `process.kill(pid, 0)` and
// guarantees deterministic behavior across Linux/darwin/win32.

import { describe, it, expect } from 'vitest';
import { isPidAlive } from '../../src/core/pid-liveness.js';

describe('isPidAlive', () => {
  describe('input validation', () => {
    it('returns false for negative pid', () => {
      expect(isPidAlive(-1)).toBe(false);
    });

    it('returns false for zero pid', () => {
      expect(isPidAlive(0)).toBe(false);
    });

    it('returns false for NaN', () => {
      expect(isPidAlive(Number.NaN)).toBe(false);
    });

    it('returns false for Infinity', () => {
      expect(isPidAlive(Number.POSITIVE_INFINITY)).toBe(false);
    });

    it('returns false for non-integer (decimal)', () => {
      expect(isPidAlive(123.45)).toBe(false);
    });
  });

  describe('liveness detection', () => {
    it('returns true for the current process PID', () => {
      expect(isPidAlive(process.pid)).toBe(true);
    });

    it('returns false for a virtually-guaranteed-dead PID (99999999)', () => {
      // 99999999 exceeds Linux pid_max (4194304 on 64-bit) and is
      // unreachable on macOS/Windows.
      expect(isPidAlive(99999999)).toBe(false);
    });

    it('returns true for PID 1 (init) on POSIX', () => {
      if (process.platform === 'win32') return; // PID 1 is not init on Windows
      // PID 1 always exists on Linux/macOS — even if we don't own it (EPERM
      // is treated as "alive but not ours").
      expect(isPidAlive(1)).toBe(true);
    });
  });

  describe('determinism', () => {
    it('returns the same answer for repeated calls with the same PID', () => {
      const pid = process.pid;
      const first = isPidAlive(pid);
      const second = isPidAlive(pid);
      const third = isPidAlive(pid);
      expect(first).toBe(true);
      expect(second).toBe(true);
      expect(third).toBe(true);
    });

    it('does not throw on any input', () => {
      expect(() => isPidAlive(-1)).not.toThrow();
      expect(() => isPidAlive(0)).not.toThrow();
      expect(() => isPidAlive(99999999)).not.toThrow();
      expect(() => isPidAlive(Number.NaN)).not.toThrow();
    });
  });
});
