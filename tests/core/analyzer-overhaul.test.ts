import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue(''),
  statSync: vi.fn().mockReturnValue({ mtimeMs: 1000 }),
  readdirSync: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/core/utils.js', () => ({
  readJsonSafe: vi.fn().mockReturnValue(null),
}));

import { spawnSync } from 'node:child_process';
import { existsSync, statSync, readdirSync } from 'node:fs';
import { analyzeProjectCached, clearAnalyzeCache } from '../../src/core/analyzer.js';

// ─── Tests ───────────────────────────────────────────────────────────

describe('analyzeProject — overhaul', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAnalyzeCache();
    vi.mocked(statSync).mockReturnValue({ mtimeMs: 1000, isDirectory: () => false } as any);
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readdirSync).mockReturnValue([]);
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: 'a.ts\n', stderr: '' } as any);
  });

  it('M) falls back to fs count when git ls-files fails', () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 1, stdout: '', stderr: '' } as any);
    // Differentiate: withFileTypes calls return Dirent objects (for countFilesFs),
    // non-withFileTypes calls return strings (for walk() in countSourceFiles)
    vi.mocked(readdirSync).mockImplementation((_p, opts) => {
      if ((opts as { withFileTypes?: boolean })?.withFileTypes) {
        return [
          { name: 'a.ts', isDirectory: () => false },
          { name: 'b.ts', isDirectory: () => false },
        ] as any;
      }
      return ['a.ts', 'b.ts'] as any;
    });
    const result = analyzeProjectCached('/mock/root');
    expect(result.fileCount).toBeGreaterThanOrEqual(2);
  });

  it('M) uses git file count when git succeeds', () => {
    vi.mocked(spawnSync).mockImplementation((_cmd, args) => {
      if ((args as string[])[0] === 'ls-files') {
        return { status: 0, stdout: 'a.ts\nb.ts\nc.ts\n', stderr: '' } as any;
      }
      return { status: 0, stdout: '', stderr: '' } as any;
    });
    const result = analyzeProjectCached('/mock/root');
    expect(result.fileCount).toBe(3);
  });

  it('M) author count returns 0 when git log fails', () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 1, stdout: '', stderr: '' } as any);
    const result = analyzeProjectCached('/mock/root');
    expect(result.authorCount).toBe(0);
  });

  it('N) returns cached result on second call with same mtime', () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: 'a.dat\n', stderr: '' } as any);
    analyzeProjectCached('/mock/root');
    analyzeProjectCached('/mock/root');
    // analyzeProject calls git ls-files twice (fileCount + LOC), only on first call
    const lsFilesCalls = vi.mocked(spawnSync).mock.calls.filter(
      c => (c[1] as string[])?.[0] === 'ls-files'
    );
    expect(lsFilesCalls.length).toBe(2);
  });

  it('N) re-detects after clearAnalyzeCache()', () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: 'a.dat\n', stderr: '' } as any);
    analyzeProjectCached('/mock/root');
    clearAnalyzeCache();
    analyzeProjectCached('/mock/root');
    // 2 ls-files per analyzeProject call × 2 calls = 4
    const lsFilesCalls = vi.mocked(spawnSync).mock.calls.filter(
      c => (c[1] as string[])?.[0] === 'ls-files'
    );
    expect(lsFilesCalls.length).toBe(4);
  });

  it('classifies small size for few files', () => {
    const files = Array.from({ length: 10 }, (_, i) => `f${i}.dat`).join('\n') + '\n';
    vi.mocked(spawnSync).mockImplementation((_cmd, args) => {
      if ((args as string[])[0] === 'ls-files') {
        return { status: 0, stdout: files, stderr: '' } as any;
      }
      return { status: 0, stdout: '', stderr: '' } as any;
    });
    expect(analyzeProjectCached('/mock/root').size).toBe('small');
  });

  it('classifies medium size for 50-499 files', () => {
    const files = Array.from({ length: 100 }, (_, i) => `f${i}.dat`).join('\n') + '\n';
    vi.mocked(spawnSync).mockImplementation((_cmd, args) => {
      if ((args as string[])[0] === 'ls-files') {
        return { status: 0, stdout: files, stderr: '' } as any;
      }
      return { status: 0, stdout: '', stderr: '' } as any;
    });
    expect(analyzeProjectCached('/mock/root').size).toBe('medium');
  });

  it('clearAnalyzeCache() is exported and callable', () => {
    expect(() => clearAnalyzeCache()).not.toThrow();
  });
});
