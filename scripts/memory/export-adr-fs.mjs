#!/usr/bin/env node
/**
 * export-adr-fs.mjs — Reverse-direction sync (DB → FS) for ADR markdown
 * files. Reads every `type='adr'` entry from `memory.db` and writes a
 * MADR v3 markdown file to `docs/adr/<NNN>-<slug>.md`.
 *
 * Bi-directional sync contract — ADR-046 Sprint 169 amendment:
 *   forward: scripts/sprint-166-memory-backfill.mjs / syncAdrFilesToDb
 *   reverse: scripts/memory/export-adr-fs.mjs       / exportAdrsToFs
 *
 * Behaviour:
 *   - Existing files whose mtime is newer than the DB `updated_at` are
 *     preserved (manual edit wins).
 *   - Missing field values are rendered as `_To be backfilled_`.
 *   - Idempotent: a no-op rerun reports `written=0 updated=0`.
 *
 * Usage:
 *   node scripts/memory/export-adr-fs.mjs [--dry-run] [--db <path>] [--adr-dir <path>]
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = { dryRun: false, dbPath: null, adrDir: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--db' && args[i + 1]) { out.dbPath = args[++i]; }
    else if (a === '--adr-dir' && args[i + 1]) { out.adrDir = args[++i]; }
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
  }
  return out;
}

function printHelp() {
  console.log(`Usage: node scripts/memory/export-adr-fs.mjs [options]

Options:
  --dry-run         Compute the result without writing files
  --db <path>       Path to memory.db (default: .brain/memory.db)
  --adr-dir <path>  Output dir for ADR md files (default: docs/adr)
  -h, --help        Show this help`);
}

async function loadModules() {
  // Prefer the compiled dist build. Fall back to src/ for dev (tsx).
  const cwd = process.cwd();
  const distStore = join(cwd, 'dist', 'core', 'memory-store.js');
  const distExport = join(cwd, 'dist', 'core', 'memory-export.js');
  if (existsSync(distStore) && existsSync(distExport)) {
    const storeMod = await import(pathToFileURL(distStore).href);
    const exportMod = await import(pathToFileURL(distExport).href);
    return { MemoryStore: storeMod.MemoryStore, exportAdrsToFs: exportMod.exportAdrsToFs };
  }
  throw new Error('dist/core/memory-store.js or memory-export.js missing — run `npm run build` first.');
}

async function main() {
  const opts = parseArgs(process.argv);
  const cwd = process.cwd();
  const dbPath = opts.dbPath ?? join(cwd, '.brain', 'memory.db');
  const adrDir = opts.adrDir ?? join(cwd, 'docs', 'adr');

  if (!existsSync(dbPath)) {
    console.error(`ERROR: memory.db not found at ${dbPath}`);
    process.exit(1);
  }

  const { MemoryStore, exportAdrsToFs } = await loadModules();
  const store = new MemoryStore(dbPath);

  console.log(`[export-adr-fs] db=${dbPath}`);
  console.log(`[export-adr-fs] adr-dir=${adrDir}`);
  if (opts.dryRun) console.log('[export-adr-fs] DRY RUN — no files will be written');

  const result = exportAdrsToFs(store, adrDir, { dryRun: opts.dryRun });
  store.close();

  console.log('');
  console.log(`written:  ${result.written}`);
  console.log(`updated:  ${result.updated}`);
  console.log(`skipped:  ${result.skipped}`);
  console.log(`errors:   ${result.errors.length}`);

  if (result.errors.length > 0) {
    console.log('');
    console.log('--- errors ---');
    for (const e of result.errors) console.log(`  ${e}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
