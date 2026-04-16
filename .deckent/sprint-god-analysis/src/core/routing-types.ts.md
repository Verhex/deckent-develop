# Analysis: src/core/routing-types.ts
**Task ID:** 142-002 | **Model:** opus | **LoC:** 190 | **Effort:** max

## 1. Amaci
Routing Engine V2'nin temel tip dosyası. Intent-based routing sisteminın tüm veri yapılarını tanımlar: TaskDNA (görev "DNA"sı — intent, domains, operations, complexity, scope), ActivationRule/ExclusionRule (agent/skill seçim kuralları), RoutingDecision (nihai routing kararı), SkillBudget (token budget), LearningBonus (sprint-bazlı öğrenme bonusu). routing-engine.ts, activation-engine.ts, intent-classifier.ts, task-router.ts tarafından yoğun kullanılır.

## 2. Public API
### Types (6):
- `IntentType` — 12 literal union ('implementation'...'unknown')
- `OperationType` — 7 literal union
- `TaskSize` — 5 literal ('trivial'...'epic')
- `ConfidenceLevel` — 4 literal ('high'...'uncertain')
- `OverrideSource` — 4 literal

### Interfaces (10):
- `TaskDNA` — intent, domains, operations, complexity, scope
- `ActivationRule` — name?, when (condition), score
- `ExclusionRule` — name?, when, reason?
- `ActivationConfig` — rules[], exclude[], minScore
- `ActivationResult` — score, excluded, matchedRules, excludeReason?
- `RoutingDecision` — agentId, skillIds, taskDNA, reasoning[], contextFit
- `SkillBudget` — maxSkills, token budgets (6 fields)
- `UserOverride` — source, forceAgent/Skills, excludeSkills/Agents, priority
- `LearningBonus` — entityId, bonus, source
- `RoutingEngineConfig` — agentMinScore, skillMinScore, maxSkillsDefault

### Constants (6):
- `ALL_INTENT_TYPES` — readonly IntentType[]
- `LEARNING_BONUS_CAP` — 3
- `SKILL_BUDGET_BY_SIZE` — Record<TaskSize, number>
- `DEFAULT_TOKEN_BUDGET_PER_SKILL` — 1500
- `DEFAULT_TOKEN_BUDGET_TOTAL` — 4500
- `SKILL_TOKEN_BUDGET_BY_EFFORT` — Record<string, number>

### Functions (4):
- `createDefaultTaskDNA()` — factory
- `createDefaultActivationConfig(minScore?)` — factory
- `createDefaultRoutingEngineConfig()` — factory
- `isValidIntentType(value)` — type guard

JSDoc: Interface-level yorum var, field-level JSDoc kısmen mevcut. Constant'larda `/** */` mevcut. YETERLI.

## 3. Ic Bagimliliklar
Hiçbir import yok — tamamen bağımsız tip dosyası. Bu çok iyi tasarım — diğer tüm routing modülleri bu dosyayı import eder ama bu dosya hiçbir şey import etmez.

Döngüsel bağımlılık riski: **SIFIR** — leaf node.

## 4. Dis Bagimliliklar
Hiçbir dış bağımlılık yok. ADR-010 uyumlu.

## 5. Complexity
Fonksiyon sayısı: 4 (hepsi factory/helper). Max cyclomatic: 1 (factory'ler sıfır branching). Çok düşük karmaşıklık.

## 6. Type Safety
- `any`: 0
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- `as unknown`: 0
- Non-null `!`: 0

**Potansiyel sorunlar:**
- `ActivationRule.when: Record<string, unknown>` (satır 63) — condition yapısı tamamen dynamik. condition-evaluator.ts bu yapıyı runtime'da yorumluyor. Type güvenliği runtime'a bırakılmış. Kabul edilebilir ama ideal değil.
- `ExclusionRule.when: Record<string, unknown>` (satır 69) — aynı durum.
- `RoutingDecision.skillScores: Map<string, number>` — Map doğru kullanım, JSON serialize edilemez ama bu internal routing.
- `SKILL_TOKEN_BUDGET_BY_EFFORT: Record<string, number>` (satır 182) — key tipi `string` ama gerçekte sadece 'low'|'normal'|'high' olmalı. `Record<TaskEffort, number>` daha type-safe olurdu. **P3.**

## 7. ADR Compliance
- **ADR-006 (spawnSync):** N/A
- **ADR-008 (brain import):** Uyumlu — sıfır import, leaf node
- **ADR-010 (tek runtime dep):** Uyumlu
- **ADR-028 (V2 routing):** Bu dosya ADR-028'in temel taşı. V2 routing types doğru tanımlanmış.
- **Memory V2 DB-first:** N/A — routing domain

## 8. Test Coverage
- `tests/core/routing-types.test.ts` — MEVCUT
- Factory function'lar, type guard'lar, constant'lar test edilmiş

YETERLI.

## 9. TODO/FIXME/HACK inventory
Hiçbir TODO/FIXME/HACK bulunmadı.

## 10. Dead Code
- Tüm export'lar routing-engine.ts, activation-engine.ts, task-router.ts, intent-classifier.ts tarafından kullanılıyor
- Dead code yok

## 11. Security
Güvenlik riski yok — saf tip tanımı. `ActivationRule.when` dışarıdan gelen JSON olabilir ama condition-evaluator.ts'de safe evaluation yapılıyor (eval() yok).

## 12. Memory V2 Uyumu
N/A — routing domain, memory ile doğrudan ilişki yok. Brain context'ten ADR bilgisi inject edilirken routing tipleri kullanılmıyor.

## 13. i18n
- Intent type string'leri İngilizce — doğru, locale-agnostic
- Confidence level string'leri İngilizce — uygun
- turkishNormalize kullanımı yok — N/A

## 14. Dokumantasyon Tutarliligi
- `SkillBudget` interface'te 6 field var: `maxSkills`, `maxTokensTotal`, `perSkillTokenBudget`, `maxTokensPerSkill`, `totalSkillTokenBudget`, `reason`. İlk 3 ve son 3 arasında overlap var — `maxTokensTotal` vs `totalSkillTokenBudget` farkı ne? `perSkillTokenBudget` vs `maxTokensPerSkill` farkı ne? JSDoc yetersiz. **P2 karışıklık.**
- `SKILL_BUDGET_BY_SIZE.trivial = 0` — trivial task'lara hiç skill verilmiyor. Bu davranış dokümante edilmemiş.

## 15. Performance
Sıfır runtime maliyeti — tamamen tip + sabit tanımı.

## 16. Oneriler
| # | Severity | Öneri |
|---|----------|-------|
| 1 | P2 | `SkillBudget` field'larını sadeleştir — `maxTokensTotal` vs `totalSkillTokenBudget` overlap'i çöz |
| 2 | P3 | `SKILL_TOKEN_BUDGET_BY_EFFORT` key tipini `Record<string, number>` → `Record<TaskEffort, number>` yap |
| 3 | P3 | `ActivationRule.when` tipi için daha spesifik bir ConditionTree interface düşün |
| 4 | P3 | `SkillBudget` field JSDoc'larını iyileştir — hangi field ne zaman kullanılır |

## Verdict: ANALYZED
