# Analysis: src/core/index.ts
**Task ID:** 140-001 | **LoC:** 37

## 1. Amaci
`src/core/` için public API barrel. Tüketici modüller bu dosyayı import eder. Memory V2 modülleri hariç (ayrı ayrı import edilecek şekilde tasarlanmış).

## 2. Public API (export listesi)
- `types.ts` → `*` (tüm tipler)
- `constants.ts` → `*`
- `utils.ts` → `getNextSprintId`, `parseDebtTable`, `generateDebtTable` (seçici)
- `config.ts` → loadConfig, getDefaultConfig, getDefaultModes, validatePartialConfig, validateConfig, resolveEffectiveWorkers, ConfigValidationError
- `analyzer.ts` → analyzeProject
- `system-profile.ts` → getSystemProfile, calcRecommendedMaxWorkers
- `subscription.ts` → detectSubscription, saveSubscriptionToConfig, checkModeCompatibility
- Routing Engine v2 tipleri + fonksiyonlar

## 3. İç + Dış Bağımlılıklar
- Tüm core modüllerini re-export eder

## 4. Complexity
- 0 (pure barrel)

## 5. Type Safety
- `parseDebtTable` ve `generateDebtTable` hala export ediliyor — @deprecated ama kaldırılmamış

## 6. ADR Compliance
- **ADR-008** (Brain Merkezi Import): UYUMLU ✅

## 7. Test Coverage
- Barrel — doğrudan test gerekmez

## 8. TODO/FIXME/HACK inventory
- Yok

## 9. Dead Code Candidates
- `parseDebtTable`, `generateDebtTable` — `@deprecated`, Sprint 142'de kaldırılmalı

## 10. Security Findings
- Yok

## 11. Memory V2 Uyumu
- Memory V2 modülleri (`memory-store`, `memory-query` vb.) index.ts'den export edilmiyor
- Bu kasıtlı tasarım — brain/auditor gerektiğinde doğrudan import eder

## 12. Öneriler
- `parseDebtTable/generateDebtTable` export'ları kaldırılabilir (Sprint 142)
- Memory V2 key fonksiyonlarının index.ts'den export edilip edilmeyeceği tartışılmalı

## 13. Verdict: ANALYZED
