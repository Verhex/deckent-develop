#!/usr/bin/env node
/**
 * Sprint 172 — Task B1 (172-008)
 * Read-only archive ↔ memory.db parity verifier.
 *
 * Amaç: `.brain/archive/sprint-NNN.md` ve `retro-sprint-NNN.md` dosyalarının
 * her birinin memory.db içinde `type='sprint'` veya `type='retro'` karşılığı
 * olup olmadığını doğrula. B2 (`git rm --cached`) yalnızca parity-OK dosyalar
 * için güvenlidir; DB-eksik dosyalar önce backfill ister (BA-05 deseni).
 *
 * INVARIANT:
 *   - DB: `new Database(path, { readonly: true })` — INSERT/UPDATE/DELETE YOK.
 *   - Yalnızca SELECT sorguları.
 *   - Script gate DEĞİL — exit 0 her zaman (rapor üreticisi).
 *
 * Kullanım:
 *   node scripts/verify-archive-db-parity.mjs
 *   node scripts/verify-archive-db-parity.mjs --report docs/audits/sprint-171/archive-parity-report.md
 *   node scripts/verify-archive-db-parity.mjs --json
 *
 * DB Konvansiyonu (kaynak: scripts/sprint-167-memory-backfill.mjs):
 *   - Sprint log: id='sprint-log-NNN', type='sprint', sprint_num=NNN
 *   - Retro:      id='retro-sprint-NNN', type='retro', sprint_num=NNN
 *
 * Lookup stratejisi: id-by-convention OR (type, sprint_num) — tolerans için
 * iki yol da denenir (yanlış-negatifi önler; yapay-pozitif riski yok çünkü
 * her ikisi de aynı NNN'i hedefler).
 */

import { readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';

const DB_PATH = '.brain/memory.db';
const ARCHIVE_DIR = '.brain/archive';

const argv = process.argv.slice(2);
const REPORT_IDX = argv.indexOf('--report');
const REPORT_PATH = REPORT_IDX >= 0 ? argv[REPORT_IDX + 1] : null;
const EMIT_JSON = argv.includes('--json');

// ── 1. Archive file enumeration ──────────────────────────────────────────────
// Regex: tam olarak `sprint-NNN.md` veya `retro-sprint-NNN.md` —
// `sprint-NNN-tasks/`, `*.pid`, `*.snapshot.json` hariç.
const SPRINT_RE = /^sprint-(\d{3,4})\.md$/;
const RETRO_RE = /^retro-sprint-(\d{3,4})\.md$/;

if (!existsSync(ARCHIVE_DIR)) {
  console.error(`ERROR: Archive directory not found: ${ARCHIVE_DIR}`);
  process.exit(0); // gate değil, sessiz
}

const files = readdirSync(ARCHIVE_DIR);
const archiveEntries = [];

for (const f of files) {
  let m = SPRINT_RE.exec(f);
  if (m) {
    archiveEntries.push({
      file: f,
      path: join(ARCHIVE_DIR, f),
      kind: 'sprint',
      sprintNum: parseInt(m[1], 10),
      expectedId: `sprint-log-${m[1]}`,
    });
    continue;
  }
  m = RETRO_RE.exec(f);
  if (m) {
    archiveEntries.push({
      file: f,
      path: join(ARCHIVE_DIR, f),
      kind: 'retro',
      sprintNum: parseInt(m[1], 10),
      expectedId: `retro-sprint-${m[1]}`,
    });
  }
}

// ── 2. DB lookups (READ-ONLY) ────────────────────────────────────────────────
if (!existsSync(DB_PATH)) {
  console.error(`ERROR: DB not found: ${DB_PATH}`);
  process.exit(0);
}

const db = new Database(DB_PATH, { readonly: true });

// Prepared statements
const stmtById = db.prepare(
  `SELECT id, type, sprint_id, sprint_num, status FROM entries WHERE id = ?`,
);
const stmtBySprintNum = db.prepare(
  `SELECT id, type, sprint_id, sprint_num, status FROM entries WHERE type = ? AND sprint_num = ?`,
);

const okList = [];
const missingList = [];

for (const e of archiveEntries) {
  // İlk: id-by-convention
  const byId = stmtById.get(e.expectedId);
  let match = byId || null;
  let matchMode = byId ? 'by-id' : null;

  // İkinci yol: (type, sprint_num) — yanlış-negatifi önler
  if (!match) {
    const byNum = stmtBySprintNum.get(e.kind, e.sprintNum);
    if (byNum) {
      match = byNum;
      matchMode = 'by-type-sprint_num';
    }
  }

  if (match) {
    okList.push({
      file: e.file,
      kind: e.kind,
      sprintNum: e.sprintNum,
      dbId: match.id,
      dbType: match.type,
      dbStatus: match.status,
      matchMode,
    });
  } else {
    missingList.push({
      file: e.file,
      kind: e.kind,
      sprintNum: e.sprintNum,
      expectedId: e.expectedId,
    });
  }
}

// ── 3. Global DB stats + orphan detection (informational) ────────────────────
const dbStats = {
  type_sprint: db.prepare(`SELECT COUNT(*) c FROM entries WHERE type='sprint'`).get().c,
  type_retro: db.prepare(`SELECT COUNT(*) c FROM entries WHERE type='retro'`).get().c,
  total_entries: db.prepare(`SELECT COUNT(*) c FROM entries`).get().c,
};

// Orphan DB entries: DB'de var ama arşivde karşılık dosya yok.
// (BA-05 deseni: backfill DB'ye yazıldı, archive .md dosyası asla yok.)
const allDbSprints = db.prepare(
  `SELECT id, type, sprint_num FROM entries WHERE type='sprint' ORDER BY sprint_num`,
).all();
const allDbRetros = db.prepare(
  `SELECT id, type, sprint_num FROM entries WHERE type='retro' ORDER BY sprint_num`,
).all();

const archiveSprintNums = new Set(
  archiveEntries.filter((e) => e.kind === 'sprint').map((e) => e.sprintNum),
);
const archiveRetroNums = new Set(
  archiveEntries.filter((e) => e.kind === 'retro').map((e) => e.sprintNum),
);

const orphanDbSprints = allDbSprints.filter((r) => !archiveSprintNums.has(r.sprint_num));
const orphanDbRetros = allDbRetros.filter((r) => !archiveRetroNums.has(r.sprint_num));

db.close();

// ── 4. Summary ───────────────────────────────────────────────────────────────
const summary = {
  scannedAt: new Date().toISOString(),
  dbPath: DB_PATH,
  archiveDir: ARCHIVE_DIR,
  totals: {
    archiveFiles: archiveEntries.length,
    parityOK: okList.length,
    dbMissing: missingList.length,
    archiveSprintCount: archiveEntries.filter((e) => e.kind === 'sprint').length,
    archiveRetroCount: archiveEntries.filter((e) => e.kind === 'retro').length,
    okSprintCount: okList.filter((e) => e.kind === 'sprint').length,
    okRetroCount: okList.filter((e) => e.kind === 'retro').length,
    missingSprintCount: missingList.filter((e) => e.kind === 'sprint').length,
    missingRetroCount: missingList.filter((e) => e.kind === 'retro').length,
  },
  dbStats,
  orphanDb: {
    sprint: orphanDbSprints.length,
    retro: orphanDbRetros.length,
  },
};

const summaryLine = `${okList.length} parity-OK, ${missingList.length} eksik (toplam ${archiveEntries.length} arşiv dosyası)`;

if (EMIT_JSON) {
  console.log(
    JSON.stringify({ summary, parityOK: okList, dbMissing: missingList }, null, 2),
  );
} else {
  console.log(`\n=== Archive ↔ memory.db Parity Verification ===`);
  console.log(`DB: ${DB_PATH} (readonly)`);
  console.log(`Archive: ${ARCHIVE_DIR}`);
  console.log(`Scanned at: ${summary.scannedAt}`);
  console.log(`\nDB row counts: type=sprint=${dbStats.type_sprint}, type=retro=${dbStats.type_retro}, total=${dbStats.total_entries}`);
  console.log(`\nArşiv: ${archiveEntries.length} dosya (sprint=${summary.totals.archiveSprintCount}, retro=${summary.totals.archiveRetroCount})`);
  console.log(`\n→ ${summaryLine}`);
  console.log(`   parity-OK breakdown: sprint=${summary.totals.okSprintCount}, retro=${summary.totals.okRetroCount}`);
  console.log(`   DB-eksik breakdown:  sprint=${summary.totals.missingSprintCount}, retro=${summary.totals.missingRetroCount}`);
  console.log(`   Orphan DB (arşiv .md yok): sprint=${orphanDbSprints.length}, retro=${orphanDbRetros.length}`);
  console.log(`\nB2 invariant: DB-eksik HİÇBİR dosya \`git rm --cached\` edilmez (önce backfill — BA-05 deseni).`);
}

// ── 5. Markdown rapor (opsiyonel) ────────────────────────────────────────────
if (REPORT_PATH) {
  const lines = [];
  lines.push(`# Archive ↔ memory.db Parity Report`);
  lines.push('');
  lines.push(`**Sprint:** 172 — Task B1 (172-008)`);
  lines.push(`**Scanned at:** ${summary.scannedAt}`);
  lines.push(`**DB:** \`${DB_PATH}\` (readonly)`);
  lines.push(`**Archive:** \`${ARCHIVE_DIR}\``);
  lines.push('');
  lines.push(`## Özet`);
  lines.push('');
  lines.push(`- **Toplam arşiv dosyası:** ${archiveEntries.length} (sprint=${summary.totals.archiveSprintCount}, retro=${summary.totals.archiveRetroCount})`);
  lines.push(`- **parity-OK:** ${okList.length} (sprint=${summary.totals.okSprintCount}, retro=${summary.totals.okRetroCount})`);
  lines.push(`- **DB-eksik:** ${missingList.length} (sprint=${summary.totals.missingSprintCount}, retro=${summary.totals.missingRetroCount})`);
  lines.push(`- **DB global:** type=sprint=${dbStats.type_sprint}, type=retro=${dbStats.type_retro}, total_entries=${dbStats.total_entries}`);
  lines.push('');
  lines.push(`## B2 İnvariantı`);
  lines.push('');
  lines.push(`> **DB-eksik HİÇBİR dosya \`git rm --cached\` edilmez.** Önce backfill (BA-05 deseni — örn. \`scripts/sprint-167-memory-backfill.mjs\`). DB-eksik dosyalar B2 kapsamı **DIŞINDA**.`);
  lines.push('');
  lines.push(`## Lookup Stratejisi`);
  lines.push('');
  lines.push(`Her arşiv dosyası iki yolla DB'de aranır (tolerans için):`);
  lines.push('');
  lines.push(`1. **by-id**: \`SELECT … WHERE id='sprint-log-NNN'\` veya \`'retro-sprint-NNN'\` (kanonik konvansiyon).`);
  lines.push(`2. **by-type-sprint_num**: \`SELECT … WHERE type='sprint'|'retro' AND sprint_num=NNN\` (fallback — id konvansiyonu farklıysa).`);
  lines.push('');
  lines.push(`Her iki sorgu da boş dönerse dosya **DB-eksik** sayılır.`);
  lines.push('');

  // ── parity-OK tablo ────────────────────────────────────────────────────────
  lines.push(`## parity-OK Listesi (${okList.length} dosya — B2 adayı)`);
  lines.push('');
  if (okList.length === 0) {
    lines.push(`_Yok._`);
  } else {
    lines.push(`| # | Dosya | Tür | Sprint# | DB id | Match Mode | DB Status |`);
    lines.push(`|---|-------|-----|---------|-------|-----------|-----------|`);
    const sorted = [...okList].sort(
      (a, b) => a.sprintNum - b.sprintNum || a.kind.localeCompare(b.kind),
    );
    sorted.forEach((e, i) => {
      lines.push(
        `| ${i + 1} | \`${e.file}\` | ${e.kind} | ${e.sprintNum} | \`${e.dbId}\` | ${e.matchMode} | ${e.dbStatus} |`,
      );
    });
  }
  lines.push('');

  // ── DB-eksik tablo ────────────────────────────────────────────────────────
  lines.push(`## DB-Eksik Listesi (${missingList.length} dosya — B2 KAPSAMI DIŞI)`);
  lines.push('');
  if (missingList.length === 0) {
    lines.push(`_Yok — tüm arşiv dosyaları DB'de mevcut._`);
  } else {
    lines.push(`| # | Dosya | Tür | Sprint# | Beklenen DB id |`);
    lines.push(`|---|-------|-----|---------|----------------|`);
    const sorted = [...missingList].sort(
      (a, b) => a.sprintNum - b.sprintNum || a.kind.localeCompare(b.kind),
    );
    sorted.forEach((e, i) => {
      lines.push(
        `| ${i + 1} | \`${e.file}\` | ${e.kind} | ${e.sprintNum} | \`${e.expectedId}\` |`,
      );
    });
  }
  lines.push('');

  // ── Orphan DB (arşivde .md yok) ───────────────────────────────────────────
  lines.push(`## Orphan DB Entries (DB'de var, arşivde .md yok)`);
  lines.push('');
  lines.push(`Bu kayıtlar DB'de mevcut ama \`.brain/archive/\` altında karşılık .md dosyası yok. BA-05 deseninin doğal sonucu (backfill yalnızca DB'ye yazıldı) veya \`.brain/sprints/\` altında kalmış aktif sprint logları.`);
  lines.push('');
  lines.push(`**Toplam:** sprint=${orphanDbSprints.length}, retro=${orphanDbRetros.length}`);
  lines.push('');
  if (orphanDbSprints.length > 0 || orphanDbRetros.length > 0) {
    lines.push(`| Tür | Sprint# | DB id |`);
    lines.push(`|-----|---------|-------|`);
    for (const r of orphanDbSprints) {
      lines.push(`| sprint | ${r.sprint_num} | \`${r.id}\` |`);
    }
    for (const r of orphanDbRetros) {
      lines.push(`| retro | ${r.sprint_num} | \`${r.id}\` |`);
    }
  } else {
    lines.push(`_Yok — DB'deki her sprint/retro entry'nin arşivde karşılığı var._`);
  }
  lines.push('');

  // ── Spot-check kanıtları ──────────────────────────────────────────────────
  lines.push(`## Spot-Check Kanıtları`);
  lines.push('');
  lines.push(`Aşağıdaki dosyalar bilinen referans noktaları — beklenen davranış (gerçek arşiv durumuna göre):`);
  lines.push('');
  const spotCases = [
    { file: 'retro-sprint-171.md', expect: 'parity-OK', reason: 'Sprint 171 retro DB\'ye yazıldı + archive .md mevcut.' },
    { file: 'retro-sprint-168.md', expect: 'parity-OK', reason: 'Sprint 168 retro DB\'ye yazıldı + archive .md mevcut.' },
    { file: 'sprint-001.md', expect: 'DB-eksik', reason: 'Çok eski sprint, DB öncesi era; backfill kapsamı dışı.' },
    { file: 'retro-sprint-058.md', expect: 'DB-eksik', reason: 'Eski retro, DB\'ye hiç yazılmamış.' },
    { file: 'sprint-167.md', expect: 'arşivde YOK', reason: 'BA-05 backfill yalnızca DB\'ye yazdı (sprint-log-167) — archive .md yok. .brain/sprints/sprint-167.md mevcut ama bu script kapsamı dışı.' },
    { file: 'retro-sprint-167.md', expect: 'arşivde YOK', reason: 'BA-05 backfill yalnızca DB\'ye yazdı (retro-sprint-167) — archive .md yok.' },
  ];
  lines.push(`| Dosya | Beklenen | Gerçekleşen | Açıklama |`);
  lines.push(`|-------|----------|-------------|----------|`);
  for (const sc of spotCases) {
    const actuallyOK = okList.find((e) => e.file === sc.file);
    const actuallyMissing = missingList.find((e) => e.file === sc.file);
    let actual;
    if (actuallyOK) actual = `parity-OK (\`${actuallyOK.dbId}\`)`;
    else if (actuallyMissing) actual = `DB-eksik`;
    else actual = `arşivde YOK`;
    const ok = actual.startsWith(sc.expect.split(' ')[0]) ? '✓' : '✗';
    lines.push(`| \`${sc.file}\` | ${sc.expect} | ${actual} ${ok} | ${sc.reason} |`);
  }
  lines.push('');

  // ── Sonraki adımlar ──────────────────────────────────────────────────────
  lines.push(`## Sonraki Adım (B2 — 172-009)`);
  lines.push('');
  lines.push(`1. **.gitignore + .npmignore** güncellemesi (SYNTHESIS §4.3 blok).`);
  lines.push(`2. **\`git rm --cached -r\`** yalnızca **parity-OK** listesindeki ${okList.length} dosya + ignore kapsamı.`);
  lines.push(`3. **DB-eksik** ${missingList.length} dosya **diskte kalır + git takipte kalır** — backfill gelene dek silinmez.`);
  lines.push(`4. \`memory.db\` ASLA ignore edilmez (zaten gitignored ama tekrar doğrula).`);
  lines.push(`5. \`npm pack --dry-run\` temiz paket boyutu doğrula.`);
  lines.push('');
  lines.push(`## Üretim Komutu`);
  lines.push('');
  lines.push(`\`\`\`bash`);
  lines.push(`node scripts/verify-archive-db-parity.mjs --report docs/audits/sprint-171/archive-parity-report.md`);
  lines.push(`\`\`\``);
  lines.push('');

  writeFileSync(REPORT_PATH, lines.join('\n'), 'utf-8');
  if (!EMIT_JSON) {
    console.log(`\n📝 Markdown rapor yazıldı: ${REPORT_PATH}`);
  }
}

// Script daima 0 — gate değil, rapor üreticisi.
process.exit(0);
