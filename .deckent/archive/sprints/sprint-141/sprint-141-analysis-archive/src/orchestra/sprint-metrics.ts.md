# Analysis: src/orchestra/sprint-metrics.ts
**Task ID:** 140-002 | **LoC:** 610

## 1. Amaci
Sprint metriklerini hesaplayan, token kullanım tablolarını üreten ve sprint history karşılaştırması yapan modül. `sprint-reporter.ts`'ten extract edilmiş. `calculateMetrics()`, `buildTokenUsageSection()`, `formatTokenCount()`, `extractSprintNumber()` başlıca export'lar.

## 2. Public API
- `formatTokenCount(count): string`
- `buildTokenUsageSection(results?): string[]`
- `calculateMetrics(sprint, evaluations, results, debt?): SprintMetrics`
- `extractSprintNumber(sprintId): number | null`
- Ve sprint history, karşılaştırma fonksiyonları

## 3. Ic + Dis Bagimliliklar
- **Dis:** `node:fs`, `node:path`
- **Dis:** `../core/types.js` (TaskEvaluation, Sprint, SprintMetrics, DebtItem, TokenUsage)
- **Dis:** `../core/constants.js` (BRAIN_DIR, SPRINTS_DIR)
- **Dis:** `../core/utils.js` (debugLog)
- **Dis:** `./result-collector.js` (buildResultsMap)

## 4. Complexity
- 610 LoC, birden fazla export fonksiyon, cyclomatic ~15

## 5. Type Safety
- `(r): r is TaskResult & { tokenUsage: TokenUsage }` — type guard kullanımı ✓
- `result.stdout ?? ''` — güvenli optional chain ✓

## 6. ADR Compliance
- **ADR-001 (ESM):** ✓
- Sprint history okuma: `SPRINTS_DIR` dosyalarından — Memory V2 DB'den sorgulanabilir ⚠️
- `parseDebtTable` import: ADR-038 dead code audit — kullanımı kontrol edilmeli

## 7. Test Coverage
- `tests/orchestra/sprint-metrics.test.ts` bekleniyor

## 8. TODO/FIXME/HACK inventory
- Yok

## 9. Dead Code Candidates
- Sprint history dosya okuma fonksiyonları Memory V2 sonrası gereksiz

## 10. Security Findings
- Güvenli — yalnızca local dosya okuma

## 11. Memory V2 Uyumu
- Sprint history okuma: dosya tabanlı → Memory V2 DB'ye migrate et
- Token usage DB'de saklanmıyor — intentional (ephemeral per-sprint data)

## 12. Oneriler
- Sprint 142: sprint history → `store.searchMemory({ type: ['retro'] })`

## 13. Verdict: ANALYZED
