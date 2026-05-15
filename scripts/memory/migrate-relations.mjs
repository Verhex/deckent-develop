#!/usr/bin/env node
/**
 * scripts/memory/migrate-relations.mjs
 *
 * Sprint 169 C1 — Memory Relations Migration.
 *
 * Parses `.brain/archive/pre-v2/DECISIONS.md`, extracts 6 MADR v3 relation
 * types (references, supersedes, caused_by, resolves, blocks, depends_on)
 * and inserts them into `.brain/memory.db` `relations` table.
 *
 * Idempotent (INSERT OR IGNORE) — re-runs do not duplicate rows.
 * FK-safe — orphan from_id / to_id (entry missing) are skipped + logged.
 *
 * Usage:
 *   node scripts/memory/migrate-relations.mjs [--db <path>] [--source <path>] [--dry-run]
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import Database from 'better-sqlite3';

const DEFAULT_DB = '.brain/memory.db';
const DEFAULT_SOURCE = '.brain/archive/pre-v2/DECISIONS.md';

const RELATION_PATTERNS = {
  // "Supersedes: ADR-022", "supersedes ADR 022"
  supersedes: /supersedes?\s*(?:by\s+)?:?\s*ADR[-\s]?(\d{1,3})/gi,
  // "Superseded by: ADR-022" — reverse direction
  superseded_by: /superseded\s+by\s*:?\s*ADR[-\s]?(\d{1,3})/gi,
  // "caused by ADR-006"
  caused_by: /caused\s+by\s*:?\s*ADR[-\s]?(\d{1,3})/gi,
  // "resolves ADR-019"
  resolves: /resolves?\s*:?\s*ADR[-\s]?(\d{1,3})/gi,
  // "blocks ADR-007"
  blocks: /blocks?\s*:?\s*ADR[-\s]?(\d{1,3})/gi,
  // "depends on ADR-001"
  depends_on: /depends?\s+on\s*:?\s*ADR[-\s]?(\d{1,3})/gi,
  // "references ADR-031", "refers to ADR-031"
  references: /(?:references?|refers?\s+to)\s*:?\s*ADR[-\s]?(\d{1,3})/gi,
};

function parseArgs(argv) {
  const opts = { db: DEFAULT_DB, source: DEFAULT_SOURCE, dryRun: false };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--db') opts.db = argv[++i];
    else if (a === '--source') opts.source = argv[++i];
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '-h' || a === '--help') {
      console.log(
        'Usage: migrate-relations.mjs [--db <path>] [--source <path>] [--dry-run]',
      );
      process.exit(0);
    }
  }
  return opts;
}

function normalizeAdrId(num) {
  return `adr-${String(num).padStart(3, '0')}`;
}

/**
 * Strip markdown formatting that breaks keyword regex (asterisks, underscores
 * used for bold/italic). Keeps semantic content intact.
 */
function stripMdFormatting(s) {
  return s.replace(/[*_]+/g, ' ');
}

/**
 * Split the markdown source into ADR sections.
 * Returns Array<{ fromId: string, body: string }>.
 * Body is markdown-formatting-stripped to allow regex matches on phrases
 * that appear inside `**bold:**` markers (e.g. `**Supersedes:** ADR-022`).
 */
function splitSections(md) {
  const headingRe = /^##\s+ADR[-\s]?(\d{1,3})\b/gim;
  const sections = [];
  const matches = [...md.matchAll(headingRe)];
  for (let i = 0; i < matches.length; i += 1) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : md.length;
    const fromId = normalizeAdrId(matches[i][1]);
    const body = stripMdFormatting(md.slice(start, end));
    sections.push({ fromId, body });
  }
  return sections;
}

/**
 * For one ADR section, yield all (toId, relType) edges discovered.
 */
function extractEdges(section) {
  const edges = [];
  for (const [type, pattern] of Object.entries(RELATION_PATTERNS)) {
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(section.body)) !== null) {
      const toId = normalizeAdrId(m[1]);
      if (toId === section.fromId) continue; // skip self-reference
      if (type === 'superseded_by') {
        // Reverse: this ADR is superseded BY toId → toId supersedes this.
        edges.push({ fromId: toId, toId: section.fromId, type: 'supersedes' });
      } else {
        edges.push({ fromId: section.fromId, toId, type });
      }
    }
  }
  return edges;
}

function run() {
  const opts = parseArgs(process.argv);
  const dbPath = resolve(opts.db);
  const sourcePath = resolve(opts.source);

  if (!existsSync(sourcePath)) {
    console.error(`Source not found: ${sourcePath}`);
    process.exit(1);
  }
  if (!existsSync(dbPath)) {
    console.error(`DB not found: ${dbPath}`);
    process.exit(1);
  }

  const md = readFileSync(sourcePath, 'utf-8');
  const sections = splitSections(md);

  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');

  const existsStmt = db.prepare('SELECT 1 FROM entries WHERE id = ?');
  const insertStmt = db.prepare(
    `INSERT OR IGNORE INTO relations (from_id, to_id, rel_type) VALUES (?, ?, ?)`,
  );
  const beforeCount = db
    .prepare('SELECT COUNT(*) AS c FROM relations')
    .get().c;

  let inserted = 0;
  let skippedOrphan = 0;
  let skippedDuplicate = 0;
  const orphanLog = [];

  const txn = db.transaction(() => {
    for (const section of sections) {
      const edges = extractEdges(section);
      for (const edge of edges) {
        const fromExists = existsStmt.get(edge.fromId);
        const toExists = existsStmt.get(edge.toId);
        if (!fromExists || !toExists) {
          skippedOrphan += 1;
          orphanLog.push(
            `Skip ${edge.fromId}→${edge.toId} (${edge.type}) — ${
              !fromExists ? 'from' : 'to'
            } missing`,
          );
          continue;
        }
        if (opts.dryRun) {
          inserted += 1;
          continue;
        }
        const res = insertStmt.run(edge.fromId, edge.toId, edge.type);
        if (res.changes === 1) inserted += 1;
        else skippedDuplicate += 1;
      }
    }
  });

  txn();
  const afterCount = db
    .prepare('SELECT COUNT(*) AS c FROM relations')
    .get().c;
  db.close();

  console.log(
    `[migrate-relations] sections=${sections.length} inserted=${inserted} ` +
      `skippedDuplicate=${skippedDuplicate} skippedOrphan=${skippedOrphan} ` +
      `before=${beforeCount} after=${afterCount}${opts.dryRun ? ' (dry-run)' : ''}`,
  );
  if (orphanLog.length > 0 && process.env.VERBOSE) {
    for (const line of orphanLog) console.warn(line);
  }
}

run();
