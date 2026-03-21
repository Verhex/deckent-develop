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
  };
});

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { HandoffProtocol } from '../../src/orchestra/handoff-protocol.js';

const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedExistsSync = vi.mocked(existsSync);
const mockedReaddirSync = vi.mocked(readdirSync);

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
});

describe('HandoffProtocol', () => {
  const projectRoot = '/test-project';

  describe('createHandoff', () => {
    it('creates a handoff with pending status', () => {
      const hp = new HandoffProtocol(projectRoot);
      const handoff = hp.createHandoff('task-1', 'task-2', ['src/api.ts']);
      expect(handoff.id).toBe('task-1-to-task-2');
      expect(handoff.fromTaskId).toBe('task-1');
      expect(handoff.toTaskId).toBe('task-2');
      expect(handoff.status).toBe('pending');
      expect(handoff.artifacts).toEqual(['src/api.ts']);
      expect(typeof handoff.createdAt).toBe('string');
    });

    it('throws on empty fromTaskId', () => {
      const hp = new HandoffProtocol(projectRoot);
      expect(() => hp.createHandoff('', 'task-2', ['a.ts'])).toThrow(/fromTaskId and toTaskId are required/);
    });

    it('throws on empty toTaskId', () => {
      const hp = new HandoffProtocol(projectRoot);
      expect(() => hp.createHandoff('task-1', '', ['a.ts'])).toThrow(/fromTaskId and toTaskId are required/);
    });

    it('throws on empty artifacts', () => {
      const hp = new HandoffProtocol(projectRoot);
      expect(() => hp.createHandoff('task-1', 'task-2', [])).toThrow(/artifacts must be a non-empty array/);
    });

    it('persists to file', () => {
      const hp = new HandoffProtocol(projectRoot);
      hp.createHandoff('task-1', 'task-2', ['src/a.ts']);
      expect(mockedWriteFileSync).toHaveBeenCalled();
    });
  });

  describe('executeHandoff', () => {
    it('returns success when all artifacts exist', () => {
      const hp = new HandoffProtocol(projectRoot);
      hp.createHandoff('t1', 't2', ['src/output.ts']);
      // Simulate artifact existing
      fileStore.set('/test-project/src/output.ts', 'content');
      const result = hp.executeHandoff('t1-to-t2');
      expect(result.success).toBe(true);
      expect(result.missingArtifacts).toEqual([]);
    });

    it('returns failure with missing artifacts', () => {
      const hp = new HandoffProtocol(projectRoot);
      hp.createHandoff('t1', 't2', ['src/missing.ts']);
      const result = hp.executeHandoff('t1-to-t2');
      expect(result.success).toBe(false);
      expect(result.missingArtifacts).toContain('src/missing.ts');
    });

    it('returns failure for unknown handoff', () => {
      const hp = new HandoffProtocol(projectRoot);
      const result = hp.executeHandoff('nonexistent');
      expect(result.success).toBe(false);
    });

    it('marks handoff as ready on success', () => {
      const hp = new HandoffProtocol(projectRoot);
      hp.createHandoff('t1', 't2', ['src/api.ts']);
      fileStore.set('/test-project/src/api.ts', 'content');
      hp.executeHandoff('t1-to-t2');
      // Re-read the handoff
      const filePath = '/test-project/.tasks/handoffs/t1-to-t2.json';
      const stored = JSON.parse(fileStore.get(filePath) ?? '{}');
      expect(stored.status).toBe('ready');
    });

    it('returns failure for failed handoff', () => {
      const hp = new HandoffProtocol(projectRoot);
      hp.createHandoff('t1', 't2', ['src/a.ts']);
      hp.failHandoff('t1-to-t2', 'build error');
      const result = hp.executeHandoff('t1-to-t2');
      expect(result.success).toBe(false);
    });
  });

  describe('failHandoff', () => {
    it('marks handoff as failed with reason', () => {
      const hp = new HandoffProtocol(projectRoot);
      hp.createHandoff('t1', 't2', ['src/a.ts']);
      hp.failHandoff('t1-to-t2', 'compile error');
      const filePath = '/test-project/.tasks/handoffs/t1-to-t2.json';
      const stored = JSON.parse(fileStore.get(filePath) ?? '{}');
      expect(stored.status).toBe('failed');
      expect(stored.failReason).toBe('compile error');
    });

    it('throws for unknown handoff', () => {
      const hp = new HandoffProtocol(projectRoot);
      expect(() => hp.failHandoff('nonexistent', 'reason')).toThrow(/not found/);
    });
  });

  describe('listHandoffs', () => {
    it('returns empty array when no handoffs dir', () => {
      const hp = new HandoffProtocol(projectRoot);
      expect(hp.listHandoffs()).toEqual([]);
    });

    it('lists created handoffs', () => {
      const hp = new HandoffProtocol(projectRoot);
      // Mark the handoffs dir as existing
      mockedExistsSync.mockImplementation((path: any) => {
        const p = String(path);
        return (fileStore.has(p) || p === '/test-project/.tasks/handoffs') as any;
      });
      hp.createHandoff('t1', 't2', ['a.ts']);
      hp.createHandoff('t3', 't4', ['b.ts']);
      const list = hp.listHandoffs();
      expect(list).toHaveLength(2);
    });

    it('sorts handoffs by id', () => {
      const hp = new HandoffProtocol(projectRoot);
      mockedExistsSync.mockImplementation((path: any) => {
        const p = String(path);
        return (fileStore.has(p) || p === '/test-project/.tasks/handoffs') as any;
      });
      hp.createHandoff('b', 'c', ['a.ts']);
      hp.createHandoff('a', 'b', ['a.ts']);
      const list = hp.listHandoffs();
      expect(list[0]!.id).toBe('a-to-b');
      expect(list[1]!.id).toBe('b-to-c');
    });
  });
});
