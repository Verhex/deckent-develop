/**
 * MCP server singleton guard — Sprint 161 T-006 (double-MCP race fix).
 *
 * Public surface: `acquireSingletonLock`, `releaseSingletonLock`,
 * `isProcessAlive`, `SingletonLockError`. `acquireSingletonLock` uses
 * `openSync(path, 'wx')` (O_EXCL) so two MCP processes racing to create
 * the same `.deckent/mcp-server.pid` file cannot both win; the loser
 * resolves via owner-pid liveness check (`isProcessAlive`).
 */
import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';

export interface LockHandle {
  path: string;
  acquired: boolean;
  stolen: boolean;
}

export class SingletonLockError extends Error {
  readonly ownerPid: number | null;

  constructor(message: string, ownerPid: number | null) {
    super(message);
    this.name = 'SingletonLockError';
    this.ownerPid = ownerPid;
  }
}

export function isProcessAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EPERM') {
      return true;
    }
    return false;
  }
}

function readOwnerPid(path: string): number | null {
  try {
    const raw = readFileSync(path, 'utf-8').trim();
    if (raw.length === 0) return null;
    const pid = Number.parseInt(raw, 10);
    if (!Number.isFinite(pid) || pid <= 0) return null;
    return pid;
  } catch {
    return null;
  }
}

function writePidFile(path: string): void {
  const fd = openSync(path, 'wx');
  try {
    writeSync(fd, String(process.pid));
  } finally {
    closeSync(fd);
  }
}

export function acquireSingletonLock(path: string): LockHandle {
  mkdirSync(dirname(path), { recursive: true });

  try {
    writePidFile(path);
    return { path, acquired: true, stolen: false };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'EEXIST') {
      throw err;
    }
  }

  const ownerPid = readOwnerPid(path);

  if (ownerPid !== null && isProcessAlive(ownerPid) && ownerPid !== process.pid) {
    throw new SingletonLockError(
      `MCP singleton lock held by live process (pid=${ownerPid}, lock=${path})`,
      ownerPid,
    );
  }

  if (ownerPid === process.pid) {
    return { path, acquired: true, stolen: false };
  }

  try {
    unlinkSync(path);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') throw err;
  }

  try {
    writePidFile(path);
    return { path, acquired: true, stolen: true };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EEXIST') {
      const racer = readOwnerPid(path);
      throw new SingletonLockError(
        `MCP singleton lock race lost during steal retry (lock=${path})`,
        racer,
      );
    }
    throw err;
  }
}

export function releaseSingletonLock(handle: LockHandle): void {
  if (!handle.acquired) return;
  const ownerPid = readOwnerPid(handle.path);
  if (ownerPid !== null && ownerPid !== process.pid) {
    return;
  }
  try {
    unlinkSync(handle.path);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') throw err;
  }
}
