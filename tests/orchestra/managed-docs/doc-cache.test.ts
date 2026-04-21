import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  readDocCache,
  writeDocCache,
  clearDocCache,
  contentHash,
  type DocCache,
  type DocCacheEntry,
} from '../../../src/orchestra/managed-docs/doc-cache.js';

const TEST_ROOT = path.join(process.cwd(), '.test-doc-cache-' + process.pid);

function cleanup() {
  if (fs.existsSync(TEST_ROOT)) fs.rmSync(TEST_ROOT, { recursive: true, force: true });
}

beforeEach(() => {
  cleanup();
  fs.mkdirSync(TEST_ROOT, { recursive: true });
});

afterEach(cleanup);

const sampleEntry: DocCacheEntry = {
  entryHash: 'abc123',
  fileHash: 'def456',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('writeDocCache', () => {
  it('auto-inserts _meta key with ADR-031 reference', () => {
    writeDocCache(TEST_ROOT, { 'my-doc': sampleEntry });
    const raw = fs.readFileSync(path.join(TEST_ROOT, '.deckent', 'cache', 'managed-docs-cache.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed._meta).toBeDefined();
    expect(parsed._meta.adr).toBe('ADR-031');
    expect(parsed._meta.generatedBy).toBe('managed-doc-runner.ts');
    expect(parsed._meta.schemaVersion).toBe(1);
  });

  it('_meta appears as first key in file (self-documenting)', () => {
    writeDocCache(TEST_ROOT, { 'my-doc': sampleEntry });
    const raw = fs.readFileSync(path.join(TEST_ROOT, '.deckent', 'cache', 'managed-docs-cache.json'), 'utf-8');
    const firstKey = Object.keys(JSON.parse(raw))[0];
    expect(firstKey).toBe('_meta');
  });

  it('doc entries are preserved alongside _meta', () => {
    writeDocCache(TEST_ROOT, { 'my-doc': sampleEntry, 'other-doc': sampleEntry });
    const raw = fs.readFileSync(path.join(TEST_ROOT, '.deckent', 'cache', 'managed-docs-cache.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed['my-doc']).toEqual(sampleEntry);
    expect(parsed['other-doc']).toEqual(sampleEntry);
  });

  it('creates directory if not exists', () => {
    const cacheDir = path.join(TEST_ROOT, '.deckent', 'cache');
    expect(fs.existsSync(cacheDir)).toBe(false);
    writeDocCache(TEST_ROOT, {});
    expect(fs.existsSync(cacheDir)).toBe(true);
  });
});

describe('readDocCache', () => {
  it('returns empty object when cache does not exist', () => {
    const result = readDocCache(TEST_ROOT);
    expect(result).toEqual({});
  });

  it('reads back cache entries including _meta', () => {
    writeDocCache(TEST_ROOT, { 'my-doc': sampleEntry });
    const result = readDocCache(TEST_ROOT);
    expect(result['my-doc']).toEqual(sampleEntry);
    expect(result._meta).toBeDefined();
  });

  it('backward-compat: old caches without _meta parse fine', () => {
    // Write a cache file without _meta (old format)
    const oldFormat = { 'legacy-doc': sampleEntry };
    const cachePath = path.join(TEST_ROOT, '.deckent', 'cache', 'managed-docs-cache.json');
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(oldFormat, null, 2) + '\n', 'utf-8');

    const result = readDocCache(TEST_ROOT);
    expect(result['legacy-doc']).toEqual(sampleEntry);
    expect(result._meta).toBeUndefined();
  });

  it('returns empty object on malformed JSON', () => {
    const cachePath = path.join(TEST_ROOT, '.deckent', 'cache', 'managed-docs-cache.json');
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, 'not-json', 'utf-8');
    const result = readDocCache(TEST_ROOT);
    expect(result).toEqual({});
  });
});

describe('clearDocCache', () => {
  it('removes doc entries but preserves _meta', () => {
    writeDocCache(TEST_ROOT, { 'my-doc': sampleEntry });
    clearDocCache(TEST_ROOT);
    const result = readDocCache(TEST_ROOT);
    expect(result['my-doc']).toBeUndefined();
    expect(result._meta).toBeDefined();
    expect(result._meta!.adr).toBe('ADR-031');
  });

  it('works even if cache file does not exist yet', () => {
    expect(() => clearDocCache(TEST_ROOT)).not.toThrow();
    const result = readDocCache(TEST_ROOT);
    // No pre-existing _meta to preserve, but file is valid and readable
    expect(result).toBeDefined();
    // The cleared cache should have no doc entries
    const keys = Object.keys(result).filter(k => k !== '_meta');
    expect(keys).toHaveLength(0);
  });
});

describe('contentHash', () => {
  it('returns 40-char hex string', () => {
    const hash = contentHash('hello');
    expect(hash).toHaveLength(40);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('same input produces same hash', () => {
    expect(contentHash('abc')).toBe(contentHash('abc'));
  });

  it('different inputs produce different hashes', () => {
    expect(contentHash('abc')).not.toBe(contentHash('xyz'));
  });
});
