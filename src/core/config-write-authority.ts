import { randomUUID } from 'node:crypto';
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';

const LOCK_STALE_AFTER_MS = 15_000;
const LOCK_RETRY_DELAY_MS = 50;
const LOCK_MAX_ATTEMPTS = 40;

interface ConfigWriteLockOwner {
  pid: number;
  startedAt: string;
}

export class ConfigWriteLockTimeoutError extends Error {
  override readonly name = 'ConfigWriteLockTimeoutError';

  constructor(targetPath: string) {
    super(`Timed out waiting for the config write lock: ${targetPath}`);
  }
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function sleepSync(milliseconds: number): void {
  const signal = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
  Atomics.wait(signal, 0, 0, milliseconds);
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    return isErrnoException(error) && error.code === 'EPERM';
  }
}

function readLockOwner(lockPath: string): ConfigWriteLockOwner | null {
  try {
    const value = JSON.parse(
      readFileSync(join(lockPath, 'owner.json'), 'utf8'),
    ) as Partial<ConfigWriteLockOwner>;
    if (typeof value.pid !== 'number' || typeof value.startedAt !== 'string') {
      return null;
    }
    return { pid: value.pid, startedAt: value.startedAt };
  } catch {
    return null;
  }
}

function tryTakeOverStaleLock(lockPath: string): boolean {
  try {
    const ageMs = Date.now() - statSync(lockPath).mtimeMs;
    const owner = readLockOwner(lockPath);
    if (ageMs <= LOCK_STALE_AFTER_MS || owner === null || isProcessAlive(owner.pid)) {
      return false;
    }

    const retiredPath = `${lockPath}.stale.${process.pid}.${randomUUID()}`;
    renameSync(lockPath, retiredPath);
    rmSync(retiredPath, { recursive: true, force: true });
    return true;
  } catch (error: unknown) {
    if (isErrnoException(error) && (error.code === 'ENOENT' || error.code === 'EEXIST')) {
      return true;
    }
    return false;
  }
}

function acquireConfigWriteLock(lockPath: string): void {
  for (let attempt = 0; attempt < LOCK_MAX_ATTEMPTS; attempt += 1) {
    try {
      mkdirSync(lockPath);
      try {
        const owner: ConfigWriteLockOwner = {
          pid: process.pid,
          startedAt: new Date().toISOString(),
        };
        writeFileSync(
          join(lockPath, 'owner.json'),
          `${JSON.stringify(owner, null, 2)}\n`,
          { mode: 0o600 },
        );
        return;
      } catch (error: unknown) {
        rmSync(lockPath, { recursive: true, force: true });
        throw error;
      }
    } catch (error: unknown) {
      if (!isErrnoException(error) || error.code !== 'EEXIST') throw error;
    }

    if (tryTakeOverStaleLock(lockPath)) continue;
    if (attempt + 1 < LOCK_MAX_ATTEMPTS) sleepSync(LOCK_RETRY_DELAY_MS);
  }
  throw new ConfigWriteLockTimeoutError(lockPath.slice(0, -'.lock'.length));
}

/** Run a synchronous config mutation while holding a process-coordinated lock. */
export function withConfigWriteLock<T>(targetPath: string, fn: () => T): T {
  const lockPath = `${targetPath}.lock`;
  acquireConfigWriteLock(lockPath);
  try {
    return fn();
  } finally {
    rmSync(lockPath, { recursive: true, force: true });
  }
}

function fsyncDirectory(directoryPath: string): void {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(directoryPath, 'r');
    fsyncSync(descriptor);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`CONFIG_DIR_FSYNC_SKIPPED: ${directoryPath}: ${detail}`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

/** Durably replace a JSON config without exposing a partially written file. */
export function writeConfigJsonAtomic(targetPath: string, payload: unknown): void {
  const directoryPath = dirname(targetPath);
  const shortId = randomUUID().replaceAll('-', '').slice(0, 12);
  const temporaryPath = join(
    directoryPath,
    `.${basename(targetPath)}.${process.pid}.${shortId}.tmp`,
  );
  let descriptor: number | undefined;

  try {
    writeFileSync(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, {
      mode: 0o600,
    });
    descriptor = openSync(temporaryPath, 'r');
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporaryPath, targetPath);
  } catch (error: unknown) {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // Preserve the original write error.
      }
    }
    try {
      unlinkSync(temporaryPath);
    } catch (cleanupError: unknown) {
      if (!isErrnoException(cleanupError) || cleanupError.code !== 'ENOENT') {
        // Cleanup is best-effort; the original error remains authoritative.
      }
    }
    throw error;
  }

  fsyncDirectory(directoryPath);
}
