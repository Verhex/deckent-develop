#!/usr/bin/env node
/**
 * adr-db-sync-2026-07-06.mjs — Sprint 375 Task 375-002
 *
 * Processes the 2026-07-06 acceptances into `.brain/memory.db` (SSOT):
 *   adr-d-009, adr-d-010, adr-d-011 (Option C), adr-d-012, adr-d-013 (Option C)
 *
 * Reuses the existing forward-sync primitives (docs/adr/*.md -> memory.db) from
 * src/core/adr-file-sync.ts — `parseAdrFile` + `adrToEntryInput` — the same functions
 * `identity-generator.ts` (post-finalize hook) and `src/cli/commands/memory.ts` (rebuild)
 * already use. Unlike `syncAdrFilesToDb`, which sweeps the whole docs/adr directory, this
 * script is scoped to exactly the 5 target ADR files so no unrelated ADR row is touched.
 *
 * Idempotency check mirrors `syncAdrFilesToDb`'s own skip-if-unchanged rule: an id is
 * skipped (no upsert call) when title + content + status + sprint_id already match the
 * existing DB row.
 *
 * Writes SQL only via `MemoryStore.upsert` (insert-if-absent / field-level update +
 * entry_history row). DB schema / DROP / DELETE: never. `--apply` takes a fresh `.bak`
 * snapshot of memory.db before writing.
 *
 * Usage:
 *   node scripts/adr-db-sync-2026-07-06.mjs            # DRY-RUN (default, no writes)
 *   node scripts/adr-db-sync-2026-07-06.mjs --apply     # writes (after a .bak snapshot)
 */

import { existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { MemoryStore } from '../dist/core/memory-store.js';
import { parseAdrFile, adrToEntryInput } from '../dist/core/adr-file-sync.js';

const APPLY = process.argv.includes('--apply');
const MODE = APPLY ? 'APPLY' : 'DRY-RUN';
const DB_PATH = '.brain/memory.db';
const ADR_DIR = 'docs/adr';
const CHANGED_BY = 'sprint-375-adr-db-sync-2026-07-06';

// Exactly the 5 accepted-2026-07-06 ADRs this task governs. Any other docs/adr/*.md
// file is intentionally out of scope for this run.
const TARGET_FILES = [
  'adr-d-009-worker-result-boundary-normalization.md',
  'adr-d-010-repl-input-stabilization.md',
  'adr-d-011-global-install-project-scope.md',
  'adr-d-012-terminal-risk-language.md',
  'adr-d-013-nl-dispatch-default.md',
];

console.log(`\n=== ADR DB Sync 2026-07-06 (375-002) — Mode: ${MODE} ===\n`);

if (!existsSync(DB_PATH)) {
  console.error(`ERROR: memory.db not found at ${DB_PATH}`);
  process.exit(1);
}

function snapshotIds(dbPath, ids) {
  const db = new Database(dbPath, { readonly: true });
  const rows = ids.map((id) =>
    db.prepare('SELECT id, status, adr_class, updated_at FROM entries WHERE id = ?').get(id) ?? {
      id,
      status: null,
      adr_class: null,
      updated_at: null,
    },
  );
  db.close();
  return rows;
}

const targetIds = TARGET_FILES.map((f) => {
  const parsed = parseAdrFile(join(ADR_DIR, f));
  if (!parsed) {
    console.error(`ERROR: could not parse ${f} — malformed ADR file (missing H1 or Status).`);
    process.exit(1);
  }
  return parsed.id;
});

console.log('PRE STATE:');
const pre = snapshotIds(DB_PATH, targetIds);
for (const row of pre) console.log(`  ${JSON.stringify(row)}`);

let bakPath = null;
if (APPLY) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  bakPath = `${DB_PATH}.bak-pre-adr-db-sync-2026-07-06-${ts}`;
  copyFileSync(DB_PATH, bakPath);
  console.log(`\n.bak created: ${bakPath}`);
}

console.log(`\n--- STAGE: parse + idempotency-check + upsert (${TARGET_FILES.length} target files) ---`);

const summary = { inserted: 0, updated: 0, skipped: 0, errors: [] };
// A single MemoryStore instance for both modes — DRY-RUN never calls `.upsert`, only
// `.getById` (read), so no write happens even though the underlying connection is
// opened read-write (MemoryStore has no readonly constructor option).
const store = new MemoryStore(DB_PATH);

for (const fileName of TARGET_FILES) {
  const filePath = join(ADR_DIR, fileName);
  const parsed = parseAdrFile(filePath);
  const input = adrToEntryInput(parsed);
  const existing = store.getById(parsed.id, { includeDeleted: true });

  if (existing) {
    const sameTitle = existing.title === parsed.title;
    const sameContent = existing.content === parsed.content;
    const sameStatus = existing.status === parsed.status;
    const sameSprint = (existing.sprint_id ?? null) === (parsed.sprintId ?? null);
    if (sameTitle && sameContent && sameStatus && sameSprint) {
      summary.skipped++;
      console.log(`  SKIP (already in sync): ${parsed.id}`);
      continue;
    }
    if (APPLY) {
      try {
        store.upsert(input, CHANGED_BY);
        summary.updated++;
        console.log(`  UPDATED: ${parsed.id}`);
      } catch (e) {
        summary.errors.push(`upsert ${parsed.id}: ${e}`);
      }
    } else {
      summary.updated++;
      console.log(`  WOULD UPDATE: ${parsed.id} (title/content/status/sprint differ from DB)`);
    }
  } else {
    if (APPLY) {
      try {
        store.upsert(input, CHANGED_BY);
        summary.inserted++;
        console.log(`  INSERTED: ${parsed.id}`);
      } catch (e) {
        summary.errors.push(`insert ${parsed.id}: ${e}`);
      }
    } else {
      summary.inserted++;
      console.log(`  WOULD INSERT: ${parsed.id} (not in DB yet)`);
    }
  }
}

store.close();

console.log('\nPOST STATE:');
const post = snapshotIds(DB_PATH, targetIds);
for (const row of post) console.log(`  ${JSON.stringify(row)}`);

console.log('\nSUMMARY:', JSON.stringify(summary));
if (summary.errors.length > 0) {
  console.log('\n--- errors ---');
  for (const e of summary.errors) console.log(`  ${e}`);
}
console.log(`\nMode: ${APPLY ? `APPLIED (bak: ${bakPath})` : 'DRY-RUN (no writes)'}`);
console.log('Script finished.\n');

if (summary.errors.length > 0) process.exit(1);
