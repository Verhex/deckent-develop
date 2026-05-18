# Analysis: src/core/memory-import.ts
**Task ID:** 140-001 | **LoC:** 251

## 1. Amaci
Mevcut `.brain/` markdown dosyalarını V2 DB'ye migrate eder. `parseDecisionsMd()`, `parseMemoryMd()`, `parseDebtMd()` — her biri markdown parse edip `CreateEntryInput[]` döndürür. `extractKeywords()` tag extraction için kullanılır.

## 2. Public API (export listesi)
- `extractKeywords(text): string[]`
- `parseDecisionsMd(content): CreateEntryInput[]`
- `parseMemoryMd(content): CreateEntryInput[]`
- `parseDebtMd(content): CreateEntryInput[]`

## 3. İç + Dış Bağımlılıklar
- **İç**: `memory-types.ts` (CreateEntryInput)

## 4. Complexity
- `parseDecisionsMd()`: orta — regex + duplikat ID yönetimi
- `parseDebtMd()`: orta — pipe-delimited table parse
- Duplikat ADR-NNN handling (superseded + new version)

## 5. Type Safety
- `any` kullanımı: 0
- Optional chaining kullanımı iyi

## 6. ADR Compliance
- Sadece migration tool — ADR-008 v.b. uyum gerektirmiyor

## 7. Test Coverage
- `tests/core/memory-import.test.ts` mevcut

## 8. TODO/FIXME/HACK inventory
- Yok

## 9. Dead Code Candidates
- Migration bir kez çalışır. Ancak `rebuild` komutu için hala kullanılıyor — gerekli.

## 10. Security Findings
- `STOP_WORDS_EN`, `STOP_WORDS_TR` Set'leri — iyi pratik, XSS/injection riski yok

## 11. Memory V2 Uyumu
- V1 markdown → V2 DB migration pipeline ✅
- Duplikat ADR handling (v2 supersedes v1 relation) ✅
- `decay_exempt: status === 'accepted'` — ADR'ları decay'den korur ✅

## 12. Öneriler
- `extractKeywords()` max 15 kelimeyle kısıtlanmış — yeterli

## 13. Verdict: ANALYZED
