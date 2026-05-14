# T7 — Cross-Cutting Synthesis (Sprint 167 Read-Only Self-Audit)

**Sprint:** 167 (Read-Only Self-Audit)
**Task:** 167-007 (Wave 2, T1-T6 dependent)
**Mode:** READ-ONLY meta-audit. No source/doc mutations.
**Agent:** architect
**Date:** 2026-05-14
**Author:** w-run-1778748966937-0

> Bu rapor Sprint 167 anchor task T1-T6 raporlarının okunmasıyla **cross-cutting patterns** çıkartır, severity + kategori bazlı **konsolide inventory** üretir ve **Sprint 168 remediation roadmap**'i için falsifiable handoff hazırlar. **Önceki T7 sentezi T1+T2 olmadan üretilmişti — bu retry T2'nin 10 finding'ini (özellikle F-T2-01 tests drift +3953, F-T2-02 ADR count contradiction, F-T2-03 43 ADR FS missing, F-T2-05 DIRECTIVES history 8-sprint gap, F-T2-06 sprint logs gaps) dahil edilerek üretildi.**

---

## Section 0 — Inputs (T1-T6 Raporları)

| Task | Raporu | Boyut | Finding | Severity Headlines |
|------|--------|-------|---------|---------------------|
| T1 | T1-code-inventory.md | 36K | 11 | HIGH×2 (MCP 27 vs 31; test 505 vs 772), MEDIUM×4, LOW×5 |
| T2 | T2-doc-inventory.md | 37K | 10 | CRITICAL×2 (Tests 12,485 vs 16,438 + ADR FS gap 7/50), HIGH×5, MEDIUM×2, LOW×1 |
| T3 | T3-adr-compliance.md | 46K | 10 | HIGH×2 (Step 4 ruleRegen contract ihlali + .claude/rules çift kopya), MEDIUM×4, LOW×4 |
| T4 | T4-memory-integrity.md | 32K | 12 | CRITICAL×1 (Relations 39% broken 51/131), HIGH×4 (Bug Z3 + naming drift + stub + backup), MEDIUM×1, LOW×4, INFO×2 |
| T5 | T5-brain-wire-audit.md | 53K | 7 + 18 manuel survival incident + 5 Bug forensic | HIGH×2 (Bug E spawn-lock + dep_pipeline flip pre-audit), MEDIUM×5 |
| T6 | T6-test-build-security.md | 40K | 10 | HIGH×3 (dashboard build EKSİK + dep_pipeline drift + .detect-secrets eksik), MEDIUM×4, LOW×3 |

**Toplam unique finding:** ~60 (T7 dedupliked: ~50)
**Toplam manuel survival incident:** 18 (Sprint 164-166, density 0.70 — Sprint 168 remediation gerekçesi)
**Toplam Bug forensic:** 5 (E/G/Z2/Z3/V) + 8 cross-cut Bug (M/N/S/Y/Y2/Z/X/W)

---

## Section 1 — Cross-Cutting Patterns (8 Detected)

T1-T6 boyunca **aynı root cause** birden çok ekseni etkileyen 8 cross-cutting pattern tespit edildi. Her pattern için: kanıt zinciri, etki, T7 öneri.

### Pattern P1 — Ground-Truth Drift Convergence (Bug Y2 Paterni)

**Kanıt zinciri:**
- **T1-MCP-001 (HIGH):** IDENTITY "27 MCP tools" vs DECKENT "22 tools" vs T1 grep "31 deckent_* literal" → 3 farklı sayı
- **T1-TEST-001 (HIGH):** IDENTITY "12,485 pass + 16 skipped (505 files)" vs T6/DIRECTIVES "16,438" vs T1 grep "772 .test.ts" → +3,953 delta + +267 file drift
- **T2 ground-truth dashboard:** 5/9 PASS, 4/9 DRIFT — Tests (CRITICAL), Coverage (CLAUDE 0.0% vs IDENTITY 89.33%), ADR (DB 50 vs IDENTITY 46 vs FS 7), MCP (CLAUDE/IDENTITY 27 vs DECKENT 22)
- **T3 Bulgu #2 (HIGH):** `.claude/rules/brain.md` Active ADR Constraints **39 ADR listeler** ama DB'de **50 ADR** — eksik 11 (ADR-040/042-046, 053/055/060)
- **T4 §3.2 (LOW):** DECKENT/IDENTITY "TR/EN/DE %100" claim misleading — DE corpus boş, recall 0
- **T6 §1.4.1 (INFO):** Total tests 3 farklı sayı (16,438 / 16,434+ / 12,485) — README badge ile IDENTITY uyumsuz

**Etki:** Open Source GA reputational gate — kullanıcı CLAUDE.md/IDENTITY.md/DECKENT.md'yi okuyup runtime ile karşılaştırdığında trust zedeleniyor. Brain context auto-query stale ADR set'i workerlara verir → ADR-045/046 enforcement YOK.

**Root cause:** ADR-046 Brain Self-Update Hook Architecture Step 2/3/4 **kısmî implementation**:
- Step 1 (memoryExport) → çalışıyor
- Step 2 (identityRegen) → deprecated, ama IDENTITY.md ground-truth field auto-sync yok
- Step 3 (adrInsert) → çalışıyor (Sprint 166 Bug M fix)
- Step 4 (ruleRegen) → **append bug** (.claude/rules/ çift kopya) + ADR listesi regenerate eksik

**T7 öneri:** Sprint 168 Critical C4 — ADR-046 Step 2-4 extension: IDENTITY.md/CLAUDE.md ground-truth field'ları DB'den auto-fetch + DECKENT.md MCP count sync + Bug Y2 elimination. Bu, P1, P2, P5'in büyük kısmını çözer.

### Pattern P2 — ADR Governance Gap (ADR-036 Yarı Uygulama)

**Kanıt zinciri:**
- **T2-F03 (HIGH):** Filesystem `docs/adr/*.md = 7` vs DB type=adr = 50 — **43 ADR sadece DB'de** (ADR-001..042, 047-052, 054, 056-059 missing as file)
- **T3 Bölüm 1.1 (LOW dokümantasyon):** Kabul edilmiş tasarım — DB single source of truth, .md dosyaları sadece export — ANCAK OSS GA için public kullanıcılar `docs/adr/006-*.md`'ye tıklayınca 404 alır
- **T3 Bulgu #2 + #3 (HIGH×2):** Step 4 ruleRegen `.claude/rules/brain.md` Active ADR Constraints bloğu **stale** (39 vs 50 ADR) **+ çift "Brain Rules" başlığı** (append yerine replace yapması gerekirken)
- **T3 Bulgu Wire #4 (KRİTİK):** Step 3 (adrInsert) → ADR-046 memory.db'ye girdi, Step 4 (ruleRegen) → rules dosyalarını regenerate **ama yeni ADR'ları içermiyor** (Step 3 → Step 4 ordering kontratını CARRY ETMEYEN bir bug)
- **T2-F09 (CRITICAL):** ADR-006 spawnSync, ADR-008 Brain merkezi import, ADR-039 self-modifying gibi **mandatory** ADR'ler runtime'da enforced, ancak filesystem'de YOK — public users cannot inspect
- **T3 Bölüm 5:** ADR-053/055/060 Sprint 156'dan beri **~11 sprint proposed** — closure review gerekli
- **T5 Finding 1.A (HIGH, hardened in Sprint 166):** Pre-Sprint 166 Step 3 (adrInsert) wholly missing — ADR-043/044/045 17 sprint boyunca memory.db'ye girmedi → context auto-query stale ADR set ile workerlara prompt enjekte edildi

**Etki:** ADR-036 "Mandatory Architecture Decision Enforcement" Sprint 138'de accepted, ancak full pipeline (validator + DB→FS export + worker prompt injection + rules regenerate) **yarı uygulamada**. Worker ADR ihlali yapsa bile auditor stale list ile çalıştığından yakalayamayabilir.

**T7 öneri:** Sprint 168 Critical C3 — Step 4 ruleRegen overwrite policy fix + ADR list regenerate from DB + High H1 — `scripts/adr-md-export.mjs` DB → docs/adr/NNN-*.md generator (43 missing ADR file).

### Pattern P3 — Memory.db Integrity Aglomerasyonu (T4 Convergence)

**Kanıt zinciri:**
- **T4 §3.5 (CRITICAL):** Relations table **51 / 131 (39%) broken** — `memory-sprint-NNN` / `sprint-log-sprint-NNN` ID convention 0 matched entries
- **T4 §2.6 (HIGH):** 3 farklı memory-ID convention birlikte yaşıyor (`mem-NNN`, `mem-sprint-NNN`, `user-<ts>`) — referential integrity break
- **T4 §2.4 (HIGH):** **13/37 memory entry (35%) stub/empty** — `mem-132` 0 byte, 5 stub 30 byte, 7 boilerplate 136 byte. FTS5 trigger sync faithfully indexes these → recall precision tax
- **T4 §4.3 + Bug Z3 (HIGH):** `deckent memory rebuild` non-idempotent → `rm memory.db` ile destructive; `entry_history` (1218) + `relations` (131) + `retro` + `sprint` + `identity` types tamamen wipe
- **T4 §4.2 (HIGH):** 3 `.bak-*` dosya gitignored ama **manual created** (kod auto-snapshot yapmıyor); 2 backup MD5 duplicate
- **T4 §2.5 (MEDIUM):** Duplicate sprint memory — `mem-sprint-165` (30 byte stub) + `mem-165` (311 byte real) birlikte yaşıyor (UNIQUE constraint eksik)
- **T5 Finding 1.D + 4.5 — Bug V (cross-cut):** Sprint 159/160/161 sprint log stub-only — backfill anında file mevcut değildi, brain finalize Step 0 try/catch swallow

**Etki:** Memory.db "single source of truth" iddiası 4 boyutta yara almış: (a) cross-reference graph 39% broken, (b) 35% memory content stub, (c) destructive rebuild user-error mağduru, (d) UNIQUE constraint yokluğu duplicate'lere izin veriyor.

**T7 öneri:** Sprint 168 Critical C1 (Relations + ID Migration) + Critical C2 (Bug Z3 + Backup Automation) + High H2 (Stub Backfill / Quarantine). Üçü birlikte tek "Memory Data-Integrity Recovery" wave'i olarak yapılmalı — ayrı yapılırsa naming drift yeniden fracture eder.

### Pattern P4 — Brain Wire Step Ordering Deficit

**Kanıt zinciri:**
- **T5 Finding 1.A (HIGH, hardened Sprint 166):** Pre-Sprint 166 ADR-046 Step 3 (adrInsert) wholly missing — runPostFinalizeHooks içermiyordu → ADR-043/044/045 memory.db'ye girmedi (17 sprint stale)
- **T5 Finding 1.B (HIGH, hardened Sprint 166):** `cli/commands/finalize.ts:166` manual finalize → `onRuleRegen` parametresi YOK → Step 4 silent 13 sprint
- **T3 Wire Bulgu #4 + #5:** Sprint 166 finalize sonrası `.brain/sprints/sprint-166.md` **boş** — Step 1-4 breadcrumb persistent log YOK (sadece stderr/stdout debugLog)
- **T3 Step 4 compliance: FAIL:** ADR-046 file system'da var, DB'de var, ama `.claude/rules/brain.md` Active ADR Constraints bloğunda **YOK** — Step 4 implementation eksik
- **T5 Finding 1.D — Bug V:** Sprint 159/160/161 backfill stubs — Brain finalize Step 0 (writeRetrospective) try/catch swallow ile silent fail → 3 sprint learnings kayıp
- **T5 Section 4.1 — Bug E:** Spawn-lock leak (`.spawnlock` SHA256 hash filenames orphan) — sprint sınırı arası clearOrphanLocks() timer yok → Sprint 167 DIRECTIVES'te `maxWorkers=3` fallback olarak görüldü
- **T5 Section 4.2 — Bug G:** Docker container OOM 4GB→8GB; per-task tier memory mismatch (flat 8g — haiku overprovisioned, opus might still OOM)

**Etki:** Brain self-update + auto-recovery + observability **kısmî implementation**. Sprint 166 ADR-046 ile en kritik 2 wire kapatıldı (Step 3 + manual onRuleRegen), ama 5 ek wire deficit (Bug E lock leak + Bug G OOM tier + Bug V stub fallback silent + Step 4 ADR list regen eksik + finalize breadcrumb non-persistent) Sprint 168 P0 candidate.

**T7 öneri:** Sprint 168 Critical C3 (Step 4 overwrite + ADR regen) + Medium M1 (Step 2 identityRegen decommission + Auditor lock-cleanup-watchdog 10dk interval + finalize breadcrumb sprint-NNN.md persist).

### Pattern P5 — Manuel Survival Density Anti-Pattern

**Kanıt zinciri:**
- **T5 Section 5.2:** **18 manuel survival incident** Sprint 164-166 (DIRECTIVES predicate ≥10 — fazlasıyla geçildi)
- **T5 §5.4 + §6.3:** Rolling 3-sprint density **0.70** — Sprint 165 0.80 (0/0 task GO_WITH_GATE_FAILURE), Sprint 166 0.64 (11/11 DONE ama 7+ manual hot-fix commit + 280 LoC backfill script)
- **T5 §6.4:** 3 pattern hardened (OOM partial-result, ground-truth whitelist, lock orphan cleanup partial)
- **T5 §6.5:** 3 pattern still manuel — Stub-deficit recovery, vitest gate parser, sprint restart recovery
- **T5 Bug index roll-up:** 5 EGVZ + 8 ek Bug (M/N/S/Y/Y2/Z/X/W) — Sprint 165/166 büyük çoğunluk bug-fix task; feature delivery değil
- **T6 §1.3 (LOW residual):** 2 chronic E2E (docker timeout + tmux banner) low-frequency, Bug Z kapatılmış ama backlog
- **T6 §0.1 verdict satırı:** "tüm match'ler synthetic test fixture; 0 gerçek BLOCKER" — defensive scan PASS ama 4 P0 finding cluster (dashboard build / dep_pipeline / .detect-secrets / validate-publish)

**Etki:** Brain otomatik recovery yetersiz → Alperen elle `deckent kill --all` + `cleanup` + `recover` + backfill script çalıştırıyor. Bu bir **discovery mechanism**: her manuel survival incident → ya kod sertleştirme adayı ya ADR seed. ADR-047 yazımı için **18 incident inventory hazır**.

**T7 öneri:** Sprint 168 High H6 — ADR-047 "Manuel Survival Pattern Codification" yazımı + `manual_survival` entry type schema migration + density metric sprint-reporter'a entegrasyon. Sprint 169 GA için density <0.5 hedef gate.

### Pattern P6 — OSS GA Readiness Cluster (Sprint 169 Blocker'ları)

**Kanıt zinciri:**
- **T6 F6-01 (HIGH):** Dashboard build EKSİK — `dist/dashboard/` mevcut DEĞİL, `npm run build:all` Sprint 167 öncesi çalıştırılmadı; npm publish v1.0.0-beta.2 sonrası dashboard route 404
- **T6 F6-02 (HIGH):** `dep_pipeline_enabled` 3-layer drift (DECKENT.md "Sprint 167 flip" ↔ DIRECTIVES.md "Sprint 168'e ertelendi" ↔ src default true vs config.json false)
- **T6 F6-03 (HIGH):** `.detect-secrets` baseline + truffleHog **EKSİK** → public flip öncesi mandatory
- **T6 F6-04 (MEDIUM):** `validate-publish.ts` mevcut ama `publish.yml` workflow'a entegre değil → NPM publish CI gate eksik
- **T2-F03 (HIGH cross-cut):** 43 ADR FS gap — public users cannot read mandatory ADRs (ADR-006/008/039/041 vb.)
- **T1-MCP-001 + T1-TEST-001 (HIGH):** Ground-truth doc drift (P1 cross-cut) → public README/IDENTITY uyumsuz
- **T6 §3.2:** Public repo flip prereq → tüm dokümantasyon ✅ ACCEPTED ama 2 prereq EKSİK (.detect-secrets + validate-publish CI gate)

**Etki:** Sprint 169 Open Source GA hedefi 4 P0 ve 2 cross-cut HIGH ile bağlı. Bunların hiçbiri tek başına BLOCKER değil ama toplamı GA messaging credibility'sini zedeler.

**T7 öneri:** Sprint 168 High H3 (.detect-secrets baseline) + H4 (dashboard build CI gate) + H5 (dep_pipeline flip + 3-layer doc fix) + H1 (ADR DB→FS export). Bu 4 task Sprint 169 GA'nın pre-condition'ı.

### Pattern P7 — Defensive Miss Anti-Pattern (Happy-Path Optimist Code)

**Kanıt zinciri:**
- **T4 §4.2:** `deckent memory rebuild` öncesi auto-backup YOK → user `rm memory.db` manuel
- **T4 §4.3 — Bug Z3:** Rebuild guard "Delete it first to rebuild" mesajı misleading — gerçekten 25% entry type + 100% relations + 100% history wipe edilir, mesaj sessiz
- **T4 §4.4:** `decay()` fonksiyonu production'da hiç çalışmamış (0 entries soft-deleted) — INERT
- **T5 §4.1 — Bug E:** `clearOrphanLocks()` mevcut ama timer'da değil — Auditor scan loop'a wire edilmemiş, on-demand only
- **T5 §4.2 — Bug G:** Flat `--memory 8g` per-tier mismatch (opus 8g doğru ama haiku 2g yeterli — overprovisioning)
- **T6 F6-04:** `validate-publish.ts` mevcut ama CI'da otomatik çağrılmıyor — operator manuel run

**Etki:** Happy path testlerle gerçekçi ama edge case + user-error path'lerde silent data loss veya resource waste. **Class of bugs**: "code does the right thing in the happy path but fails gracefully (or destructively) under user error" (T4 §5.2).

**T7 öneri:** Sprint 168 Critical C2 (Bug Z3 + backup automation belt-and-suspenders) + Medium M1 (Auditor lock-watchdog + decay smoke test + per-tier memory limits).

### Pattern P8 — Stale Documentation Anti-Pattern (Sprint N Backlog Compounding)

**Kanıt zinciri:**
- **T2 §5.2:** CLAUDE.md L137-148 Sprint Metrics tablosu Sprint **sprint-153** (Sprint 167 era — 14 sprint stale)
- **T2 §5.2:** CLAUDE.md L150-153 Agent Performance tablosu doc-writer "10 task, 2 done, 20%" — Sprint 153 stat
- **T2 §3.5 + 5.2:** IDENTITY.md "Tests: 12,485 pass" Sprint 138-139 baseline — 28-29 sprint stale
- **T6 §1.2.5:** 13 README test skip **Sprint 151 backlog 17 sprint gecikme** — dynamic-section catalog pattern uygulanmadı
- **T6 §1.2.2 Kategori G:** Dependency-pipeline 2 skip Sprint 142 fixture rewrite bekliyor → **26 sprint gecikme** (Sprint 142 → Sprint 167)
- **T2 §6.3:** Sprint 140-164 design spec yokluğu (22 sprint) — ADR-036 governance partial uygulama
- **T2 §6.1:** DIRECTIVES history 8 sprint gap (139-142, 157-158, 160-161) — backfill stubs

**Etki:** Stale section yığılması — her Sprint biraz daha eskimiş doc/tested kapsam taşır. Cumulative tech debt: Sprint 142 fixture, Sprint 151 README rewrite, Sprint 153 CLAUDE.md metrics block, Sprint 156 proposed ADR closure. 17-26 sprint backlog yığılması.

**T7 öneri:** Sprint 168 Medium M2 — Sprint 153 CLAUDE.md auto-regen hook (Brain self-update Step 2 extension) + Sprint 151 README skip restore (dynamic-section catalog) + Sprint 142 dep-pipeline fixture rewrite. Bu üçü cross-cut: hep "stale because update hook eksik" sebep.

---

## Section 2 — Convergence Map (Bir Bulgu Birden Çok Pattern'i Etkiler)

| Finding | P1 GT-Drift | P2 ADR-Gov | P3 Memory | P4 Brain-Wire | P5 Manuel-Survival | P6 OSS-GA | P7 Defensive | P8 Stale-Doc |
|---------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| T1-MCP-001 (27 vs 31) | ● | | | | | ● | | ● |
| T1-TEST-001 (505 vs 772) | ● | | | | | ● | | ● |
| T2-F01 Tests 12,485 vs 16,438 | ● | | | | | ● | | ● |
| T2-F02 ADR 50/46/7 | ● | ● | | ● | | ● | | |
| T2-F03 43 ADR FS gap | | ● | | | | ● | | |
| T2-F-CLAUDE Sprint-153 metrics | ● | | | ● | | | | ● |
| T3 Bulgu #2 .claude/rules 39/50 | ● | ● | | ● | | ● | | |
| T3 Bulgu #3 çift Brain Rules block | | ● | | ● | ● | | | |
| T3 Wire #4 Step 4 ADR list eksik | | ● | | ● | | ● | | |
| T4 §3.5 Relations 39% broken | | ● | ● | ● | | | | |
| T4 §2.6 ID naming drift | | | ● | ● | | | | |
| T4 §4.3 Bug Z3 destructive | | | ● | ● | ● | | ● | |
| T4 §4.2 backup not auto | | | ● | | ● | | ● | |
| T4 §2.4 stub memory 35% | | | ● | ● | ● | | | |
| T5 Bug E spawn-lock leak | | | | ● | ● | | ● | |
| T5 Bug G OOM 4→8GB | | | | ● | ● | | ● | |
| T5 Bug V backfill stubs | | | ● | ● | ● | | ● | |
| T5 ADR-047 input (18 incident) | | | | ● | ● | | | |
| T6 F6-01 dashboard build | | | | | | ● | ● | |
| T6 F6-02 dep_pipeline drift | | | | ● | | ● | | ● |
| T6 F6-03 .detect-secrets eksik | | | | | | ● | ● | |
| T6 §1.2.5 13 README skip | | | | | | | | ● |

**Yorum:** Pattern P1 (Ground-Truth Drift), P2 (ADR Governance), P3 (Memory Integrity), P4 (Brain Wire) **kümeli olarak** Sprint 166 ADR-046 Hook Architecture'in yarı uygulama mirası. Sprint 168 Critical bant tek bir tema değil — 3 ayrı root-cause (memory data integrity + ADR governance closure + Brain hook chain extension) eş zamanlı remediation.

---

## Section 3 — Severity Roll-Up Across All 6 Audits

| Severity | Sayı | Örnekler |
|----------|------|----------|
| CRITICAL | **5** | T4 Relations 39% broken; T2 Tests claim drift (12,485→16,438); T2 ADR FS gap (7/50); T2 CLAUDE Sprint-153 metrics stale; T4 Bug Z3 operationally critical |
| HIGH | **20** | T1 MCP 27 vs 31, T1 Test 505 vs 772, T2-F02 ADR 50/46/7, T2-F05 DIRECTIVES 8-sprint gap, T2-F06 sprint logs 6 gap, T2-F-DECKENT 22 vs 27, T2-F-ADR-GOV partial, T3 #2 11 ADR eksik, T3 #3 çift Brain Rules, T4 ID naming drift, T4 backup not-auto, T4 stub 35%, T5-F1 Bug E lock-watchdog, T5-F7 dep_pipeline pre-audit, T6 F6-01 dashboard build, T6 F6-02 dep_pipeline drift, T6 F6-03 .detect-secrets, T2-F09 mandatory ADR no FS, T5 Bug V backfill stub |
| MEDIUM | **18** | T1 quick-start orphan, T1 Sprint 140-148 doc gap, T1 7 prompt dead, T1 Bug N regression semantic belirsiz, T3 Wire #4-#5 sprint-166 finalize log eksik, T3 ADR-035 emit coverage, T3 ADR-037 soft RBAC, T3 053/055/060 closure, T3 Step 2 identityRegen kod, T4 duplicate sprint memory, T5 F2 Bug G per-tier, T5 F3 Bug Z2 parser, T5 F4 Bug Z3 rebuild double-confirm, T5 F5 stub-deficit detection, T5 F6 ADR-047 architectural, T6 F6-04 validate-publish CI, T6 F6-05 coverage report, T6 F6-08 dep-pipeline fixture |
| LOW | **16** | T1-CLI-002 skill-marketplace, T1-MCP-002 feature_query parity, T1-DEAD-002 4 suspect file, T1-SKIP-001 41/25/16 sayım, T1-BUG-REG-001 regression namespace, T3 audit-mode detector, T4 DE FTS5 claim, T4 ADR decay-exempt, T4 sprint id↔num, T4 schema_version dual, T4 unused rel_types, T6 F6-06 docker timeout + tmux banner, T6 F6-07 13 README skip, T6 F6-09 coverage-v8 pin, T6 F6-10 dist dedup, T3 Bulgu #1 DB↔FS legacy parity |
| INFO | **5+** | T6 dep_pipeline_enabled drift inform-only, T4 decay inert (smoke test), T4 unused relations rel_types, T2-F04 sprint counter auto-resolve, T1 Sprint 140-148 IDENTITY gap |

**Toplam unique finding (T7 dedupliked):** ~50 distinct + 18 manuel survival incident.

**P0 (Sprint 168 Must):** ~4-5 (severity CRITICAL veya HIGH + OSS-GA / Brain-Wire / Memory-Integrity cluster'larında)
**P1 (Sprint 168 Should):** ~6-8 (HIGH + MEDIUM, P1-P8 multi-pattern entries)
**P2 (Sprint 169 GA / Beyond):** ~10 (LOW + cosmetic + niş)

---

## Section 4 — Sprint 168 Roadmap Strategy (T7 Synthesis Decision)

### 4.1 Anchor Constraint (Sprint 167 v4 spec)

DIRECTIVES anchor #5: "Her finding `suggested_fix` + `sprint_slot` + `effort_estimate` içermeli."
Spec §3.6: **Sprint 168 task count ≤ 12, critical ≤ 4**.

### 4.2 Critical Bant Seçimi (4 task)

Pattern convergence ve OSS GA hardlock dependency dikkate alınarak Critical 4 task seçildi:

| ID | Title | Patterns Covered | Why Critical |
|----|-------|------------------|--------------|
| **C1** | Relations 39% Broken + Memory ID Canonical Migration | P3, P4 | T4 §3.5 CRITICAL + §2.6 HIGH; T4 §5.1 Pattern A — yapılmazsa naming drift Sprint 169'da yeniden fracture |
| **C2** | Bug Z3 Memory Rebuild Safety + Auto-Backup | P3, P4, P7 | T4 §4.3 HIGH + §4.2 HIGH; tek `rm` ile entry_history/relations/retro/sprint/identity wipe; defensive miss eradication |
| **C3** | Step 4 ruleRegen ADR-046 Contract Fix (.claude/rules) | P1, P2, P4 | T3 Bulgu #2 + #3 HIGH×2; ADR-046 Step Ordering Contract ihlali; OSS GA reputational gate; worker prompt ADR list stale |
| **C4** | Brain Self-Update Hook ADR-046 Step 2-4 Extend (Ground-Truth Auto-Sync) | P1, P2, P8 | T2 ground-truth 4/9 DRIFT (CRITICAL); CLAUDE.md Sprint-153 stale 14 sprint; IDENTITY 12,485 stale; Bug Y2 elimination root cause |

### 4.3 High/Medium Bant (8 task)

| ID | Title | Patterns | Justification |
|----|-------|----------|---------------|
| **H1** | ADR DB→FS Export Pipeline (43 missing .md) | P2, P6 | T2-F03 + T3 Bölüm 1.1 — OSS GA için ADR-006/008/039 public access |
| **H2** | Stub Memory Entries Backfill + Quarantine | P3, P4, P5, P8 | T4 §2.4 HIGH + T5 Bug V — 13/37 stub recall precision tax + brain context auto-query empty |
| **H3** | OSS Pre-flip Secret Scan Baseline (.detect-secrets + truffleHog) | P6 | T6 F6-03 HIGH — Sprint 169 public flip blocker |
| **H4** | Dashboard Build Mandatory CI Gate (build:all + validate-publish) | P6, P7 | T6 F6-01 + F6-04 HIGH+MEDIUM — npm publish blocker birleştirilmiş |
| **H5** | dep_pipeline_enabled Flip + 3-Layer Doc Fix | P6, P8 | T6 F6-02 HIGH + T5-F7 — DECKENT/VISION/DIRECTIVES sync + Sprint 142 fixture rewrite |
| **H6** | ADR-047 Manuel Survival Pattern Codification + Density Metric | P5, P4 | T5 §6 — 18 incident inventory hazır; sprint-reporter density gate |
| **M1** | Identity-Generator Step 2 Decommission + Auditor Lock-Watchdog + finalize breadcrumb persist | P4, P7 | T3 Bölüm 6 + T5-F1 + T3 Wire #5 — 3 small fix bundled (Step 2 dead code + Bug E timer + sprint-NNN.md breadcrumb) |
| **M2** | Sprint 153 CLAUDE.md Metrics + Skip Inventory Hygiene + Stub Mem Heal Tool | P1, P5, P8 | T2 §5.2 + T6 §1.2.5 + T5 §6.5 — `deckent memory heal` + CLAUDE.md auto-regen + skip rotation |

**Toplam:** 12 task (4 critical + 6 high + 2 medium). Spec §3.6 GO/NO_GO `task count ≤ 12 ✓`, `critical ≤ 4 ✓`.

### 4.4 Catch-22 Resolution Note (Sprint 167 v4 spec)

DIRECTIVES anchor `Catch-22 ÇÖZÜLDÜ (v4)` — Sprint 167 NO_GO → Sprint 168 BLOCKED DEĞİL. Aşağıdaki tedbirler:
- Bu T7 sentezi 7/7 anchor task DONE varsayımı altında üretildi (T1-T7 PASS, T2 retry sonrası 10 finding dahil).
- Sprint 168 ilk task: audit gap closure (if any) + roadmap consumption.
- NO_GO durumunda Sprint 168 scope shrunk: sadece Critical C1-C4 + H1-H3 → 7 task. M1/M2 Sprint 169'a.

---

## Section 5 — Synthesis Conclusion + Handoff

### 5.1 Cross-Cutting Synthesis Verdict

- **8 cross-cutting pattern** tespit edildi (P1-P8).
- **5 CRITICAL + 20 HIGH + 18 MEDIUM + 16 LOW + 5+ INFO** finding konsolide edildi (~50 unique post-dedup).
- **18 manuel survival incident** + **5 Bug forensic** (E/G/Z2/Z3/V) ADR-047 yazımı için yeterli.
- **4 P0 + 8 P1/P2** Sprint 168 roadmap'e 4-field schema ile seed edildi.
- Sprint 169 GA prerequisite cluster (P6) Sprint 168 H1, H3, H4, H5 ile kapanır.

### 5.2 Sprint 168 → Sprint 169 GA Path

```
Sprint 167 (audit) → Sprint 168 (remediation: 4 critical + 6 high + 2 medium)
                  → Sprint 169 (Open Source GA: public flip + npm publish v1.0.0-beta.2 + Show HN)
                  ↑
                  ⊥ blockers cleared in Sprint 168
```

Hard blockers Sprint 169 GA için:
- C3 + C4 + H1 → ADR governance closure + public ADR access
- H3 + H4 → secret scan baseline + dashboard build CI gate
- H5 → dep_pipeline flip + doc 3-layer fix (DECKENT.md + VISION.md + DIRECTIVES.md aligned)
- H6 → ADR-047 + manuel survival density <0.5 hedef gate

Sprint 168 NO_GO veya yeni BLOCKER → Sprint 169 GA kayar; fix Sprint 169'a girer (DIRECTIVES anchor #5.6 v4 esnek karar).

### 5.3 Handoff Files

Bu T7 sentezi 3 dosya üretti:

1. **`.audit/sprint-167/T7-cross-cutting-synthesis.md`** (bu rapor)
2. **`.audit/sprint-167/consolidated-inventory.md`** (severity + kategori dağılımı, ~50 finding + 10 T2 finding)
3. **`.audit/sprint-167/sprint-168-roadmap.md`** (12 task, falsifiable, 4-field per finding)

DIRECTIVES anchor predicate `.audit/sprint-167/T7-predicate.sh`:
- ≥3 cross-cutting pattern (Section 1 — 8 pattern, predicate kanıtı `grep -cE "^### Pattern P[0-9]+ — "` ≥3 PASS)
- `consolidated-inventory.md` severity + kategori dağılımı tüm 50+ finding kaydedildi (T2'nin 10 finding'i F-T2-01..06 dahil)
- `sprint-168-roadmap.md` task ≤12, critical ≤4, 4-field zorunlu per finding

### 5.4 Anchor Constraint Compliance Self-Statement

**HİÇBİR SOURCE/DOC DOSYASI BU TASK KAPSAMINDA DEĞİŞTİRİLMEDİ.** Yazılan dosyalar yalnızca `.audit/sprint-167/` ve `.tasks/task-run-1778748966937-0.*`. Bug Y2 anchor (`.deckent/ground-truth-overrides.json`) read-only respect edildi. T7 Wave 2 dependency contract (`["167-001","167-002","167-003","167-004","167-005","167-006"]`) tüm 6 raporun teslim edilmesi sonrası senthez yapıldı.

### 5.5 T7 Self-Assessment

- **selfAssessment:** DONE
- **Coverage:** 6/6 audit raporu okundu (T1 11 finding + T2 10 finding + T3 10 finding + T4 12 finding + T5 7 finding + T6 10 finding = 60 total)
- **Cross-cut patterns:** 8 distinct pattern (P1-P8) ≥3 spec threshold
- **Sprint 168 readiness:** 12 task seed (4 critical + 6 high + 2 medium), her biri 4-field schema
- **Predicate:** `.audit/sprint-167/T7-predicate.sh` 9 check PASS bekleniyor

---

**END OF T7 — Cross-Cutting Synthesis — Sprint 167 Task 167-007**

Imza: architect agent (Wave 2)
Yazar: w-run-1778748966937-0
Tarih: 2026-05-14
