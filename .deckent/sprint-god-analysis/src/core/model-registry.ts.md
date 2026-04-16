# Analysis: src/core/model-registry.ts
**Task ID:** 142-004 | **Model:** opus | **LoC:** 316 | **Effort:** max

## 1. Amaci
13 model tanimi (3 Claude, 6 OpenAI, 4 Gemini) iceren single source of truth model katalogu. ModelRegistry sinifi ile model sorgulama (get, getByProvider, getByTier, getEquivalent), tier karsilastirma, maliyet tahmini, API ID cozumleme ve runtime model kaydi/silme islemleri saglar. Tum diger moduller (task-types, model-equivalence, providers) buraya delege eder.

## 2. Public API
- `type RegistryProviderName = 'claude' | 'codex' | 'gemini'`
- `type ModelTier = 'economy' | 'standard' | 'premium' | 'premium_plus'`
- `type ModelStatus = 'ga' | 'preview' | 'deprecated'`
- `interface ModelCapabilities` — { streaming, toolUse, vision, codeExecution, reasoning }
- `interface ModelCost` — { input, output }
- `interface ModelDefinition` — { id, apiId, provider, tier, contextWindow, costPerMillion, capabilities, status, maxOutputTokens? }
- `const BUILTIN_MODELS: readonly ModelDefinition[]` — 13 built-in model
- `class ModelRegistry` — get, getOrThrow, has, getByProvider, getByTier, getByProviderAndTier, getEquivalent, getTier, getNumericTier, compareTiers, isAtLeastTier, register, unregister, estimateCost, resolveApiId, getAllModelIds, getAllModels, getAllProviders
- `const modelRegistry: ModelRegistry` — singleton
- `type BuiltinModelId` — compile-time model ID union
- `type ModelType = BuiltinModelId | (string & {})` — runtime-extensible model ID

JSDoc: **KISMI** — sinif methodlari icin JSDoc az. getByProvider, getByTier gibi methodlarin dokumantasyonu yok. **P3**

## 3. Ic Bagimliliklar
- `./errors.js` → DeckentError

Dongusel bagimllik riski: **YOK** — minimal bagimlilik.

## 4. Dis Bagimliliklar
Yok (ADR-010 uyumlu).

## 5. Complexity
- Fonksiyon sayisi: 18 (class method)
- Max cyclomatic complexity: `getEquivalent()` (satir 229-249) — tier fallback loop, ~5 cyclomatic
- Genel: ORTA — loop + conditional ama her biri kisa ve anlasilir

## 6. Type Safety
- `any` sayisi: **0**
- `@ts-ignore`: **0**
- `as const` kullanimi: BUILTIN_MODELS, dogru
- Non-null `!`: **0**
- `(string & {})` trick (satir 315): `ModelType = BuiltinModelId | (string & {})` — TypeScript intellisense trick. ✅ Standard pattern.

## 7. ADR Compliance
- **ADR-006**: N/A
- **ADR-008**: ✅ core/ icerisinde
- **ADR-010**: ✅
- **ADR-023**: ✅ tier-based generalization — provider-agnostic tier isimleri (economy, standard, premium, premium_plus)
- **ADR-033**: ✅ multi-provider destegi

## 8. Test Coverage
- `tests/core/model-registry.test.ts` — **75+ test**
  - BUILTIN_MODELS catalog: 8 test
  - get/has/getOrThrow: 4 test
  - getByProvider: 4 test
  - getByTier: 4 test
  - getByProviderAndTier: 3 test
  - getEquivalent: 8 test (cross-provider + fallback + throw)
  - getTier: 12 test (her model icin)
  - compareTiers: 3 test
  - isAtLeastTier: 6 test
  - register/unregister: 4 test
  - resolveApiId: 12 test
  - estimateCost: 5 test
  - getNumericTier: 4 test
  - getAllModelIds/getAllModels/getAllProviders: 3 test
  - constructor: 2 test
  - capabilities: 5 test
  - status: 2 test
  - singleton: 2 test
- **EXCELLENT** coverage. Edge case'ler test edilmis.
- **MINOR:** Test satir 14 "contains exactly 15 models" comment ama expect(13) — stale yorum, P3.

## 9. TODO/FIXME/HACK Inventory
Yok.

## 10. Dead Code
- `maxOutputTokens?` (ModelDefinition, satir 38): Hicbir built-in model bu field'i set etmiyor. Optional oldugu icin hata degil ama unused. **P3.**

## 11. Security
Guvenlik riski yok — statik model metadata.

## 12. Memory V2 Uyumu
N/A — model registry, memory sistemiyle iliskisi yok.

## 13. i18n
- DeckentError mesajlari Ingilizce — uygun.
- Model ID'leri (opus, sonnet, haiku, gpt-5, etc.) dogal olarak locale-agnostic.

## 14. Dokumantasyon Tutarliligi
- DECKENT.md "13 models, 3 providers, 4 tiers" → ✅ `BUILTIN_MODELS.length = 13`
- IDENTITY.md "ModelRegistry (13 models, 3 providers, tier-based routing)" → ✅
- Model API ID'leri guncel:
  - opus → `claude-opus-4-6` ✅
  - sonnet → `claude-sonnet-4-6` ✅
  - haiku → `claude-haiku-4-5-20251001` ✅
- Opus context window: 1,000,000 — provider-capabilities.ts ile TUTARSIZ (200K). **P1 — provider-capabilities.ts raporunda da belirtildi.**

## 15. Performance
Sync I/O: **0** — tamamen in-memory Map operasyonlari. Performans sorunu yok.

## 16. Oneriler
1. **P1 — provider-capabilities tutarsizligi**: Claude maxContextTokens (200K) vs opus contextWindow (1M). Provider-capabilities modulu ModelRegistry'den derived olmali, hardcoded degil.
2. **P3 — maxOutputTokens kullanilmiyor**: Optional field, ama hicbir model set etmiyor. Ya remove ya da populate edilmeli (ozellikle output token limiti olan modeller icin — o3, gpt-5 gibi).
3. **P3 — JSDoc eksikligi**: Class methodlarinin cogu JSDoc yok (get, getByProvider, getByTier, etc.).
4. **P3 — TIER_ORDER duplication**: model-registry.ts ve mode-presets.ts'de ayni TIER_ORDER tanimlanmis. Tek kaynak olmali.

## Verdict: ANALYZED
