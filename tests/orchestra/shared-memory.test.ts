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
  };
});

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { SharedMemory } from '../../src/orchestra/shared-memory.js';

const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedExistsSync = vi.mocked(existsSync);
const mockedReaddirSync = vi.mocked(readdirSync);
const mockedUnlinkSync = vi.mocked(unlinkSync);

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
  mockedReaddirSync.mockImplementation((_path: any) => {
    const dir = String(_path);
    const entries: string[] = [];
    for (const key of fileStore.keys()) {
      if (key.startsWith(dir + '/')) {
        const relative = key.slice(dir.length + 1);
        if (!relative.includes('/')) {
          entries.push(relative);
        }
      }
    }
    return entries as any;
  });
  mockedUnlinkSync.mockImplementation((path: any) => {
    fileStore.delete(String(path));
  });
});

describe('SharedMemory', () => {
  const projectRoot = '/test-project';

  describe('write', () => {
    it('writes a value under a key', () => {
      const mem = new SharedMemory(projectRoot);
      mem.write('api-url', 'http://localhost:3000', 'worker-1');
      expect(mockedWriteFileSync).toHaveBeenCalled();
    });

    it('throws on empty key', () => {
      const mem = new SharedMemory(projectRoot);
      expect(() => mem.write('', 'value', 'w1')).toThrow(/key must be a non-empty string/);
    });

    it('throws on empty writerId', () => {
      const mem = new SharedMemory(projectRoot);
      expect(() => mem.write('key', 'value', '')).toThrow(/writerId must be a non-empty string/);
    });

    it('stores complex objects', () => {
      const mem = new SharedMemory(projectRoot);
      mem.write('config', { port: 3000, debug: true }, 'worker-2');
      const result = mem.read('config');
      expect(result).not.toBeNull();
      expect(result!.value).toEqual({ port: 3000, debug: true });
    });

    it('overwrites existing key', () => {
      const mem = new SharedMemory(projectRoot);
      mem.write('key', 'first', 'w1');
      mem.write('key', 'second', 'w2');
      const result = mem.read('key');
      expect(result!.value).toBe('second');
      expect(result!.writerId).toBe('w2');
    });
  });

  describe('read', () => {
    it('returns null for non-existent key', () => {
      const mem = new SharedMemory(projectRoot);
      expect(mem.read('nope')).toBeNull();
    });

    it('returns value, writerId, and writtenAt', () => {
      const mem = new SharedMemory(projectRoot);
      mem.write('test-key', 42, 'agent-x');
      const result = mem.read('test-key');
      expect(result).not.toBeNull();
      expect(result!.value).toBe(42);
      expect(result!.writerId).toBe('agent-x');
      expect(typeof result!.writtenAt).toBe('string');
    });

    it('returns null for expired entry', () => {
      const mem = new SharedMemory(projectRoot, 1); // 1ms TTL
      mem.write('ephemeral', 'data', 'w1');
      // Manually set writtenAt to the past
      const key = 'ephemeral';
      const filePath = `/test-project/.tasks/shared/${key}.json`;
      const existing = JSON.parse(fileStore.get(filePath) ?? '{}');
      existing.writtenAt = new Date(Date.now() - 1000).toISOString();
      fileStore.set(filePath, JSON.stringify(existing));
      expect(mem.read('ephemeral')).toBeNull();
    });
  });

  describe('listKeys', () => {
    it('returns empty array when no shared dir', () => {
      const mem = new SharedMemory(projectRoot);
      expect(mem.listKeys()).toEqual([]);
    });

    it('lists written keys', () => {
      const mem = new SharedMemory(projectRoot);
      // Mark the shared dir as existing
      fileStore.set('/test-project/.tasks/shared', '');
      mockedExistsSync.mockImplementation((path: any) => {
        const p = String(path);
        return (fileStore.has(p) || p === '/test-project/.tasks/shared') as any;
      });
      mem.write('alpha', 1, 'w1');
      mem.write('beta', 2, 'w2');
      const keys = mem.listKeys();
      expect(keys).toContain('alpha');
      expect(keys).toContain('beta');
    });
  });

  describe('isExpired', () => {
    it('returns true for non-existent key', () => {
      const mem = new SharedMemory(projectRoot);
      expect(mem.isExpired('missing')).toBe(true);
    });

    it('returns false when no TTL is set', () => {
      const mem = new SharedMemory(projectRoot);
      mem.write('permanent', 'data', 'w1');
      expect(mem.isExpired('permanent')).toBe(false);
    });

    it('returns true for expired entry with TTL', () => {
      const mem = new SharedMemory(projectRoot, 100);
      mem.write('temp', 'data', 'w1');
      const filePath = '/test-project/.tasks/shared/temp.json';
      const existing = JSON.parse(fileStore.get(filePath) ?? '{}');
      existing.writtenAt = new Date(Date.now() - 200).toISOString();
      fileStore.set(filePath, JSON.stringify(existing));
      expect(mem.isExpired('temp')).toBe(true);
    });

    it('returns false for non-expired entry with TTL', () => {
      const mem = new SharedMemory(projectRoot, 60000);
      mem.write('fresh', 'data', 'w1');
      expect(mem.isExpired('fresh')).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('returns 0 when no shared dir', () => {
      const mem = new SharedMemory(projectRoot);
      expect(mem.cleanup()).toBe(0);
    });

    it('removes expired entries', () => {
      const mem = new SharedMemory(projectRoot, 100);
      // Write an entry and mark it as expired
      mem.write('old', 'data', 'w1');
      const filePath = '/test-project/.tasks/shared/old.json';
      const existing = JSON.parse(fileStore.get(filePath) ?? '{}');
      existing.writtenAt = new Date(Date.now() - 200).toISOString();
      fileStore.set(filePath, JSON.stringify(existing));

      mockedExistsSync.mockImplementation((path: any) => {
        const p = String(path);
        return (fileStore.has(p) || p === '/test-project/.tasks/shared') as any;
      });

      const removed = mem.cleanup();
      expect(removed).toBe(1);
    });

    it('does not remove non-expired entries', () => {
      const mem = new SharedMemory(projectRoot, 60000);
      mem.write('fresh', 'data', 'w1');
      mockedExistsSync.mockImplementation((path: any) => {
        const p = String(path);
        return (fileStore.has(p) || p === '/test-project/.tasks/shared') as any;
      });
      const removed = mem.cleanup();
      expect(removed).toBe(0);
    });
  });
});
