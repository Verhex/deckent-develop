import { Worker } from 'node:worker_threads';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    fsyncSync: vi.fn(actual.fsyncSync),
    openSync: vi.fn(actual.openSync),
    renameSync: vi.fn(actual.renameSync),
  };
});

import { fsyncSync, openSync, renameSync } from 'node:fs';
import {
  ConfigWriteLockTimeoutError,
  withConfigWriteLock,
  writeConfigJsonAtomic,
} from '../../src/core/config-write-authority.js';

const mockedRenameSync = vi.mocked(renameSync);
const mockedOpenSync = vi.mocked(openSync);
const mockedFsyncSync = vi.mocked(fsyncSync);
let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'config-write-authority-'));
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

function temporaryArtifacts(): string[] {
  return readdirSync(root).filter((entry) => entry.endsWith('.tmp'));
}

describe('writeConfigJsonAtomic', () => {
  it('publishes the exact formatted JSON and leaves no temporary artifact', () => {
    const target = join(root, 'custom-name.json');
    const payload = { enabled: true, nested: { count: 3 } };

    writeConfigJsonAtomic(target, payload);

    expect(readFileSync(target, 'utf8')).toBe(
      `${JSON.stringify(payload, null, 2)}\n`,
    );
    expect(temporaryArtifacts()).toEqual([]);
  });

  it('opens the temporary file as r+ and fsyncs that descriptor before publication', () => {
    const target = join(root, 'windows-flush-file-buffers.json');

    writeConfigJsonAtomic(target, { durable: true });

    const temporaryOpenIndex = mockedOpenSync.mock.calls.findIndex(
      ([path]) => typeof path === 'string' && path.endsWith('.tmp'),
    );
    expect(temporaryOpenIndex).toBeGreaterThanOrEqual(0);
    expect(mockedOpenSync.mock.calls[temporaryOpenIndex]?.[1]).toBe('r+');

    const temporaryDescriptor = mockedOpenSync.mock.results[temporaryOpenIndex]?.value;
    expect(typeof temporaryDescriptor).toBe('number');
    expect(mockedFsyncSync).toHaveBeenCalledWith(temporaryDescriptor);
    expect(mockedFsyncSync.mock.invocationCallOrder[0]).toBeLessThan(
      mockedRenameSync.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(readFileSync(target, 'utf8')).toBe('{\n  "durable": true\n}\n');
  });

  it('creates the published config with mode 0600 on POSIX', () => {
    const target = join(root, 'permissions.json');

    writeConfigJsonAtomic(target, { secret: 'value' });

    if (process.platform === 'win32') {
      expect(statSync(target).isFile()).toBe(true); // Windows ignores POSIX mode bits.
    } else {
      expect(statSync(target).mode & 0o777).toBe(0o600);
    }
  });

  it('removes the temporary file and rethrows when publication fails', () => {
    const target = join(root, 'failure.json');
    mockedRenameSync.mockImplementationOnce(() => {
      throw new Error('simulated rename failure');
    });

    expect(() => writeConfigJsonAtomic(target, { value: 1 })).toThrow(
      'simulated rename failure',
    );
    expect(temporaryArtifacts()).toEqual([]);
  });

  it('never exposes partial JSON to a parallel reader of a large replacement', () => {
    const target = join(root, 'atomic.json');
    const oldText = `${JSON.stringify({ generation: 'old' }, null, 2)}\n`;
    const payload = { generation: 'new', data: 'x'.repeat(8_000_000) };
    const newText = `${JSON.stringify(payload, null, 2)}\n`;
    writeFileSync(target, oldText);
    const state = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 3);
    const flags = new Int32Array(state);
    const worker = new Worker(
      `const { readFileSync } = require('node:fs');
       const { workerData } = require('node:worker_threads');
       const flags = new Int32Array(workerData.state);
       Atomics.store(flags, 0, 1); Atomics.notify(flags, 0);
       while (Atomics.load(flags, 1) === 0) {
         try {
           const text = readFileSync(workerData.target, 'utf8');
           if (text !== workerData.oldText && text !== workerData.newText) {
             Atomics.store(flags, 2, 1);
           }
         } catch { Atomics.store(flags, 2, 1); }
       }
       Atomics.store(flags, 0, 2); Atomics.notify(flags, 0);`,
      { eval: true, workerData: { state, target, oldText, newText } },
    );
    try {
      Atomics.wait(flags, 0, 0, 2_000);
      expect(Atomics.load(flags, 0)).toBe(1);

      writeConfigJsonAtomic(target, payload);
      Atomics.store(flags, 1, 1);
      Atomics.wait(flags, 0, 1, 2_000);

      expect(Atomics.load(flags, 2)).toBe(0);
      expect(readFileSync(target, 'utf8')).toBe(newText);
    } finally {
      void worker.terminate();
    }
  });
});

describe('withConfigWriteLock', () => {
  it('releases one owner before the next acquisition proceeds', () => {
    const target = join(root, 'serial.json');
    const order: string[] = [];

    withConfigWriteLock(target, () => order.push('first'));
    withConfigWriteLock(target, () => order.push('second'));

    expect(order).toEqual(['first', 'second']);
    expect(statSync(root).isDirectory()).toBe(true);
    expect(readdirSync(root)).not.toContain('serial.json.lock');
  });

  it('takes over a stale lock whose owner pid is dead', () => {
    const target = join(root, 'stale.json');
    const lockPath = `${target}.lock`;
    mkdirSync(lockPath);
    writeFileSync(
      join(lockPath, 'owner.json'),
      JSON.stringify({ pid: 2_147_483_647, startedAt: '2000-01-01T00:00:00.000Z' }),
    );
    const staleTime = new Date(Date.now() - 16_000);
    utimesSync(lockPath, staleTime, staleTime);

    const result = withConfigWriteLock(target, () => 'acquired');

    expect(result).toBe('acquired');
    expect(readdirSync(root)).not.toContain('stale.json.lock');
  });

  it('times out with the typed error while a live owner holds the lock', () => {
    const target = join(root, 'live.json');
    const lockPath = `${target}.lock`;
    mkdirSync(lockPath);
    writeFileSync(
      join(lockPath, 'owner.json'),
      JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
    );

    expect(() => withConfigWriteLock(target, () => undefined)).toThrow(
      ConfigWriteLockTimeoutError,
    );
  });
});
