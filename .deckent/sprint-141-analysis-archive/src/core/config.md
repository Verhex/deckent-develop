# Analysis: src/core/config.ts
**Task ID:** 140-001 | **LoC:** 1167

## 1. Amaci
3-layer config merge (defaults → global → project) sistemi. `loadConfig()`, `validateConfig()`, `deepMerge()`, `resolveEffectiveWorkers()`, `CONFIG_METADATA` ve çeşitli yardımcı fonksiyonları barındırır. Sprint 140 pre-flight ayarları (memory_budget=5000, decay_after_sprints=20) default config'e işlenmiş.

## 2. Public API (export listesi)
- `DEFAULT_AUTO_DOCS`, `MODE_ALIASES`, `VALID_PROVIDERS`
- `DEFAULT_MODES`, `ConfigValidationError`
- `deepMerge<T>()`, `validateConfig()`, `resolveEffectiveWorkers()`
- `clearConfigCache()`, `createDefaultConfig()`, `getDefaultConfig()`, `getDefaultModes()`
- `loadConfig()` (async), `readAuthMode()` (async)
- `validatePartialConfig()`, `loadGlobalConfig()`, `saveGlobalConfig()`
- `CONFIG_METADATA`, `getConfigHelp()`, `listConfigByCategory()`, `generateConfigReference()`
- `mergeConfigs()`

## 3. İç + Dış Bağımlılıklar
- **Dış**: `node:fs/promises`, `node:fs`, `node:path`
- **İç**: `constants.ts`, `utils.ts`, `config-migration.ts`, `types.ts` (ALL_MODELS, PROVIDER_MODEL_MAP), `mode-presets.ts`, `observability.ts`

## 4. Complexity
- Fonksiyon sayısı: ~18 export + 5 private
- `validateConfig()` çok yüksek complexity (~120 satır, 30+ branch)
- `loadConfig()` orta complexity (~130 satır)
- Module-level cache (`cachedConfig`, `cacheStamp`, `cachedProjectRoot`)

## 5. Type Safety
- `any` kullanımı: 0 (Record<string,unknown> kullanılmış)
- `@ts-ignore`: 0
- `as const`: çok yerde doğru kullanılmış
- `structuredClone` ile deep clone yapılıyor — güvenli

## 6. ADR Compliance
- **ADR-004** (3-Layer Config Merge): UYUMLU — defaults→global→project merge tam
- **ADR-001** (TypeScript + ESM): UYUMLU
- **Memory V2**: `config.memory` bloğu var, V2 backend config `DeckentConfig.memory` içinde. Flat `memory_budget`/`decay_after_sprints` hala korunuyor (V1 backward compat `@deprecated` işaretli)

## 7. Test Coverage
- `tests/core/config.test.ts` mevcut (kapsamlı — edge case, validation, merge)

## 8. TODO/FIXME/HACK inventory
- Yok

## 9. Dead Code Candidates
- `resolveMode()` fonksiyonu — `MODE_ALIASES` dict lookup, kullanımda
- `DEFAULT_MODES` — config default değerleri, kullanımda
- `generateConfigReference()` — dokuman üretimi, test edilmeli

## 10. Security Findings
- `saveGlobalConfig()` — path doğrulama yok ama `GLOBAL_CONFIG_PATH` sabit ve kontrollü
- Env var override'ları (`DECKENT_BRAIN_PROVIDER` vb.) doğrudan `as ProviderName` cast ile alınıyor — VALID_PROVIDERS kontrolü yapılmıyor. Potansiyel sorun.

## 11. Memory V2 Uyumu
- `DeckentConfig.memory` bloğu mevcut: `backend`, `search`, `decay_after_sprints`, `export_md` vb.
- Flat `memory_budget`/`decay_after_sprints` `@deprecated` işaretlenmiş — UYUMLU
- `createDefaultConfig()` içinde: `memory_budget: 5000`, `decay_after_sprints: 20` Sprint 140 pre-flight değerleri.

## 12. Öneriler
- `validateConfig()`'da env var override'ları için VALID_PROVIDERS kontrolü eklenmeli (Sprint 142 P1)
- `generateConfigReference()` için ayrı bir test yazılmalı

## 13. Verdict: ANALYZED
