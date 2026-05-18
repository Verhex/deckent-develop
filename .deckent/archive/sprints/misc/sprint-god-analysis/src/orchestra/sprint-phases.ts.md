# Analysis: src/orchestra/sprint-phases.ts
**Task ID:** 142-008 | **Model:** opus | **LoC:** 623 | **Effort:** max

## 1. Amacı (detaylı, 3-5 cümle — ne yapar, neden var, kim kullanır)
sprint-phases.ts, Sprint 072'de runSprint()'dan çıkarılmış **faz fonksiyonlarını** barındırır. Her faz (PLAN, SPAWN, EVALUATE, FIX, RETRO, DECAY, CLEANUP) ayrı bir fonksiyon olarak tanımlanmıştır — böylece runSprint() ince bir orkestrasyon katmanı kalır. Bu modül, sprint-controller.ts tarafından çağrılır ve sprint yaşam döngüsünün iş mantığını uygular: planlama, worker spawn, sonuç değerlendirmesi (rubric-based evaluation + CI regression check), rollback kontrolü, FIX fazında V2 reroute, retro yazma ve cleanup. Brain'in kalbi budur — tüm faz geçişleri burada gerçekleşir.

## 2. Public API (her export'un tam signature + JSDoc var mı?)
**Interfaces (2):**
1. `PlanPhaseResult { sprint, safetyPoint }` — JSDoc: EKSIK
2. `SpawnPhaseResult { taskQueue, scanInterval }` — JSDoc: EKSIK

**Functions (7):**
1. `runPlanPhase(projectRoot, config, opts, activeProvider, rollbackEnabled): Promise<PlanPhaseResult>` — JSDoc: ✅
2. `runSpawnPhase(projectRoot, sprint, config, opts, spawnBackend): Promise<SpawnPhaseResult>` — JSDoc: ✅
3. `runEvaluatePhase(projectRoot, sprint, results, evaluations, coverageThreshold?): Promise<void>` — JSDoc: ✅
4. `runRollbackCheck(projectRoot, sprint, evaluations, rollbackEnabled, safetyPoint): void` — JSDoc: ✅
5. `runFixPhase(projectRoot, sprint, evaluations, results, config, opts, routingVersionForFix, spawnBackend): Promise<void>` — JSDoc: ✅
6. `runRetroPhase(projectRoot, sprint, evaluations, results, config, testMode?): Promise<SprintMetrics | undefined>` — JSDoc: ✅
7. `runDecayPhase(projectRoot, sprintId): void` — JSDoc: ✅
8. `runCleanupPhase(projectRoot, sprint, config, opts, scanInterval, spawnBackend): null` — JSDoc: ✅

**Internal Helpers (3, not exported):**
- `toTaskEvaluation(evalResult)` — string→enum mapper
- `now()` — ISO timestamp
- `readFileSafe(filePath)` — safe readFileSync wrapper
- `safeDashboardUpdate(projectRoot, sprint, errorMessage)` — dashboard error state

## 3. İç Bağımlılıklar (import chain listesi, döngüsel bağımlılık riski var mı?)
**Import'lar (17 modül):**
- core: types, constants, utils, provider, agent-pool, skill-pool, stack-detector, plugin-hooks
- orchestra: rollback, sprint-utils, sprint-reporter, result-evaluator, result-collector, sprint-controller, model-selector (dolaylı: mid-sprint-adapter dynamic)
- monitor: auditor
- cli: helpers/splash

**Döngüsel bağımlılık:**
⚠️ sprint-phases.ts → sprint-controller.ts → sprint-phases.ts
Dosyanın başındaki yorum (satır 6-9) bunu "safe circular dependency" olarak belgeliyor. Tüm cross-module referanslar fonksiyon gövdesinde — init-time'da değil. **Güvenli** ama mimari olarak fragile — herhangi bir top-level referans eklenirse kırılır.

## 4. Dış Bağımlılıklar
- `node:fs` (readFileSync, writeFileSync, existsSync, readdirSync) — Native
- `node:path` (join) — Native
- Üçüncü parti: **YOK** — ADR-010 UYUMLU

## 5. Complexity
- Fonksiyon sayısı: **11** (7 export + 4 internal helper)
- Max cyclomatic rough: **~30** (runFixPhase — nested for, if, try/catch, dynamic import, V2 reroute logic)
- En karmaşık fonksiyonlar:
  1. **runEvaluatePhase** (satır 291-396, ~105 LoC): for döngüsü × CI regression check × hook çalıştırma × debt resolve
  2. **runFixPhase** (satır 443-526, ~83 LoC): fix task toplama, V2 MidSprintAdapter, spawn + evaluate
  3. **runPlanPhase** (satır 161-223, ~62 LoC): CI validation + safety point

## 6. Type Safety
- `any`: **0**
- `@ts-ignore`: **0**
- `@ts-expect-error`: **0**
- `as unknown`: **2** adet:
  - Satır 501: `(config as unknown as Record<string, unknown>).fix_phase_timeout` — ResolvedConfig'de fix_phase_timeout tanımlı değil. **P1 — config type genişletilmeli**
  - Satır 603: `(config as unknown as Record<string, unknown>).cleanup_delay_ms` — Aynı sorun. **P1**
- Non-null `!`: **0**
- Unsafe cast:
  - Satır 340: `(result as TaskResult & { regressionDetected?: boolean })` — runtime property injection
  - Satır 341: `(result as TaskResult & { ciAlerts?: string[] })` — runtime property injection
  - Bu 2 cast, TaskResult tipi genişletilerek düzeltilebilir (**P2**)
- Satır 417: `evaluation as 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO'` — TaskEvaluation enum → string literal cast, rollback'ta policy hesabı için. Güvenli ama inelegant.

## 7. ADR Compliance
- **ADR-006 (spawnSync):** ⚠️ Bu dosyada spawnSync import edilmiyor — uyumlu. Ancak readFileSync/writeFileSync kullanımı (V1 pattern) ADR-005 deprecated kararıyla çelişebilir.
- **ADR-008 (brain import):** ✅ — sprint-phases.ts, sprint-controller.ts tarafından import edilir (Brain alt modülü)
- **ADR-010:** ✅ — Dış bağımlılık yok
- **ADR-024 (God Object Split):** ✅ — Sprint 072'de sprint-controller'dan çıkarılmış
- **ADR-037 (RBAC):** N/A — faz fonksiyonları authority check yapmaz
- **Memory V2 DB-first:** ⚠️ **KISMEN UYUMSUZ**:
  - `parseDebtTable` kullanımı (satır 558): `readFileSafe(join(projectRoot, BRAIN_DIR, DEBT_FILE))` — DEBT.md dosyasından okuyor, DB'den değil. Bu yalnızca testMode=true (retro fazında) kullanılıyor, ancak Memory V2 ilkesiyle çelişir.

## 8. Test Coverage
- `tests/orchestra/sprint-phases-ci-intersection.test.ts` — CI regression intersection testi ✅
- `tests/orchestra/sprint-controller.test.ts` — dolaylı test (runSprint çağrısı)
- `tests/orchestra/brain-rollback.test.ts` — runRollbackCheck testi
- `tests/orchestra/fix-phase-map.test.ts` — fix phase testi
- **Eksik:** `runPlanPhase` CI validation path için dedicated test
- **Eksik:** `runDecayPhase` standalone çağrısı için test
- **Eksik:** `runCleanupPhase` delayed cleanup (cleanup_delay_ms > 0) path testi
- **Eksik:** `runSpawnPhase` retry logic (spawnAttempts = 2) testi

## 9. TODO/FIXME/HACK inventory
**0 — Temiz.**

## 10. Dead Code
- `readFileSafe` (satır 114-121): Yalnızca `runRetroPhase` testMode bloğunda kullanılır (satır 558). sprint-utils.ts'de de bir `readFileSafe` var — **DRY ihlali** (duplicate helper). Birinden kurtulunmalı.
- `now()` (satır 110-112): sprint-utils.ts'den import edilebilir — **DRY ihlali** (duplicate helper).
- `safeDashboardUpdate` (satır 124-138): sprint-lifecycle.ts'de de aynı fonksiyon var — **DRY ihlali** (3. kopyası sprint-controller'da da olabilir). Sprint 072 extract sırasında çoğaltılmış.

## 11. Security
- runFixPhase'de dynamic import: `await import('./mid-sprint-adapter.js')` ve `await import('./outcome-tracker.js')` — güvenli, lokal modüller
- CI regression check: tsc/vitest çıktısını parse ederek dosya overlap kontrolü yapar — injection riski yok (spawnSync output'u parse)
- Rollback: `rollback(projectRoot, safetyPoint)` — git checkout çağrısı, projectRoot doğrulanmalı

## 12. Memory V2 Uyumu
- ⚠️ `parseDebtTable` kullanımı (satır 34 import, satır 558 kullanım): DEBT.md dosyasından okuma — Memory V2 ihlali. Bu path yalnızca testMode=true'da çalışır, production'da finalizeSprint → DB-first. Ancak testMode'da bile DB kullanılmalı.
- readContext → sprint-planner.ts'ye delege → DB-first ✅ (burada doğrudan erişim yok)
- Diğer faz fonksiyonları Memory'ye doğrudan erişmiyor ✅

## 13. i18n
- Hardcoded string yok (hata mesajları İngilizce template, uygun)
- `showSplash` çağrısı (satır 182) — CLI splash, i18n concern değil

## 14. Dokümantasyon Tutarlılığı
- Üst yorum bloğu Sprint 072 referansı — **GÜNCELDİR** (faz fonksiyonları hala ayrı)
- "safe circular dependency" notu (satır 6-9) — **GÜNCELDİR**, doğru
- JSDoc'lar 7 export fonksiyon + 1 interface için mevcut ✅
- `PlanPhaseResult` ve `SpawnPhaseResult` interface'leri JSDoc'suz — P3

## 15. Performance
- **Sync I/O sayımı:**
  - `readFileSync`: 1 adet (readFileSafe helper, satır 116) — testMode-only path
  - `writeFileSync`: 1 adet (fix task reroute persist, satır 491) — FIX fazında
  - `existsSync`: 1 adet (fix tasks dir check, satır 460) — FIX fazında
  - `readdirSync`: 1 adet (fix tasks list, satır 461) — FIX fazında
- **Hot path:** runEvaluatePhase for döngüsü — her task için CI check + hook. Task sayısı genelde <50 → sorun yok.
- **FIX fazında gereksiz I/O:** Fix task'ları readdirSync ile okunuyor — parallel-pipeline.ts dependency scheduler kullanılabilir mi?

## 16. Öneriler (severity P0-P3, Sprint 142+ input, somut aksiyon)
1. **P1 — `as unknown as Record<string, unknown>` kaldırılması (satır 501, 603):** `fix_phase_timeout` ve `cleanup_delay_ms` ResolvedConfig veya DeckentConfig'e eklenmeli. Type safety ihlali.
2. **P1 — Memory V2 ihlali:** `parseDebtTable(readFileSafe(...DEBT_FILE))` (satır 558) → testMode'da bile `MemoryStore.getByType('debt')` kullanılmalı.
3. **P2 — DRY ihlali:** `now()`, `readFileSafe()`, `safeDashboardUpdate()` bu dosyada duplicate. sprint-utils.ts veya sprint-lifecycle.ts'den import edilmeli.
4. **P2 — TaskResult type genişletme:** `regressionDetected` ve `ciAlerts` runtime injection yerine TaskResult interface'ine opsiyonel field olarak eklenmeli.
5. **P2 — Test gap:** runSpawnPhase retry, runCleanupPhase delayed cleanup, runDecayPhase standalone test eksik.
6. **P3 — FIX faz async migration:** writeFileSync (satır 491) → writeFile (async) olarak taşınabilir.

## Verdict: ANALYZED
