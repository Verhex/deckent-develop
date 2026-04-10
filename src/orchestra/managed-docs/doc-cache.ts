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

export type DocCache = Record<string, DocCacheEntry>;

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
  writeFileSync(path, JSON.stringify(cache, null, 2) + '\n', 'utf-8');
}

/**
 * Clear the managed docs cache. Exposed for CLI `docs run --no-cache`.
 */
export function clearDocCache(projectRoot: string): void {
  writeDocCache(projectRoot, {});
}
