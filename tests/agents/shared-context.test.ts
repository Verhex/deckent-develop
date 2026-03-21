import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SharedContext } from '../../src/agents/shared-context.js';

// ─── Mock node:fs ────────────────────────────────────────────────────────
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
    renameSync: vi.fn((from: string, to: string) => {
      const data = store.get(from);
      if (data !== undefined) {
        store.set(to, data);
        store.delete(from);
      }
    }),
    unlinkSync: vi.fn((path: string) => {
      store.delete(path);
    }),
    mkdirSync: vi.fn(),
  };
});

import { readFileSync, writeFileSync, existsSync, unlinkSync, renameSync } from 'node:fs';

const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedExistsSync = vi.mocked(existsSync);
const mockedUnlinkSync = vi.mocked(unlinkSync);
const mockedRenameSync = vi.mocked(renameSync);

// We need a real in-memory store for this test
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
  mockedUnlinkSync.mockImplementation((path: any) => {
    fileStore.delete(String(path));
  });
  mockedRenameSync.mockImplementation((from: any, to: any) => {
    const data = fileStore.get(String(from));
    if (data !== undefined) {
      fileStore.set(String(to), data);
      fileStore.delete(String(from));
    }
  });
});

// ─── Tests ──────────────────────────────────────────────────────────────

describe('SharedContext', () => {
  it('writes and reads a key-value pair', () => {
    const ctx = new SharedContext('/project');
    ctx.write('agent-1', 'myKey', { data: 42 });
    const entry = ctx.read('myKey');
    expect(entry).toBeDefined();
    expect(entry!.agentId).toBe('agent-1');
    expect(entry!.value).toEqual({ data: 42 });
    expect(entry!.timestamp).toBeDefined();
  });

  it('returns undefined for non-existent key', () => {
    const ctx = new SharedContext('/project');
    expect(ctx.read('nonexistent')).toBeUndefined();
  });

  it('overwrites existing key', () => {
    const ctx = new SharedContext('/project');
    ctx.write('agent-1', 'key', 'first');
    ctx.write('agent-2', 'key', 'second');
    const entry = ctx.read('key');
    expect(entry!.agentId).toBe('agent-2');
    expect(entry!.value).toBe('second');
  });

  it('readAll returns all entries', () => {
    const ctx = new SharedContext('/project');
    ctx.write('a1', 'key1', 'v1');
    ctx.write('a2', 'key2', 'v2');
    const all = ctx.readAll();
    expect(Object.keys(all)).toHaveLength(2);
    expect(all['key1']!.value).toBe('v1');
    expect(all['key2']!.value).toBe('v2');
  });

  it('clear removes all entries', () => {
    const ctx = new SharedContext('/project');
    ctx.write('a1', 'key1', 'v1');
    ctx.clear();
    expect(ctx.readAll()).toEqual({});
  });

  it('remove deletes a specific key', () => {
    const ctx = new SharedContext('/project');
    ctx.write('a1', 'key1', 'v1');
    ctx.write('a1', 'key2', 'v2');
    const removed = ctx.remove('key1');
    expect(removed).toBe(true);
    expect(ctx.read('key1')).toBeUndefined();
    expect(ctx.read('key2')).toBeDefined();
  });

  it('remove returns false for non-existent key', () => {
    const ctx = new SharedContext('/project');
    expect(ctx.remove('nope')).toBe(false);
  });

  it('size returns the number of entries', () => {
    const ctx = new SharedContext('/project');
    expect(ctx.size()).toBe(0);
    ctx.write('a1', 'k1', 1);
    expect(ctx.size()).toBe(1);
    ctx.write('a1', 'k2', 2);
    expect(ctx.size()).toBe(2);
  });

  it('has returns true for existing key', () => {
    const ctx = new SharedContext('/project');
    ctx.write('a1', 'existing', true);
    expect(ctx.has('existing')).toBe(true);
    expect(ctx.has('missing')).toBe(false);
  });

  it('throws on empty key', () => {
    const ctx = new SharedContext('/project');
    expect(() => ctx.write('a1', '', 'val')).toThrow('key must be a non-empty string');
  });

  it('throws on empty agentId', () => {
    const ctx = new SharedContext('/project');
    expect(() => ctx.write('', 'key', 'val')).toThrow('agentId must be a non-empty string');
  });

  it('handles corrupted file gracefully', () => {
    const ctx = new SharedContext('/project');
    // Write invalid JSON to the file path
    const filePath = '/project/.tasks/shared-context.json';
    fileStore.set(filePath, 'not valid json');
    // Should return empty rather than throw
    expect(ctx.readAll()).toEqual({});
  });

  it('handles non-object file content gracefully', () => {
    const ctx = new SharedContext('/project');
    const filePath = '/project/.tasks/shared-context.json';
    fileStore.set(filePath, JSON.stringify([1, 2, 3]));
    expect(ctx.readAll()).toEqual({});
  });

  it('stores timestamp as ISO string', () => {
    const ctx = new SharedContext('/project');
    const before = new Date().toISOString();
    ctx.write('a1', 'key', 'val');
    const entry = ctx.read('key');
    expect(entry!.timestamp).toBeDefined();
    // Timestamp should be a valid ISO string
    expect(() => new Date(entry!.timestamp)).not.toThrow();
    expect(new Date(entry!.timestamp).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime() - 1000);
  });

  it('supports complex value types', () => {
    const ctx = new SharedContext('/project');
    ctx.write('a1', 'complex', { nested: { deep: [1, 2, 3] } });
    const entry = ctx.read('complex');
    expect(entry!.value).toEqual({ nested: { deep: [1, 2, 3] } });
  });
});
