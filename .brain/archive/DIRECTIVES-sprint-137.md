# DIRECTIVES — Sprint 137: Recovery Sprint (Test Restoration + Wire Fixes + Docs Sync)

> **Theme:** Recovery — Sprint 136 carry-over debt closure. Yeni feature yok.
> **Hedef:** Layer 3 8/17 → ≥14/17, readiness ≥4.05, vitest 123 → 0 fail, clean GO.

## Referanslar
- Design spec: docs/superpowers/specs/2026-04-14-sprint-137-recovery-design.md
- Plan: docs/superpowers/plans/2026-04-14-sprint-137-recovery-plan.md
- Sprint 136 arşivi: .brain/archive/DIRECTIVES-sprint-136.md
- Sprint 136 scorecard: .deckent/sprint-136-layer3-scorecard.md
- Retro: .brain/RETRO.md
- Bellek: .brain/MEMORY.md

## Goal: Sprint 136 carry-over debt closure — test suite restoration (123 fail → 0), Task 3 helper live wire (in-sprint dogfood), gate.json+load-report runtime restore, lint script wire, BETA-TRACKER+BLUEPRINT sync, brain budget decay fix. Hedef: Layer 3 8/17 → 14+/17, readiness ≥4.05, clean GO, kapalı beta publish-ready.

---

## Task 1: Brain Test Suite Post-Refactor Restoration
- Model: opus
- Effort: high
- Priority: CRITICAL
- Skills: testing-expert, typescript-expert
- Files: tests/orchestra/brain.test.ts, tests/orchestra/runsprint-debt-integration.test.ts, tests/orchestra/brain-rollback.test.ts, tests/orchestra/sprint2-debt.test.ts, tests/orchestra/sprint-controller.test.ts, tests/orchestra/dependency-pipeline.test.ts, tests/orchestra/agent-activation.test.ts, tests/orchestra/task-queue.test.ts, tests/orchestra/task-limit.test.ts, tests/orchestra/brain-provider.test.ts, tests/orchestra/spawn-prevention.test.ts, tests/orchestra/plan-improvements.test.ts, tests/e2e/docker-backend.test.ts, tests/docs/jsdoc.test.ts, src/orchestra/sprint-spawner.ts
- Scope: tests/orchestra/, tests/e2e/, tests/docs/, src/orchestra/

### Description
Sprint 136 Task 8 sprint-controller.ts 1890→209 LoC refactor 14 test file / 123 testi kırdı. **Canlı pre-flight root cause (2026-04-14 baseline):** tests/orchestra/task-limit.test.ts hatası → sprint-spawner.ts:178 → auditor.ts:367 updateDashboard() → writeFileSync ENOENT. Test temp dir'leri (`/tmp/deckent-tasklimit-spawn-XXX/`) `.dashboard` dosyasının var olmasını beklemiyor, yeni call path Task 8 refactor sonrası dashboard write'ı zorunlu kılıyor.

**Fail dağılımı (14 files, 123 tests):**
- brain.test.ts: 41 fail (en büyük — Task 8 barrel re-export mock import kırdı)
- runsprint-debt-integration.test.ts: 12
- brain-rollback.test.ts: 10
- sprint2-debt.test.ts: 9
- sprint-controller.test.ts: 8
- dependency-pipeline.test.ts: 8
- agent-activation.test.ts: 7
- task-queue.test.ts: 6
- task-limit.test.ts: 5 (canlı ENOENT kanıtı)
- brain-provider.test.ts: 5
- spawn-prevention.test.ts: 5
- plan-improvements.test.ts: 4
- tests/e2e/docker-backend.test.ts: 1
- tests/docs/jsdoc.test.ts: 1

**Fix stratejisi (öncelik sırasına göre):**
1. **Önerilen:** sprint-spawner.ts içinde `ensureDashboard(projectRoot)` helper ekle — ilk `updateDashboard()` çağrısından önce `mkdirSync(dirname(dashPath), {recursive: true})` + initial seed write. Production + test path'lerinde ortak. Bu tek fix `task-limit.test.ts` + benzeri temp-dir test'leri çözer.
2. brain.test.ts 41 fail — Task 8 barrel re-export pattern'ı mock import'ları kırdı. Mock path'leri yeni modüllere göre güncelle: `sprint-spawner`, `sprint-lifecycle`, `sprint-planner` barrel'den. `vi.mock('../../src/orchestra/sprint-controller', ...)` → yeni modül path'lerini yakalayacak şekilde mock etmek gerekebilir.
3. jsdoc.test.ts 1 fail — yeni oluşturulan sprint-spawner.ts'te JSDoc block'u eksik. Dosya başına standart JSDoc header ekle (`/** @fileoverview ... */`).
4. Diğer test file'lar: import path + mock güncellemesi (refactor scope downstream test'leri).

**Kanıt:** `npx vitest run --reporter=basic 2>&1 | tail -5` → `Test Files 512 passed`, `Tests 0 failed | 12684+ passed`

**Test:** Baseline'ın kendisi = task kanıtı. Hedef: 0 failing test files, 0 failing tests, ≥12684 passing tests.

---

## Task 2: tryCodeVerifiedDone Wire + In-Sprint Dogfood
- Model: opus
- Effort: normal
- Priority: CRITICAL
- Dependencies: 137-001
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/sprint-finalizer.ts, src/orchestra/result-evaluator.ts, tests/orchestra/sprint-finalizer.test.ts, tests/orchestra/result-evaluator.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
Sprint 136 Task 3 `tryCodeVerifiedDone(taskId, projectRoot)` helper'ı `result-evaluator.ts`'ye eklendi (+408 satır) ama `finalizeSprint()` path'inde **çağrılmıyor**. Wire noktası:

- `finalizeSprint()` içinde result evaluation loop — her task için `.result` dosyası kontrol ediliyor
- Koşul: `.result` MISSING **VEYA** `selfAssessment: NO_GO` + Brain auto-generated `"Docker worker exited without writing result file"` label
- Aksiyon: `tryCodeVerifiedDone()` çağır. Dönüş `{verified: true, filesChanged, evidence}` ise retrospektif `CODE_VERIFIED_DONE` flag + result rewrite (synthetic result with `selfAssessment: DONE_CODE_VERIFIED`)
- Fail-safe: helper throw → orijinal NO_GO muhafaza + warning log

**In-sprint dogfood:** Wire aktifleştiği an Wave 3'teki task'lar (137-003/004/005/006) spurious NO_GO alırsa helper otomatik yakalar — Sprint 137 meta-dogfood ilk başarı kanıtı.

**Dependency gerekçesi:** Task 137-001 test restoration bitmeden `brain.test.ts` + `sprint-finalizer.test.ts` baseline kirli olduğu için yeni wire integration test'leri mock state karışıklığına düşer. Sequential execution zorunlu.

**Kanıt:** `grep -n "tryCodeVerifiedDone" src/orchestra/sprint-finalizer.ts` → ≥1 hit (import + call). `npx vitest run tests/orchestra/sprint-finalizer.test.ts tests/orchestra/result-evaluator.test.ts` → 0 fail.

**Test:** 5+ test:
1. Wire integration spy test (helper finalizeSprint içinden çağrılıyor mu)
2. Happy path: .result MISSING + kod var → CODE_VERIFIED_DONE
3. Negative: .result MISSING + kod yok → honest NO_GO
4. Fail-safe: helper throw → orijinal NO_GO muhafaza + warning log
5. Spurious NO_GO label regex: "Docker worker exited..." pattern yakalanıyor mu

---

## Task 3: gate.json + load-report.md Runtime Wire Restore
- Model: sonnet
- Effort: normal
- Priority: HIGH
- Dependencies: 137-002
- Skills: typescript-expert
- Files: src/orchestra/sprint-finalizer.ts, src/core/observability.ts, tests/orchestra/sprint-finalizer.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/

### Description
Sprint 136 Task 4 (gate.json) ve Task 5 (load-report.md) kod yazıldı ama Task 8 refactor finalizeSprint call path'ini değiştirdi, runtime wire koptu. Runtime kanıt: Sprint 136 tamamlandı ama `.deckent/sprint-136-gate.json` + `docs/audits/sprint-136/load-test-report.md` oluşmadı.

**Fix:**
1. `finalizeSprint()` yeni path'inde doğru yerleri bul (`runSelfAuditGate()` sonrası + decay öncesi)
2. `fsPromises.writeFile(join(projectRoot, '.deckent', \`sprint-${sprintId}-gate.json\`), JSON.stringify(gateResult, null, 2))`
3. `generateLoadReport()` çağrısı → `docs/audits/sprint-${sprintId}/load-test-report.md` path'ine yaz
4. Fail-safe: write fail → warning log, sprint finalize'ı bloklamaz

**Dependency gerekçesi:** Task 137-002 ile aynı dosyaya (`sprint-finalizer.ts`) yazar. Paralel spawn edilirse file lock collision veya merge conflict riski. Sequential execution zorunlu.

**Kanıt:**
- `grep -n "sprint-\${sprintId}-gate.json" src/orchestra/sprint-finalizer.ts` → hit
- `grep -n "generateLoadReport" src/orchestra/sprint-finalizer.ts` → hit
- Sprint 137 finalize sonrası `.deckent/sprint-137-gate.json` + `docs/audits/sprint-137/load-test-report.md` **runtime oluşmalı**

**Test:** 3+ test:
1. gate.json write integration (mock filesystem)
2. load-report.md write integration
3. Fail-safe: write throw → warning + finalize devam

---

## Task 4: ErrorRegistry Lint Script Wire
- Model: sonnet
- Effort: low
- Priority: HIGH
- Dependencies: 137-001
- Skills: devops-engineer, ci-testing
- Files: scripts/check-error-handling.mjs, package.json, tests/core/error-handling-unification.test.ts
- Scope: scripts/, tests/core/

### Description
Sprint 136 Task 7 NO_GO aldı ama `scripts/check-error-handling.mjs` fiziken yazıldı. Eksik:
1. `package.json` `"scripts": { ..., "lint:errors": "node scripts/check-error-handling.mjs" }` entry
2. Test invoke: `child_process.execSync('npm run lint:errors', { stdio: 'pipe' })` → exit 0 assertion
3. **Opsiyonel:** `src/orchestra/` içinde `throw new Error` kullanımı varsa DECKENT_E0XX migration. **Migration sadece tüm test'ler pass ediyorsa yapılır, scope creep yasak — migration yaparken test kırarsa vazgeç.**

**Dependency gerekçesi:** Task 137-001 test restoration bitmeden `tests/core/error-handling-unification.test.ts` baseline bilinmez (Sprint 136 kısmen fix edildi). Sequential.

**Kanıt:**
- `npm run lint:errors` → exit 0
- `grep "lint:errors" package.json` → hit
- `npx vitest run tests/core/error-handling-unification.test.ts` → 0 fail

**Test:** 2+ test:
1. Script invoke + exit 0 assertion
2. Rule violation detection (intentional failing fixture → exit !=0)

---

## Task 5: BETA-TRACKER + BLUEPRINT Sprint 134-136 Sync
- Model: sonnet
- Effort: normal
- Priority: HIGH
- Dependencies: 137-001
- Skills: documentation-writer
- Files: BETA-TRACKER.md, DECKENT-MASTER-BLUEPRINT.md
- Scope: root

### Description
İki doküman Sprint 133'te donmuş (Sprint 134-136 inline update yok). Sprint 134/135/136 özetlerini `docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md` Section 12-17'den cherry-pick et:

- **BETA-TRACKER.md:** header tests 12194 → 12684, sprint counter 133 → 136, Phase 2 sprint entries (134 coordinator resilience, 135 zero crash stability, 136 architectural deepening + regression), Sprint Metrics tablosu güncel, conclusion Sprint 136 closing state
- **BLUEPRINT.md:** Live Metrics block sprint-133 → sprint-136, readiness 3.6 → 3.925, Section 24 Sprint History 3 yeni entry (134, 135, 136)

**Tutarlılık kanıtı:** BETA-TRACKER + BLUEPRINT + FINAL report aynı sprint-136 sayılarını göstermeli (tests 12684, readiness 3.925, sprint counter 136).

**Dependency gerekçesi:** Task 137-001 sonrası güncel test count (12684) kesinleşir, sync doc'larına doğru rakam yazılabilir. Test restoration başarısız kalırsa docs'a hatalı rakam gider.

**Kanıt:**
- `grep -c "sprint-136" BETA-TRACKER.md` → ≥3
- `grep -c "sprint-136" DECKENT-MASTER-BLUEPRINT.md` → ≥3
- `grep "12684" BETA-TRACKER.md DECKENT-MASTER-BLUEPRINT.md` → hit

**Test:** Yok (salt doc task), tutarlılık kanıtı yeterli.

---

## Task 6: Brain Budget Decay No-Op Bug Fix
- Model: sonnet
- Effort: normal
- Priority: NORMAL
- Dependencies: 137-001
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/debt-manager.ts, src/brain/memory-decay.ts, tests/orchestra/memory-decay.test.ts
- Scope: src/orchestra/, src/brain/, tests/orchestra/

### Description
Sprint 136 pre-flight'ta `npx deckent cleanup --decay` 1204 → 1204 no-op döndü. Brain budget 1204/900 over, ama DECAY_EXEMPT mantığı (`.brain/DECISIONS.md` 702 satır muaf) decay'i engelliyor.

**Bug:** Exempt dosyaların satırları budget toplamına sayılıyor AMA decay eligible dosyalar exempt'i geçemiyor gibi davranıyor — overflow hep exempt'e atfediliyor, decay hiç tetiklenmiyor.

**Worker pre-flight komutu:** `grep -rn "DECAY_EXEMPT\|decayMemory\|cleanupDecay" src/` — dosya path'lerini tespit et, yukarıdaki Files listesini grep sonucuna göre revize et.

**Fix:**
1. Budget hesaplama: `totalLines - exemptLines = eligibleLines`
2. Eğer `eligibleLines > threshold` → decay tetikle, sadece eligible dosyalardan satır at
3. Yeni davranış: exempt lines budget hesabından çıkar, eligible threshold kontrolü bağımsız

**Not:** Bu task `.brain/DECISIONS.md` 702 satırına **dokunmaz**, sadece decay algoritması mantığını düzeltir.

**Dependency gerekçesi:** Task 137-001 test restoration bitmeden `memory-decay.test.ts` (veya eşdeğeri) mock state'i brain.test.ts gibi kırık olabilir. Sequential.

**Kanıt:**
- Unit test: exempt 702 satır + eligible 500 satır (threshold 300) → eligible 500 decay'lenmeli, toplam ≤ 1002 olmalı
- Sprint 137 finalize sonrası brain total line count **azalmalı** (eligible satır varsa)
- Sprint 138 pre-flight'ta `cleanup --decay` gerçek satır siler

**Test:** 3+ test:
1. Decay with exempt files (eligible decay'lensin, exempt korunsun)
2. No-op test (threshold altında, değişiklik yok)
3. Edge: exempt alone > budget (warning ama no error)
