#!/usr/bin/env node
/**
 * backfill-relations.mjs — Scan all memory.db entries for ADR references
 * and insert missing relations. Generates a preview report before committing.
 *
 * Usage:
 *   node scripts/backfill-relations.mjs [--dry-run] [--db <path>]
 *
 * Options:
 *   --dry-run   Only generate preview, don't insert relations
 *   --db <path> Path to memory.db (default: .brain/memory.db)
 */

import Database from 'better-sqlite3';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const ADR_PATTERN = /\bADR-(\d{3})\b/g;

function extractAdrReferences(text) {
  const matches = text.match(ADR_PATTERN);
  if (!matches) return [];
  const unique = new Set(matches.map(m => m.toLowerCase()));
  return [...unique];
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const dbIdx = args.indexOf('--db');
  const dbPath = dbIdx >= 0 && args[dbIdx + 1] ? args[dbIdx + 1] : join(process.cwd(), '.brain', 'memory.db');

  if (!existsSync(dbPath)) {
    console.error(`ERROR: memory.db not found at ${dbPath}`);
    process.exit(1);
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Get all active entries
  const entries = db.prepare(
    `SELECT id, type, title, content, summary FROM entries WHERE deleted_at IS NULL`
  ).all();

  console.log(`Scanning ${entries.length} entries for ADR references...`);

  // Get existing relations to avoid duplicates
  const existingRelations = new Set();
  const allRelations = db.prepare(`SELECT from_id, to_id, rel_type FROM relations`).all();
  for (const r of allRelations) {
    existingRelations.add(`${r.from_id}|${r.to_id}|${r.rel_type}`);
  }

  const newRelations = [];

  for (const entry of entries) {
    const text = `${entry.title} ${entry.content} ${entry.summary || ''}`;
    const adrRefs = extractAdrReferences(text);

    for (const adrId of adrRefs) {
      // Don't self-reference
      if (adrId === entry.id) continue;

      const key = `${entry.id}|${adrId}|references`;
      if (existingRelations.has(key)) continue;

      newRelations.push({
        from_id: entry.id,
        to_id: adrId,
        rel_type: 'references',
        source: 'backfill',
        entry_type: entry.type,
        entry_title: entry.title,
      });
      existingRelations.add(key);
    }
  }

  console.log(`Found ${newRelations.length} new relations to insert.`);

  // Generate preview report
  const previewLines = [
    `# Relations Backfill Preview`,
    ``,
    `Generated: ${new Date().toISOString()}`,
    `Entries scanned: ${entries.length}`,
    `New relations found: ${newRelations.length}`,
    `Existing relations: ${allRelations.length}`,
    ``,
    `## New Relations`,
    ``,
    `| From | To | Type | Entry Type | Entry Title |`,
    `|------|-----|------|------------|-------------|`,
  ];

  for (const rel of newRelations) {
    previewLines.push(
      `| ${rel.from_id} | ${rel.to_id} | ${rel.rel_type} | ${rel.entry_type} | ${rel.entry_title.slice(0, 60)} |`
    );
  }

  const previewPath = join(dirname(dbPath), 'exports', 'relations-backfill-preview.md');
  mkdirSync(dirname(previewPath), { recursive: true });
  writeFileSync(previewPath, previewLines.join('\n') + '\n');
  console.log(`Preview written to ${previewPath}`);

  if (dryRun) {
    console.log('Dry run — no relations inserted.');
    db.close();
    return;
  }

  // Insert new relations
  const insertStmt = db.prepare(
    `INSERT OR IGNORE INTO relations (from_id, to_id, rel_type) VALUES (?, ?, ?)`
  );

  const txn = db.transaction(() => {
    for (const rel of newRelations) {
      insertStmt.run(rel.from_id, rel.to_id, rel.rel_type);
    }
  });

  txn();
  console.log(`Inserted ${newRelations.length} relations.`);

  // Verify count
  const totalCount = db.prepare(`SELECT COUNT(*) as cnt FROM relations`).get();
  console.log(`Total relations in DB: ${totalCount.cnt}`);

  db.close();
}

main();
