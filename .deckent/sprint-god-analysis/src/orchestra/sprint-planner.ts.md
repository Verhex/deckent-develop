# Analysis: src/orchestra/sprint-planner.ts
**Task ID:** 142-008 | **Model:** opus | **LoC:** 673 | **Effort:** max

## 1. Amacı (detaylı, 3-5 cümle — ne yapar, neden var, kim kullanır)
sprint-planner.ts, sprint planlama sürecinin tamamını barındırır. İki ana fonksiyon sağlar: `readContext()` brain bağlamını diskten/DB'den okur, `planSprint()` ise DIRECTIVES.md'yi parse ederek task JSON'ları oluşturur. Planlama 3 modda çalışır: AI (LLM-based), structured (kural-based, deterministik), auto (boyuta göre otomatik seçim). Planlama sırasında kritik borç önceliklendirmesi, deadlock kontrolü, agent seçimi (V1 keyword / V2 intent-based), skill ataması, evolved rule injection ve decision trail logging yapılır. Sprint 136'da sprint-controller.ts'den çıkarılmıştır. Brain'in planlama aklıdır — task'ların nasıl oluşturulacağını, kime atanacağını ve hangi model/skill ile çalıştırılacağını belirler.

## 2. Public API (her export'un tam signature + JSDoc var mı?)
**Functions (4):**
1. `readContext(projectRoot): BrainContext` — JSDoc: ✅ (satır 73-76)
2. `planSprint(projectRoot, config, context, recommendation, options?): Promise<Sprint>` — JSDoc: ✅ (satır 167-178)
3. `confirmDraftTasks(projectRoot, sprint): Promise<void>` — JSDoc: ✅ (satır 631-637)
4. `cleanupDraftTasks(projectRoot): void` — JSDoc: ✅ (satır 650-657)

## 3. İç Bağımlılıklar (import chain listesi, döngüsel bağımlılık riski var mı?)
**Import'lar (17 modül):**
- core: types, constants, memory-store, utils, provider, stack-detector, skill-pool, skill-selector, agent-pool, agent-selector, routing-engine, routing-types
- orchestra: sprint-utils, planner, model-selector, task-builder, sprint-lifecycle (BrainError)
- monitor: auditor (detectDeadlocks)

**Dynamic import'lar (4):**
- `./outcome-tracker.js` (satır 246, 375)
- `./decision-logger.js` (satır 505)
- `./temp-skill-generator.js` (satır 389, 399)

**Döngüsel risk:** Yok — sprint-planner.ts tek yönlü import. sprint-lifecycle.ts'den yalnızca BrainError import edilir.

## 4. Dış Bağımlılıklar
- `node:fs` (readFileSync, existsSync, mkdirSync, readdirSync, unlinkSync)
- `node:fs/promises` (writeFile)
- `node:path` (join)
- `node:child_process` (spawnSync)
- Üçüncü parti: **YOK** — ADR-010 UYUMLU

## 5. Complexity
- Fonksiyon sayısı: **4 exported**
- Max cyclomatic rough: **~45** (planSprint — AI/structured mode branching, V1/V2 routing, for döngüleri, dynamic imports, nested try/catch)
- En karmaşık fonksiyon: **planSprint()** (satır 179-629, **450 LoC**) — **İKİNCİ EN BÜYÜK FONKSİYON** (finalizeSprint'ten sonra)
- readContext: ~88 LoC, cyclomatic ~8

## 6. Type Safety
- `any`: **0**
- `@ts-ignore`: **0**
- `@ts-expect-error`: **0**
- `as unknown`: **0**
- Non-null `!`: **2** adet:
  - Satır 103: `retroEntries[0]!.content` — length check ile korunmuş ✅
  - Satır 117: `idEntry[0]!.content` — length check ile korunmuş ✅
- Unsafe cast:
  - Satır 130: `(d.priority?.toUpperCase() ?? 'NORMAL') as DebtPriority` — string→enum cast. priority DB'den gelen string — validasyon yok.
- Inline type assertion (satır 299): `import('../core/types.js').ModelType` — inline import tipi, TypeScript'te geçerli ama okunabilirliği düşürür.
- Satır 379: `const sampleDNA = classifyIntent(tasks[0]!)` — tasks boş olabilir mi? Guard: `tasks.length > 0` (satır 378).

## 7. ADR Compliance
- **ADR-006 (spawnSync):** ⚠️ 2 spawnSync kullanımı:
  - Satır 156: `spawnSync('git', ['status', '--porcelain'], ...)` — git status
  - Satır 159: `spawnSync('git', ['ls-files'], ...)` — dosya ağacı
  - Her ikisi de readContext'te — planlama sırasında proje durumu okuma. Meşru kullanım.
- **ADR-008 (brain import):** ✅ — sprint-planner.ts Brain alt modülü. `../monitor/auditor.js` import'u (detectDeadlocks) — ADR-008'e göre izinli mi? Auditor'dan planner'a import var — bu **ADR-008'e aykırı olabilir** (planner yalnızca core/ import etmeli).
- **ADR-010:** ✅
- **ADR-028 (V1→V2 Migration):** ✅ — V1 ve V2 routing paralel destekleniyor
- **ADR-037 (RBAC):** N/A — planner authority check yapmaz
- **Memory V2 DB-first:** ✅ **UYUMLU:**
  - readContext (satır 78-165): `existsSync(dbPath)` → `new MemoryStore(dbPath)` → `store.getByType('memory')`, `store.getByType('retro')`, `store.getByType('pattern')`, `store.getByType('adr')`, `store.getByType('identity')`, `store.getByType('debt')` — **TAMAMEN DB-FIRST** ✅
  - DB hatası durumunda "fall through to V1" yorum (satır 139) — ancak V1 fallback kodu satır 141'de "fields remain as empty strings/arrays" — fallback DEBT.md okuma YOK ✅. Bu bir "graceful degradation", V1 fallback değil.

## 8. Test Coverage
- `tests/orchestra/plan-improvements.test.ts` — planSprint testi
- `tests/orchestra/brain.test.ts` — planSprint dolaylı
- `tests/orchestra/dependency-pipeline.test.ts` — planSprint dependency
- **Eksik:** readContext DB-first path dedicated test (DB mevcut + hata durumu)
- **Eksik:** planSprint AI mode fallback (AI → structured) testi
- **Eksik:** planSprint V2 evolved rule injection testi
- **Eksik:** confirmDraftTasks + cleanupDraftTasks dedicated test

## 9. TODO/FIXME/HACK inventory
**0 — Temiz.**

## 10. Dead Code
- planSprint satır 352-358: AI planner >2x guard — bu kontrol satır 266-279'da da var. **DUPLICATE GUARD** — DRY ihlali.
- `cleanupDraftTasks` (satır 656-672): readFileSync + JSON.parse ile task okuma — sprint-utils.ts'deki readJsonSafe kullanılabilir.

## 11. Security
- **spawnSync kullanımı:** git komutları — güvenli, user input yok
- **MemoryStore açma/kapatma:** try/finally ile store.close() ✅ (satır 95-137)
- **JSON.parse:** readJsonSafe helper kullanılıyor (satır 151) — hata yakalama var ✅
- **Dynamic import'lar:** Lokal modüller — güvenli
- **Decision trail:** DecisionLogger → .deckent/decisions/ JSON dosya yazma — path injection riski yok

## 12. Memory V2 Uyumu
- ✅ **readContext TAMAMEN DB-FIRST** — memory, retro, pattern, ADR, identity, debt tümü MemoryStore'dan okunuyor
- ✅ DB hatası durumunda boş değerler döner (graceful degradation), eski .md parse'a fallback YOK
- ✅ `MEMORY_DB_FILE` constant kullanılıyor (satır 31)
- ⚠️ `store.getByType('debt')` → `d.metadata` JSON.parse — metadata formatı validasyonu yok (satır 123). Bozuk metadata → runtime hata.

## 13. i18n
- Hardcoded string: **0** (tüm mesajlar İngilizce debug log)
- readContext okuma sonuçları Türkçe içerik barındırabilir (ADR'ler, pattern'lar) — normalize edilmeli mi? N/A, bu okuma katmanı.

## 14. Dokümantasyon Tutarlılığı
- JSDoc'lar 4 fonksiyon için mevcut ve **doğru** ✅
- planSprint JSDoc: "Handles critical debt priority fixes, AI planner with structured fallback, deadlock detection, agent selection, and skill assignment" — **DOĞRU** ✅
- readContext JSDoc: "Read the full brain context from disk" — DB-first olduğunu belirtmiyor, **GÜNCELLENMELİ** (P3)

## 15. Performance
- **Sync I/O sayımı:**
  - `readFileSync`: 1 (satır 663 — cleanupDraftTasks)
  - `existsSync`: 3 (satır 93 dbPath, satır 148 tasksDir, satır 658 tasksPath)
  - `mkdirSync`: 1 (satır 609 tasksDir)
  - `readdirSync`: 2 (satır 149, satır 659)
  - `unlinkSync`: 1 (satır 666 draft cleanup)
  - `spawnSync`: 2 (satır 156 git status, satır 159 git ls-files)
- **Toplam sync I/O: 10** — readContext sıcak yolda (her sprint başında 1 kez). 2 spawnSync blocking.
- **Async writeFile:** Satır 615 — task dosyası yazma async ✅
- **Hot path:** readContext — MemoryStore açma + 6 getByType sorgusu. SQLite sorguları hızlı (<1ms each).
- **planSprint:** O(n × routing) — n task × routing hesabı. V2'de routeTaskV2 per-task → O(n × agents × skills) — büyük agent/skill havuzlarında darboğaz olabilir.

## 16. Öneriler (severity P0-P3, Sprint 142+ input, somut aksiyon)
1. **P0 — planSprint 450 LoC:** İkinci en büyük fonksiyon. V2 routing bloğu (satır 363-532, ~170 LoC) ayrı fonksiyona çıkarılmalı (extractV2RoutingPipeline).
2. **P1 — ADR-008 ihlali:** `../monitor/auditor.js` import'u (detectDeadlocks). Planner yalnızca core/ import etmeli. detectDeadlocks core/'a taşınmalı veya sprint-lifecycle.ts üzerinden erişilmeli.
3. **P2 — Duplicate >2x guard:** Satır 266-279 ve satır 352-358 aynı kontrolü yapıyor. İlk guard yeterli, ikincisi kaldırılabilir.
4. **P2 — metadata JSON.parse validasyonu:** Satır 123 `JSON.parse(d.metadata || '{}')` — bozuk metadata hataya neden olur. try/catch veya Zod validation ekle.
5. **P2 — readContext JSDoc:** "from disk" → "from SQLite DB (.brain/memory.db) with graceful degradation" olarak güncellenmeli.
6. **P3 — cleanupDraftTasks readFileSync:** readJsonSafe helper kullanılabilir, readFileSync + JSON.parse yerine.
7. **P3 — readContext spawnSync:** git status/ls-files async alternatifle değiştirilebilir.

## Verdict: ANALYZED
