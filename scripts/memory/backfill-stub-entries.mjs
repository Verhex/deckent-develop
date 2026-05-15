/**
 * Sprint 169 H2 — Stub Memory Entries Backfill
 *
 * Memory entries inserted as stubs have short placeholder content.
 * This script retrieves the matching `.brain/sprints/sprint-<N>.md` (or
 * a custom archiveDir/sprints/ path) and swaps in the real content,
 * setting metadata.stub_flag to false and stamping backfilled_at.
 *
 * Entry ID lookup: tries `mem-sprint-{N}` first, falls back to `mem-{N}`.
 *
 * Idempotent skip conditions:
 *   - no entry found          → skip (not_found)
 *   - stub_flag === false      → skip (already processed, not_stub)
 *   - stub_flag === true + no archive file → skip (archive_missing)
 *
 * Live-entry path (stub_flag === null/undefined):
 *   - archive file exists → update content + set stub_flag: false
 *   - archive file missing → keep content, set stub_flag: false + archive_unavailable: true
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const MIN_CONTENT_LEN = 100;

/**
 * Backfill a single stub memory entry from its archive markdown.
 *
 * @param {object} store - MemoryStore instance (must expose `getById` + `update`).
 * @param {number} sprintNum - Sprint number, e.g. 159.
 * @param {string} [archiveDir='.brain'] - Root dir; sprint files looked up at
 *   `<archiveDir>/sprints/sprint-<N>.md`.
 * @returns {{ updated: true } | { skipped: true, reason: string }}
 */
export async function backfillStubEntry(store, sprintNum, archiveDir = '.brain') {
  const sprintId = `sprint-${sprintNum}`;

  // Try canonical ID first, then legacy fallback
  const entryId =
    store.getById(`mem-sprint-${sprintNum}`) ? `mem-sprint-${sprintNum}` :
    store.getById(`mem-${sprintNum}`)        ? `mem-${sprintNum}`        :
    null;

  if (!entryId) return { skipped: true, reason: 'not_found' };

  const entry = store.getById(entryId);

  let meta;
  try {
    meta = JSON.parse(entry.metadata || '{}');
  } catch {
    meta = {};
  }

  // Already processed
  if (meta.stub_flag === false) return { skipped: true, reason: 'not_stub' };

  const archivePath = join(archiveDir, 'sprints', `${sprintId}.md`);
  const archiveExists = existsSync(archivePath);

  // Traditional stub path (explicit stub_flag: true): require archive
  if (meta.stub_flag === true && !archiveExists) {
    return { skipped: true, reason: 'archive_missing' };
  }

  if (archiveExists) {
    const content = readFileSync(archivePath, 'utf-8');
    if (content.length < MIN_CONTENT_LEN) {
      return { skipped: true, reason: 'archive_too_short' };
    }
    store.update(entryId, {
      content,
      metadata: JSON.stringify({
        ...meta,
        stub_flag: false,
        backfilled_at: new Date().toISOString(),
      }),
    }, 'backfill-stub-entries');
  } else {
    // Live entry with no archive: clear stub_flag, note unavailability
    store.update(entryId, {
      metadata: JSON.stringify({
        ...meta,
        stub_flag: false,
        archive_unavailable: true,
        backfilled_at: new Date().toISOString(),
      }),
    }, 'backfill-stub-entries');
  }

  return { updated: true };
}

// ── CLI entry ──────────────────────────────────────────────────────
// Run via:  node scripts/memory/backfill-stub-entries.mjs [archive-dir] [db-path]
// Defaults: archive=.brain (sprints at .brain/sprints/), db=.brain/memory.db
if (import.meta.url === `file://${process.argv[1]}`) {
  const archiveDir = process.argv[2] || '.brain';
  const dbPath = process.argv[3] || '.brain/memory.db';

  // Lazy import — script may run against either dist/ (prod) or src/ (dev via tsx).
  const { MemoryStore } = await import('../../dist/core/memory-store.js').catch(async () => {
    return await import('../../src/core/memory-store.ts');
  });

  const store = new MemoryStore(dbPath);
  try {
    for (const num of [159, 160, 161]) {
      const result = await backfillStubEntry(store, num, archiveDir);
      console.log(`sprint-${num}:`, JSON.stringify(result));
    }
  } finally {
    store.close();
  }
}
