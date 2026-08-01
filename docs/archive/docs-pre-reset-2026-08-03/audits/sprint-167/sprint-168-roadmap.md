# Sprint 168 Roadmap — Remediation + Open Source GA Prep

**Source:** Sprint 167 audit T1-T6 (T2 retry sonrası dahil) + T7 cross-cutting synthesis
**Üretici:** T7 architect agent (167-007) — RETRY (T2 dahil)
**Tarih:** 2026-05-14
**Read-only:** Bu roadmap Sprint 168 DIRECTIVES.md'nin seed'idir. Source/doc mutation YOK.

---

## 0. Roadmap Özeti

- **Toplam task:** 12 (Spec §3.6 GO/NO_GO `task count ≤ 12 ✓`)
- **Critical (P0):** 4 (C1-C4) — Sprint 168 must-fix
- **High (P0/P1):** 6 (H1-H6) — Sprint 169 GA blocker subset
- **Medium (P1 bundle):** 2 (M1, M2) — cluster bundle tasks
- **4-field schema:** her task'ta severity / suggested_fix / sprint_slot / effort_estimate
- **Catch-22 esnek karar:** Sprint 167 NO_GO durumda Sprint 168 scope shrunk → C1-C4 + H1-H3 (7 task), M1/M2 Sprint 169'a kayar

---

## 1. Critical Tasks (4)

### C1 — Memory Relations 39% Broken + ID Canonical Migration

**Source findings:** T4 §3.5 (CRITICAL — 51/131 broken), T4 §2.6 (HIGH — 3 ID convention drift), T5 Pattern P3.

**Scope:**
- Two-phase repair: (Phase A) Backfill missing entries veya (Phase B) Rewrite `from_id`/`to_id` in `relations` to match canonical entry IDs
- Canonicalize memory-ID to `mem-NNN` (3-digit zero-pad)
- Rewrite `mem-sprint-NNN` ⇒ `mem-NNN` in 4 tabloda single transaction (entries + relations + tags + entry_history)
- UNIQUE constraint on `(type, sprint_num)` for type='memory' (T4 §2.5 cross-cut)

**Description:** T4 §3.5 — Relations table 51 / 131 (39%) rows reference non-existent entries; pattern `memory-sprint-NNN` ID drift. Combined with §2.6 — 3 farklı memory-ID convention (`mem-NNN`, `mem-sprint-NNN`, `user-<ts>`) — birlikte fix edilmezse naming drift yeniden fracture eder.

- **severity:** CRITICAL
- **suggested_fix:** Single migration script `scripts/sprint-168-memory-canonical.mjs` — Phase A: rewrite IDs in entries/relations/tags/history (single tx); Phase B: backfill missing sprint-log entries; Phase C: add UNIQUE constraint (type, sprint_num) for memory; verify via `node .audit/sprint-167/_inspect.mjs relations 0_broken_expected`
- **sprint_slot:** Sprint 168 (P0 — must-fix)
- **effort_estimate:** high (6h — 2h analysis + 2h migration + 2h test)

---

### C2 — Bug Z3 Memory Rebuild Safety + Auto-Backup Pipeline

**Source findings:** T4 §4.3 (HIGH — Bug Z3 destructive), T4 §4.2 (HIGH — backup not auto), T5 §4.4 (forensic), T7 Pattern P3+P4+P7.

**Scope:**
- `deckent memory rebuild` `--backup` flag (default on) — auto-snapshot before delete
- `--include-types` flag (default `adr,memory,debt,retro,sprint,identity`) + warn loudly if excluded
- Export `entry_history` + `relations` to `.brain/exports/relations.md` + `history.md` so they survive rebuild
- Replace "Delete it first" guard with `--force` flag that does delete + backup atomically
- `deckent memory backup` subcommand — auto-snapshots `.brain/memory.db` → `.brain/memory.db.bak-pre-<reason>-<ISO8601>`
- Call implicitly from any destructive operation (rebuild, decay aggressive sweep, restore)

**Description:** T4 §4.3 — Rebuild guard "Delete it first to rebuild" mesajı misleading; gerçekten 25% entry type + 100% relations + 100% history wipe. Bug Z3 + auto-backup ikisi P3 (Memory) + P4 (Brain Wire) + P7 (Defensive Miss) cross-cut.

- **severity:** CRITICAL
- **suggested_fix:** Bundle 4 sub-fixes: (1) `--backup` flag default on + auto-snapshot, (2) `--include-types` warn, (3) `relations.md` + `history.md` export to survive rebuild, (4) `deckent memory backup` subcommand + auto-hook before destructive ops
- **sprint_slot:** Sprint 168 (P0 — CRITICAL precondition for any future rebuild)
- **effort_estimate:** high (6h — 4 sub-fixes + tests + doc update)

---

### C3 — Step 4 ruleRegen ADR-046 Contract Fix (.claude/rules)

**Source findings:** T3 Bulgu #2 (HIGH — 11 ADR eksik), T3 Bulgu #3 (HIGH — çift Brain Rules block), T3 Wire #4 (KRİTİK — Step 3 → Step 4 ordering kontratını CARRY ETMEYEN bug), T7 Pattern P1+P2+P4.

**Scope:**
- Fix Step 4 (ruleRegen) implementation — Active ADR Constraints bloğunu DB'den fetch et + listeyi regenerate et
- Overwrite policy fix — mevcut "Brain Rules" bloğunu **replace** et (append ETMEME); idempotent regen
- Cross-platform rules dir parity — `.claude/`, `.codex/`, `.gemini/`, `.cursor/` 4 dizin için single source of truth template
- Worker prompt'larda ADR-040/042-046, 053/055/060 görünür hale gelsin
- ADR-046 Step Ordering Contract test: Step 3 (adrInsert) sonrası Step 4 (ruleRegen) yeni ADR'ları içermeli (regression test)

**Description:** T3 Bulgu #2 + #3 + Wire #4 — `.claude/rules/brain.md` Active ADR Constraints bloğu 39 ADR listeler ama DB'de 50 ADR var (eksik 11). Çift "Brain Rules" başlığı append bug'ı. Step 3 (adrInsert) → ADR-046 memory.db'ye girdi, Step 4 (ruleRegen) yeni ADR'ları içermiyor — Step Ordering Contract ihlali. Worker promptlarında Active ADR Constraints eski/eksik → ADR-045/046 enforcement YOK.

- **severity:** CRITICAL
- **suggested_fix:** Edit `src/orchestra/sprint-finalizer.ts` ve `src/core/rules-generator.ts` (veya equivalent) — Active ADR Constraints bloğunu DB'den `store.getByType('adr')` ile fetch et, idempotent template regenerate, çift kopya silinsin; regression test ADR-046 Step Ordering Contract enforce
- **sprint_slot:** Sprint 168 (P0 — Sprint 169 OSS GA reputational gate)
- **effort_estimate:** normal (3h — regen logic + 4 dir parity test + idempotency assertion)

---

### C4 — Brain Self-Update Hook ADR-046 Step 2-4 Extend (Ground-Truth Auto-Sync)

**Source findings:** T2 F-T2-01 (CRITICAL — Tests 12,485 vs 16,438), T2 F-T2-02 (HIGH — ADR 50/46/7), T2 §5.2 (CRITICAL — CLAUDE Sprint-153 stale 14 sprint), T1-MCP-001 (HIGH), T1-TEST-001 (HIGH), T2-F-DECKENT (HIGH — 22 vs 27 MCP), T7 Pattern P1+P2+P8.

**Scope:**
- IDENTITY.md ground-truth field'ları DB/runtime'den auto-fetch:
  - Tests count (live vitest --reporter=json output)
  - Coverage (live `npm run test:coverage` JSON output)
  - ADR count (DB `SELECT COUNT(*) FROM entries WHERE type='adr'`)
  - MCP tools count (live grep src/mcp/tools)
  - Agents/skills count (.deckent/agents + .deckent/skills LS)
- CLAUDE.md L137-148 Sprint Metrics block — Brain self-update Step 2/3 extension
- DECKENT.md MCP count auto-sync (22 → 27)
- Bug Y2 elimination — ground-truth-overrides.json whitelist + override expansion (skills, mcp_tools, version)

**Description:** T2 ground-truth dashboard 4/9 DRIFT — Tests (delta +3,953), Coverage (CLAUDE 0.0% vs IDENTITY 89.33% vs runtime tbd), ADR (DB 50 vs IDENTITY 46 vs FS 7), MCP (CLAUDE/IDENTITY 27 vs DECKENT 22). Root cause: ADR-046 Step 2 (identityRegen) deprecated ama ground-truth field auto-sync yok. Bu C4, P1, P2, P5, P8 cross-cut'ın büyük kısmını çözer.

- **severity:** CRITICAL
- **suggested_fix:** Extend `src/core/identity-generator.ts` Step 2 (or new Step 2.5) — IDENTITY.md ve CLAUDE.md Sprint Metrics block için DB+runtime fetch helper (`fetchGroundTruth()`); ground-truth-overrides.json whitelist genişlet (4 metric); Bug Y2 3-layer defense (DECKENT.md MCP count sync + ADR count sync); integration test 9/9 ground-truth PASS
- **sprint_slot:** Sprint 168 (P0 — OSS GA reputational gate)
- **effort_estimate:** high (4-6h — hook extension + tests + integration with ADR-046 + Bug Y2 whitelist expansion)

---

## 2. High Tasks (6)

### H1 — ADR DB→FS Export Pipeline (43 Missing .md Files)

**Source findings:** T2 F-T2-03 (HIGH — 43 ADR FS gap), T2-F09 (CRITICAL — mandatory ADR no FS), T3 Bölüm 1.1 (LOW dokümantasyon → HIGH for OSS GA), T2-F-ADR-GOVERNANCE (HIGH), T7 Pattern P2+P6.

**Scope:**
- `scripts/adr-md-export.mjs` — DB → `docs/adr/NNN-*.md` generator (MADR v3 hibrit format)
- 43 ADR (.md missing) backfill — ADR-001..042 + 047-052 + 054 + 056-059
- CI gate: ADR insert Step 3 sonrası export trigger (Step 3.5 extension)
- README/CONTRIBUTING references update — public users `docs/adr/006-spawn-sync-security.md` linke tıklayınca 200 alır

**Description:** T2 §3.7 — Filesystem 7 ADR vs DB 50 — 43 ADRs DB-only. ADR-006 spawnSync, ADR-008 Brain merkezi import, ADR-039 self-modifying gibi **mandatory** ADR'ler runtime'da enforced ancak filesystem'de YOK — public users 404. ADR-036 governance closure.

- **severity:** HIGH
- **suggested_fix:** `scripts/adr-md-export.mjs` — `MemoryStore.getByType('adr')` → markdown template render → `docs/adr/{slug}.md`; integrate into Step 3.5 of post-finalize hook; backfill commit Sprint 168 first task
- **sprint_slot:** Sprint 168 (P0 — Sprint 169 GA blocker)
- **effort_estimate:** medium (3h — script + template + Step 3.5 wire + 43 backfill commit)

---

### H2 — Stub Memory Entries Backfill + Quarantine

**Source findings:** T4 §2.4 (HIGH — 13/37 stub 35%), T5 Bug V (Sprint 159-161 backfill stubs), T2 F-T2-06 (HIGH — sprint logs 6 gaps), T4 §2.5 (MEDIUM — duplicate sprint memory), T5-F5 (MEDIUM — stub-deficit detection), T7 Pattern P3+P4+P5+P8.

**Scope:**
- `is_stub: BOOLEAN` schema field veya `status='stub'` migration
- 13 stub entry kategorize: backfill from `.brain/sprints/sprint-NNN.md` if exists, else mark stub + exclude from default retrieval
- `MEMORY:STUB_DEFICIT` event emit on each `deckent recall` query if stub returned
- Brain finalize Step 0 file-first: `.brain/sprints/sprint-NNN.md` BEFORE memory.db write (Bug V root cause fix)
- Duplicate sprint memory dedupe (mem-sprint-165 + mem-165) — UNIQUE constraint cross-cut from C1

**Description:** T4 §2.4 — 13 of 37 memory entries (35%) stub: `mem-132` 0 byte, 5 30-byte stubs, 7 boilerplate 136-byte. FTS5 trigger sync faithfully indexes them → recall precision tax. T5 Bug V — Sprint 159/160/161 backfill stubs (file mevcut değildi, brain finalize Step 0 silent fail).

- **severity:** HIGH
- **suggested_fix:** (1) Add `is_stub` flag to entries schema (migration); (2) backfill 7 boilerplate entries from git log + sprint commit history reconstruction; (3) mark 5 stubs unrecoverable + exclude from default retrieval; (4) Step 0 file-first write order to prevent future stubs; (5) `deckent memory heal` CLI for manual review
- **sprint_slot:** Sprint 168 (P0 — data integrity)
- **effort_estimate:** medium (4h — categorization + backfill from logs + Step 0 reorder + tests)

---

### H3 — OSS Pre-Flip Secret Scan Baseline (.detect-secrets + truffleHog)

**Source findings:** T6 F6-03 (HIGH — `.detect-secrets` EKSİK), T6 §3.2 (Public repo flip prereq), T7 Pattern P6+P7.

**Scope:**
- `.detect-secrets baseline` — initial scan, whitelist .deckent/oss-whitelist.json (Alperen path + email ACCEPTED)
- `truffleHog filesystem` scan — `git log --all -p | grep -iE "BEGIN.*PRIVATE KEY|AKIA[0-9A-Z]{16}"` → 0 match assertion
- Pre-commit hook integration — block commits with detected secrets
- CI gate: GitHub workflow `secrets-scan.yml` — push/PR'da çalışsın
- `.deckent/oss-whitelist.json` migrate from `.audit/sprint-167/oss-whitelist.json` (T6 oluşturdu)

**Description:** T6 §3.2 — Public flip için 2 prereq EKSİK: (a) .detect-secrets baseline, (b) validate-publish.ts CI gate (H4'te). T6 Section 2 sensitive data scan ile 2 Alperen-whitelist ACCEPTED (path + email), 0 gerçek leak — ama Sprint 169 GA için **automation** zorunlu.

- **severity:** HIGH
- **suggested_fix:** (1) `pip install detect-secrets` + `detect-secrets scan > .detect-secrets.baseline`; (2) pre-commit hook + CI workflow; (3) truffleHog GitHub Action; (4) `.deckent/oss-whitelist.json` migrate (Alperen path + email entries)
- **sprint_slot:** Sprint 168 (P0 — Sprint 169 public flip blocker)
- **effort_estimate:** low (2-3h — baseline + hook + workflow)

---

### H4 — Dashboard Build Mandatory CI Gate + validate-publish CI Integration

**Source findings:** T6 F6-01 (HIGH — `dist/dashboard/` mevcut DEĞİL — Tutarsızlık #15), T6 F6-04 (MEDIUM — validate-publish.ts CI eksik), T7 Pattern P6+P7.

**Scope:**
- `npm run build:all` mandatory CI gate — `ci.yml` workflow extension; `validate-publish.ts` check `dist/dashboard/index.html` exists
- `publish.yml` workflow `validate-publish.ts` call — 7 aşamalı dry-run mandatory before `npm publish`
- npm publish gate: `package.json` `files` allowlist verified — pack contains dist/ + bin/ + README + LICENSE only
- `dist/` size budget assertion (<500KB pack size)
- NPM_TOKEN GitHub Secrets injection verified

**Description:** T6 §2.3 — 14 eksik dosya = dashboard kaynak (vite build skip); `dist/dashboard/` mevcut DEĞİL → npm publish v1.0.0-beta.2 sonrası dashboard route 404. T6 §2.4.3 — `validate-publish.ts` mevcut ama CI'da otomatik çağrılmıyor.

- **severity:** HIGH
- **suggested_fix:** (1) `ci.yml` workflow `npm run build:all` step ekle; (2) `validate-publish.ts` `dist/dashboard/index.html` check; (3) `publish.yml` workflow `npm run validate:publish` mandatory step; (4) `package.json` `scripts.prepublishOnly` validate-publish call
- **sprint_slot:** Sprint 168 (P0 — npm publish v1.0.0-beta.2 blocker)
- **effort_estimate:** low (1-2h — workflow edit + validate-publish.ts enhancement)

---

### H5 — dep_pipeline_enabled Flip + 3-Layer Doc Fix

**Source findings:** T6 F6-02 (HIGH — 3-layer drift), T5-F7 (HIGH — pre-flip cross-cut audit), T6 F6-08 (MEDIUM — Sprint 142 fixture rewrite), T2 F-T2-05 (HIGH — DIRECTIVES history gaps), T7 Pattern P4+P6+P8.

**Scope:**
- `dependency-pipeline.test.ts` 2 skip rewrite (Sprint 142 backlog 26 sprint gecikme) — wave-scheduler-aware fixture
- Detect scope collisions + buildCollisionAwareWaves canlı test (3-task pilot sprint dogfood)
- `config.json` `dependency_pipeline_enabled: true` (currently false); `src/core/config.ts:594, 877, 1394` default'lar `true` confirmed
- DECKENT.md "Sprint 167 flip" claim → Sprint 168 referansı update
- VISION.md L85 aynı şekilde Sprint 168'e update
- DIRECTIVES.md Sprint 167 anchor → Sprint 168 dep_pipeline live confirm
- DIRECTIVES history backfill — 8 sprint gap stub (Sprint 139-142, 157-158, 160-161) `.brain/archive/DIRECTIVES-sprint-NNN.md`

**Description:** T6 §3.1.1 — DECKENT.md (Sprint 167 flip) vs DIRECTIVES.md (Sprint 168'e ertelendi) vs src default (true) vs config.json (false) — 4-layer drift. Sprint 167 fiilen false ile çalışıyor, ama default flow yeni projelerde true.

- **severity:** HIGH
- **suggested_fix:** (1) Pre-flip 3-task pilot sprint canlı dogfood (Sprint 139 Task 28 Chain Dependency Scheduler bootstrap'ı 5. live test); (2) `dependency-pipeline.test.ts` 2 skip rewrite (wave-scheduler-aware); (3) config.json flip + 3-layer doc fix (DECKENT/VISION/DIRECTIVES); (4) DIRECTIVES history 8-sprint backfill stubs
- **sprint_slot:** Sprint 168 (P0 — Sprint 169 GA messaging consistency)
- **effort_estimate:** normal (3-4h — pilot + fixture rewrite + doc fix + backfill stubs)

---

### H6 — ADR-047 Manuel Survival Pattern Codification + Density Metric

**Source findings:** T5 §6 (architectural — 18 incident inventory), T5-F6 (MEDIUM architectural), T3 §5 (053/055/060 closure review), T7 Pattern P5+P4.

**Scope:**
- ADR-047 yazımı — "Manuel Survival Pattern — Operator-Driven Recovery as a First-Class Mode" (T5 §6.2 skeleton)
- `manual_survival` entry type schema migration — `incident_id`, `sprint_id`, `trigger`, `manual_action`, `time_cost_minutes`, `hardened_into_code?`
- 18 incident inventory backfill DB (Sprint 164-166 incidents) — T5 §5.2 table
- Density metric sprint-reporter integration — `manual_survival_density > 0.5` threshold → next sprint remediation flag (Sprint 134 T-014 Brain Self-Audit Gate extension)
- ADR-053/055/060 closure review meeting — Alperen + Brain birlikte A/B/C (accept/defer/reject) karar (T3 §5)

**Description:** T5 §6 — 18 manuel survival incident Sprint 164-166 density 0.70 (threshold >0.5). Sprint 168 ADR-047 yazımı için input data hazır. 3 pattern hardened (OOM partial-result, ground-truth whitelist, lock cleanup partial), 3 pattern still manuel (stub heal, vitest parser, sprint restart).

- **severity:** HIGH (architectural)
- **suggested_fix:** (1) Author `docs/adr/047-manual-survival-pattern.md` (MADR v3 hibrit) — Context (18 incident), Decision (acknowledged operating mode + DB entry type + density metric), Consequences; (2) schema migration `manual_survival` type; (3) sprint-reporter density metric wire; (4) backfill 18 incidents; (5) Sprint 168 closure review meeting (053/055/060 → accepted/deferred/rejected)
- **sprint_slot:** Sprint 168 (P1 — architectural insurance, Sprint 169 GA gate)
- **effort_estimate:** high (4-6h — ADR text + schema migration + metric wire + 18-row backfill + meeting)

---

## 3. Medium Tasks (Bundle — 2)

### M1 — Identity-Generator Step 2 Decommission + Auditor Lock-Watchdog + finalize Breadcrumb Persist

**Source findings:** T3 Bölüm 6 (MEDIUM — Step 2 deprecated kod), T5-F1 (HIGH — Bug E lock-watchdog), T3 Wire #5 (MEDIUM — sprint-166.md boş, breadcrumb non-persistent), T5-F2 (MEDIUM — Bug G per-tier memory), T5 Wire 1.D (MEDIUM — Bug V Step 0 swallow), T7 Pattern P4+P7.

**Scope (3 sub-fix bundle):**
- **Sub-fix A:** `src/core/identity-generator.ts` Step 2 (identityRegen) decommission — 4-aşama T3 Bölüm 6.2 (default skipIdentityRegen true → kod sil → IdentityRegenResult tip kaldır → ADR-046 metni güncelle)
- **Sub-fix B:** Auditor scan loop `clearOrphanLocks() + clearStaleLocks(ctx, 5_min_ms)` every N=20 scans = 10dk unconditional (T5 §4.1 Bug E mitigation)
- **Sub-fix C:** Sprint finalize breadcrumb persistent log — `sprint-finalizer.ts` Step 1-4 emit'lerini `.brain/sprints/sprint-NNN.md` append yaz (T3 Wire #5 fix)
- **Sub-fix D (P1):** Per-tier docker memory (`opus=8g`, `sonnet=4g`, `haiku=2g`) — `spawn-backend-docker.ts:373` (T5-F2)
- **Sub-fix E (P1):** Bug V Step 0 file-first write order (covered in H2 cross-cut)

**Description:** Üç küçük fix tek bundle'a alındı — hepsi P4 (Brain Wire) + P7 (Defensive Miss) cross-cut. Step 2 dead code, Bug E timer wire, breadcrumb persist — Sprint 168 normal slot.

- **severity:** MEDIUM
- **suggested_fix:** Bundle 3-5 sub-fixes; M1 single task spawn 5 ardışık commit (her sub-fix kendi commit'i + regression test)
- **sprint_slot:** Sprint 168 (P1)
- **effort_estimate:** normal (3-4h total — A 1h, B 1h, C 30min, D 30min, E covered in H2)

---

### M2 — Sprint 153 CLAUDE.md Metrics + Skip Inventory Hygiene + deckent memory heal Tool

**Source findings:** T2 §5.2 (CRITICAL — CLAUDE Sprint-153 stale 14 sprint, cross-cut with C4), T1-SKIP-001 (LOW — 41/25/16 sayım), T6 F6-07 (LOW — 13 README skip 17 sprint gecikme), T6 F6-05 (MEDIUM — Coverage report), T5 §6.5 (MEDIUM — stub-deficit recovery), T1-CLI-001 (MEDIUM — quick-start orphan), T1-BUG-N-001 (MEDIUM — Bug N regression semantic), T1-BUG-REG-001 (LOW — regression namespace), T7 Pattern P1+P5+P8.

**Scope (3-cluster bundle):**
- **Cluster A:** CLAUDE.md L137-148 Sprint Metrics block + L150-153 Agent Performance block — Brain self-update hook auto-regen (C4 sub-task delegated to M2 cluster)
- **Cluster B:** Skip Inventory Hygiene — `scripts/test-skip-inventory.mjs` skip kategorize → JSON; 13 README skip restore (dynamic-section catalog pattern); Bug N regression test semantic review (`finalize-rule-regen.test.ts`); quick-start.ts register veya sil
- **Cluster C:** `deckent memory heal` CLI — stub-deficit recovery tool; `tests/regression/sprint-NNN/` namespace (Sprint 169 prep); Coverage report Sprint 168 P1 (vitest --coverage + 80% threshold gate); decay smoke test (T4 §4.4)

**Description:** Three-cluster bundle — hepsi P1 (GT-Drift) + P5 (Manuel Survival) + P8 (Stale Doc) cross-cut. M2 Sprint 168 esnek slot, NO_GO durumda Sprint 169'a kayar.

- **severity:** MEDIUM
- **suggested_fix:** 3 cluster ardışık commit — Cluster A (CLAUDE.md auto-regen) + B (skip inventory + 13 README restore + Bug N semantic + quick-start triage) + C (memory heal CLI + coverage report + decay smoke + regression namespace)
- **sprint_slot:** Sprint 168 (P2 — bundle, Sprint 169 esnek)
- **effort_estimate:** normal (3-4h total — A 1h, B 1.5h, C 1.5h)

---

## 4. Sprint 168 Wave Plan (Recommended)

Sprint 168 önerilen wave structure (DIRECTIVES.md seed için):

```
Wave 1 (paralel, P0 critical):
  - C1 (Memory Relations + ID Migration) — single task
  - C2 (Bug Z3 + Auto-Backup)
  - C3 (Step 4 ruleRegen Contract)
  - C4 (Brain Self-Update Ground-Truth Auto-Sync)

Wave 2 (paralel, P0/P1 high — Wave 1 dependent on C1+C3 done):
  - H1 (ADR DB→FS Export) — depends on C3 (Step 4 fix)
  - H2 (Stub Memory Backfill) — depends on C1 (ID canonical migration)
  - H3 (OSS Pre-flip Secret Scan)
  - H4 (Dashboard Build CI Gate)
  - H5 (dep_pipeline_enabled Flip)

Wave 3 (sequential, P1 architectural):
  - H6 (ADR-047 Manuel Survival) — depends on Wave 1+2 closure (incident inventory frozen)
  - M1 (Step 2 + Lock-Watchdog + Breadcrumb bundle)
  - M2 (CLAUDE Sprint-153 + Skip Hygiene + memory heal bundle) — Sprint 169'a esnek slot
```

`dep_pipeline_enabled` Sprint 168'in ilk task'ında flip (H5 pre-pilot). Wave 1 ve Wave 2 hard depends_on Wave 3 öncesi closure.

---

## 5. GO/NO_GO Predicate Satisfaction

DIRECTIVES Spec §3.6 GO/NO_GO falsifiable predicate:
- ✅ Task count = 12 (`≤ 12 ✓`)
- ✅ Critical count = 4 (`≤ 4 ✓`)
- ✅ Her finding 4-field (severity / suggested_fix / sprint_slot / effort_estimate) — her task block'unda görünüyor
- ✅ Cross-cut pattern ≥ 3 — T7-cross-cutting-synthesis.md 8 pattern (`grep -cE "^### Pattern P[0-9]+ — "` = 8)
- ✅ 50+ finding kayıt altında — consolidated-inventory.md
- ✅ Sprint 168 task seed (Critical/High/Medium banded)
- ✅ T2 retry sonrası 10 finding dahil — F-T2-01..06 critical/high fields

**Catch-22 Resolution (DIRECTIVES §3.6 v4 esnek karar):** Sprint 167 NO_GO veya yeni BLOCKER durumda Sprint 168 scope shrunk:
- Sprint 168 minimal = C1 + C2 + C3 + C4 + H1 + H2 + H3 = 7 task (audit gap closure + Critical bant + ADR FS export + Stub heal + Secret scan)
- M1 + M2 + H4 + H5 + H6 Sprint 169'a kayar
- Sprint 169 GA hard blockers Sprint 168 7-task minimum ile çözülür: ADR governance closure (C3+H1), Memory data integrity (C1+C2+H2), OSS reputational gate (C4+H3)

---

## 6. Sprint 168 → Sprint 169 GA Handoff

Bu roadmap Sprint 168 DIRECTIVES.md seed'i olarak kullanılır. Sprint 168 sonrası:

- **Sprint 168 NO_GO veya sensitive data BLOCKER** → Sprint 169 GA kayar; fix Sprint 169'a girer
- **Sprint 168 PASS (12/12 done)** → Sprint 169 GA path:
  - VerhexIO/deckent → VerhexIO/deckent public flip (Alperen manuel)
  - npm publish v1.0.0-beta.2
  - Show HN launch + community feedback
- **Sprint 168 PARTIAL (7/12 minimum)** → Sprint 169 GA partial (ADR governance + memory integrity + secret scan kapatıldı, geri kalan M1/M2 Sprint 170'e)

---

## 7. Roadmap Self-Statement

**Source/doc mutation YOK.** Bu roadmap salt `.audit/sprint-167/sprint-168-roadmap.md` dosyasıdır + T7-cross-cutting-synthesis.md + consolidated-inventory.md ile 3'lü handoff seti. Sprint 167 anchor constraint #1 ("No source/doc mutations") respect edildi.

**Predicate Self-Check:**
- 12 task `### (C|H|M)N — ` formatında (predicate Check 5)
- 4 critical task `### CN — ` (predicate Check 6)
- `severity:` / `suggested_fix:` / `sprint_slot:` / `effort_estimate:` her task'ta ≥1 occurrence (predicate Check 4 + Check 8 her field ≥12 occurrence requirement)

**T7 selfAssessment:** DONE.

---

**End of Sprint 168 Roadmap — Sprint 167 T7 RETRY Task 167-007.**

Imza: architect agent (Wave 2)
Yazar: w-run-1778748966937-0
Tarih: 2026-05-14
