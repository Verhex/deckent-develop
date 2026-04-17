# Analysis: src/core/utils.ts
**Task ID:** 140-001 | **LoC:** 340

## 1. Amaci
Projede kullanılan utility fonksiyonlarını barındırır: `debugLog()`, `readFileSafe()`, `readJsonSafe()`, `readJsonSafeAsync()`, `getNextSprintId()`, `updateLastSprintId()`, `parseSprintNumber()`, `shouldRemoveResolvedDebt()`, `parseDebtTable()` (deprecated), `generateDebtTable()` (deprecated), `ensureDeckentImport()`, i18n tarihi/süre/göreceli zaman formatlama.

## 2. Public API (export listesi)
- `debugLog()`, `readFileSafe()`, `readJsonSafe<T>()`, `readJsonSafeAsync<T>()`
- `getNextSprintId()`, `updateLastSprintId()`, `parseSprintNumber()`
- `shouldRemoveResolvedDebt()`
- `parseDebtTable()` **@deprecated**
- `generateDebtTable()` **@deprecated**
- `ensureDeckentImport()`
- `formatDate()`, `formatDuration()`, `formatRelativeTime()`

## 3. İç + Dış Bağımlılıklar
- **Dış**: `node:fs`, `node:fs/promises`, `node:path`
- **İç**: `constants.ts` (BRAIN_DIR, SPRINTS_DIR, DEBT_TABLE_HEADER, vb.), `types.ts` (DebtItem, DebtPriority)

## 4. Complexity
- Fonksiyon sayısı: ~14 export
- `getNextSprintId()` orta — 2 kaynak okur, max alır
- `parseDebtTable()` orta — satır bazlı parse
- `appendToErrorsFile()` (private) — ERRORS.md'ye yazar

## 5. Type Safety
- `any` kullanımı: 0
- `@ts-ignore`: 0
- Non-null assertion: `match?.[1]` gibi optional chaining tercih edilmiş — GÜVENLİ

## 6. ADR Compliance
- **ADR-009** (DEBT.md Markdown Format): `parseDebtTable/generateDebtTable` bu ADR'ı uygular ama @deprecated
- **ADR-001** (ESM): UYUMLU

## 7. Test Coverage
- `tests/core/utils.test.ts` mevcut

## 8. TODO/FIXME/HACK inventory
- Yok

## 9. Dead Code Candidates
- `parseDebtTable()` — `@deprecated`, Memory V2'de SQLite kullanılıyor. Sprint 142'de kaldırılabilir.
- `generateDebtTable()` — aynı şekilde `@deprecated`
- `countBrainLines()` fonksiyonu — exports içinde YOK ✅ (Memory V2 geçişinde başarıyla kaldırılmış)

## 10. Security Findings
- `readFileSafe()` → dosya yolu validasyonu yok ama internal kullanım — düşük risk
- `appendToErrorsFile()` → VITEST/NODE_ENV=test guard var — test ortamı koruması sağlanmış

## 11. Memory V2 Uyumu
- `countBrainLines()` artık MEVCUT DEĞİL — Memory V2 geçişi başarılı ✅
- `parseDebtTable/generateDebtTable` hala kodda ama `@deprecated` işaretli ✅
- `appendToErrorsFile()` — `.brain/ERRORS.md`'ye yazmaya devam ediyor (bu bir exception — ERRORS.md hala dosya tabanlı)

## 12. Öneriler
- Sprint 142: `parseDebtTable`, `generateDebtTable` kaldırılabilir — tüm çağrı yerleri kontrol edilmeli
- `index.ts` hala bunları export ediyor — index.ts'den de kaldırılmalı

## 13. Verdict: ANALYZED
