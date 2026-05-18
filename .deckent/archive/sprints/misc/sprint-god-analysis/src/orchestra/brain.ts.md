# Analysis: src/orchestra/brain.ts
**Task ID:** 142-008 | **Model:** opus | **LoC:** 54 | **Effort:** max

## 1. Amacı (detaylı, 3-5 cümle — ne yapar, neden var, kim kullanır)
brain.ts, Deckent orkestrasyon sisteminin **ince yeniden-export (re-export) katmanıdır**. Sprint 036'dan beri hiçbir gerçek iş mantığı barındırmaz — tüm uygulamalar sprint-controller.ts, model-selector.ts, task-builder.ts, debt-manager.ts, sprint-reporter.ts ve coverage-validator.ts alt modüllerinde yaşar. Bu dosya, eski import yollarını (`from './brain.js'`) kullanan kodun bozulmamasını sağlayan bir **backward compatibility layer**'dır. CLI, MCP ve test dosyaları tarafından barrel import noktası olarak kullanılır. Mimari olarak ADR-008 (Brain merkezi import) ilkesinin somutlaştırılmasıdır — tüm orkestrasyon fonksiyonları buradan export edilir.

## 2. Public API (her export'un tam signature + JSDoc var mı?)
**Re-exported Functions (32):**
- `BrainError`, `readContext`, `getDefaultProvider`, `planSprint`, `confirmDraftTasks`, `cleanupDraftTasks`, `spawnWorkers`, `waitForResults`, `evaluateResult`, `isDocTask`, `isStaleTaskFile`, `cleanup`, `runSprint`, `finalizeSprint`, `pauseSprint`, `resumeSprint`, `getChannelRegistry`, `registerWorkerChannel`, `unregisterWorkerChannel` — sprint-controller.ts'den
- `calculateModelScore`, `inferModelFromDirective`, `resolveTaskModel`, `parsePatterns`, `deduplicatePatterns`, `suggestModelFromPatterns` — model-selector.ts'den
- `createTask`, `extractScopeFromDirective`, `parseStructuredDirectives`, `buildWorkerPrompt`, `plannerTaskToParams`, `resolveWorkerEffort` — task-builder.ts'den
- `handleEvaluation`, `handleCrossDependencies`, `escalateDebt`, `resolveDebt`, `runDecay`, `decay` — debt-manager.ts'den
- `trimMemoryWithHeader`, `writeRetrospective`, `writeSprintLog`, `calculateMetrics`, `updateProjectDocs`, `compareWithPreviousSprint`, `readPreviousSprintMetrics`, `buildAgentPerformance`, `formatAgentPerformanceTable`, `buildSkillPerformance`, `formatSkillPerformanceTable`, `generateProjectIdentity`, `updateProjectIdentity` — sprint-reporter.ts'den
- `parseCoverageFromVitest`, `validateCoverage`, `validateWorkerCoverage`, `isDocOnlyTask` — coverage-validator.ts'den

**Re-exported Types (19):**
- `PauseState`, `RunSprintOptions`, `FinalizeSprintOptions` — sprint-controller.ts
- `BrainContext`, `ProjectState`, `SprintSizeRecommendation`, `SprintResult` — core/types.ts
- `ProviderAdapter` — core/provider.ts
- `SpawnBackend` — spawn-backend.ts
- `SpawnBackendFactory` — spawn-backend.ts (value export)
- `SafetyPoint`, `RollbackResult`, `RollbackPolicy` — rollback.ts
- `createSafetyPoint`, `rollback`, `getRollbackPolicy`, `recordRollbackInDebt`, `isCleanWorkingTree`, `safetyBranchExists` — rollback.ts (value exports)
- `CreateTaskParams`, `ParsedDirectiveTask`, `RunDecayOptions`, `SprintComparison`, `AgentPerformanceRow`, `SkillPerformanceRow`, `ProjectIdentityInfo`, `CoverageResult`, `CoverageWarningLevel`, `ParsedVitestOutput`, `VitestCoverageSummary`, `VitestCoverageData` — çeşitli

**JSDoc:** EKSIK — brain.ts'de hiçbir export'un JSDoc'u yok (kaynak modüllerde mevcut olabilir).

## 3. İç Bağımlılıklar (import chain listesi, döngüsel bağımlılık riski var mı?)
- `./sprint-controller.js` → birincil orkestrasyon
- `../core/types.js` → tip re-export'ları
- `../core/provider.js` → ProviderAdapter re-export
- `./spawn-backend.js` → SpawnBackend re-export
- `./rollback.js` → safety point re-export
- `./model-selector.js` → model seçimi
- `./task-builder.js` → task oluşturma
- `./debt-manager.js` → borç yönetimi
- `./sprint-reporter.js` → retro/metrik
- `./coverage-validator.js` → kapsam doğrulama

**Döngüsel risk:** brain.ts → sprint-controller.ts → sprint-phases.ts → sprint-controller.ts (deferred import ile güvenli — fonksiyon gövdesinde).

## 4. Dış Bağımlılıklar (node_modules, native modül — ADR-010 uyumu)
Yok — brain.ts hiçbir node_modules veya native modül import etmez. **ADR-010 UYUMLU**.

## 5. Complexity (fonksiyon sayısı, max cyclomatic rough, en karmaşık fonksiyon adı + satır no)
- Fonksiyon sayısı: **0** (tamamı re-export)
- Max cyclomatic: **1** (hiç branch/loop yok)
- En karmaşık: N/A — dosya yalnızca `export { ... } from '...'` ifadelerinden oluşur

## 6. Type Safety (any sayısı, @ts-ignore, @ts-expect-error, as unknown, non-null !, unsafe cast — SATIR NUMARALARIYLA)
- `any`: **0**
- `@ts-ignore`: **0**
- `@ts-expect-error`: **0**
- `as unknown`: **0**
- Non-null `!`: **0**
- Unsafe cast: **0**

**Temiz.** Re-export layer olarak type safety riski minimal.

## 7. ADR Compliance
- **ADR-006 (spawnSync):** N/A — brain.ts'de spawnSync çağrısı yok
- **ADR-008 (brain import):** ✅ **TAM UYUMLU** — brain.ts yalnızca re-export yapar, tüm alt modüllerden ithal eder. Brain = merkezi import noktası.
- **ADR-010 (tek dependency):** ✅ — Dış bağımlılık yok
- **ADR-022 (CLI/MCP parity):** N/A — barrel export katmanı
- **ADR-033 (product vision):** N/A
- **ADR-037 (RBAC):** N/A — brain.ts enforcing yapmaz, enforcing sprint-controller'dadır
- **ADR-039 (self-modifying):** N/A
- **Memory V2 DB-first:** N/A — brain.ts veri okuması yapmaz

## 8. Test Coverage
- `tests/orchestra/brain.test.ts` MEVCUT — brain.ts'den import ederek entegrasyon testi yapar
- 11 ek brain-*.test.ts dosyası mevcut (coverage, rollback, agent, skill, pause-resume, budget-decay vb.)
- brain.ts re-export layer olduğundan, asıl test coverage alt modüllerdedir
- Mock kalitesi: Uygun — alt modüller mock'lanarak brain import'ları test edilir

## 9. TODO/FIXME/HACK inventory
**0 — Temiz.** Hiçbir TODO, FIXME, HACK veya XXX bulunmadı.

## 10. Dead Code
- **Potansiyel ölü export'lar:** `suggestModelFromPatterns`, `deduplicatePatterns`, `trimMemoryWithHeader` — bu fonksiyonlar tüm consumer'lar tarafından kullanılıyor mu? Doğrulanmalı.
- `SprintResult` tipi re-export ediliyor ancak gerçek kullanımı sınırlı olabilir (Sprint 136'da runSprint artık `Sprint` döndürüyor).
- `isCleanWorkingTree`, `safetyBranchExists` — rollback utility'leri, kullanım sıklığı düşük olabilir.

## 11. Security
- brain.ts'de güvenlik riski yok — yalnızca re-export
- Input validation: N/A (re-export layer)
- Secret exposure: Yok

## 12. Memory V2 Uyumu
- brain.ts'de doğrudan Memory V2 erişimi yok (re-export layer)
- `readContext` sprint-planner.ts'den re-export — DB-first erişim orada doğrulanmalı ✅
- Eski .md parse: brain.ts'de readFileSync yok ✅
- `parseDebtTable` debt-manager.ts'den re-export — V1 fallback riski (ayrı analiz)

## 13. i18n
- Hardcoded string: **0** (re-export layer)
- turkishNormalize kullanımı: N/A

## 14. Dokümantasyon Tutarlılığı
- JSDoc: **EKSIK** — 54 satır, 0 JSDoc. Re-export layer'da gerekli mi tartışılabilir.
- En üstteki yorum bloğu Sprint 036 referansı, **GÜNCELDİR** (hala ince re-export layer).
- Alt modül listesi (satır 3-9) **GÜNCEL** — listelenen 6 modül hala mevcuttur.
- `.contracts/api-surface.md` brain.ts'yi doğrudan referanslamaz — uygun.

## 15. Performance
- Sync I/O: **0** — brain.ts'de disk okuma/yazma yok
- Hot path: **HAYIR** — yalnızca import/export binding, runtime overhead yok
- Module loading overhead: 54 satırlık re-export binding'ler tree-shakeable değil, ancak Node.js ESM'de ihmal edilebilir

## 16. Öneriler (severity P0-P3, Sprint 142+ input, somut aksiyon)
1. **P3 — Dead export audit:** `suggestModelFromPatterns`, `deduplicatePatterns` vb. re-export'ların gerçek consumer'ları var mı? Grep ile doğrulayıp kullanılmayanları kaldır.
2. **P3 — JSDoc yok:** Re-export layer'da JSDoc zorunlu değil ancak IDE entegrasyonu için `/** @see sprint-controller.ts */` tarzı referanslar eklenebilir.
3. **P3 — SprintResult tipi:** core/types.ts'den SprintResult re-export ediliyor ancak runSprint artık Sprint döndürüyor. Gerçek kullanım doğrulanmalı.

## Verdict: ANALYZED
