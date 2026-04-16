# Analysis: src/cli/helpers/recommendations.ts
**Task ID:** 142-023 | **Model:** opus | **LoC:** 97 | **Effort:** max

## 1. Amaç
Sprint sonrası öneri motoru. Sprint metriklerini, task değerlendirmelerini ve agent performansını analiz ederek önceliklendirilmiş öneriler üretir. `doctor.ts`, `init.ts`, MCP `doctor` tool ve CI reporter tarafından kullanılır. NO_GO fix, tech debt uyarı, agent performans, coverage regresyon ve tam başarı olmak üzere 5 kontrol noktası içerir.

## 2. Public API
- `interface Recommendation { type, message, priority }` — JSDoc YOK
- `interface RecommendationInput { metrics, evaluations, agentPerformance, previousCoverage? }` — JSDoc YOK
- `class RecommendationEngine` — JSDoc YOK
  - `generate(input): Recommendation[]` — JSDoc YOK, EKSIK

## 3. İç Bağımlılıklar
- `../../core/types.js` → `SprintMetrics`, `TaskEvaluation`
- `./agent-performance.js` → `AgentStats`
- Döngüsel bağımlılık riski: YOK (tek yönlü core→cli)

## 4. Dış Bağımlılıklar
Hiçbir dış bağımlılık yok. ADR-010 uyumu: TAM ✓

## 5. Complexity
- Fonksiyon sayısı: 6 (1 public + 5 private)
- Max cyclomatic: ~3 (checkNoGoFixes — for + if)
- En karmaşık fonksiyon: `checkAgentSuggestions` (satır 61) — filter + map + conditional push

## 6. Type Safety
- `any` sayısı: 0 ✓
- Evaluations tipi: `Map<string, TaskEvaluation | string>` — string union güvenli ✓
- `MAX_RECOMMENDATIONS` const: 5 — type-safe ✓
- Tip güvenliği: İYİ

## 7. ADR Compliance
- ADR-006: N/A ✓
- ADR-008: N/A (brain import yok, sadece core/types) ✓
- ADR-010: TAM uyum ✓
- ADR-022: `doctor` CLI ve MCP'de var, recommendation engine her ikisinde de kullanılıyor ✓
- Memory V2: N/A (DB ile etkileşim yok)

## 8. Test Coverage
- Test dosyası: `tests/cli/helpers/recommendations.test.ts` MEVCUT ✓
- Kritik test senaryoları: boş evaluation, tüm NO_GO, mixed results, coverage regresyon eşik değeri

## 9. TODO/FIXME/HACK Inventory
Hiç yok ✓

## 10. Dead Code
- Tüm public API aktif olarak kullanılıyor (doctor, init, MCP doctor, CI reporter)
- `checkAllDone` metodu: "All tasks completed" mesajı — çalışır durumda ✓
- Dead code: YOK ✓

## 11. Security
- Input validation: SprintMetrics.coveragePercent, noGoRate güvenli sayısal karşılaştırma
- Injection riski: YOK (string template, no user input)
- Secret exposure: YOK ✓

## 12. Memory V2 Uyumu
N/A — Recommendation engine DB ile etkileşmez, sadece runtime metrikleri kullanır.

## 13. i18n
- Hardcoded EN string'ler: "Fix N NO_GO task(s)", "completed with tech debt", "Underperforming agent(s)", "Coverage regressed", "All tasks completed successfully"
- Severity: P3 (iç CLI output, düşük i18n öncelik)

## 14. Dokümantasyon Tutarlılığı
- JSDoc: 4 interface + 1 class EKSİK (P3)
- `MAX_RECOMMENDATIONS = 5`: Dokümante edilmemiş hardcoded limit

## 15. Performance
- Sync I/O: 0 ✓
- Hot path: Hayır (sprint sonu bir kez çağrılır)
- `evaluations.values()` iterasyonu: O(n), sprint task sayısı ile sınırlı ✓
- `sort + slice`: O(n log n + 5), minimal ✓

## 16. Öneriler
| Severity | Öneri |
|----------|-------|
| P3 | JSDoc eklenmeli (public API) |
| P3 | `MAX_RECOMMENDATIONS` config'dan okunabilir |
| P3 | Hardcoded threshold'lar (60% agent, -1% coverage) magic number — const ile tanımlanmalı |
| P3 | i18n: EN string'ler locale-aware yapılabilir |

## Verdict: ANALYZED
