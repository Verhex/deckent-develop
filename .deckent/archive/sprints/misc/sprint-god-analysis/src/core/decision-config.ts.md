# Analysis: src/core/decision-config.ts
**Task ID:** 142-002 | **Model:** opus | **LoC:** 195 | **Effort:** max

## 1. Amaci
Decision engine, learning sistemi, ve collaboration konfigürasyon tipleri ve validation fonksiyonları. `DecisionEngineConfig` (agent selection threshold, max skills, logging), `LearningConfig` (sprint recency, bonus/penalty, decay), `CollaborationConfig` (parallel pipelines, shared memory, conflict strategy) tanımlar. config-types.ts'den `DeckentConfig` interface'ine embed edilir. Factory ve validation fonksiyonları runtime'da config merge, default oluşturma, ve kullanıcı input doğrulaması için kullanılır.

## 2. Public API
### Interfaces (3):
- `DecisionEngineConfig` — 7 field: enabled, agentSelectionThreshold, maxSkillsPerTask, learningEnabled, learningMaxSprints, decisionLogging, adaptiveAgentEnabled
- `LearningConfig` — 9 field: enabled, maxSprintsToKeep, minConfidenceForRecommendation, decayInterval, patternMigrationDone, minSamplesForBonus?, recentSprintWindow?, sprintRecencySuccessBonus?, sprintRecencyFailurePenalty?
- `CollaborationConfig` — 3 field: parallelPipelines, sharedMemoryEnabled, conflictStrategy

### Functions (6):
- `createDefaultDecisionConfig()` → DecisionEngineConfig
- `createDefaultLearningConfig()` → LearningConfig
- `createDefaultCollaborationConfig()` → CollaborationConfig
- `validateDecisionConfig(config: unknown)` → { valid, errors }
- `validateLearningConfig(config: unknown)` → { valid, errors }
- `validateCollaborationConfig(config: unknown)` → { valid, errors }

### Constants (1):
- `VALID_CONFLICT_STRATEGIES` — readonly ['last_writer_wins', 'first_writer_wins', 'manual']

JSDoc: Factory fonksiyonlarında yok (öz-açıklayıcı isimler), validation fonksiyonlarında yok. EKSIK ama kabul edilebilir (isimler yeterince açık).

## 3. Ic Bagimliliklar
Hiçbir import yok — tamamen bağımsız. Bu mükemmel — config tipleri en alt seviye olmalı.

Döngüsel bağımlılık riski: **SIFIR** — leaf node.

## 4. Dis Bagimliliklar
Hiçbir dış bağımlılık yok. ADR-010 uyumlu.

## 5. Complexity
Fonksiyon sayısı: 6 (3 factory + 3 validation). 
Max cyclomatic: ~8 (`validateDecisionConfig` — 7 if/else blok).
En karmaşık: `validateDecisionConfig()` (satır 73-124) — 52 satır, 7 field doğrulama.

## 6. Type Safety
- `any`: 0
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- **`as Record<string, unknown>` (3 adet):**
  - Satır 80: `const c = config as Record<string, unknown>` — `validateDecisionConfig` input
  - Satır 135: `const c = config as Record<string, unknown>` — `validateLearningConfig` input
  - Satır 177: `const c = config as Record<string, unknown>` — `validateCollaborationConfig` input
  - Bunlar `unknown` → `Record` cast'i — fonksiyon signature'ı `unknown` alıyor ve object check sonrası cast yapıyor. **GÜVENLİ** pattern (type narrowing doğru yapılmış: `typeof config !== 'object'` guard'ı öncesinde).
- Non-null `!`: 0

**Gözlem:** Validation fonksiyonları Zod/io-ts yerine manual validation yapıyor. Bu ADR-010 (tek runtime dep) ile tutarlı — harici validation kütüphanesi eklenmemiş. Ama DeckentConfig'deki diğer alanlar Zod ile valide ediliyor mu? Tutarsızlık riski.

## 7. ADR Compliance
- **ADR-006 (spawnSync):** N/A
- **ADR-008 (brain import):** N/A — sıfır import
- **ADR-010 (tek runtime dep):** Uyumlu — manual validation, harici kütüphane yok
- **Memory V2:** N/A — config domain

## 8. Test Coverage
- `tests/core/decision-config.test.ts` — MEVCUT
- Beklenen coverage: 3 factory fonksiyonu, 3 validation fonksiyonu (valid/invalid senaryolar, edge case'ler)

YETERLI.

## 9. TODO/FIXME/HACK inventory
Hiçbir TODO/FIXME/HACK bulunmadı.

## 10. Dead Code
- `adaptiveAgentEnabled: boolean` (satır 10) — default false, opt-in. Adaptive agent (adaptive-agent.ts) aktif kullanımda mı? Sprint loglarında adaptive agent kullanımı görülmüyor. **P3 — potansiyel stale feature flag.**
- `CollaborationConfig.sharedMemoryEnabled: boolean` (satır 30) — default false. shared-memory.ts modülü mevcut ama aktif kullanımda mı? **P3 — potansiyel stale feature flag.**
- `LearningConfig.patternMigrationDone: boolean` (satır 20) — migration tamamlandığında true olur. Bu bir one-time flag — süresiz kalacak. **P3.**
- Geri kalanlar aktif kullanımda.

## 11. Security
- Validation fonksiyonları `unknown` input alıyor — doğru defensif programlama.
- `agentSelectionThreshold` range 1-20, `maxSkillsPerTask` range 1-10 — üst limitler makul.
- `config as Record<string, unknown>` — object guard sonrası cast, güvenli.
- Config değerleri dosyadan okunuyor — injection riski düşük (local file).

## 12. Memory V2 Uyumu
N/A — config domain. Memory V2 config'i `DeckentConfig.memory` section'ında (config-types.ts), bu dosyada decision/learning/collaboration config var.

## 13. i18n
- Validation error mesajları İngilizce: "enabled must be a boolean", "agentSelectionThreshold must be a number between 1 and 20", vb.
- CLI/MCP üzerinden kullanıcıya gösterilir — i18n gap var ama validation mesajları genelde EN kalır (industry standard).
- turkishNormalize kullanımı yok — N/A.

## 14. Dokumantasyon Tutarliligi
- `DecisionEngineConfig` config-types.ts'den `DeckentConfig.decision_engine?` olarak embed ediliyor — tutarlı.
- `LearningConfig` — `DeckentConfig.learning?` olarak embed — tutarlı.
- `CollaborationConfig` — `DeckentConfig.collaboration?` olarak embed — tutarlı.
- `LearningConfig.sprintRecencySuccessBonus: 3`, `sprintRecencyFailurePenalty: -2` — routing-types.ts'deki `LEARNING_BONUS_CAP = 3` ile tutarlı (bonus max 3, penalty max -3 ama default -2).
- **P3:** `minSamplesForBonus`, `recentSprintWindow` optional field'lar JSDoc'suz — ne zaman eklendi, ne yapar belirsiz.

## 15. Performance
- Validation fonksiyonları O(1) — field sayısı sabit.
- Factory fonksiyonları O(1) — object literal oluşturma.
- Sıfır I/O, sıfır async.

## 16. Oneriler
| # | Severity | Öneri |
|---|----------|-------|
| 1 | P3 | `adaptiveAgentEnabled` ve `sharedMemoryEnabled` aktif kullanımını doğrula — stale ise kaldır veya `@deprecated` ekle |
| 2 | P3 | `LearningConfig.patternMigrationDone` — one-time flag, migration tamamlandıysa type'tan kaldırılabilir |
| 3 | P3 | Validation fonksiyonlarına integer check ekle (şu an `typeof number` yeterli sayılıyor, float da kabul edilir) |
| 4 | P3 | `LearningConfig` optional field'larına (`minSamplesForBonus`, `recentSprintWindow`, `sprintRecencySuccessBonus`, `sprintRecencyFailurePenalty`) JSDoc ekle |

## Verdict: ANALYZED
