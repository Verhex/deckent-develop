import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => {
  const store = new Map<string, string>();
  return {
    readFileSync: vi.fn((path: string) => {
      if (!store.has(path)) throw new Error('ENOENT');
      return store.get(path)!;
    }),
    writeFileSync: vi.fn((path: string, data: string) => {
      store.set(path, data);
    }),
    existsSync: vi.fn((path: string) => store.has(path)),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(() => []),
    unlinkSync: vi.fn((path: string) => {
      store.delete(path);
    }),
    openSync: vi.fn(),
    closeSync: vi.fn(),
    fsyncSync: vi.fn(),
    renameSync: vi.fn(),
    fstatSync: vi.fn(() => ({ size: 0 })),
    realpathSync: vi.fn((p: string) => p),
  };
});

vi.mock('../../src/orchestra/authority-enforcer.js', () => ({
  checkAuthority: vi.fn(() => ({ allowed: true })),
  emitAuthorityViolation: vi.fn(),
}));

vi.mock('../../src/orchestra/event-stream.js', () => ({
  writeEvent: vi.fn(),
  getCurrentSprintId: vi.fn(() => null),
  CHANNELS: {},
}));

vi.mock('../../src/agents/worker-lifecycle.js', () => ({
  atomicWriteFileSync: vi.fn((path: string, data: string) => {
    const { writeFileSync } = require('node:fs');
    writeFileSync(path, data);
  }),
  finalizeHeartbeatOnShutdown: vi.fn(),
}));

vi.mock('../../src/agents/worker-rollback.js', () => ({
  snapshotWorkerScope: vi.fn(() => 'stash@{0}'),
  writeStashRef: vi.fn(),
  rollbackWorkerScope: vi.fn(),
  dropWorkerSnapshot: vi.fn(),
  readStashRef: vi.fn(() => null),
  clearStashRef: vi.fn(),
}));

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { getSharedMemory, SharedMemory } from '../../src/agents/worker.js';

const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedExistsSync = vi.mocked(existsSync);

let fileStore: Map<string, string>;

beforeEach(() => {
  vi.clearAllMocks();
  fileStore = new Map();

  mockedReadFileSync.mockImplementation((path: any) => {
    const p = String(path);
    if (!fileStore.has(p)) throw new Error('ENOENT');
    return fileStore.get(p)! as any;
  });
  mockedWriteFileSync.mockImplementation((path: any, data: any) => {
    fileStore.set(String(path), String(data));
  });
  mockedExistsSync.mockImplementation((path: any) => {
    return fileStore.has(String(path)) as any;
  });
});

describe('shared-memory worker wire', () => {
  describe('getSharedMemory', () => {
    it('returns a SharedMemory instance from worker context', () => {
      const mem = getSharedMemory('/project-a');
      expect(mem).toBeInstanceOf(SharedMemory);
    });

    it('worker writes and reads shared-memory via getSharedMemory', () => {
      const mem = getSharedMemory('/project-a');
      mem.write('api-url', 'http://localhost:4000', 'w-230-001');
      const result = mem.read('api-url');
      expect(result).not.toBeNull();
      expect(result!.value).toBe('http://localhost:4000');
      expect(result!.writerId).toBe('w-230-001');
    });

    it('isolation per sprint — different projectRoots do not share memory', () => {
      const memA = getSharedMemory('/sprint-a');
      const memB = getSharedMemory('/sprint-b');
      memA.write('shared-key', 'value-from-a', 'w-a');
      // sprint-b should not see sprint-a's value
      expect(memB.read('shared-key')).toBeNull();
    });

    it('graceful — absent key returns null (no crash)', () => {
      const mem = getSharedMemory('/project-graceful');
      const result = mem.read('nonexistent-key');
      expect(result).toBeNull();
    });
  });
});
