# Analysis: src/core/decision-types.ts
**Task ID:** 142-002 | **Model:** opus | **LoC:** 95 | **Effort:** max

## 1. Amaci
Decision engine V1 tip tanımları. Task analysis (type, complexity, keywords), decision log (step-based audit trail), decision result (agent + skills + model + effort kararı), ve decision context (project stack, pools, patterns, config) tanımlar. decision-engine.ts, task-router.ts, ve sprint-controller.ts tarafından kullanılır. NOT: Bu dosya V1 decision engine'e ait — V2 routing engine routing-types.ts ve routing-engine.ts'de yaşıyor.

## 2. Public API
### Types (1):
- `TaskType` — 7 literal union: 'code' | 'test' | 'doc' | 'security' | 'refactor' | 'devops' | 'config'

### Interfaces (4):
- `TaskAnalysis` — type, complexity (0-10), keywords, scopeWeight, estimatedDurationMs
- `DecisionLogEntry` — step (1-6), name, input, output, durationMs, reasoning
- `DecisionResult` — analysis, agent, skills, model, effort, scope, decisionLog
- `DecisionContext` — projectStack, agentPool, skillPool, patterns, config

### Functions (3):
- `createDefaultAnalysis()` → TaskAnalysis — zeroed defaults
- `isValidTaskType(type)` → type guard
- `createDecisionLogEntry(step, name, reasoning)` → DecisionLogEntry

### Constants (1):
- `VALID_TASK_TYPES` — readonly TaskType[] (not exported, internal only)

JSDoc: Fonksiyonlarda mevcut. YETERLI.

## 3. Ic Bagimliliklar
- `./types.js` → ModelType, TaskEffort, TaskScope, PatternEntry, ResolvedConfig (type imports — barrel üzerinden)
- `./agent-types.js` → AgentDefinition, AgentPool (type import)
- `./skill-types.js` → SkillDefinition, ProjectStack (type import)

Döngüsel bağımlılık riski: **YOK** — tek yönlü type imports.

## 4. Dis Bagimliliklar
Hiçbir dış bağımlılık yok. ADR-010 uyumlu.

## 5. Complexity
Fonksiyon sayısı: 3. Max cyclomatic: 1. Çok düşük.

## 6. Type Safety
- `any`: 0
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- `as unknown`: 0
- Non-null `!`: 0

**Gözlem:**
- `DecisionLogEntry.input/output: Record<string, unknown>` — dinamik yapı. Audit log olarak kabul edilebilir.
- `TaskAnalysis.complexity: number` — JSDoc "0-10" der ama compile-time enforce yok. Runtime validation gerekli.
- `VALID_TASK_TYPES` export EDİLMİYOR (satır 10 `const`, not `export const`) — `isValidTaskType` fonksiyonu ile dolaylı erişim sağlanıyor. Bu iyi encapsulation.

## 7. ADR Compliance
- **ADR-028 (V2 routing):** Bu dosya V1 decision engine'e ait. ADR-028 V1→V2 migration'ı kapsar. Bu dosya hâlâ kullanılıyor çünkü V1 decision engine tamamen kaldırılmadı — decision-engine.ts hâlâ mevcut. **NOT:** ADR-028 "deprecated" V1'i ama V1 tipleri hâlâ aktif.
- **ADR-008 (brain import):** N/A — type-only
- **Memory V2:** `DecisionContext.patterns: PatternEntry[]` — PatternEntry sprint-types.ts'den geliyor (V1 pattern). V2 DB'de pattern'lar `store.getByType('pattern')` ile sorgulanır. Bu interface V1 kalıntısı. **P2.**

## 8. Test Coverage
- `tests/core/decision-types.test.ts` — MEVCUT
- Beklenen coverage: `createDefaultAnalysis()`, `isValidTaskType()`, `createDecisionLogEntry()` factory/helper testleri

YETERLI.

## 9. TODO/FIXME/HACK inventory
Hiçbir TODO/FIXME/HACK bulunmadı.

## 10. Dead Code
- **`TaskType` vs `IntentType` (routing-types.ts):** İki farklı task classification sistemi var:
  - V1: `TaskType` = 'code'|'test'|'doc'|'security'|'refactor'|'devops'|'config' (7 değer)
  - V2: `IntentType` = 'implementation'|'bugfix'|'refactor'|'testing'|'documentation'|'security'|'devops'|'config'|'performance'|'design'|'migration'|'unknown' (12 değer)
  - V1 TaskType, V2 IntentType'ın alt kümesi DEĞİL (örn. 'code' vs 'implementation', 'test' vs 'testing'). İsimlendirme tutarsız.
  - **P2:** V1 TaskType hâlâ aktif kullanımda mı (decision-engine.ts)? Eğer V2 routing tamamen aktif ise, bu V1 dead code adayı.
- `DecisionResult` — decision-engine.ts'de kullanılıyor. V1 engine aktif ise dead code DEĞİL.
- `DecisionContext` — aynı durum.

## 11. Security
Güvenlik riski yok — saf tip tanımı.

## 12. Memory V2 Uyumu
- `DecisionContext.patterns: PatternEntry[]` — V1 pattern tipi. V2'de pattern'lar DB'de. Bu interface V1 kalıntısı.
- `DecisionContext.config: ResolvedConfig` — config-types.ts'den, Memory V2 ile ilgisi yok.
- Genel olarak: Bu dosya V1 decision engine domain'i, Memory V2 entegrasyonu V2 routing engine'de (routing-types.ts, routing-engine.ts). V1'in V2'ye migration'ı tamamlanmadığında bu dosya korunuyor.

## 13. i18n
- TaskType literal'leri İngilizce — uygun
- turkishNormalize kullanımı yok — N/A

## 14. Dokumantasyon Tutarliligi
- `TaskType` 7 değer vs `IntentType` 12 değer — iki paralel classification sistemi belgelenmemiş. Hangi durumda hangisi kullanılıyor?
- `DecisionLogEntry.step: 1-6` — 6 adım ne? decision-engine.ts'deki step'lere referans ama burada listelenmemiş.
- V1 vs V2 decision engine farkı bu dosyada belirtilmemiş. **P2.**

## 15. Performance
Sıfır runtime maliyeti — tamamen tip + factory fonksiyonları.

## 16. Oneriler
| # | Severity | Öneri |
|---|----------|-------|
| 1 | P2 | V1 `TaskType` vs V2 `IntentType` dualite'yi çöz — V1 tamamen deprecated ise `@deprecated` işaretle |
| 2 | P2 | `DecisionContext.patterns: PatternEntry[]` V2 DB-first ile uyumsuzluğu dokümante et |
| 3 | P3 | `DecisionLogEntry.step` 6 adımın ne olduğunu JSDoc ile belirt |
| 4 | P3 | V1 decision system'in V2 ile birlikte ne zaman kaldırılacağını planlama (ADR-028 sonraki adım) |

## Verdict: ANALYZED
