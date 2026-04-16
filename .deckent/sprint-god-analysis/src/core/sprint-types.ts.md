# Analysis: src/core/sprint-types.ts
**Task ID:** 142-002 | **Model:** opus | **LoC:** 144 | **Effort:** max

## 1. Amaci
Sprint yaşam döngüsü tipleri. Sprint, SprintMetrics, SprintResult, DebtItem, DecayResult, BrainContext, ProjectState, ve SprintSizeRecommendation tanımlar. Brain'in sprint planlaması, evaluasyonu, retro yazımı, ve decay mekanizması bu tipleri kullanır. Ayrıca eski Memory V1 tipleri (MemoryEntry, PatternEntry) hâlâ burada yaşıyor — geriye dönük uyum.

## 2. Public API
### Enums (3):
- `SprintPhase` — 10 faz (DIRECTIVE→COMPLETE). BOOT.md'de 8 faz yazılı, burada 10 enum üyesi var (DIRECTIVE + TRANSITION ekstra).
- `SprintStatus` — 8 durum (PLANNING→ABORTED)
- `DebtPriority` — NORMAL, HIGH, CRITICAL

### Interfaces (10):
- `Sprint` — id, number, status, phase, tasks, workers, metrics, rollback bilgisi
- `SprintMetrics` — token usage dahil 14+ field
- `SprintResult` — sprint + evaluations Map + metrics
- `DebtItem` — id, description, originTaskId, priority, resolved
- `MemoryEntry` — **V1 legacy** (content, addedInSprint, sprintsSinceLastUse)
- `PatternEntry` — pattern, occurrences, firstDetected, resolved
- `DecayResult` — linesBefore/After, archivedSprints, removedDebt/Pattern
- `BrainContext` — directives, memory, retro, debt, patterns, decisions, existingTasks
- `ProjectState` — gitStatus, fileTree
- `SprintSizeRecommendation` — size, maxWorkers, modelConstraint, reason

JSDoc: Enum'larda yok, interface field'larında kısmen var. **EKSIK:** SprintPhase enum üyelerine JSDoc yok.

## 3. Ic Bagimliliklar
- `./task-types.js` — Task, TaskEvaluation, ModelType (type-only import)

Döngüsel bağımlılık riski: **YOK** — tek yönlü bağımlılık.

## 4. Dis Bagimliliklar
Hiçbir dış bağımlılık yok. ADR-010 uyumlu.

## 5. Complexity
Fonksiyon sayısı: 0. Sadece tip tanımları. Cyclomatic: 0.

## 6. Type Safety
- `any`: 0
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- `as unknown`: 0
- Non-null `!`: 0

Tamamen temiz. `SprintResult.evaluations` Map<string, TaskEvaluation> — doğru kullanım.

## 7. ADR Compliance
- **ADR-006 (spawnSync):** N/A
- **ADR-008 (brain import):** N/A — type-only
- **ADR-010 (tek runtime dep):** Uyumlu
- **Memory V2 DB-first:** **UYUMSUZLUK:**
  - `MemoryEntry` (satır 96-101): V1 memory tipi hâlâ mevcut — DB-first dünyada bu kullanılıyor MU? decision-types.ts'in PatternEntry import ettiği görülüyor, yani hâlâ referans ediliyor.
  - `DecayResult` (satır 112-118): `linesBefore/linesAfter` — satır bazlı decay V1 paterni. V2 DB'de entry-bazlı decay var. Bu interface V1 kalıntısı mı?
  - `BrainContext.memory/retro/patterns/decisions` hepsi `string` — V2'de bunlar DB'den gelir ama export .md string'leri olarak mı inject ediliyor?

## 8. Test Coverage
- Doğrudan `sprint-types.test.ts` MEVCUT DEĞİL
- `tests/core/types.test.ts` ve `types-split.test.ts` barrel üzerinden dolaylı test edebilir
- **EKSİK:** Enum değer doğrulaması, DecayResult interface, SprintSizeRecommendation için dedicated test yok

## 9. TODO/FIXME/HACK inventory
Hiçbir TODO/FIXME/HACK bulunmadı.

## 10. Dead Code
- **`MemoryEntry`** (satır 96-101): V1 legacy. Memory V2 dünyada `MemoryEntryV2` (memory-types.ts) kullanılıyor. Bu interface'in hâlâ kullanılıp kullanılmadığı kontrol edilmeli. **P2 — potansiyel dead code.**
- **`PatternEntry`** (satır 103-109): decision-types.ts'den import ediliyor. Aktif kullanımda.
- **`DecayResult`** (satır 112-118): `linesBefore/linesAfter` V1 satır-bazlı decay konsepti. V2'de `store.decay()` entry-bazlı çalışır. Bu interface adapt edilmiş mi yoksa V1 kalıntısı mı? **P2 — kontrol gerekli.**
- **`BrainContext`** (satır 121-131): Aktif kullanımda (planner, sprint-controller).

## 11. Security
Güvenlik riski yok — saf tip tanımı.

## 12. Memory V2 Uyumu
- **MemoryEntry vs MemoryEntryV2:** İki ayrı memory entry interface var. `MemoryEntry` (burada) vs `MemoryEntryV2` (memory-types.ts). V2 DB schema'ya map eden `MemoryEntryV2`'dir. `MemoryEntry` V1 kalıntısı.
- **BrainContext:** `memory`, `retro`, `patterns`, `decisions` hepsi string. DB-first dünyada bunlar `MemoryStore.getByType()` çıktısından formatted markdown olarak üretiliyor. String tipi geçerli ama `DebtItem[]` array iken diğerleri string — tutarsız (debt yapısal, geri kalan flat string).
- **DecayResult:** `linesBefore/linesAfter` — V2 decay `removedCount` gibi entry-bazlı metrik döndürmeli. Bu interface V1 kalıntısı hissi veriyor. `archivedSprints`, `removedDebtCount`, `removedPatternCount` DB decay'de de mantıklı ama `linesBefore/After` değil.

## 13. i18n
- Tüm enum string değerleri İngilizce — doğru, locale-agnostic (PLANNING, ACTIVE, vb.)
- Sprint/task identifier'lar İngilizce — uygun

## 14. Dokumantasyon Tutarliligi
- **SprintPhase 10 üye vs BOOT.md 8 faz:** BOOT.md şunları listeler: PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→DECAY→CLEANUP. Enum'da DIRECTIVE ve TRANSITION fazları ekstra var, CLEANUP yok. **P1 TUTARSIZLIK.**
- **SprintPhase.COMPLETE** var ama lifecycle'da CLEANUP listelenmiş — COMPLETE = CLEANUP sonrası mı? Dokümante edilmemiş.
- DECKENT.md Sprint Lifecycle tablosu da 8 faz listeler — enum ile uyumsuz.

## 15. Performance
Sıfır runtime maliyeti — tamamen tip tanımı.

## 16. Oneriler
| # | Severity | Öneri |
|---|----------|-------|
| 1 | P1 | SprintPhase enum (10 üye) ile BOOT.md/DECKENT.md (8 faz) tutarsızlığını çöz — DIRECTIVE, TRANSITION, CLEANUP farkı |
| 2 | P2 | `MemoryEntry` V1 kalıntısını kullanım analizi yap — kullanılmıyorsa `@deprecated` işaretle |
| 3 | P2 | `DecayResult.linesBefore/After` V2 DB decay ile uyumlu mu kontrol et |
| 4 | P2 | `BrainContext` debt=DebtItem[] iken memory/retro=string tutarsızlığını dokümante et |
| 5 | P3 | SprintPhase enum üyelerine JSDoc ekle (her fazın ne zaman aktif olduğu) |

## Verdict: ANALYZED
