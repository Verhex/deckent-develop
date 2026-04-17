# Analysis: src/core/memory-query.ts
**Task ID:** 140-001 | **LoC:** 379

## 1. Amaci
Memory V2 için dual-layer FTS5 arama motoru. Orijinal metin sütunları (title, content vb.) ve normalize edilmiş sütunlar (title_norm vb.) üzerinde OR ile FTS5 MATCH çalıştırır. Türkçe/İngilizce/Almanca %100 recall sağlar. `buildAutoQuery()` ile Brain lifecycle entegrasyonu yapar.

## 2. Public API (export listesi)
- `searchMemory(store, params): MemorySearchResult[]`
- `buildAutoQuery(taskKeywords, taskScope, opts?): MemoryQueryParams`

## 3. İç + Dış Bağımlılıklar
- **İç**: `memory-store.ts` (MemoryStore, getRawDb), `memory-normalize.ts` (turkishNormalize), `memory-types.ts`

## 4. Complexity
- `searchMemory()`: routing — FTS ya da structured
- `ftsSearch()`: yüksek — dual-layer FTS5 query, snippet extraction
- `structuredSearch()`: orta — filter builder + pagination
- `buildFilterClauses()`: orta — 5 filter tipi, parameterik SQL

## 5. Type Safety
- `any` kullanımı: **2** — `db: any` parametreleri (ftsSearch/structuredSearch) `// eslint-disable-next-line`
- `@ts-ignore`: 0
- Non-null assertion: 1 (`params.text!`)

## 6. ADR Compliance
- **Memory V2**: Dual-layer FTS5 arama — UYUMLU ✅
- **ADR-001** (ESM): UYUMLU

## 7. Test Coverage
- `tests/core/memory-query.test.ts` mevcut

## 8. TODO/FIXME/HACK inventory
- `db: any` parametresi — better-sqlite3'ün Database type'ını doğrudan almak yerine raw DB alınıyor. Teknik borç.

## 9. Dead Code Candidates
- `buildTagsContainClause()` — structured search path için kullanılıyor ✅
- `pickBestSnippet()` — FTS path için snippet seçimi ✅

## 10. Security Findings
- FTS5 query escaping (`escapeFts5Query()`) implementasyonu var — SQL injection riski minimize
- `params.text` doğrudan FTS MATCH'e geçmeden escape ediliyor ✅

## 11. Memory V2 Uyumu
- Dual-layer arama (original + turkish normalized): ✅
- `buildAutoQuery()` Task DNA → Memory query dönüşümü: ✅
- Snippet extraction (FTS5 snippet() fonksiyonu): ✅

## 12. Öneriler
- `db: any` → `Database` tipine değiştirilmeli. `better-sqlite3` tipi import edilmeli.
- `min_score` parametresi implement edilmemiş (MemoryQueryParams'da var ama filtreleme yok) — Sprint 142 debt

## 13. Verdict: ANALYZED
