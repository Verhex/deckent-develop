# Analysis: src/core/model-equivalence.ts
**Task ID:** 142-004 | **Model:** opus | **LoC:** 149 | **Effort:** max

## 1. Amaci
Cross-provider model tier eslestirmesi saglar. Brain "opus" dediginde target provider Codex ise "gpt-5" secilir. ModelRegistry'ye delege eder ancak backward compatibility icin kendi fonksiyon API'sini sunar: getModelTier, getEquivalentModel, isModelAvailable, getModelProvider, getModelsInTier, getProviderModels, getModelForProviderTier. Bu modul, tum routing kararlarinin temelini olusturur.

## 2. Public API
- `type MultiProviderModelType = ModelType` (re-export)
- `type ModelTier = 'economy' | 'standard' | 'premium' | 'premium_plus'` (re-export)
- `type { ClaudeModel, OpenAIModel, GeminiModel, ProviderName }` (re-export from task-types)
- `const MODEL_TIERS` — tier → model ID array (derived from ModelRegistry)
- `function getModelTier(model): ModelTier`
- `function getEquivalentModel(model, targetProvider): MultiProviderModelType`
- `function isModelAvailable(model, provider): boolean`
- `function getModelProvider(model): ProviderName`
- `function getModelsInTier(tier): readonly string[]`
- `function getProviderModels(provider): readonly MultiProviderModelType[]`
- `function getModelForProviderTier(provider, tier): MultiProviderModelType | undefined`

JSDoc: **MEVCUT** — tum fonksiyonlarda yeterli JSDoc.

## 3. Ic Bagimliliklar
- `./errors.js` → DeckentError
- `./model-registry.js` → modelRegistry (singleton)
- `./task-types.js` → ClaudeModel, OpenAIModel, GeminiModel, ModelType, ProviderName

Dongusel bagimllik riski: **YOK**

## 4. Dis Bagimliliklar
Yok (ADR-010 uyumlu).

## 5. Complexity
- Fonksiyon sayisi: 7
- Max cyclomatic complexity: `getEquivalentModel()` (satir 74-98) — 3 branch (same provider, tier lookup, premium_plus fallback) — DUSUK
- Genel complexity: DUSUK

## 6. Type Safety
- `any` sayisi: **0**
- `@ts-ignore`: **0**
- `as ProviderName` cast: satir 118 — `def.provider as ProviderName` — ModelRegistry RegistryProviderName donuyor, bu modul ProviderName (task-types) kullaniyor. Ayni degerler ama farkli type alias'lar. **P3 — nominal type gap.**
- `as readonly string[]` yok — includes() icin type narrowing (satir 107).

## 7. ADR Compliance
- **ADR-008**: ✅ core/ icerisinde
- **ADR-010**: ✅
- **ADR-023**: ✅ tier-based model secimi
- **ADR-028**: ✅ V2 routing engine ile uyumlu

## 8. Test Coverage
- `tests/core/model-equivalence.test.ts` — **80+ test** — EXCELLENT
  - getModelTier: 13 test (her model + unknown)
  - getEquivalentModel: 30+ test (Claude↔Codex, Claude↔Gemini, Codex↔Gemini, same-provider, premium_plus fallback)
  - isModelAvailable: 11 test
  - getModelProvider: 8 test
  - getModelsInTier: 3 test
  - getProviderModels: 3 test
  - MODEL_TIERS: 4 test
  - equivalence completeness: 3 test (every model ↔ every provider)
  - tier alignment with task-types: 4 test (numeric tier uyumu)
- **EKSIK:** `getModelForProviderTier()` icin HICBIR test yok! **P1**
- Mock kalitesi: N/A (statik derived data)

## 9. TODO/FIXME/HACK Inventory
Yok.

## 10. Dead Code
Yok — tum export'lar test veya diger moduller tarafindan kullaniliyor.

## 11. Security
Guvenlik riski yok.

## 12. Memory V2 Uyumu
N/A

## 13. i18n
- Hata mesajlari Ingilizce — uygun.

## 14. Dokumantasyon Tutarliligi
- DECKENT.md tier eslestirme tablosu: "premium_plus (o3, gemini-3.1-pro-preview), premium (opus↔gpt-5↔gemini-2.5-pro), standard (sonnet↔gpt-4.1↔o4-mini↔gemini-2.5-flash), economy (haiku↔gpt-5-mini↔gpt-4.1-mini↔gemini-2.0-flash)" → ✅ Kod ile uyumlu.
- **TUTARSIZLIK:** TIER_PROVIDER_MAP premium_plus section'inda bos obje `{}` var (satir 51-53). premium_plus modelleri (o3, gemini-3.1-pro-preview) icin tier provider lookup bos, premium'a fallback ediyor. Bu kasitli tasarim ama explicit degil — yorum yeterli degil. **P3**

## 15. Performance
Sync I/O: **0** — tamamen in-memory. Performans sorunu yok.
Module-level computation: MODEL_TIERS ve PROVIDER_MODELS modul yukleme sirasinda hesaplaniyor (modelRegistry.getByTier, getAllProviders, getByProvider). Bu startup maliyeti kabul edilebilir.

## 16. Oneriler
1. **P1 — getModelForProviderTier() test eksikligi**: 0 test. Bu fonksiyon planner ve mode-presets tarafindan kullaniliyor olabilir.
2. **P3 — TIER_PROVIDER_MAP premium_plus bos**: Kasitli ama belgelenmemis. premium_plus → premium fallback logic getEquivalentModel()'de, ama TIER_PROVIDER_MAP'te bu visible degil.
3. **P3 — ProviderName vs RegistryProviderName dual type**: task-types.ts ve model-registry.ts'de ayni degerler farkli type alias kullaniliyor. Tek bir kaynaktan export edilmeli.
4. **P3 — ModelRegistry.getEquivalent() vs getEquivalentModel()**: Iki ayri equivalence fonksiyonu var (registry class method + bu moduldeki wrapper). Wrapper kendi TIER_PROVIDER_MAP'ini kullaniyor, registry kendi logic'ini. Potansiyel davranis farki riski.

## Verdict: ANALYZED
