# DIRECTIVES — Sprint 198: Brain NO_GO Kapanış + Memory.db Finalize Fix + Plan Refresh (4 dalga, 6 task + 2 opsiyonel)

## Goal: 1 Haziran 2026 OSS GA beta launch'a **5 gün kala** Brain dürüst raporlama %100 kapanış (Sentetik NO_GO KAYNAK 6+7 fix), memory.db sprint-log finalize bug fix (Sprint 194/196 row backfill), managed-docs auditor.md template regression fix, **3 kapsamlı plan dosyasının Sprint 195-197 status refresh** (beta-tracker + roadmap + comprehensive-work-plan), test baseline 41 fail attack (en kolay 15 fail), 6-worker × 2g RAM deney readiness verification.

Bağlam:
- Sprint 195-197: 17 rescue commit + ~6500 LoC + 164 yeni test ([[feedback_brain_synthetic_nogo_disk_verify]] kanıt)
- 197-001 worker keşfi: Sentetik NO_GO kaynakları 5 → 7 (sprint-phases:1318-1330 runEvaluatePhase + sprint-controller:963-1003 graceKill GATE'SİZ)
- 197-002 keşfi: memory.db sprint-log-194 + sprint-log-196 row'ları EKSİK (Brain finalize bug)
- 197 chore commit keşfi: managed-docs auto-update auditor.md PATTERNS.md eski paradigmaya regress
- Kullanıcı kararı (2026-05-26): max_workers 2 → 6, worker_memory_limit 3g → 2g (6 × 2g = 12GB peak)
- 3 kapsamlı plan dosyası **22 sprint stale**: docs/release/beta-tracker.md (Sprint 175), docs/vision/roadmap.md (Sprint 183), docs/alperen-analysis/2026-05-23-comprehensive-work-plan.md (Sprint 188)

Master plan refresh: `docs/release/beta-tracker.md` 20-gate exit criteria + `docs/vision/roadmap.md` Sprint 149-200 + `docs/alperen-analysis/2026-05-23-comprehensive-work-plan.md` 11 W-stream — üçü birden Sprint 198-004'te güncellenir.

---

## Tüm task'lar için ortak kurallar (Sprint 197 öğrenimleri uygulandı)

- **test scope ZORUNLU explicit:** scope.filesWrite test dizinlerini içermeli (`tests/orchestra/`, `tests/scripts/`, `tests/docker/`)
- Worker yalnızca scope.filesWrite içine yazar (ADR-037 + honest-gate)
- Her kod task'ı vitest minimum 4 test (mutlu/edge/hata/regresyon)
- Doc task'ı 3 test yeterli (script + run + structure check)
- `dosya:satır` kanıtı zorunlu, `.result` notes'una kanıt komutu çıktısı yapıştır
- ADR ihlali → NO_GO + amendment proposal
- `.brain/memory.db` write yalnızca core/memory-*.ts yolundan; **DB silmek YASAK**
- Sprint sonu tsc temiz + test regresyon yok (41 baseline fail Sprint 197'den, artmasın)
- **Dishonest result YASAK** — linesAdded claim disk'le çakışmalı
- **Sprint çalışırken /login, claude logout, MCP restart YASAK** ([[feedback_no_auth_touch_during_sprint]])
- **API mode YASAK** — Tier 1 30K tok/min cap ([[project_api_mode_deferred_post_beta]])
- **Karpathy 4-disciplines:** `.plan` first, YAGNI, surgical, goal-driven
- **Yeni Sprint 198:** scope.filesWrite test path auto-include (WP-3 deriveTestScope landed) — DIRECTIVES eksik kalırsa Brain otomatik ekler

---

## DALGA 0 — Brain Sentetik NO_GO Son Katmanlar (1 task — KRITIK ZORUNLU İLK)

> Sprint 197 197-001 worker keşfetti: disk-verify gate runtime'da var AMA 2 callsite gate'siz: `sprint-phases.ts:1318-1330` `runEvaluatePhase` (Sprint 196 196-005 token-counter.ts NO_GO TAM bu yoldan), `sprint-controller.ts:963-1003` graceKill panic-guard. Bu 2 wire Brain dürüst raporlama %100 kapatır.

---

## Task 1: 198-001 — Sentetik NO_GO KAYNAK 6+7 fix (sprint-phases + sprint-controller gate wire)
- Model: opus
- Effort: high
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/sprint-phases.ts, src/orchestra/sprint-controller.ts, src/orchestra/disk-verify.ts, tests/orchestra/sprint-phases-synthetic-gate.test.ts, tests/orchestra/sprint-controller-graceKill-gate.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description

**Problem (Sprint 197 197-001 keşif raporu):**
- `src/orchestra/sprint-phases.ts:1318-1330` `runEvaluatePhase` builds timeout/missing synthetic NO_GO WITHOUT calling `verifyDiskAgainstClaim`. Sprint 196 196-005 (token-counter.ts YENİ DOSYA) NO_GO TAM bu yoldan geçti — worker exited cleanly + no .timeout + no .result → result-collector.ts gate-protected .timeout branch never ran → Brain runEvaluatePhase ungated synthetic NO_GO yazdı.
- `src/orchestra/sprint-controller.ts:963-1003` `graceKill` panic-guard + explicit-kill paths aynı GATE'SİZ pattern.

**Çözüm:**

1. **`src/orchestra/sprint-phases.ts:1318-1330` runEvaluatePhase gate ekle (~50 LoC):**
   - Sentetik NO_GO JSON build etmeden ÖNCE `verifyDiskAgainstClaim(projectRoot, task.scope)` çağır
   - Eğer `hasDiskEvidence` (linesAdded > 0 || untrackedFiles.length > 0) → `status: MANUAL_REVIEW_REQUIRED` + audit event `BRAIN→AUDITOR:DISK_VS_CLAIM_MISMATCH`
   - Eğer disk boş → sentetik NO_GO yaz (legacy behavior preserved)
   - Pattern aynı `result-collector.ts:518-583`

2. **`src/orchestra/sprint-controller.ts:963-1003` graceKill gate ekle (~40 LoC):**
   - Aynı verifyDiskAgainstClaim wire iki path'e (panic-guard + explicit-kill)
   - Worker'ı kill ederken disk'te kod varsa MANUAL_REVIEW_REQUIRED

3. **`src/orchestra/disk-verify.ts`:** Mevcut helper, sadece import ek olarak. Yeni fonksiyon yazma — 195-001'in implementation'ı kullan.

4. **`tests/orchestra/sprint-phases-synthetic-gate.test.ts` (yeni, ≥5 test):**
   - (a) runEvaluatePhase + no .result + no disk → sentetik NO_GO (legacy)
   - (b) runEvaluatePhase + no .result + tracked diff → MANUAL_REVIEW_REQUIRED
   - (c) runEvaluatePhase + no .result + untracked file → MANUAL_REVIEW_REQUIRED
   - (d) Audit event emit kanal kanıt
   - (e) Sprint 196 196-005 senaryosu simulation (token-counter.ts pattern)

5. **`tests/orchestra/sprint-controller-graceKill-gate.test.ts` (yeni, ≥4 test):**
   - (a) graceKill + panic-guard + disk boş → NO_GO
   - (b) graceKill + panic-guard + disk dolu → MANUAL_REVIEW_REQUIRED
   - (c) Explicit-kill path aynı pattern
   - (d) Idempotency (zaten MANUAL_REVIEW_REQUIRED ise re-classify yok)

**Kanıt:**
- `grep -n "verifyDiskAgainstClaim" src/orchestra/sprint-phases.ts src/orchestra/sprint-controller.ts` → 4+ match
- `grep -n "MANUAL_REVIEW_REQUIRED\|DISK_VS_CLAIM_MISMATCH" src/orchestra/sprint-phases.ts src/orchestra/sprint-controller.ts` → 4+ match
- `npx vitest run tests/orchestra/sprint-phases-synthetic-gate.test.ts tests/orchestra/sprint-controller-graceKill-gate.test.ts` → 9+ pass
- `npx tsc --noEmit` clean
- **Sprint 198 kendisi:** Eğer bu sprint'te sentetik NO_GO yaşanırsa → MANUAL_REVIEW_REQUIRED yazılmalı (canlı kanıt)

**Test:** ≥9 test (5 + 4).

---

## DALGA 1 — Memory & Docs Hijyeni (2 task, paralel)

> 197-002 keşfi + chore commit keşfi'nin paralel çözümü. memory.db finalize bug + auditor.md template regression — ikisi de Brain managed-docs/finalize bug'ı.

---

## Task 2: 198-002 — memory.db sprint-log finalize bug fix + Sprint 194/196 row backfill
- Model: opus
- Effort: normal
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/sprint-finalizer.ts, src/core/memory-store.ts, scripts/backfill-sprint-log-rows.mjs, tests/orchestra/sprint-finalizer-row-upsert.test.ts, tests/scripts/backfill-sprint-log-rows.test.ts
- Scope: src/orchestra/, src/core/, scripts/, tests/orchestra/, tests/scripts/

### Description

**Problem (Sprint 197 197-002 keşif):**
- sprint-log-194 ve sprint-log-196 row'ları memory.db'de YOK
- 197-002 reclassify worker bu yüzden 12/12 yerine 2/12 reclassify yapabildi (10 skipped "sprint-entry-missing")
- Sprint 194 muhtemelen finalize öncesi halted, Sprint 196 mid-finalize
- Brain sprint sonu finalize → sprint-log row upsert path'inde bir crash veya skip var

**Çözüm:**

1. **`src/orchestra/sprint-finalizer.ts` (mevcut, +30 LoC):**
   - sprint-log row upsert path inspect (hangi koşulda atlanıyor)
   - Defensive write: even if metrics calculation fails, write minimum row (sprintId, totalTasks, dur)
   - try/catch wrap + log error (sprint sonu silent fail YOK)

2. **`src/core/memory-store.ts` (mevcut, +10 LoC):**
   - `upsertSprintLog(sprintId, payload)` helper varsa kullan; yoksa ekle
   - Atomic upsert (sprint zaten varsa update, yoksa insert)

3. **`scripts/backfill-sprint-log-rows.mjs` (yeni, ~80 LoC):**
   - CLI: `node scripts/backfill-sprint-log-rows.mjs --sprint sprint-194` veya `--all-missing`
   - .brain/archive/sprint-NNN-tasks/ + .deckent/archive/sprints/sprint-NNN/ dosyalardan reconstruct
   - Task outcomes section: task .result dosyalarından (filesChanged/selfAssessment/etc) infer
   - Memory.db'ye yaz
   - **Sprint 194 + Sprint 196 row backfill run** olur

4. **`tests/orchestra/sprint-finalizer-row-upsert.test.ts` (yeni, ≥4 test):**
   - (a) Happy path: finalize başarılı → sprint-log row yazılı
   - (b) Metrics calculation fail → defensive minimal row yine yazılır
   - (c) Race: 2 finalize call → idempotent
   - (d) Halted sprint (interrupt) → row yine yazılı

5. **`tests/scripts/backfill-sprint-log-rows.test.ts` (yeni, ≥3 test):**
   - (a) Sprint 194 archive parse + memory.db write
   - (b) `--all-missing` flag (Sprint 194 + 196 detect + write)
   - (c) Idempotent re-run

**Kanıt:**
- `node -e "const db=require('better-sqlite3')('.brain/memory.db',{readonly:true}); console.log(db.prepare(\"SELECT id FROM entries WHERE sprint_id IN ('sprint-194','sprint-196') AND type='sprint'\").all().length);"` → 2 (Sprint 194 + 196)
- `node scripts/sprint-retroactive-reclassify.mjs --from-file scripts/reclassify-sprint-191-196.json` → 12 applied (10 skipped artık olmamalı)
- `npx vitest run tests/orchestra/sprint-finalizer-row-upsert.test.ts tests/scripts/backfill-sprint-log-rows.test.ts` → 7+ pass
- `npx tsc --noEmit` clean

**Test:** ≥7 test.

---

## Task 3: 198-003 — managed-docs auditor.md template regression fix
- Model: sonnet
- Effort: low
- Skills: typescript-expert, documentation-writer
- Files: src/orchestra/managed-docs/templates/*, src/orchestra/managed-docs/render.ts (veya benzer), .claude/rules/auditor.md, tests/orchestra/managed-docs-auditor-template.test.ts
- Scope: src/orchestra/managed-docs/, .claude/rules/, tests/orchestra/

### Description

**Problem (Sprint 197 chore commit keşif):**
- Sprint 197 öncesi (commit 37e01242) `.claude/rules/auditor.md`:
  * Line 3: `paths: [".dashboard"]` (PATTERNS.md kaldırıldı)
  * Line 17: "Append new patterns to PATTERNS.md" silindi
- Sprint 197 sonu Brain managed-docs AUTO-START/AUTO-END regenerate ETT İ → ESKİ PARADIGMA geri yazıldı
- Template hâlâ `.brain/PATTERNS.md` referansını + "Append" cümlesini içeriyor

**Çözüm:**

1. **Managed-docs template dosyasını bul** (`src/orchestra/managed-docs/templates/` veya `src/orchestra/managed-docs/render/`):
   - `grep -rn "PATTERNS.md\|Append new patterns" src/orchestra/managed-docs/` ile tespit
   - Template dosyasında:
     * `paths: [".dashboard",".brain/PATTERNS.md"]` → `paths: [".dashboard"]`
     * "- Append new patterns to `PATTERNS.md` (never overwrite)" → SİL
     * Mevcut "- Write patterns to DB: `store.insert({ type: 'pattern', ... })`" (line 9) yeterli

2. **`.claude/rules/auditor.md`** — Sprint 198 sonu Brain regenerate edince doğru template render edilsin (test sırasında bu da otomatik düzelir)

3. **`tests/orchestra/managed-docs-auditor-template.test.ts` (yeni, ≥3 test):**
   - (a) Template'te PATTERNS.md referansı YOK (regex)
   - (b) Template'te "Append" string'i YOK
   - (c) Memory.db pattern upsert talimatı VAR

**Kanıt:**
- `grep -c "PATTERNS\.md\|Append new patterns" src/orchestra/managed-docs/` → 0
- `grep -c "PATTERNS\.md\|Append new patterns" .claude/rules/auditor.md` → 0 (Sprint 198 sonu render sonrası)
- `npx vitest run tests/orchestra/managed-docs-auditor-template.test.ts` → 3+ pass

**Test:** ≥3 test.

---

## DALGA 2 — Plan Dosyaları Refresh + RAM Verify (2 task)

> 3 kapsamlı plan dosyası 22+ sprint stale. Sprint 198-004 tek task'ta üçünü birden refresh eder. 198-005 6-worker config doğrulama + RAM deney readiness.

---

## Task 4: 198-004 — Kapsamlı plan dosyaları Sprint 195-197 status refresh (3 dosya)
- Model: opus
- Effort: high
- Skills: documentation-writer, typescript-expert
- Files: docs/release/beta-tracker.md, docs/vision/roadmap.md, docs/alperen-analysis/2026-05-23-comprehensive-work-plan.md
- Scope: docs/release/, docs/vision/, docs/alperen-analysis/

### Description

**Problem:**
- `docs/release/beta-tracker.md` 20-gate exit criteria — son güncelleme Sprint 175 (2026-05-20). 22 sprint stale.
- `docs/vision/roadmap.md` Sprint 149-200 master plan — Sprint 183 (2026-05-21) son. 14 sprint stale.
- `docs/alperen-analysis/2026-05-23-comprehensive-work-plan.md` 11 W-stream — Sprint 188 (2026-05-23) son. 9 sprint stale.

Sprint 195-197 ~17 rescue commit + 6500 LoC + 164 yeni test + 7 sentetik NO_GO kaynak haritası + WP Tier-1 wire + memory.db finalize bug keşfi + auditor.md template regression hiçbir plan'a yansımadı.

**Çözüm:**

1. **`docs/release/beta-tracker.md` refresh:**
   - "Last updated: 2026-05-26 (Sprint 197)" + "Latest sprint: 197" + "Version: v1.0.0-beta.1 → v1.0.0 GA target"
   - 20-gate status update (her gate için Sprint 195-197 evidence):
     * Gate 1 (tsc): ✅ Sprint 197 commit 37e01242 + cd4df0ed
     * Gate 2 (vitest): ✅ 17411/17502 pass (Sprint 197 baseline 41 fail, kategorize)
     * Gate 11 (docs sync): Sprint 197 197-003 CHANGELOG 40 entry + Sprint 198 plan refresh
     * Yeni gate önerisi: **Gate 21: Brain dürüst raporlama** — Sprint 198-001 KAYNAK 6+7 kapanış sonrası
   - "Sprint 196-197 — Worker Prompt God-Level Stream + Disk-Verify Gate" yeni bölüm

2. **`docs/vision/roadmap.md` refresh:**
   - Sprint 184-197 satırlarını ekle (tablo)
   - "Closed initiatives" Sprint 195-197 öğrenimleri
   - 1 Haziran beta launch tarih + Sprint 200 milestone "GA Canonical Launch" güncel

3. **`docs/alperen-analysis/2026-05-23-comprehensive-work-plan.md` refresh:**
   - 11 W-stream tablosuna "Status (2026-05-26)" sütunu (subagent raporundaki tablo)
   - W-A ✅ 5/5, W-B ✅ 23/35, W-C ✅ Path B LIVE, W-F ✅ P0, W-G ✅ P0, W-H ⚠ partial
   - Appendix: "Sprint 189-197 Landing Summary" (5 satır tablosu — sprint, task count, DONE%, key achievement)
   - "Faz 1 Checkpoint (2026-05-26)": Beta launch READY işareti

**Kanıt:**
- `head -5 docs/release/beta-tracker.md | grep "2026-05-26\|Sprint 197"` → match
- `head -5 docs/vision/roadmap.md | grep "Sprint 19[5-7]"` → match
- `grep -c "2026-05-26\|Sprint 19[5-7]" docs/alperen-analysis/2026-05-23-comprehensive-work-plan.md` → ≥3
- `wc -l` üç dosya → öncesi vs sonrası satır artışı 100-300 satır

**Test:** Audit task — 3 dosyada yapı + içerik check, kod testi yok. Sprint 197 197-001 worker pattern'i (test eklemekle yetinmek) izlenir.

---

## Task 5: 198-005 — 6-worker × 2g config verify + RAM deney readiness audit
- Model: sonnet
- Effort: normal
- Skills: devops-engineer, docker-expert
- Files: src/cli/commands/doctor.ts, tests/cli/doctor-ram-experiment.test.ts, docs/guide/ram-experiment.md
- Scope: src/cli/, tests/cli/, docs/guide/

### Description

**Problem:**
Kullanıcı kararı 2026-05-26: max_workers 2 → 6, worker_memory_limit 3g → 2g (mevcut config edit edildi). Peak RAM ihtiyacı: 6 × 2g = 12GB (+ host overhead). WSL2 host RAM yeterli mi? `deckent doctor --memory` mevcut ama 6-worker scenario'su için ad-hoc rapor.

**Çözüm:**

1. **`src/cli/commands/doctor.ts` (+30 LoC):**
   - `--ram-experiment` flag ekle: mevcut host RAM detect (Sprint 195 195-005 detectHostMemory) + 6-worker scenario rapor
   - Output:
     ```
     Host RAM: 24 GB (source=meminfo)
     Current config: max_workers=6, worker_memory_limit=2g
     Peak RAM ihtiyacı: 12 GB (worker'lar) + 2 GB (host overhead) = 14 GB
     Recommendation: ✓ Safe (host ≥ 14 GB)
                     veya
                     ⚠ Risky (host < 14 GB — OOM riski)
                     Recommend: ~/.wslconfig memory=24GB, restart WSL2
     ```

2. **`docs/guide/ram-experiment.md` (yeni, ~80 satır):**
   - 6-worker × 2g vs 2-worker × 3g vs 12-worker × 2g matrix
   - Her senaryo için host RAM gerek + güvenlik
   - WSL2 `.wslconfig` örnek
   - Sprint 192 192-013 historical context

3. **`tests/cli/doctor-ram-experiment.test.ts` (yeni, ≥4 test):**
   - (a) Host 24GB + 6-worker config → "Safe"
   - (b) Host 12GB + 6-worker config → "Risky" + recommendation
   - (c) Mode'lara göre peak hesap (performance vs balanced)
   - (d) Edge: host detect fail → "Cannot determine, manual verify"

**Kanıt:**
- `npx deckent doctor --ram-experiment` → output Safe/Risky verdict
- `wc -l docs/guide/ram-experiment.md` → ≥80
- `npx vitest run tests/cli/doctor-ram-experiment.test.ts` → 4+ pass

**Test:** ≥4 test.

---

## DALGA 3 — Test Baseline Attack (1 task, opsiyonel sprint kısalırsa)

> Sprint 197 sonrası 41 baseline fail. Sprint 196 196-007 audit raporu (`docs/audits/sprint-196/test-fail-categorize.md`) rehber. En kolay 10-15 fail bu sprint'te kapatılabilir.

---

## Task 6: 198-006 — Test baseline 41 → 26 attack (en kolay 15 fail)
- Model: opus
- Effort: high
- Skills: testing-expert, typescript-expert
- Files: tests/cli/commands.test.ts, tests/cli/rich-output.test.ts, tests/docs/vitepress.test.ts, tests/docs/github-pages-deploy.test.ts, src/cli/commands/init.ts (gerekirse)
- Scope: tests/cli/, tests/docs/, src/cli/

### Description

**Problem:**
Sprint 195+196'da 11 fail düzeltildi (52 → 41). Sprint 196 196-007 audit raporuna göre 41 fail 4 kategori:
- Baseline (25-27 persistent pre-existing)
- Regression (6-8 new Sprint 190-195)
- TDD Pending (12-14 expected fail)
- Environment (5-6 infra/tooling)

Tier 1 kolay grup:
- tests/cli/commands.test.ts (5 fail) — init templates content drift
- tests/cli/rich-output.test.ts (5 fail) — README CLI command table
- tests/docs/vitepress.test.ts (5 fail) — VitePress sidebar
- tests/docs/github-pages-deploy.test.ts (3 fail) — CNAME, deps, master push

= 18 fail potential, hedef 15.

**Çözüm:**

1. **tests/cli/commands.test.ts** — init template'leri (auditor.md, brain.md, DECKENT.md, claude rules, worker-default.md):
   - 198-003'ün template fix'inden sonra çoğu otomatik geçer
   - Kalan'lar: src/cli/commands/init.ts content sync (Sprint 195+ doc değişiklikleri)

2. **tests/cli/rich-output.test.ts** — README CLI command table:
   - README'de mevcut command listesi count (33+ command bekleniyor)
   - `deckent --help` çıktısından command listesi extract + README'ye sync

3. **tests/docs/vitepress.test.ts** — VitePress sidebar sections:
   - `docs/.vitepress/config.ts` (veya .mts) — eksik sidebar entry'ler ekle
   - API Reference, Architecture, CLI Reference, Plugin Development sections

4. **tests/docs/github-pages-deploy.test.ts** — `.github/workflows/docs.yml`:
   - CNAME oluşturma adımı
   - Docs deps install (npm ci veya pnpm)
   - master push trigger

**Kanıt:**
- `npx vitest run tests/cli/commands.test.ts tests/cli/rich-output.test.ts tests/docs/vitepress.test.ts tests/docs/github-pages-deploy.test.ts` → ≥15 fail düşmesi (öncesi 18, sonrası ≤3)
- Tam suite: `npx vitest run 2>&1 | grep "Tests"` → öncesi 41 fail, sonrası ≤26 fail
- `npx tsc --noEmit` clean

**Test:** ≥15 test pass (mevcut fail'ler yeşil olunca).

---

## OPSİYONEL — DALGA 4 (Sprint 198 hızlı landerse)

## Task 7 (OPSİYONEL): 198-007 — Sprint 191-196 retroactive reclassify re-run (12/12 hedef)
- Model: haiku
- Effort: low
- Skills: typescript-expert
- Files: scripts/reclassify-sprint-191-196.json (mevcut)
- Scope: scripts/

### Description

**Önkoşul:** 198-002 (memory.db sprint-log finalize) DONE landed. Sprint 194 + 196 row'ları memory.db'de var.

**Çözüm:**
```bash
node scripts/sprint-retroactive-reclassify.mjs --from-file scripts/reclassify-sprint-191-196.json
```

Sprint 197 197-002'de 2/12 applied + 10 skipped (sprint-entry-missing). Sprint 198-002 row'ları ekleyince script re-run'da 12/12 applied olur.

**Kanıt:**
- Output: "Reclassified 12 tasks / Skipped 0"
- `ls .deckent/decisions/decision-reclassify-2026-05-27.json` → 1 dosya (yeni audit)
- `deckent agent stats` → temp-react-ts-specialist Sprint 195-196 entries DONE

**Test:** Audit task.

---

## Task 9 (OPSİYONEL): 198-009 — Memory backup auto-sync mekanizması (user-memory ↔ core-memory)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: scripts/sync-core-memory.mjs, .claude/settings.json (hook), tests/scripts/sync-core-memory.test.ts
- Scope: scripts/, .claude/, tests/scripts/

### Description

**Problem (2026-05-26 incident):**
Session logout sonrası `~/.claude/projects/-home-alperen-deckent-dev/memory/` 18 entry kayboldu. Master plan referans + git history + memory.db pattern entry'lerinden manuel recovery yapıldı (45dk). Tekrar yaşanmaması için **AUTO-SYNC** + restore mekanizması.

Şimdiki durum (Sprint 198 başlangıcı):
- 27 user-level memory entry
- `docs/core-memory/` (gitignored) yedek — manuel `cp` ile senkron
- AUTO trigger YOK

**Çözüm:**

1. **`scripts/sync-core-memory.mjs` (yeni, ~80 LoC):**
   - CLI: `node scripts/sync-core-memory.mjs [--backup|--restore|--bidirectional]`
   - `--backup` (default): user-memory → docs/core-memory rsync
   - `--restore`: docs/core-memory → user-memory (session logout recovery)
   - `--bidirectional`: timestamp-based newer-wins merge
   - Stale detection: 2 dizinde farklı entry varsa diff göster, kullanıcı onay
   - Idempotent — aynı içerik re-run safe

2. **`.claude/settings.json` hook:**
   - `Stop` hook'a `node scripts/sync-core-memory.mjs --backup` ekle (her session kapanışında sync)
   - Opsiyonel: `SessionStart` hook'a `node scripts/sync-core-memory.mjs --restore --dry-run` ekle (eksik entry varsa uyarı)

3. **`tests/scripts/sync-core-memory.test.ts` (yeni, ≥5 test):**
   - (a) `--backup` happy path: user → core kopyalanır
   - (b) `--restore`: core → user kopyalanır (eksik entry restore)
   - (c) Idempotent re-run "no changes"
   - (d) Bidirectional newer-wins (timestamp check)
   - (e) Stale detection user-only entry warn

**Kanıt:**
- `node scripts/sync-core-memory.mjs --backup` → "Synced 27 entries"
- `node scripts/sync-core-memory.mjs --restore --dry-run` → "All entries present"
- `.claude/settings.json` Stop hook → grep "sync-core-memory" 1 match
- `npx vitest run tests/scripts/sync-core-memory.test.ts` → 5+ pass

**Test:** ≥5 test.

---

## Task 8 (OPSİYONEL): 198-008 — Beta launch smoke pre-check (npm pack dry-run + 20-gate verify)
- Model: opus
- Effort: normal
- Skills: devops-engineer, ci-testing
- Files: scripts/beta-launch-precheck.mjs, docs/release/sprint-198-precheck-report.md
- Scope: scripts/, docs/release/

### Description

**Problem:** 1 Haziran beta launch'a 4 gün (Sprint 198 sonrası 27 May → 28-31 May packaging). `docs/release/beta-tracker.md` 20-gate exit criteria stale. Tüm gate'ler hâlâ PASS mı?

**Çözüm:**

1. **`scripts/beta-launch-precheck.mjs` (yeni, ~150 LoC):**
   - 20 gate'i otomatik check:
     * Gate 1 tsc → `npx tsc --noEmit` exit 0
     * Gate 2 vitest → ≥99.5% pass
     * Gate 3 coverage → `vitest --coverage` lines ≥85%
     * Gate 4 MCP tools → `npx deckent help` 32 tool listesi
     * Gate 5 CLI commands → `npx deckent --help` 45+ command
     * Gate 6 npm pack → `npm pack --dry-run` exit 0 + 0 warnings
     * Gate 11 docs sync → ground-truth checks
     * vs.
   - Output: 20-line tablo PASS/FAIL/WARN her gate için
   - Exit code: 0 if all PASS, 1 if any FAIL

2. **`docs/release/sprint-198-precheck-report.md` (yeni):**
   - Script çıktısı + analiz
   - Sprint 198-001..006 sonrası 20-gate yeni status
   - 1 Haziran launch için kalan blocker'lar (varsa)

**Kanıt:**
- `node scripts/beta-launch-precheck.mjs` → exit 0 (veya 1 + detay)
- 20-gate status tablosu `docs/release/sprint-198-precheck-report.md` içinde

**Test:** Script structure test (3+ test).

---

## Sprint Sonu Notu

**Beklenen sonuç:** 6/6 zorunlu DONE + 0-2 opsiyonel. Sprint 198 = Brain dürüst raporlama %100 kapanış + 3 plan dosyası refresh + memory.db finalize bug fix + auditor.md template fix + RAM 6-worker verify + 15 test baseline fail kapanış.

**Pre-beta uyarı:** Sprint 198 koşulurken /login, claude logout, MCP restart YASAK. Sprint başlamadan önce subscription credentials canlı doğrula (`claude --version`).

**Tahmini süre:** 2-3 saat (6 zorunlu task). Subscription quota ~25-35 mesaj — Pro 45/5h içinde.

**RAM beklentisi:** max_workers=6, worker_memory_limit=2g, peak ~12GB. WSL2 host ≥16GB ise güvenli. Eğer host <16GB ise OOM riski — Sprint başlatmadan önce `deckent doctor --ram-experiment` çalıştırılması önerilir.

Next (Sprint 199 önizleme): npm publish v1.0.0-beta.1 packaging + Dockerfile.worker image build/push automation + beta announcement materyali + Sprint 198 sonrası kalan baseline fail attack (26 → ≤15).

Sprint 200 (1 Haziran 2026): **v1.0.0-beta.1 NPM PUBLISH** — Alperen manuel runs `npm publish` (per project policy).

Master plan: `docs/alperen-analysis/2026-05-23-comprehensive-work-plan.md` — Sprint 198-004 ile güncel hale gelir.
Beta exit gates: `docs/release/beta-tracker.md` — Sprint 198-004 ile 20-gate Sprint 197 status sync.
Roadmap: `docs/vision/roadmap.md` — Sprint 198-004 ile Sprint 184-197 entries eklenir.

---

İlgili memory:
- [[feedback_brain_synthetic_nogo_disk_verify]] — 7 kaynak haritası
- [[feedback_no_auth_touch_during_sprint]] — sprint çalışırken auth touch yasak
- [[project_api_mode_deferred_post_beta]] — API mode 1 Haziran sonrası
- [[project_4cli_subscription_vision]] — Claude/Codex/Gemini subscription default
- [[feedback_worker_prompt_engineering_god_level]] — WP-1..WP-12 stream
- [[project_system_risk_inventory]] — 11 sistem riski + WrongStack durum
- [[feedback_proactive_blocker_disclosure]] — bilinen blocker disclosure
