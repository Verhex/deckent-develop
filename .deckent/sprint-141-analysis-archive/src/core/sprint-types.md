# Analysis: src/core/sprint-types.ts
**Task ID:** 140-001 | **LoC:** ~200

## 1. Amaci
Sprint lifecycle, metrikleri, teknik borç ve brain context tip tanımları. `Sprint`, `SprintMetrics`, `SprintResult`, `DebtItem`, `DebtPriority`, `BrainContext` içerir.

## 2. Public API (export listesi)
- `SprintPhase` enum (8 faz + TRANSITION + COMPLETE)
- `SprintStatus` enum
- `Sprint`, `SprintMetrics`, `SprintResult`
- `DebtPriority` enum, `DebtItem`
- `BrainContext`

## 3. İç + Dış Bağımlılıklar
- **İç**: `task-types.ts` (Task, TaskEvaluation, ModelType)

## 4. Complexity
- Fonksiyon: 0 (pure types + enums)

## 5. Type Safety
- Mükemmel

## 6. ADR Compliance
- `SprintPhase.DIRECTIVE` → DIRECTIVES.md phase eklenmiş ✅
- `totalInputTokens/OutputTokens/CacheReadTokens` SprintMetrics'te — token tracking ✅

## 7. Test Coverage
- Tip dosyası — compile-time

## 8. TODO/FIXME/HACK inventory
- Yok

## 9. Dead Code Candidates
- `Sprint.rolledBack`, `Sprint.rollbackResult` — rollback pipeline aktif olmadıkça kullanılmıyor
- `BrainContext` — memory V2 ile bu context nasıl populate edildiği kontrol edilmeli

## 10. Security Findings
- Yok

## 11. Memory V2 Uyumu
- `BrainContext` — memory/patterns/debt içeriyor. V2 DB'den nasıl populate ediliyor? (sprint-controller.ts'de)

## 12. Öneriler
- `SprintMetrics.contextLinesUsed` — Memory V2 sonrası bu alan anlamsız hale gelebilir (satır yerine entry count)

## 13. Verdict: ANALYZED
