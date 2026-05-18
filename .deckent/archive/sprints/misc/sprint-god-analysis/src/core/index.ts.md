# Analysis: src/core/index.ts
**Task ID:** 142-005 | **Model:** opus | **LoC:** 37 | **Effort:** max

## 1. Amaci
`src/core/` modülünün barrel export dosyası. Dış modüllerin (CLI, MCP, orchestra) core'daki temel tipleri, fonksiyonları ve sınıfları tek bir import noktasından kullanmasını sağlar. Re-export pattern ile seçili public API'yi dışa açar.

## 2. Public API
Re-export edilen modüller ve semboller:

| Kaynak | Export |
|--------|--------|
| `./types.js` | `*` (tüm tipler) |
| `./constants.js` | `*` (tüm sabitler) |
| `./utils.js` | `getNextSprintId`, **`parseDebtTable`**, **`generateDebtTable`** |
| `./config.js` | `loadConfig`, `getDefaultConfig`, `getDefaultModes`, `validatePartialConfig`, `validateConfig`, `resolveEffectiveWorkers`, `ConfigValidationError` |
| `./analyzer.js` | `analyzeProject` |
| `./system-profile.js` | `getSystemProfile`, `calcRecommendedMaxWorkers` |
| `./subscription.js` | `detectSubscription`, `saveSubscriptionToConfig`, `checkModeCompatibility` |
| `./routing-types.js` | 15+ type ve utility (TaskDNA, ActivationRule, etc.) |
| `./intent-classifier.js` | `classifyIntent` |
| `./activation-engine.js` | `evaluateActivation`, `evaluateRule`, `evaluateExclusion` |
| `./routing-engine.js` | `routeTaskV2`, `calculateSkillBudget`, `resolveOverrides`, `calculateConfidence` |
| `./condition-evaluator.js` | `evaluateCondition`, `resolvePath` |
| `./manifest-migrator.js` | `needsMigration`, `isV2Manifest`, `migrateAgentManifest`, `migrateSkillManifest` |

## 3. Ic Bagimliliklar
14 modülden re-export — barrel dosyası olarak doğal. Döngüsel bağımlılık riski: barrel'ın kendisi import edilmemeli (core modülleri birbirini doğrudan import etmeli, barrel üzerinden değil).

## 4. Dis Bagimliliklar
Yok — sadece re-export.

## 5. Complexity
- **Fonksiyon sayısı:** 0 (sadece re-export)
- **Max cyclomatic:** 0
- Genel karmaşıklık: **SIFIR**

## 6. Type Safety
N/A — re-export dosyası, tip tanımı veya logic yok.

## 7. ADR Compliance
| ADR | Uyum | Detay |
|-----|------|-------|
| ADR-008 | ✓ | Barrel export pattern — modüller doğrudan import eder |
| Memory V2 | ⚠️ | `parseDebtTable` ve `generateDebtTable` @deprecated ama hala re-export ediliyor. Memory V2 DB-first modülleri (memory-store, memory-query, memory-export, memory-import) barrel'dan re-export EDİLMİYOR |

## 8. Test Coverage
- `tests/core/index.test.ts`: **MEVCUT DEĞİL** ❌
- Barrel export test dosyası yok — ancak bu yaygın bir pattern, barrel'ın kendisi test edilmez, export edilen modüller test edilir.

## 9. TODO/FIXME/HACK Inventory
Yok ✓

## 10. Dead Code — BARREL EXPORT ANALİZİ

### Re-export edilen ama @deprecated olan semboller:
| Sembol | Kaynak | Durum |
|--------|--------|-------|
| `parseDebtTable` | utils.ts | **@deprecated** — 3 consumer (archive-debt.ts, sprint-phases.ts, sprint-finalizer.ts) |
| `generateDebtTable` | utils.ts | **@deprecated** — 1 consumer (archive-debt.ts) |

### Barrel'dan EKSİK olan modüller (core'da var ama re-export yok):
| Modül | Neden eksik olabilir |
|-------|---------------------|
| `memory-store.ts` | Consumer'lar doğrudan import ediyor olabilir |
| `memory-query.ts` | Consumer'lar doğrudan import ediyor olabilir |
| `memory-export.ts` | Consumer'lar doğrudan import ediyor olabilir |
| `memory-import.ts` | Consumer'lar doğrudan import ediyor olabilir |
| `memory-normalize.ts` | Internal kullanım |
| `memory-types.ts` | Consumer'lar doğrudan import ediyor olabilir |
| `errors.ts` | Consumer'lar doğrudan import ediyor |
| `file-lock.ts` | Consumer'lar doğrudan import ediyor |
| `credential-encryption.ts` | Internal (credentials.ts tarafından) |
| `credentials.ts` | Consumer'lar doğrudan import ediyor |
| `deck-file.ts` | Consumer'lar doğrudan import ediyor |
| `environment.ts` | Consumer'lar doğrudan import ediyor |
| `global-config.ts` | Consumer'lar doğrudan import ediyor |
| `lazy-loader.ts` | Consumer'lar doğrudan import ediyor |
| `observability.ts` | Consumer'lar doğrudan import ediyor |
| `model-registry.ts` | Consumer'lar doğrudan import ediyor |
| `mode-presets.ts` | Consumer'lar doğrudan import ediyor |
| `provider.ts` | Consumer'lar doğrudan import ediyor |
| `agent-pool.ts` | Consumer'lar doğrudan import ediyor |
| `skill-pool.ts` | Consumer'lar doğrudan import ediyor |
| `token-counter.ts` | Consumer'lar doğrudan import ediyor |

**Sonuç:** Barrel export SEÇİCİ — sadece routing v2 + config + utils + types/constants. Memory V2, errors, file-lock, credentials gibi modüller doğrudan import ediliyor. Bu pattern TUTARLI ama barrel'ın kapsamı dar.

## 11. Security
N/A — re-export dosyası.

## 12. Memory V2 Uyumu
**UYUMSUZ — ama kasıtlı:**
- Memory V2 modülleri (memory-store, memory-query, memory-export, memory-import, memory-types) barrel'dan re-export EDİLMİYOR
- Consumer'lar doğrudan `import { MemoryStore } from '../core/memory-store.js'` yapıyor
- Bu, barrel'ı şişirmeden modüler import sağlıyor — kabul edilebilir ama belgelenmeli

**V1 kalıntısı:** parseDebtTable/generateDebtTable hala re-export ediliyor — Memory V2 sonrası kaldırılmalı.

## 13. i18n
N/A

## 14. Dokumantasyon Tutarliligi
- Barrel dosyasında yorum/JSDoc yok — re-export için normal
- **Tutarsızlık:** CLAUDE.md "core/" bölümünde listelenen modüller ile barrel export arasında fark var — barrel sadece bir alt küme

## 15. Performance
- Sync I/O: 0 — sadece JavaScript module system re-export
- Tree-shaking: ESM re-export, tree-shakeable ✓

## 16. Oneriler
| Severity | Öneri |
|----------|-------|
| **P1** | `parseDebtTable` ve `generateDebtTable` re-export'larını kaldır — consumer'ları doğrudan utils.js import'una migrasyon yap, sonra utils.ts'den de kaldır |
| **P2** | Memory V2 modüllerinin barrel'dan kasıtlı olarak çıkarıldığını belgele (yorum satırı) |
| **P3** | Barrel export kapsamını gözden geçir — errors.ts, file-lock.ts gibi sık kullanılan modülleri eklemek import ergonomisini iyileştirir |

## Verdict: ANALYZED
