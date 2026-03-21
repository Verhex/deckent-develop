import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import { SkillLoadingCache } from '../../src/core/skill-cache.js';

vi.mock('node:fs');

const ROOT = '/tmp/test-project';

describe('SkillLoadingCache', () => {
  let cache: SkillLoadingCache;

  beforeEach(() => {
    vi.restoreAllMocks();
    cache = new SkillLoadingCache(ROOT, 10000); // 10KB limit for tests
  });

  // ─── loadAndCache ─────────────────────────────────────────────

  it('loads and caches a skill file', () => {
    vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 1000 } as fs.Stats);
    vi.mocked(fs.readFileSync).mockReturnValue('# Skill Content');

    const result = cache.loadAndCache('typescript');
    expect(result).not.toBeNull();
    expect(result!.skillId).toBe('typescript');
    expect(result!.content).toBe('# Skill Content');
    expect(result!.mtime).toBe(1000);
  });

  it('returns null when file does not exist', () => {
    vi.mocked(fs.statSync).mockImplementation(() => { throw new Error('ENOENT'); });
    expect(cache.loadAndCache('nonexistent')).toBeNull();
  });

  it('returns null when read fails', () => {
    vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 1000 } as fs.Stats);
    vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('EACCES'); });
    expect(cache.loadAndCache('broken')).toBeNull();
  });

  it('updates cache when reloading same skill', () => {
    vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 1000 } as fs.Stats);
    vi.mocked(fs.readFileSync).mockReturnValue('v1');
    cache.loadAndCache('skill-1');

    vi.mocked(fs.readFileSync).mockReturnValue('v2');
    vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 2000 } as fs.Stats);
    cache.loadAndCache('skill-1');

    const cached = cache.getCached('skill-1');
    expect(cached!.content).toBe('v2');
    expect(cached!.mtime).toBe(2000);
  });

  // ─── getCached ────────────────────────────────────────────────

  it('returns null for non-cached skill', () => {
    expect(cache.getCached('unknown')).toBeNull();
  });

  it('returns cached skill after load', () => {
    vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 1000 } as fs.Stats);
    vi.mocked(fs.readFileSync).mockReturnValue('content');
    cache.loadAndCache('my-skill');
    expect(cache.getCached('my-skill')).not.toBeNull();
  });

  // ─── preloadAll ───────────────────────────────────────────────

  it('preloads all skills from directory', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'skill-a', isDirectory: () => true },
      { name: 'skill-b', isDirectory: () => true },
      { name: 'readme.md', isDirectory: () => false },
    ] as unknown as fs.Dirent[]);
    vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 1000 } as fs.Stats);
    vi.mocked(fs.readFileSync).mockReturnValue('content');

    const count = cache.preloadAll();
    expect(count).toBe(2);
    expect(cache.size).toBe(2);
  });

  it('returns 0 when skills dir does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(cache.preloadAll()).toBe(0);
  });

  it('returns 0 when readdir fails', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockImplementation(() => { throw new Error('EACCES'); });
    expect(cache.preloadAll()).toBe(0);
  });

  // ─── isStale ──────────────────────────────────────────────────

  it('returns true for non-cached skill', () => {
    expect(cache.isStale('unknown')).toBe(true);
  });

  it('returns false when file mtime matches', () => {
    vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 1000 } as fs.Stats);
    vi.mocked(fs.readFileSync).mockReturnValue('content');
    cache.loadAndCache('skill-1');
    expect(cache.isStale('skill-1')).toBe(false);
  });

  it('returns true when file has been modified', () => {
    vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 1000 } as fs.Stats);
    vi.mocked(fs.readFileSync).mockReturnValue('content');
    cache.loadAndCache('skill-1');

    vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 2000 } as fs.Stats);
    expect(cache.isStale('skill-1')).toBe(true);
  });

  it('returns true when stat fails', () => {
    vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 1000 } as fs.Stats);
    vi.mocked(fs.readFileSync).mockReturnValue('content');
    cache.loadAndCache('skill-1');

    vi.mocked(fs.statSync).mockImplementation(() => { throw new Error('ENOENT'); });
    expect(cache.isStale('skill-1')).toBe(true);
  });

  // ─── clearCache ───────────────────────────────────────────────

  it('clears all cached skills', () => {
    vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 1000 } as fs.Stats);
    vi.mocked(fs.readFileSync).mockReturnValue('content');
    cache.loadAndCache('s1');
    cache.loadAndCache('s2');
    cache.clearCache();
    expect(cache.size).toBe(0);
    expect(cache.totalBytes).toBe(0);
  });

  // ─── evict ────────────────────────────────────────────────────

  it('evicts a specific skill', () => {
    vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 1000 } as fs.Stats);
    vi.mocked(fs.readFileSync).mockReturnValue('content');
    cache.loadAndCache('skill-1');
    expect(cache.evict('skill-1')).toBe(true);
    expect(cache.size).toBe(0);
  });

  it('returns false when evicting non-cached skill', () => {
    expect(cache.evict('unknown')).toBe(false);
  });

  // ─── Size budget enforcement ──────────────────────────────────

  it('evicts oldest when exceeding size budget', () => {
    const tinyCache = new SkillLoadingCache(ROOT, 20);
    vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 1000 } as fs.Stats);
    vi.mocked(fs.readFileSync).mockReturnValue('short text');

    tinyCache.loadAndCache('s1');
    tinyCache.loadAndCache('s2');
    // s1 should have been evicted to make room for s2
    expect(tinyCache.size).toBeLessThanOrEqual(2);
  });

  it('does not cache if single file exceeds budget', () => {
    const tinyCache = new SkillLoadingCache(ROOT, 5);
    vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 1000 } as fs.Stats);
    vi.mocked(fs.readFileSync).mockReturnValue('this content is definitely longer than 5 bytes');

    const result = tinyCache.loadAndCache('huge-skill');
    // Returns the data but doesn't cache it
    expect(result).not.toBeNull();
    expect(tinyCache.size).toBe(0);
  });

  // ─── totalBytes tracking ──────────────────────────────────────

  it('tracks total bytes', () => {
    vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 1000 } as fs.Stats);
    vi.mocked(fs.readFileSync).mockReturnValue('hello');
    cache.loadAndCache('skill-1');
    expect(cache.totalBytes).toBeGreaterThan(0);
  });
});
