import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  acquireSingletonLock,
  isProcessAlive,
  releaseSingletonLock,
  SingletonLockError,
} from '../../src/mcp/server-singleton-lock.js';

const IMPROBABLE_PID = 999_999_999;

describe('server-singleton-lock', () => {
  let workDir: string;
  let lockPath: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'deckent-singleton-'));
    lockPath = join(workDir, 'nested', 'mcp-server.pid');
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('Test 1 — clean acquire creates lock file with current PID', () => {
    const handle = acquireSingletonLock(lockPath);

    expect(handle.acquired).toBe(true);
    expect(handle.stolen).toBe(false);
    expect(handle.path).toBe(lockPath);
    expect(existsSync(lockPath)).toBe(true);
    expect(readFileSync(lockPath, 'utf-8').trim()).toBe(String(process.pid));

    releaseSingletonLock(handle);
  });

  it('Test 2 — refuses to acquire when a live foreign PID owns the lock', () => {
    // process.ppid is guaranteed to be alive during the test run.
    // Use acquire-then-overwrite so the parent directory exists.
    const initHandle = acquireSingletonLock(lockPath);
    releaseSingletonLock(initHandle);
    writeFileSync(lockPath, String(process.ppid));

    expect(() => acquireSingletonLock(lockPath)).toThrowError(SingletonLockError);

    try {
      acquireSingletonLock(lockPath);
    } catch (err) {
      expect(err).toBeInstanceOf(SingletonLockError);
      expect((err as SingletonLockError).ownerPid).toBe(process.ppid);
    }

    // The pre-seeded lock file must remain untouched after the rejection.
    expect(readFileSync(lockPath, 'utf-8').trim()).toBe(String(process.ppid));
  });

  it('Test 3 — stale lock from a dead PID is cleaned up and stolen', () => {
    // Pre-seed the lock file with an improbable, dead PID.
    const initHandle = acquireSingletonLock(lockPath);
    releaseSingletonLock(initHandle);
    writeFileSync(lockPath, String(IMPROBABLE_PID));

    const handle = acquireSingletonLock(lockPath);

    expect(handle.acquired).toBe(true);
    expect(handle.stolen).toBe(true);
    expect(readFileSync(lockPath, 'utf-8').trim()).toBe(String(process.pid));

    releaseSingletonLock(handle);
  });

  it('Test 4 — isProcessAlive returns true for the current process', () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });

  it('Test 5 — isProcessAlive returns true for init (pid=1) on POSIX', () => {
    // On Linux/macOS pid=1 always exists. process.kill(1, 0) raises EPERM
    // (we are not root), which the helper must treat as "alive".
    if (process.platform === 'win32') {
      // Windows has no pid=1 guarantee — skip equivalent semantics.
      expect(typeof isProcessAlive(1)).toBe('boolean');
      return;
    }
    expect(isProcessAlive(1)).toBe(true);
  });

  it('Test 6 — isProcessAlive returns false for an improbable PID', () => {
    expect(isProcessAlive(IMPROBABLE_PID)).toBe(false);
    expect(isProcessAlive(0)).toBe(false);
    expect(isProcessAlive(-1)).toBe(false);
    expect(isProcessAlive(Number.NaN)).toBe(false);
  });

  it('Test 7 — releaseSingletonLock removes the lock file when owned by us', () => {
    const handle = acquireSingletonLock(lockPath);
    expect(existsSync(lockPath)).toBe(true);

    releaseSingletonLock(handle);
    expect(existsSync(lockPath)).toBe(false);

    // Releasing twice must be a no-op (file already gone).
    expect(() => releaseSingletonLock(handle)).not.toThrow();
  });

  it('Test 8 — corrupted lock file (unparseable PID) is replaced via steal retry', () => {
    // Create the parent dir, then write a garbage lock file (no valid PID).
    const initHandle = acquireSingletonLock(lockPath);
    releaseSingletonLock(initHandle);
    writeFileSync(lockPath, '   not-a-pid   \n');

    const handle = acquireSingletonLock(lockPath);

    expect(handle.acquired).toBe(true);
    expect(handle.stolen).toBe(true);
    expect(readFileSync(lockPath, 'utf-8').trim()).toBe(String(process.pid));

    releaseSingletonLock(handle);
  });
});
