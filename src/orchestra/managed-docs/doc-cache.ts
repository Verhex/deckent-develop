// ─── Managed Docs Cache ──────────────────────────────────────────────────
// Lightweight cache layer to skip generation work when nothing has changed.
// Cache is stored at .deckent/cache/managed-docs-cache.json and keyed by doc ID.
// Each entry tracks (entryHash, fileHash, updatedAt) — if both hashes match
// the current state, the doc is skipped.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { debugLog } from '../../core/utils.js';

const CACHE_FILE = join('.deckent', 'cache', 'managed-docs-cache.json');

export interface DocCacheEntry {
  entryHash: string;
  fileHash: string;
  updatedAt: string;
}

export interface DocCacheMetadata {
  adr: string;
  generatedBy: string;
  schemaVersion: number;
}

export interface DocCache {
  _meta?: DocCacheMetadata;
  [key: string]: DocCacheEntry | DocCacheMetadata | undefined;
}

/** Type guard: returns true if value is a DocCacheEntry (not metadata). */
export function isDocCacheEntry(val: DocCacheEntry | DocCacheMetadata | undefined): val is DocCacheEntry {
  return val !== undefined && 'entryHash' in val && 'fileHash' in val && 'updatedAt' in val;
}

/** Retrieve a DocCacheEntry by ID, ignoring _meta and type-safely. */
export function getCacheEntry(cache: DocCache, id: string): DocCacheEntry | undefined {
  const val = cache[id];
  return isDocCacheEntry(val) ? val : undefined;
}

/**
 * Stable SHA-1 hash of a string. Short (40 hex chars), collision-safe for
 * local cache invalidation purposes.
 */
export function contentHash(input: string): string {
  return createHash('sha1').update(input).digest('hex');
}

export function readDocCache(projectRoot: string): DocCache {
  const path = join(projectRoot, CACHE_FILE);
  if (!existsSync(path)) return {};
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object') return parsed as DocCache;
    return {};
  } catch (e) {
    debugLog('doc-cache:read', e);
    return {};
  }
}

export function writeDocCache(projectRoot: string, cache: DocCache): void {
  const path = join(projectRoot, CACHE_FILE);
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  // Auto-insert metadata so the cache file is self-documenting (ADR-031)
  const withMeta: DocCache = {
    _meta: { adr: 'ADR-031', generatedBy: 'managed-doc-runner.ts', schemaVersion: 1 },
    ...cache,
  };
  writeFileSync(path, JSON.stringify(withMeta, null, 2) + '\n', 'utf-8');
}

/**
 * Clear the managed docs cache. Exposed for CLI `docs run --no-cache`.
 * Preserves the _meta key so the file remains self-documenting.
 */
export function clearDocCache(projectRoot: string): void {
  // Preserve existing _meta if present
  const existing = readDocCache(projectRoot);
  const meta = existing._meta;
  const cleared: DocCache = meta ? { _meta: meta } : {};
  const path = join(projectRoot, CACHE_FILE);
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(cleared, null, 2) + '\n', 'utf-8');
}
