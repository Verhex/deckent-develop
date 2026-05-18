# Analysis: src/orchestra/sprint-utils.ts
**Task ID:** 142-013 | **Model:** opus | **LoC:** 361 | **Effort:** max

## 1. Amaci
Sprint lifecycle yardımcı fonksiyonları — sprint-controller.ts God Object Split Phase 2 (Sprint 075) sırasında ayrıştırılmış. Dosya sınıflandırma (isDocTask, isSourceCodeDir), provider çözümleme (resolveTaskProvider, getDefaultProvider), sprint state persistence (read/write/clear), orphan worker tespiti (detectOrphanWorkers), subprocess log okuma ve DIRECTIVES parsing (extractGoNogoCriteria) fonksiyonlarını içerir. Minimal state bağımlılığı hedeflenmiş — pure utility fonksiyonlar.

## 2. Public API
Her export'un signature'ı:
- `readFileSafe(filePath: string): string` — dosya oku, hata → boş string
- `now(): string` — ISO 8601 timestamp
- `isSourceCodeDir(dir: string): boolean` — src/tests/lib kontrolü
- `isDocTask(task: Task): boolean` — tüm scope'lar non-source mu?
- `isStaleTaskFile(filePath: string, maxAgeMs?: number): boolean` — dosya eskimiş mi?
- `isTmuxProvider(providerName: ProviderName): boolean` — 'claude' == tmux
- `resolveMaxWorkersNumeric(config, systemProfile?): number` — 'auto' → sayı
- `resolveDefaultUsageCli(): string | undefined` — CLI binary yolu
- `getDefaultProvider(): ProviderAdapter | null` — registry default
- `resolveTaskProvider(task: Task): ProviderName` — task → provider
- `getProviderAdapterForTask(providerName: ProviderName): ProviderAdapter | null` — adapter al
- `getSubprocessWorkerLogPath(projectRoot, taskId): string` — log dosya yolu
- `readSubprocessWorkerLog(projectRoot, taskId): string | null` — log oku
- `hasSubprocessWorkerLog(projectRoot, taskId): boolean` — log var mı?
- `writeSprintState(projectRoot, sprint): void` — state persist et
- `readSprintState(projectRoot): SprintState | null` — state oku
- `clearSprintState(projectRoot): void` — state temizle
- `detectOrphanWorkers(projectRoot): string[]` — orphan tmux pencerelerini bul
- `buildSpawnRetryHint(error, sprint): string` — hata analiz önerisi
- `extractGoNogoCriteria(description, testTarget?): { goCriteria, noGoCriteria, techDebtAcceptable }`
- `SprintState` interface — export
- `PAUSE_STATE_FILE`, `SPRINT_STATE_FILE` — const export
- JSDoc: **KISMEN** — bazı fonksiyonlar JSDoc'lu, bazıları değil

## 3. Ic Bagimliliklar
- `../core/types.js` → `getProviderForModel, Task, Sprint, SystemProfile, ResolvedConfig, ModelType, ProviderName`
- `../core/constants.js` → `TASKS_DIR`
- `../core/utils.js` → `readJsonSafe, debugLog`
- `../core/model-registry.js` → `modelRegistry`
- `../core/system-profile.js` → `getSystemProfile`
- `../core/provider.js` → `providerRegistry, ProviderError, ProviderAdapter`
- `./tmux.js` → `listWorkers`
- **ADR-008 DİKKAT:** tmux.js import'u var (satır 31). Bu modül "pure utility" olarak tanımlanmış ama tmux bağımlılığı var. Brain dışında tmux import etmek ADR-008'e potansiyel aykırılık. Ancak `detectOrphanWorkers` brain tarafından çağrılıyor, dolaylı olarak uyumlu.
- Döngüsel bağımlılık riski: **DÜŞÜK** — tmux → sprint-utils yok ise güvenli

## 4. Dis Bagimliliklar
- `node:fs` → `readFileSync, existsSync, writeFileSync, mkdirSync, unlinkSync, statSync`
- `node:path` → `join`
- ADR-010 uyumu: **UYUMLU** — sadece Node.js built-in

## 5. Complexity
- Fonksiyon sayısı: 19 (+ 2 constant export + 1 interface)
- Max cyclomatic: `extractGoNogoCriteria` ~7 (for loop, 2 regex test, 2 if, slice)
- En karmaşık fonksiyon: `extractGoNogoCriteria` (satır 322-361)
- İkinci karmaşık: `resolveTaskProvider` (satır 151-165) — 2 nested try/catch
- Genel: **ORTA** — çok sayıda fonksiyon ama her biri küçük

## 6. Type Safety
- `any`: 0 (satır 277 "any" kelimesi yorum içinde — tip değil)
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- `as unknown`: 0
- Non-null `!`: 0
- Unsafe cast: Satır 123 — `as ModelType` cast, ama fallback olarak varsayılan model. Güvenli.
- `import('...')` dynamic type (satır 216) — TypeScript import type, runtime yok, güvenli
- Genel: **İYİ** — tek bir soft cast

## 7. ADR Compliance
- **ADR-006 (spawnSync):** N/A — spawn kullanmıyor
- **ADR-008 (brain import):** DİKKAT — `./tmux.js` import'u var (satır 31). Modül "pure utility" claim ediyor ama tmux bağımlılığı sprintcontroller domain'ine ait. `detectOrphanWorkers` fonksiyonu brain context'te çağrılıyor — dolaylı uyum sağlanıyor ama architekturel olarak tmux bağımlılığı `sprint-controller.ts` veya `sprint-spawner.ts`'e taşınabilir.
- **ADR-010:** UYUMLU
- **ADR-022:** N/A — internal
- **ADR-033:** UYUMLU
- **ADR-037:** N/A
- **ADR-039:** N/A
- **Memory V2 DB-first:** **DİKKAT** — bu modül Memory V2 ile doğrudan etkileşim yok, ama sprint state'i disk'e yazıyor (SPRINT_STATE_FILE). Bu DB-first kuralının dışında — sprint state henüz DB'de saklanmıyor. Sprint state → DB migration konusu olabilir.

## 8. Test Coverage
- **DEDICATED test dosyası YOK** — `tests/orchestra/sprint-utils.test.ts` MEVCUT DEĞİL
- Dolaylı test: sprint-controller.test.ts, sprint-finalizer.test.ts, sprint-lifecycle.test.ts vs. import ediyor
- **EKSİK:** 19 public fonksiyonun hiçbiri dedicated test'e sahip değil
- Özellikle `extractGoNogoCriteria`, `detectOrphanWorkers`, `buildSpawnRetryHint` edge case testleri eksik
- **P1 SEVİYE TEST GAP**

## 9. TODO/FIXME/HACK inventory
Hiç TODO/FIXME/HACK yok.

## 10. Dead Code
- `PAUSE_STATE_FILE` — kullanılıyor mu?
  - `grep PAUSE_STATE src/` → export ediliyor ama kullanıcı araması gerekli
  - Sprint pause özelliği aktif ise kullanılıyordur, ancak doğrulanmalı
- `readFileSafe` — çok generic, sadece sprint-planner import ediyor
- `hasSubprocessWorkerLog` — kullanılıyor mu? Doğrulanmalı.
- `getDefaultProvider` — sadece test'lerde veya dolaylı kullanım olabilir
- `resolveDefaultUsageCli` — usage tracking için, doğrulanmalı

## 11. Security
- `readFileSafe` — herhangi bir dosya okuyabilir, path traversal koruması yok. Ama çağıranlar güvenli path üretiyor.
- `readJsonSafe` — JSON.parse hatası try/catch ile yakalanıyor ✅
- `resolveTaskProvider` — bilinmeyen model'de `ProviderError` fırlatıyor (throw), bu doğru davranış
- `writeSprintState` — `mkdirSync({ recursive: true })` — path injection olabilir ama `projectRoot` güvenli kabul ediliyor
- Secret exposure: Yok

## 12. Memory V2 Uyumu
- Memory V2 ile doğrudan etkileşim YOK
- Sprint state disk'te saklanıyor (JSON dosya) — DB'ye migration yapılmamış
- `readFileSafe` sadece dosya okuyor — DB-first kuralına aykırı değil (generic utility)
- `extractGoNogoCriteria` DIRECTIVES.md parsing — bu file-based, DB'de değil (doğru — DIRECTIVES aktif dosya)

## 13. i18n
- `buildSpawnRetryHint` tüm hata mesajları İngilizce hardcoded (satır 297-310)
- `extractGoNogoCriteria` Turkish keywords destekliyor: "Kanıt", "Doğrulama" (satır 332) ✅
- Regex'te "Kanit" ve "Kanıt" — iki varyant (ASCII vs Unicode ı) ✅
- i18n hybrid: DIRECTIVES parsing'de TR/EN, hata mesajlarında sadece EN
- Severity: **P3**

## 14. Dokumantasyon Tutarliligi
- JSDoc: **KISMEN** — 19 fonksiyonun ~10'unda JSDoc var
- Modül başı yorum (satır 1-3) God Object Split Phase 2 referansı ✅
- `@internal` annotation'lar doğru kullanılmış (satır 79, 94, 119, 150, 172)
- `SOURCE_CODE_PREFIXES` — Windows path desteği (`src\\`) ama macOS/Linux'ta test edilebilir mi?

## 15. Performance
- Sync I/O sayısı: `readFileSync` × 2, `existsSync` × 4, `writeFileSync` × 1, `mkdirSync` × 1, `unlinkSync` × 1, `statSync` × 1
- Toplam 10 sync I/O çağrısı
- Hot path: `readFileSafe`, `isDocTask` sprint planlama sırasında çağrılabilir ama task sayısı sınırlı
- `detectOrphanWorkers` → `listWorkers()` → tmux ls komutu çalıştırır — sync subprocess, ama sprint başlangıcında bir kere
- Gereksiz I/O: `writeSprintState` → `mkdirSync` her yazma'da — `.deckent/` zaten var
- Overall: **KABUL EDİLEBİLİR** — sprint lifecycle one-shot operations

## 16. Oneriler
- **P1:** Dedicated test dosyası (`tests/orchestra/sprint-utils.test.ts`) oluşturulmalı — 19 public fonksiyon test edilmemiş
- **P2:** tmux.js import'u (satır 31) `detectOrphanWorkers` fonksiyonu ile sınırlı — bu fonksiyon ayrı bir modüle çıkarılabilir veya dependency injection kullanılabilir
- **P2:** `PAUSE_STATE_FILE` kullanım doğrulaması gerekli — dead code olabilir
- **P3:** `SOURCE_CODE_PREFIXES` Windows path desteği (`src\\`) testlenmeli
- **P3:** `extractGoNogoCriteria` regex'leri daha strict yapılabilir — şu an çok geniş pattern

## Verdict: ANALYZED
