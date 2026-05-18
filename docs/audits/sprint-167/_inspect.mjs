#!/usr/bin/env node
// READ-ONLY inspection helper for T4 audit. Safe to delete after use.
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';

const dbPath = process.argv[2] || '.brain/memory.db';
const db = new Database(dbPath, { readonly: true, fileMustExist: true });

const cmd = process.argv[3] || 'overview';

function safeJSON(v) { return JSON.stringify(v, null, 2); }

function overview() {
  const tables = db.prepare("SELECT name, type FROM sqlite_master WHERE type IN ('table','view','index','trigger') ORDER BY type, name").all();
  console.log('=== TABLES / VIEWS / INDEXES / TRIGGERS ===');
  for (const t of tables) console.log(`  ${t.type.padEnd(8)} ${t.name}`);

  console.log('\n=== ROW COUNTS ===');
  for (const t of tables.filter(x => x.type === 'table')) {
    try {
      const { c } = db.prepare(`SELECT COUNT(*) AS c FROM "${t.name}"`).get();
      console.log(`  ${t.name.padEnd(30)} ${c}`);
    } catch (e) {
      console.log(`  ${t.name.padEnd(30)} ERROR: ${e.message}`);
    }
  }

  console.log('\n=== SCHEMA: entries ===');
  const cols = db.prepare("PRAGMA table_info('entries')").all();
  for (const c of cols) console.log(`  ${c.cid} ${c.name.padEnd(20)} ${c.type.padEnd(15)} NN=${c.notnull} DFLT=${c.dflt_value} PK=${c.pk}`);

  console.log('\n=== SCHEMA: entries_fts ===');
  try {
    const fts = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'entries_fts'").get();
    console.log(fts?.sql || '(none)');
  } catch (e) { console.log('ERR:', e.message); }
}

function schemaAll() {
  const tables = db.prepare("SELECT name, type, sql FROM sqlite_master WHERE type IN ('table','view','index','trigger') ORDER BY type, name").all();
  for (const t of tables) {
    console.log(`-- ${t.type.toUpperCase()}: ${t.name}`);
    console.log(t.sql || '(auto)');
    console.log('');
  }
}

function entryTypes() {
  const rows = db.prepare("SELECT type, status, COUNT(*) AS c FROM entries GROUP BY type, status ORDER BY type, status").all();
  console.log('type,status,count');
  for (const r of rows) console.log(`${r.type},${r.status || '<null>'},${r.c}`);
}

function sprintParity() {
  // entries with sprint_id should match sprint_num pattern
  const rows = db.prepare(`
    SELECT id, type, sprint_id, sprint_num
    FROM entries
    WHERE sprint_id IS NOT NULL OR sprint_num IS NOT NULL
    ORDER BY sprint_num, sprint_id
  `).all();
  console.log('Total sprint-tagged entries:', rows.length);
  let mismatch = 0;
  let missingNum = 0;
  let missingId = 0;
  const mismatches = [];
  for (const r of rows) {
    if (!r.sprint_id) { missingId++; continue; }
    if (!r.sprint_num) { missingNum++; continue; }
    const m = /sprint-(\d+)/.exec(r.sprint_id);
    if (!m) { mismatches.push({...r, reason: 'sprint_id no-num'}); mismatch++; continue; }
    if (parseInt(m[1], 10) !== r.sprint_num) {
      mismatches.push({...r, reason: 'num-mismatch'}); mismatch++;
    }
  }
  console.log('mismatch:', mismatch, 'missingNum:', missingNum, 'missingId:', missingId);
  console.log('--- mismatches sample ---');
  for (const m of mismatches.slice(0, 30)) console.log(JSON.stringify(m));
}

function ftsParity() {
  const enCount = db.prepare("SELECT COUNT(*) AS c FROM entries").get().c;
  const ftsCount = db.prepare("SELECT COUNT(*) AS c FROM entries_fts").get().c;
  console.log('entries:', enCount, 'entries_fts:', ftsCount);
  // rowid alignment
  const en = db.prepare("SELECT rowid FROM entries ORDER BY rowid").all().map(r => r.rowid);
  const fts = db.prepare("SELECT rowid FROM entries_fts ORDER BY rowid").all().map(r => r.rowid);
  const enSet = new Set(en);
  const ftsSet = new Set(fts);
  const enOnly = en.filter(x => !ftsSet.has(x));
  const ftsOnly = fts.filter(x => !enSet.has(x));
  console.log('entries rowids NOT in fts:', enOnly.length, enOnly.slice(0, 20));
  console.log('fts rowids NOT in entries:', ftsOnly.length, ftsOnly.slice(0, 20));
}

function ftsSample(text) {
  // entries_fts has only indexed columns (no id/type/sprint_id) — JOIN back to entries by rowid
  const rows = db.prepare(`
    SELECT e.id, e.type, e.title, length(e.content) AS body_len
    FROM entries_fts f
    JOIN entries e ON e.rowid = f.rowid
    WHERE entries_fts MATCH ?
    LIMIT 10
  `).all(text);
  console.log('query:', text, '→', rows.length, 'hits');
  for (const r of rows) console.log(' ', r.id, '[' + r.type + ']', (r.title || '').slice(0, 60), 'body_len=', r.body_len);
}

function bodyLengthDist() {
  const rows = db.prepare(`
    SELECT id, type, sprint_id, length(content) AS body_len
    FROM entries
    WHERE content IS NOT NULL
    ORDER BY body_len ASC
    LIMIT 30
  `).all();
  console.log('Smallest 30 contents:');
  for (const r of rows) console.log(`  ${String(r.body_len).padStart(6)} ${r.type.padEnd(10)} ${r.sprint_id || ''} ${r.id}`);

  const nullCount = db.prepare("SELECT COUNT(*) AS c FROM entries WHERE content IS NULL OR content = ''").get().c;
  console.log('\nNULL or empty content entries:', nullCount);
  const nullSample = db.prepare("SELECT id, type FROM entries WHERE content IS NULL OR content = '' LIMIT 10").all();
  for (const r of nullSample) console.log(`  EMPTY: ${r.type.padEnd(10)} ${r.id}`);
}

function decayExempt() {
  const rows = db.prepare(`
    SELECT type, COALESCE(decay_exempt, 0) AS de, COUNT(*) AS c
    FROM entries
    GROUP BY type, de
    ORDER BY type, de
  `).all();
  console.log('type,decay_exempt,count');
  for (const r of rows) console.log(`${r.type},${r.de},${r.c}`);
}

function relations() {
  const rows = db.prepare("SELECT COUNT(*) AS c FROM relations").get();
  console.log('Total relations:', rows.c);

  const byType = db.prepare("SELECT rel_type, COUNT(*) AS c FROM relations GROUP BY rel_type ORDER BY c DESC").all();
  console.log('--- by rel_type ---');
  for (const r of byType) console.log(`  ${r.rel_type}: ${r.c}`);

  const orphanFrom = db.prepare(`
    SELECT r.from_id, r.to_id, r.rel_type
    FROM relations r
    LEFT JOIN entries e ON e.id = r.from_id
    WHERE e.id IS NULL
    LIMIT 30
  `).all();
  const orphanTo = db.prepare(`
    SELECT r.from_id, r.to_id, r.rel_type
    FROM relations r
    LEFT JOIN entries e ON e.id = r.to_id
    WHERE e.id IS NULL
    LIMIT 30
  `).all();
  console.log('--- orphan from_id (no source entry) ---', orphanFrom.length);
  for (const r of orphanFrom) console.log(' ', JSON.stringify(r));
  console.log('--- orphan to_id (no target entry) ---', orphanTo.length);
  for (const r of orphanTo) console.log(' ', JSON.stringify(r));
}

function entryHistory() {
  const total = db.prepare("SELECT COUNT(*) AS c FROM entry_history").get().c;
  const distinct = db.prepare("SELECT COUNT(DISTINCT entry_id) AS c FROM entry_history").get().c;
  const entryTotal = db.prepare("SELECT COUNT(*) AS c FROM entries").get().c;
  console.log('entry_history rows:', total, ' distinct entry_id:', distinct, ' total entries:', entryTotal);
  const byField = db.prepare("SELECT field AS field_name, COUNT(*) AS c FROM entry_history GROUP BY field ORDER BY c DESC LIMIT 20").all();
  console.log('--- field_name dist ---');
  for (const r of byField) console.log(`  ${r.field_name}: ${r.c}`);
}

function schemaVersion() {
  try {
    const v = db.prepare("SELECT * FROM schema_version").all();
    console.log('schema_version rows:', JSON.stringify(v));
  } catch (e) {
    console.log('schema_version table error:', e.message);
  }
}

function tags() {
  const total = db.prepare("SELECT COUNT(*) AS c FROM tags").get().c;
  const distinct = db.prepare("SELECT COUNT(DISTINCT tag) AS c FROM tags").get().c;
  console.log('tags rows:', total, ' distinct tag:', distinct);
  const top = db.prepare("SELECT tag, COUNT(*) AS c FROM tags GROUP BY tag ORDER BY c DESC LIMIT 30").all();
  console.log('--- top tags ---');
  for (const r of top) console.log(`  ${r.tag}: ${r.c}`);
  const orphan = db.prepare(`
    SELECT t.entry_id, t.tag
    FROM tags t
    LEFT JOIN entries e ON e.id = t.entry_id
    WHERE e.id IS NULL
    LIMIT 20
  `).all();
  console.log('--- orphan tag entries ---', orphan.length);
  for (const r of orphan) console.log(' ', JSON.stringify(r));
}

function sprintRange() {
  const r = db.prepare("SELECT MIN(sprint_num) AS mn, MAX(sprint_num) AS mx, COUNT(DISTINCT sprint_num) AS distinct_count FROM entries WHERE sprint_num IS NOT NULL").get();
  console.log('sprint_num min:', r.mn, 'max:', r.mx, 'distinct:', r.distinct_count);
  const list = db.prepare("SELECT DISTINCT sprint_num FROM entries WHERE sprint_num IS NOT NULL ORDER BY sprint_num").all();
  console.log('distinct sprint_nums:', list.map(x => x.sprint_num).join(','));
}

function memoryEntries() {
  const r = db.prepare(`
    SELECT id, sprint_id, sprint_num, length(content) AS body_len, status
    FROM entries
    WHERE type = 'memory'
    ORDER BY sprint_num ASC
  `).all();
  console.log('--- all memory entries ---');
  for (const e of r) console.log(`  ${e.sprint_id || '<null>'} num=${e.sprint_num || '<null>'} body=${e.body_len} status=${e.status || ''} id=${e.id}`);
}

function adrStatus() {
  const r = db.prepare(`
    SELECT id, title, status, sprint_num, length(content) AS body_len
    FROM entries
    WHERE type = 'adr'
    ORDER BY id
  `).all();
  console.log('--- ADR entries ---', r.length);
  let proposed = 0, accepted = 0, deprecated = 0, other = 0;
  for (const e of r) {
    const s = (e.status || 'unknown').toLowerCase();
    if (s === 'accepted') accepted++;
    else if (s === 'proposed') proposed++;
    else if (s === 'deprecated' || s === 'superseded') deprecated++;
    else other++;
  }
  console.log('accepted:', accepted, 'proposed:', proposed, 'deprecated/superseded:', deprecated, 'other:', other);
  for (const e of r) console.log(`  ${e.id.padEnd(15)} ${(e.status||'?').padEnd(12)} body=${e.body_len} ${e.title?.slice(0, 60) || ''}`);
}

function specificEntry(id) {
  const r = db.prepare("SELECT * FROM entries WHERE id = ?").get(id);
  if (!r) { console.log('NOT FOUND:', id); return; }
  for (const k of Object.keys(r)) {
    if (k === 'body') console.log(`  ${k}: [${(r[k] || '').length} bytes]`);
    else console.log(`  ${k}: ${r[k]}`);
  }
  console.log('--- body ---');
  console.log(r.body || '(null)');
}

function integrityCheck() {
  const r = db.prepare('PRAGMA integrity_check').all();
  console.log('PRAGMA integrity_check:');
  for (const row of r) console.log(' ', JSON.stringify(row));
  const fk = db.prepare('PRAGMA foreign_key_check').all();
  console.log('PRAGMA foreign_key_check:');
  for (const row of fk) console.log(' ', JSON.stringify(row));
  const userVersion = db.prepare('PRAGMA user_version').get();
  console.log('PRAGMA user_version:', JSON.stringify(userVersion));
  const journalMode = db.prepare('PRAGMA journal_mode').get();
  console.log('PRAGMA journal_mode:', JSON.stringify(journalMode));
}

function triggers() {
  const r = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='trigger' ORDER BY name").all();
  for (const t of r) {
    console.log(`-- TRIGGER: ${t.name}`);
    console.log(t.sql);
    console.log('');
  }
}

function indexes() {
  const r = db.prepare("SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY tbl_name, name").all();
  for (const i of r) {
    console.log(`-- INDEX (${i.tbl_name}): ${i.name}`);
    console.log(i.sql);
    console.log('');
  }
}

switch (cmd) {
  case 'overview': overview(); break;
  case 'schema': schemaAll(); break;
  case 'entry-types': entryTypes(); break;
  case 'sprint-parity': sprintParity(); break;
  case 'fts-parity': ftsParity(); break;
  case 'fts-sample': ftsSample(process.argv[4] || 'docker'); break;
  case 'body-dist': bodyLengthDist(); break;
  case 'decay': decayExempt(); break;
  case 'relations': relations(); break;
  case 'history': entryHistory(); break;
  case 'schema-version': schemaVersion(); break;
  case 'tags': tags(); break;
  case 'sprint-range': sprintRange(); break;
  case 'memory-entries': memoryEntries(); break;
  case 'adr-status': adrStatus(); break;
  case 'entry': specificEntry(process.argv[4]); break;
  case 'integrity': integrityCheck(); break;
  case 'triggers': triggers(); break;
  case 'indexes': indexes(); break;
  default: console.log('unknown cmd:', cmd);
}

db.close();
