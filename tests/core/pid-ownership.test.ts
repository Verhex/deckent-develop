/**
 * pid-ownership — pid-reuse catastrophe guard (§4G / B2).
 *
 * isPidAlive only proves SOME process holds the pid, NOT that it is the one we
 * recorded. If a sprint died and the OS reused its pid for an unrelated process,
 * a stale pid file + a liveness-only check would SIGKILL that foreign process.
 * verifyPidOwnership compares a stored process-start token against the live one:
 * differ → 'reused' (refuse to signal). This is the zero-tolerance guard.
 */

import { describe, it, expect } from 'vitest';
import { verifyPidOwnership } from '../../src/core/pid-ownership.js';

describe('verifyPidOwnership', () => {
  it('alive + matching start token → owned', () => {
    const status = verifyPidOwnership(
      { pid: 1234, startToken: 'T-100' },
      { isAlive: () => true, startToken: () => 'T-100' },
    );
    expect(status).toBe('owned');
  });

  it('🔴 alive + DIFFERENT start token → reused (pid was recycled; must NOT signal)', () => {
    const status = verifyPidOwnership(
      { pid: 1234, startToken: 'T-100' },
      { isAlive: () => true, startToken: () => 'T-999' }, // OS reused the pid
    );
    expect(status).toBe('reused');
  });

  it('dead process → dead (nothing to kill)', () => {
    const status = verifyPidOwnership(
      { pid: 1234, startToken: 'T-100' },
      { isAlive: () => false, startToken: () => null },
    );
    expect(status).toBe('dead');
  });

  it('alive but no stored token (old pid file) → unknown (cannot prove ownership)', () => {
    const status = verifyPidOwnership(
      { pid: 1234 },
      { isAlive: () => true, startToken: () => 'T-1' },
    );
    expect(status).toBe('unknown');
  });

  it('alive, stored token present but live token unreadable → unknown (no false reuse)', () => {
    const status = verifyPidOwnership(
      { pid: 1234, startToken: 'T-100' },
      { isAlive: () => true, startToken: () => null },
    );
    expect(status).toBe('unknown');
  });

  it('null record → dead', () => {
    expect(verifyPidOwnership(null, { isAlive: () => true, startToken: () => 'x' })).toBe('dead');
  });
});
