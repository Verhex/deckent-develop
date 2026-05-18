# Analysis: src/core/memory-store.ts
**Task ID:** 140-001 | **LoC:** 621

## 1. Amaci
Memory V2'nin SQLite DB katmanı. `better-sqlite3` üzerinde FTS5 full-text search, tags, relations, field-level history tracking ve soft-delete/decay lifecycle sağlar. **Tek gerçeklik kaynağı (single source of truth).**

## 2. Public API (export listesi)
- `MemoryStore` class:
  - `insert(input: CreateEntryInput): void`
  - `upsert(input: CreateEntryInput, changedBy: string): void`
  - `getById(id, opts?): MemoryEntryV2 | null`
  - `getByType(type: string): MemoryEntryV2[]`
  - `getTagsForEntry(entryId): string[]`
  - `getByTags(tags): MemoryEntryV2[]`
  - `getRelationsFrom/To(entryId): EntryRelation[]`
  - `getHistory(entryId): EntryHistoryRecord[]`
  - `softDelete(id, changedBy): void`
  - `restore(id, changedBy): void`
  - `decay(currentSprintNum, decayAfterSprints): { deletedCount: number }`
  - `countByType(): Map<string, number>`
  - `totalCount(): number`
  - `getSchemaVersion(): number`
  - `close(): void`
  - `getRawDb(): DatabaseType`

## 3. İç + Dış Bağımlılıklar
- **Dış**: `better-sqlite3` (runtime dependency)
- **İç**: `memory-normalize.ts` (turkishNormalize), `memory-types.ts` (MemoryEntryV2, CreateEntryInput, EntryRelation, EntryHistoryRecord)

## 4. Complexity
- Constructor + initSchema: yüksek (schema creation, FTS5 tablo, 3 trigger, 8 index)
- `insert()`: orta (transaction + tag + relation + history)
- `upsert()`: yüksek (diff compute + transaction + replace tags + history)
- `decay()`: düşük

## 5. Type Safety
- `any` kullanımı: 0 (tüm SQL sonuçları typed interface'e cast edilmiş)
- `@ts-ignore`: 0
- Non-null assertion: `!` sınırlı kullanım, hepsi güvenli

## 6. ADR Compliance
- **Memory V2 (ADR-040)**: Tam uyumlu — DB-first, FTS5, dual-layer normalize ✅
- **ADR-001** (ESM): UYUMLU

## 7. Test Coverage
- `tests/core/memory-store.test.ts` mevcut ve kapsamlı

## 8. TODO/FIXME/HACK inventory
- Yok

## 9. Dead Code Candidates
- `getRawDb()` — memory-query.ts tarafından kullanılıyor, zorunlu

## 10. Security Findings
- SQL injection riski: `better-sqlite3` parametrik sorgular kullanıyor — GÜVENLİ
- `getRawDb()` ile ham DB erişimi açık — iç kullanım sınırlandırılmalı (private yapılabilir)

## 11. Memory V2 Uyumu
- Schema: 5 tablo + FTS5 virtual table + 3 trigger + 8 index ✅
- `turkishNormalize()` ile dual-layer FTS5 entegrasyonu ✅
- WAL mode aktif (`PRAGMA journal_mode = WAL`) — yüksek concurrency güvenliği ✅
- `foreign_keys = ON` ✅
- Decay mekanizması: sprint_num tabanlı soft-delete ✅

## 12. Öneriler
- `getRawDb()` — `package:private` veya sadece `memory-query.ts`'e yönlendirilmeli
- Partial index (`idx_entries_active`) — `createIndexIfNotExists` ile güvenli ekleniyor ✅

## 13. Verdict: ANALYZED
