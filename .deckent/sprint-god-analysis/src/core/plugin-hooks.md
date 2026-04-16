# Analysis: src/core/plugin-hooks.ts
**Task ID:** 142-006 | **Model:** opus | **LoC:** 834 | **Effort:** max

## 1. Amaç (detaylı)
Plugin hook sistemi VE CI Guardian modülü — iki ayrı sorumluluk tek dosyada. Hook sistemi: Plugin'lerin sprint/task lifecycle noktalarına (beforeSprint, afterSprint, beforeTask, afterTask) callback kaydetmesini sağlar. CI Guardian: Pre-sprint tsc/vitest doğrulama, per-task CI regression check, after-sprint CI rapor üretimi. Stack-aware build komutu (stack-detector entegrasyonu). `.brain/ci-report-{sprintId}.json` ve `.deckent/ci-baseline.json` dosyalarına yazar.

## 2. Public API
### Hook Sistemi
- `PluginHook` type — 4 hook ismi
- `BeforeSprintContext`, `AfterSprintContext`, `BeforeTaskContext`, `AfterTaskContext` interfaces — JSDoc yok (interface names self-documenting)
- `HookContext` union type
- `HookCallback` type
- `registerHook(hook, callback): void` — Hook kayıt. JSDoc ✅
- `runHooks(hook, context): Promise<void>` — Hook'ları çalıştır. JSDoc ✅
- `clearHooks(): void` — Tüm hook'ları temizle. JSDoc ✅
- `getHookCount(hook): number` — Hook sayısı. JSDoc ✅
- `clearHook(hook): void` — Tek hook temizle. JSDoc ✅
- `loadHookModule(pluginDir, hookPath): Promise<HookCallback | null>` — @internal JSDoc ✅
- `registerPluginHooks(plugin, securityConfig?): Promise<number>` — @internal JSDoc ✅
- `loadPluginHooks(projectRoot, options?): Promise<number>` — Ana yükleme fonksiyonu. JSDoc ✅

### CI Guardian
- `parseTscErrorFiles(tscOutput): string[]` — tsc hata çıktısını parse et. JSDoc ✅
- `CiGuardianConfig`, `DEFAULT_CI_GUARDIAN_CONFIG` — CI config
- `CiBaseline`, `CiRegressionCheckResult` interfaces
- `findTargetedTestFiles(filesChanged, projectRoot): string[]` — Kaynak→test eşleme. JSDoc ✅
- `runTscCheck(projectRoot): { passed, output }` — Build kontrolü. JSDoc ✅
- `runTargetedTests(projectRoot, testFiles): { passed, output, testCount }` — Hedefli test. JSDoc ✅
- `readCiBaseline`, `writeCiBaseline` — Baseline I/O. JSDoc ✅
- `resolveCiGuardianConfig(projectRoot): CiGuardianConfig` — Config okuma. JSDoc ✅
- `runCiRegressionCheck(projectRoot, result, config): CiRegressionCheckResult` — Task-sonrası regression. JSDoc ✅
- `parseVitestOutput(output): { testCount, testPassed, testFailed }` — Vitest çıktı parse. JSDoc ✅
- `runFullVitest(projectRoot): { passed, output, testCount, ... }` — Tam vitest suite. JSDoc ✅
- `runPreSprintValidation(projectRoot, sprintId, configOverride?): CiValidationResult` — Pre-sprint doğrulama. JSDoc ✅
- `CiReport` interface, `writeCiReport`, `readCiReport` — CI rapor I/O. JSDoc ✅
- `runAfterSprintCiReport(projectRoot, sprintId, configOverride?): CiReport` — Sprint-sonrası rapor. JSDoc ✅

## 3. İç Bağımlılıklar
- `./plugin.js` → scanPlugins, PluginSecurityError, Plugin
- `./plugin-loader.js` → validatePluginSecurity, PluginSecurityConfig
- `./stack-detector.js` → detectFullStack
- `./utils.js` → debugLog
- `./types.js` → Task, TaskResult, Sprint, ResolvedConfig
- **Döngüsel bağımlılık riski:** Yok. Tek yönlü: plugin-hooks → plugin → utils.

## 4. Dış Bağımlılıklar
- `node:path`, `node:fs`, `node:url`, `node:child_process` → spawnSync
- ADR-010: ✅

## 5. Complexity
- Fonksiyon sayısı: ~25 (public + internal)
- Max cyclomatic complexity: ~8 (`runPreSprintValidation` — multi-step conditional)
- En karmaşık fonksiyon: `runPreSprintValidation` (satır 603-711) — 108 satır, tsc + vitest + baseline save
- **BÜYÜKLÜK UYARISI (P1):** 834 satır — iki farklı sorumluluk (Hook sistemi + CI Guardian) tek dosyada. SRP (Single Responsibility Principle) ihlali.

## 6. Type Safety
- `any` sayısı: **0** ✅
- `@ts-ignore`: **0** ✅
- Non-null `!`: **0** ✅
- `JSON.parse(...) as CiBaseline` (satır 422), `as CiReport` (satır 759), `as Record<string, unknown>` (satır 443) — Schema validation yok ama internal dosyalar. Düşük risk.
- `mod.default ?? mod` (satır 143) — Dynamic import callback çözümlemesi, tip güvenli değil ama unavoidable for ESM.

## 7. ADR Compliance
- ADR-006 (spawnSync): ✅ — Tüm spawnSync çağrıları timeout'lu:
  - runTscCheck: 120s
  - runTargetedTests: 180s
  - runFullVitest: 300s
  - Shell kullanımı: `shell: true` (satır 398, 577) — Windows uyumu için
- ADR-008: ✅
- ADR-010: ✅
- ADR-033: ✅ — Tüm veriler lokal
- ADR-037 (RBAC): N/A — hook sistemi yetki kontrolü yapmıyor (plugin-loader'da)
- Memory V2: N/A

## 8. Test Coverage
- Test dosyası: `tests/core/plugin-hooks.test.ts` ✅
- CI Guardian testleri: CI regression check, pre-sprint validation, vitest output parse testleri beklenir
- **Not:** CI Guardian fonksiyonları büyük ve karmaşık — ayrı test dosyası olabilir.

## 9. TODO/FIXME/HACK Inventory
- Satır 257: `// Match lines like: path/to/file.ts(line,col): error TSXXXX: ...` — Bu bir yorum, TODO değil. ✅
- **Hiç TODO/FIXME/HACK yok.** ✅

## 10. Dead Code
- `clearHook(hook)`: Spesifik hook temizleme — test utility, kullanımda.
- Tüm CI Guardian fonksiyonları: Sprint lifecycle'da kullanılıyor.
- **P2 — hookRegistry global mutable state:** Modül seviyesi Map — singleton. Test arası temizlik `clearHooks()` ile yapılıyor.

## 11. Security
- **Dynamic import (satır 141):** `import(fileUrl)` — Plugin hook modüllerini yüklüyor. `validatePluginSecurity` gate'inden geçtikten sonra çağrılıyor. ✅
- `loadHookModule`: existsSync + import — TOCTOU var ama plugin yükleme nadir çağrılır.
- `runTscCheck`, `runTargetedTests`: `shell: true` — Windows uyumu. Process.platform check var. Argümanlar hardcoded veya internal — injection riski düşük.
- `readCiBaseline`, `resolveCiGuardianConfig`: JSON.parse without schema validation — internal dosyalar.
- **P2 — parseTscErrorFiles regex:** Regex `gm` flag ile — ReDoS riski düşük (TypeScript tsc çıktısı formatı bilinen).

## 12. Memory V2 Uyumu
- CI raporları `.brain/ci-report-{sprintId}.json` dosyasına yazılıyor — bu dosya-tabanlı, DB'ye yazılmıyor.
- Memory V2 migrasyonu dışında kalmış olabilir. Ancak CI raporları sprint metadata'sıdır, ADR/learning değil. Kabul edilebilir.

## 13. i18n
- Hata mesajları İngilizce: "[plugin-hooks] Hook ... callback threw", "[ci-guardian] Warning..."
- CI rapor formatı: JSON — dil bağımsız.
- `parseTscErrorFiles`: TypeScript compiler çıktısı İngilizce — locale-aware olması gerekmez.

## 14. Dokümantasyon Tutarlılığı
- JSDoc ↔ gerçek davranış: ✅ Genel olarak tutarlı.
- `runTscCheck` JSDoc "tsc --noEmit for TypeScript, stack-detected command for others" — doğru.
- `runPreSprintValidation` JSDoc 4-step süreci doğru anlatıyor.

## 15. Performance
- spawnSync çağrıları: runTscCheck (120s timeout), runTargetedTests (180s), runFullVitest (300s) — Sprint başlangıcında toplam ~10dk blokaj potansiyeli.
- Sync I/O: readFileSync ×4 (baseline, config, report), writeFileSync ×2, existsSync ×6, readdirSync ×1
- Hot path: Hayır — sprint lifecycle noktalarında çağrılır, sürekli değil.

## 16. Öneriler
- **P1 — Dosya bölünmesi:** 834 satır, iki bağımsız sorumluluk. Hook sistemi (~240 satır) ve CI Guardian (~590 satır) ayrı dosyalara taşınmalı: `plugin-hooks.ts` + `ci-guardian.ts`. Sprint 142+ refactor candidate.
- **P2 — CI rapor DB entegrasyonu:** CI raporları `.brain/*.json` dosyalarına yazılıyor — Memory V2 DB'ye migrate edilebilir. `store.insert({ type: 'ci_report', ... })`.
- **P2 — runFullVitest blocking:** Pre-sprint'te 300s timeout — büyük projelerde sprint başlangıcını geciktirir. Async/background option düşünülebilir.
- **P3 — coverage tracking:** `CiValidationResult.coverage` ve `CiReport.result.coverage` her zaman 0 (satır 618, 675, 812). Coverage parsing implementasyonu eksik.

## Verdict: ANALYZED
