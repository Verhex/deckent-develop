#!/usr/bin/env node
/**
 * Sprint 167 Memory Backfill — non-destructive (BA-05 kurtarma, Sprint 171 audit)
 *
 * memory.db'de sprint-167 = 0 satır (BA-05 CONFIRMED). ADR-046 hook persist
 * etmedi (kronik ≤166; 166 fe35c49 ile elle kurtarıldı, 167 almadı).
 *
 * 3 eksik kayıt — HER ALAN GERÇEK ARTEFAKTA İZLENİR (uydurma YOK):
 *   1. sprint-log-167  ← .brain/sprints/sprint-167.md (birebir)
 *   2. retro-sprint-167 ← git 0da523c+863de9a + .deckent/sprint-167-gate.json
 *   3. mem-sprint-167   ← .audit/sprint-167/T1..T7*.md (audit deliverable başlık/bulgu)
 *
 * Usage:
 *   node scripts/sprint-167-memory-backfill.mjs            # DRY-RUN (varsayılan, yazma yok)
 *   node scripts/sprint-167-memory-backfill.mjs --apply    # YAZAR (Alperen onayı sonrası)
 *
 * Yazma SADECE MemoryStore.upsert (insert-if-absent / field-level + entry_history).
 * DB silme/rebuild ASLA. APPLY öncesi taze .bak. fe35c49 precedent aynası.
 */

import { MemoryStore } from '../dist/core/memory-store.js';
import { readFileSync, copyFileSync } from 'node:fs';
import Database from 'better-sqlite3';

const APPLY = process.argv.includes('--apply');
const MODE = APPLY ? 'APPLY' : 'DRY-RUN';
const DB_PATH = '.brain/memory.db';
const CHANGED_BY = 'sprint-167-backfill';

console.log(`\n=== Sprint 167 Memory Backfill — Mode: ${MODE} ===\n`);

// === PRE state (sprint-167 specific + global) ===
const preDb = new Database(DB_PATH, { readonly: true });
const preState = {
  sprint167_total: preDb.prepare("SELECT COUNT(*) c FROM entries WHERE sprint_id='sprint-167'").get().c,
  sprint: preDb.prepare("SELECT COUNT(*) c FROM entries WHERE type='sprint'").get().c,
  retro: preDb.prepare("SELECT COUNT(*) c FROM entries WHERE type='retro'").get().c,
  memory: preDb.prepare("SELECT COUNT(*) c FROM entries WHERE type='memory'").get().c,
  total: preDb.prepare('SELECT COUNT(*) c FROM entries').get().c,
};
preDb.close();
console.log('PRE STATE:', JSON.stringify(preState));
if (preState.sprint167_total !== 0) {
  console.log(`  ⚠ sprint-167 already has ${preState.sprint167_total} rows — upsert field-level update yapacak (non-destructive).`);
}

// === Entry 1: sprint-log-167 (kaynak: .brain/sprints/sprint-167.md birebir) ===
const sprintLogBody = readFileSync('.brain/sprints/sprint-167.md', 'utf-8');
const sprintLog167 = {
  id: 'sprint-log-167',
  type: 'sprint',
  source: 'brain',
  title: 'Sprint 167 Log',
  content: sprintLogBody,
  status: 'active',
  sprint_id: 'sprint-167',
  sprint_num: 167,
  decay_exempt: false,
  tags: ['sprint-167', 'self-audit', 'read-only', 'bug-cluster', 'sprint-168-seed'],
  metadata: { source: '.brain/sprints/sprint-167.md', backfill: 'sprint-171-BA-05', precedent: 'fe35c49' },
};

// === Entry 2: retro-sprint-167 (kaynak: gate.json + 0da523c/863de9a commit + sprint-167.md metrics) ===
const retroSprint167 = {
  id: 'retro-sprint-167',
  type: 'retro',
  source: 'brain',
  title: 'Sprint sprint-167 Retrospective',
  content: `# Sprint sprint-167 Retrospective

## Summary
Sprint 167 = Read-Only Self-Audit (Sprint 166 archive denetimi). 10 task, 9 DONE / 1 NO_GO / 2 GO_WITH_TECH_DEBT (kaynak: .brain/sprints/sprint-167.md). Brain finalize crash'lendi — bu retro BA-05 kapsamında (Sprint 171) gerçek artefaktlardan geriye türetildi.

## Gate (kaynak: .deckent/sprint-167-gate.json)
| Gate | Sonuç |
|------|-------|
| tsc | PASS (0 error) |
| vitest | FAIL (delta fail=2) |
| honesty | 0 violation |
| observability | metrics.jsonl 10 satır |
| overall | GATE_FAILURE |

## Forensic Çıktı (kaynak: git 0da523c debug-phase1 + 863de9a debug-phase2)
systematic-debugging ile 10 Brain orchestration bug + BUG-HH (Alperen explicit request — prompt file premature deletion canlı kök) tespit edildi.

10 bug → 5 architectural cluster:
- **Cluster A** — Brain Finalize Hook Chain Implementation Gap (BUG-CC/DD/EE/GG; Sprint 161/163/166/167 4 wire attempt, hâlâ kısmî) ← **BA-05'in kök ailesi (BUG-DD: memory.db Sprint entry eksik)**
- **Cluster B** — Locking Infrastructure Asymmetry (RC4 Bug E SpawnLock; 11 sprint orphan)
- **Cluster C** — Plan↔Spawn Integration Disconnect (RC1 Bug Z2 / RC2 SCOPE_COLLISION / RC3 cache; 29 sprint orphan)
- **Cluster D** — Sprint Metrics Math (BUG-FF; Duration negatif, Coverage NaN — sprint-167.md'de canlı görünür)
- **Cluster E** — Worker Lifecycle Mismatch (BUG-HH; claude.ts:125 non-selective cleanup; 2/7 worker NO_GO sebebi) ← cascade ENDPOINT

KRİTİK: BUG-HH single point of failure — Cluster B+C+A herhangi bir kill tetiklerse BUG-HH cascade. Sprint 168 Wave 1 P0 sırası: C0e Prompt Lifecycle → C0b SpawnLock → C0c Plan↔Spawn → C0a Hook Chain → C0d Metrics Math.

## Sprint 168 Seed
Brain Repair Phase spec (12 task, 5 critical C0a-C0e). ADR-048 Prompt Lifecycle Contract bu sprint'in çıktısı.

## Status
GATE_FAILURE (vitest 2 fail — kronik regresyon ailesi). Sprint kendini DB'ye finalize edemedi → BA-05 (Sprint 171) backfill.`,
  status: 'active',
  sprint_id: 'sprint-167',
  sprint_num: 167,
  decay_exempt: false,
  tags: ['sprint-167', 'retro', 'self-audit', '10-bug', '5-cluster', 'bug-hh', 'sprint-168-seed'],
  metadata: { source: 'git:0da523c,863de9a + .deckent/sprint-167-gate.json + .brain/sprints/sprint-167.md', backfill: 'sprint-171-BA-05' },
};

// === Entry 3: mem-sprint-167 (kaynak: .audit/sprint-167/T1..T7*.md başlık/bulgu) ===
const memSprint167 = {
  id: 'mem-sprint-167',
  type: 'memory',
  source: 'brain',
  title: 'Sprint sprint-167 Learnings',
  content: `# Sprint sprint-167 Learnings

Sprint 167 Read-Only Self-Audit deliverable'ları (kaynak: .audit/sprint-167/T*.md — hiçbir source/doc mutasyonu yok, salt tespit).

## T1 — Code Inventory + Dead Code + Unused Features (167-001, code-reviewer)
Kaynak: .audit/sprint-167/T1-code-inventory.md. Kod envanteri + ölü kod + kullanılmayan feature taraması (Sprint 171 dead-code audit'inin öncülü).

## T2 — Doc Inventory + Reference Validation + Ground-Truth (167-002, doc-writer)
Kaynak: .audit/sprint-167/T2-doc-inventory.md. READ-ONLY doc envanteri + kırık referans + ground-truth doğrulama. (Sprint 167 retro NO_GO bu task'tı.)

## T3 — ADR Compliance + Status (167-003, code-reviewer)
Kaynak: .audit/sprint-167/T3-adr-compliance.md. 50 ADR enumeration (DB↔FS parity) + 8 ADR runtime compliance + ADR-046 Step 1-4 wire canlı trigger + identity-generator Step 2 decommission önerisi + ADR-053/055/060 (Sprint 156'dan beri proposed) closure önerisi. Tümü Sprint 168 suggested_fix input'u.

## T4 — Memory.db + Data Integrity (167-004, data-engineer)
Kaynak: .audit/sprint-167/T4-memory-integrity.md. memory.db schema + FTS5 + relations integrity (Sprint 171 memory-db-integrity audit'inin öncülü).

## T5 — Brain/Worker/Auditor Wire + Manuel Survival (167-005, bug-fixer FORENSIC)
Kaynak: T5-brain-wire-audit.md + T5-brain-debug-phase1.md + T5-brain-debug-phase2.md. 9 Brain orchestration bug + BUG-HH forensic; 5 cluster pattern analysis; manuel survival pattern kanıtı (ADR-047 input).

## T6 — Test + Build + Security + OSS Readiness (167-006, security-auditor)
Kaynak: .audit/sprint-167/T6-test-build-security.md. tsc PASS / vitest 2 fail / OSS gate readiness forensic.

## T7 — Cross-Cutting Synthesis + Brain Crash Addendum (167-007, architect)
Kaynak: T7-cross-cutting-synthesis.md + T7-brain-crash-addendum.md. Meta-audit konsolidasyon + Alperen request Brain crash sebep detayı (live evidence).

## Kalıcı Öğrenim
- ADR-046 hook chain Sprint 161/163/166/167 dört kez wire denendi, hâlâ kısmî → BA-05'in (Sprint 171) doğrudan kökü; tam crash-safe fix post-GA integrity-V2 sprintine.
- Sprint metrics math guard (Duration negatif / Coverage NaN) sprint-167.md'de canlı kanıt — finalize crash imzası.
- Read-only self-audit deseni Sprint 171'in 29-task mega-audit'inin doğrudan atası.`,
  status: 'active',
  sprint_id: 'sprint-167',
  sprint_num: 167,
  decay_exempt: false,
  tags: ['sprint-167', 'learnings', 'self-audit', 'dead-code', 'adr-compliance', 'memory-integrity', 'oss-readiness'],
  metadata: { source: '.audit/sprint-167/T1-code-inventory.md,T2-doc-inventory.md,T3-adr-compliance.md,T4-memory-integrity.md,T5-brain-wire-audit.md,T6-test-build-security.md,T7-cross-cutting-synthesis.md', backfill: 'sprint-171-BA-05' },
};

const entries = [sprintLog167, retroSprint167, memSprint167];

// === STAGE: 3 upsert (DRY-RUN önizleme / APPLY yazar) ===
console.log('\n--- STAGE: sprint-log-167 + retro-sprint-167 + mem-sprint-167 ---');
for (const e of entries) {
  console.log(`  ${APPLY ? 'UPSERT' : 'WOULD UPSERT'}: ${e.id} (type=${e.type}, content_len=${e.content.length}, tags=${e.tags.length}, source=${e.metadata.source.slice(0, 60)}...)`);
}

if (APPLY) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const bak = `${DB_PATH}.bak-pre-sprint167-backfill-${ts}`;
  copyFileSync(DB_PATH, bak);
  console.log(`\n  .bak oluşturuldu: ${bak}`);
  const store = new MemoryStore(DB_PATH);
  for (const e of entries) {
    store.upsert(e, CHANGED_BY);
    console.log(`  UPSERTED: ${e.id}`);
  }
  store.close();
} else {
  console.log('\n  DRY-RUN — hiçbir yazma yapılmadı (.bak yok, DB değişmedi).');
}

// === POST state + DELTA ===
const postDb = new Database(DB_PATH, { readonly: true });
const postState = {
  sprint167_total: postDb.prepare("SELECT COUNT(*) c FROM entries WHERE sprint_id='sprint-167'").get().c,
  sprint: postDb.prepare("SELECT COUNT(*) c FROM entries WHERE type='sprint'").get().c,
  retro: postDb.prepare("SELECT COUNT(*) c FROM entries WHERE type='retro'").get().c,
  memory: postDb.prepare("SELECT COUNT(*) c FROM entries WHERE type='memory'").get().c,
  total: postDb.prepare('SELECT COUNT(*) c FROM entries').get().c,
};
const s167 = postDb.prepare("SELECT id,type,sprint_id,sprint_num,status FROM entries WHERE sprint_id='sprint-167' ORDER BY type").all();
let fts = { c: 0 };
// FTS5: hyphen bare token = kolon-syntax hatası; quoted phrase kullan
try { fts = postDb.prepare(`SELECT count(*) c FROM entries_fts WHERE entries_fts MATCH '"sprint-167"'`).get(); } catch { /* fts optional */ }
postDb.close();

console.log('\n=== POST STATE ===');
console.log('PRE: ', JSON.stringify(preState));
console.log('POST:', JSON.stringify(postState));
console.log('DELTA:', JSON.stringify({
  sprint167_total: postState.sprint167_total - preState.sprint167_total,
  sprint: postState.sprint - preState.sprint,
  retro: postState.retro - preState.retro,
  memory: postState.memory - preState.memory,
  total: postState.total - preState.total,
}));
console.log('sprint-167 rows:', JSON.stringify(s167));
console.log('FTS5 match "sprint-167":', fts.c, APPLY ? '(trigger sync beklenir ≥3)' : '(dry-run — değişmedi)');
console.log(`\nMode: ${APPLY ? 'APPLIED' : 'DRY-RUN (no writes)'}`);
console.log('Script finished.\n');
