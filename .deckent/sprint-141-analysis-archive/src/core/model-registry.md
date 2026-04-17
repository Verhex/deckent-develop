# Analysis: src/core/model-registry.ts
**Task ID:** 140-001 | **LoC:** 315

## 1. Amaci
Tüm AI modelleri için tek gerçeklik kaynağı (ADR-023). 13 model, 3 provider, 4 tier. `ModelRegistry` class ile tier-based routing, cost estimation, provider equivalence. Sprint 140 için güncel: claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5-20251001.

## 2. Public API (export listesi)
- Types: `RegistryProviderName`, `ModelTier`, `ModelStatus`, `ModelCapabilities`, `ModelCost`, `ModelDefinition`, `BuiltinModelId`, `ModelType`
- `BUILTIN_MODELS: readonly ModelDefinition[]`
- `ModelRegistry` class: get, getOrThrow, has, getByProvider, getByTier, getByProviderAndTier, getEquivalent, getTier, getNumericTier, compareTiers, isAtLeastTier, register, unregister, estimateCost, resolveApiId, getAllModelIds, getAllModels, getAllProviders
- `modelRegistry` singleton

## 3. İç + Dış Bağımlılıklar
- **İç**: `errors.ts` (DeckentError)

## 4. Complexity
- `getEquivalent()`: orta — tier fallback chain
- Diğerleri: düşük

## 5. Type Safety
- Mükemmel — `as const` BUILTIN_MODELS, typed throughout

## 6. ADR Compliance
- **ADR-023** (Plan Tier Generalizasyonu): tam uyumlu ✅
- 4 tier: economy/standard/premium/premium_plus ✅

## 7. Test Coverage
- `tests/core/model-registry.test.ts` mevcut

## 8. TODO/FIXME/HACK inventory
- Yok

## 9. Dead Code Candidates
- `unregister()` — framework flexibility için var, muhtemelen testlerde kullanılıyor

## 10. Security Findings
- `register()` ile runtime model ekleme — plugin güvenliği açısından dikkat edilmeli

## 11. Memory V2 Uyumu
- N/A — model registry, memory ile doğrudan ilişkili değil

## 12. Öneriler
- Model fiyatları hardcoded — gelecekte bir pricing-updater ile senkronize edilmeli (pricing-updater.ts mevcut)

## 13. Verdict: ANALYZED
