# Analysis: src/orchestra/sprint-finalizer.ts
**Task ID:** 142-008 | **Model:** opus | **LoC:** 1074 | **Effort:** max

## 1. Amacı (detaylı, 3-5 cümle — ne yapar, neden var, kim kullanır)
sprint-finalizer.ts, sprint tamamlandıktan sonra yapılan **TÜM finalizasyon işlemlerini** barındıran modüldür. Sprint sonunda metrikleri hesaplar, sprint log yazar, RETRO.md günceller, PROJECT-IDENTITY.md günceller, config'deki last_sprint_id'yi günceller, memory decay çalıştırır, plugin hook'ları tetikler, agent/skill stat'larını günceller (V1 ve V2), proje dokümanlarını günceller, rich output formatlar, self-audit gate (tsc + vitest + honesty) çalıştırır, load report üretir, adaptive threshold'ları ayarlar, DIRECTIVES.md arşivler, orphan task'ları arşivler ve job summary JSON yazar. Bu dosya **en yoğun yan-etki üreticisidir** — tek bir fonksiyon çağrısı (finalizeSprint) 13+ ayrı disk/process operasyonu tetikler. Brain tarafından runRetroPhase üzerinden çağrılır.

## 2. Public API (her export'un tam signature + JSDoc var mı?)
**Interfaces (3):**
1. `FinalizeSprintOptions { skipDecay?, skipHooks?, config? }` — JSDoc: ✅
2. `SelfAuditResult { tsc, vitest, honesty, observability, overallGate }` — JSDoc: ✅
3. `SelfAuditGateOptions { runTsc?, runVitest?, honestyResults?, metricsJsonlPath? }` — JSDoc: ✅

**Functions (6):**
1. `runHonestyCheck(projectRoot, sprintId, results): Promise<number>` — JSDoc: ✅ (STUB — satır 109-116, "returns 0 violations")
2. `writeRubricDetail(projectRoot, sprintId, results, evaluations): Promise<boolean>` — JSDoc: ✅
3. `runSelfAuditGate(sprintId, projectRoot?, options?): Promise<SelfAuditResult>` — JSDoc: ✅
4. `applyGateStatus(currentStatus, gate): string` — JSDoc: ✅
5. `applyAdaptiveThresholds(projectRoot, config): Promise<void>` — JSDoc: ✅
6. `finalizeSprint(projectRoot, sprint, evaluations, results, opts?): Promise<SprintMetrics>` — JSDoc: ✅

## 3. İç Bağımlılıklar (import chain listesi, döngüsel bağımlılık riski var mı?)
**Import'lar (17 modül):**
- core: types, routing-types, constants, utils, observability, agent-pool, skill-pool, plugin-hooks
- orchestra: sprint-reporter, sprint-docs-updater, result-evaluator, baseline-tracker, result-collector, debt-manager, event-stream
- monitor: auditor (tryCodeVerifiedDone, writeCodeVerifiedResult)
- cli: helpers/sprint-summary-rich

**Dynamic import'lar (5):**
- `./outcome-tracker.js` (satır 693, 696)
- `./quality-assessor.js` (satır 695)
- `./rule-evolver.js` (satır 728)
- `./promotion-pipeline.js` (satır 794)

**Döngüsel risk:** Yok — sprint-finalizer.ts tek yönlü bağımlılıklara sahip. sprint-controller.ts tarafından import edilmez (sprint-phases.ts → sprint-controller.ts → finalizeSprint re-export).

## 4. Dış Bağımlılıklar
- `node:fs` (readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync)
- `node:fs/promises` (readFile, writeFile, readdir, mkdir)
- `node:path` (join)
- `node:child_process` (spawnSync)
- Üçüncü parti: **YOK** — ADR-010 UYUMLU

## 5. Complexity
- Fonksiyon sayısı: **6 exported**
- Max cyclomatic rough: **~50** (finalizeSprint — 13+ step, nested try/catch, for döngüleri, conditional V1/V2 logic)
- En karmaşık fonksiyon: **finalizeSprint()** (satır 482-1073, **591 LoC**) — **PROJE GENELİNDE EN BÜYÜK FONKSİYON**
- İkinci en karmaşık: **runSelfAuditGate** (satır 215-365, ~150 LoC) — 4 adımlı gate
- Üçüncü: **applyAdaptiveThresholds** (satır 396-453, ~57 LoC)

## 6. Type Safety
- `any`: **0**
- `@ts-ignore`: **0**
- `@ts-expect-error`: **0**
- `as unknown`: **2** adet:
  - Satır 707: `evaluation as unknown as string` — TaskEvaluation enum → string, assessQuality parametresi. **P2 — assessQuality tipi düzeltilmeli**
  - Satır 718: `evaluation as unknown as 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO'` — aynı enum→literal cast. **P2**
- Non-null `!`: **1** adet:
  - Satır 152: `result.rubricScores!` — filter ile korunmuş, güvenli (`.filter(r => r.rubricScores && ...)`)
- Unsafe cast:
  - Satır 663: `(opts?.config as Record<string, unknown> | undefined)?.['routing_engine']` — config tipinde routing_engine mevcut mu?
  - Satır 833: `(rawConfig?.['output_mode'] as string)` — output_mode ResolvedConfig'de tanımlı mı?
  - Satır 960: `(opts?.config as Record<string, unknown> | undefined)?.['auto_archive_directives']` — config cast
  - Satır 865: `sprint.status = newStatus as Sprint['status']` — applyGateStatus dönüşü string → status cast

## 7. ADR Compliance
- **ADR-006 (spawnSync):** ⚠️ 3 spawnSync kullanımı:
  - Satır 227: `spawnSync('npx', ['tsc', '--noEmit'], ...)` — self-audit gate, timeout 30s
  - Satır 254: `spawnSync('npx', ['vitest', 'run', '--reporter=basic'], ...)` — self-audit gate, timeout 120s
  - Satır 830: `spawnSync('git', ['diff', '--stat', 'HEAD~1'], ...)` — rich output git diff
  - ADR-006 spawnSync'i güvenlik amacıyla izin verir. Gate ve git diff kullanımları meşru ama **blocking** — async alternatif düşünülmeli (P3).
- **ADR-008 (brain import):** ✅ — sprint-finalizer.ts Brain alt modülü
- **ADR-010:** ✅ — Dış bağımlılık yok
- **ADR-035 (Event Stream):** ✅ — writeEvent ile SPRINT_PHASE_CHANGE, METRIC_EMITTED, GATE_COMPUTED, LOAD_REPORT_WRITTEN event'leri yayınlanıyor
- **ADR-037 (RBAC):** ⚠️ GATE_COMPUTED event'i 'auditor' source ile yazılıyor (satır 888) — finalizeSprint Brain içinde çalışır, source 'brain' olmalı mı? Yorum "Brain emits on behalf of the self-audit gate" diyor — ADR-037 authority matrix'e uyumlu.
- **Memory V2 DB-first:** ⚠️ **KISMEN UYUMSUZ:**
  - `parseDebtTable(debtContent)` (satır 552): Debt dosyasından okuma `fsPromises.readFile(DEBT_FILE)` ile. DB'den okumalı.
  - writeRetrospective, writeSprintLog → sprint-reporter.ts'ye delege — o dosya .md dosyalarına yazıyor, DB-first dual-write mı?

## 8. Test Coverage
- `tests/orchestra/sprint-finalizer.test.ts` — MEVCUT, finalizeSprint, applyAdaptiveThresholds, runSelfAuditGate, writeRubricDetail testleri
- `tests/orchestra/brain-budget-decay.test.ts` — decay testleri
- **Eksik:** runHonestyCheck henüz STUB, test yok (beklenen — Task 5 implement edecek)
- **Eksik:** applyGateStatus fonksiyonu için dedicated test (finalizeSprint entegrasyon testinde dolaylı)
- **Eksik:** finalizeSprint'in V2 outcome tracking path'i (satır 690-818) — karmaşık V2 pipeline testi
- **Eksik:** Code-verified DONE reconciliation (satır 506-548) dedicated test

## 9. TODO/FIXME/HACK inventory
**0 — Temiz.** Ancak runHonestyCheck bir STUB'dır (satır 115: "Stub: returns 0 violations (no-op until Task 5 integrates)"). Bu bir TODO olmasa da fiilen tamamlanmamış fonksiyondur.

## 10. Dead Code
- **runHonestyCheck STUB:** Satır 109-116, her zaman 0 döndürür. Gerçek implementasyon yapılmadı — dead code değil ama non-functional code.
- **writeRubricDetail:** Fonksiyon finalizeSprint tarafından çağrılıyor mu? finalizeSprint'te doğrudan çağrı YOK — brain.ts re-export'u var ama finalizeSprint içinde `writeRubricDetail` çağrılmıyor. External çağrı noktası doğrulanmalı. **POTANSIYEL ORPHAN — P2.**

## 11. Security
- **spawnSync kullanımı:** tsc ve vitest komutları spawnSync ile çalıştırılıyor — komut injection riski yok (sabit argümanlar).
- **git diff:** `spawnSync('git', ['diff', '--stat', 'HEAD~1'])` — güvenli, user input yok.
- **JSON parse:** `JSON.parse(raw) as { taskId?, notes? }` (satır 313) — catch bloğunda, güvenli.
- **File path construction:** `join(projectRoot, ...)` — path traversal riski yok (projectRoot Brain tarafından doğrulanır).
- **Secret exposure:** writeFileSync ile job summary JSON yazılıyor — dosyada hassas bilgi yok.

## 12. Memory V2 Uyumu
- ⚠️ `parseDebtTable` import + kullanım (satır 33, 552): DEBT.md'den dosya okuma — **V2 ihlali**. `MemoryStore.getByType('debt')` kullanılmalı.
- writeRetrospective → sprint-reporter.ts — RETRO.md + MEMORY.md dosya yazma. Memory V2'de bu dual-write olmalı (DB + .md export). sprint-reporter.ts'de ayrıca analiz edilmeli.
- writeSprintLog → .brain/sprints/sprint-NNN.md dosya yazma — DB'de de kaydedilmeli mi?
- updateProjectIdentity → PROJECT-IDENTITY.md dosya yazma — DB'de identity tipi zaten var, dual-write olmalı.
- Event stream writeEvent → dosya tabanlı event log — DB ile ilişkisi yok, uygun.

## 13. i18n
- Hardcoded TR string: **0** (mesajlar İngilizce)
- Dashboard sprint summary: `Summary Sprint ${sprint.id} tamamlandı (${durationStr})...` (satır 1005) — **1 hardcoded TR string** in job summary. i18n'e taşınmalı (P3).

## 14. Dokümantasyon Tutarlılığı
- En üstteki yorum bloğu — "Extracted from sprint-controller.ts" ✅
- finalizeSprint JSDoc: 10 adım listeleniyor (satır 459-481) — gerçekte **13+ adım** var (10c load report, 11 adaptive, 12 archive, 12b orphan, 12c retention, 13 job summary). **JSDoc güncel değil — P2.**
- SelfAuditResult JSDoc: **detaylı ve doğru** ✅
- "Hook Stubs (Task 13 / Task 14 / Task 15)" yorum başlığı (satır 102) — Task 14 (Self-Audit Gate) implement edilmiş, Task 13 (Honesty) hala stub. Yorum **KISMEN eski** — P3.

## 15. Performance
- **Sync I/O sayımı:**
  - `readFileSync`: 1 (satır 908 — gate failure RETRO append)
  - `writeFileSync`: 2 (satır 921 gate failure RETRO, satır 1059 job summary)
  - `existsSync`: 2 (satır 625 sprints dir, satır 908 retro path)
  - `readdirSync`: 1 (satır 626 sprint count)
  - `mkdirSync`: 1 (satır 987 jobs dir)
  - `spawnSync`: 3 (satır 227 tsc, satır 254 vitest, satır 830 git diff)
- **Toplam sync I/O: 10** — finalizeSprint sıcak yolda değil (sprint sonunda 1 kez çalışır), ancak **3 spawnSync blocking** çağrısı sprint tamamlanma süresini uzatır (tsc 30s + vitest 120s + git diff).
- **Async I/O:** 7 fsPromises kullanımı — Sprint 139 async migration kısmen tamamlanmış.
- **Hot path:** Hayır — finalizeSprint sprint sonu tek çağrı. Ancak tsc+vitest toplamda 150s blocking = production'da kabul edilebilir gecikme.

## 16. Öneriler (severity P0-P3, Sprint 142+ input, somut aksiyon)
1. **P0 — finalizeSprint 591 LoC:** Proje genelinde en büyük fonksiyon. 13+ adım ayrı fonksiyonlara çıkarılmalı (extractCodeVerifiedReconciliation, extractV2OutcomePipeline, extractJobSummaryWriter, extractGateRunner).
2. **P1 — parseDebtTable V2 ihlali:** Debt DEBT.md'den okunuyor. `MemoryStore.getByType('debt')` kullanılmalı.
3. **P1 — finalizeSprint JSDoc güncel değil:** 10 adım yazılı, 13+ adım var. JSDoc güncellenmeli.
4. **P2 — as unknown cast'ler (satır 707, 718):** assessQuality ve OutcomeTracker parametreleri TaskEvaluation enum'u kabul etmeli, string değil.
5. **P2 — writeRubricDetail orphan?:** finalizeSprint içinde çağrılmıyor. Gerçek consumer doğrulanmalı — kullanılmıyorsa kaldırılmalı.
6. **P2 — runHonestyCheck STUB:** Satır 109-116, hala stub. Ya implement edilmeli ya da kaldırılmalı.
7. **P2 — Sync → Async migration tamamlanmalı:** readFileSync/writeFileSync (satır 908, 921, 1059) async'e taşınmalı (Sprint 139 migration yarım kalmış).
8. **P3 — config access unsafe cast'ler (satır 663, 833, 960):** routing_engine, output_mode, auto_archive_directives → ResolvedConfig tipine eklenmeli.

## Verdict: ANALYZED
