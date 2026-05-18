# Analysis: src/agents/prompt-analytics.ts
**Task ID:** 141-005-fix | **LoC:** 473

## 1. Amacı
Unified prompt analytics modülü. A/B test yönetimi (PromptABTester) ve metrik toplama (PromptMetrics) sınıflarını birleştiren PromptAnalytics facade sınıfı. Experiment'lar `.deckent/experiments/` altında JSON dosya olarak saklanır.

## 2. Public API (export listesi)
- Types: `ExperimentResult`, `Experiment`, `ExperimentAnalysis`, `PromptMetricsReport`
- Classes: `PromptABTester`, `PromptMetrics`, `PromptAnalytics`

## 3. İç + Dış Bağımlılıklar
- `node:fs` — existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync
- `core/errors.js` — ErrorRegistry
- `./prompt-version.js` — PromptVersion type

## 4. Complexity
- 3 sınıf, orta complexity
- `analyzeExperiment` score hesaplama: `aScore = successRate * 0.7 + (coverage/100) * 0.3`
- `confidencePercent = Math.min(100, Math.round(diff * 100 * Math.sqrt(sampleSize)))` — basit heuristic

## 5. Type Safety
- `any` yok
- Error casting: `throw ErrorRegistry.createError(...)` — type-safe ✓

## 6. ADR Compliance
- ADR-006/008: spawn yok, brain import yok. OK.
- Dosya depolama: `.deckent/experiments/` — Memory V2 DB kapsamı dışında.

## 7. Test Coverage
- `tests/agents/prompt-analytics.test.ts` bekleniyor

## 8. TODO/FIXME/HACK inventory
- Yok.

## 9. Dead Code Candidates
- `MIN_SAMPLES_FOR_WINNER = 4` — küçük sample size; production'da artırılabilir.

## 10. Security Findings
- JSON parse try/catch ✓
- Experiment ID: `Date.now() + Math.random()` — collision olası (düşük risk)

## 11. Memory V2 Uyumu
- Experiment verileri dosya tabanlı — DB-first dışında. Kabul edilebilir (agent-specific data).

## 12. Öneriler
- Experiment ID collision: UUID kullan (zaten available `node:crypto`)

## 13. Verdict: ANALYZED
