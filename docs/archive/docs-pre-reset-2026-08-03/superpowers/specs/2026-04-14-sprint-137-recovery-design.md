# Sprint 137 — Recovery Sprint Design (Test Restoration + Wire Fixes + Docs Sync)

**Date:** 2026-04-14
**Sprint:** sprint-137
**Theme:** Recovery (Sprint 136 carry-over debt closure)
**Previous:** sprint-136 (8/17 Layer 3, readiness 3.925, GO_WITH_TECH_DEBT, -1681 LoC architectural win + 123 test fail regression)
**Author:** Claude Opus 4.6 (1M context) — brainstorming session 2026-04-14
**Execution Model:** Hybrid Wave (3 waves, Kapsam A, 6 tasks, ~3-4 saat execute, 4 saat hard cap)

---

## 1. Context & Problem Statement

Sprint 136 tamamlandı **2026-04-13** 55m 13s natural execution, zero coordinator crash. Final label: **GO_WITH_TECH_DEBT** — 8/17 Layer 3 criteria, readiness ~3.925/5 (Sprint 135 3.93'ten -0.005 marjinal regression). Sprint 136 iki farklı yüzlü bir sprint:

**🏆 Büyük kazanımlar:**
- `sprint-controller.ts` 1890 → 209 LoC (-1681 satır, target ≤400 çok aşıldı) — modülerleşme büyük win
- `sprint-spawner.ts`, `sprint-lifecycle.ts`, `sprint-planner.ts` yeni modüller (barrel re-export pattern)
- T-005 canlı dogfood nihai çözümü (pre-flight'ta `sprint-controller.ts:528` hardcoded `priority: 'NORMAL'` wire bug'ı bulundu, Task 6 worker doğru fix etti)
- `tryCodeVerifiedDone` helper +408 satır `result-evaluator.ts` (Sprint 136'nın meta-dogfood kahramanı olmak üzere tasarlandı ama wire edilemedi)
- Auto-archive REDEMPTION devam, zero coordinator crash devam

**⚠ Sert regresyonlar:**
- **vitest 5 fail → 123 fail / 14 test file** — tümü `tests/orchestra/` altında, single root cause: Task 8 `sprint-controller.ts` 1890→209 LoC refactor yan etkisi. Task 8 scope'u `tests/orchestra/sprint-controller.test.ts` (+70 satır) dışındaki downstream test'leri kapsamamıştı.
- **3 ana NO_GO (Task 2 async I/O, Task 7 lint, Task 8 slim)** — Docker HB shutdown bug pattern 3 sprint'tir süreğen (Sprint 134-135-136)
- **Task 4+5 runtime wire kayboldu** — gate.json + load-report.md hook'ları `sprint-finalizer.ts`'e eklendi ama Task 8 full rewrite finalizeSprint call path'ini değiştirdi, wire broken. `.deckent/sprint-136-gate.json` + `docs/audits/sprint-136/` hiç oluşmadı
- **Brain budget decay no-op bug** — `cleanup --decay` 1204 → 1204 no-op dönüyor, DECAY_EXEMPT mantığı overflow'u yutuyor

**Meta-dogfood ironi:** Sprint 136'nın Task 3 `tryCodeVerifiedDone` helper'ı tam olarak Sprint 136'nın kendi Docker HB NO_GO'larını yakalamak için tasarlandı. Helper kod fiziken yazıldı ve DONE etiketli, ama kendi sprint'inde **canlı wire edilmediği** için 3 ana NO_GO + 4 fix worker NO_GO'yu yakalayamadı. Bu Sprint 137'nin en önemli rehavet kaldırıcı dersi: **helper + wire + dogfood aynı task altında olmalı**.

**Sprint 136 carry-over debt:** 10 item, 4 P0 critical (test restoration, Task 3 wire, Task 4+5 wire, Task 7 lint wire).

**Canlı pre-flight bulgusu (Sprint 137 Wave 0):** `tests/orchestra/task-limit.test.ts` fail örneği → `sprint-spawner.ts:178` → `auditor.ts:367` `updateDashboard()` → `writeFileSync` ENOENT. Test temp dir'leri (`/tmp/deckent-tasklimit-spawn-XXX/`) `.dashboard` dosyasının var olmasını beklemiyordu, yeni call path Task 8 refactor sonrası dashboard write'ı zorunlu kılıyor. Root cause Task 137-001 worker'a sunulacak.

---

## 2. Goals & Success Criteria

**Ana hedef:** Sprint 136'nın broken bıraktığı her şeyi temizle, yeni özellik eklemeden recovery tamamla.

**Ölçülebilir hedefler:**

| Metrik | Sprint 136 | Sprint 137 Hedef | Delta |
|--------|-----------|------------------|-------|
| Layer 3 criteria | 8/17 | **≥14/17** | +6 bounce |
| Readiness | 3.925/5 | **≥4.05/5** | +0.125 |
| vitest fail count | 123 | **0** | -123 |
| vitest pass count | 12561 | **≥12684** | +123 |
| tsc errors | 0 | **0** | — |
| Coordinator crash | 0 | **0** | — |
| Manual recovery | Partial | **0** | -partial |
| Carry-over debt | 10 | **≤4** | -6 |
| Clean GO (not TD) | ❌ GO_WITH_TECH_DEBT | **✅ Clean GO** | — |
| Kapalı beta publish-ready | ❌ | **✅** | — |

**Sprint 137 sonu durum:** Kapalı beta publish-ready (10-50 kişi). Public beta (milyon-user) için 6-7 sprint daha (Sprint 138-144 chain).

---

## 3. Scope (Kapsam A — 6 Task)

**In scope:**
1. Task 137-001 — Brain test suite post-refactor restoration (14 files / 123 tests)
2. Task 137-002 — `tryCodeVerifiedDone` wire + in-sprint dogfood unit test
3. Task 137-003 — gate.json + load-report.md runtime wire restore
4. Task 137-004 — ErrorRegistry lint script wire (package.json + invoke test)
5. Task 137-005 — BETA-TRACKER + BLUEPRINT Sprint 134-136 sync
6. Task 137-006 — Brain budget decay no-op bug fix

**Out of scope (Sprint 138-140 chain):**
- Async I/O full migration (Sprint 132 CRITICAL #1, Sprint 136 partial)
- Docker HB shutdown bug core fix (signal sequence revamp)
- `sprint-controller.ts` post-refactor stability pass
- Multi-provider simultaneous test (Claude + Codex + Gemini)

**Out of scope (Sprint 141-143 chain):**
- Heartbeat daemon 24h stability
- Human checkpoints canlı sprint
- Agent evolution pipeline gözlemli run
- Rate limiting production test
- Security hardening (MCP auth, Docker hardening, plugin signature)

**Out of scope (Sprint 144 chain):**
- Public beta GA (milyon-user ready)

**Sprint 137 yasakları:**
- ❌ Yeni feature eklemek
- ❌ `sprint-controller.ts`'e dokunmak (Sprint 136'da stabilize)
- ❌ Async I/O full migration
- ❌ Docker HB core fix
- ❌ Heartbeat/checkpoint dogfood
- ❌ `git add -A` veya `commit --amend`
- ❌ FINAL report Section N+1 append ederken Section 1 inline update'i atlamak
- ❌ "Yarım iş" psikolojisi (feedback_no_half_measures.md)

---

## 4. 17-Criterion Verification Framework (Layer 3 Pipeline)

Sprint 134-135-136 pattern'ı devam. Her kriter **binary** (pass/partial/fail), scorecard'da tablo olarak dökümante edilir.

### Layer 1 — Deckent Self-Evaluation (3 criteria)

1. **Brain label ≥8/10 task DONE** — Target: 6 × 0.8 = 5 DONE. Sprint 137'de 6 task olduğu için 5 DONE eşiği.
2. **HIGH effort tasks DONE or TD, not NO_GO** — Task 137-001 (high) ve Task 137-002 (normal), hiçbiri NO_GO olmamalı.
3. **Brain rubric avg ≥75/100** — `.result` dosyalarında rubricScores field'ı varsa ortalaması ≥75.

### Layer 2 — Technical Verification (3 criteria)

4. **`npx tsc --noEmit` → 0 errors**
5. **`npx vitest run` → 0 fail, ≥12684 pass** (Task 137-001'in direkt hedefi)
6. **Dashboard regression yok** — `tests/dashboard/` ayrı suite, 413 test pass

### Layer 3 — Manual Verification (3 criteria)

7. **Per-task physical grep proof (6/6 task)** — Her task için hedef dosyada kod değişikliği kanıtı
8. **Scope compliance — 0 boundary violation** — `git diff --stat` sadece declared scope içinde
9. **Auto-archive canlı** — `.brain/archive/DIRECTIVES-sprint-137.md` + `.brain/sprints/sprint-137.md` otomatik, DIRECTIVES.md Sprint 138 template'e reset

### Layer 4 — Triple Dogfooding / Artifact Generation (3 criteria)

10. **metrics.jsonl canlı ≥50 line** — Sprint 136 37 satır, Sprint 137 hedef ≥50
11. **`docs/audits/sprint-137/load-test-report.md` runtime oluştu** — Task 137-003 wire kanıtı
12. **`.deckent/sprint-137-gate.json` overallGate === "PASS" veya "WARNING"** — Task 137-003 wire kanıtı

### Layer 5 — Product Vision Regression (4 criteria)

13. **ADR-033 + ADR-034 immutable** — `.brain/DECISIONS.md` ADR satırları değişmemeli (decay-exempt)
14. **`docs/vision/roadmap.md` immutable** — modified files list'te olmamalı
15. **Forbidden terms audit** — `saas`, `cloud-hosted`, `paywall`, `enterprise edition` terimleri Sprint 137 diff'inde olmamalı
16. **Per-task vision lens (6/6 vision-audited)** — DIRECTIVES her task'ta "product not service" prensibi uygulanmış

### Layer 6 — Kur-Çalıştır Readiness Score (1 criterion)

17. **Readiness ≥4.05/5** — weighted axis scoring sonucu

**Target breakdown:**
- Optimistic: 16/17 (sadece L1 Criterion 3 unmeasurable kalırsa)
- Realistic: 14-15/17
- Minimum acceptable: 12/17 (altında Sprint 138 restoration devam)

---

## 5. Architecture — Hybrid Wave Execution Model

### 5.1 Wave Structure

```
Wave 1 (Gate, ~2-3 saat, 1 worker)
  └─ Task 137-001: Brain Test Suite Post-Refactor Restoration
       Barrier: 0 fail / 12684+ pass olmadan Wave 2 başlamaz

Wave 2 (Wire Live, ~45-60 dk, 1 worker)
  └─ Task 137-002: tryCodeVerifiedDone Wire + Dogfood Unit
       Barrier: Wire aktifleştiği an helper Sprint 137 runtime'ında canlı
       (Wave 3 spurious NO_GO'ları retrospektif yakalayabilir)

Wave 3 (Parallel Fan-out, ~60-90 dk, 3 worker max)
  ├─ Task 137-003: gate.json + load-report.md runtime wire restore
  ├─ Task 137-004: ErrorRegistry lint script wire
  ├─ Task 137-005: BETA-TRACKER + BLUEPRINT Sprint 134-136 sync
  └─ Task 137-006: Brain budget decay no-op bug fix
     
     Batch 1 (3 worker paralel): Task 3 + Task 4 + Task 5
     Batch 2 (1 worker):          Task 6
```

**Toplam tahmin:** 3-4 saat natural execution, 4 saat (14400000 ms) hard cap.

### 5.2 Wave Barrier Rationale

**Wave 1 → Wave 2:** Task 137-002 `brain.test.ts`'e yeni test ekleyecek (+3-5 test). Sprint 136 sonrası 41 fail varken yeni test ekleyen worker mock state'i karışıklığına kapılır, yanlış fix yapabilir. Test suite yeşile dönmeden downstream task'lar unsafe.

**Wave 2 → Wave 3:** Task 137-002 ve Task 137-003 aynı dosyaya (`src/orchestra/sprint-finalizer.ts`) yazar. Sıralama zorunlu — file lock collision veya merge conflict riski. Ayrıca Task 137-002 wire'ının Wave 3 boyunca canlı olması meta-dogfood amacı için gerekli.

**Wave 3 paralelizm:** 4 task / 3 worker = 1 batch (3) + 1 straggler (1). Worker spawn sıralaması Task Priority ile belirlenecek: Task 3 (HIGH), Task 4 (HIGH), Task 5 (HIGH) önce; Task 6 (NORMAL) ikinci batch. Task Priority doğru wire edildi (Sprint 136 T-005 dogfood kanıtı), bu Sprint 137'de **ikinci canlı kanıt** olur.

### 5.3 File Conflict Matrix

| Wave | Task | Primary Files | Collision? |
|------|------|---------------|-----------|
| 1 | 137-001 | `tests/orchestra/**`, `tests/e2e/docker-backend.test.ts`, `tests/docs/jsdoc.test.ts`, `src/orchestra/sprint-spawner.ts` (minimal) | ❌ Wave 1 solo |
| 2 | 137-002 | `src/orchestra/sprint-finalizer.ts`, `src/orchestra/result-evaluator.ts`, `tests/orchestra/sprint-finalizer.test.ts`, `tests/orchestra/result-evaluator.test.ts` | ❌ Wave 2 solo |
| 3 | 137-003 | `src/orchestra/sprint-finalizer.ts`, `src/core/observability.ts` | ⚠ Wave 2 ile aynı dosya → **Wave barrier ile sıralı** |
| 3 | 137-004 | `scripts/check-error-handling.mjs`, `package.json`, `tests/core/error-handling-unification.test.ts` | ❌ İzole |
| 3 | 137-005 | `BETA-TRACKER.md`, `DECKENT-MASTER-BLUEPRINT.md` | ❌ Salt doc |
| 3 | 137-006 | `src/brain/budget.ts` veya `src/orchestra/debt-manager.ts`, `tests/orchestra/memory-decay.test.ts` | ❌ İzole |

### 5.4 Coordinator Model

- **Backend:** Docker (Sprint 136 devam)
- **Brain planning:** structured (Sprint 136 devam, AI mode değil)
- **Worker count:** max 3 (Sprint 136 override performance mode)
- **autoApprove:** true
- **force:** true (sprint-137 fresh rerun)
- **Timeout:** 14400000 ms (4 saat)

### 5.5 Timeout Policy

| Level | Timeout | Aksiyon |
|-------|---------|---------|
| Task heartbeat stale | >2 dk | Auditor alert |
| Task execution hard | 60 dk | Kill worker, Brain NO_GO |
| Wave 1 (Task 1 solo) | 180 dk | Hard kill, manuel recovery |
| Wave 2 (Task 2 solo) | 60 dk | Hard kill, skip Wave 3 helper |
| Wave 3 per task | 45 dk | Hard kill, bağımsız NO_GO |
| **Sprint total** | **240 dk (4 saat)** | `deckent_start timeout: 14400000` |

---

## 6. Task Specifications

### Task 137-001 — Brain Test Suite Post-Refactor Restoration
- **Agent:** bug-fixer
- **Model:** opus
- **Effort:** high
- **Priority:** CRITICAL
- **Skills:** testing-expert, typescript-expert
- **Scope:** `tests/orchestra/`, `tests/e2e/`, `tests/docs/`, `src/orchestra/sprint-spawner.ts` (dashboard ensure için minimal edit yetkisi)
- **Files:**
  - `tests/orchestra/brain.test.ts` (41 fail — en büyük)
  - `tests/orchestra/runsprint-debt-integration.test.ts` (12 fail)
  - `tests/orchestra/brain-rollback.test.ts` (10 fail)
  - `tests/orchestra/sprint2-debt.test.ts` (9 fail)
  - `tests/orchestra/sprint-controller.test.ts` (8 fail)
  - `tests/orchestra/dependency-pipeline.test.ts` (8 fail)
  - `tests/orchestra/agent-activation.test.ts` (7 fail)
  - `tests/orchestra/task-queue.test.ts` (6 fail)
  - `tests/orchestra/task-limit.test.ts` (5 fail — canlı ENOENT kanıtı)
  - `tests/orchestra/brain-provider.test.ts` (5 fail)
  - `tests/orchestra/spawn-prevention.test.ts` (5 fail)
  - `tests/orchestra/plan-improvements.test.ts` (4 fail)
  - `tests/e2e/docker-backend.test.ts` (1 fail)
  - `tests/docs/jsdoc.test.ts` (1 fail)
  - `src/orchestra/sprint-spawner.ts` (dashboard ensure injection — <20 satır, opsiyonel)

**Description:**
Sprint 136 Task 8 `sprint-controller.ts` 1890→209 LoC refactor'ü 14 test file / 123 testi kırdı. **Canlı root cause bulgusu (pre-flight Wave 0):** `tests/orchestra/task-limit.test.ts` hatası → `sprint-spawner.ts:178` → `auditor.ts:367` `updateDashboard()` → `writeFileSync` ENOENT. Test temp dir'leri (`/tmp/deckent-tasklimit-spawn-XXX/`) `.dashboard` dosyasının var olmasını beklemiyordu, yeni call path Task 8 refactor sonrası dashboard write'ı zorunlu kılıyor.

**Fix stratejisi (worker'a önerilen):**
1. **Öncelikli approach:** `sprint-spawner.ts` içinde `ensureDashboard()` helper ekle — ilk `updateDashboard()` çağrısından önce `fs.mkdirSync(dirname, {recursive: true})` ve ilk state ile seed write. Production + test path'lerinde ortak.
2. **Alternatif:** `tests/orchestra/` setup'larında temp dir kurulumuna `.dashboard` seed ekle. Ama bu 14 dosyada tekrar, DRY değil.
3. `brain.test.ts` 41 fail en büyüğü — Task 8 barrel re-export pattern'ı mock import'ları kırdı. Mock path'leri yeni modüllere göre güncelle: `sprint-spawner`, `sprint-lifecycle`, `sprint-planner` barrel'den.
4. `jsdoc.test.ts` 1 fail — yeni oluşturulan `sprint-spawner.ts`'te JSDoc block'u eksik. Dosya başına standart JSDoc header ekle.

**Kanıt:** `npx vitest run --reporter=basic 2>&1 | tail -5` → `Test Files 512 passed`, `Tests 0 failed / 12684+ passed`

**Test:** Baseline'ın kendisi = kanıt. Ek integration test önerilmiyor — restoration task.

---

### Task 137-002 — tryCodeVerifiedDone Wire + In-Sprint Dogfood
- **Agent:** architect
- **Model:** opus
- **Effort:** normal
- **Priority:** CRITICAL
- **Skills:** typescript-expert, testing-expert
- **Scope:** `src/orchestra/`, `tests/orchestra/`
- **Files:**
  - `src/orchestra/sprint-finalizer.ts` — wire integration (helper çağrısı)
  - `src/orchestra/result-evaluator.ts` — export kontrolü (helper Sprint 136'da yazıldı, +408 satır)
  - `tests/orchestra/sprint-finalizer.test.ts` — wire integration test (3-5 yeni test)
  - `tests/orchestra/result-evaluator.test.ts` — dogfood senaryo test

**Description:**
Sprint 136 Task 3 `tryCodeVerifiedDone(taskId, projectRoot)` helper'ı `result-evaluator.ts`'ye eklendi (+408 satır) ama `finalizeSprint()` path'inde **çağrılmıyor**. Wire noktası:

- `finalizeSprint()` içinde result evaluation loop'u — her task için `.result` dosyası durumu kontrol ediliyor.
- Koşul: `.result` MISSING **VEYA** `selfAssessment: NO_GO` + Brain auto-generated `"Docker worker exited without writing result file"` label.
- Aksiyon: `tryCodeVerifiedDone()` çağır. Dönüş `{ verified: true, filesChanged, evidence }` ise retrospektif `CODE_VERIFIED_DONE` flag + result dosyası rewrite (synthetic result with `selfAssessment: DONE_CODE_VERIFIED`).
- Fail-safe: helper throw ederse orijinal NO_GO muhafaza + warning log.

**In-sprint dogfood:** Task 2 Wave 2'de canlı edildiği anda Wave 3'teki 4 task'tan biri spurious NO_GO alırsa helper otomatik yakalar. Bu Sprint 137 meta-dogfood ilk başarı kanıtı olur.

**Kanıt:**
- `grep -n "tryCodeVerifiedDone" src/orchestra/sprint-finalizer.ts` → ≥1 hit (import + call)
- `npx vitest run tests/orchestra/sprint-finalizer.test.ts tests/orchestra/result-evaluator.test.ts` → 0 fail

**Test:** 5+ test:
1. Wire integration: helper `finalizeSprint` içinden çağrılıyor mu (spy test)
2. Happy path: `.result` MISSING + kod var → CODE_VERIFIED_DONE
3. Negative: `.result` MISSING + kod yok → honest NO_GO
4. Fail-safe: helper throw → orijinal NO_GO muhafaza + warning log
5. Spurious NO_GO label regex: "Docker worker exited..." pattern yakalanıyor mu

---

### Task 137-003 — gate.json + load-report.md Runtime Wire Restore
- **Agent:** bug-fixer
- **Model:** sonnet
- **Effort:** normal
- **Priority:** HIGH
- **Skills:** typescript-expert
- **Scope:** `src/orchestra/`, `src/core/`
- **Files:**
  - `src/orchestra/sprint-finalizer.ts` — gate.json write hook + load-report hook (Task 137-002 sonrası edit)
  - `src/core/observability.ts` — `generateLoadReport()` export doğrulama
  - `tests/orchestra/sprint-finalizer.test.ts` — write integration test'leri

**Description:**
Sprint 136 Task 4 (gate.json) ve Task 5 (load-report.md) kod yazıldı ama Task 8 refactor `finalizeSprint` call path'ini değiştirdi, runtime wire koptu. Runtime kanıt: Sprint 136 tamamlandı ama `.deckent/sprint-136-gate.json` + `docs/audits/sprint-136/load-test-report.md` oluşmadı.

**Fix:**
1. `finalizeSprint()` yeni path'inde doğru yerleri bul (`runSelfAuditGate()` sonrası + decay öncesi).
2. `fsPromises.writeFile(join(projectRoot, '.deckent', \`sprint-${sprintId}-gate.json\`), JSON.stringify(gateResult, null, 2))` — Sprint 136 kodundan pattern.
3. `generateLoadReport()` çağrısı → `docs/audits/sprint-${sprintId}/load-test-report.md` path'ine yaz.
4. Fail-safe: write fail → warning log, sprint finalize'ı bloklamaz.
5. Task 137-002 wire'ı ile çakışmasın — Task 2 önce (Wave 2), bu task sonra (Wave 3).

**Kanıt:**
- `grep -n "sprint-${sprintId}-gate.json" src/orchestra/sprint-finalizer.ts` → hit
- `grep -n "generateLoadReport" src/orchestra/sprint-finalizer.ts` → hit
- Sprint 137 finalize sonrası `.deckent/sprint-137-gate.json` + `docs/audits/sprint-137/load-test-report.md` runtime oluşmalı

**Test:** 3+ test:
1. gate.json write integration (mock filesystem, verify write path)
2. load-report.md write integration (mock filesystem, verify content structure)
3. Fail-safe: write throw → warning + finalize devam

---

### Task 137-004 — ErrorRegistry Lint Script Wire
- **Agent:** refactorer
- **Model:** sonnet
- **Effort:** low
- **Priority:** HIGH
- **Skills:** devops-engineer, ci-testing
- **Scope:** `scripts/`, root (`package.json`), `tests/core/`
- **Files:**
  - `scripts/check-error-handling.mjs` — Sprint 136 Task 7 worker yazdı, doğrula
  - `package.json` — `scripts.lint:errors` entry
  - `tests/core/error-handling-unification.test.ts` — script invoke testi

**Description:**
Sprint 136 Task 7 NO_GO aldı ama script fiziken yazıldı. Eksik:
1. `package.json` `"scripts": { ..., "lint:errors": "node scripts/check-error-handling.mjs" }` entry
2. Test'in script'i runtime invoke etmesi: `child_process.execSync('npm run lint:errors', { stdio: 'pipe' })` → exit 0 assertion
3. `src/orchestra/` içinde `throw new Error` kullanımı varsa (Sprint 136'dan kalan) DECKENT_E0XX koduna dönüştür — **opsiyonel**, script wire zorunlu, migration scope creep olabilir; worker migration'ı sadece tüm testler pass ediyorsa yapar.

**Kanıt:**
- `npm run lint:errors` → exit 0
- `grep "lint:errors" package.json` → hit
- `npx vitest run tests/core/error-handling-unification.test.ts` → 0 fail

**Test:** 2+ test:
1. Script invoke + exit 0 assertion
2. Rule violation detection (intentional failing fixture → exit !=0)

---

### Task 137-005 — BETA-TRACKER + BLUEPRINT Sprint 134-136 Sync
- **Agent:** doc-writer
- **Model:** sonnet
- **Effort:** normal
- **Priority:** HIGH
- **Skills:** documentation-writer
- **Scope:** root (`BETA-TRACKER.md`, `DECKENT-MASTER-BLUEPRINT.md`)
- **Files:**
  - `BETA-TRACKER.md`
  - `DECKENT-MASTER-BLUEPRINT.md`

**Description:**
İki doküman Sprint 133'te donmuş (Sprint 134-136 inline update yok). Sprint 134/135/136 özetlerini `docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md` Section 12-17'den cherry-pick ederek ekle:

- **BETA-TRACKER.md:** header tests 12194 → 12684, sprint counter 133 → 136, Phase 2 sprint entries (134 coordinator resilience, 135 11/17 stability, 136 architectural deepening + regression), conclusion Sprint 136 state
- **BLUEPRINT.md:** Live Metrics block sprint-136, readiness 3.925, Section 24 Sprint History 3 yeni entry

**Tutarlılık kanıtı:** BETA-TRACKER + BLUEPRINT + FINAL report aynı sprint-136 sayılarını göstermeli (tests 12684, readiness 3.925, sprint counter 136).

**Kanıt:**
- `grep -c "sprint-136" BETA-TRACKER.md` → ≥3
- `grep -c "sprint-136" DECKENT-MASTER-BLUEPRINT.md` → ≥3
- `grep "12684" BETA-TRACKER.md DECKENT-MASTER-BLUEPRINT.md` → hit

**Test:** Yok (salt doc task), tutarlılık kanıtı yeterli.

---

### Task 137-006 — Brain Budget Decay No-Op Bug Fix
- **Agent:** bug-fixer
- **Model:** sonnet
- **Effort:** normal
- **Priority:** NORMAL
- **Skills:** typescript-expert, testing-expert
- **Scope:** `src/orchestra/`, `src/brain/`, `tests/orchestra/`
- **Files:**
  - Worker pre-flight: `grep -rn "DECAY_EXEMPT\|decayMemory\|cleanupDecay" src/`
  - Muhtemelen `src/orchestra/debt-manager.ts` veya `src/brain/memory-decay.ts`
  - `tests/orchestra/memory-decay.test.ts` (yeni veya mevcut)

**Description:**
Sprint 136 pre-flight'ta `npx deckent cleanup --decay` 1204 → 1204 no-op döndü. Brain budget 1204/900 over, ama DECAY_EXEMPT mantığı (DECISIONS.md 702 satır muaf) decay'i engelliyor.

**Bug:** exempt dosyaların satırları budget toplamına sayılıyor AMA decay eligible dosyalar exempt'i geçemiyor gibi davranıyor — overflow hep exempt'e atfediliyor, decay hiç tetiklenmiyor.

**Fix:**
1. Budget hesaplama: `totalLines - exemptLines = eligibleLines`. Eğer `eligibleLines > threshold` → decay tetikle, sadece eligible dosyalardan satır at.
2. Mevcut davranış: `totalLines > threshold` → exempt'i korumaya çalış → eligible satır yok sanıyor → no-op.
3. Yeni davranış: exempt lines budget hesabından çıkar, eligible threshold kontrolü bağımsız.

**Not:** Bu task `.brain/DECISIONS.md` 702 satırına dokunmaz, sadece decay algoritması mantığını düzeltir.

**Kanıt:**
- Unit test: exempt 702 satır + eligible 500 satır (threshold 300) → eligible 500 decay'lenmeli, toplam ≤ 1002 olmalı
- Sprint 137 finalize sonrası brain total line count azalmalı (eligible satır varsa)
- Sprint 138 pre-flight'ta `cleanup --decay` gerçek satır siler

**Test:** 3+ test:
1. Decay with exempt files (eligible decay'lensin, exempt korunsun)
2. No-op test (threshold altında, değişiklik yok)
3. Edge: exempt alone > budget (sadece exempt dosyalar bile budget aşıyor → warning ama no error)

---

## 7. Error Handling & Fallback Strategy

### 7.1 Task NO_GO Fallback Chain

```
Worker execution
    ↓
    ├─ DONE → continue
    ├─ GO_WITH_TECH_DEBT → accept, log to DEBT.md
    └─ NO_GO
         ↓
         Brain FIX phase (Sprint 135+ pattern)
              ├─ fix worker spawn (opus, 1 retry)
              ↓
              ├─ DONE → relabel, continue
              └─ NO_GO (fix worker)
                   ↓
                   Task 137-002 wire aktifse:
                        tryCodeVerifiedDone(taskId)
                        ↓
                        ├─ verified=true → CODE_VERIFIED_DONE (retrospektif relabel)
                        └─ verified=false → honest NO_GO (scorecard'a not)
```

### 7.2 Wave Barrier Failure Scenarios

**Scenario A: Wave 1 (Task 137-001) NO_GO**
- Tetikleyici: Test restoration tamamlanamadı, vitest hâlâ fail
- Aksiyon: Brain FIX phase 1 retry → hâlâ NO_GO → manuel checkpoint
- Manuel approach: test fail sayısını azalt (123 → <20), Sprint 137 kısmi başarı olarak devam et
- Wave 2 başlamaz, sprint yarıda biter, Sprint 138 P0 olarak kalan test'ler
- Risk azaltma: Task 1'e 3 saat hard timeout, Sprint 137 toplam 4 saat içinde buffer

**Scenario B: Wave 2 (Task 137-002) NO_GO**
- Tetikleyici: tryCodeVerifiedDone wire yapılamadı
- Aksiyon: Brain FIX phase 1 retry → hâlâ NO_GO → Wave 3'ü yine de başlat
- Task 3+4+5+6 Task 2 wire olmadan çalışır (helper yok, meta-dogfood kaybedilir)
- Sprint 137 scorecard'da "Task 2 kod yazıldı ama wire edilemedi, Sprint 138 P0" notu
- Risk azaltma: Task 2 kod zaten hazır olduğu için wire sadece +20-30 satır, düşük risk

**Scenario C: Wave 3 bir task NO_GO**
- Tetikleyici: Task 3/4/5/6'dan biri fail
- Aksiyon: Task 2 wire aktifse → tryCodeVerifiedDone çağrılır → kod fiziken varsa CODE_VERIFIED_DONE relabel
- Diğer Wave 3 task'ları ilerler, bağımsız
- Risk azaltma: Wave 3 task'ları bağımsız, bir fail diğerlerini bloklamaz

**Scenario D: Coordinator crash**
- Tetikleyici: Brain process crash (Sprint 135+136 zero crash pattern devam, risk düşük)
- Aksiyon: Manuel recovery (Sprint 134 2h pattern)
- Risk azaltma: Sprint 135 T-001 coordinator resilience + T-003 Docker graceful shutdown fix'leri aktif

### 7.3 Docker HB Shutdown Bug Süreğen Mitigation

Sprint 134-135-136 üst üste 3 sprint aynı pattern: worker kod yazar, `.result` yazmadan container SIGKILL exit 137. Sprint 137'de resmi fix denemesi yok (Sprint 138+ planlı), ama azaltma var:

1. Task 137-002 wire aktif → helper otomatik spurious NO_GO'yu yakalar, sprint'i kurtarır
2. Sprint 135 T-003 `docker stop --time=10` graceful shutdown hâlâ aktif
3. Sprint 137 post-hoc relabel: helper sayesinde "fiziken yazılan kod" sayılır, numerik skor korunur

**Kabul edilen risk:** Docker HB bug Sprint 137'de %20-30 ihtimalle tekrarlayacak. Task 2 helper wire bunu %80+ mitigate eder.

### 7.4 Rollback Policy

Recovery sprint olduğu için rollback **yok**:
- Sprint 137 Task 1 herhangi bir yerde fail olsa bile fix'ler git'e commit edilir, kısmi restoration değerli
- Sprint 137 Task 2-6 code + wire commit edilir, runtime wire çalışmasa bile Sprint 138'de kod zemini hazır
- `git reset --hard` yok, `--no-verify` yok

---

## 8. Testing & Verification Strategy

### 8.1 Layer 1 — Verifier (Background Agent)

**Rol:** Her 2-3 dakikada bir `.tasks/*.result`, `.tasks/*.hb`, `git diff --stat`, `tsc --noEmit` ve hedef dosyaları tarar.

**Implementation:** `Agent` tool `subagent_type: general-purpose`, `run_in_background: true`

**Output:** `.deckent/sprint-137-verifier-log.md` (append only)

**Alert koşulları:** heartbeat stale >2 dk, result yazıldı ama kod fiziken yok, scope violation

### 8.2 Layer 2 — Watchdog (Explore Subagent, Periodic)

**Rol:** Her 10 dakikada bir veya Wave geçişlerinde Explore subagent dispatch. Spesifik soru: "Şu an sprint'in gerçek durumu ne?"

**Implementation:** `Agent` tool `subagent_type: Explore`, **thoroughness: medium**, **NOT run_in_background**

**Tetikleme:** Wave geçişleri veya anomali şüphesinde manuel dispatch

### 8.3 Layer 3 — Shell Watchdog (Background Bash)

**Rol:** Düşük seviyeli sistem kontrolleri (disk, Docker, process, locks, brain budget)

**Implementation:** Tek `Bash run_in_background: true` while loop, `sleep 120`

**Output:** `/tmp/sprint-137-shell-watchdog.log`

### 8.4 Per-Task Physical Code Verification

Sprint bitişinde grep kanıtı:

```bash
# Task 137-001
npx vitest run --reporter=basic 2>&1 | grep -E "Test Files|Tests" | tail -3

# Task 137-002
grep -n "tryCodeVerifiedDone" src/orchestra/sprint-finalizer.ts

# Task 137-003
ls .deckent/sprint-137-gate.json docs/audits/sprint-137/load-test-report.md

# Task 137-004
npm run lint:errors
grep "lint:errors" package.json

# Task 137-005
grep -c "sprint-136" BETA-TRACKER.md DECKENT-MASTER-BLUEPRINT.md

# Task 137-006
npx deckent cleanup --decay
wc -l .brain/MEMORY.md .brain/DECISIONS.md .brain/PATTERNS.md
```

**Physical code rate hedefi:** 6/6

### 8.5 Meta-Dogfood Test (Sprint 137 Yenilik)

Task 137-002 wire edildikten sonra Wave 3'teki task'lar çalışırken Docker HB shutdown bug tekrar ederse helper otomatik yakalamalı.

Sprint 137 bittiğinde kontrol:
```bash
grep -E "CODE_VERIFIED_DONE|tryCodeVerifiedDone" .deckent/sprint-137-verifier-log.md
```

- Spurious NO_GO olmazsa: mekanik kanıt (grep + integration test) yeterli
- Spurious NO_GO olursa: ilk in-sprint başarı kanıtı, retrospektif'e altın not

### 8.6 Living Record Discipline

Sprint 137 bittiğinde `docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md`:
- Section 1 inline update (overall score, test count, sprint counter)
- Section 5 inline update (axis scores)
- Section 6 inline update (living record son sprint)
- Section 8 inline update (carry-over debt count)
- Section 18 NEW append — Sprint 137 status + metrics
- Section 19 NEW append — Sprint 137 retrospective

**Tüm bunlar aynı commit'te olmalı** (feedback_living_record_sync.md).

---

## 9. Product Vision Audit (Per-Task Vision Lens)

**ADR-033/034 ve roadmap.md immutability garanti.**

**Per-task vision lens (6/6):**

| Task | Vision Impact | Audit |
|------|---------------|-------|
| 137-001 | Kur-çalıştır stabilitesi (bugsuz) — test restoration doğrudan güven axis'ini etkiler | ✅ Reinforces product-not-service (stable out-of-box) |
| 137-002 | Observability (gözlemlenebilirlik) — spurious NO_GO'lar kullanıcıyı yanıltmamalı | ✅ Reinforces transparency (honest Brain label) |
| 137-003 | Gözlemlenebilirlik runtime artifacts — gate.json + load-report kullanıcı görünürlüğü | ✅ Reinforces observability |
| 137-004 | Kod kalitesi + hata disiplini — kullanıcıya tutarlı error codes | ✅ Reinforces quality (developer experience) |
| 137-005 | Belge tutarlılığı — BETA-TRACKER kapalı beta için kullanıcı karşı doküman | ✅ Reinforces transparency (real-time truth) |
| 137-006 | Uzun-süreli kullanıcı deneyimi — brain budget overflow yoksa memory decay düzgün çalışmalı | ✅ Reinforces long-term stability |

**Forbidden terms audit:** Sprint 137 diff'inde `saas`, `cloud-hosted`, `paywall`, `enterprise edition` terimleri **olmamalı**. Sprint 137 değişimleri sadece test restoration + wire fix + doc sync + decay fix olduğu için bu terimlerin eklenme riski çok düşük.

---

## 10. Forbidden Actions (Sprint 137 Yasakları)

1. ❌ Yeni feature eklemek (recovery theme)
2. ❌ `sprint-controller.ts`'e dokunmak (Sprint 136'da stabilize, stable barrel pattern)
3. ❌ Async I/O full migration'ı Sprint 137'ye sıkıştırmak (Sprint 138+)
4. ❌ Docker HB core fix'i Sprint 137'de denemek (Sprint 138+, Task 137-002 wire yeterli kısmi çözüm)
5. ❌ Heartbeat daemon / human checkpoint / agent evolution dogfood (Sprint 141+)
6. ❌ `git add -A` veya `commit --amend` (CLAUDE.md + git safety)
7. ❌ `git commit --no-verify` (user explicit onay gerekir)
8. ❌ `git reset --hard` (recovery sprint'te asla)
9. ❌ FINAL report Section N+1 append ederken Section 1 inline update'i atlamak (living record discipline)
10. ❌ Brain budget no-op bug'ını "acil değil" diye erteleme (uzun-süreli kullanıcılar için kritik)
11. ❌ "Yarım iş" psikolojisi — kapsam B'ye kaymak (feedback_no_half_measures.md)
12. ❌ Task Priority'i DIRECTIVES'te NORMAL'a indirip "hızlandırma" yapmak (T-005 dogfood sabote eder)

---

## 11. Success Metrics & Exit Criteria

### 11.1 Primary Success Criteria (10 checkbox, must-have)

Clean GO için **10/10** gerekli. 9/10 → GO_WITH_TECH_DEBT. ≤8/10 → NO_GO (Sprint 138 restoration devam).

| # | Criterion | Ölçüm | Pass |
|---|-----------|-------|------|
| 1 | Vitest 0 fail | `npx vitest run` exit 0, Test Files 512 passed | ≥12684 pass |
| 2 | TSC 0 hata | `npx tsc --noEmit` exit 0 | — |
| 3 | Task 137-002 wire canlı | `grep -n "tryCodeVerifiedDone" src/orchestra/sprint-finalizer.ts` | ≥1 hit |
| 4 | gate.json runtime oluştu | `ls .deckent/sprint-137-gate.json` | dosya mevcut |
| 5 | load-report.md runtime oluştu | `ls docs/audits/sprint-137/load-test-report.md` | dosya mevcut |
| 6 | Lint script wire canlı | `npm run lint:errors` | exit 0 |
| 7 | BETA-TRACKER sync | `grep -c "sprint-136" BETA-TRACKER.md` | ≥3 |
| 8 | BLUEPRINT sync | `grep -c "sprint-136" DECKENT-MASTER-BLUEPRINT.md` | ≥3 |
| 9 | Brain budget decay çalıştı | `deckent cleanup --decay` sonrası delta > 0 veya ≤900 | — |
| 10 | Layer 3 scorecard ≥14/17 | `.deckent/sprint-137-layer3-scorecard.md` Total | ≥14/17 |

### 11.2 Readiness Target

**Hedef:** ≥4.05/5 (Sprint 136: 3.925/5, +0.125 bounce)

**Axis hedefi:**

| Axis | S136 | S137 Target | Delta |
|------|------|-------------|-------|
| Kurulum | 4.1 | 4.15 | +0.05 |
| Bugsuz | 3.3 | **3.7** | +0.4 |
| Gözlemlenebilirlik | 4.0 | 4.2 | +0.2 |
| Güvenlik | 4.0 | 4.0 | 0 |
| Ölçeklenebilirlik | 4.2 | 4.25 | +0.05 |
| Uyumluluk | 4.0 | 4.0 | 0 |
| Ürün Kimliği | 4.5 | 4.5 | 0 |

**Weighted:** `(4.15×0.2 + 3.7×0.25 + 4.2×0.15 + 4.0×0.1 + 4.25×0.15 + 4.0×0.05 + 4.5×0.1) = 4.0725 ≈ 4.07`

### 11.3 Anti-Success Patterns (Yasaklar)

Bu durumlar sprint'i **başarılı sayılmaması** için:

1. Layer 3 <12/17 (kozmetik restoration)
2. Vitest 0 fail ama test count <12684 (hile: testler silindi)
3. Task 137-002 wire var ama hiç çağrılmadı (runtime test eksik)
4. BETA-TRACKER "sprint-136" var ama içerik Sprint 133 kopya-yapıştır (kozmetik sync)
5. gate.json oluştu ama `overallGate === "SKIP"` veya `"ERROR"` (anlamsız dosya)
6. Sprint 137 kendi spurious NO_GO'ya tutulur ve helper yakalayamaz (meta-dogfood başarısız)

### 11.4 Retrospektif Sprint 136 Relabel (Bonus, Non-Blocking)

Task 137-002 wire başarılı olduktan sonra:
- Sprint 136'nın 3 ana NO_GO + 4 fix worker NO_GO'su fiziken kod yazdı
- Retrospektif olarak CODE_VERIFIED_DONE etiketlenebilir
- Resmi Sprint 136 skoru **değişmez** (tarih muhafaza)
- Scorecard yorumsal not: "Sprint 136 code-verified-DONE rate: 10/10 (helper canlı, retrospektif)"

---

## 12. Sprint 138-144 Preview (Next Chain)

**Sprint 138-140: Performance + Stability (3 sprint)**
- Async I/O full migration (Sprint 132 CRITICAL #1 kapanış)
- Docker HB shutdown bug core fix (signal sequence revamp)
- Multi-provider simultaneous test (Claude + Codex + Gemini)
- Windows + Codex dogfood

**Sprint 141-143: Dogfood Dormant Features (3 sprint)**
- Heartbeat daemon 24h stability
- Human checkpoints canlı sprint
- Agent evolution pipeline gözlemli run
- Rate limiting production test
- Security hardening (MCP auth, Docker hardening, plugin signature)

**Sprint 144: Public Beta GA (Milyon-user ready)**
- Kur-Çalıştır readiness ≥4.5/5
- Dokümantasyon tam senkron
- Tüm dormant features dogfood proven
- Public beta publish + landing page + community setup

**Sprint 137 → Sprint 144 toplam: 8 sprint, ~1-2 hafta.**

---

## Appendix A — References

- `.brain/archive/DIRECTIVES-sprint-136.md` — Sprint 136 DIRECTIVES arşivi
- `.deckent/sprint-136-layer3-scorecard.md` — Sprint 136 scorecard (8/17 breakdown)
- `docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md` Section 16+17 — Sprint 136 closing
- `docs/superpowers/specs/2026-04-13-sprint-136-design.md` — Sprint 136 spec (parity reference)
- Memory: `project_sprint136_completed.md`, `project_sprint137_preflight.md`
- Memory (feedback): `feedback_preflight_source_inspection.md`, `feedback_helper_wire_split_task.md`, `feedback_refactor_scope_downstream_tests.md`, `feedback_living_record_sync.md`, `feedback_no_half_measures.md`

## Appendix B — Commit Ceremony Files (2 commit)

**Commit 1 — feat:** source changes + tests (Task 1-4, 6 code)
**Commit 2 — docs:** living record + spec + plan + scorecard + BETA-TRACKER + BLUEPRINT + meta docs (Task 5 + closing ceremony)
