import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  acquireLock,
  LockError,
} from '../../src/agents/worker.js';
import type { LockInfo } from '../../src/core/types.js';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  unlinkSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  openSync: vi.fn(() => 42),
  closeSync: vi.fn(),
  constants: { O_WRONLY: 1, O_CREAT: 64, O_EXCL: 128 },
}));

import { readFileSync, writeFileSync, existsSync, openSync, closeSync, constants as fsConstants } from 'node:fs';

const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedExistsSync = vi.mocked(existsSync);
const mockedOpenSync = vi.mocked(openSync);
const mockedCloseSync = vi.mocked(closeSync);

beforeEach(() => {
  vi.clearAllMocks();
  mockedExistsSync.mockReturnValue(false);
});

describe('acquireLock atomicity', () => {
  it('uses openSync with O_EXCL flag for atomic lock creation', () => {
    mockedExistsSync.mockReturnValue(false);
    mockedOpenSync.mockReturnValue(42 as never);

    acquireLock('/project', 'src/file.ts', 'w1', 'task-001');

    expect(mockedOpenSync).toHaveBeenCalledTimes(1);
    const [, flags] = mockedOpenSync.mock.calls[0]!;
    // O_WRONLY | O_CREAT | O_EXCL = 1 | 64 | 128 = 193
    expect(flags).toBe(fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL);
  });

  it('writes lock content to the file descriptor and closes it', () => {
    mockedExistsSync.mockReturnValue(false);
    mockedOpenSync.mockReturnValue(42 as never);

    const lock = acquireLock('/project', 'src/file.ts', 'w1', 'task-001');

    // writeFileSync should be called with the fd (42) and the lock JSON
    expect(mockedWriteFileSync).toHaveBeenCalledWith(42, expect.any(String), 'utf-8');
    const writtenData = JSON.parse(mockedWriteFileSync.mock.calls[0]![1] as string) as LockInfo;
    expect(writtenData.filePath).toBe('src/file.ts');
    expect(writtenData.ownerWorkerId).toBe('w1');
    expect(writtenData.taskId).toBe('task-001');

    // closeSync should be called with the fd
    expect(mockedCloseSync).toHaveBeenCalledWith(42);

    // Return value should match
    expect(lock.filePath).toBe('src/file.ts');
    expect(lock.ownerWorkerId).toBe('w1');
  });

  it('throws LockError when EEXIST occurs (race condition)', () => {
    mockedExistsSync.mockReturnValue(false);

    // Simulate O_EXCL failure — another process created the file first
    const eexistError = new Error('EEXIST') as NodeJS.ErrnoException;
    eexistError.code = 'EEXIST';
    mockedOpenSync.mockImplementation(() => { throw eexistError; });

    // When re-reading, provide the other worker's lock
    mockedReadFileSync.mockReturnValue(JSON.stringify({
      filePath: 'src/file.ts',
      ownerWorkerId: 'w2',
      acquiredAt: new Date().toISOString(),
      taskId: 'task-002',
    }) as never);

    expect(() => acquireLock('/project', 'src/file.ts', 'w1', 'task-001')).toThrow(LockError);
    try {
      acquireLock('/project', 'src/file.ts', 'w1', 'task-001');
    } catch (err) {
      expect(err).toBeInstanceOf(LockError);
      expect((err as LockError).message).toContain('locked by w2');
    }
  });

  it('throws LockError with generic message when re-read fails after EEXIST', () => {
    mockedExistsSync.mockReturnValue(false);

    const eexistError = new Error('EEXIST') as NodeJS.ErrnoException;
    eexistError.code = 'EEXIST';
    mockedOpenSync.mockImplementation(() => { throw eexistError; });

    // Re-read also fails (corrupted lock)
    mockedReadFileSync.mockImplementation(() => { throw new Error('read failed'); });

    expect(() => acquireLock('/project', 'src/file.ts', 'w1', 'task-001')).toThrow(LockError);
    try {
      acquireLock('/project', 'src/file.ts', 'w1', 'task-001');
    } catch (err) {
      expect((err as LockError).message).toContain('locked by another worker');
    }
  });

  it('idempotent re-lock by same worker returns existing lock without O_EXCL', () => {
    const existingLock: LockInfo = {
      filePath: 'src/file.ts',
      ownerWorkerId: 'w1',
      acquiredAt: new Date().toISOString(),
      taskId: 'task-001',
    };

    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify(existingLock) as never);

    const result = acquireLock('/project', 'src/file.ts', 'w1', 'task-001');

    // Should return existing lock without calling openSync (no new file creation)
    expect(result).toEqual(existingLock);
    expect(mockedOpenSync).not.toHaveBeenCalled();
    expect(mockedWriteFileSync).not.toHaveBeenCalled();
  });

  it('throws LockError when existing lock is owned by different worker', () => {
    const existingLock: LockInfo = {
      filePath: 'src/file.ts',
      ownerWorkerId: 'w2',
      acquiredAt: new Date().toISOString(),
      taskId: 'task-002',
    };

    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify(existingLock) as never);

    expect(() => acquireLock('/project', 'src/file.ts', 'w1', 'task-001')).toThrow(LockError);
  });
});
