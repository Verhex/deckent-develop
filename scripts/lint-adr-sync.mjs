#!/usr/bin/env node
/**
 * lint-adr-sync.mjs — Accepted-ADR DB↔filesystem parity gate (row 160).
 *
 * `.brain/memory.db` is the SSOT for ADRs (`type='adr'`); `.brain/exports/decisions.md`
 * is a guarded, auto-generated projection of it. This lint reads both, read-only, and
 * fails closed on three typed divergence classes, all keyed by a normalized content
 * digest:
 *
 *   - MISSING   — DB has an accepted ADR id with no matching entry in the export.
 *   - STALE     — export has an ADR id that is NOT currently accepted in the DB
 *                 (removed, status changed away from accepted, or never existed).
 *   - DIVERGENT — id present on both sides, but sha256(normalize(content)) differs.
 *
 * Does NOT edit ADR content or the export — report-only, exits non-zero on drift.
 *
 * Usage:
 *   node scripts/lint-adr-sync.mjs [--db <path>] [--export <path>]
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { parseADRs } from './adr-validator.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Collapse incidental markdown-formatting drift (whitespace runs, casing) while still
 * catching real text drift — e.g. the ADR-G-025 RCA example where the export kept
 * claiming redaction classes were missing after the DB content was corrected.
 */
export function normalizeContent(text) {
  return String(text ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function digestOf(text) {
  return createHash('sha256').update(normalizeContent(text)).digest('hex');
}

/**
 * Parse the exported decisions.md projection into `Map<id, {title, body}>`, reusing
 * the canonical parser (avoids re-inventing the `## adr-g-NNN:` / `## adr-NNN:` grammar).
 */
export function loadExportedAdrs(exportContent) {
  const { adrs } = parseADRs(exportContent);
  const out = new Map();
  for (const adr of adrs) {
    const bodyLines = adr.raw.split('\n').slice(1); // drop the "## id: title" header line
    out.set(adr.id, { title: adr.title, body: bodyLines.join('\n') });
  }
  return out;
}

async function loadMemoryStore() {
  const distPath = join(__dirname, '..', 'dist', 'core', 'memory-store.js');
  if (existsSync(distPath)) {
    return import(pathToFileURL(distPath).href);
  }
  return import(pathToFileURL(join(__dirname, '..', 'src', 'core', 'memory-store.ts')).href);
}

/**
 * Read every accepted ADR straight from the live store — read-only, mirrors
 * `scripts/measure-prompt-cost.mjs` (`store.getByType('adr').filter(status==='accepted')`).
 */
export async function loadDbAcceptedAdrs(dbPath) {
  const { MemoryStore } = await loadMemoryStore();
  const store = new MemoryStore(dbPath);
  const out = new Map();
  try {
    for (const entry of store.getByType('adr')) {
      if (entry.status === 'accepted') {
        out.set(entry.id, { title: entry.title, content: entry.content });
      }
    }
  } finally {
    store.close();
  }
  return out;
}

/**
 * Pure comparison — no I/O. `dbAccepted`/`exportedAdrs` are `Map<id, {title, content|body}>`.
 */
export function diffAdrSync(dbAccepted, exportedAdrs) {
  const missing = [];
  const stale = [];
  const divergent = [];

  for (const [id, dbAdr] of dbAccepted) {
    const exported = exportedAdrs.get(id);
    if (!exported) {
      missing.push(id);
      continue;
    }
    const dbDigest = digestOf(dbAdr.content);
    const exportDigest = digestOf(exported.body);
    // Exact match covers a raw passthrough export; containment covers an export that
    // wraps the DB content in a larger templated section (status/class/date metadata
    // lines before/after) — either way the DB content text must be present verbatim
    // (normalized) somewhere in the export, or the projection has actually drifted.
    const inSync = dbDigest === exportDigest || normalizeContent(exported.body).includes(normalizeContent(dbAdr.content));
    if (!inSync) {
      divergent.push({ id, dbDigest, exportDigest });
    }
  }

  for (const id of exportedAdrs.keys()) {
    if (!dbAccepted.has(id)) {
      stale.push(id);
    }
  }

  return {
    ok: missing.length === 0 && stale.length === 0 && divergent.length === 0,
    missing,
    stale,
    divergent,
  };
}

function printReport({ dbPath, exportPath, dbAccepted, exportedAdrs, result }) {
  console.log(`[lint-adr-sync] db=${dbPath}`);
  console.log(`[lint-adr-sync] export=${exportPath}`);
  console.log(`[lint-adr-sync] accepted-in-db=${dbAccepted.size} exported=${exportedAdrs.size}`);
  console.log('');

  for (const id of result.missing) {
    console.log(`MISSING: ${id} (accepted in DB, absent from export)`);
  }
  for (const id of result.stale) {
    console.log(`STALE: ${id} (present in export, not accepted in DB — projection is stale)`);
  }
  for (const { id, dbDigest, exportDigest } of result.divergent) {
    console.log(`DIVERGENT: ${id} (content digest mismatch: db=${dbDigest} export=${exportDigest})`);
  }

  console.log('');
  const issueCount = result.missing.length + result.stale.length + result.divergent.length;
  if (result.ok) {
    console.log(`PASS: ${dbAccepted.size} accepted ADR(s) in sync with the export.`);
  } else {
    console.error(`FAIL: ${issueCount} issue(s) found.`);
  }
}

/**
 * Orchestrates load + diff + report. Fail-closed: a missing db/export file is exit 2,
 * not a silent pass. Returns the exit code (0 ok / 1 drift found / 2 file missing).
 */
export async function runLint({ dbPath, exportPath }) {
  if (!existsSync(dbPath)) {
    console.error(`ERROR: memory.db not found at ${dbPath}`);
    return 2;
  }
  if (!existsSync(exportPath)) {
    console.error(`ERROR: export not found at ${exportPath}`);
    return 2;
  }

  const dbAccepted = await loadDbAcceptedAdrs(dbPath);
  const exportedAdrs = loadExportedAdrs(readFileSync(exportPath, 'utf-8'));
  const result = diffAdrSync(dbAccepted, exportedAdrs);

  printReport({ dbPath, exportPath, dbAccepted, exportedAdrs, result });

  return result.ok ? 0 : 1;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = { dbPath: null, exportPath: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--db' && args[i + 1]) { out.dbPath = args[++i]; }
    else if (a === '--export' && args[i + 1]) { out.exportPath = args[++i]; }
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
  }
  return out;
}

function printHelp() {
  console.log(`Usage: node scripts/lint-adr-sync.mjs [options]

Options:
  --db <path>      Path to memory.db (default: .brain/memory.db)
  --export <path>  Path to the exported decisions.md (default: .brain/exports/decisions.md)
  -h, --help       Show this help`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const opts = parseArgs(process.argv);
  const cwd = process.cwd();
  const dbPath = opts.dbPath ?? join(cwd, '.brain', 'memory.db');
  const exportPath = opts.exportPath ?? join(cwd, '.brain', 'exports', 'decisions.md');

  runLint({ dbPath, exportPath }).then((code) => process.exit(code)).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
