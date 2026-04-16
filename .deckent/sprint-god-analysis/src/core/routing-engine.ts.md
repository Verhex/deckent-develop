# Analysis: src/core/routing-engine.ts
**Task ID:** 142-002 | **Model:** opus | **LoC:** 554 | **Effort:** max

## 1. Amaci
Routing Engine V2 — ana routing orchestrator. `routeTaskV2()` fonksiyonu ile bir task'ı en uygun agent + skill kombinasyonuna yönlendirir. 6 adımlı pipeline: intent classification → override resolution → agent selection → skill budget calculation → skill selection → context fit assessment. Bu dosya, eski `selectAgent()` + `selectSkills()` ayrık çağrılarını birleşik, intent-tabanlı bir karar mekanizmasıyla değiştirir. Brain'in sprint planlama fazında task-router.ts tarafından çağrılır.

## 2. Public API
### Exported Functions (4):
- `routeTaskV2(task, agentPool, skillPool, options?)` → RoutingDecision — **Ana API.** 554 satırlık dosyanın kalbi.
- `calculateSkillBudget(taskDNA, config?, effort?)` → SkillBudget — skill token budget hesaplaması
- `resolveOverrides(overrides)` → resolved overrides — priority-based override çözümleme
- `calculateConfidence(topScore, secondScore, candidateCount)` → ConfidenceLevel

### Exported Interfaces (1):
- `RoutingOptions` — projectStack, overrides, learningData, config, effort, sprintId, taskId, projectRoot, estimatedTokens, modelId

### Internal Functions (7):
- `selectBestAgent()` — activation-based agent seçimi
- `selectBestSkills()` — activation + stack + intent + learning bonus ile skill seçimi
- `getAgentActivation()` — V2 activation veya V1 migration
- `getSkillActivation()` — V2 activation veya V1 migration
- `getLearningBonus()` — learning data'dan bonus çekme
- `getIntentPriorityBonus()` — intent-skill hizalama bonusu
- `assessContextFit()` — model context window uyum kontrolü

JSDoc: Ana fonksiyonlarda mevcut, `@throws` yok (ama hiçbiri throw etmiyor — iyi). YETERLI.

## 3. Ic Bagimliliklar
- `./task-types.js` → TaskScope
- `./agent-types.js` → AgentDefinition, AgentPool
- `./skill-types.js` → SkillDefinition
- `./routing-types.js` → TaskDNA, RoutingDecision, vb. (8 type + 6 constant import)
- `./intent-classifier.js` → classifyIntent
- `./activation-engine.js` → evaluateActivation, migrateV1AgentToActivation, migrateV1SkillToActivation
- `./skill-selector.js` → resolveComposition
- `./model-registry.js` → modelRegistry
- `./utils.js` → debugLog

**9 iç bağımlılık** — hepsi core/ içinde. ADR-008 uyumlu (brain dışında tmux/auditor/worker import yok).

Döngüsel bağımlılık riski: **DÜŞÜK** — tüm bağımlılıklar tek yönlü (routing-engine → types, engine, selector, classifier, registry, utils).

## 4. Dis Bagimliliklar
Hiçbir dış bağımlılık yok. ADR-010 uyumlu.

## 5. Complexity
Fonksiyon sayısı: 11 (4 exported + 7 internal). 
Max cyclomatic: ~8 (`selectBestSkills` — çoklu for loop + if/else + sort + filter + slice).
En karmaşık: `selectBestSkills()` (satır 221-336) — 116 satır, çoklu scoring logic.

## 6. Type Safety
- `any`: 0
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- `as unknown`: 0
- **Non-null `!` (2 adet):**
  - Satır 308: `.map(c => pool.get(c.id)!)` — candidates listesinden gelen ID'nin pool'da olması garanti (önceki loop'ta pool'dan alındı). Güvenli ama `.filter(Boolean)` zaten sonraki satırda var — `!` gereksiz.
  - Satır 329: `finalCandidates[0]!.finalScore` — `.length > 0` guard'ı ile korunan blokta. Güvenli.

## 7. ADR Compliance
- **ADR-006 (spawnSync):** N/A — process spawn yok
- **ADR-008 (brain import):** Uyumlu — sadece core/ iç modüller import edilmiş
- **ADR-010 (tek runtime dep):** Uyumlu — dış dep yok
- **ADR-028 (V2 routing):** Bu dosya ADR-028'in implementasyonu. Uyumlu.
- **Memory V2 DB-first:** N/A — routing engine, memory ile doğrudan etkileşim yok (learning data dışarıdan parametre olarak gelir)
- **ADR-037 (RBAC):** N/A — routing kararı, authority enforcement değil

## 8. Test Coverage
- `tests/core/routing-engine.test.ts` — MEVCUT
- Beklenen coverage alanları:
  - `routeTaskV2()` — temel routing senaryoları
  - `calculateSkillBudget()` — size/effort/crossCutting kombinasyonları
  - `resolveOverrides()` — priority resolution, exclude additive
  - `calculateConfidence()` — edge case'ler (score=0, single candidate, tied scores)
  - `assessContextFit()` — ok/tight/overflow thresholds

**EKSİK kontrol:** Test dosyasını okumadan detaylı coverage değerlendirmesi yapılamıyor, ancak dosya mevcut.

## 9. TODO/FIXME/HACK inventory
Hiçbir TODO/FIXME/HACK bulunmadı.

## 10. Dead Code
- `ScoredCandidate` interface — sadece internal kullanım, export edilmiyor. Doğru.
- `CONTEXT_TIGHT_THRESHOLD`, `CONTEXT_OVERFLOW_THRESHOLD` — kullanılıyor
- Tüm internal helper'lar kullanılıyor
- Dead code yok

## 11. Security
- `assessContextFit()` modelRegistry'den context window bilgisi alıyor — güvenli (internal data)
- `debugLog()` reasoning string'leri log'luyor — log injection riski düşük (internal routing data)
- Kullanıcı input'u doğrudan bu modüle ulaşmıyor (task description üzerinden dolaylı)
- SQL injection riski yok — DB erişimi yok

## 12. Memory V2 Uyumu
Routing engine Memory V2 ile doğrudan etkileşim yok. Learning data `LearningBonus[]` olarak dışarıdan parametre olarak gelir. Bu iyi bir separation of concerns. Memory V2 uyum sorunu yok.

## 13. i18n
- Reasoning mesajları İngilizce: "Agent forced by override", "No agent met minimum score", vb.
- `debugLog` mesajları İngilizce
- Dashboard veya CLI'ye doğrudan İngilizce mesaj üretmiyor (reasoning internal) — kabul edilebilir
- turkishNormalize kullanımı yok — N/A

## 14. Dokumantasyon Tutarliligi
- `SkillBudget` hesaplamasında `calculateSkillBudget()` fonksiyonu (satır 344-377): `maxTokensTotal` ve `totalSkillTokenBudget` farklı formüllerle hesaplanıyor:
  - `maxTokensTotal = min(maxSkills * DEFAULT_TOKEN_BUDGET_PER_SKILL, DEFAULT_TOKEN_BUDGET_TOTAL)` — effort-agnostic
  - `totalSkillTokenBudget = min(maxSkills * maxTokensPerSkill, DEFAULT_TOKEN_BUDGET_TOTAL * 2)` — effort-aware
  - İkisi arasındaki fark dokümante edilmemiş. **P2.**
- `assessContextFit()` JSDoc yeterli — threshold'lar dokümante edilmiş.

## 15. Performance
- **Sync I/O:** 0 — tamamen in-memory
- `selectBestAgent()` ve `selectBestSkills()` pool üzerinde for loop — O(n) n=agent/skill sayısı. Maks 16 agent, 21 skill → ihmal edilebilir.
- `candidates.sort()` — O(n log n) ama n < 20 → ihmal edilebilir
- `resolveComposition()` çağrısı (satır 311) — external call, performansı skill-selector.ts'e bağlı
- Hot path DEĞİL — sprint başına 1 kez çağrılır per task

## 16. Oneriler
| # | Severity | Öneri |
|---|----------|-------|
| 1 | P2 | `maxTokensTotal` vs `totalSkillTokenBudget` farkını JSDoc ile açıkla veya birini kaldır |
| 2 | P3 | Satır 308 `pool.get(c.id)!` — `.filter(Boolean)` zaten var, `!` kaldırılabilir |
| 3 | P3 | `getIntentPriorityBonus()` sadece 3 skill ID hardcoded (testing-expert, documentation-writer, typescript-expert) — genelleştirilebilir veya config-driven yapılabilir |
| 4 | P3 | `selectBestAgent()` tiebreaker'da `getLearningBonus` ikinci kez çağrılıyor — candidate'a cache'lenmiş bonus zaten var (`learningBonus` field), onu kullan |

## Verdict: ANALYZED
