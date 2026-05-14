#!/usr/bin/env node
/**
 * Sprint 166 Memory Backfill — non-destructive
 *
 * 9 eksik kazanım:
 *   1-4. ADR-043/044/045/046 (docs/adr/*.md → memory.db, T1 wire live test)
 *   5-6. sprint-log-165 + sprint-log-166 (type='sprint')
 *   7-8. retro-sprint-166 + mem-sprint-166 (type='retro' + 'memory')
 *   9.   100 debt row sprint_id backfill (Bug V wire live test)
 *
 * Usage:
 *   node scripts/sprint-166-memory-backfill.mjs --dry-run
 *   node scripts/sprint-166-memory-backfill.mjs --apply
 *
 * Tüm operasyonlar UPSERT/UPDATE pattern — DB silinmez, mevcut kayıt korunur.
 * FTS5 trigger (entries_ai/au) otomatik index'ler.
 */

import { MemoryStore } from '../dist/core/memory-store.js';
import { syncAdrFilesToDb } from '../dist/core/adr-file-sync.js';
import Database from 'better-sqlite3';

const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');

if (!DRY_RUN && !APPLY) {
  console.error('Usage: --dry-run veya --apply');
  process.exit(1);
}

const DB_PATH = '.brain/memory.db';
const ADR_DIR = 'docs/adr';
const CHANGED_BY = 'sprint-166-manual-backfill';

console.log(`\n=== Sprint 166 Memory Backfill — Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'} ===\n`);

// === Pre-state snapshot ===
const preDb = new Database(DB_PATH, { readonly: true });
const preState = {
  adr: preDb.prepare("SELECT COUNT(*) c FROM entries WHERE type='adr'").get().c,
  sprint: preDb.prepare("SELECT COUNT(*) c FROM entries WHERE type='sprint'").get().c,
  retro: preDb.prepare("SELECT COUNT(*) c FROM entries WHERE type='retro'").get().c,
  memory: preDb.prepare("SELECT COUNT(*) c FROM entries WHERE type='memory'").get().c,
  debt_null: preDb.prepare("SELECT COUNT(*) c FROM entries WHERE type='debt' AND sprint_id IS NULL").get().c,
  total: preDb.prepare('SELECT COUNT(*) c FROM entries').get().c,
};
preDb.close();
console.log('PRE STATE:', JSON.stringify(preState));

// === STAGE 1: ADR sync (T1 Bug M wire live test) ===
console.log('\n--- STAGE 1: syncAdrFilesToDb (docs/adr/*.md → memory.db) ---');
const adrStore = new MemoryStore(DB_PATH);

if (DRY_RUN) {
  // Parse-only preview
  const { parseAdrFile } = await import('../dist/core/adr-file-sync.js');
  const { readdirSync } = await import('node:fs');
  const { join } = await import('node:path');
  const files = readdirSync(ADR_DIR).filter(f => /^\d{3}-/.test(f)).sort();
  let inserts = 0, updates = 0, skips = 0;
  for (const f of files) {
    const parsed = parseAdrFile(join(ADR_DIR, f));
    if (!parsed) { skips++; continue; }
    const existing = adrStore.getById(parsed.id, { includeDeleted: true });
    if (!existing) inserts++;
    else if (existing.title !== parsed.title || existing.content !== parsed.content) updates++;
    else skips++;
  }
  console.log(`  WOULD: inserts=${inserts}, updates=${updates}, skips=${skips}, total=${files.length}`);
} else {
  const adrResult = syncAdrFilesToDb(adrStore, ADR_DIR, { changedBy: CHANGED_BY });
  console.log(`  RESULT: inserted=${adrResult.inserted}, updated=${adrResult.updated}, skipped=${adrResult.skipped}`);
  if (adrResult.errors.length) console.log('  ERRORS:', adrResult.errors);
  console.log('  IDs:', adrResult.ids.slice(0, 20).join(', ') + (adrResult.ids.length > 20 ? '...' : ''));
}

// === STAGE 2: sprint-log-165 + sprint-log-166 ===
console.log('\n--- STAGE 2: sprint-log-165 + sprint-log-166 upsert ---');

const sprintLog165 = {
  id: 'sprint-log-165',
  type: 'sprint',
  source: 'brain',
  title: 'Sprint 165 Log',
  content: `# Sprint 165 Log

## Theme
Brain Final Stability + Open Source Hazırlık (npm publish v1.0.0-beta.1 readiness)

## Tasks: 5/5 DONE
- T1 (Bug X): "no-result → CODE_VERIFIED_DONE" stub kaldırıldı, honest-result gate
- T2 (Bug Y): processQueue legacy FIFO stall fix (flag false modunda) — respawnEligibleTasks 13 grep match canlı çalışıyor
- T3 (Bug Z): vitest gate +1 fail kronik regresyon kaynak forensic + worker/Brain audit uyumu
- T4 (Bug W): dead_event_stream detector activate (Sprint 148 reserve cleared)
- T5: Documentation freeze + public repo flip prep

## Outcome
- 5/5 task DONE
- npm publish v1.0.0-beta.1 hazır
- Open Source GA Sprint 168'e ertelendi (refactor önce)

## Status
GO_WITH_GATE_FAILURE (vitest 2 failing tests — Bug L Sprint 166 T10'da fix)`,
  status: 'active',
  sprint_id: 'sprint-165',
  sprint_num: 165,
  decay_exempt: false,
  tags: ['sprint-165', 'brain-stability', 'open-source-prep', 'bug-x', 'bug-y', 'bug-z', 'bug-w'],
};

const sprintLog166 = {
  id: 'sprint-log-166',
  type: 'sprint',
  source: 'brain',
  title: 'Sprint 166 Log',
  content: `# Sprint 166 Log

## Theme
Brain Self-Update + Data Integrity Closure

## Tasks: 11/11 DONE (10 DONE + 1 GO_WITH_TECH_DEBT)
- T1 (Bug M): adrInsert hook + Step 3 wire (633 LoC, run-mp47cm54)
- T2 (Bug N+O): onRuleRegen manual finalize wire + CUSTOM_TEMPLATE
- T3 (Bug S): doc-cache sprint-aware cache key (GO_WTD — runner wire-up Sprint 167)
- T4 (Bug Y2): doc-sync ground-truth 3-layer defense + .deckent/ground-truth-overrides.json whitelist
- T5 (Bug R+T+Y2 corr): AGENTS.md docs.json + 15 agent correction (5 root .md)
- T6 (Bug U+V): sprint type insert wire + debt sprint_id backfill code
- T7 (Bug C+X): DECKENT.md broken ref + summary debt filter (status!=='resolved')
- T8 (Bug P): TOOLS/BOOT/WORKER-GUIDE auto-content generators (5 yeni generator)
- T9 (Bug Q+W): provider parity (.codex+.gemini+.cursor) + emitAlert helper + stale_md detector
- T10 (Bug K+L): verify-ran atomic write + stale doc test (sprint history 22→27 tools)
- T11: ADR-046 Brain Self-Update Hook Architecture (MADR v3, accepted)

## Outcome
- 11/11 task DONE
- ~2735 LoC, 35+ test PASS, 0 regression
- ADR-046 accepted (Step Ordering Contract Section 5.1)
- Docker memory 4GB → 8GB (Bug G workaround)

## Sprint 167 P0 (4 yeni bug live replay)
- Bug E (Spawn-lock leak, 3× replay aynı sprint)
- Bug G (OOM exit 137 — workaround applied, adaptive fix Sprint 167)
- Bug Z2 (Planner Files parser bare token)
- Bug Z3 (memory rebuild semantic — destructive, canlı kanıt)

## Status
DONE (manual finalize chain — Brain finalize gerçek çalıştırılmadı, T1+T6+T11 wire'lar manuel backfill script ile production'da live test edildi)`,
  status: 'active',
  sprint_id: 'sprint-166',
  sprint_num: 166,
  decay_exempt: false,
  tags: ['sprint-166', 'brain-self-update', 'data-integrity', 'adr-046', 'bug-m', 'bug-n', 'bug-s', 'bug-y2'],
};

if (DRY_RUN) {
  console.log(`  WOULD UPSERT: ${sprintLog165.id} (content_len=${sprintLog165.content.length})`);
  console.log(`  WOULD UPSERT: ${sprintLog166.id} (content_len=${sprintLog166.content.length})`);
} else {
  adrStore.upsert(sprintLog165, CHANGED_BY);
  console.log(`  UPSERTED: ${sprintLog165.id}`);
  adrStore.upsert(sprintLog166, CHANGED_BY);
  console.log(`  UPSERTED: ${sprintLog166.id}`);
}

// === STAGE 3: retro-sprint-166 + mem-sprint-166 ===
console.log('\n--- STAGE 3: retro-sprint-166 + mem-sprint-166 upsert ---');

const retroSprint166 = {
  id: 'retro-sprint-166',
  type: 'retro',
  source: 'brain',
  title: 'Sprint sprint-166 Retrospective',
  content: `# Sprint sprint-166 Retrospective

## Summary
Completed 11/11 tasks (10 DONE + 1 GO_WITH_TECH_DEBT). Theme: Brain Self-Update + Data Integrity Closure.

## Highlights
- 4 architectural root cause fix: Bug M (adrInsert hook), Bug N (onRuleRegen wire), Bug S (sprint-aware cache), Bug Y2 (ground-truth defense)
- ADR-046 Brain Self-Update Hook Architecture (MADR v3 hybrid, accepted)
- Step Ordering Contract Section 5.1: Step 3 adrInsert + Step 4 ruleRegen renumbered
- Data integrity wire: sprint type insert + debt sprint_id backfill code shipped
- ~2735 LoC, 35+ new tests, 0 regression
- 0 NO_GO

## Metrics
| What | Value |
|------|-------|
| Tasks completed | 11/11 (10 DONE + 1 GO_WTD) |
| New code | ~2735 LoC |
| New tests | 35+ PASS |
| Regressions | 0 |
| New ADRs | 1 (ADR-046) |
| Live bugs detected | 4 (E, G, Z2, Z3) |

## Status
GO (manual finalize, Sprint 166 commit'leri main branch'te b01642b → c140fdb + afc2638)

## Sprint 167 P0 Bugs (Live Replay)
- Bug E: Spawn-lock leak (3× aynı sprint, manuel survival lock takip)
- Bug G: OOM exit 137 (4GB→8GB workaround proven)
- Bug Z2: Planner Files parser bare token
- Bug Z3: memory rebuild semantic — destructive (delete-or-error). Sprint 167 fix: rebuild = export, import = new command`,
  status: 'active',
  sprint_id: 'sprint-166',
  sprint_num: 166,
  decay_exempt: false,
};

const memSprint166 = {
  id: 'mem-sprint-166',
  type: 'memory',
  source: 'brain',
  title: 'Sprint sprint-166 Learnings',
  content: `# Sprint sprint-166 Learnings

## 4 Architectural Root Cause Fix
1. **Bug M (adrInsert hook):** docs/adr/*.md → memory.db migration eksikti. Step 3 unconditional invocation pattern + syncAdrFilesToDb upsert ile çözüldü. ADR-046 Section 5.1 Step Ordering Contract kontract.
2. **Bug N (onRuleRegen wire):** Manuel finalize path .claude/rules/*.md regenerate etmiyordu (13 sprint stale). finalize.ts:166 callback wire + rule-generator.ts CUSTOM_TEMPLATE empty placeholder.
3. **Bug S (sprint-aware cache key):** doc-cache.ts cache key fileHash+entryHash idi, sprint.id eklendi. Runner wire-up Sprint 167'e ertelendi (GO_WITH_TECH_DEBT).
4. **Bug Y2 (ground-truth defense):** Doc-sync agent'lar stale numeric claim üretiyordu (15 vs 16 agents Sprint 164 regression). 3-layer defense (plan-time + helper + runtime) + .deckent/ground-truth-overrides.json whitelist.

## Key Decision: ADR-046 Brain Self-Update Hook Architecture
- Post-finalize hook chain architectural contract dokümante
- Step ordering: Step 1 memoryExport → Step 2 identityRegen (deprecated) → Step 3 adrInsert → Step 4 ruleRegen → Step 5 updateProjectDocs
- 3 mimari prensip: unconditional invocation, cache key completeness, single registration target
- Falsifiable M1-M4 monitoring criteria for Sprint 167-168
- Sprint 170 refactor trigger criteria documented

## Manuel Survival Pattern (Sprint 164→165→166 zincir kanıt)
- Brain SPAWN/finalize otomatik chain çalışmıyor, manuel müdahale ile her sprint başarılı
- npx deckent spawn <task-id> --auto-approve (CLI proven)
- npx deckent run "<description>" (sprint-dışı proven)
- Wave 1.5 strict gate manuel CHECKPOINT (npx deckent memory rebuild + decision JSON)

## 4 New Bug Live Replay (Sprint 167 P0)
- **Bug E:** Spawn-lock leak — DECKENT.md, .md, brain.md bare token lock conflict, 3× replay aynı sprint
- **Bug G:** OOM exit 137 — Container 4GB → 8GB workaround proven (spawn-backend-docker.ts:374)
- **Bug Z2:** Planner Files parser — DIRECTIVES.md Files: listesinden bare token üretiyor (.md, brain.md, git commit hash)
- **Bug Z3:** memory rebuild semantic — destructive (delete-or-error, exports yetersiz). Sprint 167'de fix: rebuild = export, import = new command

## Bug V Backfill Manuel Test
- T6 commit "production backfill ran 100 debt rows" — DB'de hâlâ NULL bulundu (Sprint 166 sonu inspection)
- Worker farklı db kullandığı veya code-path canlı tetiklenmediği için
- Sprint 166 manuel backfill script (bu script) ile bu açık kapatıldı (UPDATE entries SET sprint_id=metadata.originSprintId)`,
  status: 'active',
  sprint_id: 'sprint-166',
  sprint_num: 166,
  decay_exempt: false,
  tags: ['sprint-166', 'learnings', 'bug-m', 'bug-n', 'bug-s', 'bug-y2', 'adr-046', 'manual-survival', 'bug-e', 'bug-g', 'bug-z2', 'bug-z3'],
};

if (DRY_RUN) {
  console.log(`  WOULD UPSERT: ${retroSprint166.id} (content_len=${retroSprint166.content.length})`);
  console.log(`  WOULD UPSERT: ${memSprint166.id} (content_len=${memSprint166.content.length})`);
} else {
  adrStore.upsert(retroSprint166, CHANGED_BY);
  console.log(`  UPSERTED: ${retroSprint166.id}`);
  adrStore.upsert(memSprint166, CHANGED_BY);
  console.log(`  UPSERTED: ${memSprint166.id}`);
}

adrStore.close();

// === STAGE 4: Debt sprint_id backfill (Bug V live test) ===
console.log('\n--- STAGE 4: 100 debt sprint_id backfill (UPDATE) ---');

const rawDb = new Database(DB_PATH);
const previewSQL = `
  SELECT COUNT(*) c
  FROM entries
  WHERE type='debt'
    AND sprint_id IS NULL
    AND json_extract(metadata, '$.originSprintId') IS NOT NULL
`;
const eligible = rawDb.prepare(previewSQL).get().c;
console.log(`  Eligible debt rows (sprint_id NULL + has metadata.originSprintId): ${eligible}`);

if (DRY_RUN) {
  const samples = rawDb.prepare(`
    SELECT id,
           json_extract(metadata, '$.originSprintId') AS new_sprint_id,
           CAST(SUBSTR(json_extract(metadata, '$.originSprintId'), 8) AS INTEGER) AS new_sprint_num
    FROM entries
    WHERE type='debt' AND sprint_id IS NULL
      AND json_extract(metadata, '$.originSprintId') IS NOT NULL
    LIMIT 3
  `).all();
  console.log('  SAMPLE preview (first 3):');
  samples.forEach(s => console.log('    ' + JSON.stringify(s)));
  console.log(`  WOULD UPDATE: ${eligible} rows`);
} else {
  const updateSQL = `
    UPDATE entries
    SET sprint_id = json_extract(metadata, '$.originSprintId'),
        sprint_num = CAST(SUBSTR(json_extract(metadata, '$.originSprintId'), 8) AS INTEGER),
        updated_at = datetime('now')
    WHERE type='debt'
      AND sprint_id IS NULL
      AND json_extract(metadata, '$.originSprintId') IS NOT NULL
  `;
  const result = rawDb.prepare(updateSQL).run();
  console.log(`  UPDATED: ${result.changes} debt rows`);
}
rawDb.close();

// === Post-state snapshot ===
const postDb = new Database(DB_PATH, { readonly: true });
const postState = {
  adr: postDb.prepare("SELECT COUNT(*) c FROM entries WHERE type='adr'").get().c,
  sprint: postDb.prepare("SELECT COUNT(*) c FROM entries WHERE type='sprint'").get().c,
  retro: postDb.prepare("SELECT COUNT(*) c FROM entries WHERE type='retro'").get().c,
  memory: postDb.prepare("SELECT COUNT(*) c FROM entries WHERE type='memory'").get().c,
  debt_null: postDb.prepare("SELECT COUNT(*) c FROM entries WHERE type='debt' AND sprint_id IS NULL").get().c,
  total: postDb.prepare('SELECT COUNT(*) c FROM entries').get().c,
};

// Sprint 166 specific verification
const sprint166Checks = {
  adr_043: postDb.prepare("SELECT COUNT(*) c FROM entries WHERE id='adr-043'").get().c,
  adr_044: postDb.prepare("SELECT COUNT(*) c FROM entries WHERE id='adr-044'").get().c,
  adr_045: postDb.prepare("SELECT COUNT(*) c FROM entries WHERE id='adr-045'").get().c,
  adr_046: postDb.prepare("SELECT COUNT(*) c FROM entries WHERE id='adr-046'").get().c,
  sprint_log_165: postDb.prepare("SELECT COUNT(*) c FROM entries WHERE id='sprint-log-165'").get().c,
  sprint_log_166: postDb.prepare("SELECT COUNT(*) c FROM entries WHERE id='sprint-log-166'").get().c,
  retro_166: postDb.prepare("SELECT COUNT(*) c FROM entries WHERE id='retro-sprint-166'").get().c,
  mem_166: postDb.prepare("SELECT COUNT(*) c FROM entries WHERE id='mem-sprint-166'").get().c,
};
postDb.close();

console.log('\n=== POST STATE ===');
console.log('PRE:  ', JSON.stringify(preState));
console.log('POST: ', JSON.stringify(postState));
console.log('DELTA:', JSON.stringify({
  adr: postState.adr - preState.adr,
  sprint: postState.sprint - preState.sprint,
  retro: postState.retro - preState.retro,
  memory: postState.memory - preState.memory,
  debt_null: postState.debt_null - preState.debt_null,
  total: postState.total - preState.total,
}));
console.log('Sprint 166 entry checks:', JSON.stringify(sprint166Checks));

console.log(`\nMode: ${DRY_RUN ? 'DRY-RUN (no writes)' : 'APPLIED'}`);
console.log('Script finished.\n');
