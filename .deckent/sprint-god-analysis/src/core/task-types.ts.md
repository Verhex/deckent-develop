# Analysis: src/core/task-types.ts
**Task ID:** 142-002 | **Model:** opus | **LoC:** 357 | **Effort:** max

## 1. Amaci
Task domain'inin merkezi tip tanım dosyası. Model tipleri (ClaudeModel, OpenAIModel, GeminiModel), task yapısı (Task, TaskResult, TaskPlan), enum'lar (TaskStatus, TaskEvaluation), rubric-based evaluation, token usage, ve worker question/answer IPC arayüzlerini tanımlar. ModelRegistry'den türetilen runtime sabitler de burada — PROVIDER_MODEL_MAP, CLAUDE_MODELS, ALL_MODELS, MODEL_API_IDS. Brain, worker, ve planner tarafından yoğun olarak kullanılır.

## 2. Public API
### Types/Interfaces (24 export):
- `ClaudeModel`, `OpenAIModel`, `GeminiModel`, `ModelType` — union types
- `ProviderName` — 'claude' | 'codex' | 'gemini'
- `TaskEffort`, `TaskPriority` — literal union types
- `TaskStatus` (enum), `TaskEvaluation` (enum), `SelfAssessment` (literal type)
- `TaskScope`, `GoNoGoCriteria`, `Task`, `FeedbackLoop`, `VerifyTestsResult`
- `RubricCriterion`, `EvaluationRubric`, `RubricScore`, `EvaluationResult`
- `TokenUsage`, `QuestionAction`, `WorkerQuestion`, `BrainAnswer`
- `TaskResult`, `TaskPlan`, `PlannerTask`, `PlannerResult`

### Functions (6 export):
- `resolveApiModelId(model)` — model → API ID çözümleme
- `getProviderForModel(model)` — model → provider eşleme
- `isClaudeModel(model)` — type guard
- `isOpenAIModel(model)` — type guard
- `isGeminiModel(model)` — type guard
- `getModelTier(model)` — numeric tier (0-3)
- `isValidModel(value)` — type guard

### Constants (4 export):
- `PROVIDER_MODEL_MAP` — Record<ProviderName, ModelType[]>
- `CLAUDE_MODELS` — readonly ClaudeModel[]
- `ALL_MODELS` — readonly ModelType[]
- `MODEL_API_IDS` — Record<string, string>

JSDoc: Fonksiyonlarda mevcut, interface field'larında kısmen mevcut. YETERLI.

## 3. Ic Bagimliliklar
- `./model-registry.js` — modelRegistry singleton (runtime import)

Döngüsel bağımlılık riski: **DÜŞÜK** — model-registry.ts bu dosyaya bağımlı DEĞİL (kendi tipleri var). Ancak model-registry.ts'in `ModelType` döndürmesi gereken yerlerde `string` döndürmesi nedeniyle `as unknown` cast'leri gerekiyor (bkz. Section 6).

## 4. Dis Bagimliliklar
Hiçbir dış bağımlılık yok. ADR-010 uyumlu.

## 5. Complexity
Fonksiyon sayısı: 7. Max cyclomatic: ~2 (`resolveApiModelId` — has/throw). Düşük karmaşıklık.
En karmaşık: `resolveApiModelId` (satır 58-63) — sadece `has` check + throw.

## 6. Type Safety
- **`as unknown` (2 adet):**
  - Satır 40: `as unknown as readonly ClaudeModel[]` — modelRegistry.getByProvider() `string[]` döndürüyor, ClaudeModel[] olarak cast ediliyor
  - Satır 43: `as unknown as readonly ModelType[]` — aynı desen, getAllModelIds() için
- `any`: 0
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- Non-null `!`: 0

**Risk analizi:** `as unknown` cast'leri güvensiz görünse de, ModelRegistry runtime'da doğru model ID'lerini döndürüyor. Ancak ModelRegistry'ye yeni model eklenip task-types.ts'deki union güncellenmezse, cast type-safety'yi kırar. Bu, compile-time güvenliğinin zayıf noktası.

## 7. ADR Compliance
- **ADR-006 (spawnSync):** N/A — execution yok
- **ADR-008 (brain import):** Uyumlu — yalnızca core internal import
- **ADR-010 (tek runtime dep):** Uyumlu — no external deps
- **ADR-022 (CLI/MCP parity):** N/A
- **ADR-033 (product vision):** N/A
- **ADR-037 (RBAC):** N/A
- **ADR-039 (self-modifying):** N/A
- **Memory V2:** `TokenUsage` interface `provider?` ve `model?` optional — result dosyası kontratına göre bunlar Sprint 140'tan itibaren ZORUNLU. Optional olması tutarsız ama geriye dönük uyum.

## 8. Test Coverage
- `tests/core/types.test.ts` — mevcut (barrel re-export doğrulaması)
- `tests/core/types-edge.test.ts` — mevcut
- `tests/core/types-split.test.ts` — mevcut
- Doğrudan `task-types.test.ts` MEVCUT DEĞİL — testler barrel üzerinden dolaylı

Özel test dosyası yok ama barrel testleri kapsar. **EKSİK:** `resolveApiModelId`, `getProviderForModel`, type guard fonksiyonları için dedicated test yok (types.test.ts üzerinden dolaylı olabilir).

## 9. TODO/FIXME/HACK inventory
Hiçbir TODO/FIXME/HACK bulunmadı.

## 10. Dead Code
- `UnknownModelError` class — doğru kullanımda, dead code değil
- `PROVIDER_MODEL_MAP` runtime'da oluşturuluyor ama `_providerMap` intermediate sadece init'te kullanılıyor — const olarak iyi
- `enum TaskStatus`, `enum TaskEvaluation` — ADR standartlarına göre `as const` tercih edilmeli ama enum backward-compat nedeniyle korunuyor
- Potansiyel dead code yok

## 11. Security
- `UnknownModelError` user input'tan gelen model string'i mesajda gösteriyor — XSS riski yok (CLI/terminal ortamı)
- Input validation: `isValidModel()` type guard mevcut — YETERLI

## 12. Memory V2 Uyumu
- `TokenUsage` interface: `provider?` ve `model?` optional — Sprint 140+ zorunlu kılar, bu arayüz güncellenmemiş. P2 uyumsuzluk.
- `TaskResult.rubricScores` inline object type — `EvaluationResult.rubricScores` (RubricScore[]) ile aynı DEĞİL. İki farklı rubric format var. P2 tutarsızlık.
- Memory V2 DB schema ile doğrudan ilişki yok — bu dosya task domain'i.

## 13. i18n
- Model isimleri İngilizce string literal'ler — doğru, locale-agnostic
- `UnknownModelError` mesajı İngilizce — kabul edilebilir (error mesajları genelde EN)
- turkishNormalize kullanımı yok — N/A

## 14. Dokumantasyon Tutarliligi
- JSDoc `getModelTier()` yorumu tier mapping listeler: "Tier 1: ... o4-mini" ama o4-mini aslında economy (Tier 0) olarak da listelenmiş (satır 104 vs 107). `getModelTier` JSDoc yorumu ile ModelRegistry gerçek tier mapping arasında POTANSIYEL tutarsızlık. JSDoc satır 104-107'de o4-mini hem Tier 0 hem Tier 1'de görünüyor.
- **P1:** JSDoc tier mapping'in ModelRegistry ile doğrulanması gerekiyor

## 15. Performance
- Runtime'da ModelRegistry çağrıları (`modelRegistry.getAllProviders()`, `getByProvider()`, `getAllModelIds()`) modül yüklenmesinde 1 kez çalışır — kabul edilebilir startup cost
- Sync I/O: 0 — tamamen in-memory

## 16. Oneriler
| # | Severity | Öneri |
|---|----------|-------|
| 1 | P1 | `getModelTier()` JSDoc tier mapping'ini ModelRegistry ile senkronize et — o4-mini çift listeleme |
| 2 | P2 | `as unknown` cast'lerini type-safe hale getir: ModelRegistry API'sini generic yapabilir |
| 3 | P2 | `TokenUsage.provider` ve `TokenUsage.model` Sprint 140+ zorunlu — optional'ı kaldır veya dokümante et |
| 4 | P2 | `TaskResult.rubricScores` vs `EvaluationResult.rubricScores` tip farklılığını birleştir |
| 5 | P3 | `TaskStatus` ve `TaskEvaluation` enum'larını `as const` pattern'a migrate et (ADR yok, gelecek sprint) |

## Verdict: ANALYZED
