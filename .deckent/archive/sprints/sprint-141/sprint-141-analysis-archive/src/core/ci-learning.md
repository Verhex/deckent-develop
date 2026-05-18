# Analysis: src/core/ci-learning.ts
**Task ID:** 141-001 | **LoC:** 460

## 1. Amaci (1-2 cumle)
CI ortaminda sprint sonuclarindan ogrenme. Agent/skill basari oranlarini izler, learning bonus hesaplar ve sprint gecmisini analiz eder; routing kararlarini iyilestirmek icin `LearningBonus` listesi uretir.

## 2. Public API (export listesi)
- `CiLearning` class: `recordOutcome(taskId, agentId, skillIds, decision)`, `getLearningBonuses(): LearningBonus[]`, `getAgentStats(), getSkillStats()`, `saveState(projectRoot)`, `loadState(projectRoot)`, `clearState()`

## 3. Ic + Dis Bagimliliklar
- **Ic import:** `./routing-types.js`, `./utils.js`, `./constants.js`

## 4. Complexity
- 8+ metot, cyclomatic rough: 20

## 5. Type Safety
- `any`: 1 (JSON parse), Non-null: 2

## 6. ADR Compliance
- ADR-001 (ESM): UYUMLU

## 7. Test Coverage
- `tests/core/ci-learning.test.ts` MEVCUT olmali

## 8. TODO/FIXME/HACK inventory
- Yok

## 9. Dead Code Candidates
- `saveState()` / `loadState()` — dosya-bazli; Memory V2 DB'ye gecis bekliyor

## 10. Security Findings
- Guvenlik riski minimal

## 11. Memory V2 Uyumu
- BUYUK POTANSIYEL: Learning data DB'ye `pattern` tipi olarak kaydedilmeli
- Simdi dosya-bazli JSON; DB-first gecis Sprint 142 icin oneri

## 12. Oneriler
- `CiLearning.saveState()` → MemoryStore entegrasyonu
- Sprint recency weighting MemoryStore `sprint_num` ile yapilabilir

## 13. Verdict: ANALYZED
