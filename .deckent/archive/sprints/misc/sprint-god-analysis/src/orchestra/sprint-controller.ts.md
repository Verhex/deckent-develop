# Analysis: src/orchestra/sprint-controller.ts
**Task ID:** 142-008 | **Model:** opus | **LoC:** 499 | **Effort:** max

## 1. Amacı (detaylı, 3-5 cümle — ne yapar, neden var, kim kullanır)
sprint-controller.ts, Deckent sprint yaşam döngüsünün **orkestrasyon hub'ıdır**. Sprint 136'da ~1894 LoC'dan 499 LoC'a indirilmiş, yalnızca `runSprint()`, `waitForResults()` ve `evaluateResult()` burada tutulmuştur. Tüm diğer fonksiyonlar sprint-planner.ts, sprint-spawner.ts, sprint-lifecycle.ts, sprint-finalizer.ts, ipc-registry.ts ve result-collector.ts alt modüllerine delege edilmiştir. Sprint'in 8 fazını (PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→DECAY→CLEANUP) sıralı olarak çalıştırır, human checkpoint'leri destekler, rollback mekanizması, grace period yönetimi ve PID tracking sağlar. Brain, CLI (`deckent start`) ve MCP (`deckent_start`) tarafından çağrılır.

## 2. Public API (her export'un tam signature + JSDoc var mı?)
**Locally Defined (3):**
1. `interface RunSprintOptions` (satır 145-166) — JSDoc: Kısmi (sadece field-level yorumlar)
2. `async waitForResults(projectRoot, sprint, timeoutMs?, queue?, spawnOpts?)` — JSDoc: ✅ Var
3. `evaluateResult(result, task, vitestJsonOutput?, coverageThreshold?)` — JSDoc: ✅ Var
4. `async runSprint(projectRoot, config, opts?)` — JSDoc: ✅ Var

**Re-exported (30+ symbols from 6 sub-modules):**
- sprint-planner: readContext, planSprint, confirmDraftTasks, cleanupDraftTasks
- sprint-spawner: spawnWorkers, respawnEligibleTasks, validateTaskDependencies, routeSprintTasks
- sprint-lifecycle: BrainError, setActiveSprint, clearActiveSprint, resetInterruptState, isInterrupted, interruptActiveSprint, cleanup, pauseSprint, resumeSprint, waitForHumanApproval, safeDashboardUpdate, PauseState, CheckpointPhase
- sprint-utils: isDocTask, isStaleTaskFile, isTmuxProvider, resolveDefaultUsageCli, getDefaultProvider, resolveTaskProvider, getSubprocessWorkerLogPath, readSubprocessWorkerLog, hasSubprocessWorkerLog, writeSprintState, readSprintState, clearSprintState, detectOrphanWorkers, buildSpawnRetryHint, SprintState
- result-collector: resolveAgentPrompt, resolveSkillPrompts
- ipc-registry: getChannelRegistry, registerWorkerChannel, unregisterWorkerChannel
- sprint-finalizer: finalizeSprint, applyAdaptiveThresholds, runHonestyCheck, writeRubricDetail, runSelfAuditGate, FinalizeSprintOptions, SelfAuditResult
- parallel-pipeline: DependencyCycleError

## 3. İç Bağımlılıklar (import chain listesi, döngüsel bağımlılık riski var mı?)
**Import'lar (18 modül):**
- core: types, constants, utils, provider, multi-ide, observability, plugin-hooks
- orchestra: spawn-backend, connector, sprint-utils, sprint-phases, result-collector, coverage-validator, baseline-tracker, sprint-pid-manager, sprint-lifecycle, ipc-registry, sprint-spawner
- monitor: auditor

**Döngüsel bağımlılık:** sprint-controller.ts ↔ sprint-phases.ts (satır 83-95 sprint-phases.ts'deki yorumda belirtilmiş — "safe circular dependency, all cross-module references are inside function bodies"). Bu, Node.js ESM module loading'de sorun yaratmaz çünkü tüm referanslar deferred (fonksiyon gövdesinde).

## 4. Dış Bağımlılıklar (node_modules, native modül — ADR-010 uyumu)
- `node:fs/promises` (readFile, stat, writeFile) — Native
- `node:path` (join) — Native
- Üçüncü parti bağımlılık: **YOK** — ADR-010 UYUMLU

## 5. Complexity
- Fonksiyon sayısı: **3** (waitForResults, evaluateResult, runSprint)
- Max cyclomatic rough: **~25** (runSprint — birden fazla try/catch, if/else, for döngüsü)
- En karmaşık fonksiyon: **runSprint()** (satır 222-499, ~277 LoC) — 8 faz, human checkpoint kontrolleri, grace period, PID management, snapshot interval, error recovery
- evaluateResult: cyclomatic ~6 (4 if + coverage validation)

## 6. Type Safety
- `any`: **0**
- `@ts-ignore`: **0**
- `@ts-expect-error`: **0**
- `as unknown`: **0**
- Non-null `!`: **0**
- Unsafe cast: **0**

**Temiz.** sprint-controller.ts'de type safety ihlali yok.

## 7. ADR Compliance
- **ADR-006 (spawnSync):** ✅ — sprint-controller.ts'de spawnSync yok, tüm I/O async
- **ADR-008 (brain import):** ✅ — sprint-controller.ts, tüm alt modülleri import eden merkezi dosya. Auditor (`../monitor/auditor.js`) import'u var — bu ADR-008'e göre izinli (Brain merkezi import noktası).
- **ADR-010 (tek dependency):** ✅ — Dış bağımlılık yok
- **ADR-022 (CLI/MCP parity):** ✅ — runSprint hem CLI hem MCP'den çağrılabilir
- **ADR-025 (Graceful Shutdown):** ✅ — process.on('beforeExit', beforeExitHandler) + clearPid + writePeriodicSnapshot
- **ADR-033 (product vision):** N/A
- **ADR-037 (RBAC):** Kısmi — runSprint içindeki `routeSprintTasksImpl` provider routing yapar, ancak RBAC authority check'i burada değil, sprint-spawner'da olmalı
- **ADR-039 (self-modifying):** N/A
- **Memory V2 DB-first:** Dolaylı ✅ — readContext() sprint-planner'a delege eder (DB-first)

## 8. Test Coverage
- `tests/orchestra/sprint-controller.test.ts` — MEVCUT, doğrudan sprint-controller'ı test eder
- `tests/orchestra/brain.test.ts` — brain.ts üzerinden dolaylı test
- 11 brain-*.test.ts dosyası aracılığıyla çeşitli senaryolar test ediliyor
- **Eksik:** runSprint'in grace period bloğu (satır 363-416) için dedicated test yok — stale worker + grace kill senaryosu
- **Eksik:** PID snapshot interval (satır 284-307) için test yok — beforeExit handler cleanup

## 9. TODO/FIXME/HACK inventory
**0 — Temiz.** Hiçbir TODO, FIXME, HACK veya XXX bulunmadı.

## 10. Dead Code
- `RunSprintOptions` interface'i sprint-controller.ts'de TANIMLANIP brain.ts'den de re-export ediliyor — çift tanım değil, doğru kullanım
- `evaluateResult` fonksiyonu sprint-phases.ts'de kullanılmıyor (sprint-phases.ts `evaluateWithRubric` kullanır) — evaluateResult yalnızca external consumer'lar (CLI/MCP test) için mi? Doğrulanmalı.

## 11. Security
- Sprint lock mekanizması: `acquireSprintLock` / `releaseSprintLock` — concurrent sprint çalıştırma koruması ✅
- Grace period stale worker kill: `spawnBackend.kill(task.id)` — yetki kontrolü spawn backend'e delege ✅
- writeFile ile synthetic result yazma: Path injection riski yok (join + TASKS_DIR sabiti) ✅
- **Potansiyel:** Dynamic import `await import('./tmux.js')` (satır 393) — güvenli, lokal modül

## 12. Memory V2 Uyumu
- sprint-controller.ts **doğrudan** memory.db'ye erişmiyor ✅
- `readContext` sprint-planner.ts'ye delege ediliyor → DB-first ✅
- `parseDebtTable` bu dosyada kullanılmıyor ✅ (sprint-phases.ts'de kullanılıyor — V1 fallback riski orada)
- `finalizeSprint` sprint-finalizer.ts'ye delege → DB-first dual-write orada doğrulanmalı

## 13. i18n
- Hardcoded TR string: `"Değerlendirme: ..."` (satır 439) — human checkpoint eval summary
- Hardcoded TR string: `"Fix fazı başlayacak: ..."` (satır 455) — human checkpoint fix summary
- Hardcoded TR string: `"task planlandı: ..."` (satır 266) — human checkpoint plan summary
- **3 hardcoded Türkçe string** — i18n'e taşınmalı (P2)

## 14. Dokümantasyon Tutarlılığı
- En üstteki yorum bloğu (satır 1-10) Sprint 136 referansı — **GÜNCELDİR** (dosya hala ince barrel layer)
- Alt modül listesi (planner, spawner, lifecycle, finalizer, ipc-registry, result-collector) — tamamı mevcut ✅
- JSDoc'lar 3 ana fonksiyon için mevcut ve **doğru** (waitForResults, evaluateResult, runSprint)
- `coverageThreshold = 90` default değeri JSDoc'ta belirtilmiş ✅

## 15. Performance
- **Sync I/O:** 0 — sprint-controller.ts tamamen async (readFile, stat, writeFile from fs/promises) ✅
- **Async grace period:** `await new Promise(resolve => setTimeout(resolve, GRACE_PERIOD_MS))` — 5 dakika blocking bekleyiş. Stale worker yoksa bu timeout gereksiz yere beklemez (guard: `staleWorkers.length > 0`).
- **Snapshot interval:** 30s setInterval (satır 307) — düşük overhead
- **Hot path:** `evaluateResult` sıcak yol — metric kaydı var (`metric('eval.duration_ms'...)`)
- **Post-collect sweep:** O(n) task scan — kabul edilebilir

## 16. Öneriler (severity P0-P3, Sprint 142+ input, somut aksiyon)
1. **P1 — runSprint karmaşıklığı:** 277 LoC, ~25 cyclomatic. Grace period bloğu (satır 363-416) ayrı bir fonksiyona çıkarılabilir — `handleStaleWorkerGracePeriod()`.
2. **P2 — i18n:** 3 hardcoded TR string human checkpoint mesajlarında. i18n framework'e taşınmalı.
3. **P2 — evaluateResult coverage validation:** `validateWorkerCoverage` sadece WARNING seviyesinde GO_WITH_TECH_DEBT döndürür, CRITICAL seviyede NO_GO dönmeli mi? İş mantığı karar noktası.
4. **P2 — Grace period testi:** staleWorkers grace kill + synthetic result yazma senaryosu için dedicated test eksik.
5. **P3 — PID cleanup:** `process.on('beforeExit', ...)` — beforeExit async operasyon desteklemez, `process.on('exit', ...)` olmalı mı? beforeExit Node.js'de event loop boş olduğunda çağrılır — mevcut kullanım doğru ama senkronizasyon riski var.
6. **P3 — Snapshot metricsJsonlSize:** async readFile try-catch (satır 298) — double try-catch gereksiz (iç ve dış). Tekine sadeleştirilebilir.

## Verdict: ANALYZED
